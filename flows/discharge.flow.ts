// flows/discharge.flow.ts — goal "discharge": place the CPOE2 discharge order
// on an existing admitted patient, then run the Registration encounter
// Discharge action (which is gated on that order).
//
// Expects the patient to already exist (run create_encounter first, or pass
// lastName + ssn of an admitted patient).

import type { FlowDefinition } from "../src/types/flow";
import { openPatientChartStep } from "../steps/registration/open-patient-chart.step";
import { dischargeOrderStep } from "../steps/oe/discharge-order.step";
import { openPatientRegistrationStep } from "../steps/registration/open-patient-registration.step";
import { dischargeEncounterStep } from "../steps/registration/discharge-encounter.step";

export const DischargeFlow: FlowDefinition = {
  goal: "discharge",
  description: "CPOE2 discharge order (Active) -> Registration Encounters: Discharge Patient",
  async execute(ctx, params) {
    await openPatientChartStep(ctx, params);
    await dischargeOrderStep(ctx, params);
    await openPatientRegistrationStep(ctx, params);
    await dischargeEncounterStep(ctx, params);
  },
};
