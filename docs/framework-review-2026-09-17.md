# 框架设计与代码审查报告（2026-09-17）

- **对象**：ehr-tests 全仓（99 个跟踪文件：代码 ~5,630 行 + 文档 MD ~1,340 行）
- **方法**：三路并行审查（架构文档与状态表 / 代码分层与质量 / 运行配置与测试规范）+ 关键发现逐条人工复核（GOALS.md、flows/index.ts、specs/discharge.spec.ts、playwright.config.ts、scripts/check-goals.mjs、goals.yaml、tsconfig.build.json 均已实读确认）
- **修订（2026-09-17 复核）**：三路逐条核查 61 条论断（代码层 20 / 文档层 17 / 基建层 24），修正 7 处错误/行号偏移、补充 15 处遗漏发现（D13-D17、I10-I13、L5 等）——本版为修正后文本
- **增量（2026-09-17 晚）**：全仓非 md 文件已英文化（M5⑤ 随之修复）；goals.yaml 重写后仍 356 行，全部行号引用复核仍有效（仅 login.spec 一处偏移已更新）；新增 I14（CI 失败根因 = 项目无 runner）
- **结论先行**：核心设计扎实，"运行时零 AI"是构造性保证（全代码零 AI 依赖、无后门路径）。主要债务集中在四处：**文档-代码漂移无工具拦截、策略层缺失导致同一模式 3-6 处重复手写、order-entry PO 膨胀、一致性/超时/入门基建缺失。**

---

## 1. 总体评价

框架采用「声明式 `goals.yaml` + 纯字符串匹配执行器 + PO/Step/Flow 分层 + 铁律体系」：

- `goals.yaml` 声明目标/别名/参数 schema/preset；`src/executor/`（goal-matcher / param-resolver / runner）做纯字符串匹配与参数解析，入口一次性报错。
- `flows/` 纯编排（14 个 Flow 全部零定位器——这条纪律是干净的）；`steps/` 业务原子动作；`page-objects/` 选择器唯一权威。
- 稳定性文化的突出优点：几乎每个 workaround 都带 fbch34/fbch19 实测日期与现象记录（如 `order-entry.page.ts:299-301`），可追溯性是同类测试工程里少见的强项。
- TypeScript `strict: true`，`any` 实际使用为 0；错误消息质量整体优秀（失败时带上下文 dump、host 标注、TC 号引用）。

**问题不在设计方向，而在执行层的一致性与复用层。**

---

## 2. 设计层问题（根因，按重要性排序）

### 2.1 策略层缺失（最核心）

「取第一个候选」「点击被吞→验证状态→重试」「remount 刷新」这类逻辑，既不属于 PO（定位器知识）也不属于 step（业务分支），框架**没有给它们一个归属层**，结果是同一模式各写 3-6 遍：

| 模式 | 重复位置 | 处数 |
|---|---|---|
| rail 点击 | `page-objects/registration/registration-app.page.ts:22-26` / `charge/account-lookup.page.ts:83-89` / `oe/order-entry.page.ts:111-118` | 3 |
| 「取第一个候选」策略 | `oe/order-entry.page.ts` `fillAuthorizingProvider` / `charge/coding.page.ts:209-219` `setDischargeDisposition` / `registration/encounter.page.ts:64-77` `pickFirstAutocomplete` | 3 |
| 点击→验证状态→重试 | `quick-charge.step:24-53` / `create-patient.step:48-59` / `insurance.page:126-141` `pickOption` / `order-entry.page:168-178` `tickCandidates` / `billing.page:204-222` `waitForRebillable` / `patient-control.page.ts:99-120` `gotoCensusPage` | 6 |
| Unsaved Changes / OK 弹窗 | `add-insurance.step:74-83` 与 `:90-99`（同文件两遍）/ `assign-insurance-bnr.step:37-47`（独立一套 ExtJS+MUI 双 OK） | 3 |
| 「label→后继 input 扫描」循环内联三遍 | `registration/insurance.page.ts` `visibleInput`(:41-57) / `fillText`(:65-85) / `pickOption`(:106-146) 各自重复实现同一扫描 | 3 |
| 轮询惯用法两套并存 | 自写 deadline `while` 循环（billing/claims/order-entry）vs `expect.poll`（specs；wait.ts 的 while+evaluate 属前一阵营） | 2 |

`src/utils/wait.ts:13-32` 的泛型 `waitFor` 条件轮询原语**无任何 PO 直接调用者**（同模块 `waitLoggedInTitle` 被 `login.page.ts:10,82`、`api/auth.ts:13,41` 使用——PO 层没有复用条件轮询原语本身）。
**建议**：增设统一工具（`src/utils/retry.ts` 的 `retryUntil(action, prove, attempts)`）+ 策略约定（每次重试必须以可观察状态证明上一次动作生效）。

