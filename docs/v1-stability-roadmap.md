# V1 稳定性节奏路线图

Status: In Progress  
Last updated: 2026-03-13  
Related docs:

- `docs/paperclip-borrowing-tracker.md`
- `docs/cyber-company-evolution-direction.md`

## 1. 目标

V1 的目标不是一次性做完整平台化改造，而是按单人串行节奏，把 `cyber-company` 当前最容易失控的几个点先收紧：

- 先看清 Gateway / Authority / Executor / Runtime 四层状态
- 再把核心主线写入从整份 runtime 回灌中抽出来
- 再逐步把关键对象从运行态投影收口成更稳定的权威对象

V1 覆盖这些借鉴项：

- `PC-STATE-01`
- `PC-STATE-02`
- `PC-STATE-03`
- `PC-OPS-01`
- `PC-OPS-02`
- `PC-OPS-03`
- `PC-OPS-04`

V1 不覆盖这些方向：

- 多 runtime 平台化
- 多用户权限模型
- issue-first 产品改造
- V2 的 approval / budget / heartbeat run 正式落地

## 2. 阶段计划

| Phase | 目标 | 借鉴项 | 当前状态 |
|---|---|---|---|
| Phase 1 | 先看清问题，再建立升级基线 | `PC-OPS-01`, `PC-OPS-02` | `stabilizing` |
| Phase 2 | 收紧写入边界，停止整份 runtime 回灌 | `PC-STATE-02` | `stabilizing` |
| Phase 3 | 把关键对象从运行态投影收口成稳态对象 | `PC-STATE-01`, `PC-STATE-03` | `stabilizing` |
| Phase 4 | 补齐 Authority 运维闭环 | `PC-OPS-01`, `PC-OPS-02`, `PC-OPS-03`, `PC-OPS-04` | `active` |

## 2.1 当前唯一施工切片

从当前版本开始，Phase 状态拆成两层：

- `active`
  表示当前唯一施工切片所在阶段。
- `stabilizing`
  表示主实现已落，但还没达到关闭标准，当前处于收尾与验证阶段。

当前的执行约束是：

- 同时只允许一个 `active`
  这表示“当前真正正在施工的主线”。
- 允许多个 `stabilizing`
  这表示“这些阶段已经做出主要成果，但还没关单”。
- 实施层面只保留一个当前唯一施工切片
  这样可以避免单人串行推进时的上下文切换和半完成状态堆积。

截至 2026-03-13，当前唯一施工切片是：

- `Phase 4 / Slice D-1`
  内容：先把 authority 的本地体检和备份恢复做成真实可用的 operator tooling，而不是只留在设置页说明和底层实现里。
  当前进度：已新增 `authority:doctor / authority:backup / authority:backups / authority:migrate / authority:restore / authority:preflight` CLI。`authority:doctor` 会直接读取本地 authority SQLite，输出 `schema version / db path / db size / backup dir / backup count / latest backup / companies / runtimes / events / active company / executor state / latest runtime / latest event`；`authority:backup` 会在 checkpoint 后复制当前 SQLite，并开始支持最小 retention；`authority:backups` 会列出当前备份清单；`authority:migrate` 已作为第一版显式 migration 入口，用来给老库回填 `schemaVersion` metadata；`authority:restore` 除了支持 `--from` 之外，也已经支持 `--latest`、`--plan`、`--force`、`--allow-safety-backup`，可以在真正覆盖前先输出 restore plan，并默认阻止“直接恢复 pre-restore safety backup”以及“用更旧备份覆盖更新的 authority.sqlite”；现在 restore plan 还会检查 `schemaVersion`，默认阻止恢复来自更高 schema 版本的备份，并对 legacy / 旧 schema 备份给出显式 warning；authority server 启动时也会开始写入 `schemaVersion` metadata，给后续 migration 留出稳定基线；`authority:preflight` 已不再只是 ready/blocked 二元检查，而是会在“数据库已存在但缺 schemaVersion metadata”、“数据库已存在但还没有标准备份”或“标准备份过旧”时返回 `degraded`，并在 `npm run dev` 与 `npm run authority:start` 里开始实际运行。现在这些结论已经回推到 Settings Doctor 和 Connect 探测卡片里，页面也能直接看到 `schema version`、backup inventory、doctor / preflight 状态和最小修复提示。当前下一步是继续补更正式的 migration / restore 闭环。

当前不是主施工焦点、但仍保持开放的 `stabilizing` 阶段：

- `Phase 1`
  原因：Doctor 基线已落，但启动体检、异常分型、修复建议闭环还没完全收口。
