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
  readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly view: Locator;
  readonly codingTab: Locator;
  readonly diagnosisTab: Locator;
  readonly adtTab: Locator;
  readonly completeButton: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.view = page.getByTestId("charge-services-coding-view");
    this.codingTab = page.getByRole("tab", { name: "Coding", exact: true });
    this.diagnosisTab = page.getByRole("tab", { name: "Diagnosis", exact: true });
    this.adtTab = page.getByRole("tab", { name: "ADT", exact: true });
    this.completeButton = page.getByTestId("coding-complete-button");
  }

  /** Open Coding and start the session if the Begin Coding dialog pops. */
  async open(): Promise<void> {
    await this.codingTab.click();
    await expect(this.view).toBeVisible({ timeout: 20_000 });
    const begin = this.page.getByRole("button", { name: "Begin Coding" });
    if (await begin.isVisible().catch(() => false)) {
      await begin.click();
    }
    await expect(this.view).toContainText(/Coding Status: (In Progress|Complete)/, {
      timeout: 20_000,
    });
  }

  /** Fill the admit + principal diagnosis slots (codes, e.g. I69.941). */
  async fillDiagnoses(admitDiagnosis: string, principalDiagnosis: string): Promise<void> {
    await this.diagnosisTab.click();
    await this.ensureDiagnosisSlots(2);
    await this.pickDiagnosisCode(0, admitDiagnosis);
    await this.pickDiagnosisCode(1, principalDiagnosis);
  }

  /** The Diagnosis sub-tab renders one slot per expected diagnosis type. */
  private async ensureDiagnosisSlots(count: number): Promise<void> {
    for (let i = 0; i < 5; i++) {
      const slots = this.page.locator("#diagnosis-ICD10_CM_Code");
      if ((await slots.count()) >= count) return;
      await this.page.getByRole("button", { name: "Add Diagnosis" }).first().click();
      await this.page.waitForTimeout(300);
    }
    throw new Error(`未能渲染 ${count} 个 diagnosis 槽位`);
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

  /** ADT sub-tab: set Discharge Disposition via the pencil edit form. */
  async setDischargeDisposition(disposition: string): Promise<void> {
    await this.adtTab.click();
    await this.view.locator('svg[data-testid="EditIcon"]').first().click();
    const dispositionInput = this.view.locator('input[placeholder="Make Selection"]').nth(1);
    await expect(dispositionInput).toBeVisible({ timeout: 15_000 });
    await dispositionInput.click();
    await this.page.getByRole("option", { name: disposition, exact: true }).click();
    await this.view.getByRole("button", { name: "Save", exact: true }).click();
    await expect(this.view).toContainText(disposition, { timeout: 20_000 });
  }

  async complete(): Promise<void> {
    await expect(this.completeButton).toBeEnabled();
    await this.completeButton.click();
    await expect(this.view).toContainText(/Coding Status: Complete/, { timeout: 30_000 });
  }
}