### 2.2 Flow 间无复用机制

`flows/claim-to-submitted.flow.ts:36-44` 把「open registration → create patient → guarantor → insurance → create encounter → admit → wait BNR」前缀**重新列了一遍**，而不是调用 `CreateEncounterFlow.execute`——两处必须人工保持同步。`FlowDefinition.execute(ctx, params)` 接口本身支持组合，但缺少「调用另一个 Flow」的约定。
**建议**：明确「Flow 可调 Flow」约定，前缀段抽成可组合单元。

### 2.3 `ctx.scratch` 是未定型全局总线

步骤间身份交接（patient/bnrId/charges/claim...）全靠 `ctx.scratch: Record<string, unknown>`（`src/types/ehr-context.ts:54`）+ 读方 7 处内联结构断言（4 处 step + specs 3 处），且**形状有 3 种互不一致**：

```ts
// steps/registration/open-patient-chart.step.ts:15（open-bnr-detail.step.ts:16 同形）
(ctx.scratch.patient as { lastName?: string } | undefined)?.lastName
// steps/registration/open-patient-registration.step.ts:14
ctx.scratch.patient as { ssn?: string; lastName?: string } | undefined
// steps/registration/add-insurance.step.ts:40
ctx.scratch.patient as { lastName?: string; firstName?: string; dob?: string; sex?: string } | undefined
```

是类型系统与架构的接缝，也是将来步骤乱序/复用时的隐性耦合。
**建议**：定义 `ScratchState` 接口，各字段定型（patient / bnrId / admitUnit / charges / billing / claim / adjustment...）。

### 2.4 PO 的 `page` 属性公开，选择器权威零成本被绕过

所有 PO 把 `page` 声明为 `readonly public`，客观上使 step 绕过 PO 写裸选择器零成本（实际 5 个 step 已泄漏，见 §3.1）。
**建议**：PO 收 `page` 为 private，只暴露动作方法；确需页级断言的，由 spec 层持 page 直读（spec 是断言归属层，合理）。

### 2.5 跨文件一致性无工具门

CI 的 `scripts/check-goals.mjs`（:11-16）只检查两件事：goals.yaml 可加载 + 每个键可匹配。**不检查**：

- goals.yaml `implemented: true` ↔ `flows/index.ts` FLOWS 注册表（忘注册 → 实机跑 spec 才报 "Flow 未实现"）
- goals ↔ 四张状态 MD 的行对应（GOALS.md 幽灵行 `claim_submitted` 就是这么漏下来的）
- specs 里 `runGoal("<name>")` 引用的 goal 是否存在

所有"忘了注册/忘了同步"目前**完全靠人**，且漂移实证已存在（§4）。
**建议**：扩展 check-goals.mjs 为一致性门（已在 CI 中、`tsconfig.build.json:5` 的 `module: commonjs` 确认编译 flows/ 为 CommonJS，`.build-drv/flows/index.js` 可直接 require）。

### 2.6 自设阈值越线无跟踪

PROJECT.md:100-106 定义了阈值，现状：

- `goals.yaml` **356 行 > 300 行**拆分阈值（:103），loader 的目录加载已就绪（`runner.ts:29-49` 支持 `goals/*.yaml`）但从未启用，PROJECT.md 也没记"待拆"。
- `flows/` 已注册 **14 个**目标，逼近「>15 → 加域层」阈值（:102），下一个目标加入即触发。
- 根 `goals.yaml` 与 `.build-drv/goals.yaml` 双份拷贝并存（`check-goals.mjs:8` 特意绕开副本读根文件，`drive-ml.js` 运行前同步拷贝），存在漂移窗口。

**建议**：阈值越线在 PROJECT.md 记一笔"待架构轮"，避免每次审计重新发现；目录调整只在专门架构轮做（铁律 9，维持）。

---

## 3. 代码层问题（按严重程度）

### 3.1 高

