// src/utils/mui-date.ts — shared MUI X Date Picker ladder (Slice C1,
// 2026-09-18): merged from the two identical paths in patient-create
// pickDob and insurance setReorderEffectiveDate.
//
// The caller owns the SURFACE (open the dialog/popper, locate the
// .MuiPickersLayout-root and the input that must end up holding the value);
// this helper owns the ALGORITHM: year view (idempotent toggle) → month
// navigation → day click → commit (OK button when the build keeps the
// popper open, clicking the input as the fbch34-style toggle-closed
// fallback).

import { expect, type Locator, type Page } from "@playwright/test";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Pick `date` (MM/DD/YYYY) in an OPEN MUI picker popper, then commit it.
 * @param popper the .MuiPickersLayout-root locator (already expected visible
 *   by the caller, re-asserted here)
 * @param commitInput the masked input that must hold the picked value —
 *   also the toggle-closed fallback when the popper has no OK button
 */
export async function pickMuiDate(
  page: Page,
  popper: Locator,
  date: string,
  commitInput: Locator
): Promise<void> {
  const [mm, dd, yyyy] = date.split("/").map((p) => String(Number(p)));
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
  for (let i = 0; i < 12; i++) {
    const headerText = await header.innerText();
    if (headerText.includes(MONTH_NAMES[Number(mm) - 1])) break;
    const want = Number(mm);
    const cur = MONTH_NAMES.findIndex((m) => headerText.includes(m)) + 1;
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
    await commitInput.click(); // toggles the popper closed, keeps the dialog
  }
  await expect(commitInput).toHaveValue(date);
}

/** Open the picker from a "Choose date" icon button and return the popper. */
export async function openMuiPicker(
  page: Page,
  chooseDateButton: Locator
): Promise<Locator> {
  await chooseDateButton.first().click();
  const popper = page.locator(".MuiPickersLayout-root").last();
  await expect(popper).toBeVisible();
  return popper;
}
