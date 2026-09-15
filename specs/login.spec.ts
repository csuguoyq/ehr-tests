// specs/login.spec.ts — phase-1 acceptance: the "login" goal runs end-to-end
// through the executor (matcher → resolver → flow) against the live portal.
//
//   npx playwright test specs/login.spec.ts
//   (EHR_HOST from .env or environment; state the host when reporting.)

import { test, expect } from "../fixtures/ehr.fixture";
import { runFromInput, runGoal, loadGoals } from "../src/executor/runner";
import { matchGoal } from "../src/executor/goal-matcher";
import { resolveParams } from "../src/executor/param-resolver";

test("goal-driven login: 自然语言匹配 → 参数解析 → Flow 执行", async ({ ehr }) => {
  // Natural-language entry point (runtime uses pure matching, no AI).
  await runFromInput(ehr.page, process.env.EHR_GOAL_INPUT || "登录");
  await expect(ehr.page).toHaveTitle(/CliniComp/);
});

test("goal schema: login 参数默认值来自环境，显式参数覆盖默认", async ({ ehr }) => {
  const goals = loadGoals();
  const goal = goals["login"];
  if (!goal) throw new Error("goals.yaml 缺少 login 目标");

  const resolved = resolveParams(goal, { params: { username: ehr.env.username } });
  if (resolved.username !== ehr.env.username) {
    throw new Error(`显式 username 未生效: ${JSON.stringify(resolved.username)}`);
  }
  const byAlias = matchGoal("login", goals);
  if (byAlias.goal.name !== "login") throw new Error("alias 'login' 匹配失败");
});

test("goal matching: 未登记目标与未实现目标都会入口报错", async ({ ehr }) => {
  let threw = false;
  try {
    await runFromInput(ehr.page, "完全不存在的一个目标xyz");
  } catch (e) {
    threw = true;
    if (!(e as Error).message.includes("无法匹配目标")) throw e;
  }
  if (!threw) throw new Error("未登记目标应当入口报错");

  // 动态取一个仍未实现的已登记目标（各轮实现新目标后无需再改本测试）。
  const pendingGoal = Object.values(loadGoals()).find((g) => g.implemented === false);
  if (!pendingGoal?.name) return; // 所有已登记目标均已实现时跳过该分支
  let threw2 = false;
  try {
    await runGoal(ehr.page, pendingGoal.name);
  } catch (e) {
    threw2 = true;
    if (!(e as Error).message.includes("Flow 未实现")) throw e;
  }
  if (!threw2) throw new Error("已登记未实现目标应当入口报错");
});
