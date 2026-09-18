// src/executor/runner.ts — the runtime executor. Loads goals.yaml, matches a
// natural-language input to a goal, resolves parameters, then runs the Flow
// registered for it. Pure Playwright at runtime: NO AI calls here.
//
// Usage from a spec or future CLI:
//   await runFromInput(page, "create encounter", { preset: "inpatient_acute_admit" });
//   await runGoal(page, "login", { username: "demo" });

import type { Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { parse } from "yaml";
import { loadEhrEnv, type EhrContext, type EhrData } from "../types/ehr-context";
import { createLogger } from "../utils/logger";
import type { GoalDefinition, GoalsFile, ParamSchema, ResolvedParams } from "../types/goal";
import type { FlowDefinition } from "../types/flow";
import { matchGoal } from "./goal-matcher";
import { resolveParams } from "./param-resolver";
import { FLOWS } from "../../flows";

// Goals live in goals/<domain>.yaml (split once the single file outgrew the
// 300-line threshold — see PROJECT.md "Structure & size thresholds"); the
// single-file layout remains supported as a fallback. Resolved lazily: the
// compiled .build-drv gets its goals copy synced just before load (tsc does
// not copy yaml — see drive-ml.js / package.json build:drv).
function defaultGoalsPath(): string {
  const dir = path.resolve(__dirname, "../../goals");
  return fs.existsSync(dir) ? dir : path.resolve(__dirname, "../../goals.yaml");
}
const DATA_DIR = path.resolve(__dirname, "../../data");

/**
 * Load goals from a single yaml file OR a directory of them (goals/*.yaml,
 * one file per domain once the single file outgrows itself — see PROJECT.md
 * "Structure & size thresholds"). Duplicate goal keys across files are rejected
 * loudly.
 *
 * Files may also declare top-level `paramGroups:` (a file may contain ONLY
 * paramGroups, e.g. goals/_shared.yaml). A goal params block referencing
 * `$group: <name>` is expanded at load time: group keys first, then the
 * goal's own keys overriding them; the `$group` key itself is removed.
 * Expansion happens here — not in the resolver — so check-goals and the
 * runtime see the same expanded schemas.
 */
export function loadGoals(yamlPath = defaultGoalsPath()): Record<string, GoalDefinition> {
  const files: string[] = [];
  if (fs.existsSync(yamlPath) && fs.statSync(yamlPath).isDirectory()) {
    for (const f of fs.readdirSync(yamlPath).sort()) {
      if (f.endsWith(".yaml") || f.endsWith(".yml")) files.push(path.join(yamlPath, f));
    }
    if (files.length === 0) throw new Error(`goals directory is empty (no .yaml files): ${yamlPath}`);
  } else {
    files.push(yamlPath);
  }
  const goals: Record<string, GoalDefinition> = {};
  const paramGroups: Record<string, Record<string, ParamSchema>> = {};
  const parsedFiles = files.map((file) => ({
    file,
    parsed: parse(fs.readFileSync(file, "utf8")) as GoalsFile & {
      paramGroups?: Record<string, Record<string, ParamSchema>>;
    },
  }));
  for (const { file, parsed } of parsedFiles) {
    for (const [name, group] of Object.entries(parsed?.paramGroups ?? {})) {
      if (paramGroups[name]) {
        throw new Error(`duplicate paramGroup "${name}": ${file} conflicts with a previously loaded goals file`);
      }
      paramGroups[name] = group;
    }
  }
  for (const { file, parsed } of parsedFiles) {
    if (!parsed?.goals && !parsed?.paramGroups) {
      throw new Error(`invalid goals file: missing "goals" key (${file})`);
    }
    for (const [key, def] of Object.entries(parsed.goals ?? {})) {
      if (goals[key]) throw new Error(`duplicate goal "${key}": ${file} conflicts with a previously loaded goals file`);
      const { $group, ...ownParams } = def.params ?? {};
      if ($group !== undefined) {
        if (typeof $group !== "string" || !paramGroups[$group]) {
          throw new Error(`goal "${key}": unknown paramGroup "${String($group)}" (${file})`);
        }
        def.params = { ...paramGroups[$group], ...ownParams } as typeof def.params;
      }
      goals[key] = { name: key, ...def };
    }
  }
  return goals;
}

function loadData(): EhrData {
  const read = (f: string) =>
    JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
  return {
    plans: read("plans.json"),
    cpts: read("cpts.json"),
    diagnoses: read("diagnoses.json"),
  };
}

/**
 * Per-page context cache. Repeated runGoal/runFromInput calls on the SAME
 * page (i.e. one test's orchestration: login → create_encounter →
 * quick_charge) reuse ONE EhrContext, so `ctx.scratch` (the generated
 * patient / BNR id) survives across goals — the "same-orchestration reuse"
 * the goals.yaml patientName/lastName/ssn fallbacks document. A fresh test
 * gets a fresh Playwright page, so scratch never leaks across tests and the
 * cache entry is reclaimed with the page.
 */
const contextByPage = new WeakMap<Page, EhrContext>();

export function createEhrContext(page: Page): EhrContext {
  const existing = contextByPage.get(page);
  if (existing) return existing;
  const ctx: EhrContext = {
    page,
    env: loadEhrEnv(),
    log: createLogger("run"),
    data: loadData(),
    scratch: {},
  };
  contextByPage.set(page, ctx);
  return ctx;
}

export function getFlow(goalName: string): FlowDefinition {
  const flow = FLOWS[goalName];
  if (!flow) {
    throw new Error(
      `Goal "${goalName}" is registered in goals.yaml but its Flow is not implemented (see GOALS.md status table). ` +
        `Implemented flows: ${Object.keys(FLOWS).join(", ") || "(none)"}`
    );
  }
  return flow;
}

export interface RunOptions {
  preset?: string;
  params?: ResolvedParams;
}

/** Run a goal by its exact goals.yaml key. */
export async function runGoal(
  page: Page,
  goalName: string,
  options: RunOptions = {}
): Promise<ResolvedParams> {
  const goals = loadGoals();
  const goal = goals[goalName];
  if (!goal) {
    throw new Error(`Goal "${goalName}" not found in goals.yaml. Registered: ${Object.keys(goals).join(", ")}`);
  }
  const params = resolveParams(goal, options);
  const flow = getFlow(goalName);
  const ctx = createEhrContext(page);
  ctx.log.step(goalName, `host=${ctx.env.host} params=${JSON.stringify(params)}`);
  await flow.execute(ctx, params);
  return params;
}

/** Run a goal from free-form user input (natural language). */
export async function runFromInput(page: Page, input: string, options: RunOptions = {}) {
  const goals = loadGoals();
  const match = matchGoal(input, goals);
  if (match.goal.implemented === false) {
    throw new Error(`Goal "${match.goal.name}" is registered but not implemented (matchedBy=${match.matchedBy})`);
  }
  // matchGoal guarantees goal.name is populated from the yaml key.
  return runGoal(page, match.goal.name!, options);
}
