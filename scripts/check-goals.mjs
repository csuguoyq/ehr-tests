// scripts/check-goals.mjs — CI sanity: goals.yaml loads and every goal key is
// matchable (used by .gitlab-ci.yml; runs from the compiled .build-drv).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loadGoals } = require("../.build-drv/src/executor/runner.js");
// Point at the ROOT goals.yaml — the .build-drv copy is a runtime-synced
// artifact (tsc does not copy yaml) and does not exist in a clean CI checkout.
const goalsPath = new URL("../goals.yaml", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { matchGoal } = require("../.build-drv/src/executor/goal-matcher.js");

const goals = loadGoals(goalsPath);
console.log("goals loaded:", Object.keys(goals).length);
for (const name of Object.keys(goals)) {
  const m = matchGoal(name, goals);
  if (!m || m.goal.name !== name) throw new Error(`goal not matchable: ${name}`);
}
console.log("goal registry OK");
