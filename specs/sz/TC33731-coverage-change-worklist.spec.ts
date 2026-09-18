// specs/sz/TC33731-coverage-change-worklist.spec.ts — TC33731 (SZ33731
// [Worklist] Coverage Change Worklist to consider effective date of
// insurance priorities).
//
// The "Coverage Change" worklist rule (rule.db, verified on fbch34):
//   (InsOrder is changed OR InsStatus is changed) AND InInsEffectivePeriod
// i.e. an insurance-priority REORDER is captured only when the reorder's
// EFFECTIVE DATE falls inside the encounter period: [admit, open) while
// active; [admit, discharge] once discharged. InInsEffectivePeriod is one
// of the rule.rcf files IN35118 deploys (None/InInsEffectivePeriod).
//
// TC matrix (13 steps, two patients). The reorder scenarios split into
// "effective no later than the anchor" (testable with a fresh encounter) and
// "effective AFTER the anchor" (needs a past anchor — see below):
//   A: setup (admitted today) → reorder eff = admit date (today) → CAPTURED
//      + complete                                              [TESTABLE]
//   B: setup → reorder eff = AFTER admit → CAPTURED           [BLOCKED:
//      case #7, the core change of SZ33731; needs a past admit date]
//   A: discharged (discharge = today) → reorder eff = discharge date (today)
//      → CAPTURED + complete                                   [TESTABLE]
//   A: discharged → reorder eff = AFTER discharge → NOT captured
//                                                              [BLOCKED: needs
//      a past discharge date]
//
// Why the "after" scenarios are blocked with fresh data: CciDatePicker's
// default maxDate = serverToday (ReorderPrioritiesDialog passes no maxDate /
// futureDate), so the effective date can NEVER exceed box-today. "Effective
// after admit/discharge" therefore needs admit < today / discharge < today.
// But the Registration admit/discharge forms stamp serverNow() into a DISABLED
// date field (EncounterForm.tsx setFormData("admitTime", serverNow()); the
// field is disabledMask:true), so a fresh encounter cannot be backdated. The
// original tester used a pre-existing long-standing encounter (67136235) that
// already had a past admit date (TC step 2: "an admit date earlier than the
// current date"). To run the blocked scenarios, point the spec at an existing
// active encounter whose admit date is earlier than today.
//
// test.step names map 1:1 to the TC steps; the HTML report is the run
// record.
//
//   npx playwright test specs/sz/TC33731-coverage-change-worklist.spec.ts

import { test, expect } from "../../fixtures/auth.fixture";
import { runGoal, createEhrContext, loadGoals } from "../../src/executor/runner";
import { resolveParams } from "../../src/executor/param-resolver";
import { generateLastName } from "../../steps/registration/patient-data";
import { runShellStep } from "../../steps/server/shell.step";
import { openPatientChartStep } from "../../steps/registration/open-patient-chart.step";
import { dischargeOrderStep } from "../../steps/oe/discharge-order.step";
import { openPatientRegistrationStep } from "../../steps/registration/open-patient-registration.step";
import { dischargeEncounterStep } from "../../steps/registration/discharge-encounter.step";
import { reorderInsurancePrioritiesStep } from "../../steps/registration/reorder-insurance-priorities.step";
import { coverageChangeWorklistStep } from "../../steps/worklists/coverage-change-worklist.step";

interface RunPatient {
  lastName: string;
  ssn?: string;
  mrn?: string;
  bnr?: string;
}

