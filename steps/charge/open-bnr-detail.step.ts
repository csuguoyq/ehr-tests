// steps/charge/open-bnr-detail.step.ts — open the Charge Services app from the
// rail and reach the patient's Hospital BNR detail view (Account Summary /
// Charges / Coding / ... tabs).
// Patient identity: explicit `mrn` (searched directly, fastest/most precise),
// else explicit `patientName`, else the patient generated earlier in the same
// flow execution (ctx.scratch.patient).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { AccountLookupPage } from "../../page-objects/charge/account-lookup.page";

/** Shared patient reference for Charge Services goals. */
export function resolvePatientName(ctx: EhrContext, params: ResolvedParams): string {
  const name =
    (typeof params.patientName === "string" && params.patientName) ||
    ctx.scratch.patient?.lastName;
  if (!name) {
    throw new Error(
      "This goal requires mrn or patientName (last name), or must run in the same orchestration as create_encounter to reuse its generated patient"
    );
  }
  return name;
}

export async function openBnrDetailStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const lookup = new AccountLookupPage(ctx.page, ctx.env);
  const mrn = typeof params.mrn === "string" ? params.mrn : "";
  ctx.log.step("open-bnr-detail", mrn ? `mrn=${mrn}` : `patient=${resolvePatientName(ctx, params)}`);

  await lookup.openFromRail("Charge Services");
  if (mrn) {
    await lookup.openPatientAccountByMrn(mrn);
  } else {
    const patientName = resolvePatientName(ctx, params);
    await lookup.search(patientName);
    await lookup.openPatientAccount(patientName);
  }
  await lookup.openFirstBnrDetail();
}
