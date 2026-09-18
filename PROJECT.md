# EHR Playwright Framework

用户输入自然语言目标，执行器匹配 goals.yaml 中的目标，合并参数后由 Playwright 直接执行预定义 Flow。运行时纯 Playwright，不调用 AI。

**独立工程**：本仓库不隶属任何应用仓库，可单独克隆、单独运行；只需网络可达一个 deployed webframe。与 ehr 应用仓库的协作约定是「并排克隆」（默认 `../ehr`，仅选择器审计会读取，且可用 `--ehr-src`/`EHR_SRC` 重定向，见 README）。

实施计划来源：`docs/deepseek_markdown_20260911_79eb5c.md`（架构与铁律的唯一事实来源，本文不重复，只记状态）。

## 最终目标（North Star）

三个目标，按达成顺序排列（3 → 2 → 1；目标 1 分两阶段，「执行已有 TC」的近期阶段可与目标 2 并行）。

### 目标 3：AI 按人工要求执行测试步骤、产生数据（最近）

- **形态**：人工给业务级要求（如「造一个已出院、有欠费的患者」），AI 用 goals/presets 组合执行，产出数据。
- **产出物定义**：除业务数据本身（患者/encounter/BNR），必须落盘一份**数据清单**（artifacts：生成了什么、id、host、时间）——`ctx.scratch` 只在单次编排内存活，跑完即丢，不落盘等于没产出。
- **约束**：沿用 `Testbot_` 命名约定；不清理/不改动共享 box 上他人数据。
- **现状与缺口**：最接近可达成。缺 (a) 数据清单落盘机制，(b) 批量参数执行（driver 循环 / 多 preset）。

### 目标 2：AI 按 bug 重现步骤重现问题

- **形态**：输入 SZ 的重现步骤（自由文本），AI 交互式驱动浏览器执行（skills/MCP 流程），已建 goal/Page Object 的部分直接复用加速。
- **产出物定义**：重现报告——结论（复现 / 未复现 + 环境差异说明）+ 证据（trace/截图/网络日志）+ host 标注。
- **沉淀闭环**：重现成功且需要回归的，按切片流程资产化为 goal/spec（铁律 1：先线性跑通，再抽 PO）；现场临时定位的选择器必须沉淀回 Page Object，不留只存在于会话里的知识。
- **现状与缺口**：交互执行能力具备；PO 词表已覆盖 Registration/Charge/Coding；未覆盖模块（Scheduling、Patient Control 右键菜单等）可现场定位但必须回沉。

### 目标 1：按 TC 执行 → 报告（近期即启动）；AI 写 TC → 人工读文件审查（远期）

- **近期（现阶段）——执行已写好的 TC**：TC 由人工编写（来源：cciconnect 的 TC，经 ccisearch 查看，或人工直接提供）。AI **不生成 TC**，职责是读 TC → 按 TC 执行 → 产出报告。TC 不迁移、不重建，报告引用 SZ/TC 号即可追溯。
- **远期——AI 写 TC**：AI 生成的 TC 落成 md 文件，**人工直接读文件审查**（不走 MR）；审查通过即进入可执行集合。TC 文件四要素：前置（goal/数据组合）→ 步骤（优先引用 goal 与 Page Object 动作词表）→ Verify（断言与期望值）→ 边界标注（服务器配置类/人工步骤显式标出）。`tcs/` 目录与模板届时随第一条 AI 生成的 TC 落地（铁律 12，现在不建）。
- **执行分两种形态**：
  - 固化执行：TC → spec（goal 编排），`npx playwright test` 跑，报告 = junit/HTML/trace（已有）。运行时无 AI（铁律 5 不变）。
  - 交互执行：AI 会话按 TC 逐步驱动，产出 TC 运行记录（每步 pass/fail + 截图 + host）。记录格式在第一次按 TC 执行的试点时定稿（铁律 8，不预设）。
- **现状与缺口**：固化执行已有（specs 即证据）；TC 执行路由已建（`TCS.md`，首条 TC35266）；远期缺口是 AI 生成 TC 的词表化模板（`tcs/` 目录随首条 AI 生成 TC 落地）。
- **首次试点已定稿（2026-09-15，SZ35266）**：TC 执行采用 spec 形态（`specs/sz/TC35266-admit-date.spec.ts`）——`test.step` 与 TC 步骤 1:1 映射（HTML 报告即运行记录）、`@SZ<id>` 标签、证据截图作为附件挂进报告。fbch34 实测 PASS：Planned encounter → Admit（unit=PHASE2）→ Patient Control census ADMIT DATE 显示 `09/14/2026`（box 时区当天）。

### 铁律 5 的边界澄清（三目标共同的裁决）

「运行时禁止调用 AI」指**固化执行的回归运行时**（spec/CI/`npx playwright test`/`drive-ml.js`）。目标 2 与目标 1 的交互执行是**人工发起的 AI 会话**，不受此限；但交互会话中验证过的选择器与流程必须沉淀为无 AI 的资产（PO/goal/spec），下次执行不再需要 AI。

### 明确的自动化边界（不因目标放松）

- 服务器配置类步骤（改 rcf、重启 daemon、dbwrite）→ 人工/ops。
- 患者门户（PPT）等第二应用 → 暂不做，TC 标「部分自动化」。
- 报告一律标注执行 host；跨物理机结果不可比。

## 分层

- `page-objects/`: 页面原子动作（定位器、断言、弹窗处理）
- `steps/`: 业务原子动作（参数校验、默认值、≤3 分支）
- `flows/`: 目标编排（不写定位器）
- `specs/`: Playwright 测试入口
- `fixtures/`: Playwright fixture（ehr 基础上下文 / authedPage 登录会话）
- `api/`: HTTP fallback client（UI 按钮禁用等环境缺陷的兜底）
- `goals/<域>.yaml`: 目标 + 参数 schema + preset + 别名（auth / registration / charge / claims 四域；单文件 goals.yaml 布局仍被加载器兼容，仅作回退）
- `src/executor/`: goal-matcher / param-resolver / runner
- `drive-ml.js`: 单目标自然语言 CLI 驱动（需先 `npm run build:drv` 产出 `.build-drv/`）
- `MODULES.md` / `PAGES.md` / `GOALS.md` / `TCS.md`: 状态表

## 约定（铁律摘录）

1. 先线性 spec 跑通，再抽 Page Object
2. Page Object 不写业务 if
3. Step 不超过 3 个分支
4. Flow 只编排，不写定位器
5. 运行时禁止调用 AI
6. 新增能力必须同时更新 goals.yaml、MODULES.md、PAGES.md、GOALS.md
7. 参数组合是数据，不是分支
8. 不要提前抽象，第二次复用时才抽
9. 每轮只做一个切片
10. 不修改已通过的 spec，除非本轮明确要求
11. 目录按需扩展，不预设全量清单
12. 未实现的模块只在注册表登记，不提前建空文件

## 结构与规模阈值

目录结构随切片增长调整，但只按规则调，不按感觉调。模块隔离已经由 `page-objects/<模块>/`、`steps/<模块>/` 承担；会随模块变长的只有 `flows/`、`specs/`、goals 声明和状态 MD。

### 模块多了：按「域」加一层，不拆运行时

模块数量大之后（对照 `ehr/src` 有 80+ 目录），按业务域分组管理。域是模块的分组，不是新目录树的一级公民：

```text
goals/                       # goals.yaml 拆成每域一个文件（executor 已支持目录加载）
  access.yaml                # Auth、Patient Control、Registration、Scheduling
  revenue-cycle.yaml         # Charge、Coding、Billing、Insurance Claims
  clinical.yaml              # OE(CPOE2)、Flowsheets、MAR、…
flows/<域>/                  # 超阈值后 flows 加域层；跨域端到端链放 flows/e2e/
specs/<域>/                  # 同上；npx playwright test specs/revenue-cycle 可跑整域
page-objects/<模块>/          # 不变——模块目录本身已是隔离单元
steps/<模块>/                 # 不变
docs/status/<域>.md           # PAGES/GOALS 超阈值后外置；MODULES.md 永远是唯一索引
```

