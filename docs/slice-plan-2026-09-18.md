# 三切片合并落地计划（2026-09-18）

来源：2026-09-18 工程审查（对话）建议的落地顺序 1+2+3，一次性排入执行。
铁律 9 的处理：仍按「一次一个切片」执行与验证，只是三个切片连续做完、各自独立 commit，任一出问题可单切片 revert。

## Slice A — 代码债快修（低风险，改到哪验到哪）

| # | 项 | 改动 | 文件 |
|---|---|---|---|
| A1 | N1 worklist Complete reason 矛盾 | `completeItem` 增加 `reason?: string`：传了按文本选，不传选第一个可用 option（跳过 "Select Reason" 占位）；业务默认值（"No further follow-up needed from patient"）上移到 step 的 `completeReason` 默认值；修 step 头注（原「reserved; first available」与实现不符） | `page-objects/worklists/worklists.page.ts`、`steps/worklists/coverage-change-worklist.step.ts` |
| A2 | N2 spec 复制段收口 | step 增加可选 `expectRowContains?: string`（捕获后、Complete 前断言首行包含该文本）；TC33731 spec TC 10-11 的 inline 轮询+重开+absence 段（~30 行）换成一次 step 调用；顺带删只进日志的 `tomorrow`（N9） | `steps/worklists/coverage-change-worklist.step.ts`、`specs/sz/TC33731-coverage-change-worklist.spec.ts` |
| A3 | N7 无背书 sleep | `worklists.page.ts` clearSearch 的 4000ms：补背书注释（搜索 re-fetch 是 live onChange，无完成信号可轮询）；`insurance.page.ts` ensureOverviewView 的盲 1000ms：改为有界轮询 overviewOnly 可见（≤3s） | `page-objects/worklists/worklists.page.ts`、`page-objects/registration/insurance.page.ts` |
| A4 | N8 仓库卫生 | `.gitignore` 补 `.workbuddy/`；`git rm -r --cached .workbuddy` | `.gitignore` |
| A5 | I6 凭据静默兜底 | `loadEhrEnv`：`.env` 文件与 `EHR_HOST` 环境变量都不在时直接 throw（报错信息指向 `cp .env.example .env`）；EHR_HOST 显式给出时行为不变 | `src/types/ehr-context.ts` |
| A6 | I10 隐式依赖 | `drive-ml.js` 改 `require("@playwright/test")`（该包 re-export chromium），删掉对传递依赖 `playwright` 的依赖 | `drive-ml.js` |

**验证**：`npm run build:drv` + `check:goals` + `tsc --noEmit` → fbch34 无头跑 `TC33731`（覆盖 A1/A2/A3-insurance，~5min）+ `login.spec`（A5 守卫不误伤，~1min）。

## Slice B — 基建（不碰测试逻辑）

| # | 项 | 改动 |
|---|---|---|
| B1 | pre-push 一致性门 | `scripts/hooks/pre-push`（sh）：`npm run build:drv && npm run check:goals && npx tsc --noEmit`；`scripts/setup-hooks.mjs` 设 `git config core.hooksPath scripts/hooks`，挂 `npm run setup:hooks`；README 记 `--no-verify` 逃生口。runner 恢复前，这是门的本机执行点 |
| B2 | EnvBlockedError | 新建 `src/utils/errors.ts`：`EnvBlockedError`（message 前缀 `[ENV-BLOCKED]`），只用于「环境/服务器侧未就绪」的确定性 throw，不改变测试结果（不自动 skip/pass），只让报告可分类。落点：`billing.page waitForRebillable` 耗尽、`submit-claim` 服务器管线等待耗尽、worklist step「5 轮 re-search 未出现」 |
| B3 | 回归日志落盘 | `scripts/regression.mjs` + `npm run regression`：spawn `playwright test`（参数透传），list 输出 tee 到 `test-results/regression-<时间戳>.log`，结束打印日志路径。把「回归日志要完整落盘」的教训机制化 |

**用户动作项（不在代码内）**：向管理员核实 GitLab shared runner 状态（I14，16 条 pipeline 排队至死的历史）与 main 分支保护是否真的开启（09-18 直推成功，与 9-17 审查记录矛盾）。

