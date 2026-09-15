// page-objects/oe/order-entry.page.ts — CPOE2 (Order Entry) as reached from a
// patient chart: BROWSE ORDERS → ADT Orders → Discharge → Add → ORDER DETAILS
// → Save, including this build's confirmation dialogs.
//
// Verified on fbch34 (2026-09-12, provider login gyq001):
// - The rail's ORDER ENTRY button exists only with a patient chart open.
// - This build has NO cpoe-* data-testids: NEW ORDERS / BROWSE ORDERS are ExtJS
//   panels. Categories and the Name list render as ExtJS grid rows.
// - BROWSE ORDERS has no Meds/Non-Meds chip here — a flat category list whose
//   first row is "ADT Orders"; the ADT Name list is Admission / Discharge /
//   Transfer / Left AMA.
// - Selecting an order row enables "Add (1)"; after Add the order appears in
//   NEW ORDERS as a titled card ("Discharge").
// - ORDER DETAILS: Provider* is a type-to-filter combo (placeholder
//   "Provider Search (Min. 3 Letters)"). A query with no match leaves the
//   boundlist empty with no error — use a query that returns providers.
// - Save raises, in order: "Screening Error" (Yes), "Order Decision Support"
//   (OK), "Validation Dialog" (password must be re-entered; empty = silent
//   no-op). The order then shows under EXISTING ORDERS with State "Active".

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class OrderEntryPage {
  readonly page: Page;
  readonly env: EhrEnvConfig;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
  }

  /**
   * Click a toolbar button by visible label. This build mixes plain
   * `<button>` (e.g. Browse) with ExtJS buttons (x-btn-inner spans, e.g.
   * Save / Apply/Close); a sticky x-mask can intercept real clicks, so fall
   * back to dispatching the mouse sequence on the ExtJS button element.
   */
  private async clickBtn(label: string): Promise<void> {
    const roleBased = this.page
      .getByRole("button", { name: new RegExp(label.replace(/[/]/g, "\\$&"), "i") })
      .first();
    if (await roleBased.isVisible().catch(() => false)) {
      await roleBased.click();
      return;
    }
    const ext = this.page.locator(".x-btn", { hasText: new RegExp(`^${label}$`) }).last();
    await expect(ext).toBeVisible({ timeout: 15_000 });
    await ext.click({ timeout: 5_000 }).catch(async () => {
      await ext.evaluate((el) => {
        ["mousedown", "mouseup", "click"].forEach((type) =>
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
        );
      });
    });
  }

  /** Click a category/order list entry (ExtJS grid row OR tree node). */
  private async clickListEntry(text: string): Promise<boolean> {
    const row = this.page
      .locator("tr.x-grid-row, [role=treeitem]")
      .filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) })
      .first();
    if (!(await row.isVisible().catch(() => false))) return false;
    await row.click();
    return true;
  }

  /**
   * Click the visible leaf element whose exact text is `text` (the picker's
   * tree nodes wrap their label in spans whose parent also contains the
   * children — anchored locators on the node itself fail there).
   */
  private async clickLeafText(text: string): Promise<boolean> {
    return this.page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll("*")).filter(
        (e) => e.children.length === 0 && (e.textContent || "").trim() === t
      );
      const visible = els.filter((e) => (e as HTMLElement).offsetParent !== null);
      const el = (visible[visible.length - 1] || els[els.length - 1]) as HTMLElement | undefined;
      if (!el) return false;
      el.click();
      return true;
    }, text);
  }

  /** Click a locator, falling back to a page-context mouse sequence when a
   *  sticky ExtJS x-mask would otherwise intercept the real click. */
  private async clickWithFallback(loc: Locator): Promise<void> {
    try {
      await loc.click({ timeout: 5_000 });
      return;
    } catch {
      /* masked/covered — dispatch from the page context instead */
    }
    await loc.evaluate((el) => {
      ["mousedown", "mouseup", "click"].forEach((type) =>
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
      );
    });
  }

  private async addCounter(): Promise<number> {
    const body = await this.page.evaluate(() => document.body.innerText);
    const m = body.match(/Add \((\d+)\)/);
    return m ? Number(m[1]) : 0;
  }

  /** Click the rail app button whose hidden <span> carries the label. */
  private async clickRail(label: string): Promise<void> {
    const link = this.page
      .locator(".home-non-navbtn-panel a")
      .filter({ has: this.page.locator("span", { hasText: label }) })
      .first();
    await expect(link).toBeAttached({ timeout: 15_000 });
    await link.click();
  }

  async openFromRail(): Promise<void> {
    await this.clickRail("ORDER ENTRY");
    // The screen holds duplicate/hidden "NEW ORDERS" spans — prove readiness
    // with the visible Browse action instead.
    await expect(this.page.getByRole("button", { name: /Browse/ }).first()).toBeVisible({
      timeout: 30_000,
    });
  }

  /**
   * Browse → ADT Orders → <order> → Add.
   * The picker has two renderings on this host:
   *  - a flat category list (ExtJS grid rows; clicking a row ticks the order),
   *  - the kit's layout: Medications/Non-Meds chips + a category tree + a
   *    Name grid whose CHECKBOX COLUMN must be clicked (clicking the tree node
   *    only filters the list — the Add counter stays 0 until the row checkbox
   *    is ticked).
   * Non-Meds is mandatory for ADT (with Medications the list stays empty).
   */
  async addAdtDischargeOrder(category = "ADT Orders", orderName = "Discharge"): Promise<void> {
    await this.clickBtn("Browse");
    await expect(this.page.getByText("BROWSE ORDERS")).toBeVisible({ timeout: 20_000 });

    // Non-Meds chip when this layout offers one.
    const nonMeds = this.page.getByRole("button", { name: "Non-Meds", exact: true });
    if (await nonMeds.isVisible().catch(() => false)) {
      await nonMeds.click();
    }

    // Category: tree node (either label) or grid row.
    if (!(await this.clickListEntry(category)) && !(await this.clickListEntry("ADT"))) {
      await this.clickLeafText(category);
    }

    // Order row: the Name grid's row text is e.g. "frequent Discharge patient
    // ONCE" (Name / Sort / Freq columns). The checkbox control differs between
    // builds, so try candidates and verify against the Add counter.
    const orderRow = this.page
      .locator("tr.x-grid-row, [role=row]")
      .filter({ hasText: new RegExp(orderName.replace(/\s+/g, "\\s+"), "i") })
      .first();
    if (await orderRow.count()) {
      const candidates = [
        orderRow.locator("input[type=checkbox], [role=checkbox]").first(),
        orderRow.locator(".x-grid-cell-checkcolumn, .x-grid-checkcolumn").first(),
        orderRow.locator("td, [role=cell]").first(),
        orderRow,
      ];
      for (const candidate of candidates) {
        if ((await this.addCounter()) > 0) break;
        if ((await candidate.count()) === 0) continue;
        await candidate
          .click({ timeout: 4_000 })
          .catch(async () => candidate.evaluate((el: HTMLElement) => el.click()));
        await this.page.waitForTimeout(400);
      }
      if ((await this.addCounter()) === 0) {
        const html = await orderRow.evaluate((el) => el.outerHTML.slice(0, 500));
        throw new Error(`勾选 ${orderName} 后 Add 计数仍为 0；行 DOM: ${html}`);
      }
    } else {
      await this.clickLeafText(orderName);
    }

    const addButton = this.page.getByRole("button", { name: /^Add \([1-9]\d*\)$/ }).last();
    // The pre-Add panel has a required "Authorizing Provider" field; for some
    // logins it is NOT pre-filled and Add stays disabled until one is picked.
    if (!(await addButton.isEnabled().catch(() => false))) {
      await this.fillAuthorizingProvider();
    }
    try {
      await expect(addButton).toBeEnabled({ timeout: 20_000 });
    } catch (e) {
      const dialog = this.page.locator('[role=dialog]:has-text("BROWSE ORDERS")').last();
      const text = await dialog.innerText().catch(() => "(no dialog)");
      const inputs = await dialog
        .locator("input")
        .evaluateAll((els) =>
          els.map((e) => `${(e as HTMLInputElement).placeholder || e.id || "?"}="${(e as HTMLInputElement).value}"`).join(" | ")
        )
        .catch(() => "(no inputs)");
      throw new Error(
        `Add 按钮仍不可用；inputs: ${inputs}\nBROWSE ORDERS 尾部：${text.slice(-1200)}`
      );
    }
    await this.clickWithFallback(addButton);
    await expect(this.page.getByText("BROWSE ORDERS")).toHaveCount(0, { timeout: 20_000 });
  }

  /** Pick the first provider offered in the BROWSE ORDERS pre-Add panel. */
  private async fillAuthorizingProvider(providerQuery = "tes"): Promise<void> {
    const dialog = this.page.locator('[role=dialog]:has-text("BROWSE ORDERS")').last();
    // The provider input is the dialog's last text input (the first one is the
    // order search box with placeholder "Search Discharge Orders").
    const inputs = dialog.locator("input[type=text], input:not([type])");
    const count = await inputs.count();
    let provider = inputs.nth(count - 1);
    for (let i = count - 1; i >= 0; i--) {
      const ph = (await inputs.nth(i).getAttribute("placeholder")) || "";
      if (!/^search/i.test(ph)) {
        provider = inputs.nth(i);
        break;
      }
    }
    await provider.click();
    await provider.fill("");
    await provider.pressSequentially(providerQuery, { delay: 80 });

    // The option list may be an MUI listbox, an ExtJS boundlist, or appear
    // only after clicking the field's popup trigger. The lookup is async, so
    // wait for the list instead of probing once.
    const options = this.page.locator('li[role=option], .x-boundlist-item, [role=option]');
    let visible = await options
      .first()
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) {
      const trigger = dialog
        .locator('button[aria-label="Open"], .x-form-trigger, [class*=popupIndicator]')
        .last();
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click().catch(() => undefined);
        visible = await options
          .first()
          .waitFor({ state: "visible", timeout: 8_000 })
          .then(() => true)
          .catch(() => false);
      }
    }
    if (!visible) {
      const html = await provider
        .evaluate((el) => (el.parentElement?.parentElement?.outerHTML ?? "").slice(0, 400))
        .catch(() => "(no html)");
      throw new Error(`Provider 候选项未出现（query=${providerQuery}）；字段 DOM: ${html}`);
    }

    const option = options.first();
    const label = ((await option.innerText()) || "").trim();
    await option.click();
    await expect(provider).toHaveValue(label.length ? label : /.+/, { timeout: 10_000 });
  }

  /** Click the new-order card title to open ORDER DETAILS. */
  async openOrderDetails(orderName: string): Promise<void> {
    const candidates: Array<() => Promise<void>> = [
      async () => {
        await this.page
          .locator(`.x-panel-header-text:text-is("${orderName}"), .x-title:text-is("${orderName}")`)
          .last()
          .click({ timeout: 4_000 });
      },
      async () => {
        await this.page.getByText(orderName, { exact: true }).last().click({ timeout: 4_000 });
      },
      async () => {
        await this.page
          .locator("text=/^Discharge patient$/")
          .last()
          .click({ timeout: 4_000 });
      },
    ];
    for (const click of candidates) {
      if (await this.page.getByText("ORDER DETAILS").isVisible().catch(() => false)) break;
      await click().catch(() => undefined);
      await this.page.waitForTimeout(500);
    }
    try {
      await expect(this.page.getByText("ORDER DETAILS")).toBeVisible({ timeout: 15_000 });
    } catch (e) {
      const panel = await this.page
        .locator("text=NEW ORDERS")
        .first()
        .evaluate((el) => el.parentElement?.parentElement?.innerText ?? "")
        .catch(() => "(no panel)");
      throw new Error(`打不开 ORDER DETAILS；NEW ORDERS 面板：${panel.slice(-600)}`);
    }
  }

  /** Type a provider query and pick the first matching option. */
  async setProvider(providerQuery: string): Promise<void> {
    const input = this.page.locator('input[placeholder="Provider Search (Min. 3 Letters)"]').last();
    await expect(input).toBeVisible();
    await input.click();
    await input.pressSequentially(providerQuery, { delay: 80 });
    const option = this.page.locator(".x-boundlist-item").first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
    await expect(input).not.toHaveValue("");
  }

  async applyOrderDetails(): Promise<void> {
    await this.clickBtn("Apply/Close");
    await expect(this.page.getByText("ORDER DETAILS")).toHaveCount(0, { timeout: 15_000 });
  }

  async save(): Promise<void> {
    await this.clickBtn("Save");
    await this.handleSaveDialogs();
  }

  /** The three dialogs this build raises on Save (see file header). */
  private async handleSaveDialogs(): Promise<void> {
    // 1) Screening Error — "Decision Support server is down. Proceed?" → Yes
    const screening = this.page.locator(".x-window:has-text('Screening Error')").last();
    if (await screening.isVisible().catch(() => false)) {
      await screening.getByText("Yes", { exact: true }).click();
    }
    // 2) Order Decision Support info → OK
    const decision = this.page.locator(".x-window:has-text('Order Decision Support')").last();
    if (await decision.isVisible().catch(() => false)) {
      await decision.getByText("OK", { exact: true }).click();
    }
    // 3) Validation Dialog — password must be entered before OK
    const validation = this.page.locator(".x-window:has-text('Validation Dialog')").last();
    if (await validation.isVisible().catch(() => false)) {
      const pw = validation.locator("input[type=password]").first();
      await pw.fill(this.env.password);
      await validation.getByText("OK", { exact: true }).click();
    }
  }

  /** The order is Active under EXISTING ORDERS (ADT group). */
  async expectOrderActive(orderName: string): Promise<void> {
    const existing = this.page.locator("text=EXISTING ORDERS").first();
    await expect(existing).toBeVisible();
    await expect(
      this.page.locator(`tr:has-text("${orderName}"):has-text("Active")`).first()
    ).toBeVisible({ timeout: 30_000 });
  }
}
