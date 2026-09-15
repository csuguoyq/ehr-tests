// api/auth.ts — token login, borrowed from ehr/tests (tests/util.ts getTestToken
// + tests/helpers/testPatient.ts auth pattern): POST /logon/login returns
// {ccitoken}, then deep-linking /Cps?webtoken=... establishes the session
// without the ExtJS login form. Standalone: only needs the deployed webframe.
//
// The UI login goal (login → LoginPage) stays the authoritative UI path; this
// helper is the fast path for fixtures that just need an authenticated page.

import { expect } from "@playwright/test";
import { request } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import type { EhrEnvConfig } from "../src/types/ehr-context";
import { waitLoggedInTitle } from "../src/utils/wait";

/** POST /logon/login → ccitoken ("" when the endpoint rejects or is absent). */
export async function getWebtoken(
  env: EhrEnvConfig,
  requestCtx?: APIRequestContext
): Promise<string> {
  const own = !requestCtx;
  const ctx = requestCtx ?? (await request.newContext({ ignoreHTTPSErrors: true }));
  try {
    const url =
      `${env.baseUrl}/logon/login?username=${encodeURIComponent(env.username)}` +
      `&password=${encodeURIComponent(env.password)}`;
    const res = await ctx.post(url);
    const ret = await res.json().catch(() => null);
    return typeof ret?.ccitoken === "string" ? ret.ccitoken : "";
  } finally {
    if (own) await ctx.dispose();
  }
}

/** Open /Cps with a fresh webtoken and wait for the logged-in title. */
export async function tokenLogin(page: Page, env: EhrEnvConfig): Promise<void> {
  const token = await getWebtoken(env);
  expect(token, "ccitoken from /logon/login — check EHR_USER/EHR_PASS").toBeTruthy();
  await page.goto(`${env.baseUrl}/Cps?webtoken=${token}`, {
    waitUntil: "domcontentloaded",
  });
  await waitLoggedInTitle(page);
}
