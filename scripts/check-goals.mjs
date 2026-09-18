// scripts/check-goals.mjs — CI consistency gate (used by .gitlab-ci.yml;
// runs after build:drv from the compiled .build-drv).
//
// Checks:
//   1. goals.yaml loads and every goal key is matchable
//   2. implemented: true goals <-> flows/index.ts FLOWS registry (both ways)
//   3. every implemented goal has a GOALS.md table row; every goal name in
//      GOALS.md's first column exists in goals.yaml (catches ghost rows)
//   4. every `runGoal(page, "<name>")` string literal in specs/ refers to an
//      existing goal
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { loadGoals } = require(path.join(root, ".build-drv/src/executor/runner.js"));
const { matchGoal } = require(path.join(root, ".build-drv/src/executor/goal-matcher.js"));

// Point at the ROOT goals source (goals/ dir split, or goals.yaml fallback) —
// the .build-drv copies are runtime-synced artifacts (tsc does not copy yaml)
// and do not exist in a clean CI checkout.
const goalsPath = statSync(path.join(root, "goals")).isDirectory()
  ? path.join(root, "goals")
  : path.join(root, "goals.yaml");
const goals = loadGoals(goalsPath);
console.log("goals loaded:", Object.keys(goals).length);
for (const name of Object.keys(goals)) {
  const m = matchGoal(name, goals);
  if (!m || m.goal.name !== name) throw new Error(`goal not matchable: ${name}`);
}
console.log("goal registry OK");

// 2. implemented goals <-> FLOWS registry (bidirectional)
const { FLOWS } = require(path.join(root, ".build-drv/flows/index.js"));
const implemented = Object.keys(goals).filter((k) => goals[k].implemented);
const registered = Object.keys(FLOWS);
for (const k of implemented) {
  if (!registered.includes(k)) throw new Error(`goal "${k}" is implemented: true but not registered in flows/index.ts FLOWS`);
  if (FLOWS[k].goal !== k) {
    throw new Error(`goal "${k}" declares flow "${goals[k].flow}" but FLOWS registers it for goal "${FLOWS[k].goal}"`);
  }
}
for (const k of registered) {
  if (!implemented.includes(k)) {
    throw new Error(`FLOWS registers "${k}" but goals.yaml does not mark it implemented: true (missing goal key or implemented: false)`);
  }
}
console.log(`FLOWS registry OK (${registered.length} flows, ${implemented.length} implemented goals)`);

// 3. GOALS.md table rows <-> goals.yaml (first table column only, to avoid
// false positives from free text in other cells)
const goalsMd = readFileSync(path.join(root, "GOALS.md"), "utf8");
const mdGoalNames = new Set();
for (const line of goalsMd.split(/\r?\n/)) {
  if (!line.startsWith("|")) continue;
  const first = line.split("|")[1]?.trim();
  if (first && /^[a-z][a-z0-9_]*$/.test(first) && first !== "goal") mdGoalNames.add(first);
}
for (const k of implemented) {
  if (!mdGoalNames.has(k)) throw new Error(`implemented goal "${k}" has no row in GOALS.md (iron rule 6)`);
}
for (const k of mdGoalNames) {
  if (!goals[k]) throw new Error(`GOALS.md ghost row "${k}": no such goal in goals.yaml`);
}
console.log(`GOALS.md OK (${mdGoalNames.size} rows)`);

// 4. runGoal string literals in specs/ refer to existing goals
function* walkSpecs(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkSpecs(p);
    else if (e.name.endsWith(".spec.ts")) yield p;
  }
}
let refCount = 0;
for (const file of walkSpecs(path.join(root, "specs"))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/runGoal\(\s*[\w.$]+,\s*"([a-z][a-z0-9_]*)"/g)) {
    refCount++;
    if (!goals[m[1]]) {
      throw new Error(`specs/${path.relative(path.join(root, "specs"), file)}: runGoal("${m[1]}") — no such goal in goals.yaml`);
    }
  }
}
console.log(`spec runGoal refs OK (${refCount} literal refs)`);

