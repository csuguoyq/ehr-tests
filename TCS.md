# TCS.md — TC ↔ 自动化资产映射表

「按 TC/SZ 号测试」的路由表：已固化的直接跑对应 spec；未固化的按 TC 原文执行，
完成后把结果登记到本表（固化成 spec，或先标注为交互执行记录）。

状态机：未登记 → 交互已执行 → 已固化 → 已回归

**固化流程（2026-09-16 约定）**：未固化的 TC 先由用户用 codegen 录制手工操作
（`npx playwright codegen --ignore-https-errors -o recordings/<SZ号>.manual.ts "<入口URL>"`），
AI 按录制代码重构为 spec 后无头验证，最终一律以固化的 spec 执行回归。

| TC/SZ | TC 内容 | 固化资产 | 执行 | 状态 | 最后验证 |
|---|---|---|---|---|---|
| TC35266 | Planned encounter → Admit → Patient Control census 显示 Admit Date（SZ35266 回归，bug 2026-08-10 已修） | `specs/sz/TC35266-admit-date.spec.ts` | `npx playwright test specs/sz/TC35266-admit-date.spec.ts` | 已固化·PASS | 2026-09-15 fbch34 |
| TC35253 | 自费（charges 落 guarantor）→ 补登记保险并 **Assign 到 BNR** → Add Adjustment 0001（Transfer Patient to Insurance，Balance Type=Guarantor，全额）→ Guarantor Balance 归零 + 生成保险 claim（Test 1+2） | `specs/sz/TC35253-transfer-to-insurance.spec.ts`（goal `transfer_to_insurance`） | `npx playwright test specs/sz/TC35253-transfer-to-insurance.spec.ts` | 已固化·**PASS，问题已解决**（2026-09-16 fbch34，按用户手工录制路径）：guarantor 归零、claim H…0101 $16,640 Ready to Submit。关键路径（此前自动化失败原因）：① 患者须有 **Person(Self) 担保人**（Entity "Mini Reg Guarantor" 匹配不到保险）；② 保险登记后必须在 **Accounts (BNR) → Edit → Assign** 分配给 BNR，否则 Available Coverages=None、转账/claim 均无效。Test 3（双保险 primary/secondary）未自动化（box 无第二计划） | 2026-09-17 fbch34 |
| TC35474 | Void/Cancel + Replacement claim 链后：Totals 只计非 Closed claim（TC01）、三行链全显示（TC02） | `specs/sz/TC35474-claim-totals.spec.ts`（goal `void_claim_rebill`） | `npx playwright test specs/sz/TC35474-claim-totals.spec.ts` | 已固化·仅剩 re-bill 腿环境阻断（2026-09-17 fbch34 复诊）：链前半段端到端跑通（patient→…→force bill→**claim 正常生成并 Submitted**→void 成功，Void/Cancel 行出现）；re-bill 腿等待 BNR 状态从 Billed 翻回可计费（Start/Force Bill 重现），重挂载轮询 8 分钟未翻转——依赖服务器侧 updateBNRStatus（CardList showBillBtn 条件见 ehr/src CardList.tsx）。管线翻转后 spec 即可端到端 PASS | 2026-09-17 fbch34 |
| claim_to_submitted（goal，无 TC 号） | 完整患者收入周期：新患者 → Person 担保人 + 保险 → Inpatient Acute admit + BNR → Quick Charge → Coding Complete → 出院医嘱 → 出院 → Start Billing（BNR Edits → Force Bill）→ claim Submitted | `specs/claim-to-submitted.spec.ts`（goal `claim_to_submitted`） | `npx playwright test specs/claim-to-submitted.spec.ts` | 已固化·**PASS，端到端**（2026-09-17 fbch34）：force bill 后 claim 正常生成（Ready to Submit）→ submit → 行状态 Submitted 双证通过。此前 2026-09-16 的「环境阻断」结论是误诊——Insurance Claims 手风琴默认折叠且数据仅在 mount 时拉取，旧代码在折叠+陈旧的 grid 上单次读取必得空（详见 PROJECT.md 2026-09-17 切片） | 2026-09-17 fbch34 |

## 环境备注（fbch34，2026-09-15/16 大版本更新后）

- ~~Force bill 后 Insurance Claims 不生成 claim、依赖服务器侧 submitClaims 管线~~
  **（2026-09-17 修正）**：claim 在 force bill 后正常生成。此前读到空区是自动化缺陷：
  Insurance Claims / Unbilled Charges 等卡片是受控 BillingAccordion（默认折叠、折叠时不渲染
  grid、数据仅 mount 时拉取），读取前必须展开 + 重挂载（`ClaimsPage.waitForFirstRow`）。
- Force bill 自动挂 **Policy Discount（True Self Pay）** 调整（SZ35474 链上表现为 Adjustments $3,328）。
- **Void claim 后 BNR 状态不自动翻回**：BNR 停留 Billed，Start/Force Bill 按钮均不渲染
  （showBillBtn/showForceBtn 条件依赖 isSubmittedClaim/bnrstatus），需服务器侧
  updateBNRStatus 翻转——TC35474 re-bill 腿现以 8 分钟重挂载轮询等待，超时则诊断报错。
