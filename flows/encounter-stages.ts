// flows/encounter-stages.ts — the shared "patient → encounter → BNR" prefix
// every full-cycle goal composes (review 2026-09-17 §2.2: flows may compose
// flows/stages; the prefix must not be re-listed per flow).
//
// Parameter variation is DATA, not branching (iron rule 7): each stage owns
// an optional `when` predicate over the resolved params, so neither this
// module nor its consumers need `if` statements around step calls.

import type { EhrContext } from "../src/types/ehr-context";
import type { ResolvedParams } from "../src/types/goal";
import { openRegistrationStep } from "../steps/registration/registration-open.step";
import { openPatientRegistrationStep } from "../steps/registration/open-patient-registration.step";
import { createPatientStep } from "../steps/registration/create-patient.step";
import { addGuarantorSelfStep } from "../steps/registration/add-guarantor-self.step";
import { addInsuranceStep } from "../steps/registration/add-insurance.step";
import { createEncounterStep } from "../steps/registration/create-encounter.step";
import { admitEncounterStep } from "../steps/registration/admit-encounter.step";
import { waitForBnrStep } from "../steps/registration/wait-bnr.step";

export type StepFn = (ctx: EhrContext, params: ResolvedParams) => Promise<void>;

export interface Stage {
  /** Stage name — also the startAt/skipStages vocabulary of resumable goals. */
  name: string;
  run: StepFn;
  /** When absent the stage always runs. */
  when?: (params: ResolvedParams) => boolean;
}

const isNewPatient = (p: ResolvedParams) => p.patientMode !== "existing";

/** Registration → patient → guarantor → insurance → encounter → admit → BNR.
 *  Defaults (SZ35253 recording): new patient with a Self guarantor AND an
 *  insurance plan; pass insurance:false for an uncovered (self-pay) BNR.
 *  patientMode:"existing" skips the create-patient block and instead opens an
 *  existing patient by mrn/ssn (open_patient_registration itself opens the
 *  Registration app — no separate rail navigation). */
export const encounterStages: Stage[] = [
  { name: "open_registration", run: openRegistrationStep, when: isNewPatient },
  { name: "create_patient", run: createPatientStep, when: isNewPatient },
  { name: "add_guarantor_self", run: addGuarantorSelfStep, when: isNewPatient },
  {
    name: "add_insurance",
    run: addInsuranceStep,
    when: (p) => isNewPatient(p) && p.insurance !== false,
  },
  {
    name: "open_existing_patient",
    run: openPatientRegistrationStep,
    when: (p) => p.patientMode === "existing",
  },
  { name: "create_encounter", run: createEncounterStep },
  { name: "admit_encounter", run: admitEncounterStep },
  { name: "wait_bnr", run: waitForBnrStep, when: (p) => Boolean(p.waitForBnr) },
];

/** Run stages in order, skipping the ones whose `when` rejects the params. */
export async function runStages(
  ctx: EhrContext,
  params: ResolvedParams,
  stages: Stage[]
): Promise<void> {
  for (const stage of stages) {
    if (!stage.when || stage.when(params)) {
      await stage.run(ctx, params);
    }
  }
}
