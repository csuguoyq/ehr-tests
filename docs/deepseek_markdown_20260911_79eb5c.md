# EHR Playwright 自动化测试框架实施计划（可扩展版）

> 本文档是给 AI 编码助手的实施指南。EHR 系统模块众多，本计划不预设全部模块，而是定义发现、登记、切片、扩展的机制。每轮只做一个垂直切片，完成后更新状态文件，再进行下一轮。

---

## 1. 项目目标

构建一个基于 Playwright + TypeScript 的 EHR 自动化测试框架，实现：

- 用户输入自然语言目标（如“创建一个 claim 到 Submitted”），执行器匹配预定义 Flow 并直接跑完。
- 运行时纯 Playwright 执行，不调用 AI，不逐步交互。
- 支持任意数量模块和页面，按需登记、按需切片、逐步扩展。
- 参数组合通过 schema + preset + 默认值处理，不写死分支。
- 失败时记录 trace、截图，离线由 AI 修复，不影响运行时效率。

---

## 2. 核心设计原则

### 2.1 分层架构

| 层 | 职责 | 禁止 |
|---|---|---|
| Page Object | 页面原子动作、定位器、断言、弹窗处理 | 不写业务 if、不编排流程 |
| Step | 业务原子动作，参数校验、默认值、分支映射 | 不超过 3 个分支 |
| Flow | 编排多个 Step，实现一个业务目标 | 不直接写定位器 |
| Spec | Playwright 测试入口，调用 Flow | 不写业务逻辑 |
| goals.yaml | 声明目标、参数 schema、preset、别名 | 不写代码 |
| 执行器 | 解析用户输入，匹配目标，合并参数，调用 Flow | 运行时禁止调用 AI |
| 模块注册表 | 登记 EHR 所有模块、页面、状态、负责人 | 不写业务逻辑 |

### 2.2 垂直切片

- 不按页面清单水平铺开，按业务目标垂直打通。
- 每个切片必须包含：Page Object、Step、Flow、Spec、goals.yaml 条目、状态更新。
- 每个切片可独立运行，并可被后续完整流程复用。
- 切片来源不预设，由模块注册表按需挑选。

### 2.3 抽象时机

- 第一次写线性 spec 跑通。
- 第二次用到同一页面动作时抽 Page Object。
- 第三次出现参数组合时加参数对象。
- 不提前抽象，不写全量参数矩阵。

### 2.4 铁律

1. 先线性 spec 跑通，再抽 Page Object。
2. Page Object 不写业务 if。
3. Step 不超过 3 个分支。
4. Flow 只编排，不写定位器。
5. 运行时禁止调用 AI。
6. 新增能力必须更新 `goals.yaml`、`MODULES.md`、`PAGES.md`、`GOALS.md`。
7. 参数组合是数据，不是分支。
8. 不要提前抽象，第二次复用时才抽。
9. 每轮只做一个切片，不顺手做别的。
10. 不修改已通过的 spec，除非本轮明确要求。
11. 目录和模块按需扩展，不预设全量清单。
12. 未实现的模块只在注册表登记，不提前建空文件。

---

## 3. 目录结构（可扩展）

基础骨架固定，业务目录按模块动态扩展。

```
ehr-tests/
├── PROJECT.md                 # 项目总体设计、已知限制
├── MODULES.md                 # 模块注册表（所有 EHR 模块）
├── PAGES.md                   # 页面实现状态表（全量，按模块分组）
├── GOALS.md                   # 目标清单与状态
├── goals.yaml                 # 目标与参数 schema 定义
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── src/
│   ├── executor/              # 目标执行器
│   │   ├── goal-matcher.ts
│   │   ├── param-resolver.ts
│   │   └── runner.ts
│   ├── types/                 # 核心类型
│   │   ├── ehr-context.ts
│   │   ├── goal.ts
│   │   └── flow.ts
│   └── utils/
│       ├── logger.ts
│       └── wait.ts
├── fixtures/
│   ├── auth.fixture.ts
│   └── ehr.fixture.ts
├── page-objects/
│   └── <module>/              # 按模块动态创建
│       └── <page>.page.ts
├── steps/
│   └── <module>/
│       └── <step>.step.ts
├── flows/
│   └── <goal>.flow.ts
├── specs/
│   └── <goal>.spec.ts
├── api/
│   ├── client.ts
│   └── <module>.api.ts
└── data/
    ├── plans.json
    ├── cpts.json
    └── diagnoses.json
```

