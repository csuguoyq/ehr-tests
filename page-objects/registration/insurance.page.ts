// page-objects/registration/insurance.page.ts — the Registration "New
// Insurance" form (PatientInsuranceForm, DynamicForm + InputWrapper).
// Verified on fbch34 2026-09-16:
// - after picking a plan, many required fields stay empty (Insurance Type,
//   Member ID, Effective Date, Relationship to Subscriber and the whole
//   Subscriber section) and Save stays disabled until they are filled.
// - each field label renders in `.label-container`; the input(s) follow in
//   DOM order. Hidden duplicate sections exist (e.g. the selfPay copy of the
//   form renders the same labels with hidden inputs), so always take the
//   FIRST VISIBLE input after the label, not the nearest one.
// - "Insurance Type" is a ButtonMultiselect (checkbox options + Close).

import { expect, type Page, type Locator } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class InsurancePage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
  }

  // ---- Add Insurance lookup dialog (testids verified fbch34 2026-09-16) ----

  /** Open the Add Insurance lookup dialog from the Insurance sub-tab. */
  async openLookupDialog(): Promise<void> {
    await this.page.getByTestId("insurance-add-insurance-button").click();
  }

  /**
   * Search the payer/plan lookup (debounced, min 3 chars) and pick the FIRST
   * matching plan in the results radio list (search by Plan ID yields the
   * exact plan — first radio is that plan).
   */
  async lookupAndPickFirstPlan(planQuery: string): Promise<void> {
    const search = this.page
      .locator('[data-testid="add-insurance-lookup-search-field"] input')
      .or(this.page.locator("#add-insurance-lookup-search-field"))
      .first();
    await search.waitFor({ state: "visible", timeout: 15_000 });
    await search.fill(planQuery);
    const radioGroup = this.page.getByTestId("add-insurance-radio-group");
    await radioGroup.waitFor({ state: "visible", timeout: 20_000 });
    await radioGroup.locator('input[type="radio"]').first().click();
    await this.page.getByTestId("add-insurance-dialog-submit-button").click();
  }

  /**
   * Save the insurance form via the toolbar "Save" (exact — toolbar order is
   * [Save, Save and Close]; "Save" is the proven path, "Save and Close" stays
   * disabled in some states, fbch34 2026-09-16), then resolve an "Unsaved
   * Changes" confirm if the save left the form dirty.
   */
  async saveForm(): Promise<void> {
    const save = this.page.getByRole("button", { name: "Save", exact: true }).first();
    await expect(save).toBeEnabled({ timeout: 30_000 });
    await save.click();
    await this.resolveUnsavedChanges().catch(() => undefined);
  }

  /**
   * Resolve an "Unsaved Changes" confirm with "Save Changes" when one is up
   * (the dirty flag can linger after saving, and the NEXT navigation — e.g.
   * the encounter form — would otherwise hit the modal). Returns whether a
   * dialog was found and resolved.
   */
  async resolveUnsavedChanges(timeoutMs = 10_000): Promise<boolean> {
    const dialog = this.page
      .locator("[role=dialog], .x-window, .MuiDialog-root")
      .filter({ hasText: /Unsaved Changes/i })
      .first();
    if (!(await dialog.isVisible().catch(() => false))) return false;
    const keep = dialog.getByRole("button", { name: /Save Changes/i }).first();
    await expect(keep).toBeVisible({ timeout: timeoutMs });
    await keep.click();
    return true;
  }

  private labelBoxes(label: string): Locator {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page
      .locator(".label-container")
      .filter({ hasText: new RegExp(`^\\s*${escaped}\\s*\\*?\\s*$`) });
  }

  /**
   * The first VISIBLE enabled input after any matching label. Duplicate
   * hidden sections (the selfPay copy) render the same labels with hidden
   * inputs before the visible form — scan every matching label's following
   * inputs until one is visible (fbch34 2026-09-16).
   */
  private async visibleInput(label: string): Promise<Locator> {
    const labels = await this.labelBoxes(label).all();
    for (const labelBox of labels) {
      const inputs = labelBox.locator("xpath=following::input | following::textarea");
      const count = Math.min(await inputs.count(), 25);
      for (let i = 0; i < count; i++) {
        const candidate = inputs.nth(i);
        if (
          (await candidate.isVisible().catch(() => false)) &&
          (await candidate.isEnabled().catch(() => false))
        ) {
          return candidate;
        }
      }
    }
    throw new Error(`field "${label}": no visible enabled input found`);
  }

  /**
   * Fill a text field. Fields the app pre-fills from the patient record and
   * locks (Subscriber Address/City/… carry the demographics and render
   * disabled with a value — fbch34 2026-09-16) count as done; an empty
   * disabled field is skipped in favour of the next visible one.
   */
  async fillText(label: string, value: string): Promise<void> {
    const labels = await this.labelBoxes(label).all();
    for (const labelBox of labels) {
      const inputs = labelBox.locator("xpath=following::input | following::textarea");
      const count = Math.min(await inputs.count(), 25);
      for (let i = 0; i < count; i++) {
        const candidate = inputs.nth(i);
        if (!(await candidate.isVisible().catch(() => false))) continue;
        if (!(await candidate.isEnabled().catch(() => false))) {
          if ((await candidate.inputValue().catch(() => "")) !== "") return; // locked, prefilled
          continue; // locked but empty (usually optional) — try next
        }
        if ((await candidate.inputValue()) !== "") return;
        // NOTE: no post-fill value assert — the controlled input re-renders
        // on change and this locator re-resolves against fresh DOM.
        await candidate.fill(value, { timeout: 10_000 });
        return;
      }
    }
    throw new Error(`field "${label}": no fillable input found`);
  }

  /**
   * What a combobox/multiselect wrapper currently SHOWS: the wrapper's text
   * (MUI chips / selected value) plus the raw input value.
   */
  private async shownSelection(candidate: Locator): Promise<string> {
    const wrapper = candidate.locator(
      "xpath=ancestor::div[contains(@class,'MuiInputBase') or contains(@class,'MuiFormControl')][1]"
    );
    return (
      (await wrapper.innerText().catch(() => "")) +
      (await candidate.inputValue().catch(() => ""))
    );
  }

  /**
   * Pick an option from a "Make Selection"-style combobox field. Verifies
   * the selection actually landed (multi-select chips can drop on Escape —
   * flaky on fbch34) and retries up to 3 times.
   */
  async pickOption(label: string, optionText: RegExp, expectText?: string): Promise<void> {
    // First alternative only: /Female|Male/i → "Female". (Joining the whole
    // source yields "FemaleMale", which matches nothing.)
    const verify = expectText ?? optionText.source.split("|")[0].replace(/[\^$]/g, "");
    const labels = await this.labelBoxes(label).all();
    for (const labelBox of labels) {
      const inputs = labelBox.locator("xpath=following::input | following::textarea");
      const count = Math.min(await inputs.count(), 25);
      for (let i = 0; i < count; i++) {
        const candidate = inputs.nth(i);
        if (!(await candidate.isVisible().catch(() => false))) continue;
        if (!(await candidate.isEnabled().catch(() => false))) {
          if ((await candidate.inputValue().catch(() => "")) !== "") return; // locked, prefilled
          continue;
        }
        if ((await candidate.inputValue()) !== "") return;
        // Already-selected guard (Insurance Type ships pre-checked on fbch34):
        // if the wrapper already shows the target option, leave it alone —
        // clicking the option again would TOGGLE it off (user note 2026-09-16).
        if ((await this.shownSelection(candidate)).toLowerCase().includes(verify.toLowerCase())) return;
        for (let attempt = 1; attempt <= 3; attempt++) {
          await candidate.click();
          const option = this.page.locator("li[role=option]", { hasText: optionText }).first();
          await expect(option, `option for "${label}" not listed`).toBeVisible({ timeout: 10_000 });
          await option.click();
          // Multi-select variants (Insurance Type) keep the list open; Escape
          // closes the popper. Never click a page-wide "Close" — this form
          // has other Close buttons and one dismisses the whole form.
          await candidate.press("Escape");
          await this.page
            .locator("li[role=option]")
            .first()
            .waitFor({ state: "hidden", timeout: 5_000 })
            .catch(() => {});
          if ((await this.shownSelection(candidate)).toLowerCase().includes(verify.toLowerCase())) return;
        }
        throw new Error(`field "${label}": selection "${verify}" did not stick after 3 attempts`);
      }
    }
    throw new Error(`field "${label}": no pickable input found`);
  }

  /**
   * Set a date field to TODAY exactly as the manual recording does
   * (SZ35253.manual.ts): open the picker, double-click the today cell
   * ("Choose date, selected date is …"), which commits the box-local today —
   * typing into the masked input proved unreliable (value never persisted).
   */
  async fillToday(label: string): Promise<void> {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const labelBox = this.page
      .locator(".label-container")
      .filter({ hasText: new RegExp(`^\\s*${escaped}\\s*\\*?\\s*$`) })
      .first();
    const wrapper = labelBox.locator("xpath=following::div[.//input][1]");
    const input = wrapper.locator("input").first();
    if ((await input.inputValue().catch(() => "")) !== "") return;
    const cal = wrapper.getByRole("button", { name: /Choose date/ }).first();
    await expect(cal).toBeVisible({ timeout: 10_000 });
    await cal.click();
    const today = this.page.getByRole("button", { name: /Choose date, selected date is/ }).first();
    await expect(today).toBeVisible({ timeout: 10_000 });
    await today.dblclick();
    await this.page.keyboard.press("Escape");
    await expect(input, `date "${label}" was not set`).not.toHaveValue("", { timeout: 10_000 });
  }

  /** Replace a masked phone input's content digit by digit. */
  async fillPhone(label: string, digits: string): Promise<void> {
    const input = await this.visibleInput(label);
    await input.click();
    await input.press("ControlOrMeta+a");
    await input.press("Delete");
    await input.pressSequentially(digits, { delay: 40 });
  }
}
