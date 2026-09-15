// fixtures/auth.fixture.ts — logged-in session fixture.
// Fast path first (borrowed from ehr/tests): API webtoken → /Cps?webtoken=
// deep link, no ExtJS form. Falls back to the UI login goal (through the
// executor, so goals.yaml defaults apply) when the token endpoint misbehaves
// on a box — specs/login.spec.ts keeps testing that UI path directly.

import { test as ehrTest, expect } from "./ehr.fixture";
import type { Page } from "@playwright/test";
import { runGoal } from "../src/executor/runner";
import { tokenLogin } from "../api/auth";

export interface AuthFixtures {
  /** A page with an established webtoken (logged into the portal). */
  authedPage: Page;
}

export const test = ehrTest.extend<AuthFixtures>({
  authedPage: async ({ ehr }, use) => {
    try {
      await tokenLogin(ehr.page, ehr.env);
    } catch (e) {
      ehr.log.warn(`token login failed (${(e as Error).message}) — falling back to UI login`);
      await runGoal(ehr.page, "login");
    }
    await use(ehr.page);
  },
});

export { expect };
