// specs/SZ35474-claim-totals.spec.ts — TC35474 (SZ35474, 2026):
// "Insurance Claims Total Charges Inflated When Void/Cancel and Replacement
// Claims Exist".
//
//   TC01 — the pinned Totals row must reflect only the active (non-Closed)
//          claim's charges, not the sum of the whole chain.
//   TC02 — all three claim rows stay displayed in the table.
//
// Chain built via UI on fbch34 (.env): claim_to_submitted → void → re-bill →
// submit. No EDI/835 import needed (the Replacement-Claim menu item needs a
// payer control number, so the "replacement" leg of the chain is the freshly
// re-billed claim).
//
//   npx playwright test specs/SZ35474-claim-totals.spec.ts

import { test, expect } from "../../fixtures/auth.fixture";
import { runGoal } from "../../src/executor/runner";
import { loadEhrEnv } from "../../src/types/ehr-context";
import { generateLastName } from "../../steps/registration/patient-data";
import { ClaimsPage } from "../../page-objects/charge/claims.page";

test(
  "SZ35474 TC01+TC02: after the void->rebill chain Totals counts only non-Closed claims (host in .env)",
  { tag: "@slow" },
  async ({ authedPage }) => {
    test.setTimeout(1_500_000); // full revenue cycle + void + server-side re-billable wait
    const lastName = generateLastName();
    // Full chain: patient → admit/BNR → charges → coding → discharge →
    // bill → claim Submitted (claim_to_submitted is self-contained).
    await runGoal(authedPage, "claim_to_submitted", {
      params: { lastName },
    });

    // Prerequisite for TC01/TC02: a claim must exist to void. On fbch34
    // (2026-09-16) force bill does NOT create the claim — the Insurance
    // Claims section stays empty and claim creation apparently relies on the
    // server-side pipeline (submitClaims daemon / updateBNRStatus, per
    // TC32438/TC33301). Fail loudly with that diagnosis when absent.
    const claims = new ClaimsPage(authedPage, loadEhrEnv());
    await expect
      .poll(async () => (await claims.readRows()).length, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);

    // Then void the submitted claim and re-bill → original/void/new chain.
    await runGoal(authedPage, "void_claim_rebill", {});

    const rows = await claims.readRows();
    const dump = rows.map((r) => `${r.status}|${r.type}|${r.charges}`).join(" ; ");

    // TC02: the chain is fully displayed — original, Void/Cancel, new claim.
    expect(rows.length, `expected 3 claim rows, got: ${dump}`).toBe(3);
    // The fixed build marks the superseded legs Closed; exactly the fresh
    // claim stays active.
    const closed = rows.filter((r) => r.status.toLowerCase() === "closed");
    const active = rows.filter((r) => r.status.toLowerCase() !== "closed");
    expect(active.length, `exactly one active claim expected: ${dump}`).toBe(1);
    expect(closed.length, `two closed legs expected: ${dump}`).toBe(2);

    // TC01: Totals = the active claim's charges only.
    const totals = await claims.readTotalsCharges();
    const sumActive = active.reduce((a, r) => a + r.charges, 0);
    expect(sumActive, `active claim charges must parse > 0: ${dump}`).toBeGreaterThan(0);
    expect(totals, `Totals (${totals}) must equal active claim charges (${sumActive}); rows: ${dump}`).toBeCloseTo(
      sumActive,
      2
    );
  }
);
