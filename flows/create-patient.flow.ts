// flows/create-patient.flow.ts — goal "create_patient": from a logged-in
// portal, open Registration and create a new patient. Flows only orchestrate;
// locators live in the Page Objects, parameter defaults in the steps.

import type { FlowDefinition } from "../src/types/flow";
import { openRegistrationStep } from "../steps/registration/registration-open.step";
import { createPatientStep } from "../steps/registration/create-patient.step";

export const CreatePatientFlow: FlowDefinition = {
  goal: "create_patient",
  description: "打开 Registration 并创建一个新患者（唯一 Testbot 姓名 + 随机 SSN/DOB）",
  async execute(ctx, params) {
    await openRegistrationStep(ctx, params);
    await createPatientStep(ctx, params);
  },
};
