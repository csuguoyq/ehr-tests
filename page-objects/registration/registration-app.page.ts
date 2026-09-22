// page-objects/registration/registration-app.page.ts — entry into the
// Registration module from the portal left icon rail (navigation skill).
//
// The rail labels live in hidden <span>s; matching by text still works since
// the span holds the label in the DOM. Module load is proven by the search
// toolbar being present.

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";
import { PortalRailPage } from "../portal-rail.page";
import { patientTab } from "./patient-tab";

export class RegistrationAppPage {
  private readonly page: Page;
  private readonly rail: PortalRailPage;
  readonly env: EhrEnvConfig;

  readonly createNewPatientButton: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.rail = new PortalRailPage(page);
    this.env = env;
    this.createNewPatientButton = page.getByTestId("patient-search-create-new-pat-btn");
  }

  /** Rail button for a label (delegates to the shared PortalRailPage). */
  railButton(label: string): Locator {
    return this.rail.button(label);
  }

  /** Click the rail app button and wait for the Registration search screen.
   *  When the portal-home rail is not in the DOM — we are inside another
   *  module (e.g. Worklists) or a patient chart context — the /Cps deep
   *  link rebuilds it (fbch34 2026-09-17, TC33731). */
  async open(label = "REGISTRATION"): Promise<void> {
    const btn = this.railButton(label);
    if (!(await btn.isVisible().catch(() => false))) {
      await this.page.goto(`${this.env.baseUrl}/Cps`, { waitUntil: "domcontentloaded" });
      await expect
        .poll(() => btn.isVisible().catch(() => false), { timeout: 20_000 })
        .toBe(true);
    }
    await btn.click();
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.createNewPatientButton).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Search a patient by MRN (preferred) or SSN — both primary criteria, a
   * single value is enough — and submit with Enter.
   */
  async searchPatient(key: { mrn?: string; ssn?: string }): Promise<void> {
    const testId = key.mrn ? "sf-mrn-tf" : "sf-ssn-tf";
    const searchInput = this.page.locator(`[data-testid="${testId}"] input`);
    await searchInput.fill(key.mrn || (key.ssn as string));
    await searchInput.press("Enter");
  }

  /** Open the first matching result's name link; proves the patient tab.
   *  The name cell (and its testid) is TRUNCATED by the MPI grid at 60
   *  chars — a long "last, first" full name never matches, so match by
   *  testid prefix on the last name only. The preceding MRN/SSN search
   *  already narrowed the grid to the one target patient (TC35520). */
  async openPatientResult(lastName: string, firstName: string): Promise<void> {
    const nameLink = this.page
      .locator(`[data-testid^="cci-patient-name-${lastName}"]`)
      .first();
    await nameLink.waitFor({ state: "visible", timeout: 30_000 });
    await nameLink.click();
    // patientTab (not exact getByRole name): long patient names truncate the
    // chart-tab label with an ellipsis (TC35520).
    await patientTab(this.page, lastName, firstName).first().waitFor({ timeout: 20_000 });
  }
}
