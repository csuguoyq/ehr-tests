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
// Headed runs keep the window open after a test so a human can look at the
// final screen; KEEP_BROWSER_MS overrides (0 disables), headless never waits.
const readKeepBrowserMs = () => {
  const raw = process.env.KEEP_BROWSER_MS;
  if (raw !== undefined) return Number(raw) || 0;
  return readHeadless() ? 0 : 60_000;
};

export const test = base.extend<EhrFixtures>({
  // Launch our own browser so SLOW_MO can be injected (slowMo is a launch option,
  // not a `use` option). The default context/page fixtures then build on this
  // browser, so config `use` (baseURL, viewport, ...) still applies.
  browser: async ({ playwright, browserName }, use) => {
    // Headed: --start-maximized + CDP maximize (see page fixture). Headless:
    // there is no real window, and viewport:null would follow Chromium's tiny
    // 800x600 default — pin the headless window to full HD instead so
    // failure screenshots/videos cover the whole page.
    const args = readHeadless() ? ["--window-size=1920,1080"] : ["--start-maximized"];
    const browser = await playwright[browserName].launch({
      headless: readHeadless(),
      slowMo: readSlowMo(),
      args,
    });
    await use(browser);
    await browser.close();
  },
  // Wrap the default page fixture. First maximize the real window over CDP
  // (--start-maximized alone is unreliable on Windows through Playwright);
  // our post-`use` code runs BEFORE the default teardown closes the page, so
  // the final screen stays visible for the keep-open delay.
  page: async ({ page }, use) => {
    const keepMs = readKeepBrowserMs();
    if (keepMs > 0 && page.context().browser()?.browserType().name() === "chromium") {
      try {
        const cdp = await page.context().newCDPSession(page);
        const { windowId } = await cdp.send("Browser.getWindowForTarget");
        await cdp.send("Browser.setWindowBounds", {
          windowId,
          bounds: { windowState: "maximized" },
        });
      } catch {
        /* cosmetic only — never fail a run over window bounds */
      }
    }
    await use(page);
    if (keepMs > 0) {
      console.log(`\n[ehr:run] keeping browser open ${keepMs / 1000}s (KEEP_BROWSER_MS) …`);
      await page.waitForTimeout(keepMs);
    }
  },
  ehr: async ({ page }, use) => {
    const ctx = createEhrContext(page);
    await use(ctx);
  },
});

export const expect = baseExpect;

/** Convenience for specs that only need a logged-in page. */
export type { Page };
