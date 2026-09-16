// steps/registration/assign-insurance-bnr.step.ts — Registration Accounts
// (BNR) tab: assign the patient's insurance coverage to the BNR (Edit row →
// Assign → Save). Per the SZ35253 manual recording (2026-09-16): an insurance
// that is registered on the patient but NOT assigned to the BNR never
// produces claims — this assignment is the step the UI claim pipeline needs.

import { expect, type Page } from "@playwright/test";
import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";

export async function assignInsuranceBnrStep(ctx: EhrContext, _params: ResolvedParams): Promise<void> {
  const page: Page = ctx.page;
  const tabs = new PatientTabsPage(page, ctx.env);
  ctx.log.step("assign-insurance-bnr", "Accounts (BNR) tab → Edit BNR row → Assign coverage → Save");

  await tabs.openSubTab("Accounts (BNR)");

  // The overview's second row (row-1) carries the coverage link — its "Edit"
  // opens the BNR assignment editor (SZ35253 manual recording).
  const edit = page.getByTestId("bnr-overview-row-1-link").getByText("Edit");
  await expect(edit).toBeVisible({ timeout: 20_000 });
  await edit.click();

  // The coverage can take a while to surface in "Available Coverages" after
  // the insurance save (server-side sync) — poll for the Assign control, and
  // re-open the editor once if it never shows (stale fetch).
  // The Assign control is a plain text link inside the row's Action cell
  // (SZ35253 recording: blue "Assign" text).
  const assignControl = page.getByText("Assign", { exact: true }).first();
  await expect(assignControl).toBeVisible({ timeout: 30_000 });
  await assignControl.click();

  await page.getByTestId("reg-save-changes-button").click();

  // A confirm dialog may follow (ExtJS OK / MUI) — accept either.
  const extOk = page.locator(".x-window:visible").getByText("OK", { exact: true }).first();
  if (await extOk.isVisible().catch(() => false)) {
    await extOk.click();
  }
  const muiOk = page
    .locator("[role=dialog]:visible, .MuiDialog-root:visible")
    .getByRole("button", { name: /^(OK|Yes)$/ })
    .first();
  if (await muiOk.isVisible().catch(() => false)) {
    await muiOk.click();
  }
  ctx.log.info("insurance assigned to BNR");
}
