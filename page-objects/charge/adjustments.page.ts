// page-objects/charge/adjustments.page.ts — the BNR Billing tab "Adjustments"
// accordion section: its "Add" button opens the Add Adjustment dialog
// (CciDialog, testid cci-dialog) with Transaction Code / Amount / Balance Type
// / Claim ID (conditional) / Notes and Cancel + Save.
//
// From source (ccsrc ehr/src/Charge/Claim/components/AdjustmentDialog.tsx +
// Billing/AdjustmentTable.tsx), runtime-verified on fbch34 (SZ35253 slice):
// - The section "Add" button opens the dialog with Balance Type editable.
// - Transaction Code & Balance Type are MUI Autocompletes (placeholder
//   "Make Selection"); options render as li[role=option] in a body portal.
// - Amount is a text input; Notes a textarea (300 char max).
// - Transaction code labels look like "0001 (Transfer Patient to Insurance)".

import { expect, type Page, type Locator } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class AdjustmentsPage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly adjustmentsSection: Locator;
  readonly addButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.adjustmentsSection = page.locator(".MuiAccordion-root", { hasText: "Adjustments" });
    this.addButton = this.adjustmentsSection.getByRole("button", { name: "Add", exact: true });
    this.dialog = page.getByTestId("cci-dialog");
  }

  /** Open the Add Adjustment dialog from the Adjustments section. */
  async openAddDialog(): Promise<void> {
    await expect(this.addButton).toBeVisible({ timeout: 20_000 });
    await this.addButton.click();
    await expect(this.dialog).toBeVisible({ timeout: 15_000 });
    await expect(this.dialog).toContainText("Add Adjustment");
  }

  /**
   * The dialog field for a visible label: the label lives in its own grid
   * cell, the input in the immediately following sibling cell.
   */
  private fieldInput(label: string): Locator {
    const labelCell = this.dialog
      .locator(".MuiGrid-item")
      .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) })
      .first();
    return labelCell.locator("xpath=following-sibling::*[1]").locator("input").first();
  }

  /** Pick an option from one of the dialog's autocompletes by its label text. */
  async pickField(label: string, optionText: RegExp): Promise<void> {
    const input = this.fieldInput(label);
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.click();
    const option = this.page.locator("li[role=option]", { hasText: optionText }).first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
  }

  /**
   * Amount: TRANSFER-type transaction codes auto-fill the full balance and
   * LOCK the input (fbch34 2026-09-16) — in that case adopt the locked value
   * and ignore the preferred one; otherwise fill the preferred amount.
   */
  async resolveAmount(preferred: string): Promise<string> {
    const amount = this.fieldInput("Amount");
    await expect(amount).toBeVisible({ timeout: 10_000 });
    if (await amount.isDisabled().catch(() => false)) {
      return amount.inputValue();
    }
    await amount.fill(preferred);
    await expect(amount).toHaveValue(preferred);
    return preferred;
  }

  async setNotes(text: string): Promise<void> {
    await this.dialog.locator("textarea").first().fill(text);
  }

  /** Save the adjustment and wait for the dialog to close. */
  async save(): Promise<void> {
    const save = this.dialog.getByRole("button", { name: "Save" });
    await expect(save).toBeEnabled({ timeout: 15_000 });
    await save.click();
    await expect(this.dialog).toBeHidden({ timeout: 20_000 });
  }
}
