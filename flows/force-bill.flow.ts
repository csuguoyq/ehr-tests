// flows/force-bill.flow.ts — goal "force_bill": on the patient's BNR detail
// (open via lookup first), run Billing tab → Force Bill with a reason.

import type { FlowDefinition } from "../src/types/flow";
import { openBnrDetailStep } from "../steps/charge/open-bnr-detail.step";
import { forceBillStep } from "../steps/charge/force-bill.step";

export const ForceBillFlow: FlowDefinition = {
  goal: "force_bill",
  description: "Charge Services -> BNR Billing tab: Force Bill (BNR Edits status, reason required)",
  async execute(ctx, params) {
    await openBnrDetailStep(ctx, params);
    await forceBillStep(ctx, params);
  },
};
