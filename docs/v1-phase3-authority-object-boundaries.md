Status: In Progress
Last updated: 2026-03-13
Related docs:

- `docs/v1-stability-roadmap.md`
- `docs/paperclip-borrowing-tracker.md`
- `docs/cyber-company-evolution-direction.md`

## 1. 目的

这份文档对应 V1 Phase 3，直接承接这两个借鉴项：

- `PC-STATE-01`
- `PC-STATE-03`

目标不是再抽象一层名词，而是把当前代码里已经存在的关键对象收成更稳定的 authority-owned 语义：

- `RequirementAggregate`
- `RequirementRoom`
- `Dispatch`
- `Artifact`
- `DecisionTicket`

Phase 2 已经把主链 mutation 收进 authority command。Phase 3 要解决的是下一层问题：

- 哪些字段是真正的权威字段
- 哪些字段只是 reconciled projection
- 哪些字段根本不该写进对象，只该在页面上临时投影
- 哪些对象需要 revision
- 哪些对象还缺独立 command

## 1.1 当前切片进度

`Phase 3 / Slice A` 目前拆成两刀：

- `Slice A-1`
  已完成。内容包括：
  - `RequirementRoom / Dispatch / Artifact / DecisionTicket` 补齐 revision baseline
  - authority snapshot、runtime normalizer、persistence、authority-backed tests 已同步 revision 语义
  - `DecisionTicket` 已开始走 `decision.upsert / decision.delete` authority command，而不是只靠本地 store 改状态
- `Slice A-2`
  已启动。当前已完成：
  - `DecisionTicket` 的显式 `resolve / cancel` 命令语义已经落地
  - Requirement Center / Chat 的决策动作已切到显式命令
  - `loadRuntime()` 已不再承担“读一下顺手保存”的职责；repair 改成显式 `repairRuntimeIfNeeded()`
  - `decision.upsert / delete / resolve / cancel` 已开始写入 authority company event log，形成第一批决策 lifecycle audit 记录
  - `dispatch.create / delete` 已开始写入 `dispatch_record_upserted / dispatch_record_deleted`
  - `room.append / delete` 已开始写入 `room_record_upserted / room_record_deleted`
  - `room-bindings.upsert` 已开始写入 `room_bindings_upserted`
  - `artifact.upsert / delete / sync-mirror` 已开始写入 `artifact_record_upserted / artifact_record_deleted / artifact_mirror_synced`
  - 显式 `repairRuntimeIfNeeded()` 已开始写入 `runtime_repaired`
  - `companyOpsEngine` 已开始为自治引擎生成或收走的 `support request / escalation / decision` 写入 `ops_cycle_applied`、对应的 `*_record_upserted` 和 `*_record_deleted`
  剩余内容：
  - 把 authority repair / audit 规则写成更清晰的 operator-level 约束

## 2. 当前代码基线

从当前代码看，authority runtime snapshot 已经把关键对象列成独立 slices：

- `activeRequirementAggregates`
- `activeRoomRecords`
- `activeDispatches`
- `activeArtifacts`
- `activeDecisionTickets`

对应入口主要在：

- `src/infrastructure/authority/contract.ts`
- `src/domain/mission/types.ts`
- `src/domain/delegation/types.ts`
- `src/domain/artifact/types.ts`
- `packages/authority-daemon/src/server.ts`

当前已经存在的 authority command：

- `requirement.transition`
- `requirement.promote`
- `room.append`
- `room.delete`
- `room-bindings.upsert`
- `dispatch.create`
- `dispatch.delete`
- `artifact.upsert`
- `artifact.sync-mirror`
- `artifact.delete`
- `decision.upsert`
- `decision.delete`
- `decision.resolve`
- `decision.cancel`

`DecisionTicket` 现在主要由两条 authority 内部路径派生生成：

- `packages/authority-daemon/src/requirement-control-runtime.ts`
- `packages/authority-daemon/src/company-ops-engine.ts`

这意味着当前系统已经完成了“先把主链写入收进 authority”，但还没完成“把关键对象语义收成稳态对象”。

## 3. Phase 3 的边界模型

从这一阶段开始，每个关键对象都按 3 层字段来理解：

### 3.1 Stable identity / relation fields

这部分字段定义对象是谁、跟谁关联、由谁拥有。它们应该：

- 只通过 authority command 或 authority repair job 改写
- 不能被页面局部投影随意覆盖
- 是 revision 判断的核心输入

### 3.2 Reconciled state fields

这部分字段描述 authority 根据 evidence、control signal、work item、room transcript 归并后的当前状态。它们应该：

- 由 authority 在写入后或显式 reconcile 时更新
- 持久化保存
- 允许被 authority 重新 materialize
- 不允许页面本地直接持久化

### 3.3 Presentation-only fields

这部分字段只该存在于页面投影层，不该再反向写回权威对象。它们应该：

