// steps/registration/create-encounter.step.ts — create an Inpatient (ADT)
// encounter for the currently open patient.
// Scope (phase 2): encounterType "Inpatient Acute" via the plain Create
// Encounter (CENC) path. patientMode "existing" is registered but not
// implemented yet (opening an existing patient by MRN is its own slice).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { PatientTabsPage } from "../../page-objects/registration/patient-tabs.page";
import { EncounterPage } from "../../page-objects/registration/encounter.page";

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

/** Expected Date/Time, one hour ahead of the BROWSER's clock (mask MM/DD/YYYY hh:mm). */
async function expectedDatetime(ctx: EhrContext): Promise<string> {
  const now = new Date(await ctx.page.evaluate(() => new Date().getTime()) + 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(now.getMonth() + 1)}/${p(now.getDate())}/${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

export async function createEncounterStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  // The Flow guarantees the right patient is open before this runs:
  //  - patientMode=new       → a fresh patient was just created
  //  - patientMode=existing  → the existing patient was opened by SSN
  // So this step is patient-agnostic: it creates the encounter for whoever is open.
  // Only "api" is still unimplemented.
  if (params.patientMode === "api") {
    throw new Error(
      `patientMode "api" 尚未实现：本切片支持 new（新患者）与 existing（已有患者，按 SSN 打开）。`
    );
  }

  // Default: no in-form guarantor pick — a Person (Self) guarantor is added
  // on the Guarantors tab by the flow (Entity "Mini Reg Guarantor" cannot
  // match insurance coverage; SZ35253 manual recording 2026-09-16).
  const opts = {
    facility: str(params.facility, "San Diego Medical Center - Cove Community Hospital"),
    encounterType: str(params.encounterType, "Inpatient Acute"),
    expectedDatetime: str(params.expectedDatetime, await expectedDatetime(ctx)),
    guarantorType: str(params.guarantorType, "skip"),
    guarantor: str(params.guarantor, "skip"),
    admitType: str(params.admitType, "Elective"),
  };

  const tabs = new PatientTabsPage(ctx.page, ctx.env);
  const encounter = new EncounterPage(ctx.page, ctx.env);
  ctx.log.step("create-encounter", JSON.stringify(opts));

  await tabs.openSubTab("Encounters");
  await encounter.clickCreateNewEncounter();
  await encounter.pickAutocomplete("facility", opts.facility);
  await encounter.pickAutocomplete("type", opts.encounterType);
  await encounter.fillExpectedDatetime(opts.expectedDatetime);
  await encounter.pickAutocomplete("admitType", opts.admitType);
  // guarantorType "skip" → leave the form defaults untouched (used when a
  // real Person guarantor was added on the Guarantors tab — Entity "Mini Reg
  // Guarantor" cannot match insurance, SZ35253 manual recording 2026-09-16).
  if (opts.guarantorType !== "skip") {
    await encounter.pickAutocomplete("guarantorType", opts.guarantorType);
  }
  if (opts.guarantor !== "skip") {
    await encounter.pickAutocomplete("guarantor", opts.guarantor);
  }
  await encounter.save("Create Encounter");
  await encounter.expectStatusSummary("Planned");
}
