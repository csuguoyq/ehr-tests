// flows/create-encounter.flow.ts — goal "create_encounter" (phase-2 scope:
// Inpatient Acute + new patient + Admit + waitForBnr): open Registration,
// create a fresh patient, create the encounter, admit it, and prove the BNR.

import type { FlowDefinition } from "../src/types/flow";
import { openRegistrationStep } from "../steps/registration/registration-open.step";
import { openPatientRegistrationStep } from "../steps/registration/open-patient-registration.step";
import { createPatientStep } from "../steps/registration/create-patient.step";
import { addGuarantorSelfStep } from "../steps/registration/add-guarantor-self.step";
import { addInsuranceStep } from "../steps/registration/add-insurance.step";
import { createEncounterStep } from "../steps/registration/create-encounter.step";
import { admitEncounterStep } from "../steps/registration/admit-encounter.step";
import { waitForBnrStep } from "../steps/registration/wait-bnr.step";

export const CreateEncounterFlow: FlowDefinition = {
  goal: "create_encounter",
  description:
    "Inpatient Acute encounter + Admit (+ wait for BNR): patientMode=new creates a new patient, existing opens one by SSN",
  async execute(ctx, params) {
    if (params.patientMode === "existing") {
      // openPatientRegistrationStep itself opens Registration (search by SSN)
      // and the patient — do NOT call openRegistrationStep first (double-nav).
      await openPatientRegistrationStep(ctx, params);
    } else {
      await openRegistrationStep(ctx, params);
      await createPatientStep(ctx, params);
      // Defaults (SZ35253 manual recording + user direction): a Person (Self)
      // guarantor AND an insurance plan — Entity "Mini Reg Guarantor" cannot
      // match insurance, and an uncovered BNR never produces claims. Pass
      // insurance: false (self-pay) when the scenario needs an uncovered BNR.
      await addGuarantorSelfStep(ctx, params);
      if (params.insurance !== false) {
        await addInsuranceStep(ctx, params);
      }
    }
    await createEncounterStep(ctx, params);
    await admitEncounterStep(ctx, params);
    if (params.waitForBnr) {
      await waitForBnrStep(ctx, params);
    }
  },
};
