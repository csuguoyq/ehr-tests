# HOWTO.md — 增加测试脚本的学习参考

什么时候读：第一次要加测试脚本 / 新 goal，或卡在某一层怎么写的时候。
操作清单（切片前 / 落库 11 项 / 稳定性实践 / 调试循环 / AI 提示词 / 收尾）见 [NEW_MODULE.md](NEW_MODULE.md)。

引用约定：本文件「稳定性第 N 条」= [NEW_MODULE.md §4 稳定性实践](NEW_MODULE.md) 第 N 条；「收尾」= 其 §7。
规则全文见 [PROJECT.md](PROJECT.md)（铁律、阈值、North Star）。

## 1. 完整走查：create_patient 切片

Registration 的「新建患者」goal 是最标准的垂直切片：1 goal、2 step、2 PO、11 个可选参数、2 条 spec。
下面按落库顺序用真实代码说明每个文件为什么这么写。

### 1.1 goals/<域>.yaml — 目标注册（声明式）

真实片段（params 略）：

```yaml
  create_patient:
    aliases: ["create patient", "new patient", "add patient"]
    flow: CreatePatientFlow
    implemented: true
    params:
      # all optional; null = step generates defaults (name Testbot_<timestamp>, SSN date+time, DOB random year)
      firstName: { type: string, default: null, description: "defaults to Auto" }
      lastName: { type: string, default: null, description: "defaults to Testbot_<YYMMDDHHmm>" }
      ssn: { type: string, default: null, description: "defaults to <digit sum of YY><MMDD><HHmm> grouped 3-2-4; e.g. 2026-09-16 17:44 -> 809-16-1744" }
      dob: { type: string, default: null, description: "MM/DD/YYYY; defaults to current month/day + random year 1980-2005" }
      # ... address1 / city / state / zip / sex / citizenship / searchMrn（共 11 个）
```

要点：

- `aliases` 是 `runFromInput` 的自然语言匹配面——写用户真实会说的说法。
- `flow` 必须与 `flows/index.ts` 里导出的 Flow 常量名一致。
- 新 goal 先标 `implemented: false`，Flow 实现并注册后才翻 `true`；runner 对 `implemented: false` 的 goal 直接抛错。
- `default: null` 表示「由 step 生成默认值」（生成数据类参数，如患者姓名），不是「无值」——生成逻辑放在 step（或数据模块）。

### 1.2 Page Object — 选择器唯一权威（`page-objects/registration/patient-create.page.ts`）

头注释是「验证台账」：记录实机（fbch34）验证日期与每个字段的组件类型，后续维护不用重新调研：

```ts
// Verified on fbch34 (2026-09-12):
// - MRN field `[data-testid="sf-mrn-tf"] input` is a MUI TextField (testid on
//   the wrapper div); filling it makes the search form dirty/valid, which
//   enables the Create New Patient toolbar button.
// - D.O.B. is a MUI X DatePicker: input id `create-patient-dateOfBirth` ...
```

定位器在 constructor 集中定义（全部 `readonly Locator`）：

```ts
export class PatientCreatePage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly searchMrnInput: Locator;
  readonly createNewPatientButton: Locator;
  readonly dialog: Locator;
  readonly dobInput: Locator;
  readonly createButton: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.searchMrnInput = page.locator('[data-testid="sf-mrn-tf"] input');
    this.createNewPatientButton = page.getByTestId("patient-search-create-new-pat-btn");
    this.dialog = page.locator('[role=dialog][aria-labelledby="create-patient-title"]');
    this.dobInput = page.locator("#create-patient-dateOfBirth");
    this.createButton = page.getByTestId("create-patient-create-button");
  }
```

方法只放原子动作 + 断言，不写业务分支（铁律 2）。三个代表性模式：

1. **动作 + 值证明**：`fillTextField` 在 `fill` 之后回读值确认落上（SSN 字段是掩码显示，用末四位做证明）。
2. **轮询等结果**（不固定 sleep）：`waitForSubmitOutcome` 轮询到对话框关闭、或弹出 duplicate 警告、或超时返回 `"open"`（点击被吞，需重试）。
3. **成功证明**（step 最终 assert 的对象）：

