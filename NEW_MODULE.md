# NEW_MODULE.md — 新模块/新 goal 切片手册

分步 checklist + 稳定性实践 + 调试循环 + AI 提示词。规则全文见 [PROJECT.md](PROJECT.md)（铁律、阈值、North Star）；
状态表口径见 [MODULES.md](MODULES.md) / [PAGES.md](PAGES.md) / [GOALS.md](GOALS.md) / [TCS.md](TCS.md)。
学习参考（create_patient 完整走查、文件模板、Context/fixtures、选择器发现、spec 写法方法论）见 [HOWTO.md](HOWTO.md)。

## 1. 运行时链路：一次 runGoal 如何执行

写代码前先理解新模块要嵌进哪里。入口是 `src/executor/runner.ts`：

```
spec: await runGoal(page, "create_patient", { params: {...} })
   或: await runFromInput(page, "新建患者")                      ← 自然语言入口
  1. loadGoals()          读 goals.yaml（单文件；超阈值后拆 goals/*.yaml 目录）
  2. matchGoal()          src/executor/goal-matcher.ts：按 aliases 匹配 goal 键；implemented: false 直接抛错
  3. resolveParams()      src/executor/param-resolver.ts：优先级 = 显式 params > preset > default
                          （default: null 在运行时解析 env EHR_USER/EHR_PASS——见各 step）
  4. getFlow()            flows/index.ts 的 FLOWS[goal]；check:goals 与 goals.yaml 强制双向一致
  5. createEhrContext()   按 page 缓存（WeakMap）：一个 test 里多次 runGoal 共享同一个 ctx（见 HOWTO.md §2）
  6. flow.execute(ctx, params)
      → steps/<模块>/*.step.ts：业务原子动作
      → page-objects/<模块>/*.page.ts：定位器 + 原子动作 + 断言
```

两个执行入口共享这条链路：`npx playwright test`（固化回归）与 `node drive-ml.js`
（自然语言 CLI，需先 `npm run build:drv`）。

## 2. 切片前

- [ ] 读四个状态文件（PROJECT / MODULES / PAGES / GOALS）；TC 场景另查 TCS.md
- [ ] 调研：读 `$CCSRC_PATH/skills/ehr-workflow/<模块>/SKILL.md`；无覆盖则 grep 源码（`$CCSRC_PATH/ehr/src/<模块>`，搜 label/testid/组件名）。**源码是草稿、实机是权威**，差异记 PROJECT.md
- [ ] TC 场景且未固化：请用户先录制
  `npx playwright codegen --ignore-https-errors -o recordings/<SZ号>.manual.ts "<测试入口URL>"`
  （recordings/ 只作素材，不入库），AI 读录制代码提取路径与选择器（见 HOWTO.md §4）
- [ ] MODULES.md 登记模块（新目录在「注册名 ↔ 代码目录映射」表加一行）

## 3. 落库文件（TC 场景最大集，11 项）

```
1. MODULES.md          模块行 + 目录映射
2. goals.yaml          goal 键（aliases / params schema / presets）
3. page-objects/<模块>/xxx.page.ts   选择器唯一权威
4. steps/<模块>/xxx.step.ts          业务原子动作，≤3 分支
5. flows/xxx.flow.ts                 只编排，零定位器
6. flows/index.ts      import + FLOWS 注册        ← 最易漏（check:goals 会拦）
7. specs/…             TC 型放 specs/sz/TC<id>-slug.spec.ts
8. PAGES.md            页面卡
9. GOALS.md            goal 行
10. TCS.md             TC 场景：无头实机验证通过后登记
11. PROJECT.md         切片记录 + 已知限制
```

最易漏的三处由 `npm run check:goals` 一致性门兜住：FLOWS 注册、GOALS.md 行同步、
spec 里 `runGoal("<name>")` 引用存在性。**提交前必跑：`npm run build:drv && npm run check:goals`。**

这份清单用 create_patient 的真实代码逐文件走一遍见 [HOWTO.md §1](HOWTO.md)；
无现成实例可参照时的骨架模板见 [HOWTO.md §3](HOWTO.md)。

## 4. 稳定性实践（全部来自 fbch34 实测，必须遵守）

1. **条件轮询 > 固定等待**（`src/utils/wait.ts` 头注是规约）：新增等待必须轮询条件；
   settle wait 必须有注释背书已验证的竞态。
2. **重试 = 动作 → 可观察状态证明 → ≤N 次**：不允许盲重试；每次重试前必须证明上一次
   动作未生效（如队列计数 +1、弹窗关闭、行出现）。
3. **先录制再转化**（TC 固化）：codegen 录制 → AI 重构为 PO+step+flow+断言。
4. **先线性 spec 跑通，再抽 Page Object**（铁律 1）；第二次复用才抽（铁律 8）。
5. **选择器以 PO 为唯一权威**：交互会话验证的选择器必须沉淀回 PO；定期
   `npm run check:selectors` 审计。
6. **数据 Testbot_ 命名**（`generateLastName`：Testbot_YYMMDDHHmm；SSN 日期+时刻编码）；
   不动共享 box 他人数据，不清理。
