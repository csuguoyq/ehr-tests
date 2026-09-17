// flows/index.ts — Flow registry. Only implemented goals appear here
// (rule: unimplemented modules are only registered here, no empty files upfront).
// Consistency between this registry and goals.yaml `implemented: true` is
// enforced by `npm run check:goals` (CI gate).

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
import { ClaimToErroredFlow } from "./claim-to-errored.flow";
import { VoidClaimRebillFlow } from "./void-claim-rebill.flow";
import { TransferToInsuranceFlow } from "./transfer-to-insurance.flow";
import { OpenBnrDetailFlow } from "./open-bnr-detail.flow";
import { DischargeFlow } from "./discharge.flow";

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
  claim_to_errored: ClaimToErroredFlow,
  void_claim_rebill: VoidClaimRebillFlow,
  transfer_to_insurance: TransferToInsuranceFlow,
  open_bnr_detail: OpenBnrDetailFlow,
  discharge: DischargeFlow,
};
