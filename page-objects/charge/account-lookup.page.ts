// page-objects/charge/account-lookup.page.ts — Charge Services entry:
// rail button → Account Lookup search → open the patient's BNR Overview.
//
// Verified on fbch34 (2026-09-12):
// - The lookup search input has placeholder "Search by BNR, MRN, etc." and
//   searches by patient NAME (an exact BNR id returned no results).
// - A trusted double-click on the result row opens the patient's
//   "BNR Overview" tab; the Hospital child BNR row carries an "Open" action
//   (testid bnr-overview-row-<n>-link, first link cell = the H row).

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class AccountLookupPage {
  readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly searchInput: Locator;
  readonly lookupHeading: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.searchInput = page.locator('input[placeholder="Search by BNR, MRN, etc."]');
    this.lookupHeading = page.getByRole("heading", { name: "Account Lookup" });
  }

  /** Click the rail app button; the portal must already be logged in. */
  async openFromRail(label = "Charge Services"): Promise<void> {
    await page_railClick(this.page, label);
    await expect(this.lookupHeading).toBeVisible({ timeout: 30_000 });
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press("Enter");
  }

  /** Double-click the result row whose patient-name cell contains `name`. */
  async openPatientAccount(name: string): Promise<void> {
    await this.page.getByRole("cell", { name }).first().dblclick();
    await expect(
      this.page.getByRole("tab", { name: "BNR Overview", exact: true })
    ).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Search by MRN and open the account of the row carrying that MRN
   * (verified on fbch34 2026-09-15: MRN search returns the row; opening
   * the account is a single CLICK on the patient-NAME cell — dblclicking
   * the MRN/SSN cells does nothing).
   */
  async openPatientAccountByMrn(mrn: string): Promise<void> {
    await this.search(mrn);
    const mrnCell = this.page.getByRole("cell").filter({ hasText: mrn }).first();
    await expect(mrnCell).toBeVisible({ timeout: 20_000 });
    await mrnCell.locator("xpath=..").getByRole("cell").first().click();
    await expect(
      this.page.getByRole("tab", { name: "BNR Overview", exact: true })
    ).toBeVisible({ timeout: 30_000 });
  }

  /** Open the first (Hospital) child BNR via its row "Open" action. */
  async openFirstBnrDetail(): Promise<void> {
    const link = this.page
      .locator('[data-testid^="bnr-overview-row-"][data-testid$="-link"]')
      .filter({ hasText: "Open" })
      .first();
    await expect(link).toBeVisible({ timeout: 20_000 });
    await link.click();
  }
}

/** Shared rail click (kept tiny; Registration page object has its own). */
async function page_railClick(page: Page, label: string): Promise<void> {
  await page
    .locator(".home-non-navbtn-panel a")
    .filter({ has: page.locator("span", { hasText: label }) })
    .first()
    .click();
}