| # | 问题 | 位置 |
|---|---|---|
| H1 | `order-entry.page.ts` **530 行**（全仓最大），业务编排+死代码，违反铁律 2（PO 不写业务 if）最重：`addAdtDischargeOrder`（:139-206）是 Browse→选类→勾 checkbox→Add 的**完整业务链**（含 Non-Meds chip 分支 :149、checkbox 双候选重试 :168-178、"Add 不可用则自动填 Provider"业务决策 :186-188）；`fillAuthorizingProvider`（:218-276）把「取第一个候选（user convention 2026-09-16）」**业务约定写死在 PO**；`handleSaveDialogs`（:434-510）6 轮 sweep 内置整条 Save 弹窗链；`submitOrder`（:354-395）45s deadline 混杂弹窗处理与业务状态判断；`hasActiveOrder`（:514-517）body 全文 regex 断言。**死代码**：`clickLeafText`（:75，private 无调用）、`setProvider`（:412）、`applyOrderDetails`（:423）、`save()`（:428）——公开 API 但全仓无调用。"Done"/"Submit"（而非 "Apply"/"Save"）的说明在 `setDetailsDisposition` docblock（:326-328）；文件头注 :3 反而仍写 "→ Save"，头注与 docblock 自相矛盾（又一处注释漂移） | `page-objects/oe/order-entry.page.ts` |
| H2 | **5 个 step 裸选择器**（选择器权威泄漏）：`add-insurance.step.ts:20-33,69`（最重，101 行）；`open-patient-registration.step.ts:35,39,42`（RegistrationAppPage PO 存在但被绕过）；`assign-insurance-bnr.step.ts:21-44`（整步全裸选择器，AccountsPage PO 存在却未用）；`add-guarantor-self.step.ts:15,17,20,24,26`；`add-adjustment.step.ts:45`（通过 PO 公开 `page` 属性在 step 写定位器） | `steps/registration/*`、`steps/charge/add-adjustment.step.ts` |
| H3 | 注释承诺的逻辑不存在：注释写「poll 不到 Assign 就重开一次 editor（stale fetch）」，代码只有 `toBeVisible({timeout:30_000})`，**重开逻辑不存在**——注释与代码必有一错，需实机裁定（stale fetch 是否真实发生） | `steps/registration/assign-insurance-bnr.step.ts:25-31` |

### 3.2 中

| # | 问题 | 位置 |
|---|---|---|
| M1 | Step 体量/分支超限、变「迷你 Flow」：`add-insurance.step.ts` 101 行、6+ 分支、承担 lookup+15 表单字段+保存+脏标记试探，Unsaved Changes 处理复制两遍，:44 有注释掉的死代码 | `steps/registration/add-insurance.step.ts` |
| M2 | 同一策略 3-6 处重复实现 | 见 §2.1 表 |
| M3 | Flow 参数 if 灰区（对照铁律 7「参数组合是数据，不是分支」）：`claim-to-submitted.flow.ts:39` `if (params.insurance !== false)`；`create-encounter.flow.ts:20,32,38` 三处参数分支 | `flows/` |
| M4 | 脆弱选择器面（均有注释背书，属 UI 微改即断类别）：页级 `li[role=option]` **18 处**（6 个 PO，仅靠 hasText/.first() 区分，依赖"此刻只有一个打开的 listbox"时序约定）；位置假设 `#diagnosis-Code_Date.nth(k)`（`coding.page.ts:86`）、`input[placeholder="Make Selection"].nth(1)`（:198）、`inputs.nth(count-1)`（`order-entry.page.ts:229`）；xpath 8 处（范围受限）；placeholder 依赖文案（`login.page.ts:26-27` 等）；innerText regex 当断言/读金额（`order-entry:516,526`、`billing.page.ts:182` `readGuarantorBalance`、`claims.page.ts:178-182,27-32`）。无长 CSS 路径、无绝对 xpath——这一项干净 | 多处 |
| M5 | **5 处过期注释/skip**（状态表与代码事实脱节的实证）：① `flows/index.ts:3-5` 头注「discharge NOT registered yet」与同文件 :21/:37 实际注册**直接矛盾**；② `specs/discharge.spec.ts:1-9,15` 头注「IN PROGRESS」+ `test.skip` 是**纯历史残留**——discharge flow 已注册、goals.yaml:340 `implemented: true`（09-16 fbch34 实测）、GOALS.md/TCS.md 均记已通过，skip 掩盖了"discharge 其实已可回归"的事实；③ specs/sz 三个文件头注路径未随 SZ→TC 改名更新；④ `specs/sz/TC35474-claim-totals.spec.ts:34-38` 注释「force bill 不生成 claim」已被 2026-09-17 结论推翻（TCS.md 环境备注）；⑤ ~~drive-ml.js 过期「出院」示例~~（**已修复**：2026-09-17 英文化时改写为通用表述） | 多处 |

### 3.3 低

