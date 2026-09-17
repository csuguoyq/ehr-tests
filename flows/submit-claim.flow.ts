// flows/submit-claim.flow.ts — goal "submit_claim": on the patient's BNR
// (open via lookup first), Billing tab → Insurance Claims → Submit (or Force
// Submit with reason when the claim is Errored).

import type { FlowDefinition } from "../src/types/flow";
import { openBnrDetailStep } from "../steps/charge/open-bnr-detail.step";
import { submitClaimStep } from "../steps/charge/submit-claim.step";

export const SubmitClaimFlow: FlowDefinition = {
  goal: "submit_claim",
  description: "Charge Services -> BNR Billing tab: Submit / Force Submit on Insurance Claims",
  async execute(ctx, params) {
    await openBnrDetailStep(ctx, params);
    await submitClaimStep(ctx, params);
  },
};
