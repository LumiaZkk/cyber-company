# Contributing to Cyber Company

Cyber Company 是一个建立在 OpenClaw 之上的运营控制台。改动代码前，先确认你改的是哪一层，而不是先找“以前放哪”。

## Local Setup

### Prerequisites

- Node.js 22+
- 可访问的 OpenClaw Gateway

### Install and Run

```bash
npm install
npm run dev
```

## 常用命令

```bash
npm run dev
npm run build
npm run lint -- --max-warnings=0
npm test
```

## 工程结构

- `src/pages`
  路由入口，只做 screen 挂载。
- `src/presentation`
  页面 screen、页面级 hooks、view-models、UI 组装。
- `src/application`
  面向页面的 command/query façade、业务编排、跨模块读模型。
- `src/domain`
  纯领域类型、规则、事件语义。
- `src/infrastructure`
  Gateway、runtime、持久化、事件日志等适配层。
- `src/components`
  通用 UI 与 system host。
- `src/lib`
  小型工具，不放新的主业务流。

## 改动应该放哪

- 你在改路由跳转、screen 装配、页面交互：
  放 `src/pages` 或 `src/presentation`
- 你在改页面消费的业务 surface、读模型、命令 façade：
  放 `src/application`
- 你在改纯规则、领域对象、状态语义、事件意义：
  放 `src/domain`
- 你在改 Gateway、runtime store、持久化、provider 适配：
  放 `src/infrastructure`
- 你在改 toast、banner、approval modal 这类系统 UI：
  放 `src/components/system`

## 边界规则

- 不要新增 `src/features/*`
- `pages` 不直接碰 `domain` 或 `infrastructure`
- `presentation` 不直接 import `infrastructure`
- `domain` 不依赖 `application`、`presentation`、`infrastructure`
- 需要确认边界时，以 ESLint restricted-imports 和 `docs/engineering-onboarding.md` 为准

## 推荐阅读顺序

1. `docs/engineering-onboarding.md`
2. `src/App.tsx`
3. 对应路由的 `src/pages/*`
4. 对应 screen 的 `src/presentation/*`
5. 对应 façade 的 `src/application/*`

## 历史材料

`docs/archive/ddd-boundary-migration/` 下是 2026-03 DDD 收口时的计划、进度和发现，保留用于回溯，不作为当前开发入口。

## 报告问题时请带上

- 预期行为
- 实际行为
- 最小复现步骤
- 浏览器和平台信息
- 控制台输出或截图
- 如果依赖 Gateway 行为，再补充 OpenClaw 版本和最小场景

## Secrets

- 不要提交真实 token、真实配置或个人数据
- 示例里一律使用明显的占位值
