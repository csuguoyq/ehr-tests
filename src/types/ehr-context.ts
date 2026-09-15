// src/types/ehr-context.ts — the context object every Flow/Step receives.
//
// One EhrContext per test: the Playwright page, resolved environment config,
// a namespaced logger, and lazily-loaded JSON fixtures from data/.

import type { Page } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";
import type { Logger } from "../utils/logger";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export interface EhrEnvConfig {
  /** Target box short name, e.g. fbch34. Never copy from a doc example. */
  host: string;
  /** https://<host>.clinicomp.com/<webframeDir>/index.php */
  baseUrl: string;
  webframeDir: string;
  username: string;
  password: string;
}

export function loadEhrEnv(overrides?: Partial<EhrEnvConfig>): EhrEnvConfig {
  const host = overrides?.host || process.env.EHR_HOST || "fbch34";
  const webframeDir = overrides?.webframeDir || process.env.WEBFRAME_DIR || "webframe";
  return {
    host,
    webframeDir,
    baseUrl: `https://${host}.clinicomp.com/${webframeDir}/index.php`,
    username: overrides?.username || process.env.EHR_USER || "demo",
    password: overrides?.password || process.env.EHR_PASS || "123",
  };
}

export interface EhrData {
  plans: Array<{ planId: string; description: string }>;
  cpts: Array<{ code: string; description: string; defaultQty?: number }>;
  diagnoses: Array<{ code: string; role: "admit" | "principal" | "secondary"; description: string }>;
}

export interface EhrContext {
  page: Page;
  env: EhrEnvConfig;
  log: Logger;
  /** Lazily-loaded content of data/*.json (keyed by file basename). */
  data: EhrData;
  /** Mutable run-state shared between the steps AND goals of one test's
   *  orchestration (e.g. the generated patient / BNR id). The context is
   *  cached per page (see runner.createEhrContext), so scratch set by an
   *  earlier runGoal on the same page is visible to a later runGoal — that
   *  is how quick_charge/coding_complete/discharge reuse the patient that
   *  create_encounter generated. A new test gets a new page, so scratch is
   *  fresh per test. */
  scratch: Record<string, unknown>;
}
