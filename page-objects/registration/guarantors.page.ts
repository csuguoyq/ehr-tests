// page-objects/registration/guarantors.page.ts — the Registration Guarantors
// sub-tab: add a guarantor via the overview's "+ Create New Guarantor" flow.
// Testids from ccsrc skills (ehr-workflow/registration workflows/guarantors.md),
// verified on fbch34 2026-09-16.

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class GuarantorsPage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
  }

  /**
   * Add a SELF guarantor: "+ Create New Guarantor" opens an empty (Self)
   * guarantor tab that auto-fills from patient demographics. Relationship
   * "Self" is the default chip (index 0) — clicking it is just insurance.
   */
  async addSelf(): Promise<void> {
    await this.page.getByTestId("guarantor-overview-add-guarantor-button").click();

    const dialog = this.page
      .locator('[role="dialog"]')
      .filter({ hasText: /Add Guarantor/i })
      .first();
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
    const selfChip = dialog.getByText("Self", { exact: true }).first();
    if (await selfChip.isVisible().catch(() => false)) await selfChip.click();
    await dialog.getByText("+ Create New Guarantor").click();

    await this.page.getByTestId("guarantor-form-save-and-close-button").click();

    // The save can be intercepted by the async duplicate check:
    // "WARNING: POTENTIAL DUPLICATE(S) DETECTED" with Create New Guarantor
    // Record / Use Existing Record / Cancel. The X close CANCELS the save and
    // leaves the form dirty (every later sub-tab click then hits the Unsaved
    // Changes guard, fbch34 2026-09-21) — confirm creation instead, which
    // completes the save and closes the form.
    const dup = this.page
      .locator("[role=dialog], .MuiDialog-root")
      .filter({ hasText: /POTENTIAL DUPLICATE/i })
      .first();
    const confirm = dup.getByRole("button", { name: /Create New Guarantor Record/i });
    await confirm.click({ timeout: 10_000 }).catch(() => {});
    // Either way the guarantor form closes after a successful save.
    await expect(dup).toBeHidden({ timeout: 15_000 }).catch(() => {});
  }
}