- `Phase 2`
  原因：主链 command 已落，但 `/runtime` 兼容路径还没完全退居恢复通道。
- `Phase 3`
  原因：关键对象稳态化和 operator audit 已经做了大半，但 audit 规则还没完全收口成关闭状态。

## 2.2 关闭标准

V1 的阶段不允许长期停留在 `stabilizing`。

从当前版本开始，阶段关闭规则固定为：

1. 当前阶段的主目标已经完成
2. 当前阶段对应的关键验证已经跑通
3. 文档里的“当前已落地切片”和“剩余项”已经同步
4. 剩余工作如果已经明显属于下一轮，必须拆到新的切片，而不是继续把当前阶段挂着

执行约束：

- 同时只保留一个 `active`
- `stabilizing` 只允许作为短暂收尾态存在
- 如果某个 `stabilizing` 阶段在后续 1 个当前施工切片里没有被继续推进或拆分，就应该优先整理并推动关单

## 3. 当前已落地的切片

### 2026-03-13

本轮不是把 V1 全部做完，而是先把“可见的诊断基线”和“第一条 command 写入链路”落进去。

已完成：

- 设置页新增一版 V1 Doctor 基线面板
- 明确展示 `Gateway / Authority / Executor / Runtime` 四层状态
- 固定回归检查清单已经进入产品界面，后续每个阶段都沿用同一套清单
- runtime sync 已开始记录 push / pull / command 路径与最近错误
- `requirement.transition`、`requirement.promote`、`room.append`、`room.delete`、`room-bindings.upsert`、`dispatch.create`、`dispatch.delete`、`artifact.upsert`、`artifact.sync-mirror`、`artifact.delete` 已开始走 authority command 写入
- chat 主链路里的 room / dispatch 更新，不再默认先本地改再整份 `/runtime` 回灌
- room binding 的合并键已统一为 `roomId + providerId + conversationId + actorId`，避免 authority 与前端按不同身份规则覆盖
- Sidebar 已重排为 `主线 / 执行 / 组织 / 系统` 四组，需求中心被显式提升为主中枢
- Header 里的误导性 `ThemeSwitcher` 已被主线快切替换，只保留 `CEO 首页 / 需求中心`
- `BoardRequirementCard` 与 `LobbyRequirementCard` 已合并为共享 `RequirementSummaryCard`
- `Connect` 与 `Settings Doctor` 已共享 `ConnectionDiagnosisSummary`
- `CEO 首页` 与 `运营报表` 已共享 `ExecutiveSummaryStrip`
- `Requirement Center` 与 `Board` 已切到中性 `requirement-execution-projection`，不再由需求中心直接依赖 board 命名的 builder
- 已补 `docs/v1-phase3-authority-object-boundaries.md`，把 `RequirementAggregate / RequirementRoom / Dispatch / Artifact / DecisionTicket` 的字段分层、revision 和 command 边界写成正式设计稿
- `RequirementRoom / Dispatch / Artifact / DecisionTicket` 已补 revision baseline，authority snapshot / runtime normalizer / persistence / authority-backed 测试都已跟上
- `DecisionTicket` 已开始走 `decision.upsert` / `decision.delete` authority command，不再只靠本地 `upsertDecisionTicketRecord` 改状态
- `Requirement Center` 与 `Chat` 里的决策动作已经改走显式 `decision.resolve`，不再把“做决定”混成 generic upsert
- `Authority loadRuntime()` 不再在主读路径里自动 `saveRuntime()`；repair 改成显式 `repairRuntimeIfNeeded()`，并在启动时统一执行一次
- `decision.resolve / decision.cancel` 已开始写入 authority company event log，记录 `ticketId / decisionType / status / resolution / resolutionOptionId / revision`
- `decision.upsert / delete` 已开始写入 `decision_record_upserted / decision_record_deleted`
- `dispatch.create / delete` 已开始写入 `dispatch_record_upserted / dispatch_record_deleted`
- `room.append / delete` 已开始写入 `room_record_upserted / room_record_deleted`
- `room-bindings.upsert` 已开始写入 `room_bindings_upserted`
- `artifact.upsert / delete / sync-mirror` 已开始写入 `artifact_record_upserted / artifact_record_deleted / artifact_mirror_synced`
- 显式 `repairRuntimeIfNeeded()` 已开始写入 `runtime_repaired`
- `companyOpsEngine` 已开始为自治引擎生成或收走的 `support request / escalation / decision` 写入 `ops_cycle_applied`、对应的 `*_record_upserted`，以及 `support_request_record_deleted / escalation_record_deleted / decision_record_deleted`
- `requirement_*` workflow event 的 payload 已开始带 `source / changedFields / previousAggregateId / previousOwner* / previousRoomId / previousRevision`
- 已新增 `authority:doctor` CLI，可直接体检本地 authority SQLite 的公司数、runtime 数、event 数、active company 和 executor state
- 已新增 `authority:backup` CLI，可直接生成本地 authority SQLite 备份文件，并支持最小 retention
- 已新增 `authority:backups` CLI，可直接列出当前备份清单
- 已新增 `authority:restore` CLI，可从备份文件恢复 authority SQLite，并自动留下 `pre-restore` safety backup
- `authority:restore` 已支持 `--latest`，恢复时不再需要先手工找备份路径
- `authority:restore` 已支持 `--plan / --force / --allow-safety-backup`，恢复前会默认阻止高风险回滚
- authority 已开始写入 `schemaVersion` metadata，doctor / preflight / restore plan 也开始显式显示 schema version
- 已新增 `authority:migrate` CLI，开始显式回填老库缺失的 `schemaVersion` metadata
- restore plan 已开始阻止恢复来自更高 schema 版本的备份，并对 legacy / 旧 schema 备份给出提示
- 已新增 `authority:preflight` CLI，可在启动前检查 authority data dir / backup dir / db path
- `authority:preflight` 已开始区分 `ready / degraded / blocked`，会把“已有数据库但缺 schema metadata”、“已有数据库但没备份”或“备份太旧”标成真实风险
- `npm run dev` 与 `npm run authority:start` 已开始在启动 authority 前执行 `authority:preflight`
- Settings Doctor 已开始直接显示 authority schema version、backup inventory、company/runtime/event 计数和 preflight 结果
- Connect 已开始在失败前后探测 Authority `/health`，并显示控制面可达性、schema version、备份状态和最小修复提示

