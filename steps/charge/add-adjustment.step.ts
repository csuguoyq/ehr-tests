// steps/charge/add-adjustment.step.ts — on the open BNR detail, run
// Billing → Adjustments → Add → fill the Add Adjustment dialog → Save.
// Amount default: the current Guarantor Balance (full-balance transfer,
// SZ35253 Test 1 semantics).

import { expect } from "@playwright/test";
import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { BillingPage } from "../../page-objects/charge/billing.page";
import { AdjustmentsPage } from "../../page-objects/charge/adjustments.page";
import { str } from "../../src/utils/params";


export async function addAdjustmentStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const billing = new BillingPage(ctx.page, ctx.env);
  const adjustments = new AdjustmentsPage(ctx.page, ctx.env);
  const code = str(params.transactionCode, "0001");
  // SZ35253 manual recording: Balance Type stays **Guarantor** for the
  // patient→insurance transfer (selected explicitly, not left to default).
  const balanceType = str(params.balanceType, "Guarantor");
  const notes = str(params.notes, "Testbot automation: transfer to insurance");

  ctx.log.step("add-adjustment", `Billing tab → Add Adjustment (code ${code})`);

  await billing.open();
  // No explicit amount → transfer the whole guarantor balance (SZ35253 T1).
  let amount = typeof params.amount === "string" && params.amount ? params.amount : "";
  if (!amount) {
    const balance = await billing.readGuarantorBalance();
    amount = balance.toFixed(2);
    ctx.log.info(`amount defaulted to current guarantor balance ${amount}`);
  }

  await adjustments.openAddDialog();
  await adjustments.pickField("Transaction Code", new RegExp(`${code} \\(`));
  await adjustments.pickField("Balance Type", new RegExp(`^${balanceType}$`));
  // TRANSFER-type codes auto-fill the Amount with the full balance and lock
  // the input (fbch34 2026-09-16) — use the locked value when present.
  amount = await adjustments.resolveAmount(amount);
  await adjustments.setNotes(notes);
  await adjustments.save();

  ctx.scratch.adjustment = { code, amount, notes };
  ctx.log.info(`adjustment saved (code=${code} amount=${amount})`);
  await expect(billing.page.locator(".MuiAccordion-root", { hasText: "Adjustments" })).toBeVisible();
}
