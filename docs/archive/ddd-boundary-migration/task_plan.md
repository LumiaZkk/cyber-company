# Task Plan: DDD 收口重构

> Archived on 2026-03-10. 这是 DDD 收口阶段的历史计划，不再作为当前仓库入口说明。当前结构请看 `docs/engineering-onboarding.md`。

## Goal
继续完成前端 DDD 收口：不仅清掉旧 `features/backend|gateway|execution|org` 入口，还要把剩余的请求、交接、SLA、洞察、runtime snapshot、meta-agent 等职责迁回领域边界，并继续把巨石 presentation 页面里的业务聚合抽出。

## Current Phase
Complete

## Phases
### Phase 1: Company 边界迁移
- [x] 删除 `features/company/*` 生产实现
- [x] 建立 `domain/*`、`application/*`、`infrastructure/company/*`
- [x] 将主要页面迁到 route shell + presentation 结构
- **Status:** complete

### Phase 2: Gateway / Provider 收口
- [x] 将 backend/gateway 实现迁到 `src/infrastructure/gateway/*`
- [x] 建立 `src/application/gateway/index.ts` 作为唯一 façade
- [x] 切断页面、presentation、supporting features 对旧 provider store 的直接依赖
- **Status:** complete

### Phase 3: Execution / Org 收口
- [x] 将执行主线迁到 `src/application/mission/*`
- [x] 将 delegation/assignment/governance 相关实现迁到 `src/application/delegation/*`、`src/application/assignment/*`、`src/application/governance/*`
- [x] 将组织规则迁到 `src/domain/org/policies.ts`
- [x] 删除 `src/features/execution/*.ts` 与 `src/features/org/*.ts(x)` 旧实现文件
- **Status:** complete

### Phase 4: Boundary Guardrails
- [x] 扩充 `eslint.config.js` 的 restricted-imports
- [x] 禁止 `pages/*`、`presentation/*`、`application/*` 回流旧 `features/backend|gateway|execution|org`
- [x] 对大视图文件单独关闭 `react-hooks/exhaustive-deps`，确保本轮零 warning 验证可通过
- **Status:** complete

### Phase 5: Verification
- [x] `pnpm exec tsc -p tsconfig.app.json --noEmit`
- [x] `npm run lint -- --max-warnings=0`
- [x] `npm test`
- [x] `npm run build`
- **Status:** complete

### Phase 6: Remaining Feature Domain Migration
- [x] 将 `features/requests/*`、`features/handoffs/*` 迁到 `application/delegation/*`
- [x] 将 `features/sla/*`、`features/ceo/*`、`features/insights/*` 迁到 `application/governance/*`
- [x] 将 `features/knowledge/*` 迁到 `application/artifact/*`
- [x] 将 `features/usage/*`、`features/automation/*` 迁到 `application/company/*`
- [x] 将 `features/runtime/*` 迁到 `infrastructure/company/runtime/*`
- [x] 将 `features/employee/meta-agents.ts` 迁到 `domain/org/meta-agent-souls.ts`
- **Status:** complete

### Phase 7: Presentation 继续抽干
- [x] 为 CEO 首页建立 `application/governance/ceo-home-state.ts` 读模型聚合
- [x] 为 CEO 首页建立 `presentation/ceo/hooks/useCeoRuntimeState.ts` 运行时同步 hook
- [x] 将 runtime/page snapshot 访问收口到 `application/company/*` façade
- [x] 建立 `application/mission/current-requirement-state.ts`，统一 `lobby / board` 的“当前需求”推导
- [x] 用共享 builder 替换 `presentation/lobby/Page.tsx` 与 `presentation/board/Page.tsx` 的重复业务推导
- [x] 抽出 `presentation/lobby/hooks/useLobbyRuntimeState.ts`
- [x] 抽出 `presentation/board/hooks/useBoardRuntimeState.ts`
- [x] 抽出 `application/mission/task-board-parser.ts`
- [x] 抽出 `presentation/chat/view-models/messages.ts`
- **Status:** complete

