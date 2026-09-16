# TCS.md — TC ↔ 自动化资产映射表

「按 TC/SZ 号测试」的路由表：已固化的直接跑对应 spec；未固化的按 TC 原文执行，
完成后把结果登记到本表（固化成 spec，或先标注为交互执行记录）。

状态机：未登记 → 交互已执行 → 已固化 → 已回归

**固化流程（2026-09-16 约定）**：未固化的 TC 先由用户用 codegen 录制手工操作
（`npx playwright codegen --ignore-https-errors -o recordings/<SZ号>.manual.ts "<入口URL>"`），
AI 按录制代码重构为 spec 后无头验证，最终一律以固化的 spec 执行回归。

| TC/SZ | TC 内容 | 固化资产 | 执行 | 状态 | 最后验证 |
|---|---|---|---|---|---|
| TC35266 | Planned encounter → Admit → Patient Control census 显示 Admit Date（SZ35266 回归，bug 2026-08-10 已修） | `specs/SZ35266-admit-date.spec.ts` | `npx playwright test specs/SZ35266-admit-date.spec.ts` | 已固化·PASS | 2026-09-15 fbch34 |
| TC35253 | 自费（charges 落 guarantor）→ 补登记保险并 **Assign 到 BNR** → Add Adjustment 0001（Transfer Patient to Insurance，Balance Type=Guarantor，全额）→ Guarantor Balance 归零 + 生成保险 claim（Test 1+2） | `specs/SZ35253-transfer-to-insurance.spec.ts`（goal `transfer_to_insurance`） | `npx playwright test specs/SZ35253-transfer-to-insurance.spec.ts` | 已固化·**PASS，问题已解决**（2026-09-16 fbch34，按用户手工录制路径）：guarantor 归零、claim H…0101 $16,640 Ready to Submit。关键路径（此前自动化失败原因）：① 患者须有 **Person(Self) 担保人**（Entity "Mini Reg Guarantor" 匹配不到保险）；② 保险登记后必须在 **Accounts (BNR) → Edit → Assign** 分配给 BNR，否则 Available Coverages=None、转账/claim 均无效。Test 3（双保险 primary/secondary）未自动化（box 无第二计划） | 2026-09-16 fbch34 |
| TC35474 | Void/Cancel + Replacement claim 链后：Totals 只计非 Closed claim（TC01）、三行链全显示（TC02） | `specs/SZ35474-claim-totals.spec.ts`（goal `void_claim_rebill`） | `npx playwright test specs/SZ35474-claim-totals.spec.ts` | 已固化·环境阻断：链前半段（patient→charges→coding→出院→force bill→Billed）稳定跑通，但本 box force bill 后 Insurance Claims 不生成 claim（空），依赖服务器侧 submitClaims/updateBNRStatus 管线（TC32438/TC33301），UI 链无法拿到可 void 的 claim；step 现以明确诊断报错代替定位器超时。管线可用后按 TC01/TC02 断言执行 | 2026-09-15 fbch34 |

## 环境备注（fbch34，2026-09-15/16 大版本更新后）

- Force bill 自动挂 **Policy Discount（True Self Pay）** 调整（ SZ35474 链上表现为 Adjustments $3,328）。
- 有保险分配时 force bill 后 **claim 也不在 UI 生成**，Insurance Claims 区保持为空。
- 以上两条意味着「claim Submitted」链（claim_to_submitted / void_claim_rebill / SZ35474 TC01-02）
  需要服务器侧 submitClaims 管线配合才能端到端走通。
