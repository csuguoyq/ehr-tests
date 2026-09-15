// page-objects/registration/accounts.page.ts — the Registration Accounts (BNR)
// sub-tab overview. Used after an ADT admit to prove the Hospital BNR was
// auto-created and to read its billing number.
//
// Verified on fbch34 (2026-09-12): after an admit the overview immediately
// shows one base-BNR row (`bnr-overview-row-0-*` cell testids).

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class AccountsPage {
  readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly firstBnrCell: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.firstBnrCell = page.getByTestId("bnr-overview-row-0-Billing-Number-BNR");
  }

  /** Wait (poll) until the first BNR row exists; returns its billing number. */
  async expectFirstBnr(timeoutMs = 180_000): Promise<string> {
    await expect(this.firstBnrCell).toBeVisible({ timeout: timeoutMs });
    const bnr = (await this.firstBnrCell.innerText()).trim();
    expect(bnr).not.toHaveLength(0);
    return bnr;
  }
}
