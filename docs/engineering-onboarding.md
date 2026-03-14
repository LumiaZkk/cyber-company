# Engineering Onboarding

这份文档给第一次进入当前仓库的工程同事使用。

在新的对外叙事里，这个仓库承载的是：

- `Claw Sims`
  总模拟世界方向。
- `Claw Company`
  当前已经落地的第一个可玩子集，也是这份代码的主要产品面。
- `OpenClaw`
  下游运行时、Gateway 和执行能力来源。

仓库名和部分旧文档仍会出现 `cyber-company`，默认把它理解成当前 `Claw Company` 这条实现线即可。

目标只有两个：

1. 让你知道代码应该从哪里读
2. 让你知道改动应该落在哪一层

## 一眼看懂的目录地图

- `src/pages`
  路由壳。这里不要写业务逻辑。
- `src/presentation`
  真正的页面 screen、页面 hooks、view-models、页面装配。
- `src/application`
  页面消费的 façade、命令/查询入口、跨模块业务编排。
- `src/domain`
  纯规则、纯类型、事件语义、业务对象。
- `src/infrastructure`
  Gateway、runtime store、持久化、provider 适配。
- `src/components`
  共享 UI 和系统宿主。
- `src/lib`
  小辅助工具，不承担主流程业务编排。

## 推荐阅读顺序

### 先看整体入口

1. `src/App.tsx`
2. 你关心的路由文件，例如 `src/pages/ChatPage.tsx`
3. 对应 screen，例如 `src/presentation/chat/Page.tsx`
4. 如果 screen 很薄，继续看内容组件，例如 `src/presentation/chat/ChatPageContent.tsx`

### 再顺着业务链往下读

- 页面要什么数据、触发什么命令：
  去 `src/application/*`
- 页面底层依赖了什么运行态和外部能力：
  去 `src/infrastructure/*`
- 某条规则为什么这样判定：
  去 `src/domain/*`

## 典型链路怎么追

### Chat

`src/App.tsx`
→ `src/pages/ChatPage.tsx`
→ `src/presentation/chat/Page.tsx`
→ `src/presentation/chat/ChatPageContent.tsx`
→ `src/presentation/chat/hooks/*`
→ `src/application/chat/*` / `src/application/mission/*` / `src/application/delegation/*`
→ `src/domain/*` / `src/infrastructure/*`

### Board

`src/pages/BoardPage.tsx`
→ `src/presentation/board/Page.tsx`
→ `src/presentation/board/components/*`
→ `src/application/mission/*`
→ `src/domain/mission/*` + `src/infrastructure/company/runtime/*`

### Lobby

`src/pages/CompanyLobby.tsx`
→ `src/presentation/lobby/Page.tsx`
→ `src/application/lobby/*` + `src/application/governance/*` + `src/application/mission/*`

## 改动落点速查

- 新增页面交互、页面级状态、局部视图拼装：
  放 `src/presentation`
- 新增“页面要消费的业务 surface”：
  放 `src/application`
- 新增纯业务规则或领域对象：
  放 `src/domain`
- 新增 Gateway / 持久化 / runtime 适配逻辑：
  放 `src/infrastructure`
- 新增通用 UI 或系统宿主能力：
  放 `src/components`

## 页面职责对照表

| 页面 | 默认职责 | 不应该承载什么 |
| --- | --- | --- |
| CEO 首页 | 吸收目标、收敛问题、决定是否进入主线 | 不直接承载完整交付阅读或排障细节 |
| 需求中心 | 展示当前主线、验收、变更、决策和最短跳转 | 不重建 Workspace 正文，也不重建 Ops 恢复控制台 |
| Workspace | 看交付物、校验结果、知识沉淀和 closeout 证据 | 不承担立项入口，不替代需求中心做主线叙事 |
| Ops | 看阻塞、失联、超时、接管和恢复动作 | 不抢主线叙事，不作为默认首页 |
| Board | 看执行顺序、派单、接手和执行摘要 | 不替代需求中心做验收和决策 |
| Runtime | 看 authority / recovery / compatibility 诊断 | 不承担日常主路径导航 |
| Settings / Connect | 管理连接、预算、heartbeat、doctor、backup/restore | 不混入主线业务判断 |

默认产品心智只有一条：

`CEO 首页 -> CEO 深聊 -> 需求中心 -> Workspace / Ops`

后续如果改页面文案或导航，先对照这张表确认有没有重新把主线打散。

## 明确禁止

- 不要新增 `src/features/*`
- 不要把页面直接接到 `src/infrastructure/*`
- 不要把领域规则放回 screen 或路由壳
- 不要把历史 archive 文档当成当前结构说明

## 历史材料怎么看

`docs/archive/ddd-boundary-migration/` 保存的是 2026-03 的 DDD 收口过程文件。

- 这些文件可以帮助你理解“为什么会变成现在这样”
- 但它们不是当前代码结构的权威说明
- 当前权威入口是这份文档、`README.md` 和 `CONTRIBUTING.md`
