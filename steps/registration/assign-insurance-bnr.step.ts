// steps/registration/assign-insurance-bnr.step.ts — Registration Accounts
// (BNR) tab: assign the patient's insurance coverage to the BNR (Edit row →
// Assign → Save). Per the SZ35253 manual recording (2026-09-16): an insurance
// that is registered on the patient but NOT assigned to the BNR never
// produces claims — this assignment is the step the UI claim pipeline needs.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";
import { AccountsPage } from "../../page-objects/registration/accounts.page";

export async function assignInsuranceBnrStep(ctx: EhrContext, _params: ResolvedParams): Promise<void> {
  const tabs = new PatientTabsPage(ctx.page, ctx.env);
  const accounts = new AccountsPage(ctx.page, ctx.env);
  ctx.log.step("assign-insurance-bnr", "Accounts (BNR) tab → Edit BNR row → Assign coverage → Save");

  await tabs.openSubTab("Accounts (BNR)");
  await accounts.openBnrEditor();
  await accounts.assignCoverage();
  await accounts.saveAndConfirm();
  ctx.log.info("insurance assigned to BNR");
}
