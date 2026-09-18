// flows/coding-complete.flow.ts — goal "coding_complete": open the patient's
// BNR in Charge Services, complete the diagnosis + ADT coding, and complete
// the coding session.

import type { FlowDefinition } from "../../src/types/flow";
import { openBnrDetailStep } from "../../steps/charge/open-bnr-detail.step";
import { codingCompleteStep } from "../../steps/charge/coding-complete.step";

export const CodingCompleteFlow: FlowDefinition = {
  goal: "coding_complete",
  description: "Charge Services -> BNR -> Coding: enter admit/principal diagnoses + ADT discharge disposition -> Complete",
  async execute(ctx, params) {
    await openBnrDetailStep(ctx, params);
    await codingCompleteStep(ctx, params);
  },
};