- 域的划分在第一个触发阈值的模块加入时定稿，不预设全量。
- spec 打 `{ tag: "@<域>" }` 标签，`--grep-tag` 可不挪文件就跑整域。
- **拒绝的方案**：每模块一个 package.json / playwright.config、按模块拆仓库——goal 编排天然跨模块（如 claim_to_submitted 串 5 个模块），executor、fixtures、scratch 必须共享一份。
- Flow 归属主模块的域；跨域链归 `flows/e2e/`。

### 触发阈值（按此调整，平时不动）

- `flows/`、`specs/` 目标 >15 个 → 加域层目录。**当前 flows 已注册 15 个目标（claim_to_errored 加入后）——域层评估已触发，留待后续架构轮实施（2026-09-17 审查记录 + TC35118 切片更新）。**
- `goals.yaml` >300 行 → 拆 `goals/<域>.yaml`（加载器兼容单文件与目录两种形态，重复目标键会报错）。**已于 2026-09-17 架构轮拆分完成：auth / registration / charge / claims 四文件，根 goals.yaml 删除（消除双份拷贝漂移窗口）。**
- `PAGES.md` >300 行或单模块 >10 张页面卡 → 外置 `docs/status/`，MODULES.md 留链接。
- 目录调整只在专门的架构轮做，不顺带切片（铁律 9）。
- `drive-ml.js` 是文档化的 CLI 入口（`npm run drive:ml`），固定在根目录，不挪 `scripts/`。

## 运行

```bash
cp .env.example .env   # 按 target box 改 EHR_HOST
npm install
npx playwright test specs/login.spec.ts   # 阶段 1
npx playwright test                        # 全量回归
```

环境变量：`EHR_HOST`（默认 fbch34）、`EHR_USER`/`EHR_PASS`（默认 demo/123）、`WEBFRAME_DIR`（默认 webframe）。⚠️ 主机是不同物理机，汇报结果时必须说明跑在哪台 host 上。

选择器来源：本框架的 Page Object 为唯一权威，已验证的选择器直接沉淀在各 Page Object 中，不重复探测 DOM。

## 与 ehr/tests 的关系

`ehr/tests`（应用仓库内的 CI e2e）是借鉴来源，不是依赖。已借鉴：

- **token 登录**（`api/auth.ts`）：POST `/logon/login` 取 ccitoken → `/Cps?webtoken=` 深链建立会话，跳过 ExtJS 表单。`authedPage` fixture 走此快路，失败自动兜底 UI 登录目标；`specs/login.spec.ts` 仍只测 UI 路径。2026-09-15 fbch34（gyq001）实测通过。
- **选择器↔源码审计**（`scripts/check-selectors.mjs`，`npm run check:selectors`）：把 Page Object/specs/steps 里的 data-testid 与 ehr 源码对照。报告型（默认 exit 0）：本地源码分支可能≠目标 box 的部署构建分支，缺失≠错误；`--strict` 仅在确认本地树与部署构建同源时使用。ehr 源码位置默认 `../ehr/src`（并排克隆约定），可用 `--ehr-src <path>` 或 `EHR_SRC` 重定向；找不到则跳过审计。

独立性边界：不 import `ehr/src`、不依赖 vite dev server / ehr 仓库的 node_modules，只要求网络可达一个 deployed webframe；`check:selectors` 对 `../ehr/src` 只读，目录不存在时自动跳过。

## 已知限制

（每轮追加）

- 登录必须经 `logon?ctrl=cps` 入口建立 webtoken；直接开模块 URL 得到的是无会话壳。
- ExtJS 登录表单两个输入框必须顺序填写（并行填写会竞态：username 为空、password 拼接）。
- CDM Conflict 后的 "Error Submitting" 弹窗是误报，dismiss 即可（后续收费切片）。
- DRG 182 在测试环境常为 None，可选（后续编码切片）。
- Registration Discharge 按钮可能 disabled，需走 DISCH API fallback（`api/` 预留）。
- Start Billing 按钮存在前提：患者已 Discharged（后续计费切片）。
- Page Object 中保留少量有注释背书的 settle wait（ExtJS 顺序填写、census 行绑定）；新增等待必须轮询条件，见 `src/utils/wait.ts` 头注。
- 登录 fixture（authedPage）为 test 级：每个 test 完整登录一次；test 数增多后可考虑 worker 级 / storageState 复用（待第二次需要时再抽象）。
- 本地 `ehr/src` 工作树 ≠ 目标 box 部署构建：`encounters-status-summary`、`encounterDetails-discharge-button` 等 8 个选择器在 fbch34 构建中存在、当前分支源码中没有；`npm run check:selectors` 报告的缺失需逐条人工判断。
- authedPage 默认 token 登录（`api/auth.ts`），UI 登录仅作兜底与 login spec 的被测对象。
- SSH 服务器操作（TC 中途需在 box 上跑脚本）：能力已落地并在 fbch34 实机验证（`src/utils/ssh.ts` + `steps/server/run-script.step.ts` 白名单注册表；免密密钥 + `EHR_SSH_TARGET` 已配置，见 SSH 切片）。注意：服务器脚本有执行窗口（如 restart-ruleexecd 停摆约 10–15s），有规则引擎依赖的后台任务运行时不要触发。
- box 时区 ≠ 本地时区（fbch34 为美西时间）：日期类断言需按 box 的「今天」判定（见 SZ35266 spec 的 today/yesterday 双候选）；2026-09-16 复跑实测 census ADMIT DATE = 09/15/2026（命中 yesterday 候选）。
- 同日多次跑患者生成时，DOB 随机年（1980–2005）可能撞上已有 Testbot 记录的年份 → 软分 POTENTIAL DUPLICATE（Duplicate Score 4/6）；force-create（"Create New Patient"）是既定兜底。PO 在 force-create 点击后须等 warning dialog 收起再返回（run-1/run-2 根因：250ms 轮询读到提交前 DOM 误报 duplicate，盲重点已 detach 的按钮）。
- BNR "Claim Edits Needed"（SZ33286）：文本**不在** "BNR Status: <value>" 头部里，而在其旁红色图标的 MUI Tooltip 中（CommonHeader 的 label/value 整对为 tooltip trigger）；`BillingPage.readBnrStatusHeader` hover 标签读取 `{text, tooltip}`。force bill 后 BNR 状态由服务器 updateBNRStatus 翻转，有延迟——断言走有界重挂载轮询（6 轮 × 10s，先见 "Ready to Bill / Claim Created" 后见 "Claim Edits..."）。
- 规则引擎表面：命名 worklist 规则存 sqlite `$CCRUN/conf/rule/rule.db` 表 `ruleslists`（id/staffid/name/category/definition JSON）；IN35118 部署的 3 份 rule.rcf 在 `$CCRUN`（live 与模板 diff 即可非破坏性校验部署态）；ruleexecd 存活 = `ps -ef | grep [r]uleexecd`。fbch34 mysql 惯例 `-ucci -pcci` 是**连写** = user `cci` / password `cci`（空格形态 `-u ucci` 被拒，`-u cci` 通过；`runMysqlStep` 一律传 user `cci`）。
- **日期选择器 max = serverToday + admit/discharge 不可回溯（2026-09-17，TC33731 诊断）**：`CciDatePicker` 在调用方未传 `maxDate`/`futureDate` 时默认 `maxDate = serverToday`（`serverToday` 取 `serverNow()`），故 Reorder Priorities 的 effective date **永远 ≤ box-today**（选不到明天）。同时 Registration 的 Admit/Discharge 表单把 `serverNow()` stamp 进 **disabled** 日期字段（`EncounterForm.tsx` `setFormData("admitTime", serverNow())`；encounters.ts `admitTime`/`dischargeTime` `disabledMask:true` + `defaultNow:true`），新建 encounter **无法回溯** admit/discharge 日期。→ 凡「effective date 严格晚于 anchor 且 ≤ box-today」的 TC 场景（如 TC33731 case #7 = eff 晚于 admit 无出院 → 捕获；eff 晚于 discharge → 不捕获）都**需要过去 anchor**，新建数据无法表达。补测此类场景需指向一个**既有 past-admit active encounter**（原 TC33731 用长住院 encounter 67136235，TC 步骤 2 明写「admit date earlier than the current date」）。

