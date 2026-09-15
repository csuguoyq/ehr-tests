// specs/quick-charge.spec.ts — phase-3 acceptance, slice "quick_charge":
// a fresh admitted patient (create_encounter preset) gets Quick Charge CPT
// charges posted through Charge Services, on fbch34 (.env).
//
//   npx playwright test specs/quick-charge.spec.ts

import { test, expect } from "../fixtures/auth.fixture";
import { runGoal } from "../src/executor/runner";
import { generateLastName } from "../steps/registration/patient-data";

test(
  "goal-driven quick_charge: 新患者 → Quick Charge 96372+96374 x10 → In Process",
  { tag: "@slow" },
  async ({ authedPage }) => {
    const lastName = generateLastName();
    await runGoal(authedPage, "create_encounter", {
      preset: "inpatient_acute_admit",
      params: { lastName, levelOfCare: "Med-Surg" },
    });
    await runGoal(authedPage, "quick_charge", {
      params: { patientName: lastName, cpts: "96372,96374", qty: 10 },
    });

    // End state: the BNR transactions grid shows both posted charges.
    const grid = authedPage.getByTestId("charge-services-transactions-datagrid");
    await expect(grid.getByRole("row", { name: /96372/ })).toContainText("10");
    await expect(grid.getByRole("row", { name: /96374/ })).toContainText("10");
  }
);
