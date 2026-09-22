// page-objects/registration/patient-tabs.page.ts — the per-patient sub-tab bar
// (Demographics / Guarantors / Insurance / Scheduling / Encounters / ... /
// Accounts (BNR)). Sub-tabs are hidden from the a11y tree until selected;
// clicking by role/tab text is the reliable path (verified fbch34).

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class PatientTabsPage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
  }

  subTab(label: string): Locator {
    return this.page.getByRole("tab", { name: label, exact: true });
  }

  async openSubTab(label: string): Promise<void> {
    const tab = this.subTab(label);
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
  }

  /**
   * Boundedly dismiss the async "WARNING: POTENTIAL DUPLICATE(S) DETECTED"
   * dialog (guarantor/patient duplicate check finishing late) if it is up —
   * it is informational and overlays the whole page (fbch34 2026-09-21,
   * TC35520: same-name test patients accumulate on the box).
   */
  async dismissDuplicateWarningIfPresent(): Promise<void> {
    const dialog = this.page
      .locator("[role=dialog], .MuiDialog-root")
      .filter({ hasText: /POTENTIAL DUPLICATE/i })
      .first();
    console.log(`[probe-dup] visible=${await dialog.isVisible().catch((e) => "err")} count=${await this.page.locator("[role=dialog]").count()}`);
    for (let attempt = 0; attempt < 5 && (await dialog.isVisible().catch(() => false)); attempt++) {
      console.log(`[probe-dup] attempt ${attempt}: closeBtns=${await dialog.getByRole("button", { name: "close" }).count()}`);
      await dialog.getByRole("button", { name: "close" }).first().click().catch((e) => console.log(`[probe-dup] click err: ${e.message?.slice(0, 150)}`));
      await this.page.waitForTimeout(1_000);
      console.log(`[probe-dup] after click visible=${await dialog.isVisible().catch((e) => "err")}`);
    }
  }

  /**
   * Navigate to a sub-tab, resolving an "Unsaved Changes" guard dialog if the
   * current form is dirty. The guard is raised ASYNCHRONOUSLY by the pending
   * navigation and is a full-page overlay that UNMOUNTS the tab bar — so the
   * dialog must be WAITED FOR (bounded), never checked with an immediate
   * isVisible() (that races the dialog in and misses it, leaving the next
   * tab click with no tab in the DOM). Bounded retry in case the save posts
   * and a second guard appears.
   */
  async openSubTabResolvingUnsaved(label: string): Promise<void> {
    const tab = this.subTab(label);
    const dialog = this.page
      .locator("[role=dialog], .x-window, .MuiDialog-root")
      .filter({ hasText: /Unsaved Changes/i })
      .first();
    for (let attempt = 0; attempt < 3; attempt++) {
      if ((await tab.getAttribute("aria-selected").catch(() => null)) === "true") return;
      // The async duplicate-check warning can pop at any moment and overlay
      // the tab bar — clear it before every (re)click.
      await this.dismissDuplicateWarningIfPresent();
      await tab.click().catch(() => {});
      // Wait (bounded) for the guard to appear; a clean switch shows no dialog.
      let shown = false;
      try {
        await expect
          .poll(() => dialog.isVisible().catch(() => false), { timeout: 4000 })
          .toBe(true);
        shown = true;
      } catch {
        shown = false;
      }
      if (shown) {
        const keep = dialog.getByRole("button", { name: /Save Changes/i }).first();
        await expect(keep).toBeVisible({ timeout: 5000 });
        await keep.click();
        await expect(dialog).toBeHidden({ timeout: 20_000 }).catch(() => {});
        // The tab bar re-renders after the save posts.
        await this.page.waitForTimeout(1000);
        continue;
      }
      if ((await tab.getAttribute("aria-selected").catch(() => null)) === "true") return;
    }
    // The duplicate-check warning pops asynchronously (can re-pop per record);
    // keep clearing it while polling for the tab to become active.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await this.dismissDuplicateWarningIfPresent();
      if ((await tab.getAttribute("aria-selected").catch(() => null)) === "true") return;
      await tab.click().catch(() => {});
      await this.page.waitForTimeout(2_000);
    }
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
  }
}
