// flows/create-encounter.flow.ts — goal "create_encounter" (phase-2 scope:
// Inpatient Acute + new patient + Admit + waitForBnr): open Registration,
// create a fresh patient, create the encounter, admit it, and prove the BNR.
// The orchestration is fully data-driven — see encounter-stages.ts.

import type { FlowDefinition } from "../src/types/flow";
import { encounterStages, runStages } from "./encounter-stages";

export const CreateEncounterFlow: FlowDefinition = {
  goal: "create_encounter",
  description:
    "Inpatient Acute encounter + Admit (+ wait for BNR): patientMode=new creates a new patient, existing opens one by SSN",
  async execute(ctx, params) {
    await runStages(ctx, params, encounterStages);
  },
};
