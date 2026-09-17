// page-objects/registration/patient-create.page.ts — patient search form
// (only the MRN criterion this slice needs) + the Create New Patient dialog.
//
// Verified on fbch34 (2026-09-12):
// - MRN field `[data-testid="sf-mrn-tf"] input` is a MUI TextField (testid on
//   the wrapper div); filling it makes the search form dirty/valid, which
//   enables the Create New Patient toolbar button.
// - Dialog fields `create-patient-<name>-field` (wrapper div, inner <input>).
// - D.O.B. is a MUI X DatePicker: input id `create-patient-dateOfBirth` (no
//   -field testid). fbch34 HAS a "Choose date" toggle button; the popper has
//   NO OK button — selecting a day cell commits AND closes the popper
//   (differs from fbch19, where OK must be clicked; both paths handled).
// - Sex / State / Citizenship are MUI Select comboboxes → `li[role=option]`.
// - Submit: `create-patient-create-button`. Success proof: dialog closes and a
//   new patient tab "<last>, <first>" appears (the success toast auto-dismisses
//   too fast to be a reliable assertion).

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class PatientCreatePage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly searchMrnInput: Locator;
  readonly createNewPatientButton: Locator;
  readonly dialog: Locator;
  readonly dobInput: Locator;
  readonly createButton: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.searchMrnInput = page.locator('[data-testid="sf-mrn-tf"] input');
    this.createNewPatientButton = page.getByTestId("patient-search-create-new-pat-btn");
    this.dialog = page.locator('[role=dialog][aria-labelledby="create-patient-title"]');
    this.dobInput = page.locator("#create-patient-dateOfBirth");
    this.createButton = page.getByTestId("create-patient-create-button");
  }

  /** Fill the search MRN so the Create New Patient button unlocks. */
  async fillSearchMrn(mrn: string): Promise<void> {
    await this.searchMrnInput.fill(mrn);
    await expect(this.searchMrnInput).toHaveValue(mrn);
  }

  async openCreateDialog(): Promise<void> {
    await expect(this.createNewPatientButton).toBeEnabled();
    await this.createNewPatientButton.click();
    await expect(this.dialog).toBeVisible();
  }

  async fillTextField(fieldName: string, value: string): Promise<void> {
    const input = this.dialog.locator(`[data-testid="create-patient-${fieldName}-field"] input`);
    await input.fill(value);
    const actual = await input.inputValue();
    // The SSN field renders masked (***-**-1234); its last-4 digits prove the
    // underlying value landed. Other fields hold the literal value.
    const ok =
      actual === value ||
      (actual.includes("*") && value.replace(/\D/g, "").endsWith(actual.replace(/\D/g, "")));
    if (!ok) throw new Error(`fill ${fieldName}: expected ${value}, got "${actual}"`);
  }

  /**
   * Pick a date through the DatePicker's own calendar UI (typing into the
   * input is unreliable). `dob` is MM/DD/YYYY. Path: Choose date → year view →
   * target year → navigate months → day cell. Selecting a day commits and
   * closes on fbch34; a legacy OK button (other boxes) is clicked if present.
   */
  async pickDob(dob: string): Promise<void> {
    const [mm, dd, yyyy] = dob.split("/").map((p) => String(Number(p)));
    const chooseDate = this.dialog.locator('button[aria-label*="Choose date"]');
    // The early duplicate check can pop its dialog mid-form (intercepts every
    // click) — force-create through it before continuing (fbch34 2026-09-16).
    const dupButton = this.page.getByTestId("duplicate-patient-create-new-patient-button");
    if (await dupButton.isVisible().catch(() => false)) {
      await dupButton.click();
      await dupButton.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    }
    await chooseDate.click();

    const popper = this.page.locator(".MuiPickersLayout-root");
    await expect(popper).toBeVisible();

    // Reach the target year. The popper may already be in year view (e.g. it
    // re-opens in the last-used view) — only toggle when the year is not
    // offered, and never toggle twice (that flips back to day view).
    const yearOption = popper.getByText(yyyy, { exact: true }).first();
    if (!(await yearOption.isVisible().catch(() => false))) {
      const toYearView = popper.locator('button[aria-label*="switch to year view"]');
      if (await toYearView.isVisible().catch(() => false)) {
        await toYearView.click();
      }
    }
    await popper.getByText(yyyy, { exact: true }).first().click();

    // After the year click the calendar shows the target year in the CURRENT
    // month; walk to the target month (≤ 12 clicks either direction).
    const header = popper.locator(".MuiPickersCalendarHeader-root");
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    for (let i = 0; i < 12; i++) {
      const headerText = await header.innerText();
      if (headerText.includes(monthNames[Number(mm) - 1])) break;
      const want = Number(mm);
      const cur = monthNames.findIndex((m) => headerText.includes(m)) + 1;
      await popper
        .getByRole("button", { name: cur < want ? "Next month" : "Previous month" })
        .click();
    }

    // Day cells expose a gridcell role (not "button"); match by exact text.
    await popper
      .locator("button")
      .filter({ hasText: new RegExp(`^${dd}$`) })
      .first()
      .click();

    // fbch34: day click closes the popper. Other boxes keep it open behind an
    // OK button — commit through whichever the build provides.
    const okButton = popper.getByRole("button", { name: "OK", exact: true });
    if (await okButton.isVisible().catch(() => false)) {
      await okButton.click();
    } else if (await popper.isVisible().catch(() => false)) {
      await this.dobInput.click(); // toggles the popper closed, keeps the dialog
    }
    await expect(this.dobInput).toHaveValue(dob);
  }

  /**
   * Pick an option in one of the dialog's MUI Autocomplete/Select fields.
   * Clicking the combobox input opens the listbox on some fields; others
   * (verified: Sex) need their "Open" toggle button — try input first.
   */
  async selectOption(fieldName: string, optionText: string): Promise<void> {
    const field = this.dialog.locator(`[data-testid="create-patient-${fieldName}-field"]`);
    const options = this.page.getByRole("option", { name: optionText, exact: true });
    await field.getByRole("combobox").click();
    if (!(await options.first().isVisible().catch(() => false))) {
      await field.getByRole("button", { name: "Open" }).click();
    }
    await options.first().click();
    await expect(options).toHaveCount(0);
  }

  async submit(): Promise<void> {
    await expect(this.createButton).toBeEnabled();
    await this.createButton.click();
  }

  private duplicateDialog(): Locator {
    return this.page.getByRole("dialog", { name: /DUPLICATE/ });
  }

  /** The duplicate-patient warning blocks submission when it pops. */
  async isDuplicateWarning(): Promise<boolean> {
    return this.duplicateDialog()
      .isVisible()
      .catch(() => false);
  }

  /**
   * Wait for the outcome of a submit: the duplicate warning may be fetched
   * asynchronously, so poll until it shows OR the main dialog closes.
   * "open" = the dialog stayed open without a warning (the click was
   * swallowed by the app before — retrying the click fixes it).
   */
  async waitForSubmitOutcome(timeoutMs = 8000): Promise<"duplicate" | "closed" | "open"> {
    const t0 = Date.now();
    for (;;) {
      if (await this.isDuplicateWarning()) return "duplicate";
      if (!(await this.dialog.isVisible().catch(() => false))) return "closed";
      if (Date.now() - t0 > timeoutMs) return "open";
      await this.page.waitForTimeout(250);
    }
  }

  /**
   * The duplicate warning's own "Create New Patient" button force-creates
   * (skipDuplicateCheck). Test data uses a unique name + fresh SSN, so the
   * warning is the soft score-based one and forcing through is correct.
   */
  async forceCreateDespiteDuplicate(): Promise<void> {
    await this.page.getByTestId("duplicate-patient-create-new-patient-button").click();
  }

  /** Success = dialog closed + a patient tab "<last>, <first>" is open. */
  async expectPatientCreated(lastName: string, firstName: string): Promise<void> {
    await expect(this.dialog).toBeHidden({ timeout: 20_000 });
    await expect(
      this.page.getByRole("tab", { name: `${lastName}, ${firstName}` })
    ).toBeVisible({ timeout: 20_000 });
  }
}