- 在 `Requirement Center / Board / Ops / Workspace / CEO` 等页面按视图生成
- 不参与 revision
- 不作为 authority payload table 的事实来源

## 4. 对象边界设计

### 4.1 `RequirementAggregate`

当前现状：

- 已有 `revision`
- 已有 `requirement.transition`、`requirement.promote`
- 当前大量字段仍由 `requirement-aggregate.ts` 从 work item / room / draft / evidence 派生

稳定字段：

- `id`
- `companyId`
- `topicKey`
- `kind`
- `primary`
- `workItemId`
- `roomId`
- `ownerActorId`
- `sourceConversationId`
- `startedAt`
- `revision`

reconciled state 字段：

- `ownerLabel`
- `lifecyclePhase`
- `stageGateStatus`
- `stage`
- `summary`
- `nextAction`
- `memberIds`
- `updatedAt`
- `lastEvidenceAt`
- `status`
- `acceptanceStatus`
- `acceptanceNote`

presentation-only：

- requirement surface 上的 CTA、文案摘要、风险条、协作 strip
- 不再把任何 board-specific surface 字段倒写回 aggregate

revision 规则：

- 继续沿用当前“material change 才递增”的思路
- Phase 3 起把下面这些字段变化明确视为 material change：
  - `topicKey`
  - `kind`
  - `workItemId`
  - `roomId`
  - `ownerActorId`
  - `lifecyclePhase`
  - `stageGateStatus`
  - `stage`
  - `summary`
  - `nextAction`
  - `memberIds`
  - `status`
  - `acceptanceStatus`
  - `acceptanceNote`

允许的写入路径：

- `requirement.transition`
- `requirement.promote`
- authority reconcile after evidence/work item/room changes

不允许的写入路径：

- 页面直接 patch aggregate payload
- `/runtime` 兼容回灌覆盖 aggregate 权威字段

### 4.2 `RequirementRoom`

当前现状：

- 已有 `room.append`、`room.delete`、`room-bindings.upsert`
- transcript 和 provider refs 仍然偏 runtime-reconciled
- 还没有 `revision`

稳定字段：

- `id`
- `companyId`
- `workItemId`
- `sessionKey`
- `topicKey`
- `scope`
- `memberIds`
- `memberActorIds`
- `ownerActorId`
- `ownerAgentId`
- `batonActorId`
- `createdAt`

reconciled state 字段：

- `title`
- `headline`
- `status`
- `progress`
- `providerConversationRefs`
- `transcript`
- `lastConclusionAt`
- `lastSourceSyncAt`
- `updatedAt`

presentation-only：

- 聊天气泡排序
- 群组折叠
- room 内可见提示语

revision 规则：

- Phase 3 新增 `revision`
- transcript/material membership/provider ref/status 变化都应递增

允许的写入路径：

- `room.append`
- `room.delete`
- `room-bindings.upsert`
- authority transcript sync / room repair

### 4.3 `Dispatch`

当前现状：

- 已有 `dispatch.create`、`dispatch.delete`
- dispatch 与 work item link 已在 authority 侧补账
- 还没有 `revision`

稳定字段：

- `id`
- `workItemId`
- `roomId`
- `fromActorId`
- `targetActorIds`
- `sourceMessageId`
- `topicKey`
- `createdAt`

reconciled state 字段：

- `title`
- `summary`
- `status`
- `deliveryState`
- `responseMessageId`
- `providerRunId`
- `latestEventId`
- `consumedAt`
- `consumerSessionKey`
- `syncSource`
- `updatedAt`

presentation-only：

- board 上的分组标签
- ops 上的 CTA 文案

revision 规则：

- Phase 3 新增 `revision`
- 任何 `status / deliveryState / response linkage / consumer linkage` 变化都递增

允许的写入路径：

- `dispatch.create`
- `dispatch.delete`
- authority event reconciliation

### 4.4 `Artifact`

当前现状：

- 已有 `artifact.upsert`、`artifact.sync-mirror`、`artifact.delete`
- artifact 与 work item link 已在 authority 侧补账
- 还没有 `revision`

稳定字段：

- `id`
- `workItemId`
- `kind`
- `providerId`
- `sourceActorId`
- `sourcePath`
- `sourceUrl`
- `createdAt`

reconciled state 字段：

- `title`
- `status`
- `ownerActorId`
- `sourceName`
- `summary`
- `content`
- `updatedAt`

presentation-only：

- workspace 中的卡片样式
- requirement center 的摘要截断

revision 规则：

- Phase 3 新增 `revision`
- `status / summary / content / source mapping` 变化都递增

允许的写入路径：

- `artifact.upsert`
- `artifact.sync-mirror`
- `artifact.delete`

### 4.5 `DecisionTicket`

当前现状：

