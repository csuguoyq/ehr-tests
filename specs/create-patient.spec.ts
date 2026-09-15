// specs/create-patient.spec.ts — phase-2 acceptance, slice "create_patient":
// the goal runs end-to-end through the executor against the live portal
// (fbch34 per .env) and a new patient tab opens.
//
//   npx playwright test specs/create-patient.spec.ts

import { test, expect } from "../fixtures/auth.fixture";
import { runGoal } from "../src/executor/runner";
import { loadGoals } from "../src/executor/runner";
import { resolveParams } from "../src/executor/param-resolver";
import { generateLastName, generateSsn } from "../steps/registration/patient-data";

test("goal-driven create_patient: 注册模块打开 → 建患者 → 患者标签页打开", async ({ authedPage }) => {
  const lastName = generateLastName();
  const ssn = generateSsn();
  const params = await runGoal(authedPage, "create_patient", {
    params: { lastName, ssn },
  });

  await expect(authedPage.getByRole("tab", { name: `${lastName}, Auto` })).toBeVisible();
  if (params.lastName !== lastName || params.ssn !== ssn) {
    throw new Error("显式 lastName/ssn 参数未生效");
  }
});

test("goal schema: create_patient 已实现且默认参数可解析", async ({ ehr }) => {
  const goals = loadGoals();
  const goal = goals["create_patient"];
  if (!goal) throw new Error("goals.yaml 缺少 create_patient 目标");
  if (goal.implemented === false) throw new Error("create_patient 应已标记 implemented: true");

  const resolved = resolveParams(goal, {});
  if (resolved.patientMode !== undefined && resolved.patientMode !== "new") {
    throw new Error("create_patient 不应有 patientMode（属于 create_encounter）");
  }
  if (!goal.aliases.includes("创建患者")) throw new Error("create_patient 缺少中文别名");
  void resolved;
});
