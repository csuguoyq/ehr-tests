// specs/discharge.spec.ts — phase-5 slice "discharge" (IN PROGRESS).
//
// The Registration half is built (encounterDischarge gated on a CPOE2 order)
// and the CPOE2 order picker is solved down to the pre-Add "Authorizing
// Provider" field, whose lookup returns NO candidates for the freshly created
// test patients in this environment (see PROJECT.md 阶段 5). The goal is not
// registered in flows/index.ts yet, so this spec is skipped instead of red.
//
//   npx playwright test specs/discharge.spec.ts   # skipped until unblocked

import { test, expect } from "../fixtures/auth.fixture";
import { runGoal } from "../src/executor/runner";
import { generateLastName, generateSsn } from "../steps/registration/patient-data";

test.skip(
  "goal-driven discharge: CPOE2 出院医嘱 → Registration Discharge Patient",
  { tag: "@slow" },
  async ({ authedPage }) => {
    const lastName = generateLastName();
    const ssn = generateSsn();
    await runGoal(authedPage, "create_encounter", {
      preset: "inpatient_acute_admit",
      params: { lastName, ssn, levelOfCare: "Med-Surg" },
    });
    await runGoal(authedPage, "discharge", {
      params: { lastName, ssn, dischargeDisposition: "Home or self-care" },
    });

    await expect(
      authedPage.locator('[data-testid^="encounters-status-summary"]')
    ).not.toHaveText("In Progress");
  }
);
