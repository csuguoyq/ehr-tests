// specs/create-encounter.spec.ts — phase-2 acceptance, slice
// "create_encounter": new patient → Inpatient Acute encounter → Admit →
// BNR auto-created, driven through the executor against fbch34 (.env).
// The flow ends on the Accounts (BNR) tab with the auto-created BNR row.
//
//   npx playwright test specs/create-encounter.spec.ts

import { test, expect } from "../fixtures/auth.fixture";
import { runGoal } from "../src/executor/runner";

test(
  "goal-driven create_encounter: new patient -> encounter -> admit -> BNR (preset inpatient_acute_admit)",
  { tag: "@slow" },
  async ({ authedPage }) => {
    const params = await runGoal(authedPage, "create_encounter", {
      preset: "inpatient_acute_admit",
      params: { levelOfCare: "Med-Surg" },
    });

    // preset resolved as declared
    expect(params.patientMode).toBe("new");
    expect(params.encounterType).toBe("Inpatient Acute");
    expect(params.admit).toBe(true);
    expect(params.waitForBnr).toBe(true);

    // End state: Accounts (BNR) overview shows the auto-created Hospital BNR.
    await expect(
      authedPage.getByTestId("bnr-overview-row-0-Billing-Number-BNR")
    ).toHaveText(/^\d+$/, { timeout: 30_000 });
  }
);
