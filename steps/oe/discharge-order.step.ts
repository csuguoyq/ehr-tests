// steps/oe/discharge-order.step.ts — place the CPOE2 Discharge (ADT) order the
// Registration discharge action requires. The rail's ORDER ENTRY button is
// only present with a patient chart open (see open-patient-chart step).
//
// Owns the business chain (framework review 2026-09-17, H1): the PO provides
// atomic actions only — the "Add disabled -> pick a provider" decision and
// the "first candidate" convention live here.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { OrderEntryPage } from "../../page-objects/oe/order-entry.page";
import { str } from "../../src/utils/params";
import { submitOrderStep } from "./submit-order.step";


export async function dischargeOrderStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const disposition = str(params.dischargeDisposition, "Home or self-care");
  // Authorizing Provider is NOT fixed (user convention 2026-09-16): the step
  // picks the FIRST candidate from the choice list. providerQuery is only a
  // fallback search string for boxes whose list needs a typed query.
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
  await oe.openBrowseOrders();
  await oe.clickNonMedsChipIfPresent();
  await oe.selectCategory("ADT");
  await oe.tickOrderRow("Discharge");
  // Business decision: the Pre-Add panel has a required "Authorizing
  // Provider" field; for some logins it is NOT pre-filled and Add stays
  // disabled until one is picked.
  if (!(await oe.isAddEnabled())) {
    await oe.revealProviderOptions(providerQuery);
    await oe.pickFirstOption();
  }
  await oe.clickAdd();
  await oe.openOrderDetails("Discharge");
  await oe.setDetailsDisposition(disposition);
  await oe.confirmDetailsDone();
  await submitOrderStep(ctx, "Discharge");
  await oe.expectOrderActive("Discharge");
  ctx.log.info("CPOE2 discharge order is Active");
}