```ts
  /** Success = dialog closed + a patient tab "<last>, <first>" is open. */
  async expectPatientCreated(lastName: string, firstName: string): Promise<void> {
    await expect(this.dialog).toBeHidden({ timeout: 20_000 });
    await expect(
      this.page.getByRole("tab", { name: `${lastName}, ${firstName}` })
    ).toBeVisible({ timeout: 20_000 });
  }
```

成功 toast 自动消失太快不可靠，tab 是稳定证明——这类「为什么」写进注释。

### 1.3 Step — 业务原子动作（`steps/registration/create-patient.step.ts`）

```ts
export async function createPatientStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const patient = {
    firstName: str(params.firstName, "Auto"),
    lastName: str(params.lastName, generateLastName()),
    ssn: str(params.ssn, generateSsn()),
    dob: str(params.dob, generateDob()),
    address1: str(params.address1, "123 Main St"),
    // ... city / state / zip / sex / citizenship / searchMrn
  };

  const create = new PatientCreatePage(ctx.page, ctx.env);
  ctx.log.step("create-patient", JSON.stringify(patient));
  await create.fillSearchMrn(patient.searchMrn);
  await create.openCreateDialog();
  // ... fillTextField / pickDob / selectOption 逐字段填 ...

  // Two failure modes (≤3 attempts): the duplicate warning (force-create)
  // and a submit click swallowed by the app (dialog stays open).
  await create.submit();
  let outcome = await create.waitForSubmitOutcome();
  for (let attempt = 0; attempt < 3 && outcome !== "closed"; attempt++) {
    if (outcome === "duplicate") {
      ctx.log.warn(`duplicate warning — force create (attempt ${attempt + 1})`);
      await create.forceCreateDespiteDuplicate();
    } else {
      ctx.log.warn(`submit click swallowed — retry ${attempt + 1}`);
      await create.submit();
    }
    outcome = await create.waitForSubmitOutcome();
  }

  await create.expectPatientCreated(patient.lastName, patient.firstName);
  ctx.scratch.patient = patient;
}
```

四个关键点：

1. **默认值解析在 step**（不在 PO、不在 goals.yaml）：`str(params.x, fallback)`——params 为 null 时用这里生成的 fallback（`generateLastName()` → `Testbot_YYMMDDHHmm`，测试数据约定，见稳定性第 6 条）。
2. **重试模式 = 动作 → 可观察证明 → ≤N 次**：每次重试先问 `waitForSubmitOutcome`「上一次发生了什么」，再分支处理；不允许盲重试。
3. **成功证明收尾**：`expectPatientCreated`——step 结束前没有证明就不算完成。
4. **`ctx.scratch.patient = patient`**：把生成的患者放进共享状态，同一编排里后续 goal（quick_charge / coding_complete / discharge）直接复用——这就是 goals yaml 里 `patientName?（缺省复用同次编排生成的患者）` 类描述背后的机制。**参数组合是数据不是分支**（铁律 7；ctx 机制见 §2）。

### 1.4 Flow — 只编排（`flows/create-patient.flow.ts`）

全文：

```ts
import type { FlowDefinition } from "../src/types/flow";
import { openRegistrationStep } from "../steps/registration/registration-open.step";
import { createPatientStep } from "../steps/registration/create-patient.step";

export const CreatePatientFlow: FlowDefinition = {
  goal: "create_patient",
  description: "Open Registration and create a new patient (unique Testbot name + random SSN/DOB)",
  async execute(ctx, params) {
    await openRegistrationStep(ctx, params);
    await createPatientStep(ctx, params);
  },
};
```

零定位器（铁律 4）：Flow 只负责 step 的「顺序」，不负责「怎么点」。
`goal` 字段必须与 goals yaml 键名一致，常量名必须与 goals yaml 的 `flow` 一致。

