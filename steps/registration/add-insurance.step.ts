// steps/registration/add-insurance.step.ts — Insurance tab: add a plan by
// lookup (e.g. Plan ID 68888), submit the dialog, fill the Testbot defaults,
// save. All selectors live in InsurancePage (review 2026-09-17 H2/M1).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";
import { InsurancePage } from "../../page-objects/registration/insurance.page";
import { RegistrationAppPage } from "../../page-objects/registration/registration-app.page";
import { str } from "../../src/utils/params";


export async function addInsuranceStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const planQuery = str(params.planId, "68888");
  const tabs = new PatientTabsPage(ctx.page, ctx.env);
  const insurance = new InsurancePage(ctx.page, ctx.env);
  ctx.log.step("add-insurance", `Insurance tab → Add Insurance (plan ${planQuery}) → Save`);

  // bounded-retry variant: the sub-tab click is occasionally swallowed while
  // the chart finishes rendering (fbch34 2026-09-21, TC35520 run)
  // The app's late duplicate check can KICK BACK to the Registration search
  // screen (SSN prefilled, created patient in the results) after the chart
  // was opened — reopen the patient from the results before switching tabs
  // (fbch34 2026-09-21, TC35520: same-name test patients accumulate).
  const tabs2 = new PatientTabsPage(ctx.page, ctx.env);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await tabs.subTab("Insurance").isVisible().catch(() => false)) break;
    await ctx.page.waitForTimeout(2_000);
    if (await ctx.page.locator('[data-testid^="cci-patient-name-"]').first().isVisible().catch(() => false)) {
      await ctx.page.locator('[data-testid^="cci-patient-name-"]').first().click();
      await ctx.page.waitForTimeout(2_500);
    }
    await tabs2.dismissDuplicateWarningIfPresent();
  }

  await tabs.dismissDuplicateWarningIfPresent();
  await tabs.openSubTabResolvingUnsaved("Insurance");
  await insurance.openLookupDialog();
  await insurance.lookupAndPickFirstPlan(planQuery);

  // The form leaves many required fields empty (fbch34 2026-09-16: Insurance
  // Type, Member ID, Effective Date, Relationship, Subscriber section) and
  // Save stays disabled until they are filled — fill Testbot defaults.
  const stamp = Date.now().toString().slice(-8);
  const patient = ctx.scratch.patient;
  await insurance.pickOption("Insurance Type", /Medical/i, "Medical");
  await insurance.fillText("Member ID or #", `TB${stamp}`);
  await insurance.fillToday("Effective Date");
  await insurance.pickOption("Relationship to Subscriber", /Self/i, "Self");
  // Subscriber mirrors the patient (Self).
  await insurance.fillText("Subscriber ID", `TB${stamp}`);
  await insurance.fillText("Subscriber First Name", patient?.firstName || "Auto");
  await insurance.fillText("Subscriber Last Name", patient?.lastName || "Testbot");
  await insurance.fillText("Subscriber Address", "123 Main St");
  await insurance.fillText("Subscriber City", "San Diego");
  await insurance.pickOption("Subscriber State", /California/i, "CA");
  await insurance.fillText("Subscriber Zip", "92101");
  await insurance.fillToday("Subscriber D.O.B.");
  await insurance.pickOption(
    "Subscriber Sex",
    new RegExp(patient?.sex || "Male", "i"),
    patient?.sex || "Male"
  );
  await insurance.pickOption("Subscriber Country", /United States/i, "United States");
  // The phone field arrives pre-filled with a PARTIAL invalid value.
  await insurance.fillPhone("Subscriber Phone", "5551234567");

  await insurance.saveForm();
  ctx.log.info(`insurance saved (plan ${planQuery})`);

  // A dirty flag can linger after saving; the NEXT navigation (e.g. the
  // encounter form) would then hit an "Unsaved Changes" modal. Settle on
  // Demographics, resolving the guard dialog if it appears — it is raised
  // asynchronously and unmounts the tab bar, so it must be waited for, not
  // checked with an immediate isVisible() (which races it in and misses it).
  await tabs.openSubTabResolvingUnsaved("Demographics");
  ctx.log.info("settled on Demographics (unsaved-changes guard resolved if raised)");
}