### 切片（2026 claim TC：SZ35253 + SZ35474，2026-09-16，fbch34）

- ** SZ35253（TC35253）缺陷复现**：0001 Transfer Patient to Insurance 的 Amount 被
  锁定为折扣前责任额（$16,640），而 force bill 自动挂 Policy Discount（True Self Pay）
  后 guarantor 实际 $13,312 —— 超额转账被拒：余额不变、无 claim 生成。spec 按 TC
  原文 Expected 断言，在修复 SD416964 部署前预期 FAIL（作为缺陷证据）。
- **claim 生成已在 UI 证实（2026-09-17 修正，推翻 09-16 结论）**：force bill 后 claim
  正常生成并可 Submit 到 Submitted。09-16 的「claim 不在 UI 生成、依赖服务器侧
  submitClaims 管线」是自动化误诊——Billing 视图的 Insurance Claims / Unbilled
  Charges 等区块是受控 BillingAccordion：默认折叠、折叠时不渲染 grid、数据仅在
  mount 时拉取一次；在折叠+陈旧的 grid 上单次读取必得空。读取前必须展开
  （`ClaimsPage.tryExpand`）+ 重挂载重取（`ClaimsPage.waitForFirstRow` /
  `BillingPage.remountForFreshState`）。
- **claim_to_submitted 全周期 goal 已固化并端到端 PASS**（`specs/claim-to-submitted.spec.ts`）：
  创建病人 → 担保人/保险 → admit+BNR → charges → coding → 出院 → force bill →
  claim Submitted，单一 goal 驱动，断言 scratch.submitted + claim 行状态双证。
  2026-09-17 fbch34 全链 PASS（~4 min）。
- **CPOE2 弹窗序列变化**：Validation Dialog 的 OK 按钮点击被吞——须在密码框按 Enter
  提交；保存后延迟 15–35s 弹出 **MUI "Save Order / COMPROOM" 回执**（模态、必须关）；
  ExtJS `.x-window` 会留隐藏模板窗口，所有弹窗定位必须加 `:visible`。
- **订单网格不是 `<tr>` 表格**：expectOrderActive 改为面板文本断言
  （`Discharge patient ... Active`）。
- **图表上下文的 rail 被替换**：REGISTRATION 按钮不在 DOM；open-patient-registration
  先探测，缺失时经 `/Cps` 深链重建 rail。
- **Quick Charge 点击吞没**：bucket-item 单击偶发不入队（React 未挂载），step 逐行
  等待队列 +1 并重试（≤3）；提交同理以队列清空为回执。
- **Insurance 表单（新 DynamicForm 版）**：选完计划后大量必填留空（Insurance Type/
  Member ID/Effective Date/Relationship/Subscriber 全套 + Phone 预填残缺值），
  `InsurancePage` 按 `.label-container` → 后继第一个可见 input 填默认值；应用预填并
  锁定的字段（Address/City/State 等）视为完成；Insurance Type 是多选（Escape 关闭，
  不要点页面级 Close——会误提交表单）；保存后 dirty flag 残留，主动切回 Demographics
  消化 Unsaved Changes 弹窗。
- **Coding ADT 子页**：编辑表单的 Admitting/Attending Provider 必填（选 34494a）；
  disposition 预填时 placeholder 选择器不可见，需条件分支。
- SZ35474 TC01/TC02 断言已固化（`specs/sz/TC35474-claim-totals.spec.ts`）。2026-09-17
  复诊：链推进到 claim Submitted + void 成功；仅 re-bill 腿等待 BNR 状态从 Billed
  翻回可计费（依赖服务器侧 updateBNRStatus），8 分钟重挂载轮询未翻转即诊断报错。

### 一致性门 + 审查清理切片（2026-09-17，fbch34）

按 `docs/framework-review-2026-09-17.md`「本轮建议」实施：

- **check-goals 扩展为一致性门**（`npm run check:goals`）：goals.yaml `implemented: true` ↔
  `flows/index.ts` FLOWS 注册表双向校验（含 flow goal 字段核对）、implemented goal ↔ GOALS.md
  行双向校验（抓幽灵行/缺行）、specs 的 `runGoal("<name>")` 字面量引用存在性。修文档前实测
  抓到 `submit_claim` 缺 GOALS.md 行；清理后全绿。
- **文档漂移清理（审查报告 D1-D17）**：GOALS.md 重写（删幽灵行 claim_submitted、补
  submit_claim、修表断裂/malformed/参数错、登记 outpatient preset）；PAGES.md（删
  billing_billed / add_insurance 幽灵引用、修表断裂、Discharge 与 Insurance Claim Table
  卡片状态同步、「Portal」节更名「Patient Control」）；MODULES.md（已实现页面计数对齐
  PAGES.md、Billing 双写矛盾澄清）；PROJECT.md（删过时已知限制「BNR 需等几分钟」、
  阈值越线记录：goals.yaml 356 行待架构轮拆、flows 14/15 逼近域层阈值）；README/AGENTS
  （三张→四张状态表、preset 注释过时、状态文件清单补 TCS.md）。
- **代码过期注释/skip 清理**：flows/index.ts 头注「discharge 未注册」删除；
  discharge.spec.ts 去 test.skip（09-16 已实测通过，skip 是历史残留）；sz 三个 spec
  头注路径随 SZ→TC 改名更新；TC35474 spec 注释按 2026-09-17 修正结论改写（force bill
  会生成 claim，此前「不生成」是折叠手风琴误读）。
- **`str()` 抽入 `src/utils/params.ts`**（原 10 个 step 文件逐字重复定义）。
- **NEW_MODULE.md 手册**：分步 checklist + 文件模板 + 十条稳定性实践（AGENTS.md 必读已引用）。
- 验证：`npx tsc --noEmit` 干净；check:goals 绿；fbch34 无头跑 login.spec（3/3 PASS）
  与 discharge.spec（去 skip 后连续两轮 PASS，各 ~1.7min；首轮一次失败未留痕，
  复跑两轮均绿，按偶发抖动记录）。

### 续跑 + 数据生成修正切片（2026-09-17，fbch34）

用户四条反馈落地（bounce 重试与双浏览器为现象解释，非缺陷）：

- **SSN 尾 4 位随机化**（patient-data.ts）：同分钟运行在旧 HHmm 尾上碰撞；
  现 tail=1000-9999 随机，头位（年位数和，9→8）+ MMDD 保留。
- **claim_to_submitted 支持 resume**：`startAt=<stage>` + `lastName` + `mrn`(优先)/`ssn`
  即可从卡住的 stage 重入链条，复用已有病人（open_patient_registration 按 MRN/SSN
  检索打开），不再每次全链新建病人。stage 名单见 flow 内 stages 数组；
  resume 入口走 openPatientRegistrationStep（该步在本轮全链的 discharge 腿实测）。
- **Encounter Status 默认 Arrived 的边界**（源码 EncounterForm.tsx submitButtonText）：
  Arrived + ADT 类型(Inpatient Acute)会把创建保存按钮直接变 "Admit Patient"——
  即直接入院，无 CPOE2 入院医嘱(missingOrder)时按钮恒 disabled；链条的入院走
  Planned → Admit 动作。故 status 参数默认 Arrived，ADT 类型自动回落 Planned 并打
  warn；Expected Date/Time 仅 Planned 渲染，条件填写。
