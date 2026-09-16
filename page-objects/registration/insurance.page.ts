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
  readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly saveButton: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.saveButton = page.getByRole("button", { name: /Save and Close|Save/ }).first();
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

  /** Pick an option from a "Make Selection"-style combobox field. */
  async pickOption(label: string, optionText: RegExp): Promise<void> {
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
        await candidate.click();
        const option = this.page.locator("li[role=option]", { hasText: optionText }).first();
        await expect(option).toBeVisible({ timeout: 10_000 });
        await option.click();
        // Multi-select variants (Insurance Type) keep the list open; Escape
        // closes the popper. Never click a page-wide "Close" — this form has
        // other Close buttons and one of them dismisses the whole form
        // (fbch34 2026-09-16: the form got submitted by that stray click).
        await candidate.press("Escape");
        await this.page
          .locator("li[role=option]")
          .first()
          .waitFor({ state: "hidden", timeout: 5_000 })
          .catch(() => {});
        return;
      }
    }
    throw new Error(`field "${label}": no pickable input found`);
  }

  /** Type a masked date (MM/DD/YYYY) into a CciDatePicker field. */
  async fillDate(label: string, mmddyyyy: string): Promise<void> {
    const input = await this.visibleInput(label);
    await input.click();
    await input.pressSequentially(mmddyyyy, { delay: 40 });
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
