// page-objects/registration/encounter.page.ts — the Registration Encounters
// sub-tab: create an Inpatient/ADT encounter and run the Admit action.
//
// Verified on fbch34 (2026-09-12):
// - Create form fields are MUI Autocompletes with input ids
//   `encounters-<name>`; options render as `li[role=option]`. A trusted
//   Playwright click on the input opens the listbox (programmatic .click()
//   does NOT).
// - `type` stays disabled until a facility is picked (#1 gotcha). Picking an
//   inpatient type auto-sets status to "Planned".
// - "Expected Date/Time" (`#encounters-expDatetime`) is a REQUIRED masked
//   text input `MM/DD/YYYY hh:mm` shown for Planned status — an empty value
//   keeps the save button disabled with no visible error.
// - Guarantor Type/Guarantor are required; a fresh patient only offers
//   type "Entity" → guarantor "Mini Reg Guarantor".
// - Success proof after Create: the right pane switches to summary mode
//   (`encounters-status-summary` etc.) and an "Admit" action button appears.
// - "Admit" expands the ADT admit sub-form (`encounters-admit-*-field`);
//   levelOfCare unlocks admitUnit/admitRoomBed (both optional). Saving via
//   "Admit Patient" flips `encounters-status-summary` to "In Progress" and
//   fills encounterId / billingNumber summaries.

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class EncounterPage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly newEncounterButton: Locator;
  readonly saveButton: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.newEncounterButton = page.getByTestId("encounters-new-encounter-button");
    this.saveButton = page.getByTestId("encounters-form-save-button");
  }

  private input(name: string): Locator {
    return this.page.locator(`#encounters-${name}`);
  }

  /** Open an Autocomplete input and pick the option whose text matches. */
  async pickAutocomplete(name: string, optionText: string): Promise<void> {
    const input = this.input(name);
    await expect(input).toBeEnabled();
    await input.click();
    const option = this.page.getByRole("option", { name: optionText, exact: true });
    await option.click();
    await expect(option).toHaveCount(0);
    await expect(input).toHaveValue(optionText);
  }

  /**
   * Open an Autocomplete/dropdown input and pick its FIRST option. Used for
   * unit / room-bed style fields whose valid values depend on the box and the
   * level of care — any value satisfies the required-field validator.
   * A field may render no options (choice list empty) — then it is skipped.
   * Returns the picked option text (null when skipped) so callers can record
   * what was chosen (e.g. the admitted unit).
   */
  async pickFirstAutocomplete(name: string): Promise<string | null> {
    const input = this.input(name);
    await expect(input).toBeEnabled();
    await input.click();
    const option = this.page.locator("li[role=option]").first();
    if (await option.isVisible().catch(() => false)) {
      const value = (await option.innerText()).trim();
      await option.click();
      await expect(this.page.locator("li[role=option]")).toHaveCount(0);
      await expect(input).toHaveValue(value);
      return value;
    }
    return null;
  }

  async clickCreateNewEncounter(): Promise<void> {
    await expect(this.newEncounterButton).toBeEnabled();
    await this.newEncounterButton.click();
    await expect(this.input("facility")).toBeVisible();
  }

  async fillExpectedDatetime(value: string): Promise<void> {
    const input = this.input("expDatetime");
    await input.fill(value);
    await expect(input).toHaveValue(value);
  }

  async save(expectedLabel: string): Promise<void> {
    await expect(this.saveButton).toHaveText(expectedLabel);
    await expect(this.saveButton).toBeEnabled();
    await this.saveButton.click();
  }

  /** After Create the form switches to summary mode; status is visible. */
  async expectStatusSummary(status: string): Promise<void> {
    await expect(this.page.getByTestId("encounters-status-summary")).toHaveText(
      status,
      { timeout: 20_000 }
    );
  }

  async clickAdmit(): Promise<void> {
    await this.page.getByRole("button", { name: "Admit", exact: true }).click();
    await expect(this.input("admit-admitPointOfOrigin")).toBeVisible();
  }

  async expectAdmitted(): Promise<void> {
    await this.expectStatusSummary("In Progress");
  }

  async readSummary(name: string): Promise<string> {
    const el = this.page.getByTestId(`encounters-${name}-summary`);
    await expect(el).toBeVisible();
    return (await el.innerText()).trim();
  }

  // ---------------------------------------------------------------- ADT: discharge

  /** Select the (single) encounter row so the details panel loads. */
  async selectEncounterRow(): Promise<void> {
    const row = this.page.locator('tr:has-text("Inpatient Acute")').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    await expect(this.page.getByTestId("encounters-encounter-details-header")).toBeVisible();
  }

  /**
   * The Discharge action is gated on a Discharge order being Active — without
   * it the panel reads "No Order in Place" and the save button stays disabled.
   */
  async startDischarge(): Promise<void> {
    await this.page.getByTestId("encounterDetails-discharge-button").click();
    await expect(this.page.getByTestId("encounters-discharge-dischargeDisposition-field")).toBeVisible(
      { timeout: 15_000 }
    );
    // The message element STAYS in the DOM after the order is detected — it
    // flips to "Order in Place" (with a green check). Assert its text, not
    // its count (count-0 hung the whole discharge slice on fbch34 2026-09-15).
    await expect(this.page.getByTestId("encounters-Discharge-order-message")).toContainText(
      /Order in Place/i, { timeout: 15_000 }
    );
  }

  async setDischargeDisposition(disposition: string): Promise<void> {
    await this.pickAutocomplete("discharge-dischargeDisposition", disposition);
  }

  async saveDischarge(): Promise<void> {
    await this.save("Discharge Patient");
  }

  /** Discharged: the encounter leaves the active list (status Finished). */
  async expectDischarged(): Promise<void> {
    await expect(
      this.page.locator('[data-testid^="encounters-status-summary"]')
    ).not.toHaveText("In Progress", { timeout: 30_000 });
  }
}