- **force bill 后时序**（用户实测）：10s settle + 切 Charges tab 重挂载
  （force-bill.step），submit-claim 的 Submit 按钮 30s 可见等待不变。
- **Start Billing 单次点击修正（2026-09-17 追加，推翻「回弹重试符合设计」）**：
  用户裁决「点击了就能成功，需要重试说明逻辑不对」。实证两轮：把 settle 检查改到
  重挂载视图上后首按仍失败（排除陈旧视图误判）；进入 Billing 视图后先等 10s 再
  首按即一次成功（用户录制口述「要等一下再点」正是此因）——进视图后服务器侧就绪
  滞后于按钮渲染。start-billing.step 现为：进视图等 10s → 单按 → 10s settle →
  重挂载判定（未生效才重试 ≤3）。PAGES.md Billing 卡片同步。
- **现象解释（未改码）**：②spec 第二个 test
  （goal schema 检查）按 Playwright 测试隔离获得独立浏览器，故看到"关了再开一次"。
- 验证：tsc 干净、check:goals 绿；fbch34 全链 2/2 PASS（3.8min），仅新建 1 病人
  （Testbot_2609171129 / ssn 809-17-7949）。

### Start Billing 用户录制沉淀切片（2026-09-17，fbch34）

用户手工录制 Billing Start Billing 全路径（recordings/billing-start.manual.ts，不入库），
与现有 PO/steps 对照后沉淀：

- 选择器全部对上（Start Billing / confirm-dialog / "Give a justification" textarea /
  dialog OK testid `dialog-submit-button` 即 role name "Bill Now"/"Force Bill" 同一元素），
  PO 无需改动。
- 用户时序观察「打开 Billing 后等一会再点 Start Billing」已由 `waitForActionable` 覆盖。
- 新增：force bill POST 后服务器侧处理约 10s，期间切 tab 会读到陈旧状态（用户实测）。
  `force-bill.step.ts` 在 `expectForceBillDone` 后加 10s settle（有注释背书）；
  仍不做 tab dance（维持 09-16 审查结论，submit-claim 自带重挂载）。
- 验证：tsc 干净、check:goals 绿；fbch34 无头跑 claim_to_submitted 全链 2/2 PASS（3.4min）。

### 全量回归 + 修复审查切片（2026-09-17，fbch34）

全量回归 `specs/`：除 TC35474 re-bill 腿（上述服务器侧状态翻转）外全部 PASS；
claim_to_submitted 修复后端到端 PASS。对工作区 09-16 未提交修复的审查结论与改动：

- **折叠卡片误读（真 bug，修复）**：submit-claim / void-claim 在未展开的 Insurance
  Claims 手风琴上读行，恒得空——「无 claim」诊断可能误报（本例实际是漏报：claim
  已生成）。新增 `ClaimsPage.tryExpand / waitForFirstRow`、`BillingPage.remountForFreshState`。
- **force-bill 尾部移除（不合理修复，修复）**：盲等 10s + 无保护切 Charges tab 再切回，
  违反轮询约定且 tab 点击失败会把已成功的 force bill 拖挂。其唯一消费者 submit-claim
  现自带重挂载读取，收口一处。
- **re-bill 腿等待（新增）**：void 后 Start/Force Bill 的重现依赖 BNR 状态翻转，且卡片
  只在 mount 时重取——`start-billing` 改用 `waitForRebillable`（8 min 有界轮询 + 每轮
  重挂载）；BNR Edits 直达状态由 force-bill 步骤承接。
- **OE Provider 兜底清理**：Pre-Add 固定列表按 startsWith 过滤，兜底查询 "tes" 永远
  匹配不到（PROJECT.md 阶段 5 已证）——删除死分支，报错信息指向 providerQuery 参数。
- **insurance pickOption verify 推导修正**：多分支正则 `/Female|Male/i` 的 source 拼接
  产生 "FemaleMale" 永不匹配（当前靠字段预填掩盖）——改取首个分支；Subscriber Sex
  调用改为按患者实际性别精确匹配；重复的 wrapper/shown 计算提取为 `shownSelection`。
- 保留（用户 09-16 约定，审查通过）：SSN 生成规则（`<YY各位和><MMDD><HHmm>`，同分钟
  创建有重名/重 SSN 可能，靠 POTENTIAL DUPLICATE 强制创建兜底）；OE/Coding Provider
  取第一候选；billing `waitForActionable` 轮询。
- **SZ35253 结论修正（2026-09-16，用户录制驱动）**：此前"缺陷复现"实为自动化操作
  缺失——①患者须有 Person(Self) 担保人（Entity "Mini Reg Guarantor" 匹配不到保险，
  Available Coverages 恒为 None）；②保险登记后须在 Accounts (BNR)→Edit→**Assign**
  分配给 BNR。两条补上后 0001 转账正常：guarantor 归零、claim $16,640 Ready to
  Submit，TC35253 回归 **PASS**。create_encounter 现默认加 Self 担保人+保险
  （`insurance:false` = 自费模式），claim_to_submitted 链同步获得 Assign 步骤。

### 选择器权威收口切片（2026-09-17，fbch34）

实施 framework-review-2026-09-17 下一轮第 2/3 项（H2 + H3）与 §2.4：

- **5 个泄漏 step 选择器 PO 化（H2）**：add-insurance 的查找对话框/保存/Unsaved
  Changes 沉淀进 `InsurancePage`（openLookupDialog / lookupAndPickFirstPlan /
  saveForm / resolveUnsavedChanges，Unsaved 处理从两遍收口为一处，删 :44 注释
  死代码）；open-patient-registration 的搜索与结果打开进 `RegistrationAppPage`
  （searchPatient / openPatientResult）；assign-insurance-bnr 全裸选择器进
  `AccountsPage`（openBnrEditor / assignCoverage / saveAndConfirm）；
  add-guarantor-self 新建 `GuarantorsPage`（addSelf）；add-adjustment 的
  `billing.page.locator(...)` 改为 `BillingPage.expectAdjustmentsAccordion`。
- **H3 实机裁定**：assign-insurance-bnr 注释承诺的「Assign 不到就重开 editor」
  从未存在于代码；fbch34 实机回归（claim_to_submitted 全链 PASS）确认纯 30s
  可见轮询即够——按实机改注释，记录裁定日期。
- **PO `page` 收 private（§2.4）**：全部 16 个 PO 的 `page: Page` 改 private，
  step/spec 无法再零成本绕过 PO 写裸选择器；编译器成为守门人。
- **M1 随 H2 顺带解决**：add-insurance.step 从 101 行减到 ~60 行，分支 ≤3，
  死代码与重复 Unsaved 处理消除。
- **验证**：tsc / check-goals 绿；fbch34 无头回归 claim_to_submitted
  （3.2m，2/2 PASS，覆盖 insurance+guarantor+assign+registration 链）与
  discharge（1.8m PASS）。中途一次双 spec 连跑失败为 test-results 残留导致
  的 trace ENOENT 环境抖动，清理后复跑即绿（与改动无关）。

### order-entry PO 重构切片（2026-09-17，fbch34）

实施 framework-review-2026-09-17 下一轮第 1 项（H1）+ L5 + §2.1 retryUntil 首实现：

- **order-entry.page.ts 瘦身**：PO 只留原子动作 + 定位器——
  `addAdtDischargeOrder` 拆为 `openBrowseOrders / clickNonMedsChipIfPresent /
  selectCategory / tickOrderRow / isAddEnabled / clickAdd`；
  `fillAuthorizingProvider` 拆为 `revealProviderOptions`（UI 知识留 PO）+
  `pickFirstOption`（「取第一候选」约定上移 step）；`submitOrder` 的完成轮询
  （receipt OR Active，业务状态判断）移入新 step。
- **死代码删除**：`clickLeafText`、`setProvider`、`applyOrderDetails`、`save`，
  外加审查未列的 `clickListEntry`（全仓无调用）。
