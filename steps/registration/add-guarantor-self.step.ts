// steps/registration/add-guarantor-self.step.ts — Guarantors tab: add a Self
// guarantor (auto-populates from patient demographics) and save.
// Selectors live in GuarantorsPage (review 2026-09-17 H2).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";
import { GuarantorsPage } from "../../page-objects/registration/guarantors.page";

export async function addGuarantorSelfStep(ctx: EhrContext, _params: ResolvedParams): Promise<void> {
  const tabs = new PatientTabsPage(ctx.page, ctx.env);
  const guarantors = new GuarantorsPage(ctx.page, ctx.env);
  ctx.log.step("add-guarantor-self", "Guarantors tab → Add Guarantor (Self) → Save and Close");

  await tabs.openSubTab("Guarantors");
  await guarantors.addSelf();
  // the duplicate check completes async and its warning overlays the page
  await tabs.dismissDuplicateWarningIfPresent();
  ctx.log.info("self guarantor saved");
}
