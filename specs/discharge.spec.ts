// specs/discharge.spec.ts — "discharge" goal regression (phase-5 slice,
// verified on fbch34 2026-09-15/16): create an admitted encounter, place the
// CPOE2 discharge order, then discharge from Registration and assert the
// encounter left In Progress.
//
//   npx playwright test specs/discharge.spec.ts

import { test, expect } from "../fixtures/auth.fixture";
import { runGoal } from "../src/executor/runner";
import { generateLastName, generateSsn } from "../steps/registration/patient-data";

test(
  "goal-driven discharge: CPOE2 discharge order -> Registration Discharge Patient",
  { tag: ["@slow", "@registration"] },
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
