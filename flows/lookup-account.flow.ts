// flows/lookup-account.flow.ts — goal "lookup_account": find a patient's
// billing account in Charge Services Account Lookup by MRN (or name) and
// report the result row. READ-ONLY: nothing is opened or posted; use it for
// MRN/existence checks and to resolve a patient's name from its MRN.

import type { FlowDefinition } from "../src/types/flow";
import { lookupAccountStep } from "../steps/charge/lookup-account.step";

export const LookupAccountFlow: FlowDefinition = {
  goal: "lookup_account",
  description: "Charge Services → Account Lookup：按 MRN/姓名查询账户（只读，返回患者行信息）",
  async execute(ctx, params) {
    await lookupAccountStep(ctx, params);
  },
};
