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

export interface ClaimRowView {
  status: string;
  type: string;
  charges: number;
  text: string;
}

/** "$1,234.56" / "-$1,234.56" / "($1,234.56)" → signed number. */
export function parseDollars(raw: string): number {
  const m = raw.match(/\(?-?\$?\s?-?[\d,]+\.\d{2}\)?/);
  if (!m) return 0;
  const neg = /\(.*\)|-/.test(m[0]);
  return Number(m[0].replace(/[^0-9.]/g, "")) * (neg ? -1 : 1);
}

export class ClaimsPage {
  readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly submitButton: Locator;
  readonly confirmDialog: Locator;

  // Claim table (Billing tab → "Insurance Claims" accordion section):
  // MUI DataGrid whose rows carry a per-row kebab (the only IconButton in the
  // row — the "View Claim" icon is a bare svg) opening a MUI Menu with
  // Void/Resubmit/Replacement/Add Adjustment, and a pinned bottom "Totals" row.
  readonly claimsSection: Locator;
  readonly claimGrid: Locator;
  readonly claimRows: Locator;
  readonly totalsRow: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    // The claim card's Submit button — scope to the insurance-claims card to
    // avoid colliding with other Submit buttons (tuned at first runtime run).
    this.submitButton = page.getByRole("button", { name: "Submit", exact: true });
    this.confirmDialog = page.getByTestId("confirm-dialog");

    this.claimsSection = page.locator(".MuiAccordion-root", { hasText: "Insurance Claims" });
    this.claimGrid = this.claimsSection.locator(".MuiDataGrid-root").first();
    this.claimRows = this.claimGrid.locator(".MuiDataGrid-virtualScroller .MuiDataGrid-row");
    this.totalsRow = this.claimGrid.locator(".MuiDataGrid-pinnedRows--bottom .MuiDataGrid-row");
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

  // ---- Claim table (SZ35474/TC35474 surface) --------------------------------

  /** The kebab ("More") button of a claim row — the row's only real button. */
  rowMenuButton(row: Locator): Locator {
    return row.getByRole("button");
  }

  menu(item: "Void Claim" | "Resubmit Claim" | "Replacement Claim" | "Add Adjustment"): Locator {
    return this.page.getByRole("menuitem", { name: item });
  }

  /**
   * Open a row's kebab menu and fire one action; the app pops a CciMsgDialog
   * (testid cci-dialog) titled like the action — confirm by its action button.
   */
  async rowAction(row: Locator, item: "Void Claim" | "Resubmit Claim" | "Replacement Claim"): Promise<void> {
    await row.getByRole("button").click();
    const menuItem = this.menu(item);
    await expect(menuItem).toBeVisible({ timeout: 10_000 });
    await menuItem.click();
    const dialog = this.page.getByTestId("cci-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText(new RegExp(item, "i"));
    await dialog.getByRole("button", { name: item }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
  }

  /** Parse the claim rows (Status / Type / Charges live in grid cells). */
  async readRows(): Promise<ClaimRowView[]> {
    const rows = await this.claimRows.all();
    const views: ClaimRowView[] = [];
    for (const row of rows) {
      const text = (await row.innerText()).replace(/\s+/g, " ").trim();
      views.push({
        status: (text.match(/(Ready to Submit|Submitted|Errored|Denied|Closed|Void|Remit Review)/) || [""])[0],
        type: (text.match(/(Admit thru Discharge|Void\/Cancel|Replacement)/i) || [""])[0],
        // Cell order: …Payer, Charges, Expected Reimbursement, Payments, Balance
        // — the first $ amount in the row is Charges.
        charges: parseDollars(text),
        text,
      });
    }
    return views;
  }

  /** Charges value of the pinned "Totals" row (bottom). */
  async readTotalsCharges(): Promise<number> {
    await expect(this.totalsRow).toBeVisible({ timeout: 15_000 });
    const text = await this.totalsRow.innerText();
    return parseDollars(text);
  }
}
