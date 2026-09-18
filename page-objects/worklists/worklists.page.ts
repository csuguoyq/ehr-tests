// page-objects/worklists/worklists.page.ts — the Worklists module (portal
// rail "WORKLIST"). Two levels (ccsrc Worklists/WorklistsMain.tsx +
// WorklistsGridPanel.tsx):
//
//   1. DIRECTORY: one row per worklist (header "Worklist Name"; rows render
//      "<name>(<systemId>)" e.g. "Coverage Change(1002)"). DOUBLE-CLICK a
//      row to open the worklist (onRowDoubleClick → openTab; a single click
//      only selects).
//   2. ITEM VIEW: a tab per open worklist; toolbar Show Columns / Transfer /
//      Defer / Complete / Export CSV + "<n> Active / <n> Deferred /
//      <n> Completed" counters; search input placeholder "Search for
//      Account" (filters by BNR OR patient name, Enter commits; empty
//      result renders "Currently No Accounts to View"); grid columns
//      MRN | Patient Name | Billing Number BNR | Number of Sub BNRs |
//      Admit Date | Discharge Date | Encounter Type | Provider | Worklist
//      Age (first column = selection checkbox).
//
//   The account search has NO Enter handler — the wlaSearchText atom updates
//   live on each onChange and re-triggers the server fetch (ContextPanel
//   useEffect deps), which then filters client-side (SearchWlalist). So a
//   search is "committed" the moment React's onChange fires (see
//   searchAccount: type per keystroke, not fill()).
//
//   COMPLETE (Complete.tsx): row checkbox → toolbar Complete → dialog
//   "The following accounts have been selected as Complete:" (Patient Name
//   | Encounter Number) + required Reason select ("Select Reason") +
//   optional Comment + Cancel/Complete. The header "Select all rows"
//   checkbox (MUI checkboxSelection) selects every filtered row at once;
//   handleComplete POSTs ALL checked ids in one updateWLAccount (one
//   Reason for all) — always complete ALL rows of a BNR: a single
//   priority reorder creates one item per changed insurance record (a
//   swap = 2 items, fbch34 2026-09-18).
//
// Surfaces verified on fbch34 2026-09-17 (TC33731 probes).

import { expect, type Locator, type Page } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export interface WorklistRow {
  /** Raw trimmed cell texts, grid order (first cell = selection checkbox). */
  cells: string[];
  mrn: string;
  patientName: string;
  bnr: string;
}