- **新增 `steps/oe/submit-order.step.ts`**：clickSubmit → dismissSaveDialogs →
  45s 轮询（receipt 关单 / Active 即返回），最终 Active 断言仍由调用方
  `expectOrderActive` 承担。`handleSaveDialogs` 改名 `dismissSaveDialogs` 留
  PO（纯 ExtJS 弹窗 UI 知识，无业务分支）。
- **`src/utils/retry.ts` retryUntil 首实现**（§2.1 建议）：动作 → 可观察状态
  证明 → ≤N 次；`tickOrderRow` 勾选重试改用它（存量 6 处手写模式按报告不动）。
- **L5 修复**：`clickBtn` 的 regex 转义改为完整元字符转义（原只转义 `/`）；
  `selectCategory` 的 1s settle 与 `revealProviderOptions` 的 1.5s settle 补
  背书注释；文件头 "→ Save" 改为 "→ Done → Submit"（与 docblock 矛盾消除）；
  残留双 docblock 合并。
- **验证**：`build:drv` + `check-goals` 绿；fbch34 无头回归
  discharge.spec（端到端 1.8m PASS，走全新链）+ login.spec 3 项 PASS。

### 类型收口 + Flow 组合 + goals 拆分切片（2026-09-17，fbch34）

实施 framework-review-2026-09-17 剩余项：§2.3、§2.2、M3、L2、L3、L4、架构轮 D11：

- **§2.3 `ScratchState` 定型**：`src/types/ehr-context.ts` 新增
  `ScratchState` / `ScratchPatient` 接口（patient / bnrId / admitUnit /
  charges / coding / billing / claim / adjustment / account），`EhrContext.scratch`
  从 `Record<string, unknown>` 改为定型；4 处 step 内联结构断言 + 3 处 spec
  cast 全部删除，形状统一由接口承担。`mrn` 字段注明当前无 step 写入。
- **§2.2 Flow 组合**：新增 `flows/encounter-stages.ts`——共享前缀
  open_registration → create_patient → add_guarantor_self → add_insurance →
  open_existing_patient → create_encounter → admit_encounter → wait_bnr，
  每阶段带 `when(params)` 适用谓词；`create_encounter.flow` 变为纯
  `runStages`，`claim_to_submitted.flow` 组合 `...encounterStages` + 收入
  尾段，前缀不再手工复制。
- **M3 消除**：create-encounter.flow 的 3 处参数 if 与 claim flow 的
  insurance no-op 分支全部改为阶段 `when` 谓词（参数组合是数据）；existing
  模式的打开阶段命名 `open_existing_patient`，避免与 resume 词汇表中的
  `open_patient_registration`（startAt 命中后跳过的那个）冲突。
- **L2**：`EhrEnvConfig.timezone`（`EHR_TZ`，默认 America/Los_Angeles），
  coding.page `boxToday` 改读 env，PO 不再硬编码时区；.env.example 补注释。
- **L3**：auth fixture token 登录失败的 warn 带完整 stack（UI 兜底保留）。
- **L4**：`createSessionApiClient(page)` 兑现——直接返回
  `page.context().request`（共享已登录 cookie jar），TODO 空壳删除。
- **架构轮 D11**：goals.yaml（372 行）拆 `goals/{auth,registration,charge,claims}.yaml`
  （14 个 goal 全部落位）；根 goals.yaml 删除；runner 默认路径惰性解析
  （goals/ 目录优先、单文件回退）；新增 `scripts/sync-goals.mjs` 挂在
  `build:drv` 后（drive-ml 运行前同步保留）；check-goals 读根 goals 源。
- **验证**：tsc / build:drv / check-goals 全绿；fbch34 无头回归 discharge +
  login（4/4 PASS）、TC35266（重构后 CreateEncounterFlow 路径 PASS）、
  claim_to_submitted 全链连续两次 2/2 PASS（3.2m / 3.4m）。首轮全链曾失败
  一次且明细未保留（当时只留了 tail）；复跑两轮全绿，结合链路对服务器侧
  claim 管线时序的已知敏感（TCS.md 环境备注），裁定与重构无关，但明细
  缺失记为教训：回归日志要完整落盘。

### SSH 服务器操作能力切片（2026-09-17，fbch34 实机验证）

为「TC 中途需在服务器上执行脚本再回 UI 继续」类场景落地基础设施（用户 2026-09-17 指定形态：SSH 执行 shell 脚本），并完成首个真实 server op 的实机打通：

- **`src/utils/ssh.ts` `runRemoteCommand(env, command)`**：BatchMode + accept-new
  host key + ConnectTimeout，命令永不来自 goal 参数；失败抛带 stderr 的诊断。
- **`steps/server/run-script.step.ts` `SERVER_SCRIPTS` 白名单注册表**：flow 只能按
  名字选用已注册脚本（共享 box 安全边界）。首个注册项 `restart-ruleexecd`
  = `/eerun/bin/.dosu /fbch/daemons/RESTART_RULEEXECD`（用户首个真实需求）。
- **env**：`EHR_SSH_TARGET`（user@host，默认空=未配置，step 报诊断而非执行），
  .env.example 已注明；本机 .env 已设 `guoyq@10.2.2.34`。
- **免密配置（测试机侧）**：原 `~/.ssh/id_rsa` 带 passphrase，BatchMode 下无法
  签名——新建无 passphrase 专用对 `id_rsa_automation`，`~/.ssh/config` 的
  10.2.2.34 / fbch34 条目加 IdentityFile，公钥装进 box 的 authorized_keys。
  已脚本化为 `npm run setup:ssh`（`scripts/setup-ssh.mjs`，幂等）：.env 只需
  `EHR_SSH_USER`（box OS 账号）+ `EHR_SSH_PASS` 两行，**地址跟随 `EHR_HOST`**
  （sshTarget = `EHR_SSH_USER@EHR_HOST`，`EHR_SSH_TARGET` 仅作特殊覆盖）。
  密码经 ssh2 一次性登录装钥（纯内存，不进命令行），自动做权限体检
  （box 的 stat 无 -c，用 `ls -ld` 解析）与 `~/.ssh/config` 去重补丁，最终
  BatchMode 探针通过才算成功；运行时链路永远只走密钥，密码装完可删。
  切 `EHR_HOST` 到已 onboard 的 box 无需重做，新 box 一次性执行。前提：box
  允许该用户密码登录。2026-09-17 实机回归两轮（删钥→自动装回→验证，含
  config 去重）+ EHR_HOST 派生链路（`guoyq@fbch34` 运行时/幂等探针）全部通过。
- **实机验证**：`restart-ruleexecd` 执行 3 次全部干净完成（父/子 stop → start，
  exit 0）；框架代码路径用编译产物做无副作用验证（Node→ssh.exe echo 往返、
  白名单拒绝未注册脚本、sshTarget 派生正确）——两个入口
  （drive-ml.js / playwright.config.ts）都从项目根加载 .env，均覆盖。
- **规则（campus 无关，2026-09-17 用户指出后修正）**：白名单命令**禁止写死
  campus 路径前缀**（/fbch、/fooc、/smh 各站布局不同）；统一形态 =
  `. /etc/.profile >/dev/null 2>&1; <PATH 可解析的名字>`——profile 建立站点
  自己的环境（EERUN/CCRUN/PATH），裸名由站点 PATH 解析（fbch34 实测
  `.dosu`→/eerun/bin、`RESTART_RULEEXECD`/`RESTART_MPISYNCD`→/fbch/daemons，
  均为只读解析验证，未重启守护进程）。
- **ycql 封装（`runYcqlStep`，2026-09-17 用户裁定形态）**：边界收在「封装
  ycql 这个能力」——SQL 语句是测试数据（同 UI 输入框级别），不预设语句
  白名单（TC 用任意查询/更新，先例 TC31453）；白名单的是**表面**：SQL 只能
  经 ycql 以 cis 身份执行，进不了 shell。目标槽位严格校验：`dbpath` 匹配
  `volN/pNNNN`、`dbfile` 限 `$CCRUN/workdir/<dir>/<name>.db`、SQL ≤4000
  字符；完整 SQL 进日志（报告证据）。fbch34 实机验证：queryrcmrule 经框架
  链路返回完整 JSON（5.6s），越界 dbpath/dbfile 在 ssh 调用前即被拒。

