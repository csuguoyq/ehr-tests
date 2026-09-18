// steps/registration/reorder-insurance-priorities.step.ts — Insurance
// Overview: Reorder Priorities → drag row 0 onto row 1 (primary ↔ secondary)
// → Apply → set the effective date → Confirm Reorder → success toast.
//
// Business chain lives here (framework review H1): the PO provides the
// atomic drag/apply/date/confirm actions. Requires ≥2 saved insurances
// (the DataGrid hides the drag handles with a single row).
//
// params: effectiveDate (MM/DD/YYYY, REQUIRED — the date the reorder takes
// effect from; the Coverage Change worklist rule evaluates it), fromRow /
// toRow (defaults 0 → 1).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";
import { InsurancePage } from "../../page-objects/registration/insurance.page";

export async function reorderInsurancePrioritiesStep(
  ctx: EhrContext,
  params: ResolvedParams
): Promise<void> {
  const effectiveDate = typeof params.effectiveDate === "string" ? params.effectiveDate : "";
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(effectiveDate)) {
    throw new Error(
      `reorder_insurance_priorities requires params.effectiveDate MM/DD/YYYY (got "${effectiveDate}")`
    );
  }
  const fromRow = typeof params.fromRow === "number" ? params.fromRow : 0;
  const toRow = typeof params.toRow === "number" ? params.toRow : 1;

  const tabs = new PatientTabsPage(ctx.page, ctx.env);
  const insurance = new InsurancePage(ctx.page, ctx.env);
  ctx.log.step(
    "reorder-insurance-priorities",
    `drag row ${fromRow}→${toRow}, effective ${effectiveDate}`
  );

  await tabs.openSubTab("Insurance");
  await insurance.enterReorderMode();
  await insurance.dragRowTo(fromRow, toRow);
  await insurance.applyReorder();
  await insurance.setReorderEffectiveDate(effectiveDate);
  await insurance.confirmReorder();
  await insurance.expectReorderToast();
  ctx.log.info(`insurance priorities reordered (effective ${effectiveDate})`);
}
