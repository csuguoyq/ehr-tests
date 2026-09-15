// steps/registration/add-guarantor-self.step.ts — Guarantors tab: add a Self
// guarantor (auto-populates from patient demographics) and save.
// Selectors from ccsrc skills (ehr-workflow/registration workflows/guarantors.md).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";

export async function addGuarantorSelfStep(ctx: EhrContext, _params: ResolvedParams): Promise<void> {
  const page = ctx.page;
  const tabs = new PatientTabsPage(ctx.page, ctx.env);
  ctx.log.step("add-guarantor-self", "Guarantors tab → Add Guarantor (Self) → Save and Close");

  await tabs.openSubTab("Guarantors");
  await page.getByTestId("guarantor-overview-add-guarantor-button").click();

  const dialog = page.locator('[role="dialog"]').filter({ hasText: /Add Guarantor/i }).first();
  await dialog.waitFor({ state: "visible", timeout: 15_000 });
  // Relationship "Self" is the default chip (index 0) — click it to be sure.
  const selfChip = dialog.getByText("Self", { exact: true }).first();
  if (await selfChip.isVisible().catch(() => false)) await selfChip.click();
  // No guarantor selected → "+ Create New Guarantor" opens an empty (Self)
  // guarantor tab that auto-fills from patient demographics.
  await dialog.getByText("+ Create New Guarantor").click();

  await page.getByTestId("guarantor-form-save-and-close-button").click();
  ctx.log.info("self guarantor saved");
}
