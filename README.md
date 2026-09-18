# ehr-tests — EHR Playwright 自动化测试框架

按 `docs/deepseek_markdown_20260911_79eb5c.md` 实施的目标驱动测试框架。设计与状态见
[PROJECT.md](PROJECT.md)、[MODULES.md](MODULES.md)、[PAGES.md](PAGES.md)、[GOALS.md](GOALS.md)、[TCS.md](TCS.md)（TC 映射）。
最终目标（AI 写 TC→审核→执行→报告 / 按 bug 重现 / 按需产生数据）与达成路线见
[PROJECT.md「最终目标」](PROJECT.md#最终目标north-star)。

## 心智模型

测试场景被做成可复用的「目标积木」：goal 在 `goals/<域>.yaml` 注册（别名 / 参数 schema / 默认值），
Flow 编排业务步骤。spec 调 `runGoal` / `runFromInput` → executor 匹配 goal、解析参数 → 执行预定义 Flow。
运行时纯 Playwright，**无 AI 调用，完全确定性执行**。

运行时链路（入口 `src/executor/runner.ts`：goal-matcher → param-resolver → FLOWS 注册表 → flow → steps → page-objects）
逐层说明见 [NEW_MODULE.md §1](NEW_MODULE.md)。

## 快速开始

```bash
cd ehr-tests
cp .env.example .env      # 按目标环境改 EHR_HOST（不同主机是不同物理机！）
npm install
npx playwright install chromium   # 仅首次或浏览器版本不匹配时
npm run setup:hooks               # 挂 pre-push 一致性门（build:drv + check:goals + tsc，--no-verify 可逃生）
npx playwright test               # 全部 spec
npx playwright test specs/login.spec.ts    # 阶段 1：登录
npm run regression -- specs/login.spec.ts  # 同上，但 list 输出完整落盘到 test-results/regression-<时间戳>.log
npx playwright test --headed      # 有窗口调试
```

## 目录地图

| 目录 / 文件 | 装什么 |
|---|---|
| `specs/` | Playwright 测试入口（`*.spec.ts`），薄层：调 executor 跑 goal + 断言最终状态；`specs/sz/` 放 TC 号命名的回归用例 |
| `flows/` | 目标编排（`*.flow.ts` + `index.ts` 注册表 `FLOWS`），只编排、零定位器 |
| `steps/` | 业务原子动作（`*.step.ts`），参数校验 / 默认值，≤3 分支 |
| `page-objects/` | 页面原子动作（`*.page.ts`），按域分目录（auth / charge / oe / registration），**定位器唯一权威**；根级 `patient-control.page.ts` 是 portal 级页面，不属于任何单一模块目录 |
| `fixtures/` | `ehr`（每 test 的上下文）/ `authedPage`（已登录会话：token 登录优先、UI 登录兜底） |
| `api/` | HTTP 兜底 client（UI 按钮 disabled 等环境缺陷的 fallback） |
| `src/` | 框架核心：`executor/`（匹配 / 参数解析 / runner）、`types/`、`utils/`（logger / wait / retry） |
| `goals/<域>.yaml` | 声明式 goal 注册（auth / registration / charge / claims）：aliases、参数 schema、默认值、presets、`implemented` 标记 |
| `data/` | 静态测试数据 JSON（plans / cpts / diagnoses） |
| `scripts/` | 一致性检查脚本（CI 门：`check:goals`、`check:selectors`） |
| 根目录 `*.md` | 状态表 MODULES / PAGES / GOALS / TCS + PROJECT（总账）+ NEW_MODULE（切片操作手册）+ HOWTO（学习参考） |

四张状态表互为路由：知道 TC 号去 TCS.md 查 spec，知道模块去 PAGES.md 查页面卡与对应 Flow。

## 目标驱动执行（spec / CLI 通用）

```ts
await runFromInput(page, "登录");                        // 自然语言匹配
await runGoal(page, "login", { username: "demo" });      // 按目标键 + 参数
await runGoal(page, "create_encounter", { preset: "inpatient_acute_admit" }); // preset（inpatient_acute_admit / inpatient_acute_existing_patient / outpatient 均已实现）
```

运行时纯 Playwright，无 AI 调用；失败自动留 trace + 截图（`test-results/`，
`npx playwright show-trace` 查看）。

## 扩展新切片（每轮一个）

1. 读四个状态文件（PROJECT / MODULES / PAGES / GOALS）；TC 场景另查 TCS.md；调研模块（skills 文档 / 源码，见 NEW_MODULE.md「切片前」）
2. goals/<域>.yaml 登记 goal（aliases / params schema，先标 `implemented: false`）
3. 写 Page Object（定位器 + 原子动作；选择器实机验证后沉淀进 PO）
4. 写 Step（默认值解析、业务动作、成功证明收尾）
5. 写 Flow（只串 step）+ 注册进 `flows/index.ts` ← 最易漏
6. 写 Spec（TC 型放 `specs/sz/TC<id>-slug.spec.ts`；附一条不开浏览器的 schema 单测）；goals yaml 翻 `implemented: true`
7. 更新 MODULES.md / PAGES.md / GOALS.md（+TCS.md，TC 场景）/ PROJECT.md
8. 收尾门：`npm run build:drv && npm run check:goals` + `npx tsc --noEmit` + 无头实机验证

操作清单（分步 checklist、稳定性实践、调试循环、不同场景下请求 AI 的提示词模板）见 [NEW_MODULE.md](NEW_MODULE.md)；
学习参考（create_patient 切片的完整走查、文件模板、Context/fixtures、选择器发现、测试脚本（spec）写法方法论）见 [HOWTO.md](HOWTO.md)。