**验证**：手动跑一次 hook 脚本；`npm run regression -- specs/login.spec.ts` 走通（~1min）；hook 内含 tsc/check:goals。

## Slice C — 架构轮（纯移动/收口，不改测试语义）

| # | 项 | 改动 |
|---|---|---|
| C1 | N3 MUI 日期梯子收口 | 新建 `src/utils/mui-date.ts` `pickMuiDate(page, popper, "MM/DD/YYYY")`：年视图幂等切换 + 月导航循环 + 日点击 + OK-有则点/无则点 input 兜底（合并 pickDob 与 setReorderEffectiveDate 的两条路径）；两个 PO 保留弹窗/Popper 定位、委托算法。消费者回归：create-patient.spec（pickDob）+ TC33731（新路径已在 A 轮验过，重跑 create-patient 即可） |
| C2 | N4 rail 定位器收口（4→1） | 新建 `page-objects/portal-rail.page.ts`：`button(label)` + `clickApp(label)`；registration-app / account-lookup / order-entry / worklists 四个 PO 的私有 railButton 改为组合（各自的深链兜底/loaded 判定留在原 PO） |
| C3 | N5 resume 参数组（4→1） | loader 支持：任意 goals yaml 顶层 `paramGroups:`；goal params 里 `$group: <name>` 展开（goal 自身键覆盖组键，`$group` 键删除；组名冲突报错）；允许只有 paramGroups 的文件（`goals/_shared.yaml` 定义 `resume` 组）。claim_to_submitted / claim_to_errored / coverage_change 四处重复块换成 `$group: resume` + 各自特有键。check-goals 走同一 loader，天然一致 |
| C4 | N6 单测收口出 e2e | check-goals.mjs 新增「goal param 语义」段：把 login/create-patient/claim-to-submitted/TC33731 四个 spec 里的纯 Node 断言（参数默认值/覆盖、matchGoal 命中与入口报错）移植过去；删除对应 spec 内的 browser-free test（login.spec 保留 NL→执行 e2e 那条）。铁律 10 例外：本切片明确要求改这些 spec |
| C5 | flows 域层（阈值 16>15 已触发） | flows/ 拆 `access/`（login）、`registration/`（create-patient、create-encounter、discharge、coverage-change）、`revenue-cycle/`（charge/coding/billing/claims 全部）；`encounter-stages.ts` 留 `flows/` 根作共享单元；`flows/index.ts` 改为从子目录 re-export。specs 不挪文件，按 PROJECT.md 约定补 `@access/@registration/@revenue-cycle` tag（与现有 tag 并存，`--grep-tag` 可跑整域）。PROJECT.md 阈值记录更新为「已实施」 |

**验证**：`build:drv` + `check:goals`（覆盖 C3 loader + C4 移植断言 + C5 注册表）+ `tsc --noEmit` → fbch34 无头 `create-patient.spec`（C1）+ `discharge.spec`（C2 + registration 域）+ `claim-to-submitted.spec`（C5 revenue 域全链，~3.5min）。

## 收尾（每切片必做）

- Slice A：PAGES.md Worklists 卡（completeItem 签名变化）+ TCS.md TC33731 行补一句 reason 参数化；PROJECT.md 切片记录。
- Slice B：README（setup:hooks / regression 用法）+ NEW_MODULE.md 稳定性实践补 EnvBlockedError 一条；PROJECT.md 切片记录。
- Slice C：PROJECT.md（域层已实施 + 阈值状态）+ GOALS/MODULES 核对（check:goals 自动门）；PROJECT.md 切片记录。
- commit 节奏：每切片验证通过即 commit + push（完整切片落地，符合 09-16 约定），英文 message，互不混杂以便单独 revert。

## 明确不在本计划内

I1（@slow→timeout 映射）、I3（数据清理，先做只读 report 脚本另行立项）、I4（storageState）、I5（多环境 profile）、TC33731 的 blocked 场景（需 past-admit encounter，等环境）。