规则：

- `<module>` 目录只在实现该模块第一个切片时创建。
- 未实现的模块不建空目录、不建空文件。
- 模块名统一小写连字符，如 `registration`、`charge-services`、`insurance-claims`。

---

## 4. 模块注册表 `MODULES.md`

这是全量模块清单，也是切片来源。每发现一个新模块就登记一行。

### 4.1 模板

```md
| 模块 | 说明 | 优先级 | 页面数 | 已实现页面 | 状态 | 负责人 | 最后更新 |
|---|---|---|---|---|---|---|---|
| Registration | 患者、Guarantor、Encounter、出院 | P0 | 12 | 2 | 进行中 | | 2026-09-11 |
| Charge Services | BNR、Charges、Quick Charge | P0 | 8 | 0 | 未开始 | | |
| Coding | Diagnosis、ADT、DRG | P0 | 6 | 0 | 未开始 | | |
| CPOE2 | Order Reconcile、Discharge | P0 | 5 | 0 | 未开始 | | |
| Billing | Start Billing、Bill Now、Force Bill | P0 | 4 | 0 | 未开始 | | |
| Insurance Claims | Submit、Force Submit | P0 | 3 | 0 | 未开始 | | |
```

### 4.2 模块状态

```
未登记 → 已登记 → 调研中 → 切片中 → 部分实现 → 已覆盖 → 已回归
```

### 4.3 如何发现模块

- 从 EHR 导航菜单抓取一级、二级菜单。
- 从路由表、API 文档、权限配置补充。
- 从现有手工测试用例反推。
- 从用户目标反推需要的模块。

发现后先登记，不急着实现。

---

## 5. 页面状态表 `PAGES.md`

全量页面清单，按模块分组。每发现一个页面就登记一行。

### 5.1 模板

```md
## Registration

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Patient Create | /registration/patient/new | P0 | 已通过 | createPatient | create_patient, claim_to_submitted | 2026-09-11 |
| Encounter | /registration/patients/:id/encounters | P0 | 切片中 | newEncounter, admit | create_encounter | |
| Discharge | ... | P0 | 未开始 | | | |

## Charge Services

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| BNR | ... | P0 | 未开始 | | | |
| Quick Charge | ... | P0 | 未开始 | | | |
```

### 5.2 页面状态

```
未登记 → 已登记 → 定位器已抓 → 动作已实现 → 断言已实现 → 已接入 Flow → 已通过 → 已回归
```

### 5.3 页面实现卡

每个页面可维护一张卡片，模板：

```yaml
page: Encounter
module: Registration
route: /registration/patients/:patientId/encounters
priority: P0
entry:
  - Registration → Encounters
exit:
  - Encounter detail
iframe: false
locators:
  newEncounterButton: role=button[name="New Encounter"]
  encounterTypeSelect: label="Encounter Type"
  admitButton: role=button[name="Admit"]
actions:
  - goto(patientId)
  - clickNewEncounter()
  - selectEncounterType(type)
  - clickAdmit()
assertions:
  - expectLoaded()
  - expectEncounterCreated()
  - expectStatus('Admitted')
dialogs: []
fallbacks: []
usedByFlows:
  - create_encounter
  - claim_to_submitted
status: in_progress
lastVerified: 2026-09-11
```

---

## 6. 目标清单 `GOALS.md`

每个业务目标一行，状态跟踪。

```md
| 目标 | Flow | 依赖模块 | 参数 | 状态 |
|---|---|---|---|---|
| login | LoginFlow | Auth | username, password | 未开始 |
| create_patient | CreatePatientFlow | Registration | planId, guarantor | 未开始 |
| create_encounter | CreateEncounterFlow | Registration | patientMode, patientId?, planId?, encounterType, admit, waitForBnr | 未开始 |
| quick_charge | QuickChargeFlow | Charge Services | bnrId, cpts, qty | 未开始 |
| coding_complete | CodingCompleteFlow | Coding | encounterId, admitDiagnosis, principalDiagnosis, dischargeDisposition | 未开始 |
| discharge | DischargeFlow | CPOE2, Registration | encounterId, dischargeDisposition | 未开始 |
| billing_billed | BillingFlow | Billing | encounterId | 未开始 |
| claim_submitted | ClaimSubmitFlow | Insurance Claims | encounterId | 未开始 |
| claim_to_submitted | ClaimToSubmittedFlow | 全部 | planId, cpts, qty | 未开始 |
```

