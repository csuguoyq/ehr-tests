# ehr-tests — EHR Playwright 自动化测试框架

按 `docs/deepseek_markdown_20260911_79eb5c.md` 实施的目标驱动测试框架。设计与状态见
[PROJECT.md](PROJECT.md)、[MODULES.md](MODULES.md)、[PAGES.md](PAGES.md)、[GOALS.md](GOALS.md)、[TCS.md](TCS.md)（TC 映射）。
最终目标（AI 写 TC→审核→执行→报告 / 按 bug 重现 / 按需产生数据）与达成路线见
[PROJECT.md「最终目标」](PROJECT.md#最终目标north-star)。

## 快速开始

```bash
cd ehr-tests
cp .env.example .env      # 按目标环境改 EHR_HOST（不同主机是不同物理机！）
npm install
npx playwright install chromium   # 仅首次或浏览器版本不匹配时
npx playwright test               # 全部 spec
npx playwright test specs/login.spec.ts    # 阶段 1：登录
npx playwright test --headed      # 有窗口调试
```

## 目标驱动执行（spec / CLI 通用）

```ts
await runFromInput(page, "登录");                        // 自然语言匹配
await runGoal(page, "login", { username: "demo" });      // 按目标键 + 参数
await runGoal(page, "create_encounter", { preset: "inpatient_acute_admit" }); // preset（inpatient_acute_admit / inpatient_acute_existing_patient / outpatient 均已实现）
```

运行时纯 Playwright，无 AI 调用；失败自动留 trace + 截图（`test-results/`，
`npx playwright show-trace` 查看）。

## 扩展新切片（每轮一个）

1. 读四个状态文件（PROJECT / MODULES / PAGES / GOALS）；TC 场景另查 TCS.md。
2. goals.yaml 登记/补充目标 schema → Page Object → Step → Flow → Spec。
3. Flow 注册进 `flows/index.ts`，goals.yaml 标 `implemented: true`。
4. 更新 MODULES.md / PAGES.md / GOALS.md（+TCS.md，TC 场景）/ PROJECT.md；`npm run check:goals` 过一致性门。

新模块切片的分步 checklist 与文件模板见 [NEW_MODULE.md](NEW_MODULE.md)。
