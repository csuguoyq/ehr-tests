// specs/coding-complete.spec.ts — phase-4 acceptance, slice "coding_complete":
// a fresh admitted patient gets admit + principal diagnoses, an ADT discharge
// disposition, and a completed coding session, on fbch34 (.env).
//
//   npx playwright test specs/coding-complete.spec.ts

import { test, expect } from "../fixtures/auth.fixture";
import { runGoal } from "../src/executor/runner";
import { generateLastName } from "../steps/registration/patient-data";

test(
  "goal-driven coding_complete: diagnoses I69.941+S94.10XD + discharge disposition -> Coding Complete",
  { tag: "@slow" },
  async ({ authedPage }) => {
    const lastName = generateLastName();
    await runGoal(authedPage, "create_encounter", {
      preset: "inpatient_acute_admit",
      params: { lastName, levelOfCare: "Med-Surg" },
    });
    await runGoal(authedPage, "coding_complete", {
      params: { patientName: lastName },
    });

    const view = authedPage.getByTestId("charge-services-coding-view");
    await expect(view).toContainText("Coding Status: Complete");
    await view.getByRole("tab", { name: "Diagnosis", exact: true }).click();
    await expect(view.getByRole("row", { name: /I69\.941/ })).toBeVisible();
    await expect(view.getByRole("row", { name: /S94\.10XD/ })).toBeVisible();
    await view.getByRole("tab", { name: "ADT", exact: true }).click();
    await expect(view).toContainText("Home or self-care");
  }
);