### 1.5 注册表 — `flows/index.ts`（最易漏）

```ts
import { CreatePatientFlow } from "./create-patient.flow";
// ...
export const FLOWS: Record<string, FlowDefinition> = {
  // ...
  create_patient: CreatePatientFlow,
  // ...
};
```

加 import + `FLOWS` 一行。漏了这行，运行时报「goal 在 goals yaml 注册但 Flow 未实现」，
`npm run check:goals` 也会直接拦下。

### 1.6 Spec — 测试入口（`specs/create-patient.spec.ts`）

```ts
import { test, expect } from "../fixtures/auth.fixture";
import { runGoal, loadGoals } from "../src/executor/runner";
import { resolveParams } from "../src/executor/param-resolver";
import { generateLastName, generateSsn } from "../steps/registration/patient-data";

test("goal-driven create_patient: registration opens -> patient created -> patient tab opens", async ({ authedPage }) => {
  const lastName = generateLastName();
  const ssn = generateSsn();
  const params = await runGoal(authedPage, "create_patient", {
    params: { lastName, ssn },
  });

  await expect(authedPage.getByRole("tab", { name: `${lastName}, Auto` })).toBeVisible();
  if (params.lastName !== lastName || params.ssn !== ssn) {
    throw new Error("explicit lastName/ssn params did not take effect");
  }
});

test("goal schema: create_patient is implemented and default params resolve", async () => {
  const goals = loadGoals();
  const goal = goals["create_patient"];
  if (!goal) throw new Error("goals yaml is missing the create_patient goal");
  if (goal.implemented === false) throw new Error("create_patient should be marked implemented: true");
  // ... 另断言 aliases 齐全、不带越界参数（如 patientMode 属于 create_encounter）
});
```

两种模式：

1. **实机 E2E**：传入固定 lastName/ssn（以便断言「显式参数生效」）+ 断言最终状态（患者 tab 出现）。
2. **不开浏览器的 schema 单测**：校验 goals 注册本身（存在、implemented、aliases 齐全、参数合理）——
   快、不依赖环境，E2E 之前就能抓到 goals yaml 写错。**每个新 goal 都带一条。**

TC 型 spec 放 `specs/sz/TC<id>-slug.spec.ts`，无头实机验证通过后登记 TCS.md。

### 1.7 四张状态表 — 各自加什么

- **MODULES.md**：模块状态行；新模块先在「注册名 ↔ 代码目录映射」表加行。示例（Registration 行）：

  `| Registration | 患者、Guarantor、Encounter、出院（ehr/src/Registration） | P0 | 待调研 | 5 | 已覆盖 | | 2026-09-16 |`

- **PAGES.md**：每覆盖一个页面加一张卡（「已实现动作」列列 PO 方法名，「用于 Flow」列列 goal 名）。示例（Patient Create 行）：

  `| Patient Create | rail REGISTRATION → Create New Patient 对话框（MUI，无独立路由） | P0 | 已通过 | fillSearchMrn, openCreateDialog, fillTextField, pickDob, selectOption, submit, expectPatientCreated | create_patient, claim_to_submitted | 2026-09-12 |`

- **GOALS.md**：每 goal 一行（参数列写可选/必填 + 缺省，状态列必须带实机验证日期与 host）。示例：

  `| create_patient | CreatePatientFlow | Registration | 全部可选：firstName?, lastName?, ssn?, dob?, ...（缺省由 step 生成唯一数据） | 已通过 |`

- **TCS.md**：仅 TC 场景——无头实机验证通过后登记（TC 号 → spec → 状态）。

MODULES / PAGES / GOALS 的行同步由 `npm run check:goals` 一致性门兜住（GOALS.md 行 ↔ goals.yaml ↔ FLOWS 注册 ↔ spec 引用）。

### 1.8 收尾门

按收尾清单（NEW_MODULE.md §7）：`npm run build:drv && npm run check:goals` 绿、`npx tsc --noEmit` 干净、
新 spec 无头实机验证通过。