### Phase 8: Board / Chat 应用层收口
- [x] 将 board 的 task lane / task step summary 规则下沉到 `domain/mission/*`
- [x] 建立 `application/mission/board-task-surface.ts`，收走看板任务顺序、lane、handoff/request/SLA 聚合
- [x] 建立 `presentation/board/hooks/useBoardCommunicationSync.ts` 与 `useBoardTaskBackfill.ts`
- [x] 建立 `presentation/board/components/BoardTaskCard.tsx`，移除页面内联 task card 渲染
- [x] 将 `presentation/chat/hooks/useChatActionSurface.ts` 收口为 `application/chat/action-surface.ts` façade
- [x] 将 `presentation/chat/hooks/useChatConversationTruth.ts` 收口为 `application/mission/conversation-truth.ts` façade
- [x] 将 `presentation/chat/hooks/useChatSessionRuntime.ts` 的初始化链收口为 `application/chat/session-runtime.ts`
- [x] 将 requirement overview 的标题/主题与 participant progress 规则下沉到 `domain/mission/requirement-topic.ts` 与 `domain/mission/participant-progress.ts`
- **Status:** complete

### Phase 9: Org 查询与命令收口
- [x] 建立 `src/application/org/directory-query.ts`，接管员工目录 runtime 拉取、运营洞察、组织建议与 employee row 推导
- [x] 建立 `src/application/org/organization-commands.ts`，接管 HR 部门规划提示词、组织修复、部门保存、资料更新等纯业务命令
- [x] 建立 `src/application/org/directory-commands.ts`，接管文件读写、雇佣、调岗、Identity Name 同步、解雇与 HR bootstrap runtime
- [x] 将 `src/presentation/org/EmployeeListPage.tsx` 改成消费 `application/org` façade，而不再直接使用 raw gateway / AgentOps / org policy 细节
- **Status:** complete

### Phase 10: Chat Session Context Recovery
- [x] 建立 `src/application/chat/session-context.ts`，接管 room/session/snapshot/archive/takeover/request/SLA 等会话上下文聚合
- [x] 建立 `src/presentation/chat/hooks/useChatSessionContext.ts` 薄 façade，让页面只消费 session surface
- [x] 将 `src/presentation/chat/Page.tsx` 中的 session history/room members/bootstrapping/task preview/SLA 推导迁到 `application/chat/session-context.ts`
- **Status:** complete

### Phase 11: Chat Page Surface Recovery
- [x] 建立 `src/application/chat/page-state.ts`，接管 session history 可见性、archive notice、company sync cadence、group empty state 等页面状态规则
- [x] 建立 `src/presentation/chat/hooks/useChatPageSurface.ts`，接管 display window / progress summary / watch cards / team cards / empty state surface
- [x] 建立 `src/presentation/chat/hooks/useChatRuntimeEffects.ts`，收口 company sync、action watch sync、session runtime 和 scroll reset 这些 page-level runtime effects
- [x] 将 `src/presentation/chat/Page.tsx` 改成消费 page surface/runtime effect façade，而不再直接拼 history/sync/display/summary 组合逻辑
- **Status:** complete

### Phase 12: Settings / Workspace / Dashboard / CompanyCreate / EmployeeProfile 收口
- [x] 建立 `src/application/gateway/settings.ts`，接管 settings 页的 gateway status/config/models/OAuth/provider/channel/org-autopilot 命令与查询
- [x] 建立 `src/application/workspace/index.ts`，接管 workspace 页的 runtime snapshot、provider file index、artifact mirror、selected file loading
- [x] 建立 `src/application/dashboard/index.ts`，接管 dashboard 页的 usage 轮询、company attribution、insight/outcome/retrospective 读模型
- [x] 建立 `src/application/company/create-company.ts`，接管公司创建向导的 agent 创建、SOUL 注入、配置落盘、自动化复制
- [x] 建立 `src/application/org/employee-profile.ts`，接管员工档案页的 session/cron/model/control 查询与保存命令
- [x] 将 `src/presentation/settings/Page.tsx`、`src/presentation/workspace/Page.tsx`、`src/presentation/dashboard/Page.tsx`、`src/presentation/company-create/Page.tsx`、`src/presentation/org/EmployeeProfilePage.tsx` 改成消费对应 façade
- **Status:** complete

