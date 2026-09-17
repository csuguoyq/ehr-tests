// specs/create-patient.spec.ts — phase-2 acceptance, slice "create_patient":
// the goal runs end-to-end through the executor against the live portal
// (fbch34 per .env) and a new patient tab opens.
//
//   npx playwright test specs/create-patient.spec.ts

import { test, expect } from "../fixtures/auth.fixture";
import { runGoal } from "../src/executor/runner";
import { loadGoals } from "../src/executor/runner";
import { resolveParams } from "../src/executor/param-resolver";
import { generateLastName, generateSsn } from "../steps/registration/patient-data";

test("goal-driven create_patient: registration opens -> patient created -> patient tab opens", async ({ authedPage }) => {
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

test("goal schema: create_patient is implemented and default params resolve", async () => {
  const goals = loadGoals();
  const goal = goals["create_patient"];
  if (!goal) throw new Error("goals.yaml is missing the create_patient goal");
  if (goal.implemented === false) throw new Error("create_patient should be marked implemented: true");

  const resolved = resolveParams(goal, {});
  if (resolved.patientMode !== undefined && resolved.patientMode !== "new") {
    throw new Error("create_patient must not have patientMode (belongs to create_encounter)");
  }
  if (!goal.aliases.includes("create patient")) throw new Error("create_patient is missing the 'create patient' alias");
  void resolved;
});
