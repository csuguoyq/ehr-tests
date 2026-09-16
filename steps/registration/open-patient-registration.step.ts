// steps/registration/open-patient-registration.step.ts — open an existing
// patient's tab in Registration (search by SSN — a primary criterion, so a
// single value is enough — then click the result's name link).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { RegistrationAppPage } from "../../page-objects/registration/registration-app.page";

export async function openPatientRegistrationStep(
  ctx: EhrContext,
  params: ResolvedParams
): Promise<void> {
  const patient = ctx.scratch.patient as { ssn?: string; lastName?: string } | undefined;
  const ssn = (typeof params.ssn === "string" && params.ssn) || patient?.ssn;
  const lastName = (typeof params.lastName === "string" && params.lastName) || patient?.lastName;
  const firstName =
    (typeof params.firstName === "string" && params.firstName) || "Auto";
  if (!ssn || !lastName) throw new Error("open_patient_registration 需要 ssn 与 lastName");

  const app = new RegistrationAppPage(ctx.page, ctx.env);
  ctx.log.step("open-patient-registration", `ssn=${ssn}`);
  // A patient chart context replaces the rail's app buttons — REGISTRATION
  // is not even in the DOM there (fbch34 2026-09-16). Escape via the Cps
  // census deep link, which rebuilds the full rail.
  if (!(await app.railButton("REGISTRATION").isVisible().catch(() => false))) {
    await ctx.page.goto(`${ctx.env.baseUrl}/Cps`, { waitUntil: "domcontentloaded" });
    await ctx.page.waitForTimeout(2_000);
  }
  await app.open("REGISTRATION");

  const ssnInput = ctx.page.locator('[data-testid="sf-ssn-tf"] input');
  await ssnInput.fill(ssn);
  await ssnInput.press("Enter");

  const nameLink = ctx.page.getByTestId(`cci-patient-name-${lastName}, ${firstName}`).first();
  await nameLink.waitFor({ state: "visible", timeout: 30_000 });
  await nameLink.click();
  await ctx.page.getByRole("tab", { name: `${lastName}, ${firstName}` }).waitFor({ timeout: 20_000 });
}
