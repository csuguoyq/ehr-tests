# AGENTS.md

独立 EHR 自动化测试工程（Playwright + TypeScript，目标驱动）。
**所有规则、架构、铁律、最终目标见 [PROJECT.md](PROJECT.md)——本文件只做路由，不复制内容。**

## 会话开始必读

1. [PROJECT.md](PROJECT.md) — 架构分层、铁律、结构与规模阈值、最终目标（North Star）、与 ehr/tests 的关系
2. [MODULES.md](MODULES.md) / [PAGES.md](PAGES.md) / [GOALS.md](GOALS.md) — 三张状态表（模块注册 / 页面状态 / 目标状态）

## 铁律速查（全文以 PROJECT.md 为准）

- 每轮只做一个垂直切片；完成后更新 goals.yaml + 三张状态表 + PROJECT.md 已知限制
- Flow 只编排；Page Object 不写业务 if；Step ≤3 分支；固化执行的运行时禁止调用 AI
- 选择器以 Page Object 为唯一权威；交互会话里验证的选择器必须沉淀回 Page Object
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
