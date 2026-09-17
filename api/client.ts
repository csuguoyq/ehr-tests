// api/client.ts — HTTP fallback client for known environment defects where a
// UI button is disabled (e.g. Registration Discharge → DISCH API fallback).
// API fallbacks are called from Steps inside try/catch; never from Flows.

import { request } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import type { EhrEnvConfig } from "../src/types/ehr-context";

export async function createApiClient(env: EhrEnvConfig): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: env.baseUrl.replace(/\/index\.php$/, ""),
    ignoreHTTPSErrors: true,
  });
}

/**
 * Established-session API context: the page's browser context already holds
 * the logged-in cookies, and context.request shares that cookie jar — so
 * authenticated endpoints can be called without re-logging in.
 */
export function createSessionApiClient(page: Page): APIRequestContext {
  return page.context().request;
}