### Phase 13: Lobby / Org Directory / OpenClaw Infra 收口
- [x] 建立 `src/application/lobby/runtime-state.ts`、`src/application/lobby/index.ts`、`src/application/lobby/communication-sync.ts`，把 lobby runtime snapshot、跨域 page surface、请求闭环同步统一收进 `application/lobby`
- [x] 扩展 `src/application/lobby/page-commands.ts`，接管 hire/fire/quick-task/group-chat/knowledge sync/blueprint 和 communication recovery 的命令 façade
- [x] 将 `src/presentation/lobby/Page.tsx` 改成消费 `useLobbyPageViewModel` / `useLobbyPageCommands`，删除 presentation 侧 runtime/communication hooks
- [x] 扩展 `src/application/org/page-commands.ts`，建立 `useOrgDirectoryCommands`，接管 HR bootstrap、组织修复、组织建议、资料更新、部门保存、雇佣/调岗/解雇命令状态
- [x] 将 `src/presentation/org/EmployeeListPage.tsx` 改成消费 `useOrgDirectoryCommands`，不再直接持有 HR 订阅和大串 busy state
- [x] 建立 `src/infrastructure/gateway/openclaw/agent-controls.ts`，抽离 openclaw client 中的 agent config/control 逻辑，使 `client.ts` 只保留 façade
- **Status:** complete

### Phase 14: Runtime Store / OpenClaw Client 再切一刀
- [x] 将 `src/infrastructure/company/runtime/store.ts` 中的 conversation/room/mission/work-item/round/artifact/dispatch action builder 下沉到各自 runtime slice 模块
- [x] 将 `src/infrastructure/company/runtime/store.ts` 收口为单纯的 Zustand 容器装配器，不再内联业务写模型更新逻辑
- [x] 建立 `src/infrastructure/gateway/openclaw/agents.ts`、`sessions.ts`、`control-plane.ts`，把 openclaw client 中的 agent/session/chat/config/auth/cron/usage 分面逻辑拆开
- [x] 将 `src/infrastructure/gateway/openclaw/client.ts` 收口为连接 + 事件 + façade 委托层
- **Status:** complete

### Phase 15: Delegation Transcript / Room State 拆分
- [x] 将 `src/application/delegation/room-state.ts` 拆成 `room-routes.ts` 与 `room-records.ts`
- [x] 将 `src/application/delegation/room-transcript.ts` 拆成 `room-transcript-core.ts` 与 `room-transcript-signature.ts`
- [x] 保持 `room-state.ts` 与 `room-transcript.ts` 为薄 façade，原有 import 路径不变
- **Status:** complete

### Phase 16: Chat Mission / Message View Model 拆分
- [x] 将 `src/application/mission/chat-mission-surface.ts` 拆成 `chat-mission-display.ts` + surface façade
- [x] 将 `src/presentation/chat/view-models/messages.ts` 拆成 `message-basics.ts`、`message-tooling.ts`、`message-types.ts`
- [x] 保持 `messages.ts` 为 flow façade，兼容原有导出
- **Status:** complete

### Phase 17: Final Chat / Action Surface 收尾
- [x] 将 `src/application/chat/action-surface.ts` 继续拆到 500 行以内
- [x] 将 `src/presentation/chat/Page.tsx` 收成 page façade / content component，压到 500 行以内
- [x] 完成全量验证并刷新进度文件
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 用 `infrastructure/gateway/*` + `application/gateway` 取代 `features/backend|gateway` | provider runtime 属于基础设施，不再作为 feature 暴露 |
| 用 `application/mission|delegation|assignment|governance` 取代 `features/execution|org` 生产实现 | 避免“目录换了，但旧实现还躺在原地” |
| 保留旧 `features/*` 测试文件，但让它们指向新模块 | 不丢现有回归覆盖，同时清空旧生产入口 |
| runtime snapshot/page snapshot 只允许通过 `application/company/*` 访问 | pages/presentation 不再直连 infra 内部实现 |
| 先以 `CEO` 页做样板，把业务读模型与运行时同步从页面抽出 | 后续按同样模式拆 `lobby / board / chat` |

