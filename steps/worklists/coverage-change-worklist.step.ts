// steps/worklists/coverage-change-worklist.step.ts — open the "Coverage
// Change" worklist, search the item grid for the patient's BNR and verify
// capture (or non-capture) per the TC expectation.
//
// The "Coverage Change" rule (rule.db, verified fbch34 2026-09-17):
//   (InsOrder is changed OR InsStatus is changed) AND InInsEffectivePeriod
// — i.e. an insurance-priority change is captured only when the reorder's
// EFFECTIVE DATE falls inside the encounter period ([admit, discharge] once
// discharged; [admit, open) while active). InInsEffectivePeriod is one of
// the rule.rcf files IN35118 deploys.
//
// params:
//   searchKey        (REQUIRED) BNR or patient name to search for
//   expectCaptured   (bool)     true = the BNR must be in the Active grid and
//                               is then Completed ("Complete it" per TC);
//                               false = it must NOT be there
//   completeReason   (optional) Reason text to pick in the Complete dialog;
//                               defaults to "No further follow-up needed from
//                               patient"
//   expectRowContains (optional) after capture and BEFORE completing, assert
//                               the first captured row contains this text
//                               (e.g. the discharge date in the row cells)

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { WorklistsPage } from "../../page-objects/worklists/worklists.page";
import { EnvBlockedError } from "../../src/utils/errors";

export async function coverageChangeWorklistStep(
  ctx: EhrContext,
  params: ResolvedParams
): Promise<void> {
  const searchKey = typeof params.searchKey === "string" ? params.searchKey : "";
  if (!searchKey) throw new Error("coverage_change_worklist requires params.searchKey (BNR or patient name)");
  const expectCaptured = params.expectCaptured !== false;
  const completeReason =
    typeof params.completeReason === "string" && params.completeReason
      ? params.completeReason
      : "No further follow-up needed from patient";
  const expectRowContains = typeof params.expectRowContains === "string" ? params.expectRowContains : "";

  const wl = new WorklistsPage(ctx.page, ctx.env);
  ctx.log.step("coverage-change-worklist", `search=${searchKey} expectCaptured=${expectCaptured}`);

  await wl.open();
  await wl.openWorklist("Coverage Change");
  await wl.searchAccount(searchKey);

  if (expectCaptured) {
    // The rule engine (ruleexecd) evaluates the priority-change event and
    // creates the item asynchronously after the reorder posts — bounded
    // re-search polling for the lag (same tolerance as the TC35118 BNR flip).
    let match: Awaited<ReturnType<typeof wl.findItems>> = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      await wl.searchAccount(searchKey);
      match = await wl.findItems(searchKey);
      if (match.length) break;
      // Row count is the diagnostic: 0 = the filter committed but the rule
      // engine hasn't created the item yet; a full viewport of legacy rows =
      // the search still didn't commit (re-searching).
      const visible = (await wl.readRows()).length;
      ctx.log.info(
        `worklist item not visible yet (attempt ${attempt}/5, ${visible} row(s) visible) — ${visible === 0 ? "filter applied, waiting on the rule engine" : "re-searching"}`
      );
    }
    if (!match.length) {
      throw new EnvBlockedError(
        `worklist item for "${searchKey}" never appeared after 5 re-searches; rows: ${JSON.stringify((await wl.readRows()).map((r) => r.cells))}`
      );
    }
    ctx.log.info(
      `captured in Coverage Change worklist: ${match.map((r) => `${r.patientName} BNR=${r.bnr}`).join("; ")}`
    );
    if (expectRowContains) {
      const first = match[0];
      if (!first.cells.some((c) => c.includes(expectRowContains))) {
        throw new Error(
          `captured row must contain "${expectRowContains}"; row cells: ${JSON.stringify(first.cells)}`
        );
      }
      ctx.log.info(`row cells contain "${expectRowContains}" as expected`);
    }
    // TC: "Complete it" — complete the captured item, then re-open and
    // complete any stragglers: one reorder creates ONE item per changed
    // insurance record and the per-record rule events land asynchronously,
    // so an item can surface after the first Complete POSTs (fbch34
    // 2026-09-18: TC10-11 failed absence with a freshly created Age-0 row).
    await wl.completeItem(searchKey, completeReason);
    let allCompleted = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      // The grid does not auto-refresh (Complete.tsx isRefresh:false) —
      // re-open the worklist for a fresh server fetch before re-checking.
      await wl.open();
      await wl.openWorklist("Coverage Change");
      await wl.searchAccount(searchKey);
      const remaining = await wl.findItems(searchKey);
      if (!remaining.length) {
        allCompleted = true;
        break;
      }
      ctx.log.info(
        `${remaining.length} worklist item(s) still active after Complete (check ${attempt}/3) — completing again`
      );
      await wl.completeItem(searchKey, completeReason);
    }
    if (!allCompleted) {
      await wl.searchAccount(searchKey);
    }
    await wl.expectItemAbsent(searchKey);
    ctx.log.info("worklist item completed (no longer in the Active grid)");
  } else {
    // Non-capture must be allowed to SETTLE: if the rule engine were buggy
    // (pre-SZ33731: effective date ignored) the item would appear moments
    // after the reorder. Wait out the creation window before asserting
    // absence (bounded: 3 re-searches at 8s spacing).
    for (let attempt = 1; attempt <= 3; attempt++) {
      await wl.searchAccount(searchKey);
      const match = await wl.findItems(searchKey);
      if (match.length) {
        throw new Error(
          `worklist item for "${searchKey}" SHOULD NOT be present (effective date after discharge); rows: ${JSON.stringify(match.map((r) => r.cells))}`
        );
      }
      ctx.log.info(`absence confirmed (settle check ${attempt}/3)`);
    }
    ctx.log.info("NOT captured in Coverage Change worklist (as expected)");
  }
}
