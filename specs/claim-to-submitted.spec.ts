// specs/claim-to-submitted.spec.ts — the FULL patient revenue cycle as one
// goal: create patient → Self guarantor + insurance → Inpatient Acute
// admit + BNR → quick charges → coding complete → discharge order →
// encounter discharge → Start Billing (Force Bill when BNR Edits) →
// claim Submitted.
//
// Everything identity-related flows through ctx.scratch inside the flow;
// the spec only pins a lastName and proves the end state (claim Submitted)
// on top of what submitClaimStep already checks internally.
//
//   npx playwright test specs/claim-to-submitted.spec.ts

import { test, expect } from "../fixtures/auth.fixture";
import { runGoal, createEhrContext } from "../src/executor/runner";
import { loadEhrEnv } from "../src/types/ehr-context";
import { generateLastName } from "../steps/registration/patient-data";
import { ClaimsPage } from "../page-objects/charge/claims.page";

// Param-default unit checks moved to scripts/check-goals.mjs section
// "goal param semantics" (Slice C4, 2026-09-18).

test(
  "goal-driven claim_to_submitted: create patient -> billing -> claim Submitted (host in .env)",
  { tag: ["@slow", "@revenue-cycle"] },
  async ({ authedPage }) => {
    test.setTimeout(900_000); // full revenue cycle incl. the BNR wait
    const lastName = generateLastName();

    // The goal is self-contained: it ends on submitClaimStep, which throws a
    // diagnostic when the box's server-side claim pipeline (submitClaims /
    // updateBNRStatus) produced no claim after billing — that documented
    // environment block surfaces here as-is (TCS.md environment notes).
    await runGoal(authedPage, "claim_to_submitted", {
      params: { lastName },
    });

    // Step-level record: submitClaimStep must have flipped the scratch flag.
    const ctx = createEhrContext(authedPage);
    const claim = ctx.scratch.claim;
    expect(claim?.submitted, "submitClaimStep must record claim submitted").toBe(true);

    // Spec-level proof on top of the step's internal check (Submit button
    // gone): a claim row exists in the table and its status is Submitted.
    const claims = new ClaimsPage(authedPage, loadEhrEnv());
    await claims.expand();
    const rows = await claims.readRows();
    const dump = rows.map((r) => `${r.status}|${r.type}|$${r.charges}`).join(" ; ");
    expect(rows.length, `expected >=1 claim row, got: ${dump}`).toBeGreaterThanOrEqual(1);
    expect(
      rows.some((r) => r.status === "Submitted"),
      `a claim row must be Submitted: ${dump}`
    ).toBe(true);
  }
);
