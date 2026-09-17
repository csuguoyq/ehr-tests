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

// Point at the ROOT goals.yaml — the .build-drv copy is a runtime-synced
// artifact (tsc does not copy yaml) and does not exist in a clean CI checkout.
const goalsPath = path.join(root, "goals.yaml");
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
console.log("check-goals: all consistency checks passed");
