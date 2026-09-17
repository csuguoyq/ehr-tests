# NEW_MODULE.md — 新模块/新 goal 切片手册

分步 checklist + 文件模板 + 稳定性实践。规则全文见 [PROJECT.md](PROJECT.md)（铁律、阈值、North Star）；
状态表口径见 [MODULES.md](MODULES.md) / [PAGES.md](PAGES.md) / [GOALS.md](GOALS.md) / [TCS.md](TCS.md)。

## 0. 切片前

- [ ] 读四个状态文件（PROJECT / MODULES / PAGES / GOALS）；TC 场景另查 TCS.md
- [ ] 调研：读 `$CCSRC_PATH/skills/ehr-workflow/<模块>/SKILL.md`；无覆盖则 grep 源码（`$CCSRC_PATH/ehr/src/<模块>`，搜 label/testid/组件名）。**源码是草稿、实机是权威**，差异记 PROJECT.md
- [ ] TC 场景且未固化：请用户先录制
  `npx playwright codegen --ignore-https-errors -o recordings/<SZ号>.manual.ts "<测试入口URL>"`
  （recordings/ 只作素材，不入库），AI 读录制代码提取路径与选择器
- [ ] MODULES.md 登记模块（新目录在「注册名 ↔ 代码目录映射」表加一行）

## 1. 落库文件（TC 场景最大集，11 项）

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

## 2. 文件模板

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
export class XxxPage {
  constructor(private readonly page: Page, private readonly env: EhrEnv) {}
  // atomic actions + locators only — no business branching (iron rule 2)
}
```

### Step（`steps/<模块>/xxx.step.ts`）

```ts
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

## 3. 稳定性实践（全部来自 fbch34 实测，必须遵守）

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
   报错注明等待条件与超时。
10. **失败证据**：trace retain-on-failure + 截图 only-on-failure；关键断言前
    `test.info().attach` 现场截图。

## 4. 收尾

- [ ] `npm run build:drv && npm run check:goals` 绿
- [ ] 无头实机验证（新 spec / 改动的 spec）
- [ ] 四张状态表 + PROJECT.md 同步更新
- [ ] `npx tsc --noEmit` 干净
