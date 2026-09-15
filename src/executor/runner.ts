// src/executor/runner.ts — the runtime executor. Loads goals.yaml, matches a
// natural-language input to a goal, resolves parameters, then runs the Flow
// registered for it. Pure Playwright at runtime: NO AI calls here.
//
// Usage from a spec or future CLI:
//   await runFromInput(page, "创建一个 encounter", { preset: "inpatient_acute_admit" });
//   await runGoal(page, "login", { username: "demo" });

import type { Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { parse } from "yaml";
import { loadEhrEnv, type EhrContext, type EhrData } from "../types/ehr-context";
import { createLogger } from "../utils/logger";
import type { GoalDefinition, GoalsFile, ResolvedParams } from "../types/goal";
import type { FlowDefinition } from "../types/flow";
import { matchGoal } from "./goal-matcher";
import { resolveParams } from "./param-resolver";
import { FLOWS } from "../../flows";

const GOALS_YAML = path.resolve(__dirname, "../../goals.yaml");
const DATA_DIR = path.resolve(__dirname, "../../data");

/**
 * Load goals from a single yaml file OR a directory of them (goals/*.yaml,
 * one file per domain once the single file outgrows itself — see PROJECT.md
 * 结构与规模阈值). Duplicate goal keys across files are rejected loudly.
 */
export function loadGoals(yamlPath = GOALS_YAML): Record<string, GoalDefinition> {
  const files: string[] = [];
  if (fs.existsSync(yamlPath) && fs.statSync(yamlPath).isDirectory()) {
    for (const f of fs.readdirSync(yamlPath).sort()) {
      if (f.endsWith(".yaml") || f.endsWith(".yml")) files.push(path.join(yamlPath, f));
    }
    if (files.length === 0) throw new Error(`goals 目录为空（无 .yaml 文件）: ${yamlPath}`);
  } else {
    files.push(yamlPath);
  }
  const goals: Record<string, GoalDefinition> = {};
  for (const file of files) {
    const parsed = parse(fs.readFileSync(file, "utf8")) as GoalsFile;
    if (!parsed?.goals) throw new Error(`goals 结构错误：缺少 goals 键 (${file})`);
    for (const [key, def] of Object.entries(parsed.goals)) {
      if (goals[key]) throw new Error(`目标 “${key}” 重复定义：${file} 与先前的 goals 文件冲突`);
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
      `目标 “${goalName}” 已在 goals.yaml 登记，但 Flow 未实现（见 GOALS.md 状态表）。` +
        `已实现 Flow：${Object.keys(FLOWS).join(", ") || "(none)"}`
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
    throw new Error(`goals.yaml 中没有目标 “${goalName}”，已登记：${Object.keys(goals).join(", ")}`);
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
    throw new Error(`目标 “${match.goal.name}” 已登记但未实现（matchedBy=${match.matchedBy}）`);
  }
  // matchGoal guarantees goal.name is populated from the yaml key.
  return runGoal(page, match.goal.name!, options);
}
