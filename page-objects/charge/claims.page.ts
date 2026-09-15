// page-objects/charge/claims.page.ts — the BNR Billing tab's Insurance Claims
// card: submit a "Ready to Submit" claim, force-submit an "Errored" one.
//
// From source (ccsrc ehr/src/Charge/Claim CardList.tsx + Fee.tsx), to be
// runtime-verified on fbch34:
// - Claim card button "Submit" (permission IAFB) appears when the claim
//   status is "Ready to Submit" or "Errored".
//   * Ready to Submit → setSubmitFlag: submits DIRECTLY (no dialog).
//   * Errored → dialog (confirm-dialog): title "Force Submit", text
//     "Claim <invoice> will be submitted to <plan> with rule violations.",
//     "Reason For Forcing Submission *" (placeholder "Give a justification",
//     empty reason disables OK), OK button labeled "Force Bill".
// - Success toast "Claim successfully submitted"; card status → "Submitted".

import { expect, type Page, type Locator } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class ClaimsPage {
  readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly submitButton: Locator;
  readonly confirmDialog: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    // The claim card's Submit button — scope to the insurance-claims card to
    // avoid colliding with other Submit buttons (tuned at first runtime run).
    this.submitButton = page.getByRole("button", { name: "Submit", exact: true });
    this.confirmDialog = page.getByTestId("confirm-dialog");
  }

  /**
   * Click Submit on the claim card. Ready-to-Submit claims post directly;
   * Errored claims pop the Force Submit dialog → fill reason → "Force Bill".
   */
  async submitClaim(reason: string): Promise<void> {
    await expect(this.submitButton).toBeVisible({ timeout: 30_000 });
    await this.submitButton.click();
    const dialogAppeared = await this.confirmDialog
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!dialogAppeared) return; // direct submit (submitFlag path)
    await expect(this.confirmDialog).toContainText(/Force Submit|will be submitted/i);
    const reasonInput = this.confirmDialog
      .locator('textarea, input[placeholder="Give a justification"]')
      .first();
    await reasonInput.fill(reason);
    const ok = this.confirmDialog.getByRole("button", { name: /Force Bill|Submit/ }).first();
    await expect(ok).toBeEnabled({ timeout: 15_000 });
    await ok.click();
    await expect(this.confirmDialog).toBeHidden({ timeout: 20_000 });
  }

  /** Posted proof: no clickable Submit left on the claim card. */
  async expectSubmitted(): Promise<void> {
    await expect(this.submitButton).toBeHidden({ timeout: 30_000 });
  }
}