### 服务器操作层全貌（2026-09-17，用户确认 5 类，fbch34 全部实机验证）

统一原则：封装**能力**而非预设语句；命令/SQL 是测试数据；目标槽位严格校验；
全程 profile 先行（campus 无关）；完整命令与输出进日志（报告证据）。

- **① LINUX 命令** → `runShellStep`（`steps/server/shell.step.ts`）：以
  EHR_SSH_USER 身份执行，**sudo 禁止**（提权只走 `.dosu`，违者直接拒绝），
  ≤2000 字符。验证：ps 取 ruleexecd 进程 ✓；`sudo whoami` 被拒 ✓。
- **② 可执行脚本** → `SERVER_SCRIPTS` 静态白名单（常用命名脚本）+
  `runShellStep` 通道（任意 box 脚本）。验证：restart-ruleexecd ×3 ✓。
- **③ ycql 命令** → `runYcqlStep`（见上）。验证：ccidb 模式 + workdir 库模式 ✓。
- **④ mysql 命令** → `runMysqlStep`（`steps/server/mysql.step.ts`）：走
  `$MYSQL_HOME/bin/mysql`（profile 提供，实机 = /eerun/mysql，MariaDB
  10.5.29）；SQL 同 ycql 级别；连接槽位（user/password/db/host）显式且
  校验，不推断不信任默认。验证：真实查询 ✓（fbch34 惯例：`-ucci -pcci` 为**连写**，
  即 user `cci` / password `cci`——空格形态 `-u ucci` 在 fbch34 被拒，2026-09-17
  TC35118 切片实测；`runMysqlStep` 传 user `cci`。库名 `MPI<站点>` 如 MPIfbch；
  patient.mrn 即 CCI 内部 MRN；patient.db_dbfile = ccidb 路径 volN/pNNNN）。
- **⑤ 修改配置文件** → `readConf / copyConf / editConf`
  （`steps/server/conf.step.ts`）：路径**仅限 `$CCRUN`/`$EERUN`/`$CCSYSDIR`
  根**（/etc、/home、/tmp、`..` 一律拒绝）；copy 以 cis 执行且自动给已有
  目标打 `.bak.<时间戳>`；edit 只允许**单个 s/// 替换**（sed 元字符转义），
  不允许任意 sed 表达式。验证：读 `$CCRUN/site`、grep ruleexecd.rcf ✓；
  `/etc/passwd` 被拒 ✓。注意：conf 路径在命令里**不加引号**（模式已保证无
  元字符，且 `$ROOT` 需保留可展开——加引号会变字面量，已踩过）。
- **教训（PATH 泄漏）**：RESTART_RULEEXECD 脚本自身 `. /etc/.profile` 建立服务器
  标准环境，注册命令一律用全路径、**不得 touch PATH**——否则测试机 PATH 会
  泄漏进服务器环境（/etc/.profile 内有多处对 $PATH 的遍历）。
- **教训（Git Bash MSYS 路径转换）**：Git Bash 调 ssh 时，命令行里「本机存在」的
  Unix 绝对路径会被转换成 Windows 路径（远端出现 `C:/Program Files/Git/...`
  被当命令执行）。Git Bash 里跑带路径参数的 ssh 必须加 `MSYS_NO_PATHCONV=1`；
  框架不受影响（Node execFile 直调 ssh.exe，无 MSYS 转换）。
- **风险边界**：ruleexecd 停摆窗口约 10–15s，窗口内规则引擎调用失败（无数据
  损坏风险，守护进程无状态）；有规则依赖的后台任务（CQL 批跑等）运行时
  不要触发重启（2026-09-17 用户确认的风险点）。

### TC35118 切片（2026-09-17，fbch34）

按 TC 原文执行 SZ35118 [MLIP] Status error in Billing 并固化（TCS.md 已登记）：

- **资产**：goal `claim_to_errored`（flows 15 个，同 claim_to_submitted 链、止于
  Force Bill；终点态 = claim Errored + BNR "Claim Edits Needed"）+ spec
  `specs/sz/TC35118-claim-edits-needed.spec.ts`（test.step 与 TC 8 步 1:1，@SZ35118）。
- **TC 步骤 1（IN35118）**：非破坏性校验——3 份 rule.rcf（BNRRules/inInsNoAssigned、
  BNRRules/inInsEncounterDateMatchEffectiveDate、None/InInsEffectivePeriod）live 与
  模板 diff + ruleexecd ps。fbch34 的 live 文件已与模板一致，spec 只验证不重部署。
- **TC 步骤 2**："Errored Claim" worklist 规则已在 fbch34 配置（sqlite `ruleslists`，
  definition = ClaimStatusDef equals errored），spec 校验存在性与 criteria。
- **TC 步骤 3–6**：`runGoal(claim_to_errored)` 走完整链；BNR 验证 = 有界重挂载轮询
  （6 轮 × 10s）：force bill 后先见 "Ready to Bill / Claim Created - <date>"，服务器
  updateBNRStatus 翻转后见 "Claim Edits..."（文本在 SZ33286 红色图标 tooltip，
  `readBnrStatusHeader` hover 读取）；claim 行断言 "Errored"（state 02）。
- **TC 步骤 7**：mysql（user `cci`、MPIfbch、`patient.db_dbfile` by name）解析患者
  ccidb → 在**真实 ccidb** 上跑 ycql `var + queryrcmrule() + var`——var 持久（bForce
  Remote 修复验证）；queryrcmrule 返回该 BNR 的真实 RCM 规则 JSON。
- **TC 步骤 8（回归）**：配置级——TC34027/TC33731 所需规则（"Stop Billing when
  Insurance Not Present on BNR" / "Coverage Change"）在 rule.db 齐全；两条 TC 的完整
  UI 回归（Worklists Active/Complete、Reorder Priorities）未自动化，列为独立跟进切片。
- **患者创建 PO 修复（run-1/run-2 根因）**：force-create 成功后 250ms 结果轮询读到
  提交前 DOM、误报 "duplicate" → step 盲重点已 detach 的按钮挂 20s。修复三处：
  `waitForSubmitOutcome` 轮询把 main-dialog-closed 检查提到首位；
  `forceCreateDespiteDuplicate` 点击后等 warning dialog 收起（3s catch）再返回；
  create-patient step 的 "open"/swallowed 分支加重提交前 tabVisible 迟到成功守卫。
- **执行记录**：run-4 2/2 PASS（2.4 min，headless，patient Testbot_2609171839，
  ccidb vol3/p1650345443）。start-billing 单次点击回弹重试 1 次（已知行为）。
- **环境事实**：fbch34 mysql 惯例 `-ucci -pcci` 为连写 = user `cci`（`-u ucci` 被
  1045 拒，`-u cci` 通过；spec 传 user `cci`）。

### TC33731 切片（2026-09-17，fbch34）

按 TC 原文执行 SZ33731 [Worklist] Coverage Change Worklist to consider effective date of insurance priorities 并固化（TCS.md 已登记，部分 PASS）：

