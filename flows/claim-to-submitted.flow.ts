// flows/claim-to-submitted.flow.ts — goal "claim_to_submitted": the FULL
// patient revenue cycle in one orchestration (patient → encounter/admit/BNR →
// quick charges → coding → discharge order → encounter discharge → billing →
// force bill if needed → claim submit). All identity hand-off flows through
// ctx.scratch; params only customize (plan, cpts, diagnoses, reasons...).

import type { FlowDefinition } from "../src/types/flow";
import { openRegistrationStep } from "../steps/registration/registration-open.step";
import { createPatientStep } from "../steps/registration/create-patient.step";
import { addGuarantorSelfStep } from "../steps/registration/add-guarantor-self.step";
import { addInsuranceStep } from "../steps/registration/add-insurance.step";
import { createEncounterStep } from "../steps/registration/create-encounter.step";
import { admitEncounterStep } from "../steps/registration/admit-encounter.step";
import { waitForBnrStep } from "../steps/registration/wait-bnr.step";
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

    // Stage list: name -> step. Stage names are the startAt vocabulary.
    const stages: Array<[string, (c: typeof ctx, p: typeof params) => Promise<void>]> = [
      ["open_registration", openRegistrationStep],
      ["create_patient", createPatientStep],
      ["add_guarantor_self", addGuarantorSelfStep],
      // insurance:false = self-pay mode (SZ35253) — the stage is a no-op there.
      ["add_insurance", (c, p) => (p.insurance !== false ? addInsuranceStep(c, p) : Promise.resolve())],
      ["create_encounter", createEncounterStep],
      ["admit_encounter", admitEncounterStep],
      ["wait_bnr", waitForBnrStep],
      ["open_bnr_detail", openBnrDetailStep],
      ["quick_charge", quickChargeStep],
      ["coding_complete", codingCompleteStep],
      ["open_patient_chart", openPatientChartStep],
      ["discharge_order", dischargeOrderStep],
      ["open_patient_registration", openPatientRegistrationStep],
      ["discharge_encounter", dischargeEncounterStep],
      ["open_bnr_detail_2", openBnrDetailStep],
      ["start_billing", startBillingStep],
      ["force_bill", forceBillStep],
      ["submit_claim", submitClaimStep],
    ];

    let skipping = Boolean(startAt);
    // skipStages (comma list, resume only): drop stages that must NOT re-run
    // for this patient, e.g. quick_charge after a mid-chain failure already
    // posted charges.
    const skip = new Set(
      typeof params.skipStages === "string" && params.skipStages
        ? params.skipStages.split(",").map((s) => s.trim())
        : []
    );
    for (const [name, step] of stages) {
      if (skipping) {
        if (name !== startAt) continue;
        if (name === "open_patient_registration") continue; // already done by the resume entry
        skipping = false;
      }
      if (skip.has(name)) {
        ctx.log.warn(`stage ${name} skipped (skipStages)`);
        continue;
      }
      await step(ctx, params);
    }
    if (skipping) {
      throw new Error(
        `resume startAt="${startAt}" not found. Valid stages: ${stages.map(([n]) => n).join(", ")}`
      );
    }
  },
};
