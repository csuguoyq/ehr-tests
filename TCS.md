# TCS.md — TC ↔ 自动化资产映射表

「按 TC/SZ 号测试」的路由表：已固化的直接跑对应 spec；未固化的按 TC 原文执行，
完成后把结果登记到本表（固化成 spec，或先标注为交互执行记录）。

状态机：未登记 → 交互已执行 → 已固化 → 已回归

**固化流程（2026-09-16 约定）**：未固化的 TC 先由用户用 codegen 录制手工操作
（`npx playwright codegen --ignore-https-errors -o recordings/<SZ号>.manual.ts "<入口URL>"`），
AI 按录制代码重构为 spec 后无头验证，最终一律以固化的 spec 执行回归。

| TC/SZ | TC 内容 | 固化资产 | 执行 | 状态 | 最后验证 |
|---|---|---|---|---|---|
| TC35118 | SZ35118 [MLIP] Status error in Billing：IN35118（3 份 rule.rcf 部署 + RESTART_RULEEXECD）下，force-billed claim 落 **Errored**（claim state 02）+ BNR 显示 **Claim Edits Needed** + ycql `var` 在 `queryrcmrule()` 后不清除（bForceRemote 修复验证） | `specs/sz/TC35118-claim-edits-needed.spec.ts`（goal `claim_to_errored`） | `npx playwright test specs/sz/TC35118-claim-edits-needed.spec.ts` | 已固化·PASS（2026-09-17 fbch34，patient Testbot_2609171839）：TC 8 步全覆盖——步骤 1-7 端到端（IN35118 rcf 与模板 diff 非破坏性校验 + ruleexecd 存活、"Errored Claim" worklist 规则定义校验、新患者→…→Force Bill→BNR "Claim Edits"（红色图标 tooltip，SZ33286 表面）+ claim 行 "Errored"、mysql 查患者 ccidb 后在**真实 ccidb** 上 ycql var 持久校验）；步骤 8 配置级回归（TC34027/TC33731 规则在 rule.db 齐全）。TC34027/TC33731 的完整 UI 回归未自动化，列为独立跟进切片 | 2026-09-17 fbch34 |
| TC35266 | Planned encounter → Admit → Patient Control census 显示 Admit Date（SZ35266 回归，bug 2026-08-10 已修） | `specs/sz/TC35266-admit-date.spec.ts` | `npx playwright test specs/sz/TC35266-admit-date.spec.ts` | 已固化·PASS | 2026-09-15 fbch34 |
| TC35253 | 自费（charges 落 guarantor）→ 补登记保险并 **Assign 到 BNR** → Add Adjustment 0001（Transfer Patient to Insurance，Balance Type=Guarantor，全额）→ Guarantor Balance 归零 + 生成保险 claim（Test 1+2） | `specs/sz/TC35253-transfer-to-insurance.spec.ts`（goal `transfer_to_insurance`） | `npx playwright test specs/sz/TC35253-transfer-to-insurance.spec.ts` | 已固化·**PASS，问题已解决**（2026-09-16 fbch34，按用户手工录制路径）：guarantor 归零、claim H…0101 $16,640 Ready to Submit。关键路径（此前自动化失败原因）：① 患者须有 **Person(Self) 担保人**（Entity "Mini Reg Guarantor" 匹配不到保险）；② 保险登记后必须在 **Accounts (BNR) → Edit → Assign** 分配给 BNR，否则 Available Coverages=None、转账/claim 均无效。Test 3（双保险 primary/secondary）未自动化（box 无第二计划） | 2026-09-17 fbch34 |
| TC35474 | Void/Cancel + Replacement claim 链后：Totals 只计非 Closed claim（TC01）、三行链全显示（TC02） | `specs/sz/TC35474-claim-totals.spec.ts`（goal `void_claim_rebill`） | `npx playwright test specs/sz/TC35474-claim-totals.spec.ts` | 已固化·仅剩 re-bill 腿环境阻断（2026-09-17 fbch34 复诊）：链前半段端到端跑通（patient→…→force bill→**claim 正常生成并 Submitted**→void 成功，Void/Cancel 行出现）；re-bill 腿等待 BNR 状态从 Billed 翻回可计费（Start/Force Bill 重现），重挂载轮询 8 分钟未翻转——依赖服务器侧 updateBNRStatus（CardList showBillBtn 条件见 ehr/src CardList.tsx）。管线翻转后 spec 即可端到端 PASS | 2026-09-17 fbch34 |
| claim_to_submitted（goal，无 TC 号） | 完整患者收入周期：新患者 → Person 担保人 + 保险 → Inpatient Acute admit + BNR → Quick Charge → Coding Complete → 出院医嘱 → 出院 → Start Billing（BNR Edits → Force Bill）→ claim Submitted | `specs/claim-to-submitted.spec.ts`（goal `claim_to_submitted`） | `npx playwright test specs/claim-to-submitted.spec.ts` | 已固化·**PASS，端到端**（2026-09-17 fbch34）：force bill 后 claim 正常生成（Ready to Submit）→ submit → 行状态 Submitted 双证通过。此前 2026-09-16 的「环境阻断」结论是误诊——Insurance Claims 手风琴默认折叠且数据仅在 mount 时拉取，旧代码在折叠+陈旧的 grid 上单次读取必得空（详见 PROJECT.md 2026-09-17 切片） | 2026-09-17 fbch34 |
| TC33731 | SZ33731 [Worklist] Coverage Change Worklist to consider effective date of insurance priorities：保险优先级 **Reorder** 后，仅当 **effective date 落在 encounter period 内**（active `[admit, open)`；discharged `[admit, discharge]`，InInsEffectivePeriod rcf）才在 Coverage Change Worklist 捕获 BNR（case #7 = eff 晚于 admit 无出院也捕获，SZ 核心改动） | `specs/sz/TC33731-coverage-change-worklist.spec.ts`（goal `coverage_change`） | `npx playwright test specs/sz/TC33731-coverage-change-worklist.spec.ts` | 已固化·**部分 PASS**（2026-09-17 fbch34，patient A Testbot_2609172359A bnr 1001650345461）：testable subset 端到端 PASS——TC1（rule.db 规则定义含 InInsEffectivePeriod + InsOrder）、TC2-6（active，reorder eff=admit date=today → 捕获 BNR=H100165034546101 → Complete）、TC9-11（discharge date=today，reorder eff=discharge date → 捕获 + 行显示 discharge date → Complete）。**TC7-8（eff after admit = case #7，SZ 核心）+ TC12-13（eff after discharge）SKIPPED/blocked**：需 effective date 严格晚于 anchor 且 ≤ box-today（即过去 admit/discharge）；但日期选择器 max=serverToday（CciDatePicker 默认 maxDate，ReorderPrioritiesDialog 未传 maxDate/futureDate）且 Registration admit/discharge 表单把 serverNow() stamp 进 **disabled** 日期字段（不可回溯）——新建 encounter 无法回溯。原 TC 用既有长住院 encounter 67136235（past admit，TC 步骤 2「admit date earlier than the current date」）。**补测 case #7 / TC12-13 需一个既有 past-admit active encounter**（详见 PROJECT.md 2026-09-17 已知限制）。**2026-09-18 复跑**：发现单次 Reorder（两保险互换）产生 **2 条** worklist item（每保险记录 InsOrder 变更各触发一条规则事件），旧 `completeItem` 只完成首行 → 停在 TC6（计数 "1 Active / 1 Completed"）；修 `WorklistsPage.completeItem` 为头部 Select all rows 全选 + 单对话框一次完成全部（`Complete.tsx handleComplete` 本就批量 POST 全部 checked ids），re-run 2/2 PASS（patient A Testbot_2609180900A bnr 1001650345465，见 PROJECT.md 2026-09-18 条）。**2026-09-18 参数化收口**：`completeItem` 增加 `reason?`（业务默认值 "No further follow-up needed from patient" 上移到 step `completeReason` 默认）；step 增加 `expectRowContains`（捕获后、Complete 前断言首行含该文本，TC10-11 的 inline 轮询+重开+absence 段收口为一次 step 调用）；Complete 后增加有界「残留再 Complete」循环——单 Reorder 的多条 item 异步落地时（Worklist Age=0 的新 row），第一次 Complete 可能只覆盖当时可见的 item（TC10-11 首跑在此失败，见 PROJECT.md） | 2026-09-18 fbch34 |

## 环境备注（fbch34，2026-09-15/16 大版本更新后）

- ~~Force bill 后 Insurance Claims 不生成 claim、依赖服务器侧 submitClaims 管线~~
  **（2026-09-17 修正）**：claim 在 force bill 后正常生成。此前读到空区是自动化缺陷：
  Insurance Claims / Unbilled Charges 等卡片是受控 BillingAccordion（默认折叠、折叠时不渲染
  grid、数据仅 mount 时拉取），读取前必须展开 + 重挂载（`ClaimsPage.waitForFirstRow`）。
- Force bill 自动挂 **Policy Discount（True Self Pay）** 调整（SZ35474 链上表现为 Adjustments $3,328）。
- **Void claim 后 BNR 状态不自动翻回**：BNR 停留 Billed，Start/Force Bill 按钮均不渲染
  （showBillBtn/showForceBtn 条件依赖 isSubmittedClaim/bnrstatus），需服务器侧
  updateBNRStatus 翻转——TC35474 re-bill 腿现以 8 分钟重挂载轮询等待，超时则诊断报错。