## 2. Context 与 fixtures

每个 step 收到的 `ctx: EhrContext`（定义在 `src/types/ehr-context.ts`）有 5 个字段：

| 字段 | 是什么 | 用途 |
|---|---|---|
| `page` | Playwright page | 传给 PO constructor |
| `env` | 解析后的环境配置（host / baseUrl / username / password） | PO 导航 URL、登录参数 env 兜底 |
| `log` | 命名空间 logger | `ctx.log.step/info/warn`——每个动作与重试留痕 |
| `data` | `data/*.json` 内容（plans / cpts / diagnoses） | 读静态测试数据 |
| `scratch` | **整个 test 共享的运行时状态** | 跨 goal 传生成数据（患者 / BNR id） |

`scratch` 是跨 goal 复用的关键机制：`createEhrContext`（runner.ts）按 page 缓存 context（WeakMap），
同一个 test 里多次 `runGoal` 共享同一个 ctx——`create_patient` 写入的 `scratch.patient` 可以被
`quick_charge` / `discharge` 直接读。新 test 是新 page，scratch 不会跨 test 泄漏。
所以写新 step 时，参数优先「用上游 goal 的 scratch」而不是显式传参。

spec 侧有两个 fixture（`fixtures/`）：

| Fixture | 定义于 | 给什么 |
|---|---|---|
| `ehr` | `ehr.fixture.ts` | `EhrContext`（page + env + logger + data）；另控制 HEADLESS / SLOW_MO / KEEP_BROWSER_MS 等启动参数 |
| `authedPage` | `auth.fixture.ts` | **已登录**的 page：token 登录优先（`api/auth.ts` 快路），失败回退 UI `runGoal(page, "login")` |

约定：业务 spec 用 `authedPage`（不在每条 spec 里重走登录）；只有登录相关 spec 用 `ehr` 直接测 UI 登录路径。

## 3. 文件模板

### goals.yaml 段

```yaml
  <goal_name>:
    aliases: ["<natural language>"]
    flow: <GoalName>Flow
    implemented: true
    params:
      <param>: { type: string, default: null, description: "…" }
    presets:
      <preset_name>: { <param>: <value> }
```

### Page Object（`page-objects/<模块>/xxx.page.ts`）

```ts
import type { Page, Locator } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export class XxxPage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;
  constructor(page: Page, env: EhrEnvConfig) { /* locators as readonly fields */ }
  // atomic actions + locators only — no business branching (iron rule 2)
}
```

### Step（`steps/<模块>/xxx.step.ts`）

```ts
import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";

export async function doThing(ctx: EhrContext, params: ResolvedParams) {
  // validate params, resolve defaults (use `str` from src/utils/params), ≤3 branches
}
```

### Flow（`flows/xxx.flow.ts`）

```ts
export const XxxFlow: FlowDefinition = {
  goal: "<goal_name>",
  async execute(ctx, params) {
    // orchestrate steps only — zero locators (iron rule 4)
  },
};
```

别忘了 `flows/index.ts` 注册 + `GOALS.md` 行 + goals.yaml `implemented: true`。

### Spec（TC 型：`specs/sz/TC<id>-slug.spec.ts`）

```ts
test("TC<id>: <one-line expectation>", { tag: "@slow" }, async ({ authedPage }) => {
  await runGoal(authedPage, "<goal>", { params: { … } });
  // assert per the TC's Expected section
});
```

## 4. 选择器发现与验证

三个来源（按优先级）：

1. **用户 codegen 录制**（TC 场景首选）：
   `npx playwright codegen --ignore-https-errors -o recordings/<SZ号>.manual.ts "<测试入口URL>"`
   录制只作素材、不入库；从录制代码提取真实操作路径与选择器，再重构成 PO + step + flow（稳定性第 3 条）。
