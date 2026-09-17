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
  private readonly page: Page;
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
    await this.openOverview();
  }

  /** Open the Billing tab without assuming a card state (billed/edits/fresh). */
  async openOverview(): Promise<void> {
    await this.billingTab.click();
    await this.expectOverview();
  }

  /**
   * Force the Billing view to re-mount so server-side changes (claim
   * generation, billing finalization) become visible: the view does NOT
   * refresh in place after a billing POST (fbch34 2026-09-16, user
   * observation), and the claim grid only FETCHES on mount (InsuranceClaimTable
   * `_getClaimList` on [dbpath, bnrnit, refresh]) — switch to a sibling
   * BNR detail tab and back to get a fresh fetch.
   */
  async remountForFreshState(): Promise<void> {
    await this.page.getByRole("tab", { name: "Charges", exact: true }).click();
    await this.openOverview();
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

  /**
   * Wait until the card is actually actionable: Start Billing rendered, or
   * a Force Bill state (BNR Edits) surfaced. Clicking Start Billing the
   * moment the overview paints fires before the server-side BNR-Edits
   * evaluation lands — the bill bounces and costs a full retry round
   * (fbch34 2026-09-16, user observation).
   */
  async waitForActionable(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (
        (await this.startBillingButton.isVisible().catch(() => false)) ||
        (await this.isForceNeeded())
      ) {
        return true;
      }
      await this.page.waitForTimeout(500);
    }
    return false;
  }

  /**
   * Wait until Start Billing is actually safe to press (user condition,
   * 2026-09-17): the charges card shows "Coding Complete" (the server-side
   * readiness signal — hasCompleteCode milestone rendered as the card's
   * status text) AND the button is visible and enabled. Replaces the former
   * blind post-entry settle: polls instead of sleeping, fires as soon as
   * both hold.
   */
  async waitForStartReady(timeoutMs: number): Promise<boolean> {
    const codingComplete = this.page.getByText("Coding Complete", { exact: true }).first();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ready =
        (await this.startBillingButton.isVisible().catch(() => false)) &&
        (await this.startBillingButton.isEnabled().catch(() => false)) &&
        (await codingComplete.isVisible().catch(() => false));
      if (ready) {
        // User instruction 2026-09-17: once ready, hold 2 more seconds —
        // the render signal still leads true server-side readiness.
        await this.page.waitForTimeout(2_000);
        return true;
      }
      await this.page.waitForTimeout(500);
    }
    return false;
  }

  /** Start Billing → confirm the date-range dialog with "Bill Now". */
  async startBilling(): Promise<void> {
    // After discharge the card state can lag the navigation — require the
    // button to be visibly rendered (not just attached) before pressing it.
    await expect(this.startBillingButton).toBeVisible({ timeout: 30_000 });
    await expect(this.startBillingButton).toBeEnabled({ timeout: 15_000 });
    await this.startBillingButton.click();
    await expect(this.confirmDialog).toBeVisible({ timeout: 15_000 });
    await expect(this.confirmDialog).toContainText("Select Billing Date Range");
    await expect(this.billNowButton).toBeEnabled({ timeout: 15_000 });
    await this.billNowButton.click();
    await expect(this.confirmDialog).toBeHidden({ timeout: 20_000 });
  }

  /** Posted proof: the Unbilled Charges card no longer offers Start Billing. */
  async isStartGone(): Promise<boolean> {
    return this.startBillingButton.isHidden().catch(() => true);
  }

  /** True while the Guarantor card still reads "Not Yet Billed". */
  async isNotYetBilled(): Promise<boolean> {
    return this.page
      .getByText("Not Yet Billed", { exact: true })
      .first()
      .isVisible()
      .catch(() => false);
  }

  /**
   * Wait until the billing state settles after a Bill Now: the Guarantor
   * card stops reading "Not Yet Billed" (billed), the Start Billing button
   * clears, or a Force Bill state appears (BNR Edits).
   */
  async waitForSettled(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (
        !(await this.isNotYetBilled()) ||
        (await this.isStartGone()) ||
        (await this.isForceNeeded())
      ) {
        return true;
      }
      await this.page.waitForTimeout(500);
    }
    return false;
  }

  /** Assert the Unbilled Charges card no longer offers Start Billing. */
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

  /** The Adjustments accordion rendered on the open BNR detail. */
  async expectAdjustmentsAccordion(): Promise<void> {
    await expect(
      this.page.locator(".MuiAccordion-root", { hasText: "Adjustments" })
    ).toBeVisible();
  }

  /** Posted proof after force billing: the Force Bill button is gone. */
  async expectForceBillDone(): Promise<void> {
    await expect(this.forceBillButton).toBeHidden({ timeout: 30_000 });
  }

  // ---- Guarantor Balance (SZ35253 surface) ---------------------------------

  /**
   * The "Guarantor Balance" accordion header carries the live total (label +
   * formatted amount); the last $ amount in the summary is the balance sum.
   */
  async readGuarantorBalance(): Promise<number> {
    const section = this.page.locator(".MuiAccordion-root", { hasText: "Guarantor Balance" });
    await expect(section).toBeVisible({ timeout: 20_000 });
    const summary = await section.locator(".MuiAccordionSummary-root").innerText();
    const amounts = summary.match(/\$-?[\d,]+\.\d{2}/g) || ["$0.00"];
    const neg = /-\s*\$/.test(summary);
    return Number(amounts[amounts.length - 1].replace(/[$,]/g, "")) * (neg ? -1 : 1);
  }

  /** Poll for a Force Bill state (BNR Edits) to appear. */
  async waitForForceNeeded(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isForceNeeded()) return true;
      await this.page.waitForTimeout(500);
    }
    return false;
  }

  /**
   * Poll until the summary card offers a billing entry point again (Start
   * Billing or Force Bill), re-mounting the view between rounds: the card
   * only re-fetches on mount (CardList showBillBtn/showForceBtn derive from
   * bnrstatus + lastClaim, and after a claim void the BNR status flip runs
   * server-side — fbch34 2026-09-16, TC35474 re-bill leg).
   */
  async waitForRebillable(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (
        (await this.startBillingButton.isVisible().catch(() => false)) ||
        (await this.isForceNeeded())
      ) {
        return true;
      }
      if (Date.now() >= deadline) return false;
      try {
        await this.remountForFreshState();
      } catch {
        return false;
      }
      if (Date.now() >= deadline) return false;
      await this.page.waitForTimeout(3_000);
    }
  }
}
