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
import { pickMuiDate, openMuiPicker } from "../../src/utils/mui-date";

export class InsurancePage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
  }

  // ---- Add Insurance lookup dialog (testids verified fbch34 2026-09-16) ----

  /**
   * Ensure the Insurance sub-tab is showing the "Insurance Overview" nested
   * tab — Add Insurance and Reorder Priorities only exist there. After
   * saving an insurance the view stays on that insurance's nested form tab
   * (Tabs 1..n of InsuranceSubTab), and the nested selection SURVIVES a
   * sub-tab round-trip, so re-opening the Insurance sub-tab lands back on
   * the form (fbch34 2026-09-17, TC33731).
   */
  async ensureOverviewView(): Promise<void> {
    const overviewOnly = this.page.getByTestId("insurance-add-insurance-button");
    const overviewTab = this.page
      .getByRole("tab", { name: "Insurance Overview", exact: true })
      .first();
    for (let attempt = 0; attempt < 2; attempt++) {
      if (await overviewOnly.isVisible().catch(() => false)) return;
      await overviewTab.click();
      // A lingering dirty flag can raise the Unsaved Changes confirm on the
      // nested tab switch — resolve it so the switch can complete.
      await this.resolveUnsavedChanges().catch(() => undefined);
      // Bounded poll for the switch to land (no completion signal from the
      // nested tab render); ≤3s per attempt, retried once below.
      for (let waited = 0; waited < 3000; waited += 250) {
        if (await overviewOnly.isVisible().catch(() => false)) return;
        await this.page.waitForTimeout(250);
      }
    }
    await overviewOnly.waitFor({ state: "visible", timeout: 20_000 });
  }

  /** Open the Add Insurance lookup dialog from the Insurance sub-tab. */
  async openLookupDialog(): Promise<void> {
    await this.ensureOverviewView();
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

  // ---- Reorder Priorities (inline drag mode → Apply → effective-date
  //      dialog). Source (InsuranceOverviewForm.tsx): the Insurances card
  //      header shows "Reorder Priorities"; in reorder mode it swaps to
  //      Cancel + Apply (Apply disabled until a drag registers) and the
  //      table gains per-row drag handles (MUI DataGrid rowReordering,
  //      present only with ≥2 rows). Apply opens ReorderPrioritiesDialog:
  //      "Please enter the effective date for the reordered priorities:"
  //      with one CciDatePicker per changed type (default today) + Cancel /
  //      "Confirm Reorder". Verified on fbch34 2026-09-17 (TC33731). ----

  /** Enter the inline reorder mode (header becomes Cancel + Apply). */
  async enterReorderMode(): Promise<void> {
    await this.ensureOverviewView();
    await this.page
      .getByRole("button", { name: "Reorder Priorities", exact: true })
      .first()
      .click();
    await expect(
      this.page.getByRole("button", { name: "Apply", exact: true }).first()
    ).toBeVisible({ timeout: 15_000 });
  }

  /** The per-row drag handle (MUI DataGrid rowReordering DragIcon). */
  dragHandle(rowIndex: number): Locator {
    return this.page
      .locator(".MuiDataGrid-row")
      .nth(rowIndex)
      .locator('[data-testid="DragIcon"], button[aria-label="Drag"], .MuiSvgIcon-DragIcon')
      .first();
  }

  /**
   * Drag the row at `fromRow` onto the row at `toRow` with a real mouse
   * drag — the DataGrid reorder is a native drag, so mouse.down → stepped
   * moves → mouse.up is the proven path (skills ehr-workflow/insurance
   * E2E walkthrough, 2026-09-10).
   */
  async dragRowTo(fromRow: number, toRow: number): Promise<void> {
    const handle = this.dragHandle(fromRow);
    await expect(handle, `no drag handle on row ${fromRow}`).toBeVisible({ timeout: 15_000 });
    const fromBox = await handle.boundingBox();
    const toBox = await this.page.locator(".MuiDataGrid-row").nth(toRow).boundingBox();
    if (!fromBox || !toBox) throw new Error("dragRowTo: missing bounding box");
    const sx = fromBox.x + fromBox.width / 2;
    const sy = fromBox.y + fromBox.height / 2;
    const tx = toBox.x + toBox.width / 2;
    const ty = toBox.y + toBox.height / 2;
    await this.page.mouse.move(sx, sy);
    await this.page.mouse.down();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await this.page.mouse.move(
        sx + ((tx - sx) * i) / steps,
        sy + ((ty - sy) * i) / steps,
        { steps: 2 }
      );
      await this.page.waitForTimeout(50);
    }
    await this.page.mouse.up();
    // Give the grid a beat to register the new order (Apply enables on change).
    await this.page.waitForTimeout(1500);
  }

  reorderDialog(): Locator {
    return this.page
      .locator(".MuiDialog-root")
      .filter({ hasText: "Please enter the effective date" })
      .last();
  }

  /** Apply the drag → the effective-date dialog must open. */
  async applyReorder(): Promise<void> {
    const apply = this.page.getByRole("button", { name: "Apply", exact: true }).first();
    await expect(apply, "Apply stayed disabled — the drag was not registered").toBeEnabled({
      timeout: 15_000,
    });
    await apply.click();
    await expect(this.reorderDialog()).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Pick the effective date in the reorder dialog (`date` = MM/DD/YYYY).
   * Dialog/input stay PO-owned; the year → month → day ladder is the shared
   * `pickMuiDate` (src/utils/mui-date.ts).
   */
  async setReorderEffectiveDate(date: string): Promise<void> {
    const dlg = this.reorderDialog();
    const input = dlg.locator("input").first();
    const popper = await openMuiPicker(
      this.page,
      dlg.locator('button[aria-label*="Choose date"]').first()
    );
    await pickMuiDate(this.page, popper, date, input);
  }

  /** Confirm the reorder (dialog OK = "Confirm Reorder"). */
  async confirmReorder(): Promise<void> {
    const dlg = this.reorderDialog();
    await dlg.getByRole("button", { name: "Confirm Reorder", exact: true }).click();
    await expect(dlg).toBeHidden({ timeout: 15_000 });
  }

  /** Success toast after a posted reorder ("Succesfully" typo is in source). */
  async expectReorderToast(timeoutMs = 15_000): Promise<void> {
    await expect(
      this.page.getByText(/Succesfully reordered insurance priorities/i).first()
    ).toBeVisible({ timeout: timeoutMs });
  }

  /** Leave reorder mode without applying (header Cancel). */
  async cancelReorder(): Promise<void> {
    await this.page.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await expect(
      this.page.getByRole("button", { name: "Reorder Priorities", exact: true }).first()
    ).toBeVisible({ timeout: 15_000 });
  }
}
