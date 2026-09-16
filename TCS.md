# TCS.md — TC ↔ 自动化资产映射表

「按 TC/SZ 号测试」的路由表：已固化的直接跑对应 spec；未固化的按 TC 原文执行，
完成后把结果登记到本表（固化成 spec，或先标注为交互执行记录）。

状态机：未登记 → 交互已执行 → 已固化 → 已回归

| TC/SZ | TC 内容 | 固化资产 | 执行 | 状态 | 最后验证 |
|---|---|---|---|---|---|
| TC35266 | Planned encounter → Admit → Patient Control census 显示 Admit Date（SZ35266 回归，bug 2026-08-10 已修） | `specs/SZ35266-admit-date.spec.ts` | `npx playwright test specs/SZ35266-admit-date.spec.ts` | 已固化·PASS | 2026-09-15 fbch34 |
| TC35253 | 自费（charges 落 guarantor）→ 补登记保险 → Add Adjustment 0001（Transfer Patient to Insurance，全额）→ Guarantor Balance 归零 + 生成保险 claim（Test 1+2） | `specs/SZ35253-transfer-to-insurance.spec.ts`（goal `transfer_to_insurance`） | `npx playwright test specs/SZ35253-transfer-to-insurance.spec.ts` | 已固化·FAIL=缺陷证据：全链跑通；0001 的 Amount 被锁定为折扣前责任额 $16,640（Policy Discount $3,328 后 guarantor 实际 $13,312），超额转账被拒——余额不变、无 claim 生成。即 SZ35253 "Not Working Correctly" 的表现，修复 SD416964 未部署到 fbch34；修复部署后按 TC Expected 断言应转绿 | 2026-09-15 fbch34 |
| TC35474 | Void/Cancel + Replacement claim 链后：Totals 只计非 Closed claim（TC01）、三行链全显示（TC02） | `specs/SZ35474-claim-totals.spec.ts`（goal `void_claim_rebill`） | `npx playwright test specs/SZ35474-claim-totals.spec.ts` | 已固化·环境阻断：链前半段（patient→charges→coding→出院→force bill→Billed）稳定跑通，但本 box force bill 后 Insurance Claims 不生成 claim（空），依赖服务器侧 submitClaims/updateBNRStatus 管线（TC32438/TC33301），UI 链无法拿到可 void 的 claim；step 现以明确诊断报错代替定位器超时。管线可用后按 TC01/TC02 断言执行 | 2026-09-15 fbch34 |

## 环境备注（fbch34，2026-09-15/16 大版本更新后）

- Force bill 自动挂 **Policy Discount（True Self Pay）** 调整（ SZ35474 链上表现为 Adjustments $3,328）。
- 有保险分配时 force bill 后 **claim 也不在 UI 生成**，Insurance Claims 区保持为空。
- 以上两条意味着「claim Submitted」链（claim_to_submitted / void_claim_rebill / SZ35474 TC01-02）
  需要服务器侧 submitClaims 管线配合才能端到端走通。
