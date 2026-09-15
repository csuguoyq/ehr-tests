// steps/charge/lookup-account.step.ts — read-only Account Lookup search by
// MRN (fastest/most precise) or patient name; logs the result row.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { AccountLookupPage } from "../../page-objects/charge/account-lookup.page";

export async function lookupAccountStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const lookup = new AccountLookupPage(ctx.page, ctx.env);
  const mrn = typeof params.mrn === "string" ? params.mrn : "";
  const patientName = typeof params.patientName === "string" ? params.patientName : "";
  if (!mrn && !patientName) {
    throw new Error("该目标需要 mrn 或 patientName");
  }
  const query = mrn || patientName;
  ctx.log.step("lookup-account", `query=${query}`);

  await lookup.openFromRail("Charge Services");
  await lookup.search(query);
  // Result grid cells: name, dob, sex, MRN, SSN. A 0-result grid has no
  // cells — readFirstResultRow throws; by-MRN we also verify the literal MRN
  // is among the cells so a wrong-hit row cannot pass.
  const row = await lookup.readFirstResultRow();
  if (mrn && !row.includes(mrn)) {
    throw new Error(`Account Lookup 按 MRN ${mrn} 无结果（首行: ${JSON.stringify(row)}）`);
  }
  ctx.scratch.account = { mrn, patientName, row };
  ctx.log.info(`account row: ${JSON.stringify(row)}`);
}
