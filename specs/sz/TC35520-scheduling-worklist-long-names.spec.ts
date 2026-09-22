// specs/sz/TC35520-scheduling-worklist-long-names.spec.ts — TC35520
// (SZ35520 [Scheduling] display issues where patient name and procedure are
// not legible on the Scheduling Worklist detail drawer): long patient names
// and a 184-char procedure name must be truncated with an ellipsis in the
// drawer, with the full content available via tooltip.
//
// DB PREP (run before this spec, fbch34):
//   mysql -ucci -pcci periopfbch -e "update Procedures set procedureName =
//   'Ablation, soft tissue of inferior turbinates, unilateral or bilateral,
//   any method (eg, electrocautery, radiofrequency ablation, or tissue volume
//   reduction); intramural (ie, submucosal)' where cptCodes = 30802"
//
// TC steps:
//   1. Admit patient A (very long first/last name) with guarantor/insurance/BNR
//      + patient B (short name) as control. Deviation: the create-patient PO
//      has no middle-name field, so the middle names are not entered.
//   2. Create a Procedure Referral for A (184-char procedure 30802) and B
//      (short procedure), Service Type Procedure/Surgery.
//   3. Appointment Management → Scheduling Worklist shows both requests on
//      the Unscheduled Procedures card.
//   4. "View Details" opens the detail side drawer.
//   5. Patient A: overflowing patient/procedure names carry the ellipsis
//      truncation style and the full content in a tooltip on hover.
//   6. Patient B: drawer displays legibly (no overlap).
//
//   npx playwright test specs/sz/TC35520-scheduling-worklist-long-names.spec.ts

import { test, expect } from "../../fixtures/auth.fixture";
import { runGoal, createEhrContext } from "../../src/executor/runner";
import { SchedulingWorklistPage } from "../../page-objects/scheduling-worklist/scheduling-worklist.page";
import type { EhrContext } from "../../src/types/ehr-context";

const PROCEDURE_LONG =
  "Ablation, soft tissue of inferior turbinates, unilateral or bilateral, any method (eg, electrocautery, radiofrequency ablation, or tissue volume reduction); intramural (ie, submucosal)";

const PATIENT_A = {
  firstName: "Maximilian Alexander Bartholomew",
  middleName: "Thaddeus Ignatius Cornelius Theophilus",
  lastName: "Worthington-Huntington-Smytheington",
};
const PATIENT_B = {
  firstName: "Michael",
  middleName: "Anthony",
  lastName: "Johnson-TC35520",
};

test(
  "TC35520: Scheduling Worklist drawer truncates long patient/procedure names with ellipsis + tooltip",
  { tag: ["@SZ35520", "@scheduling-worklist"] },
  async ({ authedPage }) => {
    const ctx = createEhrContext(authedPage);
    const admission = async (lastName: string, firstName: string, middleName: string) => {
      await runGoal(authedPage, "create_encounter", {
        preset: "inpatient_acute_admit",
        params: { lastName, firstName, middleName },
      });
      const patient = (ctx.scratch as { patient?: { ssn?: string } }).patient;
      expect(patient?.ssn, "create_encounter must leave the ssn in scratch").toBeTruthy();
      return patient!.ssn!;
    };

    const ssnA: string[] = [];
    await test.step("TC 1a: admit patient A (long name) with insurance + BNR", async () => {
      ssnA.push(await admission(PATIENT_A.lastName, PATIENT_A.firstName, PATIENT_A.middleName));
    });

    const ssnB: string[] = [];
    await test.step("TC 1b: admit patient B (short name) with insurance + BNR", async () => {
      ssnB.push(await admission(PATIENT_B.lastName, PATIENT_B.firstName, PATIENT_B.middleName));
    });

    await test.step("TC 2a: procedure referral for A (184-char procedure)", async () => {
      await createReferral(ctx, { lastName: PATIENT_A.lastName, firstName: PATIENT_A.firstName, ssn: ssnA[0], procedureKeyword: "Ablation", procedureMatch: "30802" });
    });

    await test.step("TC 2b: procedure referral for B (short procedure)", async () => {
      await createReferral(ctx, { lastName: PATIENT_B.lastName, firstName: PATIENT_B.firstName, ssn: ssnB[0], procedureKeyword: "Extracapsular", procedureMatch: "cataract" });
    });

    const worklist = new SchedulingWorklistPage(authedPage, ctx.env);
    const fullNameA = `${PATIENT_A.lastName}, ${PATIENT_A.firstName}`;
    const fullNameB = `${PATIENT_B.lastName}, ${PATIENT_B.firstName}`;

    await test.step("TC 3: Scheduling Worklist — Unscheduled Procedures shows both requests", async () => {
      await worklist.open();
      await expect(worklist.cardViewDetails(fullNameA)).toBeVisible({ timeout: 30_000 });
      await expect(worklist.cardViewDetails(fullNameB)).toBeVisible({ timeout: 30_000 });
    });

    await test.step("TC 4: View Details opens the detail side drawer (patient A)", async () => {
      await worklist.openViewDetails(fullNameA);
    });

    await test.step("TC 5: long names truncated with ellipsis + full tooltip", async () => {
      const title = worklist.procedureTitle("Bilateral Ablation, soft tissue");
      await expect(title).toBeVisible();
      await test.info().attach("drawer-A-procedure-title", {
        body: await title.screenshot().catch(() => Buffer.from("n/a")),
        contentType: "image/png",
      });
      expect(await worklist.hasEllipsisStyle(title), "procedure title must use the ellipsis truncation style").toBe(true);
      expect(await worklist.isOverflowing(title), "184-char procedure name must actually overflow").toBe(true);
      const tooltips = await worklist.tooltipTexts(title);
      expect(
        tooltips.some((t) => t.includes(PROCEDURE_LONG.replace("Ablation,", "Bilateral Ablation,"))),
        `procedure tooltip must carry the full name; got: ${JSON.stringify(tooltips)}`
      ).toBe(true);

      const nameEl = worklist.patientName(PATIENT_A.lastName, PATIENT_A.firstName);
      await expect(
        nameEl,
        "drawer patient-name element must carry the full display name as tooltip content"
      ).toHaveAttribute("aria-label", new RegExp(`^${fullNameA}`));
      expect(await worklist.hasEllipsisStyle(nameEl), "patient name must use the ellipsis truncation style").toBe(true);
      // The patient-name Tooltip cannot be mouse-triggered on narrow headless
      // viewports (the header is horizontally clipped by the drawer), so the
      // tooltip content is proven via the MUI-injected aria-label (= the
      // tooltip title); the live tooltip was verified visually on fbch34
      // (interactive run, 2026-09-20).
      await test.info().attach("drawer-A-full", {
        body: await authedPage.screenshot(),
        contentType: "image/png",
      });
      await worklist.closeDrawer();
    });

    await test.step("TC 6: patient B drawer displays legibly", async () => {
      await worklist.openViewDetails(fullNameB);
      const drawerText = await worklist.drawer.innerText();
      expect(drawerText).toContain(fullNameB);
      expect(drawerText).not.toContain("Ablation, soft tissue");
      await test.info().attach("drawer-B", {
        body: await authedPage.screenshot(),
        contentType: "image/png",
      });
      await worklist.closeDrawer();
    });
  }
);

/** Reopen the patient by SSN through the create_referral goal. */
async function createReferral(
  ctx: ReturnType<typeof createEhrContext>,
  args: { lastName: string; firstName: string; ssn: string } & Record<string, string>
): Promise<void> {
  await runGoal(ctx.page, "create_referral", { params: args });
}
