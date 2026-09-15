// steps/charge/force-bill.step.ts — on the open BNR detail (BNR Status
// "BNR Edits"), run Billing → Force Bill with a justification.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { BillingPage } from "../../page-objects/charge/billing.page";

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

export async function forceBillStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const reason = str(params.forceReason, "Testbot automation: force bill past BNR edits");
  const billing = new BillingPage(ctx.page, ctx.env);
  ctx.log.step("force-bill", `reason=${reason}`);
  await billing.open();
  if (!(await billing.isForceNeeded())) {
    ctx.log.info("force bill not needed (no BNR Edits) — skipping");
    return;
  }
  await billing.forceBill(reason);
  await billing.expectForceBillDone();
  ctx.scratch.billing = { forced: true, reason };
  ctx.log.info("force bill posted");
}
