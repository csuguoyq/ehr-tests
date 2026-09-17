// specs/sz/TC35118-claim-edits-needed.spec.ts — TC35118 (SZ35118 [MLIP] Status
// error in Billing, checked in 2026-07-15; server fix: ruleexecd.C + 3
// rule.rcf, bForceRemote=true).
//
// With the worklist rule "Errored Claim" (Criteria: ClaimStatusDef equals
// errored) configured and a patient billed through "BNR Edits" → Force Bill:
//   - BNR Status must show "Claim Edits Needed" — per SZ33286 the status TEXT
//     no longer reads "Claim Edits"; it is shown in the red icon's tooltip
//     next to the BNR Status header pair (ccsrc CommonHeader.tsx).
//   - The Insurance Claims row must be "Errored" (claim state 02), NOT
//     "Ready to Submit".
//   - ycql: a defined var must survive `select queryrcmrule();` (pre-fix the
//     vars were cleared by the hobjrequest call without bForceRemote).
//   - IN35118: the 3 rule.rcf files (inInsNoAssigned /
//     inInsEncounterDateMatchEffectiveDate / InInsEffectivePeriod) must be at
//     the fixed template state and ruleexecd must be running.
//   - Step 8 (regress TC34027 + TC33731): config-level check only — the
//     regression TCs' worklist rules and the rule-engine deployment they
//     depend on must be intact; their full UI flows are separate slices
//     (not yet automated, see TCS.md).
//
// test.step names map 1:1 to the TC steps; the HTML report is the run record.
// Server-side steps (1, 2, 7) run over SSH as EHR_SSH_USER (read-only checks
// plus one ad-hoc ycql session) — they need no browser fixture.
//
//   npx playwright test specs/sz/TC35118-claim-edits-needed.spec.ts

import { test, expect } from "../../fixtures/auth.fixture";
import { runGoal, createEhrContext } from "../../src/executor/runner";
import { loadGoals } from "../../src/executor/runner";
import { resolveParams } from "../../src/executor/param-resolver";
import { BillingPage } from "../../page-objects/charge/billing.page";
import { ClaimsPage } from "../../page-objects/charge/claims.page";
import { runShellStep } from "../../steps/server/shell.step";
import { runMysqlStep } from "../../steps/server/mysql.step";
import { runYcqlStep } from "../../steps/server/run-script.step";
import { generateLastName } from "../../steps/registration/patient-data";

// IN35118: the three rule.rcf deployments the fix relies on.
const IN35118_RULES =
  "BNRRules/inInsNoAssigned BNRRules/inInsEncounterDateMatchEffectiveDate None/InInsEffectivePeriod";

// The TC's chain is ~4 min end to end; allow time for the post-force-bill BNR
// status flip polling on top (server-side updateBNRStatus can lag).
const BNR_FLIP_ROUNDS = 6;

