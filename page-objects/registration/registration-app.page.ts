// page-objects/registration/registration-app.page.ts — entry into the
// Registration module from the portal left icon rail (navigation skill).
//
// The rail labels live in hidden <span>s; matching by text still works since
// the span holds the label in the DOM. Module load is proven by the search
// toolbar being present.

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class RegistrationAppPage {
  readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly railButton: (label: string) => Locator;
  readonly createNewPatientButton: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.railButton = (label: string) =>
      page
        .locator(".home-non-navbtn-panel a")
        .filter({ has: page.locator("span", { hasText: label }) })
        .first();
    this.createNewPatientButton = page.getByTestId("patient-search-create-new-pat-btn");
  }

  /** Click the rail app button and wait for the Registration search screen. */
  async open(label = "REGISTRATION"): Promise<void> {
    await this.railButton(label).click();
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.createNewPatientButton).toBeVisible({ timeout: 30_000 });
  }
}
