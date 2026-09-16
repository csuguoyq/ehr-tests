// specs/SZ35253-transfer-to-insurance.spec.ts — TC35253 (SZ35253, 2026):
// "Transaction #0001 Transfer Patient to Insurance Not Working Correctly".
//
//   Test 1 — Adjustments → Add → 0001 (Transfer Patient to Insurance) with
//            the full balance: Guarantor Balance drops to $0.
//   Test 2 — the transfer creates a new claim in Insurance Claims for the
//            (single) registered payer, amount = the transferred balance.
//
// Environment adaptation (fbch34 build): the TC assumes charges land on the
// guarantor card without a billing cycle; here that only happens through
// Start/Force Bill with NO insurance (SZ33989 behaviour), so the goal runs
// discharge → bill (self-pay, no claim) → register insurance → transfer.
// Test 3 (primary vs secondary split with two insurances) needs a second
// configured plan on the box — recorded as a known limitation, not automated.
//
//   npx playwright test specs/SZ35253-transfer-to-insurance.spec.ts

import { test, expect } from "../fixtures/auth.fixture";
import { runGoal, createEhrContext } from "../src/executor/runner";
import { loadEhrEnv } from "../src/types/ehr-context";
import { generateLastName } from "../steps/registration/patient-data";
import { BillingPage } from "../page-objects/charge/billing.page";
import { ClaimsPage } from "../page-objects/charge/claims.page";

test(
  "SZ35253 T1+T2: 0001 转账后 Guarantor Balance 清零且生成保险 claim（host 见 .env）",
  { tag: "@slow" },
  async ({ authedPage }) => {
    test.setTimeout(900_000); // discharge → bill → insurance → adjustment
    const lastName = generateLastName();
    await runGoal(authedPage, "create_encounter", {
      preset: "inpatient_acute_admit",
      params: { lastName, levelOfCare: "Med-Surg" },
    });
    await runGoal(authedPage, "quick_charge", {
      params: { patientName: lastName, cpts: "96372,96374", qty: 10 },
    });

    // Full chain: bill self-pay (balance lands on the guarantor card, no
    // claim), register insurance, transfer via adjustment 0001. The step
    // reads the pre-transfer guarantor balance and records it in scratch.
    await runGoal(authedPage, "transfer_to_insurance", {});
    const adjustment = createEhrContext(authedPage).scratch.adjustment as
      | { amount?: string }
      | undefined;
    const transferred = Number(adjustment?.amount ?? "0");
    expect(transferred, "prerequisite: non-zero guarantor balance transferred").toBeGreaterThan(0);

    // T1 (TC expected): the guarantor card is zeroed by the transfer.
    //
    // ⚠️ 2026-09-15 fbch34 实测复现 SZ35253 缺陷表现（修复 SD416964 未部署）：
    // force bill 自动挂 Policy Discount（True Self Pay）后 guarantor balance
    // = $13,312，而 0001 transfer 的 Amount 锁定为折扣前责任额 $16,640 ——
    // 超额转账被拒：余额不变、Insurance Claims 不生成 claim。以下断言按 TC
    // 原文 Expected 编写，在该 box 上预期 FAIL（缺陷证据）；修复部署后转绿。
    const billing = new BillingPage(authedPage, loadEhrEnv());
    await expect
      .poll(async () => billing.readGuarantorBalance(), { timeout: 30_000 })
      .toBe(0);

    // T2 (TC expected): the transfer created a claim carrying the transferred
    // amount for the registered payer.
    const claims = new ClaimsPage(authedPage, loadEhrEnv());
    await expect
      .poll(async () => (await claims.readRows()).length, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    const rows = await claims.readRows();
    const active = rows.filter((r) => r.status.toLowerCase() !== "closed");
    const matched = active.filter((r) => Math.abs(r.charges - transferred) < 0.01);
    expect(
      matched.length,
      `an active claim with charges=${transferred} expected; rows: ${rows.map((r) => `${r.status}|${r.charges}`).join(" ; ")}`
    ).toBeGreaterThanOrEqual(1);
  }
);
