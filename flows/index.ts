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
import { LookupAccountFlow } from "./lookup-account.flow";
import { StartBillingFlow } from "./start-billing.flow";
import { ForceBillFlow } from "./force-bill.flow";
import { SubmitClaimFlow } from "./submit-claim.flow";
import { ClaimToSubmittedFlow } from "./claim-to-submitted.flow";

export const FLOWS: Record<string, FlowDefinition> = {
  login: LoginFlow,
  create_patient: CreatePatientFlow,
  create_encounter: CreateEncounterFlow,
  quick_charge: QuickChargeFlow,
  coding_complete: CodingCompleteFlow,
  lookup_account: LookupAccountFlow,
  start_billing: StartBillingFlow,
  force_bill: ForceBillFlow,
  submit_claim: SubmitClaimFlow,
  claim_to_submitted: ClaimToSubmittedFlow,
};
