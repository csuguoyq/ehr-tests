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
  /** IANA timezone the box renders dates in (fbch34: US Pacific). Set via
   *  EHR_TZ; date assertions must use this, never a PO-local hardcode. */
  timezone: string;
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
    timezone: overrides?.timezone || process.env.EHR_TZ || "America/Los_Angeles",
  };
}

export interface EhrData {
  plans: Array<{ planId: string; description: string }>;
  cpts: Array<{ code: string; description: string; defaultQty?: number }>;
  diagnoses: Array<{ code: string; role: "admit" | "principal" | "secondary"; description: string }>;
}

/** Patient identity recorded by create-patient and consumed by later steps.
 *  All fields optional: readers fall back to params when a field is absent. */
export interface ScratchPatient {
  firstName?: string;
  lastName?: string;
  ssn?: string;
  dob?: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
  sex?: string;
  citizenship?: string;
  /** Search-dialog MRN seed ("90001"), NOT an assigned chart MRN. */
  searchMrn?: string;
  /** Assigned chart MRN, when a step captures it (currently none do). */
  mrn?: string;
}

/** Typed run-state shared between the steps AND goals of one test's
 *  orchestration. Each key is written by exactly one step kind and read by
 *  later steps/specs — keep this interface the single shape authority. */
export interface ScratchState {
  patient?: ScratchPatient;
  /** Hospital BNR id captured by wait-bnr. */
  bnrId?: string;
  /** Unit picked by admit-encounter (null when autocomplete returned empty). */
  admitUnit?: string | null;
  charges?: { cpts: string[]; qty: number };
  coding?: {
    admitDiagnosis: string;
    principalDiagnosis: string;
    drgCode: string;
    dischargeDisposition: string;
  };
  billing?: { started?: boolean; forced?: boolean; reason?: string };
  claim?: { submitted?: boolean; voided?: boolean };
  adjustment?: { code: string; amount: string; notes: string };
  account?: { mrn?: string; patientName?: string; row: string[] };
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
  scratch: ScratchState;
}
