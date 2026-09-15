// fixtures/ehr.fixture.ts — base fixture: one EhrContext per test.
// Provides page + env + logger + data fixtures to every spec.
//
// Viewing a run: SLOW_MO=<ms> slows every browser action, HEADLESS=0 opens a
// visible window. Both come from .env / inline env (inline wins).

import { test as base, expect as baseExpect, type Browser } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createEhrContext } from "../src/executor/runner";
import type { EhrContext } from "../src/types/ehr-context";

export interface EhrFixtures {
  browser: Browser;
  ehr: EhrContext;
}

const readHeadless = () => (process.env.HEADLESS ? process.env.HEADLESS !== "0" : true);
const readSlowMo = () => Number(process.env.SLOW_MO || 0);

export const test = base.extend<EhrFixtures>({
  // Launch our own browser so SLOW_MO can be injected (slowMo is a launch option,
  // not a `use` option). The default context/page fixtures then build on this
  // browser, so config `use` (baseURL, viewport, ...) still applies.
  browser: async ({ playwright, browserName }, use) => {
    const browser = await playwright[browserName].launch({
      headless: readHeadless(),
      slowMo: readSlowMo(),
    });
    await use(browser);
    await browser.close();
  },
  ehr: async ({ page }, use) => {
    const ctx = createEhrContext(page);
    await use(ctx);
  },
});

export const expect = baseExpect;

/** Convenience for specs that only need a logged-in page. */
export type { Page };
