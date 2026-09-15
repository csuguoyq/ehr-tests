// flows/create-encounter.flow.ts — goal "create_encounter" (phase-2 scope:
// Inpatient Acute + new patient + Admit + waitForBnr): open Registration,
// create a fresh patient, create the encounter, admit it, and prove the BNR.

import type { FlowDefinition } from "../src/types/flow";
import { openRegistrationStep } from "../steps/registration/registration-open.step";
import { openPatientRegistrationStep } from "../steps/registration/open-patient-registration.step";
import { createPatientStep } from "../steps/registration/create-patient.step";
import { createEncounterStep } from "../steps/registration/create-encounter.step";
import { admitEncounterStep } from "../steps/registration/admit-encounter.step";
import { waitForBnrStep } from "../steps/registration/wait-bnr.step";

export const CreateEncounterFlow: FlowDefinition = {
  goal: "create_encounter",
  description:
    "Inpatient Acute encounter + Admit（+ 等待 BNR）：patientMode=new 建新患者，existing 按 SSN 打开已有患者",
  async execute(ctx, params) {
    if (params.patientMode === "existing") {
      // openPatientRegistrationStep itself opens Registration (search by SSN)
      // and the patient — do NOT call openRegistrationStep first (double-nav).
      await openPatientRegistrationStep(ctx, params);
    } else {
      await openRegistrationStep(ctx, params);
      await createPatientStep(ctx, params);
    }
    await createEncounterStep(ctx, params);
    await admitEncounterStep(ctx, params);
    if (params.waitForBnr) {
      await waitForBnrStep(ctx, params);
    }
  },
};