- 对象已经在 runtime 中持久化
- 但没有独立 authority command
- requirement ticket 与 org/load ticket 目前都主要由 authority 内部 reconcile 生成

稳定字段：

- `id`
- `companyId`
- `sourceType`
- `sourceId`
- `escalationId`
- `aggregateId`
- `workItemId`
- `sourceConversationId`
- `decisionOwnerActorId`
- `decisionType`
- `roomId`
- `createdAt`

reconciled state 字段：

- `summary`
- `options`
- `requiresHuman`
- `status`
- `resolution`
- `resolutionOptionId`
- `updatedAt`

presentation-only：

- CEO 首页上的行动卡排序
- 聊天消息里的 decision card 锚定样式

revision 规则：

- Phase 3 新增 `revision`
- `status / resolution / options / summary / owner` 变化都递增

允许的写入路径：

- authority internal reconcile 生成 open / pending_human ticket
- 新增 `decision.resolve`
- 新增 `decision.cancel`

Phase 3 判断：

- `DecisionTicket` 允许继续由 authority 引擎派生生成
- 但“人类做出决策”不应再只是页面局部状态或消息副作用，必须进入显式 authority command

## 5. Phase 3 需要的最小类型升级

最小升级，不追求一次性平台化。

### 5.1 新增 `revision`

建议新增到：

- `RequirementRoomRecord`
- `DispatchRecord`
- `ArtifactRecord`
- `DecisionTicketRecord`

`RequirementAggregateRecord` 已有 `revision`，Phase 3 只需要把它真正变成写入边界的一部分。

### 5.2 不新增 generic patch API

Phase 3 不引入：

- `authority.runtime.patch`
- `authority.object.patch`
- 浏览器任意字段覆盖 authority payload

继续坚持 narrow command：

- `requirement.*`
- `room.*`
- `dispatch.*`
- `artifact.*`
- `decision.*`

## 6. 读路径与 repair 规则

Phase 3 要求：

- 读路径尽量纯读
- normalize 可以保留
- repair 必须显式化

具体约束：

- `loadRuntime()` 不再承担“读一下顺手保存”的长期职责
- repair 只允许出现在：
  - authority 启动体检
  - 显式 repair / migrate / restore
  - authority command 写入后的 reconcile

这条规则的目标很明确：

- 让用户看到的状态变化来自“明确写入”或“明确 repair”
- 而不是来自“某个页面刚好读了一次”

## 7. Phase 3 交付顺序

### Slice A

- 固定 5 类对象的字段分层
- 为 4 个尚无 `revision` 的对象补类型和持久化准备

### Slice B

- 把 `DecisionTicket` 纳入显式 command
- 至少补：
  - `decision.resolve`
  - `decision.cancel`

### Slice C

- 收紧 read-repair 边界
- 把日常 repair 从读路径迁到显式入口

### Slice D

- 为关键决策动作补第一批 company event audit
- 先覆盖：
  - `decision.upsert`
  - `decision.delete`
  - `decision.resolve`
  - `decision.cancel`
  - `dispatch.create`
  - `dispatch.delete`
  - `room.append`
  - `room.delete`
  - `room-bindings.upsert`
  - `artifact.upsert`
  - `artifact.delete`
  - `artifact.sync-mirror`
  - `runtime repair`
- `companyOpsEngine` 自动生成或收走的 `support request / escalation / decision`
- `requirement_*` workflow event payload 要补上：
  - `source`
  - `changedFields`
  - `previousAggregateId`
  - `previousOwnerActorId / previousOwnerLabel`
  - `previousRoomId`
  - `previousRevision`
- 显式 operator action 先补：
  - `operator_action_recorded`
  - 第一批覆盖 `communication_recovery`
  - surface 至少覆盖 `chat / board / requirement_center / lobby`
  - 第二批覆盖 chat `focus action` 的显式人工催办/重派/继续推进、chat `takeover pack` 复制、chat `打开需求团队房间`，以及运营大厅 `blueprint copy / knowledge sync / group chat / quick task / hire / role update / fire`

## 8. 验收标准

- `RequirementAggregate` 的 revision 真正能代表主线 material change
- `RequirementRoom / Dispatch / Artifact / DecisionTicket` 具备 revision，不再只靠 `updatedAt`
- 人类对 decision ticket 的处理经过 authority command，而不是页面局部状态
- 页面投影字段不再反向写回 authority 关键对象
- `/runtime` 兼容路径继续保留，但不再承接这些对象的日常 mutation

## 9. 明确不做

Phase 3 不做这些事情：

- 不把 requirement 主线改成 issue-first
- 不把 work item 全量升格成另一套前台真相
- 不在这一阶段引入多 adapter 平台化
- 不在这一阶段引入完整多用户权限模型

这份设计的目标只有一个：

先把当前产品最关键的 authority-owned 对象收成稳态对象，再继续借 `paperclip` 的治理和 operator tooling。
