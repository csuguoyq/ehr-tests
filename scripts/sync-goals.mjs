// scripts/sync-goals.mjs — copy the goals yaml source (goals/ dir split, or
// goals.yaml fallback) into .build-drv next to the compiled runner. tsc does
// not copy non-TS assets; the loader resolves them relative to its __dirname.
// (drive-ml.js re-syncs before every run; this keeps check-goals/CI working
// straight after `npm run build:drv`.)
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bdrv = join(root, ".build-drv");
if (!existsSync(join(bdrv, "src", "executor", "runner.js"))) {
  console.error("sync-goals: .build-drv not built — run tsc first");
  process.exit(1);
}

function syncFile(src, name) {
  copyFileSync(src, join(bdrv, name));
}

const goalsDir = join(root, "goals");
if (existsSync(goalsDir)) {
  const dst = join(bdrv, "goals");
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(goalsDir)) {
    if (f.endsWith(".yaml") || f.endsWith(".yml")) copyFileSync(join(goalsDir, f), join(dst, f));
  }
} else if (existsSync(join(root, "goals.yaml"))) {
  syncFile(join(root, "goals.yaml"), "goals.yaml");
}
console.log("sync-goals: goals source synced into .build-drv");
