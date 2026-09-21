// flows/registration/create-referral.flow.ts — goal "create_referral":
// open an existing (or just-created) patient's chart and create a periop
// procedure referral through the Referral sub-tab's New Referral form.

import type { FlowDefinition } from "../../src/types/flow";
import { createReferralStep } from "../../steps/registration/create-referral.step";

export const CreateReferralFlow: FlowDefinition = {
  goal: "create_referral",
  description:
    "Procedure Referral for an existing patient (by SSN): Registration search → chart → Referral → New Referral → Create",
  async execute(ctx, params) {
    await createReferralStep(ctx, params);
  },
};