| # | 问题 | 位置 |
|---|---|---|
| L1 | `str()` 辅助函数在 **10 个 step 文件逐字重复定义**，应入 `src/utils` | `add-adjustment:12`、`coding-complete:9`、`submit-claim:9`、`force-bill:8`、`add-insurance:11`、`create-encounter:12`、`discharge-order:9`、`admit-encounter:8`、`create-patient:10`、`discharge-encounter:9` |
| L2 | 硬编码 `America/Los_Angeles` 时区（环境配置关注点进了 PO；box 时区≠本地时区是已知限制 :145，应入 env） | `page-objects/charge/coding.page.ts:95-103` `boxToday()` |
| L3 | token 登录失败仅一行 warn 后静默走 UI 兜底，错误细节丢失 | `fixtures/auth.fixture.ts:21-23` |
| L4 | `api/client.ts:21-28` `createSessionApiClient(env, _page: unknown)` 是 TODO 空壳（HTTP fallback 承诺未兑现） | `api/client.ts` |
| L5 | order-entry.page.ts 三处小缺陷：`:157` `waitForTimeout(1_000)` 固定 sleep 无注释背书（违 wait.ts:4-6 自定「conditions, never fixed sleeps」规约）；`:42` `clickBtn` regex 只转义 `/`、不转义 `(`/`)` 等元字符（潜伏缺陷，当前仅死代码 `applyOrderDetails` 传元字符文案）；`:512-513` 连续两个 docblock 残留 | `page-objects/oe/order-entry.page.ts` |

---

## 4. 文档层漂移（17 处，均已逐条核实）

| # | 文档 | 漂移 | 位置 |
|---|---|---|---|
| D1 | GOALS.md | **幽灵行 `claim_submitted`**：指向不存在的 goal/flow（goals.yaml 无此键、flows/ 无 claim-submitted.flow.ts，grep 0 命中；溯源：源自原始设计稿 `docs/deepseek_markdown_20260911_79eb5c.md:235`）；「待清理」从未发生 | `GOALS.md:13` |
| D2 | GOALS.md | **`submit_claim` 缺行**：goals.yaml:178 有（implemented: true）、FLOWS:32 有、PAGES.md:63 也引用，但 GOALS.md 表格没有它的行——违反铁律 6 | `GOALS.md` 全表 |
| D3 | GOALS.md | 表格被空行劈成两半：claim_to_submitted 行（:16）后两个空行（:17-18），:19-20 成为无表头的第二个表格碎片（Markdown 渲染时 :19 被当表头） | `GOALS.md:17-18` |
| D4 | GOALS.md | discharge 行「已通过」与「待 goal 注册 mrn 参数后开放」并列自相矛盾（goals.yaml:337-356 确实无 mrn 参数，"待开放"属实但措辞矛盾）；参数列漏 `firstName` | `GOALS.md:10` |
| D5 | GOALS.md | lookup_account / open_bnr_detail 两行 **6 单元格 malformed**（表头 5 列，状态与备注挤在一起） | `GOALS.md:14-15` |
| D6 | GOALS.md | `outpatient` preset 未登记（goals.yaml:114-131 实有三个 preset，只登记了 inpatient 两个） | `GOALS.md:7` |
| D7 | PAGES.md | **幽灵引用 `billing_billed`** ×2：全仓库代码/配置中不存在名为 billing_billed 的 goal/flow/spec | `PAGES.md:25,57` |
| D8 | PAGES.md | Insurance Claim Table 状态「断言已实现」滞后：同表"用于 Flow"已列 submit_claim/void_claim_rebill/SZ35474，且 TCS.md 记这些 spec 已固化执行——按 PAGES.md:3 自己的状态机应至少是"已接入 Flow/已通过" | `PAGES.md:63` |
| D9 | MODULES.md | 「已实现页面」列整体落后于 PAGES.md（**双写漂移**）：Registration「3」vs 实有 5 行；Charge Services「2」vs 4 行（全已通过）；Insurance Claims「2」vs 1 行；**Billing「部分实现，2 页」vs PAGES.md:53-57 Billing 节唯一页面卡是"未开始"**（真正已实现的 billing 动作记在 Charge Services 节 :34）——两表间最直接的矛盾 | `MODULES.md:11-16` |
| D10 | PROJECT.md | **内部自相矛盾**：已知限制 :136「BNR 自动创建需等待几分钟」vs 切片记录 :230「Admit 成功后 BNR 立即自动创建……无需等几分钟」——已知限制条目是过时结论 | `PROJECT.md:136 vs :230` |
| D11 | goals.yaml | 356 行越 300 行阈值未拆、PROJECT.md 无"待拆"跟踪记录 | `goals.yaml`；阈值 `PROJECT.md:103` |
| D12 | README.md | :25 注释「preset（Flow 实现后）」过时（create_encounter 早已 implemented: true）；另 AGENTS.md:13「三张状态表」与实为四张不符（TCS.md 由 :17 单独覆盖，数字易误导） | `README.md:25`；`AGENTS.md:13` |
| D13 | PAGES.md | **第三处幽灵引用 `add_insurance`**：goals.yaml / flows/ / GOALS.md 均无此 goal（性质同 D7，D7 只抓了 billing_billed） | `PAGES.md:26` |
| D14 | PAGES.md | 空行把 Charge Services 表拦腰切断：:36 Adjustments 行脱离表头成孤立碎片（与 D3 同病，D3 只查了 GOALS.md） | `PAGES.md:35-36` |
| D15 | PAGES.md | Discharge 页面卡仍标「切片中」（最后验证 2026-09-12），而 GOALS.md:10 与 PROJECT.md 阶段 5 均记 discharge 2026-09-15 已打通——页面表未同步 | `PAGES.md:24` |
| D16 | MODULES.md | Coding「已实现页面 2」vs PAGES.md Coding 节实有 3 张卡且全部已通过（D9 同型遗漏） | `MODULES.md:13` |
| D17 | GOALS.md | start_billing 参数列误列 `forceReason`：goals.yaml:151-161 该 goal 仅 mrn/patientName，forceReason 实属 force_bill（:174-176） | `GOALS.md:11` |

