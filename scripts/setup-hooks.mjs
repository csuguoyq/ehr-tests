// scripts/setup-hooks.mjs — point git at scripts/hooks so the pre-push
// consistency gate runs locally (git config core.hooksPath, project scope).
// Re-run after cloning; idempotent.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
execFileSync("git", ["config", "core.hooksPath", "scripts/hooks"], { cwd: root, stdio: "inherit" });
console.log("setup-hooks: core.hooksPath -> scripts/hooks (pre-push gate active)");
