// page-objects/portal-rail.page.ts — the portal-level non-nav rail (Slice C2,
// 2026-09-18): every app button (REGISTRATION / ORDER ENTRY / WORKLIST /
// ACCOUNT LOOKUP / ...) renders as `.home-non-navbtn-panel a` with a text
// span. Module POs compose this locator for their `open()` (deep-link
// fallbacks and loaded-assertions stay module-owned).

import type { Locator, Page } from "@playwright/test";

export class PortalRailPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Rail button whose span text contains `label` (e.g. "WORKLIST"). */
  button(label: string): Locator {
    return this.page
      .locator(".home-non-navbtn-panel a")
      .filter({ has: this.page.locator("span", { hasText: label }) })
      .first();
  }

  /** Click the rail app button (no loaded assertion — module POs own that). */
  async clickApp(label: string): Promise<void> {
    await this.button(label).click();
  }
}
