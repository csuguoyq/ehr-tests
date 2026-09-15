// steps/charge/quick-charge.step.ts — add CPT charges through Quick Charge,
// set quantities, submit, and prove the charges posted ("In Process").
// Requires the BNR detail view (openBnrDetailStep) to have run.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { QuickChargePage } from "../../page-objects/charge/quick-charge.page";

export async function quickChargeStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const cptList =
    typeof params.cpts === "string" && params.cpts
      ? params.cpts.split(",").map((c) => c.trim()).filter(Boolean)
      : ["96372", "96374"];
  const qty = typeof params.qty === "number" ? params.qty : 10;

  const charges = new QuickChargePage(ctx.page, ctx.env);
  ctx.log.step("quick-charge", `cpts=${cptList.join(",")} qty=${qty}`);

  await charges.openCharges();
  for (const cpt of cptList) {
    await charges.addCpt(cpt);
  }
  await charges.setQuantities(qty);
  await charges.submit();
  await charges.expectChargesPosted(cptList, qty);
  ctx.scratch.charges = { cpts: cptList, qty };
  ctx.log.info(`charges posted: ${cptList.join(", ")} x${qty}`);
}
