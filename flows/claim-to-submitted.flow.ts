// flows/claim-to-submitted.flow.ts — goal "claim_to_submitted": the FULL
// patient revenue cycle in one orchestration (patient → encounter/admit/BNR →
// quick charges → coding → discharge order → encounter discharge → billing →
// force bill if needed → claim submit). All identity hand-off flows through
// ctx.scratch; params only customize (plan, cpts, diagnoses, reasons...).

import type { FlowDefinition } from "../src/types/flow";
import { openRegistrationStep } from "../steps/registration/registration-open.step";
import { createPatientStep } from "../steps/registration/create-patient.step";
import { addGuarantorSelfStep } from "../steps/registration/add-guarantor-self.step";
import { addInsuranceStep } from "../steps/registration/add-insurance.step";
import { createEncounterStep } from "../steps/registration/create-encounter.step";
import { admitEncounterStep } from "../steps/registration/admit-encounter.step";
import { waitForBnrStep } from "../steps/registration/wait-bnr.step";
import { openBnrDetailStep } from "../steps/charge/open-bnr-detail.step";
import { quickChargeStep } from "../steps/charge/quick-charge.step";
import { codingCompleteStep } from "../steps/charge/coding-complete.step";
import { openPatientChartStep } from "../steps/registration/open-patient-chart.step";
import { dischargeOrderStep } from "../steps/oe/discharge-order.step";
import { openPatientRegistrationStep } from "../steps/registration/open-patient-registration.step";
import { dischargeEncounterStep } from "../steps/registration/discharge-encounter.step";
import { startBillingStep } from "../steps/charge/start-billing.step";
import { forceBillStep } from "../steps/charge/force-bill.step";
import { submitClaimStep } from "../steps/charge/submit-claim.step";

export const ClaimToSubmittedFlow: FlowDefinition = {
  goal: "claim_to_submitted",
  description:
    "端到端：新患者 → Inpatient Acute admit+BNR → Quick Charge → Coding Complete → 出院医嘱 → 出院 → Start Billing（必要时 Force Bill）→ Claim Submitted",
  async execute(ctx, params) {
    // 1. patient + insurance (BEFORE billing: SZ33989 — only BNRs with an
    //    assigned insurance generate claims) + Inpatient Acute + admit + BNR
    await openRegistrationStep(ctx, params);
    await createPatientStep(ctx, params);
    await addInsuranceStep(ctx, params);
    await createEncounterStep(ctx, params);
    await admitEncounterStep(ctx, params);
    await waitForBnrStep(ctx, params);
    // 2. quick charges on the fresh BNR
    await openBnrDetailStep(ctx, params);
    await quickChargeStep(ctx, params);
    // 3. coding (diagnoses + DRG + ADT + Complete)
    await codingCompleteStep(ctx, params);
    // 4a. CPOE2 discharge order (needs the patient chart open in Patient Control)
    await openPatientChartStep(ctx, params);
    await dischargeOrderStep(ctx, params);
    // 4b. Registration encounter discharge (needs ssn+lastName — in scratch)
    await openPatientRegistrationStep(ctx, params);
    await dischargeEncounterStep(ctx, params);
    // 5. billing: Start Billing; Force Bill only when BNR Edits appears
    await openBnrDetailStep(ctx, params);
    await startBillingStep(ctx, params);
    await forceBillStep(ctx, params);
    // 6. claim submit (direct or Force Submit)
    await submitClaimStep(ctx, params);
  },
};