> 复核补充的轻量项（未编号）：MODULES.md Registration「最后更新 2026-09-12」滞后（Insurance Form 2026-09-16 才已通过）；README.md:33 状态文件清单漏 TCS.md（与 AGENTS.md:9 四张口径不一）；MODULES.md 注册名「Patient Control」与 PAGES.md 节名「Portal」不一致。

---

## 5. 基建层问题

| # | 问题 | 位置 | 评估 |
|---|---|---|---|
| I1 | **超时治理缺失**：config 的 120s 形同虚设，慢链路靠 spec 内 `test.setTimeout` 硬编码——`claim-to-submitted.spec.ts:24` 900s、`TC35474:26` 1500s（25min）、`TC35253:29` 900s；7 个 spec 打了 `{ tag: "@slow" }`（TC35266 另有 `@SZ35266`），**无任何配置消费这些 tag** | `playwright.config.ts:35` | 慢→长超时没有集中表达；建议 tag→timeout 映射或集中 helper |
| I2 | **video 配置与注释不符**：`playwright.config.ts:53` 注释承诺 "trace + screenshot + video"，实际 `use` 块无 `video` 键（`fixtures/ehr.fixture.ts:35` 注释同样提 video）；失败证据只有 trace+截图 | `playwright.config.ts:53` | trace 已足够（retain-on-failure），改注释即可；若需 ExtJS 动画类问题视频证据再补 `video: "retain-on-failure"` |
| I3 | **无 teardown/数据清理**：全库无 beforeAll/afterAll/globalSetup/globalTeardown/storageState（grep 验证）；测试只生成不清理，Testbot_ 患者/claim 在共享 box **永久累积**；`api/client.ts` 连清理的工具面都没有（TODO 空壳） | 全库 | 依赖 box API 能力，长期项 |
| I4 | **每 test 完整登录一次**（authedPage test 级）：全量回归 10 spec 即 10 次完整登录；token 登录依赖 box `/logon/login` 端点行为（环境敏感） | `fixtures/auth.fixture.ts:17-27`；PROJECT.md:142 自认 | 按铁律 8「第二次需要时再抽象」，可接受；worker 级/storageState 待复用时做 |
| I5 | **环境切换无机制**：仅 `EHR_HOST` 手编 .env，无 `.env.<host>` profile；config 头注反复警告"不同 host 是不同物理机"，但没有任何机制防止用错 host 跑 | `playwright.config.ts:14-16` | 长期项 |
| I6 | **凭据兜底过宽**：.env 缺失时 `loadEhrEnv()` **静默兜底 demo/123** 而不是报错；.env 被 3 处独立 dotenv 加载（config:18 / ehr-context:11 / drive-ml:35）；本地 .env 常驻观察模式（HEADLESS=0 + SLOW_MO=500 + KEEP_BROWSER_MS=10000），本地没有"回归无头"开关，任何人新开会话直接 `npm test` 就是有头慢速跑——且这就是当前 `.env` 的实况（.env.example:15 有"CI/回归必须保持无头"文字警告，无机制兜底） | `src/types/ehr-context.ts:30-31`；`.env:11-15` | 建议 .env 缺失时报错而非静默；提供 `HEADLESS=1` 回归惯例 |
| I7 | **单测混入 e2e 套件**：login（:18-29 goal schema、:31-53 goal matching）/create-patient（:26-38）/claim-to-submitted（:54-64）里的纯逻辑测试不需要 UI，却挂在 e2e 目录、拉起浏览器 fixture，全量回归白跑，且无独立单测入口 | `specs/login.spec.ts` 等 3 文件 | 可拆到 `tests/unit/` 或 `src/executor/*.test.ts` |
| I8 | **drive-ml 隐式构建同步**：`drive-ml.js:98-120` 运行前手工同步 goals.yaml/data/*.json 进 `.build-drv`（tsc 不拷非 TS 资产）；`.build-drv` 被 gitignore，新机器 clone 后直接 `drive:ml` 会失败（有报错提示但属手工环节） | `drive-ml.js` | 可接受（有提示），文档化即可 |
| I9 | **错误无分类**：环境阻塞（等服务器侧 claim 管线/BNR 状态翻转）与真实失败都抛普通 Error，靠 TCS.md 文档区分；报告层面看不出 | `submit-claim.step.ts:27-30`、TC35474 轮询 | 建议 `EnvBlockedError` 错误类 |
| I10 | `require("playwright")` 但 package.json 只声明 `@playwright/test`——靠传递依赖提升，换包管理器/提升策略即断 | `drive-ml.js:31` | package.json 显式声明即可 |
| I11 | CI 无 artifacts/cache：junit 写到 `test-results/ehr-junit.xml` 但不上传，CI 产出丢弃；package.json 缺 `check:goals` script（CI 直接 `node scripts/check-goals.mjs`，本地无法 `npm run` 复现 CI 检查） | `.gitlab-ci.yml:9-15`、`package.json` | 补 artifacts + script |
| I12 | 零 lint / 零版本锚定：无 ESLint/Prettier/.nvmrc/engines（CI 用 node:20，本地无约束）；`tsconfig.json:9` 显式关 `noUncheckedIndexedAccess`，与 strict 宣传不完全相符 | 仓库根、`tsconfig.json` | 长期项 |
| I13 | 登录凭据拼进 URL query 传给 POST /logon/login（凭据可能进访问日志/代理历史，框架无脱敏） | `api/auth.ts:23-25` | 端点行为约束，记录即可 |
| I14 | **CI 从未真正运行过**：项目没有任何已注册 runner、实例共享 runner 全部离线——历史 16 条 pipeline 无一 success，全部排队至死（#665 的 job `started_at: null`、排队 10 小时后判失败）。代码本身无问题：HEAD 提交在干净目录完整复现 CI 三步（`npm ci` → `build:drv` → `check-goals`）全部通过。恢复需管理员恢复共享 runner，或注册自建 runner；另 main 分支受保护禁止直推，改动只能走 MR 合入 | GitLab runners 设置、`.gitlab-ci.yml` | 基建项，与 I11 一并处理 |

**做得对的**：`workers:1` 纯串行（对共享物理 box 正确，避免并发互扰）；`forbidOnly: !!CI`、`retries: CI?1:0` 合理；junit/html/list 三 reporter 齐全；`viewport:null` 跟随真实窗口（避免 ExtJS 布局失真）；CI（.gitlab-ci.yml）做 typecheck + check-goals 但不跑 e2e（需网络可达 box）——边界划得清楚（但受 I14 影响：无 runner，该 job 至今未真正执行过）。

---

## 6. 新加模块如何快速产生稳定可靠的测试脚本

### 6.1 现状路径（一次完整切片要动 11 个文件）

```
1. MODULES.md        登记模块（新目录还要在"注册名↔目录映射"表加一行）
2. 调研              读 $CCSRC_PATH/skills/ehr-workflow/<模块>/SKILL.md → 无覆盖则 grep 源码
                     （源码是草稿、实机是权威；差异记 PROJECT.md）
3. 录制（TC 场景）    用户 codegen：npx playwright codegen --ignore-https-errors
                     -o recordings/<SZ号>.manual.ts "<入口URL>"   （recordings/ 不入库）
4. goals.yaml        登记 goal 键（aliases / params schema / presets）
5. page-objects/     <模块>/xxx.page.ts（选择器沉淀处，唯一权威）
6. steps/            <模块>/xxx.step.ts（业务原子动作，≤3 分支）
7. flows/            xxx.flow.ts（只编排）
8. flows/index.ts    import + FLOWS 注册          ← 最易漏①
9. specs/            xxx.spec.ts（TC 型：specs/sz/TC<id>-slug.spec.ts）
10. 状态表           PAGES.md 页面卡 + GOALS.md 行 + PROJECT.md 切片记录
11. TC 场景额外       TCS.md 行 + 无头实机验证通过后登记
```

> 注（复核补）：11 项是 TC 固化场景的最大集——「调研/录制」是步骤而非落库文件（recordings/ 不入库）；非 TC 驱动的功能切片不涉及录制与 TCS.md；无论何种切片，铁律 6 还要求更新 PROJECT.md（含已知限制）。

**最易漏的三处（无工具拦截）**：

1. `flows/index.ts` 注册——CI 的 check-goals 只验"yaml 键可匹配"，不验 FLOWS 注册表；忘注册要到实机跑 spec 才报 "Flow 未实现"。
2. 四张状态表同步——铁律 6 要求同时更新，无任何工具检查；GOALS.md 幽灵行 `claim_submitted` 就是实证（D1）。
3. 新模块目录映射登记（MODULES.md 备注段）——纯约定，无校验。

### 6.2 改进方案

**① CI 一致性门（把"忘"从实机发现变成 CI 秒挂）**

扩展 `scripts/check-goals.mjs`（已在 CI、build:drv 后运行；`tsconfig.build.json:5` 的 `module: commonjs` 确认编译 flows/ 为 CommonJS，可直接 require `.build-drv/flows/index.js`）：

- goals.yaml `implemented: true` 键 ↔ FLOWS 注册表**双向**一致；
- 每个 implemented goal 在 GOALS.md 有表格行；GOALS.md 表格首列的每个 goal 名必须存在于 goals.yaml（抓幽灵行，只匹配首列、忽略自由文本，防误报）；
- 扫描 specs/ 中 `runGoal(<page>, "<name>")` 字符串引用，验证 goal 存在。
- 顺手补 package.json `check:goals` script（现 CI 直接 `node scripts/check-goals.mjs`，本地无法 `npm run` 复现 CI 检查，见 I11）。

落地后本轮审查发现的 D1/D2 类漂移会被 CI 直接拦下。

**② NEW_MODULE.md 手册（分步 checklist + 文件模板 + 稳定性实践）**

把 §6.1 的 11 文件路径写成带模板的 checklist（goals.yaml 段 / PO / step / flow / spec 各一小段骨架），新模块照着填，减少"想不起要动哪个文件"的成本。

**③ 稳定性实践清单（全部来自本仓实测经验，固化进手册）**

1. **条件轮询 > 固定等待**（`src/utils/wait.ts:1-6` 头注已是规约）；新增等待必须轮询条件，settle wait 必须注释背书。
2. **重试 = 动作 → 可观察状态证明 → ≤N 次**：不允许"盲重试"；每次重试前必须证明上一次动作未生效（现有 6 处手写模式都是这个形状，抽 `retryUntil` 工具统一）。
3. **先录制再转化**（AGENTS.md:18 约定）：未固化 TC 先让用户 codegen 录一遍，AI 读录制代码提取真实操作路径与选择器，重构成 PO+step+flow+断言——比 AI 现场摸索快且稳。
4. **先线性 spec 跑通，再抽 Page Object**（铁律 1）；不提前抽象，第二次复用才抽（铁律 8）。
5. **选择器以 PO 为唯一权威**：交互会话里验证的选择器必须沉淀回 PO；定期 `npm run check:selectors` 审计（报告型，本地分支≠部署分支时缺失需人工判断）。
6. **数据 Testbot_ 命名**（`generateLastName`：Testbot_YYMMDDHHmm；SSN 日期+时刻编码）；不动共享 box 他人数据。
7. **汇报必带 host**（`EHR_HOST`）：不同 host 是不同物理机，跨机结果不可比。
8. **日期断言按 box「今天」**（fbch34 美西）：today/yesterday 双候选（TC35266 spec 模式）；box 时区入 env 而非硬编码 PO（修 L2）。
9. **环境阻断与真实失败分开报**：等服务器侧状态（claim 管线 / BNR 翻转）不算失败，诊断报错注明等待条件与超时（现靠 TCS.md，建议 `EnvBlockedError`）。
10. **失败证据**：trace retain-on-failure + 截图 only-on-failure（已有）；关键断言前 `test.info().attach` 行截图（TC35266:59-62 是好习惯，推广）。

**④ scaffold 脚本（`npm run new:goal <name>`）——建议暂不做**

自动生成 PO/step/flow/spec 骨架 + 注册行 + 状态表行，最快但多一件需长期维护的工具。按铁律 8（不提前抽象），等第二个新模块出现、模板稳定后再做；一致性门已兜住"忘"的风险。

### 6.3 结论

"快"的杠杆在**减少手工环节**（一致性门 + 手册 + 录制转化约定，后两者已部分存在）；"稳"的杠杆在**把已验证实践固化**（§6.2③ 十条全部来自本仓 fbch34 实测踩坑，不是新发明）。两者合起来，新模块的边际成本主要剩"实机摸索选择器"这一项——而那正是 codegen 录制要消掉的。

---

## 7. 改进路线（按轮次；铁律 9：每轮一切片）

### 本轮建议（一致性与入门基建，低风险，不改测试逻辑）

1. **CI 一致性门**：扩展 `scripts/check-goals.mjs`（§6.2①）；先在修文档前跑一次，预期红报 `submit_claim` 缺 GOALS.md 行 + 幽灵行 `claim_submitted`，证明门有效。
2. **文档漂移清理**（§4 的 D1-D17）：GOALS.md 6 处（含 D17 start_billing 参数列）+ PAGES.md 5 处（D7 billing_billed ×2、D13 add_insurance、D14 表切割、D15 Discharge 卡）+ MODULES.md 双写与 Coding 计数（D9/D16）+ PROJECT.md 2 处 + README/AGENTS 各 1 处。
3. **代码过期注释/skip 清理**（§3.2 M5 的 5 处，⑤ 已随英文化修复）：含 `specs/discharge.spec.ts` 去 `test.skip`（flow 已注册、09-16 实测通过，skip 是历史残留）——改后需 fbch34 无头验证。
4. **`str()` 入 `src/utils`**（L1，纯机械移动，10 个文件）。
5. **NEW_MODULE.md 手册**（§6.2②③）+ AGENTS.md 会话必读加引用。
6. **验证**：`npm run build:drv && node scripts/check-goals.mjs` 绿 → fbch34 无头跑 discharge.spec + login.spec 抽查 → 通过后 commit/push。

### 下一轮（代码债务，中风险；每处改动需 fbch34 无头回归）

1. **order-entry.page.ts 重构**（H1）：业务编排（addAdtDischargeOrder 链、fillAuthorizingProvider 约定、handleSaveDialogs 弹窗链）移入 steps；删死代码（clickLeafText/setProvider/applyOrderDetails/save）；PO 只留原子动作 + 定位器。
2. **5 个泄漏 step PO 化**（H2）：选择器移入 AccountsPage / RegistrationAppPage 等既有 PO；PO `page` 属性收 private（§2.4）。
3. **assign-insurance-bnr 裁定**（H3）：fbch34 实机确认 stale fetch 是否真实发生——是则补重开逻辑，否则改注释。
4. **add-insurance.step 拆分**（M1）：lookup / 填表 / 保存拆为独立 step 或 PO 动作。
5. **scratch 定型**（§2.3）：`ScratchState` 接口 + 7 处 cast 改类型化。
6. **`retryUntil` 工具首实现**（§2.1）：新代码用，不动存量 6 处（避免一次改太多）。

### 架构轮（按需触发，阈值已记）

- goals.yaml 拆 `goals/<域>.yaml`（356 行已越 300 阈值，loader 就绪，重复键报错已实现）。
- flows/ 域层（>15 个目标触发；specs 打 `@<域>` 标签；PAGES.md >300 行时外置 docs/status/）。

### 长期（暂不入计划）

- `EnvBlockedError` 错误分类 + 报告层面区分（I9）。
- `@slow` tag → timeout 集中映射（I1）。
- storageState / worker 级登录复用（I4，第二次需要时）。
- teardown 数据清理（I3，依赖 box API 能力，`api/client.ts` 先兑现）。
- `.env.<host>` 多环境 + .env 缺失报错而非静默 demo/123（I5/I6）。
- 单测移出 e2e 套件（I7）。
- video: "retain-on-failure"（I2，仅当 trace 不够时）。

---

## 8. 附录：本轮审查核实的文件清单

实读复核（非仅 agent 转述）：`GOALS.md`、`flows/index.ts`、`specs/discharge.spec.ts`、`playwright.config.ts`、`scripts/check-goals.mjs`、`goals.yaml`（:1-70、:337-356）、`tsconfig.json`、`tsconfig.build.json`、`package.json`。
agent 通读（含行号引用）：PROJECT.md / AGENTS.md / MODULES.md / PAGES.md / TCS.md / README.md 全文；`page-objects/` 15 文件、`steps/` 23 文件（22 个 `*.step.ts` + `patient-data.ts`）、`flows/` 15 文件、`specs/` 10 文件、`src/` 8 文件、`fixtures/` + `api/` 4 文件、`.gitlab-ci.yml`、`.env`/`.env.example`、`recordings/`。
2026-09-17 复核：三路并行逐条核查 61 条论断（代码 20 / 文档 17 / 基建 24），绝大多数属实、行号精确率高；修正 7 处（wait.ts 行号与表述、order-entry 头注引位、drive-ml.js 行号、tsconfig.build.json 行号 ×2、login.spec 行号、统计口径），遗漏发现已并入正文（D13-D17、I10-I13、L5、§2.1 表 +1 行、§2.6 +1 条、§6.1/§6.2 补注）。
2026-09-17 晚二次复核：英文化改动落地后重新对照——goals.yaml 重写仍 356 行、goals.yaml 全部行号引用不变；仅 login.spec :31-52→:31-53 一处偏移；M5⑤ 确认已修复并标记；新增 I14（CI 无 runner 根因，16/16 pipeline 排队至死的实证）。