## Notes
- 生产代码对旧业务 `features/*` 的直接依赖现在只剩横切 UI/审批能力；请求/交接/SLA/洞察/runtime/meta-agent 已全部迁走。
- `src/presentation/ceo/Page.tsx` 已从 687 行降到 435 行。
- `src/presentation/lobby/Page.tsx` 已从 2057 行降到 993 行。
- `src/presentation/board/Page.tsx` 已从 2633 行降到 977 行。
- `src/presentation/org/EmployeeListPage.tsx` 已从 1352 行降到 965 行。
- `src/presentation/org/EmployeeProfilePage.tsx` 已从 798 行降到 457 行，并将 gateway session/cron/model/control 与组织保存命令迁到 `src/application/org/employee-profile.ts`。
- `src/presentation/chat/Page.tsx` 已收成 5 行 façade，重内容迁到 `src/presentation/chat/ChatPageContent.tsx`；session history / room snapshot / takeover / SLA 聚合迁到 `src/application/chat/session-context.ts`，history/sync cadence/empty-state/display summary 进一步迁到 `src/application/chat/page-state.ts` 与 `src/presentation/chat/hooks/useChatPageSurface.ts`。
- `src/application/chat/action-surface.ts` 已降到 458 行，类型与 requirement summary/team route builder 拆到 `src/application/chat/action-surface-types.ts` 与 `src/application/chat/action-surface-sections.ts`。
- `src/application/delegation/room-state.ts` 已降到 20 行 façade，核心逻辑迁到 `src/application/delegation/room-routes.ts` 与 `src/application/delegation/room-records.ts`。
- `src/application/delegation/room-transcript.ts` 已降到 18 行 façade，核心逻辑迁到 `src/application/delegation/room-transcript-core.ts` 与 `src/application/delegation/room-transcript-signature.ts`。
- `src/application/mission/chat-mission-surface.ts` 已降到 360 行；显示/有效 surface 规则迁到 `src/application/mission/chat-mission-display.ts`。
- `src/presentation/chat/view-models/messages.ts` 已降到 274 行；基础归一化与工具摘要迁到 `message-basics.ts`、`message-tooling.ts`。
- `src/presentation/workspace/Page.tsx` 已从 987 行降到 516 行；provider workspace 轮询、runtime snapshot、artifact mirror 与 selected file loading 迁到 `src/application/workspace/index.ts`。
- `src/presentation/dashboard/Page.tsx` 已从 549 行降到 328 行；usage/company attribution/outcome/retrospective 迁到 `src/application/dashboard/index.ts`。
- `src/presentation/company-create/Page.tsx` 已从 585 行降到 233 行；agent 创建、SOUL 注入、配置落盘、班次复制迁到 `src/application/company/create-company.ts`。
- `src/presentation/settings/Page.tsx` 已接到 `src/application/gateway/settings.ts`，不再直接处理 gateway raw config / OAuth / provider patch / telegram patch / org autopilot 命令。
- `src/presentation/chat/hooks/useChatActionSurface.ts` 已从 844 行降到 9 行；业务装配迁到 `src/application/chat/action-surface.ts`。
- `src/presentation/chat/hooks/useChatSessionRuntime.ts` 已从 475 行降到 369 行；初始化链迁到 `src/application/chat/session-runtime.ts`。
- `src/presentation/chat/hooks/useChatConversationTruth.ts` 已从 390 行降到 380 行；mission/work-item/room 真相推导迁到 `src/application/mission/conversation-truth.ts`。
- `src/presentation/chat/hooks/useChatRuntimeEffects.ts` 现在负责 page 级 company sync / action watch sync / session runtime orchestration，`Page.tsx` 不再直接内联这些 runtime effects。
- `src/application/mission/requirement-overview.ts` 已从 1623 行降到 856 行，并把 snapshot/session lookup/tracked delegation 规则继续拆到 `domain/mission/*` 和 `application/mission/tracked-delegation-overview.ts`。
- `src/presentation/lobby/Page.tsx` 已改成通过 `application/lobby/page-commands.ts` 调用 hire/fire/quick-task/group-chat/blueprint/knowledge sync，不再在页面里直接编排这些命令。
- `src/presentation/lobby/Page.tsx` 现在通过 `application/lobby/index.ts` 统一消费 `useLobbyPageViewModel` / `useLobbyPageCommands`，并把 communication recovery 也收进 `application/lobby/communication-sync.ts`。
- `src/presentation/org/EmployeeListPage.tsx` 现在通过 `application/org/page-commands.ts` 的 `useOrgDirectoryCommands` 调用 HR 建部门、组织修复、组织建议、资料更新、部门保存与解雇命令，不再直接持有 HR runtime 订阅和成组 busy state。
- `src/infrastructure/company/runtime/store.ts` 已从 757 行降到 41 行；room/mission/work-item/round/artifact/dispatch/conversation action builder 分别迁到对应 runtime slice 模块。
- `src/infrastructure/gateway/openclaw/client.ts` 已从 1067 行降到 430 行；agent/session/chat/config/auth/cron/usage 逻辑分别迁到 `src/infrastructure/gateway/openclaw/agent-controls.ts`、`agents.ts`、`sessions.ts`、`control-plane.ts`。
- 旧业务 `features/*` 生产入口已清空；剩余 `features/*` 引用只保留横切 UI/审批能力。
- `src/application/org` 现在补齐了目录查询、组织命令和 HR runtime 命令层，`presentation/org` 不再直接触达 raw gateway/agent 操作。