目标按需增加，不预设全量。

---

## 7. `goals.yaml` 骨架

只写已登记目标，未实现的先不写详细 schema。

```yaml
goals:
  login:
    aliases: ["登录", "login"]
    flow: LoginFlow
    params:
      username: { type: string, default: "test_user" }
      password: { type: string, default: "test_pass" }

  create_patient:
    aliases: ["创建患者", "create patient"]
    flow: CreatePatientFlow
    params:
      planId: { type: string, default: "68888" }
      guarantor: { type: string, default: "Self" }

  create_encounter:
    aliases: ["创建一个 encounter", "create encounter"]
    flow: CreateEncounterFlow
    params:
      patientMode:
        enum: [new, existing, api]
        default: new
      patientId:
        type: string
        requiredIf: { patientMode: existing }
      planId:
        type: string
        default: "68888"
        requiredIf: { patientMode: [new, api] }
      encounterType:
        enum: [Inpatient Acute, Outpatient, Emergency, Observation]
        default: Inpatient Acute
      admit:
        type: boolean
        default: null
      waitForBnr:
        type: boolean
        default: null
    presets:
      inpatient_acute_admit:
        patientMode: new
        planId: "68888"
        encounterType: Inpatient Acute
        admit: true
        waitForBnr: true
      inpatient_acute_existing_patient:
        patientMode: existing
        encounterType: Inpatient Acute
        admit: true
        waitForBnr: false
      outpatient:
        patientMode: new
        planId: "68888"
        encounterType: Outpatient
        admit: false
        waitForBnr: false
```

---

## 8. 初始契约文件

### 8.1 `PROJECT.md`

```md
# EHR Playwright Framework

## 目标
用户输入自然语言目标，执行器匹配 Flow，Playwright 直接执行。

## 分层
- page-objects: 页面原子动作
- steps: 业务原子动作
- flows: 目标编排
- specs: 测试入口
- goals.yaml: 目标 + 参数 schema
- MODULES.md: 模块注册表
- PAGES.md: 页面状态表
- GOALS.md: 目标清单

## 约定
- Page Object 不写业务 if
- Step 不超过 3 个分支
- Flow 只编排，不写定位器
- 运行时禁止调用 AI
- 新增能力必须同时更新 goals.yaml、MODULES.md、PAGES.md、GOALS.md

## 铁律
1. 先线性 spec 跑通，再抽 Page Object
2. Page Object 不写业务 if
3. Step 不超过 3 个分支
4. Flow 只编排，不写定位器
5. 运行时禁止调用 AI
6. 新增能力必须更新四个状态文件
7. 参数组合是数据，不是分支
8. 不要提前抽象，第二次复用时才抽
9. 每轮只做一个切片，不顺手做别的
10. 不修改已通过的 spec，除非本轮明确要求
11. 目录和模块按需扩展，不预设全量清单
12. 未实现的模块只在注册表登记，不提前建空文件

## 已知限制
（每轮追加）
```

### 8.2 `MODULES.md` 初始内容

```md
| 模块 | 说明 | 优先级 | 页面数 | 已实现页面 | 状态 | 负责人 | 最后更新 |
|---|---|---|---|---|---|---|---|
| Auth | 登录、登出 | P0 | 2 | 0 | 已登记 | | |
| Registration | 患者、Guarantor、Encounter、出院 | P0 | 待调研 | 0 | 已登记 | | |
| Charge Services | BNR、Charges、Quick Charge | P0 | 待调研 | 0 | 已登记 | | |
| Coding | Diagnosis、ADT、DRG | P0 | 待调研 | 0 | 已登记 | | |
| CPOE2 | Order Reconcile、Discharge | P0 | 待调研 | 0 | 已登记 | | |
| Billing | Start Billing、Bill Now、Force Bill | P0 | 待调研 | 0 | 已登记 | | |
| Insurance Claims | Submit、Force Submit | P0 | 待调研 | 0 | 已登记 | | |
```

### 8.3 `PAGES.md` 初始内容

```md
## Auth
| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Login | /login | P0 | 未开始 | | | |

## Registration
| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Patient Create | | P0 | 未开始 | | | |
| Encounter | | P0 | 未开始 | | | |
| Discharge | | P0 | 未开始 | | | |

## Charge Services
| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| BNR | | P0 | 未开始 | | | |
| Quick Charge | | P0 | 未开始 | | | |

## Coding
| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Diagnosis | | P0 | 未开始 | | | |
| ADT | | P0 | 未开始 | | | |

## CPOE2
| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Order Reconcile | | P0 | 未开始 | | | |

## Billing
| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Billing | | P0 | 未开始 | | | |

## Insurance Claims
| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Submit Claim | | P0 | 未开始 | | | |
```

