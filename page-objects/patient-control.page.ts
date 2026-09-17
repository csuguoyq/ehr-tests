// page-objects/patient-control.page.ts — Patient Control (the Cps census):
// search a patient and open the chart (dblclicking a census row). Opening the
// chart is what switches the portal rail into the patient-context app list
// (ORDER ENTRY, Flowsheets, ...) that Order Entry needs.
// Portal-level page: kept at the page-objects root — it precedes module
// context and is not owned by any single module dir (see MODULES.md mapping).

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export class PatientControlPage {
  private readonly page: Page;
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

  // -------------------------------------------------------- Unit List census
  // Verified ExtJS grid facts (skills/ehr-ui/patient-control, fbch19 2026-09-09):
  // unit rows render `UNIT(COUNT)` (e.g. `OR(166)`), census rows carry columns
  // `BED | Name | PendingOrd | Code Status | EDIPN | ADMIT DATE | PHYSICIAN | …`.

  /** Click a unit row in the Unit List to load that unit's census. */
  async openUnit(unit: string): Promise<void> {
    const unitRow = this.page.locator("tr.x-grid-row", { hasText: unit }).first();
    await expect(unitRow).toBeVisible({ timeout: 20_000 });
    await unitRow.click();
  }

  /** The census grid row for `name` on the CURRENTLY shown page. */
  censusRow(name: string): Locator {
    return this.page.locator("tr.x-grid-row", { hasText: name }).first();
  }

  /**
   * Find the patient's census row across pages — unit censuses page at ~40
   * rows with a `Page <spinbutton> of <N> Displaying items x - y of z` pager
   * (fbch34 PHASE2: 71 patients → 2 pages, verified 2026-09-15). Pages forward
   * via the pager's page input; each page gets a visibility wait because the
   * pager text updates BEFORE the grid finishes re-rendering. Returns the row
   * locator on whichever page it was found (the caller asserts on it).
   */
  async findCensusRow(name: string, maxPages = 20): Promise<Locator> {
    const pagerText = this.page.getByText(/Displaying items \d+ - \d+ of \d+/);
    for (let page = 1; page <= maxPages; page++) {
      const row = this.censusRow(name);
      const appeared = await row
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      if (appeared) return row;
      const m = (await pagerText.innerText().catch(() => "")).match(
        /Displaying items (\d+) - (\d+) of (\d+)/
      );
      if (!m) break;
      const [, start, end, total] = m.map(Number);
      if (end >= total) break;
      const pageSize = end - start + 1;
      const nextPage = Math.floor(end / pageSize) + 1;
      await this.gotoCensusPage(nextPage, (nextPage - 1) * pageSize + 1, pagerText);
    }
    return this.censusRow(name); // not found on any page — caller's expect reports it
  }

  /**
   * Navigate the census pager to `page` and wait until its first item number
   * shows in the pager text. fill+Enter on the page input is the verified
   * primary path (fbch34 2026-09-15); a grid mid-load can swallow the input,
   * so retry and fall back to the pager's Next Page button.
   */
  private async gotoCensusPage(page: number, firstItem: number, pagerText: Locator): Promise<void> {
    const pageInput = this.page.getByRole("spinbutton").last();
    const nextBtn = this.page.locator('a[data-qtip="Next Page"]').first();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt === 1) {
        if ((await nextBtn.isVisible().catch(() => false)) &&
            !(await nextBtn.getAttribute("class").catch(() => ""))?.includes("x-item-disabled")) {
          await nextBtn.click().catch(() => undefined);
        }
      } else {
        await pageInput.fill(String(page));
        await pageInput.press("Enter");
      }
      try {
        await expect(pagerText).toContainText(`Displaying items ${firstItem}`, { timeout: 10_000 });
        return;
      } catch {
        /* retry with the other control */
      }
    }
    await expect(pagerText).toContainText(`Displaying items ${firstItem}`, { timeout: 10_000 });
  }
}
