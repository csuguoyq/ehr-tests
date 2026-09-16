// steps/registration/add-insurance.step.ts — Insurance tab: add a plan by
// lookup (e.g. Plan ID 68888), submit the dialog, save the form.
// Selectors from ccsrc skills (ehr-workflow/registration workflows/insurance.md).

import { expect } from "@playwright/test";
import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";
import { InsurancePage } from "../../page-objects/registration/insurance.page";

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

  // The form leaves many required fields empty (fbch34 2026-09-16: Insurance
  // Type, Member ID, Effective Date, Relationship, Subscriber section) and
  // Save stays disabled until they are filled — fill Testbot defaults.
  const insurance = new InsurancePage(page, ctx.env);
  const stamp = Date.now().toString().slice(-8);
  const patient = ctx.scratch.patient as
    | { lastName?: string; firstName?: string; dob?: string; sex?: string }
    | undefined;
  const today = new Date();
  // const localMmddyyyy = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
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

  // Toolbar order is [Save, Save and Close]; "Save" is the proven path —
  // "Save and Close" stays disabled in some states (fbch34 2026-09-16).
  const save = page.getByRole("button", { name: "Save", exact: true }).first();
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await save.click();
  // Saving from the toolbar can leave the form open; the next navigation then
  // pops an "Unsaved Changes" confirm — resolve it with Save Changes.
  const unsavedAfterSave = page
    .locator("[role=dialog], .x-window, .MuiDialog-root")
    .filter({ hasText: /Unsaved Changes/i })
    .first();
  if (await unsavedAfterSave.isVisible().catch(() => false)) {
    const keepNow = unsavedAfterSave.getByRole("button", { name: /Save Changes/i }).first();
    if (await keepNow.isVisible().catch(() => false)) {
      await keepNow.click();
    }
  }
  ctx.log.info(`insurance saved (plan ${planQuery})`);

  // A dirty flag can linger after saving; the NEXT navigation (e.g. the
  // encounter form) then hits an "Unsaved Changes" modal. Provoke it now on
  // a harmless sub-tab switch and resolve it with Save Changes.
  await tabs.subTab("Demographics").click();
  const unsaved = page
    .locator("[role=dialog], .x-window, .MuiDialog-root")
    .filter({ hasText: /Unsaved Changes/i })
    .first();
  if (await unsaved.isVisible().catch(() => false)) {
    const keep = unsaved.getByRole("button", { name: /Save Changes/i }).first();
    await expect(keep).toBeVisible({ timeout: 10_000 });
    await keep.click();
    ctx.log.info("unsaved-changes confirm resolved (Save Changes)");
  }
  await tabs.openSubTab("Demographics");
}
