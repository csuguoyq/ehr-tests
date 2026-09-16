// steps/charge/quick-charge.step.ts — add CPT charges through Quick Charge,
// set quantities, submit, and prove the charges posted ("In Process").
// Requires the BNR detail view (openBnrDetailStep) to have run.

import { expect } from "@playwright/test";
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
  // A bucket-item click is occasionally swallowed (React not yet attached or
  // the app dropping the event — observed on fbch34 2026-09-15): wait for the
  // queue row to appear and re-click when it did not (≤3 attempts each).
  for (const cpt of cptList) {
    const before = await charges.queueCount();
    for (let attempt = 1; attempt <= 3; attempt++) {
      await charges.addCpt(cpt);
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        if ((await charges.queueCount()) > before) break;
        await ctx.page.waitForTimeout(400);
      }
      if ((await charges.queueCount()) > before) break;
      ctx.log.warn(`bucket click swallowed (${cpt}) — retry ${attempt}`);
    }
  }
  await charges.setQuantities(qty);
  // The submit click is occasionally swallowed by the app (PROJECT.md 阶段 3,
  // same failure mode as create-patient): confirm via the queue clearing and
  // re-press when it did not take (≤3 attempts, 15s queue-clear poll each).
  let cleared = false;
  for (let attempt = 1; attempt <= 3 && !cleared; attempt++) {
    await charges.submit();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (await charges.isQueueCleared()) {
        cleared = true;
        break;
      }
      await ctx.page.waitForTimeout(500);
    }
    if (!cleared) ctx.log.warn(`submit click swallowed — retry ${attempt}`);
  }
  await charges.expectChargesPosted(cptList, qty);
  ctx.scratch.charges = { cpts: cptList, qty };
  ctx.log.info(`charges posted: ${cptList.join(", ")} x${qty}`);
}
