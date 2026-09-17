// flows/claim-to-errored.flow.ts — goal "claim_to_errored" (TC35118, SZ35118):
// the same full patient revenue cycle as claim_to_submitted, but it STOPS at
// the force bill — the point is the ERRORED end state, not a submitted claim:
// with the "Errored Claim" worklist rule configured, the BNR passes through
// "BNR Edits" after Start Billing, Force Bill posts, and the claim lands
// "Errored" (claim state 02) while the BNR header shows "Claim Edits Needed"
// (red-icon tooltip per SZ33286 — the status text itself no longer reads
// "Claim Edits"). No submitClaimStep: a submitted claim would destroy the
// very state the TC verifies.

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

const claimToErroredStages: Stage[] = [
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
];

export const ClaimToErroredFlow: FlowDefinition = {
  goal: "claim_to_errored",
  description:
    "End to end: new patient -> Inpatient Acute admit+BNR -> Quick Charge -> Coding Complete -> discharge order -> Discharge -> Start Billing -> Force Bill, ending on the ERRORED claim / 'Claim Edits Needed' BNR state (TC35118)",
  async execute(ctx, params) {
    // Resume mode (same contract as claim_to_submitted): startAt=<stage> +
    // lastName + (mrn | ssn) re-enters the chain at a failed stage on an
    // existing patient instead of creating another one.
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
    const skip = new Set(
      typeof params.skipStages === "string" && params.skipStages
        ? params.skipStages.split(",").map((s) => s.trim())
        : []
    );
    for (const stage of claimToErroredStages) {
      if (skipping) {
        if (stage.name !== startAt) continue;
        if (stage.name === "open_patient_registration") continue; // already done by the resume entry
        skipping = false;
      }
      if (skip.has(stage.name)) {
        ctx.log.warn(`stage ${stage.name} skipped (skipStages)`);
        continue;
      }
      if (stage.when && !stage.when(params)) continue;
      await stage.run(ctx, params);
    }
    if (skipping) {
      throw new Error(
        `resume startAt="${startAt}" not found. Valid stages: ${claimToErroredStages.map((s) => s.name).join(", ")}`
      );
    }
  },
};