仍然保留：

- `/runtime` 兼容同步路径仍开启
- Authority Doctor 仍然是“设置页基线版”，还不是完整的修复工具
- backup / restore 已经具备最小可用路径，retention、restore guardrail 和 schema/version 基线也已有第一版，但还没有更正式的 migration / restore 闭环
- startup preflight 已经能识别备份缺失/过旧，但还没有自动 remediation 或更强的恢复保护
- Settings / Connect 已经能看见 authority operator tooling 的关键结论，但还没有直接在页面里触发 backup / restore
- `Board` 与 `Ops` 虽然已经开始分层，但更深的共享摘要模块和更彻底的页面裁剪还可以继续收口

## 4. 阶段出口

### Phase 1

- 能回答“现在坏的是 Gateway、Authority、Executor 还是 Runtime”
- 有固定验证清单，而不是每次临时凭感觉排查
- `PC-OPS-01`、`PC-OPS-02` 已从纯文档规划进入实现阶段

### Phase 2

- 至少一条核心主线写入不再依赖 `/runtime` 回灌
- Authority 单写者方向在代码和文档里都明确
- `/runtime` 被降级为兼容路径，而不是唯一主写入路径

### Phase 3

- `RequirementAggregate` 的权威字段和派生字段写清楚
- `Dispatch` / `DecisionTicket` / `Artifact` / `RequirementRoom` 的边界更稳定
- Phase 3 设计稿、Slice A-1 和 Slice A-2 的第一批命令已落地，主读路径的 read-repair 也已经拆出，第一批 decision / dispatch / room / binding / artifact / repair / company-ops 审计事件也开始进入 company event log，而且 `companyOpsEngine` 已开始补齐 `support request / escalation / decision` 的 upsert/delete 生命周期；`requirement_*` workflow event 也开始自带更完整的推进上下文。下一步主要是 audit 规则继续扩面

### Phase 4

- 启动、诊断、备份、恢复的基本链路可用
- Authority 不再只是“能启动”，而是“出问题也知道怎么查”

## 5. 固定验证清单

- 单 tab 正常推进一条 requirement
- 刷新后主线不漂移
- 断连重连后状态不回退
- 晚到 control message 不会把主线改乱
- authority / gateway / executor 任一层异常时，诊断信息能区分问题来源

## 6. 当前效果判断

这次改动的主要效果不是“功能变多”，而是让稳定性改造第一次可见、可追踪：

