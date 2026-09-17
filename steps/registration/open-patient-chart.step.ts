// steps/registration/open-patient-chart.step.ts — open an existing patient's
// chart from Patient Control (the Cps census). Required before Order Entry:
// the portal rail only exposes ORDER ENTRY once a patient chart is open.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientControlPage } from "../../page-objects/patient-control.page";

export async function openPatientChartStep(
  ctx: EhrContext,
  params: ResolvedParams
): Promise<void> {
  const name =
    (typeof params.lastName === "string" && params.lastName) ||
    ctx.scratch.patient?.lastName;
  if (!name) throw new Error("open_patient_chart requires lastName (patient last name)");

  const census = new PatientControlPage(ctx.page);
  ctx.log.step("open-patient-chart", `patient=${name}`);
  await census.open(ctx.env.baseUrl);
  await census.search(name);
  await census.openChart(name);
}