// 5. goal param semantics — pure-Node assertions ported out of the e2e specs
// (Slice C4, 2026-09-18): param defaults/overrides and matchGoal hit/entry
// error belong to the goal registry, not to browser tests.
const { resolveParams } = require(path.join(root, ".build-drv/src/executor/param-resolver.js"));
const { loadEhrEnv } = require(path.join(root, ".build-drv/src/types/ehr-context.js"));

// matchGoal: registered phrase hits, unknown phrase fails at entry.
const byAlias = matchGoal("login", goals);
if (byAlias.goal.name !== "login") throw new Error("alias 'login' match failed");
try {
  matchGoal("totally nonexistent goal xyz", goals);
  throw new Error("unregistered goal should fail at entry");
} catch (e) {
  if (!(e instanceof Error) || !e.message.includes("Unable to match goal")) throw e;
}
console.log("matchGoal hit/entry-error OK");

// login: explicit params override env-sourced defaults.
{
  const goal = goals["login"];
  if (!goal) throw new Error("goals.yaml is missing the login goal");
  if (goal.implemented === false) throw new Error("login should be implemented");
  const username = loadEhrEnv().username;
  const resolved = resolveParams(goal, { params: { username } });
  if (resolved.username !== username) {
    throw new Error(`explicit username did not take effect: ${JSON.stringify(resolved.username)}`);
  }
}

// create_patient: implemented, alias present, no encounter-owned param.
{
  const goal = goals["create_patient"];
  if (!goal) throw new Error("goals.yaml is missing the create_patient goal");
  if (goal.implemented === false) throw new Error("create_patient should be marked implemented: true");
  const resolved = resolveParams(goal, {});
  if (resolved.patientMode !== undefined && resolved.patientMode !== "new") {
    throw new Error("create_patient must not have patientMode (belongs to create_encounter)");
  }
  if (!goal.aliases.includes("create patient")) throw new Error("create_patient is missing the 'create patient' alias");
}

// claim_to_submitted: chain defaults.
{
  const goal = goals["claim_to_submitted"];
  if (!goal) throw new Error("goals.yaml is missing the claim_to_submitted goal");
  if (goal.implemented === false) throw new Error("claim_to_submitted should be marked implemented: true");
  const resolved = resolveParams(goal, {});
  if (resolved.admit !== true) throw new Error("claim_to_submitted should default to admit: true");
  if (resolved.waitForBnr !== true) throw new Error("claim_to_submitted should default to waitForBnr: true");
}

// coverage_change (TC33731): two-plan reorder defaults.
{
  const goal = goals["coverage_change"];
  if (!goal) throw new Error("goals.yaml is missing the coverage_change goal");
  if (goal.implemented === false) throw new Error("coverage_change should be marked implemented: true");
  const resolved = resolveParams(goal, {});
  if (resolved.planId !== "68888") throw new Error("coverage_change should default planId 68888");
  if (resolved.planId2 !== "Commercial - Generic") throw new Error("coverage_change should default planId2 to the generic plan NAME (2nd plan for the reorder; 1-char plan ID '9' triggers no lookup search)");
  if (resolved.admit !== true) throw new Error("coverage_change should default to admit: true");
  if (resolved.waitForBnr !== true) throw new Error("coverage_change should default to waitForBnr: true");
}

// paramGroups: $group expansion happened at load time (Slice C3).
for (const g of ["claim_to_submitted", "claim_to_errored", "coverage_change"]) {
  const params = goals[g].params ?? {};
  if (params.$group !== undefined) throw new Error(`goal "${g}": $group was not expanded by loadGoals`);
  for (const k of ["mrn", "ssn", "startAt", "skipStages"]) {
    if (!params[k]) throw new Error(`goal "${g}": resume group key "${k}" missing after expansion`);
  }
}
console.log("goal param semantics OK");
console.log("check-goals: all consistency checks passed");
