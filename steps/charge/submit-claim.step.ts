// steps/charge/submit-claim.step.ts — on the open BNR Billing view, submit
// the insurance claim (direct or Force Submit with reason).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { BillingPage } from "../../page-objects/charge/billing.page";
import { ClaimsPage } from "../../page-objects/charge/claims.page";

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

export async function submitClaimStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const reason = str(params.forceReason, "Testbot automation: force submit past rule violations");
  const billing = new BillingPage(ctx.page, ctx.env);
  const claims = new ClaimsPage(ctx.page, ctx.env);
  ctx.log.step("submit-claim", `reason=${reason}`);
  await billing.openOverview();
  await claims.submitClaim(reason);
  await claims.expectSubmitted();
  ctx.scratch.claim = { submitted: true };
  ctx.log.info("claim submitted");
}
