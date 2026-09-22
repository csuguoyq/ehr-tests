// steps/registration/create-referral.step.ts — business-atomic procedure
// referral creation: open the patient chart (by SSN), then the Referral
// sub-tab's New Referral form, fill the required fields, and create it.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { RegistrationAppPage } from "../../page-objects/registration/registration-app.page";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";
import { ReferralPage, type ProcedureReferralData } from "../../page-objects/registration/referral.page";
import { str } from "../../src/utils/params";

export async function createReferralStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const ssn =
    (typeof params.ssn === "string" && params.ssn) ||
    ctx.scratch.patient?.ssn;
  const lastName =
    (typeof params.lastName === "string" && params.lastName) ||
    ctx.scratch.patient?.lastName;
  if (!ssn || !lastName) {
    throw new Error("create_referral requires ssn and lastName (or a prior patient step in scratch)");
  }

  // Defaults verified against fbch34 choice lists (TC35520 interactive run).
  const data: ProcedureReferralData = {
    procedureKeyword: str(params.procedureKeyword, "Ablation"),
    procedureMatch: str(params.procedureMatch, "30802"),
    laterality: (str(params.laterality, "Bilateral") as ProcedureReferralData["laterality"]),
    dxKeyword: str(params.dxKeyword, "pain"),
    dxMatch: str(params.dxMatch, "T65.6X1D"),
    cptKeyword: str(params.cptKeyword, "Manual therapy"),
    cptMatch: str(params.cptMatch, "97140"),
    surgeonNpi: str(params.surgeonNpi, "3971396437"),
    serviceType: str(params.serviceType, "Procedure/Surgery"),
    facility: str(params.facility, "San Diego Medical Center"),
    clinicDept: str(params.clinicDept, "Cove Community Hospital"),
    location: str(params.location, "San Diego - Cove Community Hospital"),
    encounterType: str(params.encounterType, "Inpatient Acute"),
    requestedDatetime: str(params.requestedDatetime, ""), // resolved below
    providerNpi: str(params.providerNpi, "3971396437"),
    procedureTimeMin: str(params.procedureTimeMin, "60"),
    turnoverTimeMin: str(params.turnoverTimeMin, "15"),
    procedureReason: str(params.procedureReason, "Automated referral"),
  };
  if (!data.requestedDatetime) {
    const t = new Date(Date.now() + 86_400_000);
    const p2 = (n: number) => String(n).padStart(2, "0");
    data.requestedDatetime =
      `${p2(t.getMonth() + 1)}/${p2(t.getDate())}/${t.getFullYear()} 08:00`;
  }

  const firstName =
    (typeof params.firstName === "string" && params.firstName) ||
    ctx.scratch.patient?.firstName ||
    "Auto";
  const app = new RegistrationAppPage(ctx.page, ctx.env);
  ctx.log.step("create-referral", `patient=${lastName} procedure=${data.procedureMatch}`);
  await app.open();
  // The late duplicate check kicks the chart back to a cleared search screen
  // at unpredictable moments — retry search + open until the chart is up.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await app.searchPatient({ ssn });
      await app.openPatientResult(lastName, firstName);
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      ctx.log.warn(`search/open swallowed (attempt ${attempt}) — retrying`);
      await app.open();
    }
  }

  const tabs = new PatientTabsPage(ctx.page, ctx.env);
  await tabs.openSubTab("Referral");
  const referral = new ReferralPage(ctx.page, ctx.env);
  await referral.openNewForm();
  await referral.fillProcedureReferral(data);
  await referral.create();
  ctx.log.info(`referral created: patient=${lastName} procedure=${data.procedureMatch}`);
}
