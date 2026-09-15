// page-objects/charge/billing.page.ts — the BNR detail "Billing" tab:
// Overview → Unbilled Charges card → Start Billing.
//
// From source (ccsrc ehr/src/Charge/Claim, Fee.tsx + components/BNRRangeBox.tsx
// + components/CardList.tsx) and to be runtime-verified on fbch34:
// - Start Billing (a MUI Button in the Unbilled Charges card, gated by
//   permission IAFB) opens `confirm-dialog` titled "Select Billing Date Range".
// - The dialog's range radio defaults to "All Dates (Admit to Discharge)"
//   when the BNR is Discharged/Checked Out/Active → the OK button "Bill Now"
//   is enabled immediately (Limit mode requires selecting charges).
// - Submit calls manuallySubmitBill; toast "Manually successfully submitted."

import { expect, type Page, type Locator } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class BillingPage {
  readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly billingTab: Locator;
  readonly startBillingButton: Locator;
  readonly forceBillButton: Locator;
  readonly confirmDialog: Locator;
  readonly billNowButton: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    // NOT exact: the selected tab's accessible name grows a leading space
    // (" Billing") in this build.
    this.billingTab = page.getByRole("tab", { name: /Billing/ }).first();
    this.startBillingButton = page.getByRole("button", { name: "Start Billing" });
    this.forceBillButton = page.getByRole("button", { name: "Force Bill" });
    this.confirmDialog = page.getByTestId("confirm-dialog");
    this.billNowButton = this.confirmDialog.getByRole("button", { name: "Bill Now" });
  }

  /** Open the Billing tab of the BNR detail (must already be open). */
  async open(): Promise<void> {
    await this.billingTab.click();
    await this.expectOverview();
  }

  /** Open the Billing tab without assuming a card state (billed/edits/fresh). */
  async openOverview(): Promise<void> {
    await this.billingTab.click();
    await this.expectOverview();
  }

  /** The Billing Overview chips/cards are rendered (any billing state). */
  async expectOverview(): Promise<void> {
    await expect(
      this.page.getByText("Unbilled Charges", { exact: false }).first()
    ).toBeVisible({ timeout: 20_000 });
  }

  /** True when the card offers Force Bill (BNR Edits state). */
  async isForceNeeded(): Promise<boolean> {
    return this.forceBillButton.isVisible().catch(() => false);
  }

  /** Start Billing → confirm the date-range dialog with "Bill Now". */
  async startBilling(): Promise<void> {
    await expect(this.startBillingButton).toBeEnabled();
    await this.startBillingButton.click();
    await expect(this.confirmDialog).toBeVisible({ timeout: 15_000 });
    await expect(this.confirmDialog).toContainText("Select Billing Date Range");
    await expect(this.billNowButton).toBeEnabled({ timeout: 15_000 });
    await this.billNowButton.click();
    await expect(this.confirmDialog).toBeHidden({ timeout: 20_000 });
  }

  /** Posted proof: the Unbilled Charges card no longer offers Start Billing. */
  async expectBilled(): Promise<void> {
    await expect(this.startBillingButton).toBeHidden({ timeout: 30_000 });
  }

  /**
   * Force Bill path (BNR Status "BNR Edits" after Start Billing): the card's
   * button becomes "Force Bill" → confirm-dialog titled "Force Submit" with
   * "Reason For Forcing Bill *" (textarea placeholder "Give a justification",
   * empty reason keeps the OK disabled) → OK button also labeled "Force Bill".
   */
  async forceBill(reason: string): Promise<void> {
    await expect(this.forceBillButton).toBeVisible({ timeout: 20_000 });
    await this.forceBillButton.click();
    await expect(this.confirmDialog).toBeVisible({ timeout: 15_000 });
    await expect(this.confirmDialog).toContainText(/Force Submit/i);
    const reasonInput = this.confirmDialog.locator('textarea, input[placeholder="Give a justification"]').first();
    await reasonInput.fill(reason);
    const ok = this.confirmDialog.getByRole("button", { name: "Force Bill" });
    await expect(ok).toBeEnabled({ timeout: 15_000 });
    await ok.click();
    await expect(this.confirmDialog).toBeHidden({ timeout: 20_000 });
  }

  /** Posted proof after force billing: the Force Bill button is gone. */
  async expectForceBillDone(): Promise<void> {
    await expect(this.forceBillButton).toBeHidden({ timeout: 30_000 });
  }
}
