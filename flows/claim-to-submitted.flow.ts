// flows/claim-to-submitted.flow.ts — goal "claim_to_submitted": the FULL
// patient revenue cycle in one orchestration (patient → encounter/admit/BNR →
// quick charges → coding → discharge order → encounter discharge → billing →
// force bill if needed → claim submit). The registration→BNR prefix is the
// shared encounterStages unit (§2.2); only the revenue-cycle tail lives here.
// All identity hand-off flows through ctx.scratch; params only customize.

import type { FlowDefinition } from "../src/types/flow";
import type { Stage } from "./encounter-stages";
import { encounterStages } from "./encounter-stages";
import { openBnrDetailStep } from "../steps/charge/open-bnr-detail.step";
import { quickChargeStep } from "../steps/charge/quick-charge.step";
import { codingCompleteStep } from "../steps/charge/coding-complete.step";
import { openPatientChartStep } from "../steps/registration/open-patient-chart.step";
import { dischargeOrderStep } from "../steps/oe/discharge-order.step";
import { openPatientRegistrationStep } from "../steps/registration/open-patient-registration.step";
import { dischargeEncounterStep } from "../steps/registration/discharge-encounter.step";
import { startBillingStep } from "../steps/charge/start-billing.step";
import { forceBillStep } from "../steps/charge/force-bill.step";
import { submitClaimStep } from "../steps/charge/submit-claim.step";

const claimStages: Stage[] = [
  ...encounterStages,
  { name: "open_bnr_detail", run: openBnrDetailStep },
  { name: "quick_charge", run: quickChargeStep },
  { name: "coding_complete", run: codingCompleteStep },
  { name: "open_patient_chart", run: openPatientChartStep },
  { name: "discharge_order", run: dischargeOrderStep },
  { name: "open_patient_registration", run: openPatientRegistrationStep },
  { name: "discharge_encounter", run: dischargeEncounterStep },
  { name: "open_bnr_detail_2", run: openBnrDetailStep },
  { name: "start_billing", run: startBillingStep },
  { name: "force_bill", run: forceBillStep },
  { name: "submit_claim", run: submitClaimStep },
];

export const ClaimToSubmittedFlow: FlowDefinition = {
  goal: "claim_to_submitted",
  description:
    "End to end: new patient -> Inpatient Acute admit+BNR -> Quick Charge -> Coding Complete -> discharge order -> Discharge -> Start Billing (Force Bill if needed) -> Claim Submitted",
  async execute(ctx, params) {
    // Resume mode (user instruction 2026-09-17): pass startAt=<stage name> +
    // the lastName/ssn of an ALREADY CREATED patient to re-enter the chain at
    // a failed stage instead of creating yet another patient. The patient is
    // re-opened in Registration by SSN (open_patient_registration), identity
    // is seeded into scratch, and every stage before startAt is skipped.
    const startAt = typeof params.startAt === "string" ? params.startAt : "";
    if (startAt) {
      const lastName = typeof params.lastName === "string" ? params.lastName : "";
      const ssn = typeof params.ssn === "string" ? params.ssn : "";
      const mrn = typeof params.mrn === "string" ? params.mrn : "";
      if (!lastName || (!ssn && !mrn)) {
        throw new Error(`resume startAt="${startAt}" requires lastName and (mrn preferred, or ssn) of the existing patient`);
      }
      ctx.scratch.patient = { firstName: "Auto", lastName, ssn, mrn };
      ctx.log.step("resume", `startAt=${startAt} patient=${lastName} mrn=${mrn || "-"} ssn=${ssn || "-"}`);
      await openPatientRegistrationStep(ctx, params);
    }

    let skipping = Boolean(startAt);
    // skipStages (comma list, resume only): drop stages that must NOT re-run
    // for this patient, e.g. quick_charge after a mid-chain failure already
    // posted charges.
    const skip = new Set(
      typeof params.skipStages === "string" && params.skipStages
        ? params.skipStages.split(",").map((s) => s.trim())
        : []
    );
    for (const stage of claimStages) {
      if (skipping) {
        if (stage.name !== startAt) continue;
        if (stage.name === "open_patient_registration") continue; // already done by the resume entry
        skipping = false;
      }
      if (skip.has(stage.name)) {
        ctx.log.warn(`stage ${stage.name} skipped (skipStages)`);
        continue;
      }
      // Param variation is data: stages whose `when` rejects these params
      // (e.g. add_insurance with insurance:false) are no-ops here.
      if (stage.when && !stage.when(params)) continue;
      await stage.run(ctx, params);
    }
    if (skipping) {
      throw new Error(
        `resume startAt="${startAt}" not found. Valid stages: ${claimStages.map((s) => s.name).join(", ")}`
      );
    }
  },
};
