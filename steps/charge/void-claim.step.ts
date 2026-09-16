// steps/charge/void-claim.step.ts — on the open BNR Billing view, void the
// Submitted claim (kebab → Void Claim → confirm). SZ35474 chain step 1.

import { expect } from "@playwright/test";
import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { BillingPage } from "../../page-objects/charge/billing.page";
import { ClaimsPage } from "../../page-objects/charge/claims.page";

export async function voidClaimStep(ctx: EhrContext, _params: ResolvedParams): Promise<void> {
  const billing = new BillingPage(ctx.page, ctx.env);
  const claims = new ClaimsPage(ctx.page, ctx.env);
  ctx.log.step("void-claim", "Billing tab → claim row kebab → Void Claim");

  await billing.openOverview();

  // Void the Submitted (original) claim row — a fresh BNR has exactly one.
  const row = claims.claimRows.filter({ hasText: "Submitted" }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await claims.rowAction(row, "Void Claim");

  // The void posts a chained Void/Cancel claim; the list refreshes async.
  await expect
    .poll(async () => (await claims.readRows()).length, { timeout: 30_000 })
    .toBeGreaterThan(1);
  ctx.scratch.claim = { voided: true };
  ctx.log.info("claim voided (Void/Cancel row appeared)");
}
