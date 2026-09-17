// page-objects/charge/coding.page.ts — the BNR detail "Coding" tab: begin a
// coding session, enter admit/principal diagnoses, set the discharge
// disposition on the ADT sub-tab, and complete coding.
//
// Verified on fbch34 (2026-09-12):
// - Opening the Coding tab the first time pops a "Begin Coding" dialog
//   ("Are you ready to begin coding this record?"); after Begin, the status
//   line reads "Coding Status: In Progress".
// - Sub-tabs: DRG | Diagnosis | Procedure | ADT | Coding History | Coding Notes.
// - The Diagnosis sub-tab renders TWO diagnosis slots at once (Admit type and
//   Principal type — types are auto-assigned, the field is disabled). Each slot
//   is a MUI Autocomplete input `#diagnosis-ICD10_CM_Code`; typing a code
//   surfaces `li[role=option]` rows and the option MUST be clicked (free text
//   alone leaves Save disabled). One "Save Diagnosis" button saves both.
// - The ADT sub-tab shows Point of Origin / Discharge Disposition / providers.
//   The pencil icon (an `svg[data-testid="EditIcon"]` inside the coding view)
//   opens the edit form; Discharge Disposition is the SECOND
//   `input[placeholder="Make Selection"]` in that view. Save commits it
//   (displayed as "<value>(Modified)").
// - "Complete" (`coding-complete-button`) flips the status to "Complete".

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class CodingPage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly view: Locator;
  readonly codingTab: Locator;
  readonly drgTab: Locator;
  readonly diagnosisTab: Locator;
  readonly adtTab: Locator;
  readonly completeButton: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.view = page.getByTestId("charge-services-coding-view");
    this.codingTab = page.getByRole("tab", { name: "Coding", exact: true });
    this.drgTab = page.getByRole("tab", { name: "DRG", exact: true });
    this.diagnosisTab = page.getByRole("tab", { name: "Diagnosis", exact: true });
    this.adtTab = page.getByRole("tab", { name: "ADT", exact: true });
    this.completeButton = page.getByTestId("coding-complete-button");
  }

  /** Open Coding and start (or restart) the session if the dialog pops. */
  async open(): Promise<void> {
    await this.codingTab.click();
    await expect(this.view).toBeVisible({ timeout: 20_000 });
    // First open pops "Begin Coding"; a Completed record pops "Begin Recoding".
    const begin = this.page
      .getByRole("button", { name: /Begin (Coding|Recoding)/ })
      .first();
    if (await begin.isVisible().catch(() => false)) {
      await begin.click();
    }
    await expect(this.view).toContainText(/Coding Status: (In Progress|Complete)/, {
      timeout: 20_000,
    });
  }

  /**
   * Fill the admit + principal diagnosis slots (codes, e.g. I69.941) with
   * Code Date = today (target box's timezone).
   * Verified on fbch34 (2026-09-15):
   * - "Add Diagnosis" opens a FULL-PAGE form (not a role=dialog, not inline
   *   slots): two sections (Admit / Principal), each with #diagnosis-ICD10_CM_Code,
   *   #diagnosis-Code_Date (mask __/__/____), POA/HAC/CC/MCC, disabled Type and
   *   Code Set Source. POA etc. may stay empty; Save Diagnosis is page-level.
   * - Code input: type all but the last character → pick li[role=option]
   *   (same as before; the full code auto-resolves without a list).
   * - Code Date is picked through the DatePicker calendar (server today); the
 *   typed-mask path is retired (user instruction 2026-09-17).
   */
  async fillDiagnoses(admitDiagnosis: string, principalDiagnosis: string): Promise<void> {
    await this.diagnosisTab.click();
    await this.view.getByRole("button", { name: "Add Diagnosis" }).click();
    await expect(this.page.locator("#diagnosis-ICD10_CM_Code").first()).toBeVisible({
      timeout: 20_000,
    });
    const codeDate = this.boxToday();
    const codes = [admitDiagnosis, principalDiagnosis];
    for (let k = 0; k < codes.length; k++) {
      await this.pickDiagnosisCode(k, codes[k]);
      await this.pickCodeDate(k, codeDate);
    }
  }

  /**
   * Set Code Date through the DatePicker's calendar UI (user instruction
   * 2026-09-17: pick, don't type). The popper opens on the CURRENT month, so
   * picking the server's today (box timezone) is a single day-cell click —
   * fbch34 commits and closes on the day click; a legacy OK button is
   * clicked if the build keeps the popper open.
   */
  private async pickCodeDate(index: number, codeDate: string): Promise<void> {
    const dateInput = this.page.locator("#diagnosis-Code_Date").nth(index);
    // The calendar opens via the picker's toggle button next to the input
    // (clicking the masked input itself does not open the popper — fbch34
    // 2026-09-17 run evidence).
    const toggle = dateInput
      .locator("xpath=..")
      .locator('button[aria-label*="Choose date"], button[aria-label*="calendar"]');
    await toggle.first().click();
    const popper = this.page.locator(".MuiPickersLayout-root");
    await expect(popper).toBeVisible({ timeout: 10_000 });
    const dd = String(Number(codeDate.split("/")[1]));
    await popper
      .locator("button")
      .filter({ hasText: new RegExp(`^${dd}$`) })
      .first()
      .click();
    const okButton = popper.getByRole("button", { name: "OK", exact: true });
    if (await okButton.isVisible().catch(() => false)) {
      await okButton.click();
    }
    await expect(popper).toBeHidden({ timeout: 10_000 });
    await expect(dateInput).toHaveValue(codeDate);
  }

  /** Today's date (MM/DD/YYYY) in the target box's timezone (fbch34: US Pacific). */
  private boxToday(): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    }).format(new Date());
    return parts;
  }

  private async pickDiagnosisCode(index: number, code: string): Promise<void> {
    const input = this.page.locator("#diagnosis-ICD10_CM_Code").nth(index);
    // Type ONE character short of the full code: a full exact code is
    // auto-resolved into the input without ever opening the option list, and
    // Save stays disabled until a real option is picked.
    await input.click();
    await input.fill("");
    await input.pressSequentially(code.slice(0, -1), { delay: 60 });
    const option = this.page
      .locator("li[role=option]")
      .filter({ hasText: code })
      .first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
    await expect(input).toHaveValue(new RegExp(`^${code.replace(".", "\\.")}`));
  }

  async saveDiagnoses(): Promise<void> {
    const save = this.page.getByRole("button", { name: "Save Diagnosis" });
    await expect(save).toBeEnabled({ timeout: 15_000 });
    await save.click();
  }

  /** Saved diagnoses appear as rows in the Diagnosis grid. */
  async expectDiagnosesSaved(codes: string[]): Promise<void> {
    for (const code of codes) {
      await expect(
        this.page.getByRole("row", { name: new RegExp(code.replace(".", "\\.")) })
      ).toBeVisible({ timeout: 20_000 });
    }
  }

  /**
   * DRG sub-tab: add a DRG code with Severity of Illness / Risk of Mortality.
   * Verified on fbch34 (2026-09-15):
   * - "Add DRG" opens an INLINE form (no dialog): #DRG-DRG ("Search DRGs")
   *   auto-completes. Typing the FULL code auto-selects the record and shows
   *   NO option list (same behavior as the diagnosis code field) — the fields
   *   DRG_Type/MDC/Weight then fill in disabled.
   * - Severity of Illness and Risk of Mortality are required "Make Selection"
   *   dropdowns (`li[role=option]`).
   * - "Save DRG" (also carries data-testid dialog-submit-button, but that
   *   testid is shared with the view-level Complete button — locate by role
   *   name, page-wide: the button sits outside charge-services-coding-view).
   */
  async setDrg(drgCode: string, severityIllness: string, riskOfMortality: string): Promise<void> {
    await this.drgTab.click();
    await this.view.getByRole("button", { name: "Add DRG" }).click();
    const drgInput = this.page.locator("#DRG-DRG");
    await expect(drgInput).toBeVisible({ timeout: 15_000 });
    await drgInput.click();
    await drgInput.pressSequentially(drgCode, { delay: 120 });
    await expect(drgInput).not.toHaveValue("", { timeout: 15_000 });
    await expect(drgInput).toHaveValue(new RegExp(`^${drgCode}\\b`), { timeout: 15_000 });
    await this.pickSelection(`#DRG-Severity_Illness`, severityIllness);
    await this.pickSelection(`#DRG-Risk_Mortality`, riskOfMortality);
    await this.page.getByRole("button", { name: "Save DRG" }).click();
    await expect(
      this.view
        .locator('[data-testid="charge-read-only-table"]')
        .getByRole("row")
        .filter({ hasText: drgCode })
    ).toBeVisible({ timeout: 20_000 });
  }

  /** Required "Make Selection" dropdown inside the inline coding forms. */
  private async pickSelection(inputSelector: string, optionPrefix: string): Promise<void> {
    const input = this.page.locator(inputSelector);
    if (await input.inputValue()) return; // already filled
    await input.click();
    const option = this.page
      .locator("li[role=option]")
      .filter({ hasText: optionPrefix })
      .first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
  }

  /**
   * ADT sub-tab: fill the ADT Details edit form and Save. This build (fbch34
   * 2026-09-16) shows a read-only ADT Details card with an edit (pencil)
   * toggle; the edit form's Admitting/Attending Provider are REQUIRED. The
   * disposition may already be pre-filled from the encounter discharge —
   * only pick it when the empty combobox (placeholder "Make Selection") is
   * there; a pre-filled autocomplete renders the value, not the placeholder.
   */
  async setDischargeDisposition(disposition: string): Promise<void> {
    await this.adtTab.click();
    const editIcon = this.view.locator('svg[data-testid="EditIcon"]').first();
    if (await editIcon.isVisible().catch(() => false)) {
      await editIcon.click();
    }

    const dispositionInput = this.view.locator('input[placeholder="Make Selection"]').nth(1);
    if (await dispositionInput.isVisible().catch(() => false)) {
      await dispositionInput.click();
      await this.page.locator("li[role=option]", { hasText: disposition }).first().click();
    }

    for (const providerInput of await this.view
      .locator('input[placeholder="Select Physician"]')
      .all()) {
      if ((await providerInput.inputValue().catch(() => "")) !== "") continue;
      await providerInput.click();
      // No fixed provider name: take the FIRST candidate the list offers.
      // The list may only populate after a query — type a generic broad
      // string (never a box-specific provider id) and pick the first option.
      const firstOption = this.page.locator("li[role=option]").first();
      const listed = await firstOption
        .waitFor({ state: "visible", timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
      if (!listed) {
        await providerInput.pressSequentially("s", { delay: 80 });
      }
      await expect(firstOption, "Select Physician list has no candidates").toBeVisible({ timeout: 15_000 });
      await firstOption.click();
    }

    const save = this.view.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeEnabled({ timeout: 20_000 });
    await save.click();
    await expect(this.view).toContainText(disposition, { timeout: 20_000 });
  }

  async complete(): Promise<void> {
    await expect(this.completeButton).toBeEnabled();
    await this.completeButton.click();
    await expect(this.view).toContainText(/Coding Status: Complete/, { timeout: 30_000 });
  }
}
