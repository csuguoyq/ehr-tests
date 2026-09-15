// page-objects/patient-control.page.ts — Patient Control (the Cps census):
// search a patient and open the chart (dblclicking a census row). Opening the
// chart is what switches the portal rail into the patient-context app list
// (ORDER ENTRY, Flowsheets, ...) that Order Entry needs.
// Portal-level page: kept at the page-objects root — it precedes module
// context and is not owned by any single module dir (see MODULES.md mapping).

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export class PatientControlPage {
  readonly page: Page;
  readonly globalSearch: Locator;

  constructor(page: Page) {
    this.page = page;
    this.globalSearch = page.locator("input[placeholder='Search Patient, Physician, etc']");
  }

  /** Load the Cps census entry (webtoken must already exist). */
  async open(baseUrl: string): Promise<void> {
    await this.page.goto(`${baseUrl}/Cps`, { waitUntil: "domcontentloaded" });
    await expect(this.globalSearch).toBeVisible({ timeout: 30_000 });
  }

  async search(query: string): Promise<void> {
    await this.globalSearch.click();
    await this.globalSearch.fill(query);
    await this.globalSearch.press("Enter");
    // "Displaying items x - y of z" proves the grid finished rendering AND
    // bound its row handlers (the kit's verified race guard).
    await expect(this.page.getByText(/Displaying items \d+ - \d+ of \d+/)).toBeVisible({
      timeout: 30_000,
    });
  }

  /** Open the census row containing `name`; the chart URL then carries dbpath. */
  async openChart(name: string): Promise<void> {
    const row = this.page.locator(`tr:has-text("${name}")`).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await this.page.waitForTimeout(1_000);
    await row.dblclick();
    await expect(this.page).toHaveURL(/dbpath=/, { timeout: 20_000 });
  }
}
