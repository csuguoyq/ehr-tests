// steps/charge/start-billing.step.ts — on the open BNR detail, run
// Billing → Start Billing → Bill Now (requires discharged + coded BNR).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { BillingPage } from "../../page-objects/charge/billing.page";

export async function startBillingStep(ctx: EhrContext, _params: ResolvedParams): Promise<void> {
  const billing = new BillingPage(ctx.page, ctx.env);
  ctx.log.step("start-billing", "Billing tab → Start Billing → Bill Now");
  await billing.open();
  // Wait for a billing entry point with remounts between rounds: the card
  // state only re-fetches on mount, and the re-bill leg (void_claim_rebill)
  // lands on a stale "Billed" view whose Start/Force Bill re-render waits on
  // a server-side BNR status flip (fbch34 2026-09-16, TC35474).
  const actionable = await billing.waitForRebillable(480_000);
  if (!actionable) {
    throw new Error(
      "BNR never returned to a billable state: after 8 minutes of remount polling neither Start Billing nor Force Bill appeared" +
        " (BNR status flip depends on the server-side updateBNRStatus, see TCS.md environment notes)."
    );
  }
  // Force Bill state (BNR Edits) needs no Start Billing press — the
  // force-bill step in the flow handles it.
  if (!(await billing.isForceNeeded())) {
    // One press should be enough (user 2026-09-17: "点击了就能成功").
    // Readiness condition (user 2026-09-17, replaces the former 10s blind
    // settle): the card shows "Coding Complete" AND the button is clickable.
    // The Billing view does NOT refresh in place after the POST, so the
    // settle check MUST run on a re-mounted view (tab away + back).
    if (!(await billing.waitForStartReady(30_000))) {
      throw new Error(
        "Start Billing never became ready: 'Coding Complete' + enabled button did not appear within 30s"
      );
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      await billing.waitForActionable(15_000);
      await billing.startBilling();
      await ctx.page.waitForTimeout(10_000);
      await billing.remountForFreshState();
      if (
        (await billing.isStartGone()) ||
        (await billing.isNotYetBilled() === false) ||
        (await billing.isForceNeeded())
      ) {
        break;
      }
      ctx.log.warn(`bill did not take (fresh mount still offers Start Billing) — retry ${attempt}`);
    }
    if (!(await billing.isForceNeeded())) {
      await billing.expectBilled();
    }
  }
  ctx.scratch.billing = { started: true };
  ctx.log.info("billing started (manuallySubmitBill posted)");
}
