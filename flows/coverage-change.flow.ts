// flows/coverage-change.flow.ts — goal "coverage_change" (TC33731, SZ33731):
// the setup half of the Coverage Change Worklist TC — a NEW patient with a
// Self guarantor, TWO different insurance plans (68888 + the box's generic
// plan) so the Insurance Overview has ≥2 rows to reorder (the DataGrid
// hides the drag handles with a single row), an Inpatient Acute encounter
// admitted to a BNR (the admit date is the TC's reference date for the
// reorder's effective date). The reorder + worklist verification are NOT
// part of the flow — the spec drives them per TC step.

import type { FlowDefinition } from "../src/types/flow";
import type { Stage } from "./encounter-stages";
import { encounterStages } from "./encounter-stages";
import { addInsuranceStep } from "../steps/registration/add-insurance.step";
import { openPatientRegistrationStep } from "../steps/registration/open-patient-registration.step";
import { str } from "../src/utils/params";

// Insert a second insurance stage right after add_insurance (data mapping,
// not branching: the second plan comes from params.planId2).
const INSURANCE_STAGE = "add_insurance";
const atInsurance = encounterStages.findIndex((s) => s.name === INSURANCE_STAGE);

const coverageChangeStages: Stage[] = [
  ...encounterStages.slice(0, atInsurance + 1),
  {
    name: "add_insurance_2",
    // Plan-NAME query, not plan ID "9": the lookup search is debounced with
    // MIN_NUM_PAYER_PLAN_CHARS = 3, so a 1-char plan ID triggers no search.
    run: (ctx, p) =>
      addInsuranceStep(ctx, { ...p, planId: str(p.planId2, "Commercial - Generic") }),
    when: (p) => p.patientMode !== "existing" && p.insurance !== false,
  },
  ...encounterStages.slice(atInsurance + 1),
];

export const CoverageChangeFlow: FlowDefinition = {
  goal: "coverage_change",
  description:
    "Setup for TC33731: new patient -> Self guarantor -> two insurance plans (68888 + planId2) -> Inpatient Acute admit + BNR (active encounter)",
  async execute(ctx, params) {
    // Resume mode (same contract as the full-cycle flows): startAt=<stage> +
    // lastName + (mrn | ssn) re-enters on an existing patient.
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
    for (const stage of coverageChangeStages) {
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
        `resume startAt="${startAt}" not found. Valid stages: ${coverageChangeStages.map((s) => s.name).join(", ")}`
      );
    }
  },
};
