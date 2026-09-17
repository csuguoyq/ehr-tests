// steps/charge/force-bill.step.ts — on the open BNR detail (BNR Status
// "BNR Edits"), run Billing → Force Bill with a justification.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { BillingPage } from "../../page-objects/charge/billing.page";
import { str } from "../../src/utils/params";


export async function forceBillStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const reason = str(params.forceReason, "Testbot automation: force bill past BNR edits");
  const billing = new BillingPage(ctx.page, ctx.env);
  ctx.log.step("force-bill", `reason=${reason}`);
  await billing.open();
  // The BNR Edits state can lag the billing call — give the Force Bill
  // button a short window to appear before concluding it is not needed.
  const needed = await billing.waitForForceNeeded(20_000);
  if (!needed) {
    ctx.log.info("force bill not needed (no BNR Edits) — skipping");
    return;
  }
  await billing.forceBill(reason);
  await billing.expectForceBillDone();
  // User-backed procedure (2026-09-17 manual recording + run log): after the
  // Force Bill POST the server-side processing takes ~10s; switching tabs
  // earlier reads stale state. After the settle, remount the Billing view
  // (tab away to Charges and back) so downstream consumers (submit-claim)
  // see the fresh state and the claim card's Submit button once it exists.
  await ctx.page.waitForTimeout(10_000);
  await billing.remountForFreshState();
  ctx.scratch.billing = { forced: true, reason };
  ctx.log.info("force bill posted");
}
