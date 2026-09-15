// steps/charge/coding-complete.step.ts — diagnose (admit + principal), set the
// discharge disposition on the ADT sub-tab, and complete coding.
// Requires the BNR detail view (openBnrDetailStep) to have run.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { CodingPage } from "../../page-objects/charge/coding.page";

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

export async function codingCompleteStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const admitDiagnosis = str(params.admitDiagnosis, "I69.941");
  const principalDiagnosis = str(params.principalDiagnosis, "S94.10XD");
  const dischargeDisposition = str(params.dischargeDisposition, "Home or self-care");

  const coding = new CodingPage(ctx.page, ctx.env);
  ctx.log.step(
    "coding-complete",
    `admit=${admitDiagnosis} principal=${principalDiagnosis} disposition=${dischargeDisposition}`
  );

  await coding.open();
  await coding.fillDiagnoses(admitDiagnosis, principalDiagnosis);
  await coding.saveDiagnoses();
  await coding.expectDiagnosesSaved([admitDiagnosis, principalDiagnosis]);
  await coding.setDischargeDisposition(dischargeDisposition);
  await coding.complete();
  ctx.scratch.coding = { admitDiagnosis, principalDiagnosis, dischargeDisposition };
  ctx.log.info(`coding complete: ${admitDiagnosis} + ${principalDiagnosis}, ${dischargeDisposition}`);
}