/** Box-local date (the box renders in ctx.env.timezone), MM/DD/YYYY. */
function boxDate(tz: string, offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + offsetDays);
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${base.getUTCFullYear()}`;
}

/** Re-enter a patient's Registration tab after leaving the module. */
function patientParams(p: RunPatient): Record<string, string> {
  const out: Record<string, string> = { lastName: p.lastName };
  if (p.ssn) out.ssn = p.ssn;
  if (p.mrn) out.mrn = p.mrn;
  return out;
}

test(
  "TC33731: Coverage Change Worklist considers the effective date of insurance priorities (host in .env)",
  { tag: "@SZ33731" },
  async ({ authedPage }) => {
    test.setTimeout(1_500_000);
    const ctx = createEhrContext(authedPage);
    const today = boxDate(ctx.env.timezone, 0);
    const tomorrow = boxDate(ctx.env.timezone, 1);
    ctx.log.info(`box dates: today=${today} tomorrow=${tomorrow} (tz ${ctx.env.timezone})`);

    // Patient A carries the whole testable flow (TC step 2). (Patient B,
    // TC step 7, is only for the "effective AFTER admit" case — see the skip
    // note — so it is not set up with fresh data.)
    const patA: RunPatient = { lastName: generateLastName() + "A" };

    await test.step("TC 1: 'Coverage Change' worklist rule configured", async () => {
      const out = await runShellStep(ctx, {
        command: `sqlite3 $CCRUN/conf/rule/rule.db "select definition from ruleslists where name = 'Coverage Change'"`,
      });
      expect(out, "the 'Coverage Change' worklist rule must exist in rule.db").toContain("InInsEffectivePeriod");
      expect(out).toContain("InsOrder");
      await test.info().attach("coverage-change-rule", { body: Buffer.from(out, "utf8"), contentType: "text/plain" });
    });

    await test.step("TC 2-3 (patient A): active encounter (admit date = today) + multiple insurance policies + BNR", async () => {
      await runGoal(authedPage, "coverage_change", { params: { lastName: patA.lastName } });
      patA.ssn = ctx.scratch.patient?.ssn;
      patA.mrn = ctx.scratch.patient?.mrn;
      patA.bnr = ctx.scratch.bnrId;
      expect(patA.bnr, "setup must end on a BNR (admitted encounter)").toBeTruthy();
      ctx.log.info(`patient A: ${patA.lastName} ssn=${patA.ssn ?? "?"} bnr=${patA.bnr}`);
      await test.info().attach("patient-A", {
        body: Buffer.from(JSON.stringify(patA, null, 2), "utf8"),
        contentType: "application/json",
      });
    });

    await test.step("TC 4-5 (patient A): Reorder Priorities → drag → Apply → effective date = admit date (today)", async () => {
      await reorderInsurancePrioritiesStep(ctx, { effectiveDate: today });
    });

    await test.step("TC 6 (patient A): BNR captured in Coverage Change Worklist — Complete it", async () => {
      await coverageChangeWorklistStep(ctx, { searchKey: patA.bnr as string, expectCaptured: true });
    });

    // TC 7-8 (patient B: reorder effective date AFTER the admit date → the
    // current HBNR is captured — case #7, the core change of SZ33731) and
    // TC 12-13 (patient A: effective date AFTER the discharge date → NOT
    // captured) both need an effective date strictly AFTER the anchor date
    // while still ≤ box-today — i.e. a PAST admit/discharge date. The date
    // picker's max is box-today and the admit/discharge forms can't be
    // backdated, so a fresh encounter can't express them. They are SKIPPED
    // here (not faked) and reported as blocked; see the spec header for how
    // to run them against an existing past-admit encounter.
    ctx.log.info(
      `TC 7-8 (effective AFTER admit, case #7) and TC 12-13 (effective AFTER discharge) ` +
        `SKIPPED — they need a past admit/discharge date, but the date picker max is box-today (${today}) ` +
        `and the Registration admit/discharge forms stamp serverNow() (non-backdatable). ` +
        `Run them against an existing active encounter whose admit date is earlier than today.`
    );

    await test.step("TC 9 (patient A): discharge the encounter (discharge date = today)", async () => {
      await openPatientChartStep(ctx, { lastName: patA.lastName });
      await dischargeOrderStep(ctx, { ...patientParams(patA), dischargeDisposition: "Home or self-care" });
      await openPatientRegistrationStep(ctx, patientParams(patA));
      await dischargeEncounterStep(ctx, { dischargeDisposition: "Home or self-care" });
    });

    await test.step("TC 10-11 (patient A, discharged): reorder eff = discharge date (today) → captured, row shows discharge date = today — Complete it", async () => {
      await reorderInsurancePrioritiesStep(ctx, { effectiveDate: today });
      // The worklist step searches + completes; re-search afterwards to
      // read the row's dates BEFORE completion is not possible from the
      // step — so run the verify-with-dates inline via the PO.
      const { WorklistsPage } = await import("../../page-objects/worklists/worklists.page");
      const wl = new WorklistsPage(ctx.page, ctx.env);
      await wl.open();
      await wl.openWorklist("Coverage Change");
      await wl.searchAccount(patA.bnr as string);
      // Bounded wait for the rule engine (same tolerance as the step).
      let rows: Awaited<ReturnType<typeof wl.findItems>> = [];
      for (let attempt = 1; attempt <= 5; attempt++) {
        rows = await wl.findItems(patA.bnr as string);
        if (rows.length) break;
        ctx.log.info(`discharged-encounter item not visible yet (attempt ${attempt}/5)`);
        await wl.searchAccount(patA.bnr as string);
      }
      expect(rows.length, "discharged-encounter reorder (eff = discharge date) must be captured").toBeGreaterThanOrEqual(1);
      const row = rows[0];
      expect(
        row.cells,
        `the captured row must show the discharge date (${today}) proving the encounter was discharged today: ${JSON.stringify(row.cells)}`
      ).toContain(today);
      await test.info().attach("discharged-row", {
        body: Buffer.from(JSON.stringify(row, null, 2), "utf8"),
        contentType: "application/json",
      });
      await wl.completeItem(patA.bnr as string);
      // Completion POSTs but the grid does not auto-refresh (Complete.tsx
      // sets isRefresh:false) — re-open the worklist for a fresh server fetch.
      await wl.open();
      await wl.openWorklist("Coverage Change");
      await wl.searchAccount(patA.bnr as string);
      await wl.expectItemAbsent(patA.bnr as string);
      ctx.log.info("discharged-encounter worklist item completed");
    });

    // TC 12-13 (patient A, discharged): reorder eff = after the discharge
    // date → NOT captured. SKIPPED (see the TC 7-8 skip note above) — needs a
    // past discharge date the fresh-encounter flow can't produce.

    ctx.log.info(
      `TC33731 PARTIAL PASS (fresh-encounter subset): A=${patA.lastName}/${patA.bnr} ` +
        `eff-dates tested [admit=today, discharge=today]; TC 7-8 + TC 12-13 (effective AFTER anchor) ` +
        `skipped (need a past admit/discharge date).`
    );
  }
);

// No browser fixture: pure Node check that the new goal is registered and
// resolves (same gate as the claim-to-errored spec).
test("goal schema: coverage_change is implemented and default params resolve", async () => {
  const goals = loadGoals();
  const goal = goals["coverage_change"];
  if (!goal) throw new Error("goals.yaml is missing the coverage_change goal");
  if (goal.implemented === false) throw new Error("coverage_change should be marked implemented: true");

  const resolved = resolveParams(goal, {});
  if (resolved.planId !== "68888") throw new Error("coverage_change should default planId 68888");
  if (resolved.planId2 !== "Commercial - Generic") throw new Error("coverage_change should default planId2 to the generic plan NAME (2nd plan for the reorder; 1-char plan ID '9' triggers no lookup search)");
  if (resolved.admit !== true) throw new Error("coverage_change should default to admit: true");
  if (resolved.waitForBnr !== true) throw new Error("coverage_change should default to waitForBnr: true");
});
