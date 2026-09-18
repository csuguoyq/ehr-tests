// flows/quick-charge.flow.ts — goal "quick_charge": open Charge Services for a
// patient (explicit patientName, or the patient created earlier in the same
// flow run), open its Hospital BNR charges, and post CPT charges via Quick
// Charge.

import type { FlowDefinition } from "../../src/types/flow";
import { openBnrDetailStep } from "../../steps/charge/open-bnr-detail.step";
import { quickChargeStep } from "../../steps/charge/quick-charge.step";

export const QuickChargeFlow: FlowDefinition = {
  goal: "quick_charge",
  description: "Charge Services -> BNR Charges -> Quick Charge posts CPT charges",
  async execute(ctx, params) {
    await openBnrDetailStep(ctx, params);
    await quickChargeStep(ctx, params);
  },
};