2. **实机 UI 检查**：headed 跑起来，devtools 检查 DOM。**实机是权威。**
3. **grep 应用源码**：`$CCSRC_PATH/ehr/src/<模块>`（`.env` 配置，默认 `../ccsrc`），搜 label 文本 / testid / 组件名。
   源码是草稿、实机是权威：本地源码树 ≠ 目标 box 的部署构建
   （历史上出现过 8 个选择器 box 有、源码没有）。差异记 PROJECT.md。

沉淀规则：任何交互会话（AI 或人工）验证过的选择器**必须沉淀进 Page Object**——PO 是选择器唯一权威，
spec 与 step 里不允许出现定位器。定期审计：`npm run check:selectors`
（有应用源码时把 `data-testid` 追溯到 `../ehr/src`）。

## 5. 测试脚本（spec）写法方法论

### 5.1 定位：spec 是入口，不是脚本

spec 测试体理想 3~5 行：**跑 goal + 断言最终状态**。「怎么做」全部下沉到 flow / step / PO。
判断标准：spec 一旦超过 10 行，多半有逻辑该下沉（定位器去 PO、业务分支去 step、编排去 flow）。

### 5.2 要写哪两种测试

| 种类 | 浏览器 | 校验什么 | 何时写 |
|---|---|---|---|
| 实机 E2E | `authedPage` | goal 跑通 + 最终状态正确 | 每个 goal 一条 |
| schema 单测 | 无 | goals.yaml 注册（存在 / implemented / aliases / 参数合理） | 新 goal 必配一条；改参数时同步更新 |

schema 单测快、不依赖环境，能在 E2E 之前抓到 goals.yaml 写错——示例见 §1.6。

### 5.3 断言方法论

- **断言稳定最终状态，不断言瞬态现象**：
  - 稳定：患者 tab 出现、对话框关闭、行出现、余额归零、claim 状态变 Submitted
  - 不稳定：成功 toast（自动消失）、loading 指示器
- **参数化断言**：传入固定数据、断言该数据生效（证明参数通道正确）——
  create-patient.spec.ts 的 `params.lastName !== lastName` 检查就是这个模式。
- 断言带显式 timeout（`{ timeout: 20_000 }`）；服务器侧慢路径用**条件轮询**而非固定等待（稳定性第 1 条）。
- **日期断言按 box「今天」**（fbch34 美西）：today/yesterday 双候选（稳定性第 8 条）。

### 5.4 测试数据方法论

- Testbot_YYMMDDHHmm 命名、SSN 日期+时刻编码——能回溯创建时间、与他人数据区分（稳定性第 6 条）。
- 不清理造的数据、不动他人数据（共享 box）。
- 固定检索键：MRN 最快最准（Charge 侧），SSN 是 Registration 的主检索键。
- 生成数据的复用走 `ctx.scratch`（§2），不靠重新传参。

### 5.5 文件与命名约定

- 普通 goal：`specs/<goal-slug>.spec.ts`（kebab-case，与 flow 文件名一致）
- TC 场景：`specs/sz/TC<id>-slug.spec.ts`，无头实机通过后登记 TCS.md
- test 标题 = 一句话预期；TC 场景以 TC 号开头
- 长链 spec 加 `{ tag: "@slow" }`；默认串行执行（workers: 1，共享环境数据）

### 5.6 spec 里不能出现什么（铁律边界）

| 禁止项 | 该放哪 | 依据 |
|---|---|---|
| 定位器（`page.locator` / `getByTestId` / …） | page-objects | 选择器唯一权威（铁律 2） |
| 业务分支（`if (场景)`） | step / goals.yaml presets | 参数组合是数据不是分支（铁律 7） |
| 修改已通过的 spec | 新增 spec | 铁律 10 |
| AI 调用 | — | 运行时确定性（铁律 5） |
| `setTimeout` 固定等待 | `src/utils/wait.ts` 条件轮询 | 稳定性第 1 条 |

### 5.7 证据与失败汇报

- 关键断言前 `test.info().attach` 现场截图——失败现场就是最需要看的现场。
- 环境阻断与真实失败分开报（稳定性第 9 条）；汇报必带 host（稳定性第 7 条）。
