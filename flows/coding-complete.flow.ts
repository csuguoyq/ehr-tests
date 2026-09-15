// flows/coding-complete.flow.ts — goal "coding_complete": open the patient's
// BNR in Charge Services, complete the diagnosis + ADT coding, and complete
// the coding session.

import type { FlowDefinition } from "../src/types/flow";
import { openBnrDetailStep } from "../steps/charge/open-bnr-detail.step";
import { codingCompleteStep } from "../steps/charge/coding-complete.step";

export const CodingCompleteFlow: FlowDefinition = {
  goal: "coding_complete",
  description: "Charge Services → BNR → Coding：录入 admit/principal 诊断 + ADT 出院去向 → Complete",
  async execute(ctx, params) {
    await openBnrDetailStep(ctx, params);
    await codingCompleteStep(ctx, params);
  },
};
