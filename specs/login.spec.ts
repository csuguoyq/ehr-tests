// specs/login.spec.ts — phase-1 acceptance: the "login" goal runs end-to-end
// through the executor (matcher → resolver → flow) against the live portal.
//
//   npx playwright test specs/login.spec.ts
//   (EHR_HOST from .env or environment; state the host when reporting.)

import { test, expect } from "../fixtures/ehr.fixture";
import { runFromInput, runGoal, loadGoals } from "../src/executor/runner";

test("goal-driven login: natural language match -> param resolution -> flow execution", { tag: "@access" }, async ({ ehr }) => {
  // Natural-language entry point (runtime uses pure matching, no AI).
  await runFromInput(ehr.page, process.env.EHR_GOAL_INPUT || "login");
  await expect(ehr.page).toHaveTitle(/CliniComp/);
});

// Param-default/override and matchGoal unit checks moved to
// scripts/check-goals.mjs section "goal param semantics" (Slice C4,
// 2026-09-18) — the goal registry is not a browser concern.

test("goal matching: unregistered and unimplemented goals both fail at entry", { tag: "@access" }, async ({ ehr }) => {
  let threw = false;
  try {
    await runFromInput(ehr.page, "totally nonexistent goal xyz");
  } catch (e) {
    threw = true;
    if (!(e as Error).message.includes("Unable to match goal")) throw e;
  }
  if (!threw) throw new Error("unregistered goal should fail at entry");

  // Dynamically pick a registered goal that is not implemented yet (no test
  // edit needed as new slices land).
  const pendingGoal = Object.values(loadGoals()).find((g) => g.implemented === false);
  if (!pendingGoal?.name) return; // all registered goals are implemented — skip this branch
  let threw2 = false;
  try {
    await runGoal(ehr.page, pendingGoal.name);
  } catch (e) {
    threw2 = true;
    if (!(e as Error).message.includes("not implemented")) throw e;
  }
  if (!threw2) throw new Error("registered-but-unimplemented goal should fail at entry");
});
