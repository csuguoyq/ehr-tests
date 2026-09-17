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
}