export class WorklistsPage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
  }

  private railButton(label: string): Locator {
    return this.page
      .locator(".home-non-navbtn-panel a")
      .filter({ has: this.page.locator("span", { hasText: label }) })
      .first();
  }

  /** Portal rail → WORKLIST → directory grid (no-op when already inside). */
  async open(): Promise<void> {
    const dirHeader = this.page.getByText("Worklist Name", { exact: true }).first();
    if (await dirHeader.isVisible().catch(() => false)) return;
    await this.railButton("WORKLIST").click();
    await expect(dirHeader).toBeVisible({ timeout: 30_000 });
  }

  /** Directory row for a worklist (cell text = "<name>(<systemId>)"). */
  worklistRow(name: string): Locator {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page
      .locator(".MuiDataGrid-cell")
      .filter({ hasText: new RegExp(`^${escaped}\\(\\d+\\)$`) })
      .first();
  }

  /** DOUBLE-CLICK the directory row → the worklist's item view opens. */
  async openWorklist(name: string): Promise<void> {
    await this.worklistRow(name).dblclick();
    await this.expectItemViewVisible();
  }

  async expectItemViewVisible(): Promise<void> {
    // The item view is proven by the account-search box (the "Show Columns"
    // toolbar button's accessible NAME is "Select columns" — "Show Columns"
    // is only its display text, so it does not match by role/name).
    await expect(
      this.page.locator('input[placeholder="Search for Account"]').first()
    ).toBeVisible({ timeout: 30_000 });
  }

  private searchInput(): Locator {
    return this.page.locator('input[placeholder="Search for Account"]').first();
  }

  /**
   * Search the item grid (matches BNR or patient name). The search atom
   * (wlaSearchText) is the ONLY trigger for the re-fetch — SearchInput.tsx has
   * no Enter/onKeyDown handler, the filter runs live on each onChange — and a
   * single-shot fill() can miss React's onChange (value-tracker dedupe),
   * leaving the atom stale and the grid unfiltered (seen on fbch34 run-6: the
   * value sat in the box while the grid stayed at the full 2283). So clear
   * (select-all + delete) then type per keystroke to guarantee onChange fires,
   * then wait for the grid to actually reflect the query — the search
   * re-fetches server data and filters client-side with unordered responses,
   * so a fixed sleep can't tell us it landed.
   */
  async searchAccount(query: string): Promise<void> {
    const s = this.searchInput();
    await expect(s).toBeVisible({ timeout: 15_000 });
    await s.click();
    await s.press("Control+a");
    await s.press("Delete");
    if (!query) {
      await this.page.waitForTimeout(4000);
      return;
    }
    await s.pressSequentially(query, { delay: 20 });
    await this.waitForSearchSettled(query);
  }

  /**
   * Wait until the visible rows reflect `query`: every row matches it, or the
   * grid is empty (the query matched nothing; [].every() is vacuously true).
   * Bounded — the caller's retry loop re-searches if this times out.
   */
  private async waitForSearchSettled(query: string): Promise<void> {
    const deadline = Date.now() + 12_000;
    for (;;) {
      const settled = (await this.readRows()).every((r) => this.matchesKey(r, query));
      if (settled || Date.now() > deadline) return;
      await this.page.waitForTimeout(500);
    }
  }

  async clearSearch(): Promise<void> {
    await this.searchAccount("");
  }

  private headerCells(): Locator {
    return this.page.locator(".MuiDataGrid-columnHeaders .MuiDataGrid-cell");
  }

  private dataRows(): Locator {
    return this.page.locator(".MuiDataGrid-row");
  }

  /**
   * Read the visible item rows (first cell = selection checkbox). Column
   * order is fixed by the module (MRN | Patient Name | BNR | Sub BNRs |
   * Admit | Discharge | Encounter Type | Provider | Worklist Age). The
   * header-count alignment breaks on this grid (the select-all header cell
   * is not a .MuiDataGrid-cell, and rows carry one extra cell — see the
   * BNR-anchored fallback below), so prefer the BNR cell as the anchor:
   * Patient Name is the cell before it, MRN two before it.
   */
  async readRows(): Promise<WorklistRow[]> {
    const headers = (await this.headerCells().allTextContents()).map((h) => h.trim());
    const idx = (name: string) => headers.findIndex((h) => h === name);
    const mrnIdx = idx("MRN");
    const nameIdx = idx("Patient Name");
    const bnrIdx = idx("Billing Number BNR");
    const rows = await this.dataRows().all();
    const out: WorklistRow[] = [];
    for (const r of rows) {
      const cells = (await r.locator(".MuiDataGrid-cell").allTextContents()).map((c) => c.trim());
      // The selection-checkbox column may or may not count as a header
      // cell — align by width, not by assumption.
      const shift =
        cells.length === headers.length + 1 ? 1 : cells.length === headers.length ? 0 : -1;
      const at = (i: number) => (shift >= 0 && i >= 0 ? cells[i + shift] ?? "" : "");
      const bnr = at(bnrIdx) || (cells.find((c) => /^H\d{8,}$/.test(c)) ?? "");
      const bnrCellIdx = bnr ? cells.indexOf(bnr) : -1;
      out.push({
        cells,
        mrn: at(mrnIdx) || (bnrCellIdx >= 2 ? cells[bnrCellIdx - 2] : ""),
        patientName: at(nameIdx) || (bnrCellIdx >= 1 ? cells[bnrCellIdx - 1] : ""),
        bnr,
      });
    }
    return out;
  }

  private matchesKey(row: WorklistRow, searchKey: string): boolean {
    return [row.mrn, row.patientName, row.bnr, ...row.cells].some((c) => c.includes(searchKey));
  }

  /** Rows matching `searchKey` in the visible grid (no assertion). */
  async findItems(searchKey: string): Promise<WorklistRow[]> {
    return (await this.readRows()).filter((r) => this.matchesKey(r, searchKey));
  }

  /** Expect the searched-for item to be in the Active grid (returns matches). */
  async expectItemPresent(searchKey: string): Promise<WorklistRow[]> {
    const rows = await this.readRows();
    const match = rows.filter((r) => this.matchesKey(r, searchKey));
    expect(
      match.length,
      `worklist item for "${searchKey}" not found in the Active grid; rows: ${JSON.stringify(rows.map((r) => r.cells))}`
    ).toBeGreaterThanOrEqual(1);
    return match;
  }

  /** Expect the searched-for item to NOT be in the Active grid. */
  async expectItemAbsent(searchKey: string): Promise<void> {
    const rows = await this.readRows();
    const match = rows.filter((r) => this.matchesKey(r, searchKey));
    const emptyMsg = await this.page
      .getByText("Currently No Accounts to View")
      .first()
      .isVisible()
      .catch(() => false);
    expect(
      match,
      `worklist item for "${searchKey}" should NOT be present (emptyState=${emptyMsg}); rows: ${JSON.stringify(rows.map((r) => r.cells))}`
    ).toHaveLength(0);
  }

  /**
   * Select ALL rows matching `searchKey` and Complete them in one dialog.
   *
   * A single priority REORDER changes the InsOrder of BOTH swapped insurance
   * records, so the rule engine creates ONE worklist item per changed record
   * (a swap = 2 items for the same BNR — verified on fbch34 2026-09-18:
   * completing only the first row left the counters at "1 Active /
   * 1 Completed"). The grid is already filtered to the search query
   * (waitForSearchSettled guarantees every visible row matches), so the
   * header "Select all rows" checkbox (MUI checkboxSelection) selects
   * exactly the matching rows; Complete.tsx handleComplete then POSTs all
   * selected ids in one updateWLAccount (one Reason applies to all).
   */
  async completeItem(searchKey: string): Promise<void> {
    await this.searchAccount(searchKey);
    if (!(await this.findItems(searchKey)).length) {
      throw new Error(`no selectable row for "${searchKey}"`);
    }
    // The directory grid is unmounted while a worklist tab is open, so the
    // page-level role locator resolves to the item grid's header checkbox.
    const selectAll = this.page.getByRole("checkbox", { name: "Select all rows" }).first();
    await expect(selectAll, `no select-all checkbox for "${searchKey}"`).toBeVisible({ timeout: 15_000 });
    await selectAll.click();
    await this.page.locator("button", { hasText: "Complete" }).first().click();

    const dialog = this.page.locator(".MuiDialog-root").filter({ hasText: /selected as Complete/i }).last();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    // Reason (required): the MUI Select AUTO-OPENS ~200ms after the dialog
    // opens (Complete.tsx useEffect; open={openSelectList}), so clicking the
    // select would TOGGLE the already-open list closed. Wait for the
    // auto-open; click the select only as a fallback. The first listbox li is
    // the disabled/hidden "Select Reason" placeholder, so pick a real reason
    // by text (the TC says "Complete it" — any valid reason works).
    const listbox = this.page.locator("ul[role=listbox]").last();
    let autoOpened = false;
    try {
      await expect
        .poll(() => listbox.isVisible(), { timeout: 1500 })
        .toBe(true);
      autoOpened = true;
    } catch {
      autoOpened = false;
    }
    if (!autoOpened) {
      await dialog.locator(".MuiSelect-select").first().click();
    }
    const reasonOption = this.page
      .getByRole("option", { name: "No further follow-up needed from patient" })
      .first();
    await expect(reasonOption, `reason option not listed`).toBeVisible({ timeout: 10_000 });
    await reasonOption.click();
    // The dialog's Complete button is a single-line JSX text
    // ("> Complete <") whose RAW text keeps leading/trailing spaces (JSX only
    // trims on newlines), so an anchored hasText regex misses it — match on
    // the normalized accessible NAME instead.
    await dialog.getByRole("button", { name: "Complete", exact: true }).first().click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    // The item list refetches after the Complete posts.
    await this.page.waitForTimeout(4000);
  }

  /** The item-view counters, e.g. "2274 Active / 0 Deferred / 0 Completed". */
  async readCounters(): Promise<{ active: number; deferred: number; completed: number }> {
    const text = await this.page.locator("body").innerText();
    // The counters render "<n> Active" (number BEFORE the word).
    const pick = (name: string) => {
      const m = text.match(new RegExp(`(\\d+)\\s+${name}\\b`, "i"));
      return m ? Number(m[1]) : -1;
    };
    return { active: pick("Active"), deferred: pick("Deferred"), completed: pick("Completed") };
  }
}
