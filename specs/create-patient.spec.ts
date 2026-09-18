// specs/create-patient.spec.ts — phase-2 acceptance, slice "create_patient":
// the goal runs end-to-end through the executor against the live portal
// (fbch34 per .env) and a new patient tab opens.
//
//   npx playwright test specs/create-patient.spec.ts

import { test, expect } from "../fixtures/auth.fixture";
import { runGoal } from "../src/executor/runner";
import { generateLastName, generateSsn } from "../steps/registration/patient-data";

// Param-default/alias unit checks moved to scripts/check-goals.mjs section
// "goal param semantics" (Slice C4, 2026-09-18).

test("goal-driven create_patient: registration opens -> patient created -> patient tab opens", { tag: "@registration" }, async ({ authedPage }) => {
  const lastName = generateLastName();
  const ssn = generateSsn();
  const params = await runGoal(authedPage, "create_patient", {
    params: { lastName, ssn },
  });

  await expect(authedPage.getByRole("tab", { name: `${lastName}, Auto` })).toBeVisible();
  if (params.lastName !== lastName || params.ssn !== ssn) {
    throw new Error("explicit lastName/ssn params did not take effect");
  }
});
