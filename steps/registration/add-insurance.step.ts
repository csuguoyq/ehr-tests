// steps/registration/add-insurance.step.ts — Insurance tab: add a plan by
// lookup (e.g. Plan ID 68888), submit the dialog, save the form.
// Selectors from ccsrc skills (ehr-workflow/registration workflows/insurance.md).

import { expect } from "@playwright/test";
import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

export async function addInsuranceStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const planQuery = str(params.planId, "68888");
  const page = ctx.page;
  const tabs = new PatientTabsPage(ctx.page, ctx.env);
  ctx.log.step("add-insurance", `Insurance tab → Add Insurance (plan ${planQuery}) → Save`);

  await tabs.openSubTab("Insurance");
  await page.getByTestId("insurance-add-insurance-button").click();

  // Payer/plan search (debounced, min 3 chars) → results radio list.
  const search = page
    .locator('[data-testid="add-insurance-lookup-search-field"] input')
    .or(page.locator("#add-insurance-lookup-search-field"))
    .first();
  await search.waitFor({ state: "visible", timeout: 15_000 });
  await search.fill(planQuery);
  const radioGroup = page.getByTestId("add-insurance-radio-group");
  await radioGroup.waitFor({ state: "visible", timeout: 20_000 });
  // Pick the first matching plan (search by Plan ID yields the exact plan).
  await radioGroup.locator('input[type="radio"]').first().click();
  await page.getByTestId("add-insurance-dialog-submit-button").click();

  // Save the prefilled "New Insurance" form from the toolbar.
  const save = page.getByRole("button", { name: /Save and Close|Save/ }).first();
  await expect(save).toBeEnabled({ timeout: 15_000 });
  await save.click();
  ctx.log.info(`insurance saved (plan ${planQuery})`);
}
