// steps/charge/start-billing.step.ts — on the open BNR detail, run
// Billing → Start Billing → Bill Now (requires discharged + coded BNR).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { BillingPage } from "../../page-objects/charge/billing.page";

export async function startBillingStep(ctx: EhrContext, _params: ResolvedParams): Promise<void> {
  const billing = new BillingPage(ctx.page, ctx.env);
  ctx.log.step("start-billing", "Billing tab → Start Billing → Bill Now");
  await billing.open();
  // BNR Edits (e.g. an unsigned discharge order) can bounce the bill: the
  // Start Billing button re-appears. Re-press up to 3 times, waiting each
  // round for either the button to clear or a Force Bill state (the
  // force-bill step's job) to appear (fbch34 2026-09-16, race observed).
  for (let attempt = 1; attempt <= 3; attempt++) {
    await billing.startBilling();
    const settled = await billing.waitForSettled(25_000);
    if (!settled) {
      ctx.log.warn(`bill bounced (BNR Edits) — retry ${attempt}`);
      continue;
    }
    // A late BNR-Edits evaluation (e.g. Unsigned Order) can pull the bill
    // back seconds later — require the settled state to hold for 5s.
    await ctx.page.waitForTimeout(5_000);
    if (!(await billing.isNotYetBilled()) || (await billing.isForceNeeded())) break;
    ctx.log.warn(`bill state regressed after settle — retry ${attempt}`);
  }
  if (!(await billing.isForceNeeded())) {
    await billing.expectBilled();
  }
  ctx.scratch.billing = { started: true };
  ctx.log.info("billing started (manuallySubmitBill posted)");
}
