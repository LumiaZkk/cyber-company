# Archived DDD Refactor Log

> Archived on 2026-03-10. 这份文档描述的是 DDD 收口完成时的阶段性结果。当前代码结构请以 `docs/engineering-onboarding.md` 为准。

本次重构已经完成，当前前端结构从“页面直接驱动业务 + mega store + feature 混层”收敛到了更明确的分层模型。

## Completed
- [x] 建立 `domain / application / infrastructure` 新层次
- [x] 抽出 delegation 事件语义、投影和闭环同步
- [x] 新增 `domain` 上下文类型模块：
  - [x] `org`
  - [x] `mission`
  - [x] `delegation`
  - [x] `artifact`
  - [x] `governance`
  - [x] `shared/event-envelope`
- [x] 将原 `features/company/types.ts` 改为兼容导出层，不再承载全量模型定义
- [x] 将原 mega store 下沉为 `src/features/company/runtime-store.ts`
- [x] 删除旧 `src/features/company/store.ts` 业务入口
- [x] 新建 application hooks：
  - [x] `useCompanyShellQuery / useCompanyShellCommands`
  - [x] `useOrgQuery / useOrgApp`
  - [x] `useMissionBoardQuery / useMissionBoardApp`
  - [x] `useConversationWorkspaceQuery / useConversationWorkspaceApp`
  - [x] `useWorkspaceArtifactsQuery / useArtifactApp`
  - [x] `useCeoCockpitQuery / useExceptionInboxQuery / useGovernanceApp`
- [x] 页面层迁移完成：
  - [x] `App`
  - [x] `AutomationPage`
  - [x] `BoardPage`
  - [x] `CEOHomePage`
  - [x] `ChatPage`
  - [x] `CompanyCreate`
  - [x] `CompanyLobby`
  - [x] `CompanySelect`
  - [x] `DashboardPage`
  - [x] `EmployeeList`
  - [x] `EmployeeProfile`
  - [x] `SettingsPage`
  - [x] `WorkspacePage`
  - [x] `HrDepartmentPlanCard`
  - [x] `OrgAutopilot`
- [x] 页面不再直接通过 `useCompanyStore` 读写业务 mutation
- [x] 删除 compatibility shells：
  - [x] `src/features/company/events.ts`
  - [x] `src/features/company/sync-company-communication.ts`
  - [x] `src/features/company/store.ts`
- [x] 修复并通过全量测试

## Resulting Structure
- `src/domain/*`
  - 纯类型、事件语义、领域对象
- `src/application/*`
  - 页面统一 command/query façade
- `src/infrastructure/*`
  - gateway / event-log 等基础设施适配
- `src/features/company/runtime-store.ts`
  - 作为过渡期产品运行态存储，供 application hooks 消费

## Verification
- [x] `pnpm exec tsc -p tsconfig.app.json --noEmit`
- [x] `npm test`

## Follow-up
- 可以继续做的优化还有很多，但不再属于这次“剩余重构必须完成”的范围，例如继续拆小 `ChatPage.tsx`、把更多 execution 规则下沉到更细粒度的 domain 模块。
