// page-objects/charge/quick-charge.page.ts — BNR detail "Charges" tab with the
// Quick Charge capture flow.
//
// Verified on fbch34 (2026-09-12):
// - The BNR detail view has tabs Account Summary / Charges / Coding /
//   Registration / Billing. "Charges" shows Add Charges / View Charges toggles.
// - Add Charges renders the Quick Charge list; each CPT row is
//   `[data-testid="quick-charge-bucket-item"]` and CLICKING adds it to the
//   charge queue (qty defaults to 1).
// - Each queue row has a number input `[data-testid="quick-charge-quantity"]`.
// - Submit posts the queue; charges then appear (status "In Process") in
//   `[data-testid="charge-services-transactions-datagrid"]`.
// - Per the known-environment notes, a CDM Conflict dialog may pop after
//   submit (answer "Submit Charge(s) for Review") followed by a false
//   "Error Submitting" dialog (dismiss) — neither appeared in this run, both
//   are handled defensively here.

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class QuickChargePage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly chargesTab: Locator;
  readonly addChargesButton: Locator;
  readonly submitButton: Locator;
  readonly transactionsGrid: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.chargesTab = page.getByRole("tab", { name: "Charges", exact: true });
    this.addChargesButton = page.getByTestId("charge-services-tab-bnr-add-charges");
    this.submitButton = page.getByRole("button", { name: "Submit", exact: true });
    this.transactionsGrid = page.getByTestId("charge-services-transactions-datagrid");
  }

  async openCharges(): Promise<void> {
    await this.chargesTab.click();
    await expect(this.addChargesButton).toBeVisible({ timeout: 20_000 });
    await this.addChargesButton.click();
    await expect(
      this.page.locator('[data-testid="quick-charge-bucket-item"]').first()
    ).toBeVisible({ timeout: 20_000 });
  }

  /** Click a Quick Charge CPT row; it is appended to the charge queue. */
  async addCpt(cpt: string): Promise<void> {
    // NOTE: the row text is "96372THERAPEUTIC ..." (code glued to the
    // description) — a \b-word-boundary regex does NOT match here.
    const item = this.page
      .locator('[data-testid="quick-charge-bucket-item"]')
      .filter({ hasText: cpt })
      .first();
    await expect(item).toBeVisible();
    await item.click();
  }

  /** Set the quantity of every queued charge (queue rows appear in order). */
  async setQuantities(qty: number): Promise<void> {
    const inputs = this.page.locator('[data-testid="quick-charge-quantity"] input');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      await inputs.nth(i).fill(String(qty));
      await expect(inputs.nth(i)).toHaveValue(String(qty));
    }
  }

  async submit(): Promise<void> {
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
    await this.handlePostSubmitDialogs();
  }

  /** Number of rows currently sitting in the charge queue. */
  async queueCount(): Promise<number> {
    return this.page.locator('[data-testid="quick-charge-quantity"]').count();
  }

  /** True once the charge queue emptied (the observable submit receipt). */
  async isQueueCleared(): Promise<boolean> {
    const pending = await this.page.locator('[data-testid="quick-charge-quantity"]').count();
    return pending === 0;
  }

  /** Known-environment dialogs after submit (see file header). */
  private async handlePostSubmitDialogs(): Promise<void> {
    const review = this.page.getByRole("button", { name: "Submit Charge(s) for Review" });
    if (await review.isVisible().catch(() => false)) {
      await review.click();
    }
    const errorDialog = this.page.getByRole("dialog", { name: /Error Submitting/i });
    if (await errorDialog.isVisible().catch(() => false)) {
      const ok = errorDialog.getByRole("button", { name: /ok|close|dismiss/i }).first();
      await ok.click();
      await expect(errorDialog).toBeHidden();
    }
  }

  /** Every queued CPT must appear in the posted transactions grid. */
  async expectChargesPosted(cpts: string[], qty: number): Promise<void> {
    await this.page.getByTestId("charge-services-tab-bnr-charge-transactions").click();
    await expect(this.transactionsGrid).toBeVisible({ timeout: 30_000 });
    for (const cpt of cpts) {
      await expect(
        // A patient may carry older transactions of the same CPT; assert on
        // the newest row (grid is date-ascending, just-posted row is last).
        this.transactionsGrid
          .getByRole("row", { name: new RegExp(cpt) })
          .last()
      ).toContainText(String(qty), { timeout: 30_000 });
    }
  }
}
