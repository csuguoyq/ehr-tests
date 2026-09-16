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
  // The BNR Edits state can lag the billing call — give the Force Bill
  // button a short window to appear before concluding it is not needed.
  const needed = await billing.waitForForceNeeded(20_000);
  if (!needed) {
    ctx.log.info("force bill not needed (no BNR Edits) — skipping");
    return;
  }
  await billing.forceBill(reason);
  await billing.expectForceBillDone();
  // No refresh dance here: the Billing view does not refresh in place after
  // the force-bill POST (fbch34 2026-09-16, user observation), but its only
  // in-flow consumer is submit-claim, which re-mounts and re-fetches via
  // ClaimsPage.waitForFirstRow; every other flow navigates away afterwards
  // (fresh mount = fresh data). A tab-switch here could fail an already
  // successful force bill (2026-09-16 regression review).
  ctx.scratch.billing = { forced: true, reason };
  ctx.log.info("force bill posted");
}
