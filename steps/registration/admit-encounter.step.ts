// steps/registration/admit-encounter.step.ts — run the ADT "Admit" action on
// the encounter just created (form must be in summary mode, status Planned).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { EncounterPage } from "../../page-objects/registration/encounter.page";

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

export async function admitEncounterStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const opts = {
    pointOfOrigin: str(params.pointOfOrigin, "Home or Self Care"),
    meansOfArrival: str(params.meansOfArrival, "Self"),
    levelOfCare: str(params.levelOfCare, "Med-Surg"),
  };

  const encounter = new EncounterPage(ctx.page, ctx.env);
  ctx.log.step("admit-encounter", JSON.stringify(opts));

  await encounter.clickAdmit();
  await encounter.pickAutocomplete("admit-admitPointOfOrigin", opts.pointOfOrigin);
  await encounter.pickAutocomplete("admit-meansOfArrival", opts.meansOfArrival);
  await encounter.pickAutocomplete("admit-levelOfCare", opts.levelOfCare);
  // Unit and Room/Bed are required too (ENCOUNTER_DETAILS_FORM_CONFIGS.ADMIT);
  // their choice lists depend on the level of care, so take the first valid one.
  // The picked unit goes to scratch — TC/census flows need to know where the
  // patient was admitted (e.g. SZ35266 Patient Control ADMIT DATE check).
  ctx.scratch.admitUnit = await encounter.pickFirstAutocomplete("admit-admitUnit");
  await encounter.pickFirstAutocomplete("admit-admitRoomBed");
  await encounter.save("Admit Patient");
  await encounter.expectAdmitted();
  ctx.log.info(
    `admitted: encounterId=${await encounter.readSummary("encounterId")} ` +
      `billingNumber=${await encounter.readSummary("billingNumber")}`
  );
}
