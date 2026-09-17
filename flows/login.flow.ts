// flows/login.flow.ts — goal "login": log into the EHR portal and prove the
// session (webtoken) is established. Flows only orchestrate; the locator
// knowledge lives in the LoginPage, the parameter handling in the step.

import type { FlowDefinition } from "../src/types/flow";
import { loginStep } from "../steps/auth/login.step";

export const LoginFlow: FlowDefinition = {
  goal: "login",
  description: "Log into the EHR portal and establish a webtoken session",
  async execute(ctx, params) {
    await loginStep(ctx, params);
  },
};
