// steps/registration/open-patient-registration.step.ts — open an existing
// patient's tab in Registration (search by SSN — a primary criterion, so a
// single value is enough — then click the result's name link).

import { expect } from "@playwright/test";
import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { RegistrationAppPage } from "../../page-objects/registration/registration-app.page";

export async function openPatientRegistrationStep(
  ctx: EhrContext,
  params: ResolvedParams
): Promise<void> {
  const patient = ctx.scratch.patient as { ssn?: string; lastName?: string; mrn?: string } | undefined;
  // MRN is the preferred search key (unique, user convention 2026-09-17);
  // SSN is the fallback (also unique by generation).
  const mrn = (typeof params.mrn === "string" && params.mrn) || patient?.mrn;
  const ssn = (typeof params.ssn === "string" && params.ssn) || patient?.ssn;
  const lastName = (typeof params.lastName === "string" && params.lastName) || patient?.lastName;
  const firstName =
    (typeof params.firstName === "string" && params.firstName) || "Auto";
  if ((!mrn && !ssn) || !lastName) {
    throw new Error("open_patient_registration requires mrn (preferred) or ssn, plus lastName");
  }

  const app = new RegistrationAppPage(ctx.page, ctx.env);
  ctx.log.step("open-patient-registration", mrn ? `mrn=${mrn}` : `ssn=${ssn}`);
  // A patient chart context replaces the rail's app buttons — REGISTRATION
  // is not even in the DOM there (fbch34 2026-09-16). Escape via the Cps
  // census deep link, which rebuilds the full rail.
  if (!(await app.railButton("REGISTRATION").isVisible().catch(() => false))) {
    await ctx.page.goto(`${ctx.env.baseUrl}/Cps`, { waitUntil: "domcontentloaded" });
    // Wait for the rail to actually render instead of a fixed sleep.
    await expect
      .poll(() => app.railButton("REGISTRATION").isVisible().catch(() => false), { timeout: 20_000 })
      .toBe(true);
  }
  await app.open("REGISTRATION");
  await app.searchPatient(mrn ? { mrn } : { ssn: ssn as string });
  await app.openPatientResult(lastName, firstName);
}
