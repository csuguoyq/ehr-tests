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
- `goals.yaml`: 目标 + 参数 schema + preset + 别名
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

- `flows/`、`specs/` 目标 >15 个 → 加域层目录。
- `goals.yaml` >300 行 → 拆 `goals/<域>.yaml`（加载器已兼容单文件与目录两种形态，重复目标键会报错）。
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
- BNR 自动创建需等待几分钟（后续收费切片）。
- CDM Conflict 后的 "Error Submitting" 弹窗是误报，dismiss 即可（后续收费切片）。
- DRG 182 在测试环境常为 None，可选（后续编码切片）。
- Registration Discharge 按钮可能 disabled，需走 DISCH API fallback（`api/` 预留）。
- Start Billing 按钮存在前提：患者已 Discharged（后续计费切片）。
- Page Object 中保留少量有注释背书的 settle wait（ExtJS 顺序填写、census 行绑定）；新增等待必须轮询条件，见 `src/utils/wait.ts` 头注。
- 登录 fixture（authedPage）为 test 级：每个 test 完整登录一次；test 数增多后可考虑 worker 级 / storageState 复用（待第二次需要时再抽象）。
- 本地 `ehr/src` 工作树 ≠ 目标 box 部署构建：`encounters-status-summary`、`encounterDetails-discharge-button` 等 8 个选择器在 fbch34 构建中存在、当前分支源码中没有；`npm run check:selectors` 报告的缺失需逐条人工判断。
- authedPage 默认 token 登录（`api/auth.ts`），UI 登录仅作兜底与 login spec 的被测对象。
- box 时区 ≠ 本地时区（fbch34 为美西时间）：日期类断言需按 box 的「今天」判定（见 SZ35266 spec 的 today/yesterday 双候选）；2026-09-16 复跑实测 census ADMIT DATE = 09/15/2026（命中 yesterday 候选）。

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
