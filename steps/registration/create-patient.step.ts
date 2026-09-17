// steps/registration/create-patient.step.ts — business-atomic patient creation.
// Fills env/default values for unset params, drives the Page Object, and ends
// on a condition proving the patient exists (patient tab opened).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientCreatePage } from "../../page-objects/registration/patient-create.page";
import { generateDob, generateLastName, generateSsn } from "./patient-data";
import { str } from "../../src/utils/params";


export async function createPatientStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const patient = {
    firstName: str(params.firstName, "Auto"),
    lastName: str(params.lastName, generateLastName()),
    ssn: str(params.ssn, generateSsn()),
    dob: str(params.dob, generateDob()),
    address1: str(params.address1, "123 Main St"),
    city: str(params.city, "San Diego"),
    state: str(params.state, "CA"),
    zip: str(params.zip, "92101"),
    // Sex is picked randomly per test-data convention — never hardcoded.
    sex: str(params.sex, Math.random() < 0.5 ? "Female" : "Male"),
    citizenship: str(params.citizenship, "US Citizen"),
    searchMrn: str(params.searchMrn, "90001"),
  };

  const create = new PatientCreatePage(ctx.page, ctx.env);
  ctx.log.step("create-patient", JSON.stringify(patient));
  await create.fillSearchMrn(patient.searchMrn);
  await create.openCreateDialog();
  await create.fillTextField("firstName", patient.firstName);
  await create.fillTextField("lastName", patient.lastName);
  await create.fillTextField("ssn", patient.ssn);
  await create.fillTextField("address1", patient.address1);
  await create.fillTextField("city", patient.city);
  await create.fillTextField("zip", patient.zip);
  await create.pickDob(patient.dob);
  await create.selectOption("sex", patient.sex);
  await create.selectOption("state", patient.state);
  await create.selectOption("citizenship", patient.citizenship);

  // Two failure modes are handled here (≤3 attempts): the potential-duplicate
  // warning (force-create through the dialog's own "Create New Patient"), and
  // a submit click swallowed by the app (dialog stays open, no request).
  // The duplicate warning is a server response — it only pops after clicking,
  // so submit first and only then wait for the outcome.
  await create.submit();
  let outcome = await create.waitForSubmitOutcome();
  for (let attempt = 0; attempt < 3 && outcome !== "closed"; attempt++) {
    if (outcome === "duplicate") {
      ctx.log.warn(`duplicate warning — force create (attempt ${attempt + 1})`);
      await create.forceCreateDespiteDuplicate();
    } else {
      // "open" can be a late success (the main dialog still finishing its
      // close after a force-create, fbch34 2026-09-17 TC35118 run 1) — re-
      // check the created-patient condition before re-submitting.
      const tabVisible = await ctx.page
        .getByRole("tab", { name: `${patient.lastName}, ${patient.firstName}` })
        .isVisible()
        .catch(() => false);
      if (tabVisible) break;
      ctx.log.warn(`submit click swallowed — retry ${attempt + 1}`);
      await create.submit();
    }
    outcome = await create.waitForSubmitOutcome();
  }

  await create.expectPatientCreated(patient.lastName, patient.firstName);
  ctx.scratch.patient = patient;
  ctx.log.info(`patient created: ${patient.lastName}, ${patient.firstName} (ssn=${patient.ssn})`);
}
