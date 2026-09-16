# MODULES.md — 模块注册表（全量模块清单，切片来源）

每发现一个新模块就登记一行；未实现的模块不建空目录。

状态机：未登记 → 已登记 → 调研中 → 切片中 → 部分实现 → 已覆盖 → 已回归

| 模块 | 说明 | 优先级 | 页面数 | 已实现页面 | 状态 | 负责人 | 最后更新 |
|---|---|---|---|---|---|---|---|
| Auth | 登录、登出 | P0 | 2 | 1 | 部分实现 | | 2026-09-11 |
| Patient Control | 门户级患者上下文入口（Cps census；打开图表后 rail 才出现患者级应用） | P0 | 1 | 1 | 已覆盖 | | 2026-09-15 |
| Registration | 患者、Guarantor、Encounter、出院（`ehr/src/Registration`） | P0 | 待调研 | 3 | 部分实现 | | 2026-09-12 |
| Charge Services | BNR、Charges、Quick Charge（`ehr/src/Charge`） | P0 | 待调研 | 2 | 部分实现 | | 2026-09-12 |
| Coding | Diagnosis、ADT、DRG（Charge Services 的 Coding tab） | P0 | 待调研 | 2 | 部分实现 | | 2026-09-12 |
| CPOE2 | Order Reconcile、Discharge（`ehr/src/OE`） | P0 | 待调研 | 1 | 切片中 | | 2026-09-12 |
| Billing | Start Billing、Bill Now、Force Bill、Guarantor Balance、Adjustments | P0 | 待调研 | 2 | 部分实现 | | 2026-09-16 |
| Insurance Claims | Claim 表格（Submit/Void/Resubmit/Replacement kebab、Totals 行）、Adjustment 弹窗（`ehr/src/Charge/Claim`） | P0 | 待调研 | 2 | 部分实现 | | 2026-09-16 |

## 发现渠道

- EHR 导航菜单（左图标栏）一级/二级入口
- `ehr/src/` 各模块目录与路由
- 手工测试用例 / 用户目标反推

## 备注

- CPOE2 的订单类流程（Discharge/Admission）已在实机验证过，实现 CPOE2 切片时直接复用 `flows/discharge.flow.ts` 与对应 Page Object 的选择器。

### 注册名 ↔ 代码目录映射

MODULES.md 用可读注册名；`page-objects/<dir>`、`steps/<dir>` 用既定目录名，首次建目录时在此登记：

| 注册名 | 目录 | 说明 |
|---|---|---|
| Auth | `auth` | |
| Patient Control | `page-objects/` 根 | 门户级页面，不属于任何模块目录 |
| Registration | `registration` | |
| Charge Services | `charge` | Coding 的页面操作也在 `page-objects/charge/`（同一 BNR 详情壳） |
| CPOE2 | `oe` | 对应 `ehr/src/OE` |
| Insurance Claims | `charge`（claims/adjustments PO 与 Billing 同壳） | 2026-09-16 定 |
