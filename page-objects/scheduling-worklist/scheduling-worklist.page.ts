// page-objects/scheduling-worklist/scheduling-worklist.page.ts — Appointment
// Management → Scheduling Worklist (ehr/src/SchedulingWorklist). PO for the
// "Unscheduled Procedures" card list and the detail side drawer opened via
// each card's "View Details" button. Selectors verified on fbch34
// (2026-09-20, TC35520).
//
// Truncation model (SZ35520 fix): the drawer title (procedure name, Typography
// in components/SchedulingWorklistItem/index.tsx) and the patient name
// (PatientHeader.tsx) use whiteSpace nowrap + overflow hidden +
// textOverflow ellipsis and are wrapped in an MUI Tooltip with the full
// content. The patient-name element also carries aria-label = full name.

import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";
import { PortalRailPage } from "../portal-rail.page";

export class SchedulingWorklistPage {
  private readonly page: Page;
  private readonly rail: PortalRailPage;
  readonly env: EhrEnvConfig;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.rail = new PortalRailPage(page);
    this.env = env;
    this.drawer = page.locator(".MuiDrawer-root").first();
  }

  /** Open Appointment Management from the rail, then its Scheduling Worklist nav. */
  async open(): Promise<void> {
    if (!(await this.rail.button("Appointment Management").isVisible().catch(() => false))) {
      await this.page.goto(`${this.env.baseUrl}/Cps`, { waitUntil: "domcontentloaded" });
      await expect
        .poll(
          () => this.rail.button("Appointment Management").isVisible().catch(() => false),
          { timeout: 20_000 }
        )
        .toBe(true);
    }
    await this.rail.button("Appointment Management").click();
    const nav = this.page.getByText("Scheduling Worklist", { exact: true }).first();
    await expect(nav).toBeVisible({ timeout: 30_000 });
    await nav.click();
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByText("Unscheduled Procedures").first()).toBeVisible({
      timeout: 30_000,
    });
  }

  /** A card's View Details button: the button whose header-row parent
   *  (one ancestor div) contains the patient name. */
  cardViewDetails(patientName: string): Locator {
    return this.page
      .getByRole("button", { name: "View Details", exact: true })
      .filter({
        has: this.page.locator(`xpath=ancestor::div[1][contains(., "${patientName}")]`),
      })
      .first();
  }

  async openViewDetails(patientName: string): Promise<void> {
    const button = this.cardViewDetails(patientName);
    await expect(button).toBeVisible({ timeout: 20_000 });
    // The worklist polls and re-renders; a click can land on a re-rendered
    // node and be swallowed (fbch34 2026-09-21). Retry, then fall back to a
    // JS click on the button's DOM node.
    for (let attempt = 0; attempt < 3; attempt++) {
      await button.click().catch(() => {});
      if (await this.drawer.isVisible().catch(() => false)) return;
      await this.page.waitForTimeout(1_500);
    }
    await button.dispatchEvent("click");
    await expect(this.drawer).toBeVisible({ timeout: 20_000 });
  }

  readonly drawer: Locator;

  /** Drawer title Typography (procedure name, ellipsis-truncated). */
  procedureTitle(procedureNamePrefix: string): Locator {
    return this.drawer
      .locator("p")
      .filter({ hasText: procedureNamePrefix })
      .first();
  }

  /** Patient-name element in the drawer header (aria-label = full name). */
  patientName(fullName: string): Locator {
    return this.drawer.locator(`[aria-label="${fullName}"]`).first();
  }

  async closeDrawer(): Promise<void> {
    await this.drawer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(this.drawer).toBeHidden({ timeout: 15_000 });
  }

  /**
   * Trigger MUI tooltips by hover and return ALL tooltip texts currently in
   * the DOM (MUI keeps already-open tooltips mounted, so callers must search
   * the array for their expected content rather than take a single value).
   * Hovering may fall back to synthetic mouseover for elements that are
   * horizontally clipped by the drawer (patient header on narrow viewports).
   */
  async tooltipTexts(trigger: Locator): Promise<string[]> {
    try {
      await trigger.hover({ timeout: 5_000 });
    } catch {
      await trigger.evaluate((el) => {
        for (const type of ["mouseover", "mouseenter", "mousemove"]) {
          el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
        }
      });
    }
    const tooltip = this.page.locator("[role=tooltip]").last();
    await expect(tooltip).toBeVisible({ timeout: 10_000 });
    return this.page.locator("[role=tooltip]").allInnerTexts().then((a) => a.map((t) => t.trim()));
  }

  /** True when the element actually overflows (ellipsis is active). */
  async isOverflowing(loc: Locator): Promise<boolean> {
    return loc.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  }

  async hasEllipsisStyle(loc: Locator): Promise<boolean> {
    return loc.evaluate((el) => {
      const s = getComputedStyle(el);
      return (
        s.textOverflow === "ellipsis" &&
        s.whiteSpace === "nowrap" &&
        s.overflowX === "hidden"
      );
    });
  }
}
