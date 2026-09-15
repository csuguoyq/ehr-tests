// src/utils/wait.ts — condition-based wait primitives for the hybrid
// ExtJS (shell/logon) + MUI (module) portal. Conditions, never fixed sleeps:
// every helper polls for something that *proves* the state was reached.
// (Exception, by convention: Page Objects may use a short settle wait only
// where a comment documents the verified race it guards — e.g. the ExtJS
// sequential credential fill. New waits must poll a condition instead.)

import type { Page } from "@playwright/test";

export const DEFAULT_WAIT_MS = 20_000;

/** Poll a page predicate until truthy. Returns the value or throws with `desc`. */
export async function waitFor<T>(
  page: Page,
  fn: (arg: unknown) => T,
  desc: string,
  timeout = DEFAULT_WAIT_MS,
  arg?: unknown
): Promise<T> {
  const t0 = Date.now();
  let last: unknown;
  while (Date.now() - t0 < timeout) {
    try {
      last = await page.evaluate(fn, arg);
      if (last) return last as T;
    } catch {
      /* page navigating / context destroyed mid-poll — keep polling */
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`waitFor timeout (${timeout}ms): ${desc} — last=${JSON.stringify(last)}`);
}

/**
 * Logged-in state is confirmed by the page title prefix `<USER, <NAME>> ...`.
 * A bare "CliniComp|EHR ..." title means the shell rendered without a session.
 */
export const waitLoggedInTitle = (page: Page) =>
  waitFor(
    page,
    () => /CliniComp/.test(document.title) && !/^CliniComp/.test(document.title),
    "logged-in page title (USER, <name> prefix)"
  );