- **资产**：goal `coverage_change`（flows 16 个；encounter 链 + 插入第二保险 `add_insurance_2` 使 reorder 有 ≥2 行可拖）+ spec `specs/sz/TC33731-coverage-change-worklist.spec.ts`（test.step 与 TC 13 步映射，@SZ33731）+ Worklists PO（portal rail WORKLIST→directory 双击行→item view→search→Complete）+ Insurance reorder PO（Reorder Priorities 按钮 + 真实鼠标步进拖拽 + Apply + effective-date 对话框 + Confirm + toast）。
- **TC1**：sqlite `ruleslists` 校验 "Coverage Change" 规则定义含 `InInsEffectivePeriod` + `InsOrder`（捕获条件 = InsOrder/InsStatus 变更 AND effective date 落在 encounter period）。
- **TC2-6（active）**：新患者→双保险（68888 BCBS PPO + Commercial - Generic/COMMG）→Inpatient Acute admit（admit date = today）→BNR→Reorder 拖拽 row0→1→Apply→effective date = today（= admit date）→Confirm→Coverage Change Worklist 捕获 BNR=H…01→Complete（reason "No further follow-up needed from patient"）。
- **TC9-11（discharged）**：出院医嘱 Active→Discharge（discharge date = today）→再 Reorder effective = today（= discharge date）→捕获（行显示 discharge date=today 作证）→Complete。
- **TC7-8（case #7，SZ 核心）+ TC12-13 SKIPPED/blocked**：eff 需严格晚于 anchor 且 ≤ box-today（即过去 anchor）；但日期选择器 max=serverToday 且 admit/discharge 表单把 serverNow() stamp 进 disabled 字段（不可回溯）→ 新建数据无法表达。补测需指向既有 past-admit active encounter（见已知限制；原 TC 用长住院 encounter 67136235）。
- **固化迭代（run-1..run-8，全 headless fbch34）**：run-1 嵌套 form tab 后 Add/Reorder 只在 "Insurance Overview"（`ensureOverviewView`）+ planId2 "9" 1 字符 < MIN_NUM_PAYER_PLAN_CHARS=3 搜不到→按计划名搜；run-2 "Show Columns" 按钮 a11y name 实为 "Select columns"（改以 search input 佐证 item view）；run-3 JSX 单行 `> Complete <` 裸文本带空格（`hasText /^Complete$/` 漏，改 accessible name 匹配）；run-4 Unsaved Changes 守卫异步弹框 unmount tab bar（`openSubTabResolvingUnsaved` 有界等待）；run-5 Complete 后 grid 不自动刷新（Complete.tsx `isRefresh:false`）→ re-open worklist 强拉 server fetch 再断言 absence；run-6 `fill` 漏 React onChange（value-tracker 去重）→ search 未 commit、grid 停在 2283 未过滤（改 select-all+delete+`pressSequentially` 逐键 + `waitForSearchSettled` 等 grid 反映查询）。
- **执行记录**：run-8 2/2 PASS（2.4 min，patient A Testbot_2609172359A bnr 1001650345461，encounter 1650345461；today=09/17/2026，tomorrow=09/18/2026）。TC1+TC2-6+TC9-11 端到端 PASS；TC7-8+TC12-13 skipped（blocked，需 past-admit encounter）。

### TC33731 复跑（2026-09-18，fbch34）：一次 Reorder = 每保险记录一条 item，Complete 须选全行

- **发现**：单次 Reorder（两保险优先级互换）在 server 侧产生 **2 条** worklist item——两条保险记录的 InsOrder 各变一次、各触发一条规则事件（reorder step 只执行一次，已排除测试侧重复触发）。证据：只完成首行后 item view 计数停在 "1 Active / 0 Deferred / 1 Completed"、Throughput Summary "1 Completed (last 24h)"。
- **修复**：`WorklistsPage.completeItem` 由「勾首行 checkbox」改为「点 grid 头部 **Select all rows** checkbox（MUI `checkboxSelection`，此时 grid 已被 search 过滤，全选 = 选中全部匹配行）→ 单个 Complete 对话框一次完成全部」。源码佐证：`Complete.tsx handleComplete` 把所有 checked 行的 id join 后一次 `updateWLAccount` POST（一个 Reason 覆盖全部，成功 toast "Account(s) Sucessfully Completed"）。`readRows` 同步加 BNR 锚定 fallback——header-count 对齐在该 grid 失效（select-all 表头 cell 不是 `.MuiDataGrid-cell` 且数据行多一个 cell，shift 落到 -1，此前 patientName/MRN 读空）。
- **执行记录**：re-run 2/2 PASS（4.3 min，headed + slow-mo，patient A Testbot_2609180900A bnr 1001650345465，encounter 1650345465；box today=09/17/2026）。TC1+TC2-6+TC9-11 端到端 PASS（discharge 后第二次 reorder 的 item 经 5 轮 bounded 轮询出现，在容忍度内）；TC7-8+TC12-13 skipped（blocked，需 past-admit encounter，见已知限制）。

### Slice A 代码债快修（2026-09-18，计划见 docs/slice-plan-2026-09-18.md）

- **A1**：`completeItem(searchKey, reason?)` 参数化——传 reason 按文本选，不传选第一个可用 option（跳过 "Select Reason" 占位）；业务默认值 "No further follow-up needed from patient" 从 PO 上移到 coverage-change step 的 `completeReason` 默认值；修正 step 头注（原「reserved; first available」与实现不符）。
- **A2**：step 增加 `expectRowContains`（捕获后、Complete 前断言首行 cells 含该文本）；TC33731 spec TC10-11 的 ~30 行 inline 轮询+重开+absence 段收口为一次 `coverageChangeWorklistStep` 调用；删只进日志的 `tomorrow`。
- **A3**：无背书 sleep 收口——worklists `clearSearch` 4000ms 补背书注释（搜索 re-fetch 是 live onChange、无完成信号可轮询）；insurance `ensureOverviewView` 盲 1000ms 改为有界轮询 overviewOnly 可见（≤3s/次）。
- **A4**：仓库卫生——`.gitignore` 补 `.workbuddy/` 并 `git rm -r --cached`。
- **A5**：`loadEhrEnv` 无 .env 且无 EHR_HOST 时直接 throw（报错指向 `cp .env.example .env`），不再静默兜底 "fbch34"；EHR_HOST 显式给出时行为不变。
- **A6**：`drive-ml.js` 改 `require("@playwright/test")`，去掉对传递依赖 `playwright` 的依赖。
- **执行中发现的新竞态（首次 run TC10-11 失败）**：单 Reorder 的多条 item **异步落地**——第一次 Complete 只覆盖当时可见的 item，re-fetch 后浮出 Worklist Age=0 的新 row，absence 断言失败。修复：step 在 Complete 后增加有界「残留再 Complete」循环（re-open + re-search，最多 3 轮）。复跑 2/2 PASS（4.3 min，fbch34，patient A Testbot_2609181839A bnr 1001650345484），TC6 中循环真实触发一次，修复有效。

### 阶段 2（create_patient 切片，2026-09-12，fbch34）

- 搜索表单填单个主条件（MRN）即可解锁 Create New Patient 按钮；`sf-mrn-tf` 等 testid 在 MUI 包装 div 上，用内层 `input` fill。
- SSN 输入框渲染为掩码值（`***-**-1234`），值断言需兼容掩码（比较末 4 位数字）。
- DOB 是 MUI X DatePicker：fbch34 的 popper **没有 OK 按钮**，点日格即提交并关闭；年列表 1900–2026；日格的 ARIA role 是 `gridcell` 不是 `button`。fbch19 有 OK 按钮，Page Object 两种路径都处理。
- Sex/State/Citizenship 是 Autocomplete 风格 combobox：点 input 打不开的（如 Sex）需点字段内 "Open" 按钮再选 `li[role=option]`。
- 成功 toast 自动消失极快，不可靠；断言以"对话框关闭 + 新患者 tab（`<last>, <first>`）出现"为准。
- 偶发 `WARNING: POTENTIAL DUPLICATE` 弹窗会阻塞提交；用弹窗自带的 "Create New Patient"（强制创建）处理，见阶段 3 补充说明。

### 阶段 2（create_encounter 切片，2026-09-12，fbch34）

