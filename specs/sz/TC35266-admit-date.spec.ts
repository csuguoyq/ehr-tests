// specs/sz/TC35266-admit-date.spec.ts — TC35266 (SZ35266, bug fixed & checked in
// 2026-08-10): a patient admitted from a PLANNED encounter must show the admit
// date in Patient Control's census ADMIT DATE column. This spec is the first
// "execute an existing TC" pilot: test.step names map 1:1 to the TC steps, so
// the HTML report reads as the TC run record.
//
// TC steps (SZ35266):
//   1. Select a patient from Registration
//   2. Select Encounters → Create New Encounter
//   3. Location + Inpatient type, status Planned
//   4. Complete required fields → Create Encounter
//   5. Admit button → required fields incl. unit/bed → Admit
//   6. Patient Control → the unit where the patient was admitted
//   7-8. Find the patient's row → ADMIT DATE column shows the admit date
//
//   npx playwright test specs/SZ35266-admit-date.spec.ts

import { test, expect } from "../../fixtures/auth.fixture";
import { runGoal, createEhrContext } from "../../src/executor/runner";
import { PatientControlPage } from "../../page-objects/patient-control.page";
import { generateLastName, generateSsn } from "../../steps/registration/patient-data";

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;

test(
  "TC35266: Planned encounter -> Admit -> Patient Control census shows the Admit Date",
  { tag: "@SZ35266" },
  async ({ authedPage }) => {
    const lastName = generateLastName();
    const ssn = generateSsn();
    const ctx = createEhrContext(authedPage);

    // The box may render ADMIT DATE from its own clock (different tz from this
    // machine), so accept local today or the UTC-shifted day, and report which.
    const today = fmt(new Date());
    const yesterday = fmt(new Date(Date.now() - 86_400_000));

    await test.step("TC 1-5: Registration → new patient → Planned Inpatient Acute → Admit (unit/bed)", async () => {
      await runGoal(authedPage, "create_encounter", {
        preset: "inpatient_acute_admit",
        params: { lastName, ssn, waitForBnr: false },
      });
    });

    const admitUnit = ctx.scratch.admitUnit as string | null;
    expect(admitUnit, "admit step must record which unit was picked (scratch.admitUnit)").toBeTruthy();

    const patientControl = new PatientControlPage(authedPage);
    await test.step("TC 6: Patient Control → open the admitted unit", async () => {
      await patientControl.open(ctx.env.baseUrl);
      await patientControl.openUnit(admitUnit!);
    });

    let admittedDateShown = "";
    await test.step("TC 7-8: census row of the patient shows today's ADMIT DATE", async () => {
      const row = await patientControl.findCensusRow(lastName);
      await expect(row).toBeVisible();
      test.info().attach("census-row", {
        body: await row.screenshot(),
        contentType: "image/png",
      });
      const rowText = await row.innerText();
      if (rowText.includes(today)) admittedDateShown = today;
      else if (rowText.includes(yesterday)) admittedDateShown = yesterday;
      expect(
        admittedDateShown,
        `ADMIT DATE missing on census row — expected ${today} (or box-tz ${yesterday}); row text: ${rowText}`
      ).toBeTruthy();
      await expect(row).toContainText(admittedDateShown);
    });

    ctx.log.info(`TC35266 PASS: patient=${lastName} unit=${admitUnit} admitDate=${admittedDateShown}`);
  }
);
