// drive-ml.js — natural-language goal driver.
//
// Runs ONE goal from a free-form phrase through runFromInput (the framework's
// natural-language entry point: phrase -> goals.yaml match -> Flow), in a
// single in-process chromium. This is the "just type a sentence and run it"
// command the specs' runFromInput call is built for, without the test reporter.
//
// Usage:
//   node drive-ml.js "登录"
//   node drive-ml.js "登录 EHR"
//   node drive-ml.js "创建一个 encounter" --preset inpatient_acute_admit
//   node drive-ml.js "快速收费" --param patientName=Testbot_2609141234 --param cpts=96372,96374 --param qty=10
//   node drive-ml.js "完成编码" --param patientName=Testbot_2609141234
//
// Behavior:
//   - The phrase is matched to a goals.yaml goal (exact name / alias /
//     containment / token overlap). The matched goal + how it matched is
//     printed before anything runs, so you can see what the phrase resolved to.
//   - Most goals assume an authenticated portal (the specs log in first via
//     the authedPage fixture). If the matched goal is not "login", this driver
//     logs in first on the same page — so a phrase like "快速收费" just works.
//   - --preset / --param are forwarded to the goal's param resolver
//     (priority: --param > preset > defaults). Numbers/booleans are coerced
//     so the resolver's type checks pass.
//   - A goal that is registered but not implemented (e.g. "出院") is reported
//     and exits cleanly instead of running.
//
// Prereq: npx tsc -p tsconfig.build.json     (builds the .build-drv the driver requires)
// Host/creds from .env. State which host a run used when reporting results.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, ".env") });

const HEADLESS = process.env.HEADLESS ? process.env.HEADLESS !== "0" : true;
const SLOW_MO = Number(process.env.SLOW_MO || 0);

// ---- parse argv: phrase + [--preset P] + [--param k=v ...] ----
const argv = process.argv.slice(2);
function usage(exitCode) {
  console.log(
    "usage: node drive-ml.js \"<natural-language phrase>\" [--preset <preset>] [--param k=v ...]\n" +
      "examples:\n" +
      "  node drive-ml.js \"登录\"\n" +
      "  node drive-ml.js \"创建一个 encounter\" --preset inpatient_acute_admit\n" +
      "  node drive-ml.js \"快速收费\" --param patientName=Testbot_X --param cpts=96372,96374 --param qty=10"
  );
  process.exit(exitCode);
}
if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") usage(argv.length === 0 ? 1 : 0);

const phrase = argv[0];
let preset;
const params = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--preset") {
    preset = argv[++i];
  } else if (a === "--param") {
    const kv = argv[++i];
    const eq = kv.indexOf("=");
    if (eq < 0) {
      console.error(`--param expects k=v, got "${kv}"`);
      process.exit(1);
    }
    const k = kv.slice(0, eq);
    const v = kv.slice(eq + 1);
    // Pass the raw string; the param-resolver coerces it to the schema type
    // (number / boolean / string) — coercing here would break string params
    // whose value merely looks numeric (e.g. lastName=35520, ssn, cpts).
    params[k] = v;
  } else {
    console.error(`unknown argument: "${a}"`);
    usage(1);
  }
}

// ---- logging + hard timeout ----
const HARD_MS = Number(process.env.HARD_MS || 300000);
const LOGFILE = path.join(__dirname, "drive-ml.log");
const logFd = fs.openSync(LOGFILE, "w");
const wfile = (s) => fs.writeSync(logFd, s + "\n");
const HARD = setTimeout(() => {
  wfile(`[drv] HARD TIMEOUT ${HARD_MS}ms`);
  process.exit(3);
}, HARD_MS);
const origLog = console.log.bind(console);
console.log = (...a) => {
  origLog(...a);
  wfile(a.map(String).join(" "));
};

// The compiled runner resolves goals.yaml / data relative to .build-drv, so a
// stale copy there would shadow the canonical root files. Refresh them from
// the root before requiring the runner (tsc does not copy non-TS assets).
(function syncBuildInputs() {
  const bdrv = path.join(__dirname, ".build-drv");
  if (!fs.existsSync(path.join(bdrv, "src", "executor", "runner.js"))) {
    console.error("[drv] .build-drv not built — run: npm run build:drv");
    process.exit(1);
  }
  fs.copyFileSync(path.join(__dirname, "goals.yaml"), path.join(bdrv, "goals.yaml"));
  // goals/<domain>.yaml splits (see PROJECT.md 结构与规模阈值) — sync the dir too
  const goalsDir = path.join(__dirname, "goals");
  if (fs.existsSync(goalsDir)) {
    const dst = path.join(bdrv, "goals");
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(goalsDir)) {
      if (f.endsWith(".yaml") || f.endsWith(".yml"))
        fs.copyFileSync(path.join(goalsDir, f), path.join(dst, f));
    }
  }
  const dataDst = path.join(bdrv, "data");
  fs.mkdirSync(dataDst, { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, "data"))) {
    if (f.endsWith(".json")) fs.copyFileSync(path.join(__dirname, "data", f), path.join(dataDst, f));
  }
})();

let browser = null;
(async () => {
  const { runFromInput, loadGoals } = require("./.build-drv/src/executor/runner.js");
  const { matchGoal } = require("./.build-drv/src/executor/goal-matcher.js");

  // Resolve the phrase up front so the user sees exactly what it mapped to
  // (and gets a clean "not implemented" instead of a stack trace).
  const match = matchGoal(phrase, loadGoals());
  console.log(`[drv] phrase="${phrase}"  ->  goal="${match.goal.name}"  (matchedBy=${match.matchedBy})`);
  if (match.goal.implemented === false) {
    console.log(`[drv] goal "${match.goal.name}" is registered but not implemented — nothing to run (see PROJECT.md).`);
    process.exit(0);
  }

  console.log(`[drv] launching chromium (headless=${HEADLESS}, slowMo=${SLOW_MO})`);
  browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO, timeout: 60000 });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1680, height: 1000 } });
  const page = await context.newPage();

  // Every goal except login assumes an established session; log in first.
  if (match.goal.name !== "login") {
    console.log("[drv] matched goal is not login — logging in first (same page, shared scratch)");
    await runFromInput(page, "登录");
  }

  const t0 = Date.now();
  const resolved = await runFromInput(page, phrase, { preset, params });
  console.log(`\n=== DONE in ${((Date.now() - t0) / 1000).toFixed(1)}s (host from .env) ===`);
  console.log("resolved params: " + JSON.stringify(resolved));

  await browser.close();
  clearTimeout(HARD);
  process.exit(0);
})().catch(async (e) => {
  console.error("\n[drv] FAILED:", e && e.stack ? e.stack : e);
  clearTimeout(HARD);
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
  process.exit(1);
});