### 8.4 `GOALS.md` 初始内容

见第 6 节。

---

## 9. 模块发现与登记流程

当需要实现一个新模块时，按以下步骤：

### 9.1 发现

1. 从 EHR 导航菜单抓取模块和子菜单。
2. 从路由表、API 文档补充。
3. 从手工测试用例反推。
4. 从用户目标反推。

### 9.2 登记

在 `MODULES.md` 新增一行：

```md
| <模块> | <说明> | <优先级> | 待调研 | 0 | 已登记 | | <日期> |
```

在 `PAGES.md` 新增该模块分组，列出已知页面。

### 9.3 调研

调研该模块以确定：

- 页面清单
- 路由
- 入口和出口
- 是否 iframe
- 关键定位器
- 关键动作
- 弹窗和异常
- 与其他模块的依赖

调研结果写入 `PAGES.md` 的页面卡片。

### 9.4 切片

从该模块挑选一个业务目标作为切片，按第 10 节流程实施。

### 9.5 更新

每完成一个切片，更新：

- `MODULES.md`：已实现页面数、状态
- `PAGES.md`：页面状态、已实现动作
- `GOALS.md`：目标状态
- `goals.yaml`：目标 schema
- `PROJECT.md`：已知限制

---

## 10. 每轮通用工作流程

每轮开始时，AI 必须：

1. 读取 `PROJECT.md`、`MODULES.md`、`PAGES.md`、`GOALS.md`。
2. 明确本轮切片名称、所属模块、范围、参数、断言、产出文件、验收命令。
3. 遵守铁律。
4. 完成后更新四个状态文件。
5. 运行验收命令并报告结果。

### 通用提示模板

```
请先读 PROJECT.md、MODULES.md、PAGES.md、GOALS.md。

本轮任务：实现模块「<模块>」下的切片「<切片名称>」。

范围：
- <明确支持哪些组合，不支持哪些>

要求：
1. 先写线性 spec 跑通，再抽 Page Object。
2. 涉及页面：<列出页面>。
3. 产出文件：
   - page-objects/<module>/<page>.page.ts
   - steps/<module>/<step>.step.ts
   - flows/<flow>.flow.ts
   - specs/<spec>.spec.ts
   - goals.yaml 中新增 <goal>
4. 参数：
   - <参数名>: <类型、默认值、约束>
5. 断言：
   - <断言内容>
6. 更新 MODULES.md、PAGES.md、GOALS.md、PROJECT.md。

验收：
- <验收命令> 通过
- 已有 spec 不回归

输出：
- 所有新增/修改文件
- 运行命令
- 已知限制
```

---

## 11. 实施路线图（动态）

路线图不写死全部模块，只定义阶段目标。每个阶段从 `MODULES.md` 挑选模块，从 `PAGES.md` 挑选页面，按切片实施。

| 阶段 | 目标 | 切片来源 | 验收 |
|---|---|---|---|
| 0 | 骨架 | 无 | `npx playwright test` 无错误 |
| 1 | 登录 | Auth | login spec 通过 |
| 2 | 第一条垂直流程 | Registration + 相关模块 | create_encounter spec 通过 |
| 3 | 收费 | Charge Services | quick_charge spec 通过 |
| 4 | 编码 | Coding | coding_complete spec 通过 |
| 5 | 出院 | CPOE2 + Registration | discharge spec 通过 |
| 6 | 计费 | Billing | billing_billed spec 通过 |
| 7 | 理赔提交 | Insurance Claims | claim_submitted spec 通过 |
| 8 | 完整目标 | 编排以上所有 | claim_to_submitted spec 通过 |
| 9+ | 按需扩展 | 从 MODULES.md 挑选 | 对应 spec 通过 |

说明：

- 阶段 2 之后，每个阶段可以独立选择模块，不强制线性。
- 如果 EHR 有更多模块（如 Scheduling、Radiology、Pharmacy、Lab、Reports），在阶段 9+ 按需加入。
- 每新增一个模块，先在 `MODULES.md` 登记，再按第 9 节流程切片。

---

## 12. 各阶段详细规格（示例）

以下是已明确阶段的规格。未知模块的规格在调研后补充。

### 阶段 0：骨架

