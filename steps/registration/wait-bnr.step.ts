// steps/registration/wait-bnr.step.ts — prove the Hospital BNR was
// auto-created after the admit (roadmap "waitForBnr"), reading the first row
// of the Accounts (BNR) overview. The BNR id is needed by later charge slices.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";
import { AccountsPage } from "../../page-objects/registration/accounts.page";

export async function waitForBnrStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const timeoutMs = typeof params.bnrTimeoutMs === "number" ? params.bnrTimeoutMs : 180_000;

  const tabs = new PatientTabsPage(ctx.page, ctx.env);
  const accounts = new AccountsPage(ctx.page, ctx.env);
  ctx.log.step("wait-bnr", `timeout=${timeoutMs}ms`);

  await tabs.openSubTab("Accounts (BNR)");
  const bnr = await accounts.expectFirstBnr(timeoutMs);
  ctx.scratch.bnrId = bnr;
  ctx.log.info(`BNR auto-created: ${bnr}`);
}
