// steps/charge/start-billing.step.ts — on the open BNR detail, run
// Billing → Start Billing → Bill Now (requires discharged + coded BNR).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { BillingPage } from "../../page-objects/charge/billing.page";

export async function startBillingStep(ctx: EhrContext, _params: ResolvedParams): Promise<void> {
  const billing = new BillingPage(ctx.page, ctx.env);
  ctx.log.step("start-billing", "Billing tab → Start Billing → Bill Now");
  await billing.open();
  await billing.startBilling();
  await billing.expectBilled();
  ctx.scratch.billing = { started: true };
  ctx.log.info("billing started (manuallySubmitBill posted)");
}