任务：只建目录、配置文件、类型定义、fixture 占位、执行器骨架、四个状态文件。不写任何业务页面逻辑。

产出：

- 完整目录树
- `package.json`、`playwright.config.ts`、`tsconfig.json`
- `src/types/ehr-context.ts`、`src/types/goal.ts`、`src/types/flow.ts`
- `src/executor/goal-matcher.ts`、`param-resolver.ts`、`runner.ts`（空实现）
- `fixtures/auth.fixture.ts`（占位）、`fixtures/ehr.fixture.ts`（暴露空对象）
- `goals.yaml` 骨架
- `PROJECT.md`、`MODULES.md`、`PAGES.md`、`GOALS.md`

验收：`npx playwright test` 无错误。

---

### 阶段 1：登录

范围：实现登录页面，成功登录后保存会话。

产出：

- `page-objects/auth/login.page.ts`
- `steps/auth/login.step.ts`
- `flows/login.flow.ts`
- `specs/login.spec.ts`
- `goals.yaml` 中 `login`

验收：`npx playwright test specs/login.spec.ts`

---

### 阶段 2：第一条垂直流程

范围：从 `MODULES.md` 中挑选 P0 模块的第一个切片，通常是 Registration → Patient Create → Encounter → Admit。

要求：

- 只支持 Inpatient Acute + 新患者 + Admit + 等待 BNR。
- 其他组合接口留好但不实现。
- 参数：`patientMode`、`planId`、`encounterType`、`admit`、`waitForBnr`。

产出：

- `page-objects/registration/patient-create.page.ts`
- `page-objects/registration/encounter.page.ts`
- `steps/registration/create-patient.step.ts`
- `steps/registration/create-encounter.step.ts`
- `flows/create-patient.flow.ts`
- `flows/create-encounter.flow.ts`
- `specs/create-patient.spec.ts`
- `specs/create-encounter.spec.ts`
- `goals.yaml` 中 `create_patient`、`create_encounter`

验收：两个 spec 均通过。

---

### 阶段 3 至 8

按第 11 节路线图执行。每个阶段的详细规格与阶段 2 类似：

- 明确范围
- 明确参数
- 明确断言
- 明确产出
- 明确验收
- 更新四个状态文件

---

### 阶段 9+：按需扩展

每新增一个模块或目标：

1. 在 `MODULES.md` 登记。
2. 在 `PAGES.md` 登记页面。
3. 按第 9 节流程调研。
4. 按通用模板切片实施。
5. 更新状态文件。

---

## 13. 参数处理规范

- 参数 schema 写在 `goals.yaml`。
- 默认值在 schema 中声明。
- preset 用于常用组合。
- 参数解析优先级：命令行 > preset > 上下文 > 默认值。
- 必填缺失在入口一次性报错，不跑到一半才问。
- 条件必填用 `requiredIf`。
- 类型校验、互斥校验在 `param-resolver.ts` 中实现。
- Step 中根据参数调用 Page Object 原子动作，不写复杂分支。

---

## 14. 异常与 fallback 规范

- 弹窗处理封装在对应 Page Object 中。
- API fallback 封装在 `api/` 目录，Step 中 try-catch 调用。
- 已知环境缺陷记录在 `PROJECT.md`。
- 异常路径也要有 spec 覆盖。

---

## 15. 验收与回归

每轮完成后必须：

1. 运行本轮验收命令。
2. 运行全部已有 spec，确保无回归。
3. 更新 `MODULES.md`、`PAGES.md`、`GOALS.md`、`PROJECT.md`。
4. 记录本轮新增的已知限制。

---

## 16. 如何开始

第一轮请执行阶段 0：

```
请先读本文档。现在开始阶段 0：只建骨架，不写业务。

要求：
1. 创建目录结构（见第 3 节，业务模块目录暂不创建）。
2. 创建 package.json、playwright.config.ts、tsconfig.json。
3. 创建核心类型：EhrContext、GoalDefinition、FlowDefinition。
4. 创建 fixtures/auth.fixture.ts（占位）、fixtures/ehr.fixture.ts（暴露空对象）。
5. 创建 src/executor/ 下的 goal-matcher.ts、param-resolver.ts、runner.ts 空实现。
6. 创建 goals.yaml 骨架（见第 7 节）。
7. 创建 PROJECT.md、MODULES.md、PAGES.md、GOALS.md（见第 8 节）。
8. 创建一个空的 specs/login.spec.ts，确保 `npx playwright test` 无错误。

输出：完整目录树、每个文件内容、运行命令、验收结果。
```

