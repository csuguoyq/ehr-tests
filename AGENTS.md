# AGENTS.md

独立 EHR 自动化测试工程（Playwright + TypeScript，目标驱动）。
**所有规则、架构、铁律、最终目标见 [PROJECT.md](PROJECT.md)——本文件只做路由，不复制内容。**

## 会话开始必读

1. [PROJECT.md](PROJECT.md) — 架构分层、铁律、结构与规模阈值、最终目标（North Star）、与 ehr/tests 的关系
2. [MODULES.md](MODULES.md) / [PAGES.md](PAGES.md) / [GOALS.md](GOALS.md) / [TCS.md](TCS.md) — 状态表（模块注册 / 页面状态 / 目标状态 / TC 映射）

## 铁律速查（全文以 PROJECT.md 为准）

- 每轮只做一个垂直切片；完成后更新 goals.yaml + 三张状态表 + PROJECT.md 已知限制
- Flow 只编排；Page Object 不写业务 if；Step ≤3 分支；固化执行的运行时禁止调用 AI
- 选择器以 Page Object 为唯一权威；交互会话里验证的选择器必须沉淀回 Page Object
- 写/改 Page Object、step 前，先看实现再动手：① 读 skills 文档 `$CCSRC_PATH/skills/ehr-workflow/<模块>/SKILL.md`（按需读其指向的 workflow 文件）与 `ehr-ui/browser-testing`；模块无 skills 覆盖或文档不含目标细节时，直接 grep 源码（`$CCSRC_PATH/ehr/src/<模块>`，搜 label 文本/testid/组件名）确认表单结构、字段、按钮文案与交互路径。CCSRC_PATH 在 `.env` 配置（默认 `../ccsrc`；路径不存在则跳过、退回运行时探测）。源码是草稿、实机是权威：两者不符时以实机为准，并把差异记录进 PROJECT.md
- 用户要求「按 TC/SZ 号测试」时：先查 [TCS.md](TCS.md)——已固化的直接跑对应 spec；未固化的按 TC 原文执行，完成后登记回 TCS.md
- 目录按规模阈值调整（见 PROJECT.md「结构与规模阈值」），不预设全量

## 运行

见 [README.md](README.md) 快速开始。汇报测试结果必须注明执行 host（`EHR_HOST`，不同 host 是不同物理机）。

## 与 ehr 应用仓库的关系

本工程独立运行：不 import `ehr/src`、不依赖其 node_modules/dev server，只需要网络可达一个 deployed webframe。
选择器审计可选地读取 ehr 源码（报告型）：

```bash
npm run check:selectors -- --ehr-src <path-to-ehr/src>   # 或 EHR_SRC=... 环境变量
# 不传参数时默认假定应用仓库并排克隆在 ../ehr；找不到则跳过审计
```
