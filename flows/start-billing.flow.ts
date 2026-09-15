// flows/start-billing.flow.ts — goal "start_billing": on the patient's BNR
// detail (open via lookup first), run Billing tab → Start Billing → Bill Now.

import type { FlowDefinition } from "../src/types/flow";
import { openBnrDetailStep } from "../steps/charge/open-bnr-detail.step";
import { startBillingStep } from "../steps/charge/start-billing.step";

export const StartBillingFlow: FlowDefinition = {
  goal: "start_billing",
  description: "Charge Services → BNR Billing tab：Start Billing → Bill Now（需已出院+编码完成）",
  async execute(ctx, params) {
    await openBnrDetailStep(ctx, params);
    await startBillingStep(ctx, params);
  },
};