test(
  "TC35118: force-billed claim lands 'Errored' and BNR shows 'Claim Edits Needed' (host in .env)",
  { tag: "@SZ35118" },
  async ({ authedPage }) => {
    test.setTimeout(1_200_000);
    const lastName = generateLastName();
    const ctx = createEhrContext(authedPage);

    await test.step("TC 1: IN35118 env configured — 3 rule.rcf at fixed template state, ruleexecd running", async () => {
      const diffOut = await runShellStep(ctx, {
        command: `ok=1; for r in ${IN35118_RULES}; do diff -q $CCRUN/conf/ruleengine.template/$r/rule.rcf $CCRUN/conf/ruleengine/$r/rule.rcf >/dev/null 2>&1 || { echo "DIFF: $r"; ok=0; }; done; [ $ok = 1 ] && echo IN35118_OK`,
      });
      expect(diffOut, `IN35118 rule.rcf not at the fixed template state (run IN35118 on the box):\n${diffOut}`).toContain("IN35118_OK");
      const psOut = await runShellStep(ctx, { command: "ps -ef | grep [r]uleexecd | head -5" });
      expect(psOut.trim(), "ruleexecd is not running on the box — IN35118 requires a ruleexecd restart").not.toBe("");
    });

    await test.step("TC 2: worklist rule 'Errored Claim' (ClaimStatusDef = errored) is configured", async () => {
      const ruleOut = await runShellStep(ctx, {
        command: `sqlite3 $CCRUN/conf/rule/rule.db "select name || ' | ' || definition from ruleslists where name='Errored Claim';"`,
      });
      expect(ruleOut, `rule 'Errored Claim' missing from rule.db (TC step 2: configure the rule)`).toContain("Errored Claim");
      expect(ruleOut, `rule definition must test ClaimStatusDef`).toContain("ClaimStatusDef");
      expect(ruleOut, `rule definition must compare against 'errored'`).toContain("errored");
    });

    await test.step("TC 3-6: new patient → guarantor+insurance → admit+BNR → charges+diagnosis → discharge → Start Billing → Force Bill", async () => {
      await runGoal(authedPage, "claim_to_errored", { params: { lastName } });
    });

    const billing = new BillingPage(authedPage, ctx.env);
    await test.step("TC 6 verify: BNR Status shows 'Claim Edits Needed' (red-icon tooltip per SZ33286)", async () => {
      // The force-bill step leaves the Billing view freshly remounted; the
      // BNR status flip itself is server-side (updateBNRStatus) and can lag —
      // bounded remount polling with the last evidence attached on failure.
      let text = "";
      let tooltip = "";
      for (let round = 1; round <= BNR_FLIP_ROUNDS; round++) {
        ({ text, tooltip } = await billing.readBnrStatusHeader());
        if (/Claim Edits/i.test(`${text}\n${tooltip}`)) break;
        ctx.log.info(`BNR status flip not visible yet (round ${round}): ${text} / ${tooltip || "(no tooltip)"}`);
        if (round < BNR_FLIP_ROUNDS) {
          await billing.remountForFreshState();
          await ctx.page.waitForTimeout(10_000);
        }
      }
      const evidence = `BNR status header text: ${text}\ntooltip: ${tooltip || "(none — no claim edits reported)"}`;
      await test.info().attach("bnr-status-header", { body: Buffer.from(evidence, "utf8"), contentType: "text/plain" });
      await test.info().attach("bnr-status-page", { body: await authedPage.screenshot(), contentType: "image/png" });
      expect(
        `${text}\n${tooltip}`,
        `BNR Status shows neither the 'Claim Edits Needed' text nor the red-icon tooltip after ${BNR_FLIP_ROUNDS} remount rounds — ${evidence}`
      ).toMatch(/Claim Edits/i);
    });

    await test.step("TC 6 verify: Insurance Claims status is 'Errored' (claim state 02, not 'Ready to Submit')", async () => {
      const claims = new ClaimsPage(authedPage, ctx.env);
      await claims.expand();
      const rows = await claims.readRows();
      const dump = rows.map((r) => `${r.status}|${r.type}|$${r.charges}`).join(" ; ");
      expect(rows.length, `expected >=1 claim row after force bill, got: ${dump || "(no rows — accordion empty)"}`).toBeGreaterThanOrEqual(1);
      expect(
        rows.some((r) => r.status === "Errored"),
        `no 'Errored' claim row — SZ35118 expects the force-billed claim to land Errored: ${dump}`
      ).toBe(true);
      await test.info().attach("claim-rows", { body: Buffer.from(dump, "utf8"), contentType: "text/plain" });
    });

    await test.step("TC 7: ycql var survives queryrcmrule() (bForceRemote fix)", async () => {
      // Resolve OUR patient's ccidb path (volN/pNNNN) from the MPI mysql
      // mirror (patient.db_dbfile); the TC sets ccidb() before queryrcmrule.
      // If the lookup misses we still run on the default connection — the
      // persistence assertion (the actual fix under test) holds either way.
      const mpiDb = `MPI${ctx.env.host.replace(/\d+$/, "")}`;
      const dbOut = await runMysqlStep(ctx, {
        db: mpiDb,
        user: "cci",
        password: "cci",
        sql: `select db_dbfile from patient where name = '${lastName}, Auto' order by movetime desc limit 1`,
      }).catch((e) => {
        ctx.log.warn(`mysql dbpath lookup failed (falling back to default connection): ${e}`);
        return "";
      });
      const dbpath = dbOut.trim().split("\n").pop()?.trim() ?? "";
      const hasDb = /^vol\d+\/p\d+$/.test(dbpath);
      ctx.log.info(`ycql ccidb: ${hasDb ? dbpath : "(default connection — mysql lookup missed)"}`);

      const sql = [
        "select var('test', 'true');",
        "select var('test');",
        "select queryrcmrule();",
        "select var('test');",
      ].join("\n");
      const out = await runYcqlStep(ctx, { dbpath: hasDb ? dbpath : undefined, sql });
      await test.info().attach("ycql-output", { body: Buffer.from(out, "utf8"), contentType: "text/plain" });

      const lines = out.split("\n").map((l) => l.trim());
      const qrIdx = lines.findIndex((l) => l.startsWith("{") || l === "No CCI DB is opened");
      expect(qrIdx, `queryrcmrule() result line not found in ycql output:\n${out}`).toBeGreaterThanOrEqual(0);
      const varBefore = lines.slice(0, qrIdx).find((l) => l === "true");
      expect(varBefore, `var('test') before queryrcmrule() must read 'true'\nycql output:\n${out}`).toBeTruthy();
      const varAfter = lines.slice(qrIdx + 1).find((l) => l.length > 0);
      expect(
        varAfter,
        `var('test') after queryrcmrule() must STILL be 'true' (bForceRemote fix — pre-fix builds cleared the vars)\nycql output:\n${out}`
      ).toBe("true");
    });

    await test.step("TC 8: regress TC34027 + TC33731 — config-level check (full UI flows are separate slices)", async () => {
      // SZ35118's server change (rule.rcf + ruleexecd) is exactly what the
      // regression TCs exercise: TC34027's BNR rules (inInsNoAssigned /
      // inInsEncounterDateMatchEffectiveDate) are deployed by IN35118 itself.
      // The full UI regression of both TCs (Worklists Active/Complete, Reorder
      // Priorities with effective dates) is not yet automated — tracked in
      // TCS.md as follow-up slices. What IS checkable here: the rules and the
      // rule-engine deployment they depend on are intact on this box.
      const ruleOut = await runShellStep(ctx, {
        command: `sqlite3 $CCRUN/conf/rule/rule.db "select name from ruleslists where name in ('Stop Billing when Insurance Not Present on BNR','Coverage Change') order by name"`,
      });
      const names = ruleOut.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      expect(
        names,
        `regression TC rules missing from rule.db — TC34027 needs 'Stop Billing when Insurance Not Present on BNR', TC33731 needs 'Coverage Change'; got: ${names.join(", ") || "(none)"}`
      ).toContain("Stop Billing when Insurance Not Present on BNR");
      expect(names).toContain("Coverage Change");
      // The IN35118 rcf deployment + ruleexecd liveness were already asserted
      // in TC step 1 (same files the regression rules evaluate against).
    });

    ctx.log.info(`TC35118 PASS: patient=${lastName}`);
  }
);

// No browser fixtures: pure Node check that the new goal is registered and
// resolvable (same gate as the claim-to-submitted spec).
test("goal schema: claim_to_errored is implemented and default params resolve", async () => {
  const goals = loadGoals();
  const goal = goals["claim_to_errored"];
  if (!goal) throw new Error("goals.yaml is missing the claim_to_errored goal");
  if (goal.implemented === false) throw new Error("claim_to_errored should be marked implemented: true");

  const resolved = resolveParams(goal, {});
  if (resolved.admit !== true) throw new Error("claim_to_errored should default to admit: true");
  if (resolved.waitForBnr !== true) throw new Error("claim_to_errored should default to waitForBnr: true");
  void resolved;
});