- 创建 encounter 时 `type` 在选 facility 前禁用；选 Inpatient Acute 后 status 自动 = Planned。
- **必填的 Expected Date/Time**（`#encounters-expDatetime`，掩码 `MM/DD/YYYY hh:mm`）为空时 save 无任何可见错误地保持 disabled——这是最大的隐藏门槛。
- 新患者的 Guarantor Type 只有 Entity（Guarantor 只有 Mini Reg Guarantor）；后续需要 Self guarantor 时先走 Guarantors tab。
- Admit 子表单的 Unit / Room/Bed 也是必填，选项依赖 levelOfCare；自动化取第一个选项。
- 患者已有 In Progress 的 ADT encounter 时，其他 encounter 的 Admit 按钮不渲染（`ACTIVE_ENCOUNTER_BANNED_STATUS`）。
- Admit 成功后 BNR 立即自动创建（Encounter summary 的 Billing Number ID 与 Accounts (BNR) 首行一致），无需等几分钟。

### 阶段 3（quick_charge 切片，2026-09-12，fbch34）

- Charge Services 的 Account Lookup 按**患者姓名或 MRN** 搜索有效（2026-09-15 实测 MRN 直查）；按 BNR 号搜索返回 0 结果。结果行只在**单击姓名单元格**时打开（姓名路径此前用双击也有效）；双击 MRN/SSN 单元格无反应。
- 打开路径：患者行双击 → BNR Overview → Hospital 子 BNR 行的 "Open"（base 行的同名 link 单元为空，需按文本 Open 过滤）。
- BNR 详情 Charges tab 的 "Add Charges" 是 **tab**（testid `charge-services-tab-bnr-add-charges`），不是 button；切到该 tab 才渲染 Quick Charge 面板。
- Quick Charge 行的 textContent 是 **CPT 与描述连写**（`96372THERAPEUTIC ...`），正则 `\b96372\b` 不匹配；用子串匹配。
- 提交后队列清空、视图停留在 Add Charges；需切到 View Charges（`charge-services-tab-bnr-charge-transactions`）才能看到 `charge-services-transactions-datagrid` 里的 In Process 行。患者可能有同 CPT 的历史交易行，断言取日期最新的行（`.last()`）。
- 本次环境 Submit **没有**出现 CDM Conflict / "Error Submitting" 弹窗；代码仍保留防御处理。
- Create Patient 的提交点击偶发被应用吞掉（对话框不关、无请求、按钮仍 enabled）；step 检测后重按可恢复。
- 潜在重复弹窗提供 "Create New Patient"（强制创建）按钮：测试数据用唯一姓名 + 新 SSN，直接强制创建即可（不再换数据重试）。

### 阶段 4（coding_complete 切片，2026-09-12，fbch34）

- 首次打开 Coding tab 会弹 "Begin Coding" 确认；点 Begin 后状态变 In Progress。
- Diagnosis 子 tab 一次渲染两个槽位（Type of Diagnosis 自动分配为 Admit / Principal，字段 disabled）；一个 Save Diagnosis 保存两行。
- 诊断码是异步 Autocomplete：**输入完整码会被自动填充但不产生可选列表，Save 仍 disabled**；必须少输入最后一个字符逼出 `li[role=option]` 再点选。
- 2026-09-15 起诊断录入改为 **Add Diagnosis 整页表单**（不是 view 内槽位、也不是 role=dialog）：Admit/Principal 两个区，每区 `#diagnosis-ICD10_CM_Code` + `#diagnosis-Code_Date`（掩码 `__/__/____`，可直接键入 MM/DD/YYYY，要求=当天，按 box 时区）+ POA/HAC/CC/MCC（可留空）；Save Diagnosis 在页面级。
- ADT 子 tab 的 Discharge Disposition 需点铅笔（`svg[data-testid="EditIcon"]`）→ 表单里第 2 个 `input[placeholder="Make Selection"]` → Save（显示 `<值>(Modified)`）。
- `coding-complete-button`（Complete）把状态置为 Complete；2026-09-15 补齐 DRG：Add DRG 是内嵌表单（无弹窗），`#DRG-DRG` 输入完整码自动选中（无候选列表），Severity/Risk of Mortality 必选，"Save DRG" 按钮在 coding-view 容器外且与 Complete 共用 dialog-submit-button testid（须按 name 定位）。
- 已 Complete 的记录再进 Coding 会弹 "Begin Recoding"（不是 Begin Coding）；重编码会话里旧诊断仍在，fillDiagnoses 的 Add Diagnosis 会被遮挡——重编码路径未支持，重新编码请对新数据全流程跑。

### 阶段 5（discharge 切片，进行中，2026-09-12，fbch34）

**2026-09-15 出院医嘱已打通（fbch34，Testbot_2609151356）**：ORDER DETAILS 里
Authorizing Provider 是预填的（如 "34494a dstest"），无需 Pre-Add 查询；必填的
Discharge Disposition 是 MUI select（li[role=option]，值如 "Home or self-care" 带连字符）；
确认走 footer **Done**、提交走面板 **Submit**（无 Save 按钮），随后 Validation Dialog
确认密码。expectOrderActive 实测读到 Active。以下为历史阻塞记录：

此前阻塞在 BROWSE ORDERS 面板的 **Authorizing Provider** 查询：对新创建的患者该字段
（MUI Autocomplete）输入 ≥3 字母（如 `tes`）后 **不返回任何候选**，Add 按钮因此保持
disabled（计数已为 1）。

已验证事实（fbch34，gyq001）：

- CPOE2 的 rail 按钮 **ORDER ENTRY 只在打开了患者图表（Patient Control 双击 row → URL 带 dbpath）时出现**；从 Registration 患者 tab 的 rail 里没有它。
- 本构建的 OE **没有任何 data-testid**（kit 文档里的 `cpoe-browse-btn` 等不存在），只能按文本/ARIA 定位；唯一例外是 Add 按钮 `data-testid="browse-order-add-btn"`。
- BROWSE ORDERS 有两种渲染：分类列表（ExtJS grid 行）与 kit 布局（Medications/Non-Meds 按钮 + 分类树 + Name 网格）。
  - 非药物分类（ADT）**必须先点 Non-Meds**。
  - 点分类节点只会过滤 Name 网格；**必须勾选该行的 checkbox**（ADT 出院单的 checkbox id 为 `checkbox-ADTDC301`）Add 计数才会从 0→1。
  - 订单行文本形如 `frequent Discharge patient ONCE`（Name/Sort/Freq 列），锚定 `^Discharge` 匹配不到。
- Add 计数为 1 时按钮**仍可能 disabled**：Pre-Add 面板的 Authorizing Provider 为必填（provider 登录有时会预填，本例没有）。
- ORDER DETAILS（成功后）字段：ADT Instruction / Category / Subcategory / Order Time* / Start Time* / Provider\*；Provider 是 type-to-filter combo，**在 ORDER DETAILS 里查 `tes` 能返回候选**（`GATES,DANIEL,MD` 等），说明 Pre-Add 的 Provider 是另一个端点/过滤集。
- Save 触发的对话框序列：`Screening Error`（Yes）→ `Order Decision Support`（OK）→ `Validation Dialog`（Username 预填 / Password 必须输入，空密码点 OK 是静默 no-op）。
- Registration 侧：Encounters → 选 In Progress 的行 → `encounterDetails-discharge-button` → Discharge Details 面板显示 `encounters-Discharge-order-message` = "No Order in Place" 且 `encounters-form-save-button`（Discharge Patient）disabled，**证明需要 Active 的出院医嘱**。
- **2026-09-15 全流程出院已打通**：医嘱 Active 后同一 message 元素翻成 "Order in Place"（带绿勾）但**仍留在 DOM**——断言必须查文本而非 toHaveCount(0)，否则永远失败（这就是本切片此前卡住的最后原因）。保存按钮 "Discharge Patient" 在面板底部（`encounters-form-save-button`），Playwright 自动滚动可点。
- `PatientCreatePage.pickDob`：日期选择器有时以 year view 打开，双重 toggle 会切回日历视图（已修为幂等）；同名测试数据会触发 POTENTIAL DUPLICATE 弹窗，用其自带 "Create New Patient" 强制创建（`duplicate-patient-create-new-patient-button`）。
