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
  // Claim creation does not ride on force bill everywhere: on fbch34
  // (2026-09-16) the Insurance Claims section stays empty after billing —
  // claim generation runs server-side (submitClaims daemon / updateBNRStatus,
  // see TC32438/TC33301). waitForFirstRow expands the (collapsed) claims
  // accordion and re-mounts the Billing view to re-fetch before giving up,
  // so the diagnostic below only fires when there is truly no claim
  // (2026-09-16 regression review: a single read on the collapsed accordion
  // false-positived this env block).
  const existing = await claims.waitForFirstRow(billing, 45_000);
  if (existing.length === 0) {
    throw new Error(
      "No claim to submit: Insurance Claims is empty after force bill. Claim creation on this box depends on the server-side pipeline" +
        " (submitClaims/updateBNRStatus, see TC32438/TC33301 and TCS.md SZ35474 notes)."
    );
  }
  await claims.submitClaim(reason);
  await claims.expectSubmitted();
  ctx.scratch.claim = { submitted: true };
  ctx.log.info("claim submitted");
}