7. **汇报必带 host**（`EHR_HOST`）：不同 host 是不同物理机，跨机结果不可比。
8. **日期断言按 box「今天」**（fbch34 美西）：today/yesterday 双候选（SZ35266 spec 模式）。
9. **环境阻断与真实失败分开报**：等服务器侧状态（claim 管线 / BNR 翻转）不算失败，
   报错注明等待条件与超时。确定性耗尽的 throw 用 `EnvBlockedError`
   （`src/utils/errors.ts`，message 带 `[ENV-BLOCKED]` 前缀），让报告可分类；
   它不改变测试结果（不自动 skip/pass）。
10. **失败证据**：trace retain-on-failure + 截图 only-on-failure；关键断言前
    `test.info().attach` 现场截图。

## 5. 调试与迭代循环

新切片的标准迭代循环（规则细节见 §4）：

1. **先有窗口看实跑**：`HEADLESS=0 SLOW_MO=500 npx playwright test <spec>`
   （`.env` 已有观察模式配置；`KEEP_BROWSER_MS` 让跑完的窗口保持可看最终屏）——
   先确认「页面实际在做什么」，再改代码。
2. **失败看证据**：失败自动留 trace + 截图（`test-results/`，`npx playwright show-trace <trace 文件>` 逐步看，见 §4 第 10 条）。
   关键断言前 `test.info().attach("screenshot", { body: await page.screenshot() })` 留现场截图——
   失败现场就是最需要看的现场。
3. **先分类再修**：环境阻断（等服务器侧状态，按 §4 第 9 条报告）vs 真实失败（选择器 / 断言 / 流程逻辑）。
   环境阻断不改流程代码。
4. **无头实机通过 = 固化**：`HEADLESS=1` 验证通过后按 §7 收尾。
5. **效率教训（2026-09-21，TC35520 复盘）——未固化 TC 的执行顺序**：
   ① 优先走「用户 codegen 录制 → AI 重构」约定流程；AI 自主探索时的工具选择：
   **一次性 Playwright 脚本（node 跑，批量执行、可重复、脚本直接演化成 PO）> Playwright
   MCP 逐步点选**（每步一轮模型往返，referral 表单摸了 40+ 轮，且产出是一次性脚本、
   知识不落盘）；MCP 只用于看一眼陌生页面结构 / 验证单个假设。
   摸索阶段要**同步**把选择器沉淀进 PO，禁止「先用一次性脚本摸索、事后再凭记忆重写」
   （二次翻译必引入 bug，TC35520 的 firstName 漏传 / drawer 点击丢失均出自此）。
   ② 动手前用 SSH 一次查齐 box 特定数据（provider NPI、facility/clinic 文案、
   ICD-10/CPT 可用值等）存 `data/` 常量，不在 UI 表单里逐个试错。
   ③ **铁律 13：调试/探索禁止从头重跑**——卡在哪一步，就用已完成的数据续跑该步
   （existing 患者模式 + ssn/mrn 参数；scratch 已有 SSN 就跳过重建；encounter/BNR/
   转诊已建好就直接进下一步）。每轮全量重建既慢又污染 box（同名患者堆积）。
   ④ **铁律 14：不确定先求助，禁止瞎猜**——业务/预期/取舍类不确定直接问用户；
   事实类（选择器、字段名）先查源码/实机验证再动手，无法验证 = 该求助。
   ⑤ 调试迭代一律 `HEADLESS=1 SLOW_MO=0` 快跑，最终验收才用用户的观察模式配置；
   长链用例注意 config 的单测 timeout（600s），不够时才在 spec 内 `test.setTimeout`。

## 6. AI 提示词：不同场景下请求 AI 增加测试脚本

用法：把对应模板粘给 AI 会话，替换 `<占位符>` 为实际内容。
AI 会话开始会自动读 AGENTS.md / PROJECT.md（铁律与约定是它的「宪法」），
所以提示词**不必复述铁律，要写清三件事：什么场景、什么输入、什么验收标准**。
每条模板都带收尾门与 host 汇报要求，防止 AI 漏掉状态表同步。

### 6.1 从零新增 goal（新业务操作）

> 我要新增一个 goal「<goal 名，如 取消一个 encounter>」。业务背景：<入口、字段、按钮、预期结果>。
> 按 NEW_MODULE.md 完成这个垂直切片：
> 1. 先读四个状态表并做切片前调研（skills 文档 / 源码 grep；实机是权威）
> 2. goals.yaml 登记 goal（aliases 写用户真实会说的说法，先标 implemented: false）
> 3. 按 PO → step → flow → flows/index.ts 注册 → spec 顺序实现（含一条不开浏览器的 schema 单测）
> 4. 选择器必须实机验证并沉淀进 PO，注释带验证日期 + host
> 5. 更新 MODULES.md / PAGES.md / GOALS.md / PROJECT.md
> 6. `npm run build:drv && npm run check:goals` + `npx tsc --noEmit` 绿，新 spec 无头实机验证通过
> 7. 汇报必须带执行 host；环境阻断与真实失败分开报；不要 commit，改动留在工作区

