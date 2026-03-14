# Claw Sims / Claw Company

[简体中文](./README.md) | [English](./README.en.md)

`Claw Sims` 是一个构建在 OpenClaw 之上的模拟世界集合。这个仓库当前承载它的第一个可玩子集 `Claw Company`：一个让单个操作者用 CEO、需求、协作、接管、恢复和治理视图来运行 AI 团队的公司模拟器。

它不是“再包一层聊天框”，而是把组织、请求、交接、阻塞、审批、自动化和交付证据建成显式产品状态，让“模拟上班”真正可操作、可追踪、可恢复。

## 品牌结构

- `Claw Sims`
  总世界观和产品方向。未来会承接更多“模拟生活 / 模拟工作 / 模拟系统”的可玩子集。
- `Claw Company`
  当前仓库里的第一条主线，也是目前已经落地的 playable slice。重点是公司运营、CEO 调度、需求推进和协作治理。
- `OpenClaw`
  运行时、Gateway 和底层 Agent 能力来源。

> 说明：仓库名和部分历史文档仍沿用 `cyber-company`，但对外产品叙事会逐步收敛到 `Claw Sims -> Claw Company -> OpenClaw` 这套结构。

## 当前仓库能玩什么

- `连接与开局`：`/connect`、`/select`、`/create`、`/executor-setup`
- `运行态`：`/runtime`，看 authority、executor、恢复与兼容性诊断
- `CEO 首页`：`/ceo`，先说目标，再由 CEO 调度团队
- `需求中心`：`/requirement`，收敛当前主线、决策、验收和推进状态
- `Ops`：`/ops`，看阻塞、接管、恢复动作和团队活动
- `工作看板`：`/board`，看执行顺序、派单、接手与执行摘要
- `工作目录`：`/workspace`，看交付物、知识沉淀和 closeout 证据
- `员工管理`：`/employees`
- `自动化`：`/automation`
- `运营报表`：`/dashboard`
- `系统设置`：`/settings`
- `角色会话`：`/chat/:agentId`

默认入口 `/` 会在完成连接与公司恢复后跳到 `/runtime`，再通过顶部主线快切进入 `CEO 首页` 或 `需求中心`。

## Quick Start

### Prerequisites

- Node.js 22+
- 一个可访问的 OpenClaw Gateway

### Install

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动 Vite 前端和本机 Authority 控制面。

打开 `http://localhost:5173`，连接 Authority 后创建或选择公司。

如果你本地也跑了 OpenClaw，Authority 默认会尝试连接 `ws://localhost:18789` 作为下游执行器；没启动时，Authority 仍可进入界面，但聊天和模型能力会显示为降级。

## 怎么理解这个仓库

如果你是第一次进来，建议按下面顺序读：

1. `docs/engineering-onboarding.md`
2. `src/App.tsx`
3. `src/pages/*` 里对应路由的入口组件
4. `src/presentation/*` 里对应页面的 screen、hooks 和页面装配
5. `src/application/*` 里的 façade、命令、查询和业务编排
6. 纯规则去看 `src/domain/*`，Gateway / runtime / 持久化去看 `src/infrastructure/*`

## 代码分层

- `src/pages`
  路由入口层，只负责把 URL 挂到对应 screen。
- `src/presentation`
  页面 screen、UI 级 hooks、view-models、页面装配逻辑。
- `src/application`
  面向页面的 query/command façade、业务编排、跨领域读模型。
- `src/domain`
  纯类型、领域规则、事件语义，不依赖 presentation 或 infrastructure。
- `src/infrastructure`
  Gateway、runtime store、持久化、事件日志等外部适配层。
- `src/components`
  可复用 UI 和 system host，例如 toast、approval modal、banner。
- `src/lib`
  小型辅助工具；这里不放新的业务主流程。

## 仓库约定

- 不要再新增 `src/features/*`。这个历史层已经退役。
- 页面功能优先沿着 `pages -> presentation -> application -> domain/infrastructure` 去找。
- 想加新规则，先判断它是“纯业务语义”还是“页面装配/外部适配”。
- 想放不准的代码，先看 `docs/engineering-onboarding.md` 里的“改动落点”说明。

## Development

```bash
npm run dev
npm run build
npm run lint -- --max-warnings=0
npm test
```

## 文档

- `docs/engineering-onboarding.md`
  当前工程入口、品牌层级和目录地图。
- `docs/cyber-company-evolution-direction.md`
  从当前 `Claw Company` 可玩子集如何演进到 `Claw Sims` 更大版图的方向说明。
- `docs/cyber-company-prd.md`
  当前公司模拟子集的产品背景、问题定义和需求草案。
- `docs/codex-for-oss-application.md`
  对外申请材料草稿。
- `docs/archive/ddd-boundary-migration/`
  2026-03 DDD 收口的历史计划、进度和归档记录，不是当前开发入口。

## Screenshots

### CEO Home

![CEO Home](docs/images/ceo-home.png)

### CEO Chat

![CEO Chat](docs/images/ceo-chat.png)

### Ops

![Ops](docs/images/ops.png)

### Board

![Board](docs/images/board.png)
