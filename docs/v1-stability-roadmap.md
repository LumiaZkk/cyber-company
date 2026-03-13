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
| Phase 1 | 先看清问题，再建立升级基线 | `PC-OPS-01`, `PC-OPS-02` | `complete` |
| Phase 2 | 收紧写入边界，停止整份 runtime 回灌 | `PC-STATE-02` | `complete` |
| Phase 3 | 把关键对象从运行态投影收口成稳态对象 | `PC-STATE-01`, `PC-STATE-03` | `complete` |
| Phase 4 | 补齐 Authority 运维闭环 | `PC-OPS-01`, `PC-OPS-02`, `PC-OPS-03`, `PC-OPS-04` | `complete` |

## 2.1 当前唯一施工切片

从当前版本开始，Phase 状态拆成两层：

- `active`
  表示当前唯一施工切片所在阶段。
- `stabilizing`
  表示主实现已落，但还没达到关闭标准，当前处于收尾与验证阶段。
- `complete`
  表示该阶段在当前 V1 范围内已经达到关单标准，不再保留活跃施工状态。

当前的执行约束是：

- 同时只允许一个 `active`
  这表示“当前真正正在施工的主线”。
- 允许多个 `stabilizing`
  这表示“这些阶段已经做出主要成果，但还没关单”。
- 实施层面只保留一个当前唯一施工切片
  这样可以避免单人串行推进时的上下文切换和半完成状态堆积。

截至 2026-03-13，V1 范围内已经没有新的 `active` 施工切片。

V1 closeout 之后，上一轮跨入下一阶段的 `PC-GOV-01` 也已经在当前最小 V2 范围达到关单标准：

- `PC-GOV-01 / Slice G-3`
  `layoff approval gate`、`department change approval gate` 和 `automation enable approval gate` 都已接入同一套 company-level durable approval record、authority `approval.request / approval.resolve` 命令和 `Lobby` 待审批面板。当前 approval line 已经证明这不是一次性的前端确认框，而是一个可跨组织动作与自动化动作复用的治理对象。

- `Phase 3 / Slice A-3`
  已在 V1 范围达到关单标准：`support request / escalation` 已补 revision baseline，`companyOpsEngine` 会按 material change 递增 revision，对应 audit payload 也带上了 `revision`；`RequirementAggregate` 的 no-op reconcile / duplicate evidence / no-op transition 也已收进统一 material-change 规则；同时 `Board / Lobby` 的“查看接管包”、`Requirement Center` 的“去排障 / 打开 Ops”、`CEO 首页` 的“查看运营异常” 也已经进入 `operator_action_recorded`。这意味着 Phase 3 不再只是在“对象本身稳定”，而是“对象变化和人类干预都可解释、可追溯”。

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
- `support request / escalation` 也开始补 revision baseline，自治治理对象不再只靠 `updatedAt` 表达实质变化
- `RequirementAggregate` 的 no-op reconcile / duplicate evidence / no-op transition 现在也开始按 material-change 规则稳定处理，不再让 `updatedAt / revision / changedFields` 虚假抖动
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
- `support_request_record_upserted / deleted` 与 `escalation_record_upserted / deleted` 的 payload 现在也会稳定带 `revision`
- `requirement_*` workflow event 的 payload 已开始带 `source / changedFields / previousAggregateId / previousOwner* / previousRoomId / previousRevision`
- 已新增 `authority:doctor` CLI，可直接体检本地 authority SQLite 的公司数、runtime 数、event 数、active company 和 executor state
- 已新增 `authority:backup` CLI，可直接生成本地 authority SQLite 备份文件，并支持最小 retention
- 已新增 `authority:backups` CLI，可直接列出当前备份清单
- 已新增 `authority:restore` CLI，可从备份文件恢复 authority SQLite，并自动留下 `pre-restore` safety backup
- `authority:restore` 已支持 `--latest`，恢复时不再需要先手工找备份路径
- `authority:restore` 已支持 `--plan / --force / --allow-safety-backup`，恢复前会默认阻止高风险回滚
- 已新增 `authority:rehearse` CLI，可先把备份恢复到隔离 rehearsal 环境，再用 doctor 验证这份备份本身是否可用
- authority 已开始写入 `schemaVersion` metadata，doctor / preflight / restore plan 也开始显式显示 schema version
- 已新增 `authority:migrate` CLI，开始显式回填老库缺失的 `schemaVersion` metadata，并支持 `--plan` 先输出迁移计划再决定是否执行
- doctor / preflight 已开始显式执行 SQLite `integrity_check`，并能把坏库 / 不可读库标成 `blocked`
- restore plan 已开始阻止恢复来自更高 schema 版本的备份，并对 legacy / 旧 schema 备份给出提示
- 已新增 `authority:preflight` CLI，可在启动前检查 authority data dir / backup dir / db path
- `authority:preflight` 已开始区分 `ready / degraded / blocked`，会把“已有数据库但 integrity_check 失败 / 不可读”、“已有数据库但缺 schema metadata”、“已有数据库但没备份”或“备份太旧”标成真实风险
- `npm run dev` 与 `npm run authority:start` 已开始在启动 authority 前执行 `authority:preflight`
- Settings Doctor 已开始直接显示 authority schema version、backup inventory、company/runtime/event 计数和 preflight 结果
- Connect 已开始在失败前后探测 Authority `/health`，并显示控制面可达性、schema version、备份状态和最小修复提示
- `mission.upsert/delete`、`conversation-state.upsert/delete`、`work-item.upsert/delete` 已切到 authority command，正常 authority-backed UI 交互下不再需要靠 `/runtime` 兼容通道写回这些对象
- `CompanyAuthoritySyncHost` 在 compatibility-owned slice 归零后，已经停止正常 authority-backed UI 交互下的 `/runtime` push；`/runtime` 只保留 restore/import/legacy manual recovery 角色
- Settings Doctor 现在能直接显示 authority-owned slice 边界，不再把 `/runtime` 兼容路径误读成日常主写入链路

