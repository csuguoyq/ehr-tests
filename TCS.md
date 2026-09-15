# TCS.md — TC ↔ 自动化资产映射表

「按 TC/SZ 号测试」的路由表：已固化的直接跑对应 spec；未固化的按 TC 原文执行，
完成后把结果登记到本表（固化成 spec，或先标注为交互执行记录）。

状态机：未登记 → 交互已执行 → 已固化 → 已回归

| TC/SZ | TC 内容 | 固化资产 | 执行 | 状态 | 最后验证 |
|---|---|---|---|---|---|
| TC35266 | Planned encounter → Admit → Patient Control census 显示 Admit Date（SZ35266 回归，bug 2026-08-10 已修） | `specs/SZ35266-admit-date.spec.ts` | `npx playwright test specs/SZ35266-admit-date.spec.ts` | 已固化·PASS | 2026-09-15 fbch34 |
