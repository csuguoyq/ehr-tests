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
      "BNR 未回到可计费状态：重挂载轮询 8 分钟后 Start Billing / Force Bill 均未出现" +
        "（BNR 状态翻转依赖服务器侧 updateBNRStatus，见 TCS.md 环境备注）。"
    );
  }
  // Force Bill state (BNR Edits) needs no Start Billing press — the
  // force-bill step in the flow handles it.
  if (!(await billing.isForceNeeded())) {
    // BNR Edits (e.g. an unsigned discharge order) can bounce the bill: the
    // Start Billing button re-appears. Re-press up to 3 times, waiting each
    // round for either the button to clear or a Force Bill state (the
    // force-bill step's job) to appear (fbch34 2026-09-16, race observed).
    for (let attempt = 1; attempt <= 3; attempt++) {
      await billing.waitForActionable(15_000);
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
  }
  ctx.scratch.billing = { started: true };
  ctx.log.info("billing started (manuallySubmitBill posted)");
}
