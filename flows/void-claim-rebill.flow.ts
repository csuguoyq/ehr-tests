// flows/void-claim-rebill.flow.ts — goal "void_claim_rebill": on an already
// submitted claim, void it, then re-bill and submit a fresh claim. Produces
// the original → Void/Cancel → new claim chain that TC35474 (SZ35474) asserts
// against. Identity comes from params (mrn/patientName) or ctx.scratch.

import type { FlowDefinition } from "../src/types/flow";
import { openBnrDetailStep } from "../steps/charge/open-bnr-detail.step";
import { voidClaimStep } from "../steps/charge/void-claim.step";
import { startBillingStep } from "../steps/charge/start-billing.step";
import { forceBillStep } from "../steps/charge/force-bill.step";
import { submitClaimStep } from "../steps/charge/submit-claim.step";

export const VoidClaimRebillFlow: FlowDefinition = {
  goal: "void_claim_rebill",
  description:
    "Void the current Submitted claim -> Start Billing (Force Bill if needed) -> submit again, forming an original->void->new claim chain",
  async execute(ctx, params) {
    await openBnrDetailStep(ctx, params);
    await voidClaimStep(ctx, params);
    await startBillingStep(ctx, params);
    await forceBillStep(ctx, params);
    await submitClaimStep(ctx, params);
  },
};
