// flows/open-bnr-detail.flow.ts — goal "open_bnr_detail": open the patient's
// Hospital BNR detail in Charge Services (read-only positioning goal used by
// specs and orchestrations that assert on BNR tabs directly).

import type { FlowDefinition } from "../src/types/flow";
import { openBnrDetailStep } from "../steps/charge/open-bnr-detail.step";

export const OpenBnrDetailFlow: FlowDefinition = {
  goal: "open_bnr_detail",
  description: "Account Lookup 打开患者（mrn 优先，否则 patientName/scratch）并进入其 Hospital BNR 详情",
  async execute(ctx, params) {
    await openBnrDetailStep(ctx, params);
  },
};
