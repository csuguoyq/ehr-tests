// steps/oe/discharge-order.step.ts — place the CPOE2 Discharge (ADT) order the
// Registration discharge action requires. The rail's ORDER ENTRY button is
// only present with a patient chart open (see open-patient-chart step).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { OrderEntryPage } from "../../page-objects/oe/order-entry.page";

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

export async function dischargeOrderStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const disposition = str(params.dischargeDisposition, "Home or self-care");
  // Authorizing Provider is NOT fixed (user convention 2026-09-16): the PO
  // opens the choice list and takes the FIRST candidate. providerQuery is
  // only a fallback search string for boxes whose list needs a typed query.
  const providerQuery =
    typeof params.providerQuery === "string" && params.providerQuery ? params.providerQuery : undefined;
  const oe = new OrderEntryPage(ctx.page, ctx.env);
  ctx.log.step("discharge-order", `disposition=${disposition} providerQuery=${providerQuery ?? "(first candidate)"}`);

  await oe.openFromRail();
  // Idempotent: an Active discharge order from a prior attempt means done.
  if (await oe.hasActiveOrder("Discharge")) {
    ctx.log.info("discharge order already Active — skipping placement");
    return;
  }
  await oe.addAdtDischargeOrder("ADT Orders", "Discharge", providerQuery);
  await oe.openOrderDetails("Discharge");
  await oe.setDetailsDisposition(disposition);
  await oe.confirmDetailsDone();
  await oe.submitOrder();
  await oe.expectOrderActive("Discharge");
  ctx.log.info("CPOE2 discharge order is Active");
}
