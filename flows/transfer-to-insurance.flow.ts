// flows/transfer-to-insurance.flow.ts — goal "transfer_to_insurance":
// SZ35253 (TC35253) adapted to the fbch34 build. The TC assumes charges land
// on the guarantor card without a billing cycle; here the balance only
// reaches the guarantor card through the billing cycle (SZ33989: billing
// with NO insurance generates no claim and posts the amount to the
// guarantor's card). So: discharge (order + encounter) → Start/Force Bill
// (self-pay → no claim, guarantor balance populated) → register insurance →
// Add Adjustment 0001 "Transfer Patient to Insurance" (full balance).

import type { FlowDefinition } from "../src/types/flow";
import { openBnrDetailStep } from "../steps/charge/open-bnr-detail.step";
import { openPatientChartStep } from "../steps/registration/open-patient-chart.step";
import { dischargeOrderStep } from "../steps/oe/discharge-order.step";
import { openPatientRegistrationStep } from "../steps/registration/open-patient-registration.step";
import { dischargeEncounterStep } from "../steps/registration/discharge-encounter.step";
import { codingCompleteStep } from "../steps/charge/coding-complete.step";
import { startBillingStep } from "../steps/charge/start-billing.step";
import { forceBillStep } from "../steps/charge/force-bill.step";
import { addInsuranceStep } from "../steps/registration/add-insurance.step";
import { assignInsuranceBnrStep } from "../steps/registration/assign-insurance-bnr.step";
import { addAdjustmentStep } from "../steps/charge/add-adjustment.step";

export const TransferToInsuranceFlow: FlowDefinition = {
  goal: "transfer_to_insurance",
  description:
    "SZ35253: self-pay BNR (charges already posted) -> discharge -> Start/Force Bill (no insurance -> amount lands on the guarantor card, no claim) -> register insurance -> Add Adjustment 0001 full transfer",
  async execute(ctx, params) {
    // 1. land the balance on the guarantor card (needs discharge first on
    //    this build — Start Billing requires a discharged encounter)
    await openBnrDetailStep(ctx, params);
    await openPatientChartStep(ctx, params);
    await dischargeOrderStep(ctx, params);
    await openPatientRegistrationStep(ctx, params);
    await dischargeEncounterStep(ctx, params);
    await openBnrDetailStep(ctx, params);
    // This build gates Start Billing on coding (fbch34 2026-09-16: "Coding
    // Not Started" → no Start Billing button); complete it with defaults.
    await codingCompleteStep(ctx, params);
    await startBillingStep(ctx, params);
    await forceBillStep(ctx, params);
    // 2. register the insurance AFTER billing, then **assign it to the BNR**
    //    (SZ35253 manual recording 2026-09-16: an unassigned coverage never
    //    produces claims — this was the missing piece of earlier runs)
    await openPatientRegistrationStep(ctx, params);
    await addInsuranceStep(ctx, params);
    await assignInsuranceBnrStep(ctx, params);
    // 3. transfer the whole guarantor balance to the insurance (0001,
    //    Balance Type = Guarantor per the recording)
    await openBnrDetailStep(ctx, params);
    await addAdjustmentStep(ctx, params);
  },
};
