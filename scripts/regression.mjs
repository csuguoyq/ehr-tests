// scripts/regression.mjs — run `playwright test` with its CLI args passed
// through, tee the list reporter output to
// test-results/regression-<timestamp>.log and print the log path at the end.
// Mechanizes the "regression logs must land on disk in full" lesson
// (2026-09-18 review B3): a terminal scrollback is not a run record.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "test-results");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logPath = path.join(outDir, `regression-${stamp}.log`);
const log = createWriteStream(logPath);

const args = process.argv.slice(2);
const child = spawn("npx", ["playwright", "test", "--reporter=list", ...args], {
  cwd: root,
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});

const tee = (stream, out) => {
  stream.on("data", (chunk) => {
    out.write(chunk);
    log.write(chunk);
  });
};
tee(child.stdout, process.stdout);
tee(child.stderr, process.stderr);

child.on("close", (code) => {
  log.end(() => {
    console.log(`\nregression log: ${logPath}`);
    process.exit(code ?? 1);
  });
});
