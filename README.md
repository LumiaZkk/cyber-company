# Cyber Company

Cyber Company 是一个构建在 OpenClaw 之上的多 Agent 运营控制台。

它不是“再包一层聊天框”，而是把公司、角色、请求、交接、阻塞、恢复动作和运营视图建成显式产品状态，让单个操作者也能跑一支 AI 团队。

## 产品概览

- `CEO Home` (`/`)：看当前卡点、公司健康度和下一步动作
- `Operations Hall` (`/ops`)：看异常、恢复动作、快速派单和团队活动
- `Chat` (`/chat/:agentId`)：看角色对话、协作生命周期和需求上下文
- `Employees` (`/employees`)：看组织结构、员工状态和组织修复
- `Board` (`/board`)：看跨任务执行状态和阻塞
- `Automation` (`/automation`)：看自动化班次和执行计划
- `Dashboard` (`/dashboard`)：看 usage、成本归因和结果产出

## Quick Start

### Prerequisites

- Node.js 22+
- 一个可访问的 OpenClaw Gateway

### Install

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`，连接 Gateway 后创建或选择公司。

如果你本地跑的是 OpenClaw，默认地址通常是 `ws://localhost:18789`。

## 新同事先看哪

如果你是第一次进这个仓库，建议按下面顺序读：

1. `docs/engineering-onboarding.md`
2. `src/App.tsx`
3. `src/pages/*` 中对应路由的薄入口
4. `src/presentation/*` 中对应页面 screen / hooks / view-models
5. `src/application/*` 中对应的 façade 和业务编排
6. 需要纯规则时读 `src/domain/*`，需要 Gateway / 持久化 / runtime 适配时读 `src/infrastructure/*`

## 代码分层

- `src/pages`
  只保留 route shell。每个文件只负责把路由挂到对应 screen。
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
  小型辅助工具。这里不放新的业务主流程。

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
  当前工程入口和目录地图，给新同事看。
- `docs/cyber-company-prd.md`
  产品背景、问题定义和需求草案。
- `docs/codex-for-oss-application.md`
  对外申请材料草稿。
- `docs/archive/ddd-boundary-migration/`
  2026-03 DDD 收口的历史计划、进度和归档记录，不是当前开发入口。

## Screenshots

### CEO Home

![CEO Home](docs/images/ceo-home.png)

### CEO Chat

![CEO Chat](docs/images/ceo-chat.png)

### Operations Hall

![Operations Hall](docs/images/ops.png)

### Board

![Board](docs/images/board.png)
