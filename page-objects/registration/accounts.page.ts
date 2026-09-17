// page-objects/registration/accounts.page.ts — the Registration Accounts (BNR)
// sub-tab overview. Used after an ADT admit to prove the Hospital BNR was
// auto-created and to read its billing number, and to assign the patient's
// insurance coverage to the BNR (SZ35253 manual recording, 2026-09-16: an
// insurance registered on the patient but NOT assigned to the BNR never
// produces claims).
//
// Verified on fbch34 (2026-09-12): after an admit the overview immediately
// shows one base-BNR row (`bnr-overview-row-0-*` cell testids). The overview's
// second row (row-1) carries the coverage link — its "Edit" opens the BNR
// assignment editor.

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class AccountsPage {
  private readonly page: Page;
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

  /** Open the BNR assignment editor via the coverage row's Edit link. */
  async openBnrEditor(): Promise<void> {
    const edit = this.page.getByTestId("bnr-overview-row-1-link").getByText("Edit");
    await expect(edit).toBeVisible({ timeout: 20_000 });
    await edit.click();
  }

  /**
   * Click the coverage row's "Assign" text link (blue plain-text link in the
   * row's Action cell, SZ35253 recording). Coverage can take a while to
   * surface after the insurance save (server-side sync) — hence the 30s
   * visibility poll. fbch34 2026-09-17: no stale-fetch re-open needed; the
   * plain poll suffices (an earlier comment claimed a re-open workaround
   * that never existed in code — runtime verification settled it).
   */
  async assignCoverage(): Promise<void> {
    const assignControl = this.page.getByText("Assign", { exact: true }).first();
    await expect(assignControl).toBeVisible({ timeout: 30_000 });
    await assignControl.click();
  }

  /** Save the editor; accept the confirm dialog (ExtJS OK or MUI OK/Yes). */
  async saveAndConfirm(): Promise<void> {
    await this.page.getByTestId("reg-save-changes-button").click();
    const extOk = this.page.locator(".x-window:visible").getByText("OK", { exact: true }).first();
    if (await extOk.isVisible().catch(() => false)) {
      await extOk.click();
    }
    const muiOk = this.page
      .locator("[role=dialog]:visible, .MuiDialog-root:visible")
      .getByRole("button", { name: /^(OK|Yes)$/ })
      .first();
    if (await muiOk.isVisible().catch(() => false)) {
      await muiOk.click();
    }
  }
}
