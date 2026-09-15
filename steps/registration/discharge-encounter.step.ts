// steps/registration/discharge-encounter.step.ts — run the Registration
// encounter Discharge action (requires the CPOE2 discharge order to be Active).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";
import { EncounterPage } from "../../page-objects/registration/encounter.page";

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

export async function dischargeEncounterStep(
  ctx: EhrContext,
  params: ResolvedParams
): Promise<void> {
  const disposition = str(params.dischargeDisposition, "Home or self-care");

  const tabs = new PatientTabsPage(ctx.page, ctx.env);
  const encounter = new EncounterPage(ctx.page, ctx.env);
  ctx.log.step("discharge-encounter", `disposition=${disposition}`);

  await tabs.openSubTab("Encounters");
  await encounter.selectEncounterRow();
  await encounter.startDischarge();
  await encounter.setDischargeDisposition(disposition);
  await encounter.saveDischarge();
  await encounter.expectDischarged();
  ctx.log.info(`encounter discharged: ${disposition}`);
}
