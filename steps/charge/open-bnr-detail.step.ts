// steps/charge/open-bnr-detail.step.ts — open the Charge Services app from the
// rail and reach the patient's Hospital BNR detail view (Account Summary /
// Charges / Coding / ... tabs).
// Patient identity: explicit `patientName` param, else the patient generated
// earlier in the same flow execution (ctx.scratch.patient).

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { AccountLookupPage } from "../../page-objects/charge/account-lookup.page";

/** Shared patient reference for Charge Services goals. */
export function resolvePatientName(ctx: EhrContext, params: ResolvedParams): string {
  const name =
    (typeof params.patientName === "string" && params.patientName) ||
    (ctx.scratch.patient as { lastName?: string } | undefined)?.lastName;
  if (!name) {
    throw new Error(
      "该目标需要 patientName（患者姓氏），或与 create_encounter 在同一次编排中运行以复用其生成的新患者"
    );
  }
  return name;
}

export async function openBnrDetailStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const patientName = resolvePatientName(ctx, params);
  const lookup = new AccountLookupPage(ctx.page, ctx.env);
  ctx.log.step("open-bnr-detail", `patient=${patientName}`);

  await lookup.openFromRail("Charge Services");
  await lookup.search(patientName);
  await lookup.openPatientAccount(patientName);
  await lookup.openFirstBnrDetail();
}
