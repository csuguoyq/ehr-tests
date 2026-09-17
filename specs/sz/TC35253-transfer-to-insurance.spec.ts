// specs/sz/TC35253-transfer-to-insurance.spec.ts — TC35253 (SZ35253, 2026):
// "Transaction #0001 Transfer Patient to Insurance Not Working Correctly".
//
//   Test 1 — Adjustments → Add → 0001 (Transfer Patient to Insurance) with
//            the full balance: Guarantor Balance drops to $0.
//   Test 2 — the transfer creates a new claim in Insurance Claims for the
//            (single) registered payer, amount = the transferred balance.
//
// Environment adaptation (fbch34 build): the TC assumes charges land on the
// guarantor card without a billing cycle; here that only happens through
// Start/Force Bill with NO insurance (SZ33989 behaviour), so the goal runs
// discharge → bill (self-pay, no claim) → register insurance → transfer.
// Test 3 (primary vs secondary split with two insurances) needs a second
// configured plan on the box — recorded as a known limitation, not automated.
//
//   npx playwright test specs/SZ35253-transfer-to-insurance.spec.ts

import { test, expect } from "../../fixtures/auth.fixture";
import { runGoal, createEhrContext } from "../../src/executor/runner";
import { loadEhrEnv } from "../../src/types/ehr-context";
import { generateLastName } from "../../steps/registration/patient-data";
import { BillingPage } from "../../page-objects/charge/billing.page";
import { ClaimsPage } from "../../page-objects/charge/claims.page";

test(
  "SZ35253 T1+T2: after the 0001 transfer the Guarantor Balance is zero and an insurance claim exists (host in .env)",
  { tag: "@slow" },
  async ({ authedPage }) => {
    test.setTimeout(900_000); // discharge → bill → insurance → adjustment
    const lastName = generateLastName();
    // Self-pay prerequisite (TC35253): NO insurance at creation — pass
    // insurance:false; the insurance is registered later by the transfer flow.
    await runGoal(authedPage, "create_encounter", {
      preset: "inpatient_acute_admit",
      params: { lastName, levelOfCare: "Med-Surg", insurance: false },
    });
    await runGoal(authedPage, "quick_charge", {
      params: { patientName: lastName, cpts: "96372,96374", qty: 10 },
    });

    // Full chain: bill self-pay (balance lands on the guarantor card, no
    // claim), register insurance, transfer via adjustment 0001. The step
    // reads the pre-transfer guarantor balance and records it in scratch.
    await runGoal(authedPage, "transfer_to_insurance", {});
    const adjustment = createEhrContext(authedPage).scratch.adjustment;
    const transferred = Number(adjustment?.amount ?? "0");
    expect(transferred, "prerequisite: non-zero guarantor balance transferred").toBeGreaterThan(0);

    // T1 (TC expected): the guarantor card is zeroed by the transfer.
    // 2026-09-16 fbch34 recheck: following the manual recording path (Person
    // guarantor + insurance Assigned to the BNR + 0001/Balance Type=Guarantor)
    // the transfer takes effect — guarantor zeroed, a claim created for
    // $16,640. The earlier "defect reproduction" was a missing step
    // (insurance not Assigned), see TCS.md.
    const billing = new BillingPage(authedPage, loadEhrEnv());
    await expect
      .poll(async () => billing.readGuarantorBalance(), { timeout: 30_000 })
      .toBe(0);

    // T2 (TC expected): the transfer created a claim carrying the transferred
    // amount for the registered payer.
    const claims = new ClaimsPage(authedPage, loadEhrEnv());
    await claims.expand();
    await expect
      .poll(async () => (await claims.readRows()).length, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    const rows = await claims.readRows();
    const active = rows.filter((r) => r.status.toLowerCase() !== "closed");
    const matched = active.filter((r) => Math.abs(r.charges - transferred) < 0.01);
    expect(
      matched.length,
      `an active claim with charges=${transferred} expected; rows: ${rows.map((r) => `${r.status}|${r.charges}`).join(" ; ")}`
    ).toBeGreaterThanOrEqual(1);
  }
);
