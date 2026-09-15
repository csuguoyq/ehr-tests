#!/usr/bin/env node
// scripts/check-selectors.mjs — audit ehr-tests selectors against the app
// source (../ehr/src). Borrowed idea from keeping ehr/tests and src in one
// repo: every data-testid a Page Object drives should trace back to the
// component that renders it.
//
// Report-only by default (exit 0). A miss does NOT mean the selector is wrong:
// the deployed webframe on a target box may be built from a different branch
// than the local ehr working tree (verified 2026-09-15 — encounters-status-
// summary drives the live fbch34 build but is absent from the local branch).
// Use --strict (exit 1 on any miss) only when the local tree is known to match
// the deployed build.
//
//   node scripts/check-selectors.mjs            # report
//   node scripts/check-selectors.mjs --strict   # gate (source must match build)
//   node scripts/check-selectors.mjs --ehr-src D:/path/to/ehr/src
//
// Skipped patterns (dynamic, can't be statically matched): getByTestId with
// template literals / variables, and testid *suffix* matchers.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, "..");
// EHR source location: this project is standalone and does not require the app
// repo. Default assumes a side-by-side clone (../ehr); override with
// --ehr-src <path> or EHR_SRC env when the layout differs.
const args = process.argv.slice(2);
const ehrSrcIdx = args.indexOf("--ehr-src");
const ehrSrc = path.resolve(
  (ehrSrcIdx >= 0 ? args[ehrSrcIdx + 1] : undefined) ||
    process.env.EHR_SRC ||
    path.join(pkgDir, "..", "ehr", "src")
);
const SCAN_DIRS = ["page-objects", "specs", "steps"];
const EXT = /\.(ts|tsx)$/;

if (!fs.existsSync(ehrSrc)) {
  console.log(`[check-selectors] EHR src not found (${ehrSrc}) — pass --ehr-src <path> or EHR_SRC to audit. Skipping.`);
  process.exit(0);
}

// ---- collect (selector, usage) pairs from the framework ----
const usages = []; // { id, prefix:boolean, file, line }
for (const dir of SCAN_DIRS) {
  const root = path.join(pkgDir, dir);
  if (!fs.existsSync(root)) continue;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (EXT.test(e.name)) scanFile(p);
    }
  };
  const scanFile = (file) => {
    const rel = path.relative(pkgDir, file);
    fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      // exact: getByTestId("x") / data-testid="x"  (no ${, no quotes inside)
      for (const m of line.matchAll(/getByTestId\(\s*["'`]([^"'`$]+)["'`]/g))
        usages.push({ id: m[1], prefix: false, file: rel, line: i + 1 });
      for (const m of line.matchAll(/data-testid="([^"$]+)"/g))
        usages.push({ id: m[1], prefix: false, file: rel, line: i + 1 });
      // prefix: [data-testid^="x"] — generated ids share a literal stem
      for (const m of line.matchAll(/data-testid\^="([^"$]+)"/g))
        usages.push({ id: m[1], prefix: true, file: rel, line: i + 1 });
    });
  };
  walk(root);
}

// ---- index ehr/src ----
const srcFiles = [];
(function walkSrc(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walkSrc(p);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) srcFiles.push(p);
  }
})(ehrSrc);
const contents = srcFiles.map((f) => fs.readFileSync(f, "utf8"));
const hasExact = (id) => contents.some((c) => c.includes(`"${id}"`) || c.includes(`\`${id}`));
const hasPrefix = (stem) => contents.some((c) => c.includes(stem));

// ---- report ----
const seen = new Map(); // id -> { prefix, usages: [] }
for (const u of usages) {
  const key = `${u.prefix ? "^" : ""}${u.id}`;
  if (!seen.has(key)) seen.set(key, { ...u, usages: [] });
  seen.get(key).usages.push(`${u.file}:${u.line}`);
}

let ok = 0;
const missing = [];
for (const [key, info] of [...seen.entries()].sort()) {
  const found = info.prefix ? hasPrefix(info.id) : hasExact(info.id);
  if (found) ok++;
  else missing.push({ key, info });
}

console.log(`[check-selectors] ${seen.size} distinct selectors across ${SCAN_DIRS.join("/")} — ${ok} found in ${ehrSrc}, ${missing.length} not found`);
if (missing.length) {
  console.log(`\nNOT found in ../ehr/src (may live on the deployed build's branch — judge each):`);
  for (const { key, info } of missing)
    console.log(`  - ${key}\n      used at ${info.usages.join(", ")}`);
}
const strict = process.argv.includes("--strict");
if (strict && missing.length) {
  console.error(`\n[check-selectors] --strict: ${missing.length} untraceable selector(s)`);
  process.exit(1);
}
