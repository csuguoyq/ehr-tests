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
  async addAdtDischargeOrder(
    category = "ADT Orders",
    orderName = "Discharge",
    providerQuery?: string
  ): Promise<void> {
    await this.clickBtn("Browse");
    await expect(this.page.getByText("BROWSE ORDERS")).toBeVisible({ timeout: 20_000 });

    // Non-Meds chip when this layout offers one.
    const nonMeds = this.page.getByRole("button", { name: "Non-Meds", exact: true });
    if (await nonMeds.isVisible().catch(() => false)) {
      await nonMeds.click();
    }

    // Category: the tree node is exactly "ADT" on this build. Multi-candidate
    // list-entry clicks left the Pre-Add footer half-rendered (provider field
    // without options) — use the verified single sequence, fbch34 2026-09-15.
    await this.page.getByText("ADT", { exact: true }).first().click();
    await this.page.waitForTimeout(1_000);

    // Order row: tick its CHECKBOX directly (verified). The Add counter
    // becomes 1 and the Pre-Add panel renders the Authorizing Provider field.
    const orderRow = this.page
      .locator("tr.x-grid-row, [role=row]")
      .filter({ hasText: new RegExp(orderName.replace(/\s+/g, "\\s+"), "i") })
      .first();
    await orderRow.waitFor({ state: "visible", timeout: 15_000 });
    // Tick and VERIFY against the Add counter. The row is a div grid
    // ([role=cell], no <td>); the checkbox may need a JS click fallback.
    const tickCandidates = [
      orderRow.locator("input[type=checkbox], [role=checkbox]").first(),
      orderRow.locator("[role=cell], td").first(),
    ];
    for (const candidate of tickCandidates) {
      if ((await this.addCounter()) > 0) break;
      await candidate
        .click({ timeout: 4_000, force: true })
        .catch(async () => candidate.evaluate((el: HTMLElement) => el.click()));
      await this.page.waitForTimeout(1_500);
    }
    if ((await this.addCounter()) === 0) {
      throw new Error(`勾选 ${orderName} 失败：Add 计数仍为 0（checkbox 与 cell 均未生效）`);
    }

    const addButton = this.page.getByRole("button", { name: /^Add \([1-9]\d*\)$/ }).last();
    // The pre-Add panel has a required "Authorizing Provider" field; for some
    // logins it is NOT pre-filled and Add stays disabled until one is picked.
    if (!(await addButton.isEnabled().catch(() => false))) {
      await this.fillAuthorizingProvider(providerQuery);
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

  /**
   * Pick a provider from the BROWSE ORDERS pre-Add panel — NO fixed name:
   * open the list and take the FIRST candidate (user convention 2026-09-16).
   * With no typed query the fixed choice list (cpoeChoices.providers.
   * authorizing) is coaxed open via ArrowDown. There is deliberately NO
   * generic typed fallback: this panel filters STARTSWITH over a fixed
   * choice list, so a broad query like "tes" can never match (verified
   * fbch34, PROJECT.md 阶段 5) — a box needing a typed query must pass
   * providerQuery (goals.yaml discharge.providerQuery).
   */
  private async fillAuthorizingProvider(providerQuery?: string): Promise<void> {
    const dialog = this.page.locator('[role=dialog]:has-text("BROWSE ORDERS")').last();
    // The provider input is the dialog's LAST text input — verified at
    // runtime (fbch34 2026-09-15): skipping "search"-placeholder inputs
    // lands on the wrong field and the option list never appears.
    // The Pre-Add panel renders asynchronously — a fixed 1.5s settle here
    // mirrors the verified runtime probe; grabbing inputs immediately picks
    // the order search box and no options ever appear.
    await this.page.waitForTimeout(1_500);
    const inputs = dialog.locator("input[type=text], input:not([type])");
    const count = await inputs.count();
    const provider = inputs.nth(count - 1);
    await provider.click();

    const options = this.page.locator('li[role=option], .x-boundlist-item');
    let attached = await options
      .first()
      .waitFor({ state: "attached", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!attached) await provider.press("ArrowDown");
    attached = await options
      .first()
      .waitFor({ state: "attached", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!attached && providerQuery) {
      await provider.fill("");
      await provider.pressSequentially(providerQuery, { delay: 80 });
      attached = await options
        .first()
        .waitFor({ state: "attached", timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
    }
    // The option popup may render ATTACHED but not playwright-"visible"
    // (zero-size/offscreen popper) — match the verified probe behavior:
    // wait for ATTACHED options (allTextContents sees them regardless of
    // visibility), then click by text with a force fallback.
    if (!attached) {
      const dump = await dialog
        .locator("input")
        .evaluateAll((els) =>
          els.map((e) => `${(e as HTMLInputElement).id || "?"}|ph=${(e as HTMLInputElement).placeholder}|v=${(e as HTMLInputElement).value}|vis=${(e as HTMLElement).offsetParent !== null}`).join(" ;; ")
        )
        .catch(() => "(no dump)");
      const html = await provider
        .evaluate((el) => (el.parentElement?.parentElement?.outerHTML ?? "").slice(0, 300))
        .catch(() => "(no html)");
      throw new Error(
        `Provider 候选项未出现（ArrowDown 未逼出固定列表；若本 box 需要键入查询串，请在 goals.yaml 的 discharge.providerQuery 配置）；inputs=[${dump}]；字段 DOM: ${html}`
      );
    }

    const option = options.first();
    const label = ((await option.textContent()) || "").trim();
    await option.click({ force: true }).catch(async () => option.evaluate((el: HTMLElement) => el.click()));
    await expect(provider).toHaveValue(label.length ? label : /.+/, { timeout: 10_000 });
  }

  /** Click the new-order card title to open ORDER DETAILS. */
  async openOrderDetails(orderName: string): Promise<void> {
    // Wait ONCE for whichever title rendering this build offers (racing the
    // candidates with .or() instead of timing each out sequentially — the
    // old per-candidate 4s timeouts stalled every entry for seconds, fbch34
    // 2026-09-16), then click it and fall back to the looser matches only
    // if ORDER DETAILS still does not show.
    const title = this.page
      .locator(`.x-panel-header-text:text-is("${orderName}"), .x-title:text-is("${orderName}")`)
      .last();
    const loose = this.page.getByText(orderName, { exact: true }).last();
    // This build renders the ADT card title as "<Order> patient" (e.g.
    // "Discharge patient" with a "Discharge Date" subtitle) — neither exact
    // variant matches it, so it must join the race (fbch34 2026-09-16).
    const card = this.page
      .locator(`text=/^${orderName.replace(/\s+/g, "\\s+")} patient$/`)
      .last();
    await expect(title.or(loose).or(card)).toBeVisible({ timeout: 20_000 });
    const candidates: Array<Locator> = [title, loose, card];
    for (const target of candidates) {
      if (await this.page.getByText("ORDER DETAILS").isVisible().catch(() => false)) break;
      // Press only the candidate that is ACTUALLY rendered — sequential
      // click-and-timeout on the non-matching variants stalled ~8-9s per
      // entry (fbch34 2026-09-16, user observation).
      if (!(await target.isVisible().catch(() => false))) continue;
      await target.click({ timeout: 4_000 }).catch(() => undefined);
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

  /**
   * ORDER DETAILS (verified on fbch34 2026-09-15, discharge order):
   * - It is a MIXED MUI/ExtJS form: Discharge Disposition is a MUI <p> label
   *   ("Discharge Disposition:*") followed by a MUI select whose options are
   *   li[role=option] (NOT .x-boundlist). Discharge Date is prefilled with
   *   today (mask input). Authorizing Provider is usually PREFILLED (e.g.
   *   "34494a dstest") — the Pre-Add empty-provider block from 2026-09-12
   *   does not apply here; no provider action is needed.
   * - Confirming is footer "Done" (NOT "Apply/Close"), then the NEW ORDERS
   *   panel submits via "Submit" (NOT "Save"). Save raises the usual dialog
   *   chain; Validation Dialog asks "Are you sure you wish to Save order(s)?".
   */
  async setDetailsDisposition(disposition: string): Promise<void> {
    const input = this.page
      .locator('xpath=(//p[contains(normalize-space(.),"Discharge Disposition")]//following::input)[1]')
      .first();
    await expect(input).toBeVisible({ timeout: 15_000 });
    if (await input.inputValue()) return; // already set
    await input.click();
    const option = this.page
      .locator("li[role=option]")
      .filter({ hasText: new RegExp(disposition.replace(/-/g, "-?"), "i") })
      .first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
    await expect(input).not.toHaveValue("");
  }

  /** Confirm ORDER DETAILS via its footer Done button. */
  async confirmDetailsDone(): Promise<void> {
    const done = this.page.getByRole("button", { name: "Done", exact: true }).last();
    await expect(done).toBeVisible({ timeout: 15_000 });
    await done.click();
  }

  /** Submit the NEW ORDERS panel, then run the post-submit dialog chain. */
  async submitOrder(): Promise<void> {
    const submit = this.page.getByText("Submit", { exact: true }).last();
    await expect(submit).toBeVisible({ timeout: 15_000 });
    await submit.click();
    // The save dialogs surface only after a server roundtrip — wait for the
    // first one before sweeping, else the sweep finds nothing and exits.
    await this.page
      .locator(
        ".x-window:has-text('Validation Dialog'):visible, .x-window:has-text('Screening Error'):visible, .x-window:has-text('Order Decision Support'):visible"
      )
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .catch(() => {});
    await this.handleSaveDialogs();
    // The "Save Order — printed to COMPROOM" receipt is modal when it
    // appears, but it does not always appear (and can take 15-35s) — poll
    // for EITHER the receipt (dismiss it) or the order going Active, and
    // exit as soon as one shows (fbch34 2026-09-16: a blind 60s wait here
    // stalled every run for a minute).
    const deadline = Date.now() + 45_000;
    let receiptShown = false;
    while (Date.now() < deadline) {
      if (await this.hasActiveOrder("Discharge")) return;
      const receiptText = this.page.getByText(/printed to COMPROOM/i).first();
      if (await receiptText.isVisible().catch(() => false)) {
        receiptShown = true;
        const okBtn = this.page
          .locator(".MuiDialog-root:visible, [role=dialog]:visible")
          .filter({ hasText: /printed to COMPROOM/i })
          .getByRole("button", { name: "OK" })
          .first();
        await okBtn.click().catch(() => {});
        await receiptText.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
        break;
      }
      await this.page.waitForTimeout(500);
    }
    if (receiptShown) {
      // one more sweep in case follow-up windows surfaced after the receipt
      await this.handleSaveDialogs();
    }
  }

  /** Dismiss an ExtJS window by its button text, with fallbacks (≤3 tries). */
  private async dismissXWindow(win: Locator, buttonText: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!(await win.isVisible().catch(() => false))) return;
      const btn = win.locator(`.x-btn:has-text("${buttonText}")`).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
      } else {
        await win.locator(".x-tool-close").first().click().catch(() => {});
      }
      await win.waitFor({ state: "hidden", timeout: 4_000 }).catch(() => {});
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

  /** The dialogs this build raises on Save (see file header). */
  private async handleSaveDialogs(): Promise<void> {
    // The dialog sequence varies run to run (Screening Error → Decision
    // Support → Validation Dialog, in any order, sometimes repeated), and a
    // portal "Screen Lock" window can sit on top and swallow the OK click
    // (fbch34 2026-09-15). Sweep rounds until no known window remains.
    for (let round = 0; round < 6; round++) {
      // 0) Screen Lock overlay — unlock with the session password.
      const lock = this.page.locator(".x-window:has-text('Screen Lock'):visible").last();
      if (await lock.isVisible().catch(() => false)) {
        const lockPw = lock.locator("input[type=password]").first();
        if (await lockPw.isVisible().catch(() => false)) {
          await lockPw.fill(this.env.password);
          await lockPw.press("Enter");
        }
        await lock.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
        continue;
      }
      // 1) Screening Error — "Decision Support server is down. Proceed?" → Yes
      const screening = this.page.locator(".x-window:has-text('Screening Error'):visible").last();
      if (await screening.isVisible().catch(() => false)) {
        await screening.getByText("Yes", { exact: true }).click();
        continue;
      }
      // 2) Order Decision Support info → OK
      const decision = this.page.locator(".x-window:has-text('Order Decision Support'):visible").last();
      if (await decision.isVisible().catch(() => false)) {
        await decision.getByText("OK", { exact: true }).click();
        continue;
      }
      // 3) Validation Dialog — username arrives prefilled; submit by pressing
      //    Enter in the password field (the OK button click is swallowed by
      //    this build, fbch34 2026-09-15 probe), OK click as fallback.
      const validation = this.page.locator(".x-window:has-text('Validation Dialog'):visible").last();
      if (await validation.isVisible().catch(() => false)) {
        const pw = validation.locator("input[type=password]:visible").first();
        await pw.fill(this.env.password);
        await pw.press("Enter");
        await validation.waitFor({ state: "hidden", timeout: 8_000 }).catch(() => {});
        if (await validation.isVisible().catch(() => false)) {
          await validation.locator(".x-btn:has-text('OK')").first().click();
          await validation.waitFor({ state: "hidden", timeout: 8_000 }).catch(() => {});
        }
        continue;
      }
      // 3.5) Save Order receipt — a MUI dialog (skills/oe: "MUI 'Save Order'
      //      dialog ... follows → OK"), NOT an ExtJS window. Find it by the
      //      COMPROOM text anywhere and confirm via its role=button OK.
      const receiptText = this.page.getByText(/printed to COMPROOM/i).first();
      if (await receiptText.isVisible().catch(() => false)) {
        const okBtn = this.page
          .locator(".MuiDialog-root:visible, [role=dialog]:visible")
          .filter({ hasText: /printed to COMPROOM/i })
          .getByRole("button", { name: "OK" })
          .first();
        if (await okBtn.isVisible().catch(() => false)) {
          await okBtn.click();
        } else {
          // fallback: any visible OK button near the text's dialog layer
          await this.page.getByRole("button", { name: "OK" }).last().click();
        }
        await receiptText.waitFor({ state: "hidden", timeout: 8_000 }).catch(() => {});
        continue;
      }
      // Nothing matched this round — a follow-up dialog may still be
      // surfacing; brief grace, then give up.
      await this.page.waitForTimeout(2_500);
      const pending =
        (await this.page
          .locator(".x-window:visible")
          .filter({
            hasText: /Validation Dialog|Screening Error|Order Decision Support|Screen Lock/,
          })
          .count()) ||
        (await receiptText.isVisible().catch(() => false) ? 1 : 0);
      if (!pending) break;
    }
  }

  /** The order is Active under EXISTING ORDERS (ADT group). */
  /** True when an Active row for the order already exists in EXISTING ORDERS. */
  async hasActiveOrder(orderName: string): Promise<boolean> {
    const txt = await this.page.locator("body").innerText().catch(() => "");
    return new RegExp(`${orderName}[\\s\\S]{0,400}?\\bActive\\b`).test(txt);
  }

  async expectOrderActive(orderName: string): Promise<void> {
    // The orders grid is not a <tr> table in this build (fbch34 2026-09-15):
    // assert on the panel text — the order name must be followed by an
    // Active status nearby.
    await expect
      .poll(async () => {
        const txt = await this.page.locator("body").innerText().catch(() => "");
        return new RegExp(`${orderName}[\\s\\S]{0,400}?\\bActive\\b`).test(txt);
      }, { timeout: 30_000 })
      .toBe(true);
  }
}