### 6.2 TC/SZ 固化（人工测试用例变回归 spec）

> 把 TC<id> 固化成回归 spec。TC 原文：<粘贴 TC>。
> 按「先录制再转化」流程：
> 1. 先查 TCS.md：已固化则直接跑对应 spec 汇报（带 host）
> 2. 未固化则先按 TC 原文执行一遍，汇报结果（带 host）
> 3. 我会用 `npx playwright codegen --ignore-https-errors -o recordings/<SZ号>.manual.ts "<入口URL>"` 按 TC 录制一遍；录完你读录制代码，提取真实操作路径与选择器（recordings/ 只作素材，不入库）
> 4. 重构成 PO 动作 + step + goal/flow + 按 TC Expected 的断言；选择器沉淀进 Page Object
> 5. spec 放 specs/sz/TC<id>-slug.spec.ts（含 schema 单测）；goals.yaml 登记 goal；更新四张状态表 + TCS.md + PROJECT.md
> 6. 固化条件 = 无头实机验证通过 + `npm run build:drv && npm run check:goals` 绿；最后以自己的 spec 执行并汇报（带 host）

### 6.3 扩展现有 goal（加参数 / preset / 别名）

> 扩展现有 goal <goal_name>：<加新参数 <param> / 加 preset <preset> / 加别名「<说法>」>。需求：<用法与预期行为>。
> 1. 先读该 goal 在 goals.yaml 的现状 + 对应 flow/step/PO + GOALS.md 行
> 2. 参数组合是数据不是分支（铁律 7）：用参数表达，不写 if 分场景
> 3. 改 goals.yaml schema（type / default / description 齐全）；涉及新 UI 动作时扩 PO（选择器实机验证沉淀进 PO）
> 4. 更新对应 spec：schema 单测加断言；不修改已通过的断言逻辑（铁律 10，新增 test）
> 5. 更新 GOALS.md 行 + PROJECT.md
> 6. `npm run build:drv && npm run check:goals` + `npx tsc --noEmit` 绿，改动的 spec 无头验证通过，汇报带 host

### 6.4 修复失败 / 偶发失败的 spec

> spec <路径> 失败 / 偶发失败。错误：<粘贴错误或 trace 摘要>。
> 按调试循环（NEW_MODULE.md §5）排查：
> 1. 先看证据（test-results/ 的 trace / 截图）；先分类再修——环境阻断（等服务器侧状态）vs 真实失败（选择器 / 断言 / 流程逻辑）；环境阻断不改代码
> 2. 选择器失效：实机 devtools / codegen 重新验证，新选择器沉淀进 Page Object（注释带验证日期 + host）；spec 与 step 不得直接持有定位器
> 3. 竞态：改条件轮询 /「动作 → 可观察证明 → ≤N 次重试」，不允许盲重试（§4）
> 4. 不改变已验证的断言语义（铁律 10）；若断言本身断的是瞬态现象，改成稳定最终状态并说明原因
> 5. `npx tsc --noEmit` + 无头实机验证通过（能连跑 3 次确认稳定）；汇报必须带 host

### 6.5 按 bug 步骤重现问题

> 重现以下问题。bug 号/描述：<粘贴>；重现步骤：<粘贴>；预期 vs 实际：<粘贴>。
> 1. 先查 TCS.md / 现有 spec / GOALS.md：有可复用的 goal 就优先用现有 goal 编排（runGoal + scratch），不写新代码
> 2. 无可复用路径时：先调研（skills 文档 / 源码 grep / 实机）再实现最小 step；选择器实机验证沉淀进 PO
> 3. 重现完成的判定：bug 描述的现象在实机出现，并留证据（截图 / trace，关键处 test.info().attach）
> 4. 产出现重现报告：结论（重现 / 未重现 / 环境阻断）+ 证据 + 执行 host
> 5. 重现成功且需回归时，问我是否固化为 goal/spec，不自动固化

### 6.6 造数据（按业务要求产生数据）

> 按业务要求造数据：<如「造一个已出院、有欠费且 claim 已提交的患者」>。
> 1. 先查 GOALS.md 现有 goal：优先用现有 goal 编排（如 create_encounter → quick_charge → coding_complete → discharge → start_billing 链，scratch 共享患者）
> 2. 缺阶段时：按 NEW_MODULE.md 调研并补齐缺失的 step；选择器实机验证沉淀进 PO
> 3. 测试数据按 Testbot_ 命名约定；不动他人数据
> 4. **落盘造的数据清单**（患者姓名 / SSN / MRN / BNR / encounter / 金额等，写成数据记录文件或列入汇报）
> 5. 汇报必须带 host + 数据清单

## 7. 收尾

- [ ] `npm run build:drv && npm run check:goals` 绿
- [ ] 无头实机验证（新 spec / 改动的 spec）
- [ ] 四张状态表 + PROJECT.md 同步更新
- [ ] `npx tsc --noEmit` 干净
