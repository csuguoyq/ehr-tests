// flows/index.ts — Flow registry. Only implemented goals appear here
// (rule: 未实现的模块只在注册表登记，不提前建空文件).
// `discharge` (DischargeFlow) is NOT registered yet — the slice is in
// progress (see PROJECT.md 阶段 5); its steps stay in the tree for the
// follow-up round but the executor must keep rejecting the goal.

import type { FlowDefinition } from "../src/types/flow";
import { LoginFlow } from "./login.flow";
import { CreatePatientFlow } from "./create-patient.flow";
import { CreateEncounterFlow } from "./create-encounter.flow";
import { QuickChargeFlow } from "./quick-charge.flow";
import { CodingCompleteFlow } from "./coding-complete.flow";

export const FLOWS: Record<string, FlowDefinition> = {
  login: LoginFlow,
  create_patient: CreatePatientFlow,
  create_encounter: CreateEncounterFlow,
  quick_charge: QuickChargeFlow,
  coding_complete: CodingCompleteFlow,
};
