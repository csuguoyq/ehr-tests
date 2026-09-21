// flows/index.ts — Flow registry. Only implemented goals appear here
// (rule: unimplemented modules are only registered here, no empty files upfront).
// Consistency between this registry and goals.yaml `implemented: true` is
// enforced by `npm run check:goals` (CI gate).
//
// Domain layout (Slice C5, 2026-09-18; the 16-file root crossed the
// directory-size threshold): access/ | registration/ | revenue-cycle/.
// encounter-stages.ts stays at the flows root as a shared unit.

import type { FlowDefinition } from "../src/types/flow";
import { LoginFlow } from "./access/login.flow";
import { CreatePatientFlow } from "./registration/create-patient.flow";
import { CreateEncounterFlow } from "./registration/create-encounter.flow";
import { QuickChargeFlow } from "./revenue-cycle/quick-charge.flow";
import { CodingCompleteFlow } from "./revenue-cycle/coding-complete.flow";
import { LookupAccountFlow } from "./revenue-cycle/lookup-account.flow";
import { StartBillingFlow } from "./revenue-cycle/start-billing.flow";
import { ForceBillFlow } from "./revenue-cycle/force-bill.flow";
import { SubmitClaimFlow } from "./revenue-cycle/submit-claim.flow";
import { ClaimToSubmittedFlow } from "./revenue-cycle/claim-to-submitted.flow";
import { ClaimToErroredFlow } from "./revenue-cycle/claim-to-errored.flow";
import { VoidClaimRebillFlow } from "./revenue-cycle/void-claim-rebill.flow";
import { TransferToInsuranceFlow } from "./revenue-cycle/transfer-to-insurance.flow";
import { OpenBnrDetailFlow } from "./revenue-cycle/open-bnr-detail.flow";
import { DischargeFlow } from "./registration/discharge.flow";
import { CoverageChangeFlow } from "./registration/coverage-change.flow";
import { CreateReferralFlow } from "./registration/create-referral.flow";

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
  coverage_change: CoverageChangeFlow,
  create_referral: CreateReferralFlow,
};
