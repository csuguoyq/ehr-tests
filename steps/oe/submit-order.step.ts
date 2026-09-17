// steps/oe/submit-order.step.ts — submit the NEW ORDERS panel and drive the
// post-submit dialog chain + completion poll. The completion judgment
// ("receipt shown OR order Active") is business state, so it lives in the
// step, not the PO (framework review 2026-09-17, H1). The caller asserts
// final Active state via expectOrderActive.

import type { EhrContext } from "../../src/types/ehr-context";
import { OrderEntryPage } from "../../page-objects/oe/order-entry.page";

// The receipt can take 15-35s to surface (fbch34 2026-09-16); 45s covers it
// with margin without stalling runs where it never appears.
const COMPLETION_TIMEOUT_MS = 45_000;

export async function submitOrderStep(ctx: EhrContext, orderName = "Discharge"): Promise<void> {
  const oe = new OrderEntryPage(ctx.page, ctx.env);
  ctx.log.step("submit-order", `order=${orderName}`);

  await oe.clickSubmit();
  await oe.dismissSaveDialogs();
  // The "Save Order — printed to COMPROOM" receipt is modal when it appears,
  // but it does not always appear — poll for EITHER the receipt (dismiss it)
  // or the order going Active, and exit as soon as one shows (fbch34
  // 2026-09-16: a blind 60s wait here stalled every run for a minute).
  const deadline = Date.now() + COMPLETION_TIMEOUT_MS;
  let receiptShown = false;
  while (Date.now() < deadline) {
    if (await oe.hasActiveOrder(orderName)) {
      ctx.log.info(`submit-order: ${orderName} is Active`);
      return;
    }
    if (await oe.dismissReceiptIfShown()) {
      receiptShown = true;
      break;
    }
    await ctx.page.waitForTimeout(500);
  }
  if (receiptShown) {
    // one more sweep in case follow-up windows surfaced after the receipt
    await oe.dismissSaveDialogs();
  }
}
