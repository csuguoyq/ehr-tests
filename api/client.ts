// api/client.ts — HTTP fallback client for known environment defects where a
// UI button is disabled (e.g. Registration Discharge → DISCH API fallback).
// API fallbacks are called from Steps inside try/catch; never from Flows.

import { request } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import type { EhrEnvConfig } from "../src/types/ehr-context";

export async function createApiClient(env: EhrEnvConfig): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: env.baseUrl.replace(/\/index\.php$/, ""),
    ignoreHTTPSErrors: true,
  });
}

/**
 * Established-session API context: reuses cookies/sessionStorage from a live
 * page so authenticated endpoints can be called without re-logging in.
 * (Concrete module API helpers land with their vertical slice — see MODULES.md.)
 */
export async function createSessionApiClient(
  env: EhrEnvConfig,
  _page: unknown
): Promise<APIRequestContext> {
  // TODO(slice: registration-discharge): carry webtoken from the page's
  // sessionStorage into headers; see PROJECT.md "Known limitations" DISCH fallback.
  return createApiClient(env);
}
