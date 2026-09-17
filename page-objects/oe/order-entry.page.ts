// page-objects/oe/order-entry.page.ts — CPOE2 (Order Entry) as reached from a
// patient chart: BROWSE ORDERS → ADT Orders → Discharge → Add → ORDER DETAILS
// → Done → Submit, including this build's confirmation dialogs.
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
// - Confirming ORDER DETAILS is footer "Done" (NOT "Apply/Close"); the NEW
//   ORDERS panel submits via "Submit" (NOT "Save"). Submit raises, in order:
//   "Screening Error" (Yes), "Order Decision Support" (OK), "Validation
//   Dialog" (password must be re-entered; empty = silent no-op). The order
//   then shows under EXISTING ORDERS with State "Active".
//
// This PO exposes ATOMIC ACTIONS + locators only (iron rule 2): business
// decisions (provider fallback when Add is disabled, submit completion
// polling) live in steps/oe/*.step.ts.

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";
import { retryUntil } from "../../src/utils/retry";

export class OrderEntryPage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
  }

  /**
   * Click a toolbar button by visible label. This build mixes plain
   * `<button>` (e.g. Browse) with ExtJS buttons (x-btn-inner spans); a
   * sticky x-mask can intercept real clicks, so fall back to dispatching
   * the mouse sequence on the ExtJS button element.
   */
  private async clickBtn(label: string): Promise<void> {
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const roleBased = this.page
      .getByRole("button", { name: new RegExp(escapeRe(label), "i") })
      .first();
    if (await roleBased.isVisible().catch(() => false)) {
      await roleBased.click();
      return;
    }
    const ext = this.page.locator(".x-btn", { hasText: new RegExp(`^${escapeRe(label)}$`) }).last();
    await expect(ext).toBeVisible({ timeout: 15_000 });
    await ext.click({ timeout: 5_000 }).catch(async () => {
      await ext.evaluate((el) => {
        ["mousedown", "mouseup", "click"].forEach((type) =>
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
        );
      });
    });
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

  /** Current "Add (n)" counter value (0 when the footer is absent). */
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

  /** Open the BROWSE ORDERS picker via the Browse toolbar button. */
  async openBrowseOrders(): Promise<void> {
    await this.clickBtn("Browse");
    await expect(this.page.getByText("BROWSE ORDERS")).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Click the Non-Meds chip when this layout offers one (ADT needs it —
   * with Medications the order list stays empty). Returns whether the chip
   * existed; both renderings (chip / flat list) are valid on this build.
   */
  async clickNonMedsChipIfPresent(): Promise<boolean> {
    const nonMeds = this.page.getByRole("button", { name: "Non-Meds", exact: true });
    if (!(await nonMeds.isVisible().catch(() => false))) return false;
    await nonMeds.click();
    return true;
  }

  /**
   * Select a category node in BROWSE ORDERS (this build's tree node is
   * exactly "ADT"). The 1s settle after the click is a verified settle wait
   * (fbch34 2026-09-15): multi-candidate list-entry clicks left the Pre-Add
   * footer half-rendered (provider field without options) — the fixed
   * single sequence is the verified workaround.
   */
  async selectCategory(name = "ADT"): Promise<void> {
    await this.page.getByText(name, { exact: true }).first().click();
    await this.page.waitForTimeout(1_000);
  }

  /**
   * Tick the CHECKBOX of an order row in the Name grid and VERIFY against
   * the Add counter (clicking the row text only filters — the counter stays
   * 0 until the checkbox is ticked). The row is a div grid ([role=cell], no
   * <td>); the checkbox may need a JS click fallback, hence retryUntil.
   */
  async tickOrderRow(orderName: string): Promise<void> {
    const row = this.page
      .locator("tr.x-grid-row, [role=row]")
      .filter({ hasText: new RegExp(orderName.replace(/\s+/g, "\\s+"), "i") })
      .first();
    await row.waitFor({ state: "visible", timeout: 15_000 });
    const candidates = [
      row.locator("input[type=checkbox], [role=checkbox]").first(),
      row.locator("[role=cell], td").first(),
    ];
    await retryUntil(
      async () => {
        for (const candidate of candidates) {
          if ((await this.addCounter()) > 0) return "ticked";
          await candidate
            .click({ timeout: 4_000, force: true })
            .catch(async () => candidate.evaluate((el: HTMLElement) => el.click()));
          await this.page.waitForTimeout(1_500);
        }
        return "unticked";
      },
      async (r) => r === "ticked" || (await this.addCounter()) > 0,
      `tick ${orderName}: Add counter still 0 (neither checkbox nor cell click took effect)`
    );
  }

  /** Whether the "Add (n)" footer button is currently enabled. */
  async isAddEnabled(): Promise<boolean> {
    const addButton = this.page.getByRole("button", { name: /^Add \([1-9]\d*\)$/ }).last();
    return addButton.isEnabled().catch(() => false);
  }

  /** Click the enabled Add button; the BROWSE ORDERS dialog closes on success. */
  async clickAdd(): Promise<void> {
    const addButton = this.page.getByRole("button", { name: /^Add \([1-9]\d*\)$/ }).last();
    try {
      await expect(addButton).toBeEnabled({ timeout: 20_000 });
    } catch (e) {
      const dialog = this.browseDialog();
      const text = await dialog.innerText().catch(() => "(no dialog)");
      const inputs = await dialog
        .locator("input")
        .evaluateAll((els) =>
          els.map((e) => `${(e as HTMLInputElement).placeholder || e.id || "?"}="${(e as HTMLInputElement).value}"`).join(" | ")
        )
        .catch(() => "(no inputs)");
      throw new Error(
        `Add button still disabled; inputs: ${inputs}\nBROWSE ORDERS tail: ${text.slice(-1200)}`
      );
    }
    await this.clickWithFallback(addButton);
    await expect(this.page.getByText("BROWSE ORDERS")).toHaveCount(0, { timeout: 20_000 });
  }

  /** The BROWSE ORDERS dialog (last rendered — earlier ghosts linger in DOM). */
  browseDialog(): Locator {
    return this.page.locator('[role=dialog]:has-text("BROWSE ORDERS")').last();
  }

  /**
   * Make the Authorizing Provider boundlist appear, WITHOUT picking: open
   * the list and, only if a typed query is configured, type it (the panel
   * filters STARTSWITH over a fixed choice list, so a broad query like
   * "tes" can never match — verified fbch34, PROJECT.md phase 5; a box
   * needing a typed query must pass providerQuery, goals.yaml
   * discharge.providerQuery). Throws with an input dump when no option
   * list ever attaches.
   */
  async revealProviderOptions(providerQuery?: string): Promise<void> {
    const dialog = this.browseDialog();
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

    const options = this.providerOptions();
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
        `Provider candidates never appeared (ArrowDown did not force the fixed list; if this box needs a typed query, configure discharge.providerQuery in goals.yaml); inputs=[${dump}]; field DOM: ${html}`
      );
    }
  }

  /** Currently open option list (MUI li[role=option] OR ExtJS boundlist). */
  providerOptions(): Locator {
    return this.page.locator("li[role=option], .x-boundlist-item");
  }

  /**
   * Click the FIRST candidate in the open option list and return its label.
   * Choosing "first candidate" is the caller's convention (user convention
   * 2026-09-16); this atom only clicks and verifies the input took the value.
   * The popup may render ATTACHED but not playwright-"visible" (zero-size/
   * offscreen popper) — hence the force fallback.
   */
  async pickFirstOption(): Promise<string> {
    const option = this.providerOptions().first();
    const label = ((await option.textContent()) || "").trim();
    await option.click({ force: true }).catch(async () => option.evaluate((el: HTMLElement) => el.click()));
    return label;
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
      throw new Error(`Cannot open ORDER DETAILS; NEW ORDERS panel: ${panel.slice(-600)}`);
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

  /** Confirm ORDER DETAILS via its footer Done button (NOT "Apply/Close"). */
  async confirmDetailsDone(): Promise<void> {
    const done = this.page.getByRole("button", { name: "Done", exact: true }).last();
    await expect(done).toBeVisible({ timeout: 15_000 });
    await done.click();
  }

  /** Click the NEW ORDERS panel Submit button (NOT "Save"). */
  async clickSubmit(): Promise<void> {
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

  /**
   * Dismiss the dialogs this build raises on Submit (see file header).
   * The dialog sequence varies run to run (Screening Error → Decision
   * Support → Validation Dialog, in any order, sometimes repeated), and a
   * portal "Screen Lock" window can sit on top and swallow the OK click
   * (fbch34 2026-09-15). Sweep rounds until no known window remains.
   */
  async dismissSaveDialogs(): Promise<void> {
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
      if (await this.dismissReceiptIfShown()) continue;
      // Nothing matched this round — a follow-up dialog may still be
      // surfacing; brief grace, then give up.
      await this.page.waitForTimeout(2_500);
      const pending =
        (await this.page
          .locator(".x-window:visible")
          .filter({
            hasText: /Validation Dialog|Screening Error|Order Decision Support|Screen Lock/,
          })
          .count()) || (await this.receiptVisible() ? 1 : 0);
      if (!pending) break;
    }
  }

  /** The "Save Order — printed to COMPROOM" receipt text, when rendered. */
  private async receiptVisible(): Promise<boolean> {
    return this.page.getByText(/printed to COMPROOM/i).first().isVisible().catch(() => false);
  }

  /**
   * Dismiss the Save Order receipt if it is showing. Returns whether it was
   * shown (the submit completion poll in submit-order.step.ts uses this as
   * the observable "server accepted the order" signal).
   */
  async dismissReceiptIfShown(): Promise<boolean> {
    const receiptText = this.page.getByText(/printed to COMPROOM/i).first();
    if (!(await receiptText.isVisible().catch(() => false))) return false;
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
    return true;
  }

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