之后每轮使用第 10 节通用提示模板，替换：

- 模块名
- 切片名称
- 范围
- 参数
- 产出
- 验收命令

---

## 附录 A：参考流程示例（Claim 到 Submitted）

### A.1 流程步骤

1. Create patient
   - Registration → create new patient
   - Guarantor (self)
   - Insurance (Plan ID 68888)
   - Encounters: new Inpatient Acute encounter → Admit
   - Hospital BNR 自动创建，等待几分钟

2. Charges
   - Charge Services → BNR → Charges → Quick Charge
   - 点击 96372 和 96374（qty 10）
   - Submit
   - CDM Conflict 弹窗点 "Submit Charge(s) for Review"
   - "Error Submitting" 弹窗是误报，dismiss

3. Coding
   - Coding → Diagnosis: 添加 I69.941（admit）+ S94.10XD（principal）→ Save Diagnosis
   - ADT: 点击铅笔图标 → Discharge Disposition = Home or self-care → Save → Complete
   - DRG 182 可选，本环境常为 None

4. Discharge（两部分）
   - ① CPOE2 → Order Reconcile → Discharge：表单自动打开（不要点 workflow step 按钮）→ 选 Home or self-care → Apply
   - ② Registration → Encounters → encounter 行 → Discharge → Discharge Patient
   - 如果按钮 disabled，走 DISCH API fallback（已知 ADT-linkage 环境缺陷）

5. Billing
   - Billing → Start Billing → Bill Now
   - 如果状态变为 BNR Edits，Force Bill 并填原因 → Billed
   - 前置：患者必须已 Discharged，否则 Start Billing 按钮不存在

6. Submit claim
   - Insurance Claims → Submit
   - Force Submit 并填原因 → Submitted

### A.2 对应参数

| 参数 | 值 |
|---|---|
| planId | 68888 |
| cpts | 96372, 96374 |
| qty | 10 |
| admitDiagnosis | I69.941 |
| principalDiagnosis | S94.10XD |
| dischargeDisposition | Home or self-care |
| forceBillReason | automation force bill |
| forceSubmitReason | automation force submit |

### A.3 已知环境缺陷

- BNR 自动创建需要等待几分钟。
- CDM Conflict 后的 "Error Submitting" 是误报，dismiss。
- DRG 182 常为 None，可选。
- Registration Discharge 按钮可能 disabled，走 DISCH API fallback。
- Start Billing 按钮存在前提：患者已 Discharged。

---

## 附录 B：参数 schema 参考

```yaml
create_encounter:
  params:
    patientMode:
      enum: [new, existing, api]
      default: new
    patientId:
      type: string
      requiredIf: { patientMode: existing }
    planId:
      type: string
      default: "68888"
      requiredIf: { patientMode: [new, api] }
    encounterType:
      enum: [Inpatient Acute, Outpatient, Emergency, Observation]
      default: Inpatient Acute
    admit:
      type: boolean
      default: null
    waitForBnr:
      type: boolean
      default: null
  presets:
    inpatient_acute_admit:
      patientMode: new
      planId: "68888"
      encounterType: Inpatient Acute
      admit: true
      waitForBnr: true
    inpatient_acute_existing_patient:
      patientMode: existing
      encounterType: Inpatient Acute
      admit: true
      waitForBnr: false
    outpatient:
      patientMode: new
      planId: "68888"
      encounterType: Outpatient
      admit: false
      waitForBnr: false
```

---

## 附录 C：运行命令参考

```bash
# 跑单个切片
npx playwright test specs/create-encounter.spec.ts

# 跑全部回归
npx playwright test

# 通过目标执行器跑（阶段 9+ 实现后）
ehr run "创建一个 encounter"
ehr run "创建一个 encounter" --preset inpatient_acute_admit
ehr run "创建一个 encounter" --patient-mode existing --patient-id 12345
ehr run "创建一个 claim 到 Submitted" --plan 68888 --cpt 96372,96374 --qty 10

# 调试
npx playwright test specs/create-encounter.spec.ts --headed
npx playwright test specs/create-encounter.spec.ts --debug
npx playwright show-trace trace.zip
```

---

文档版本：2.0（可扩展版）
创建日期：2026-09-11
适用对象：AI 编码助手
维护方式：每轮完成后更新四个状态文件；本文档在架构调整时修订，不随切片频繁修改。