仍然保留：

- Authority Doctor 仍然是“设置页基线版”，还不是完整的修复工具
- Settings / Connect 已经能看见 authority operator tooling 的关键结论，但还没有直接在页面里触发 backup / restore
- `Board` 与 `Ops` 虽然已经开始分层，但更深的共享摘要模块和更彻底的页面裁剪还可以继续收口

## 4. 阶段出口

### Phase 1

- 能回答“现在坏的是 Gateway、Authority、Executor 还是 Runtime”
- 有固定验证清单，而不是每次临时凭感觉排查
- `PC-OPS-01`、`PC-OPS-02` 已在 V1 范围达到关单标准，结构化修复建议与 startup banner 已贯通 CLI、`/health`、Connect、Settings Doctor 和产品内主壳层

### Phase 2

- 核心主线写入已经不再依赖 `/runtime` 回灌
- Authority 单写者方向在代码和文档里都已经明确
- `/runtime` 已降级为 restore/import/legacy manual recovery 通道，而不是正常 UI 交互的写入路径
- compatibility-owned runtime slice 已归零，不再存在 daily mutation slice

### Phase 3

- `RequirementAggregate` 的权威字段和派生字段写清楚，并让 no-op reconcile / duplicate evidence / no-op transition 不再制造虚假主线变化
- `Dispatch` / `DecisionTicket` / `Artifact` / `RequirementRoom` 的边界更稳定
- Phase 3 设计稿、Slice A-1、Slice A-2 和 Slice A-3 的稳态对象与审计规则都已落地：主读路径的 read-repair 已拆出，`DecisionTicket` 有显式 command，`support request / escalation` 具备 revision baseline，第一批 decision / dispatch / room / binding / artifact / repair / company-ops 审计事件已经进入 company event log，`requirement_*` workflow event 也开始自带更完整的推进上下文，高信号 operator action 也已经纳入统一治理日志。Phase 3 已在 V1 范围达到关单标准

### Phase 4

- 启动、诊断、备份、恢复的基本链路可用
- Authority 不再只是“能启动”，而是“出问题也知道怎么查”，并且这条 operator loop 已在真实环境完成 `backup -> backups -> doctor -> preflight -> migrate --plan -> restore --plan -> rehearse` smoke

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
   再把 `RequirementAggregate / Dispatch / RequirementRoom / Artifact / DecisionTicket` 的对象边界写实：
   - 哪些字段是权威字段
   - 哪些字段允许派生
   - revision 怎么变化
   - 哪些写入必须经过 authority command
2. `PC-GOV-03`
   继续把 operator action / requirement workflow audit 的收尾规则补齐，避免对象边界做稳以后审计线反而断档。
3. 新切片而不是回挂旧项
   轻量 approval gate、自动化预算软护栏、automation run ledger baseline、workspace policy、execution locking、execution session recovery、dynamic executor capability boundary、executor readiness baseline、trusted cost visibility，以及跨页面 activity / inbox baseline 现在都已经完成；如果下一轮还沿着 `paperclip` 借鉴线继续推进，应该直接开启新的后续切片。像 `runtime restore approval`、更重的 global inbox / archive / routing，或者更细的 requirement-level cost attribution，都应该作为新切片进入，而不是继续把已经关单的项挂回 active。

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
