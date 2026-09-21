// page-objects/registration/patient-tab.ts — locator for the patient chart
// tab in Registration. ExtJS truncates long tab labels with an ellipsis
// ("Worthington-Huntington-Sm...", TC35520), so exact `getByRole("tab", {
// name })` cannot match long patient names; match on a fixed prefix of
// "Last, First" instead, which stays unique for the generated/pinned names
// this suite uses.

import type { Locator, Page } from "@playwright/test";

/** Prefix length used for tab matching (well below the ExtJS label cut). */
const PREFIX_LEN = 20;

export function patientTab(page: Page, lastName: string, firstName: string): Locator {
  const label = `${lastName}, ${firstName}`;
  return page
    .getByRole("tab")
    .filter({ hasText: label.slice(0, PREFIX_LEN) });
}