- 产品里已经能直接看到四层状态，而不是只看一个模糊的“连上/没连上”
- 主线 requirement / room / room binding / dispatch / artifact 已经形成一组更完整的 authority command 写入样板
- `primary requirement` 切换、房间删除、派单删除和产物同步这些最容易漂移的操作，已经从本地写入迁到 authority
- 菜单层级开始和对象边界对齐，用户更容易理解“去哪里看主线、去哪里看异常、去哪里看交付、去哪里看历史报表”
- 重复表达的模块开始收敛，共享组件减少了 `Board / Ops / Connect / Settings / CEO / Dashboard` 之间的话术漂移
- 后续每一轮架构升级，都可以继续在这份路线图里增量回填阶段状态和验证结果

## 6.1 下一轮具体动作

如果下一轮继续沿着 `paperclip` 借鉴线推进，优先级建议固定为：

1. `PC-STATE-01` + `PC-STATE-03`
   先把 `RequirementAggregate / Dispatch / RequirementRoom / Artifact / DecisionTicket` 的对象边界写实：
   - 哪些字段是权威字段
   - 哪些字段允许派生
   - revision 怎么变化
   - 哪些写入必须经过 authority command
2. `PC-OPS-03`
   补最小可用的 authority backup / restore 路径，先让“坏了怎么回”有一条硬路径。
3. `PC-OPS-04`
   补 run 前检查和启动前提示，先解决“看起来启动了，其实不可用”的灰状态。

在这三个动作都没落地前，不建议把精力切去：

- V2 的 approval / budget / heartbeat run 正式实现
- 多 adapter 抽象
- 多用户治理

原因很简单：

- `paperclip` 值得继续借的下一层，是稳态对象和 operator tooling。
- 当前项目还不缺更多平台对象，当前更缺“主线真相更稳、authority 出问题时更好修”。

## 7. 界面收口约束

V1 不只要做状态稳定性，也要避免“同一条主线在多个页面被不同语义重复表达”。

当前最明显的重复风险：

- `Requirement Center` 直接复用 `Board` 命名的 runtime hook 和 surface builder
- `Board` 与 `Ops` 都在展示请求闭环、SLA、接管提醒
- `CEO 首页` 与 `Dashboard` 都在展示结果/复盘摘要
- `Requirement Center` 与 `Workspace` 都在展示交付物，只是一个摘要、一个完整视图
- `Connect` 与 `Settings Doctor` 都在解释连接与诊断，只是一个面向首次接入、一个面向日常运维

页面职责矩阵：

| 页面 | 应该负责 | 不应该继续扩张到 |
|---|---|---|
| CEO 首页 | 发起目标、升级项、拍板入口、最近关键动态 | 任务顺序、完整报表、完整异常队列 |
| CEO 深聊 | 澄清、收敛、形成主线 | 交付物主视图、完整 Ops 细节 |
| 需求中心 | 当前主线真相、协作摘要、交付摘要、验收动作、Ops 跳转 | 第二套 Board、第二套 Ops、完整 Workspace |
| Board | 当前主线的任务顺序、执行拓扑、需求房入口 | 验收闭环、完整异常运营大厅 |
| Ops | 异常、超时、接管、请求闭环、恢复动作 | 主线叙事、验收决策、交付主入口 |
| Workspace | 完整交付物、文件内容、知识与工具工作台 | 立项、派单、主线 owner/stage 决策 |
| Dashboard | 历史指标、成本、稳定性、复盘 | 当前下一步、当前负责人、实时恢复入口 |
| Connect | 首次连接、失败分型、启动前指导 | 日常运维诊断总面板 |
| Settings | 稳态诊断、执行器配置、Provider 配置 | 首次接入主流程 |

本轮分析后，建议纳入 V1 规划的收口动作：

1. 把 `Requirement Center` 里的 `Board` 语义依赖抽成中性主线模块，避免主线页面继续建立在 `Board` 命名之上。
2. 把 `Board` 和 `Ops` 的异常表达强制分层：
   `Board` 只显示“影响当前执行顺序的异常”，`Ops` 显示“完整异常与恢复队列”。
3. 把 `CEO 首页` 上的 `outcome / retrospective` 固定为轻量摘要，不再继续扩成报表页。
4. 把 `Requirement Center` 的交付区固定为摘要卡，不再增加完整文件浏览或工具操作。
5. 把 `Connect` 与 `Settings Doctor` 的职责固定下来：
   `Connect` 管“怎么连上”，`Settings Doctor` 管“连上以后哪里坏了”。

这部分不单独开新版本，但作为 V1 的长期约束持续生效。后续新增页面卡片或面板时，先对照这张矩阵，避免把同一对象再次做成双重真相。
