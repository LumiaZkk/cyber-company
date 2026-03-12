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
| Phase 1 | 先看清问题，再建立升级基线 | `PC-OPS-01`, `PC-OPS-02` | `in_progress` |
| Phase 2 | 收紧写入边界，停止整份 runtime 回灌 | `PC-STATE-02` | `in_progress` |
| Phase 3 | 把关键对象从运行态投影收口成稳态对象 | `PC-STATE-01`, `PC-STATE-03` | `planned` |
| Phase 4 | 补齐 Authority 运维闭环 | `PC-OPS-01`, `PC-OPS-02`, `PC-OPS-03`, `PC-OPS-04` | `planned` |

## 3. 当前已落地的切片

### 2026-03-13

本轮不是把 V1 全部做完，而是先把“可见的诊断基线”和“第一条 command 写入链路”落进去。

已完成：

- 设置页新增一版 V1 Doctor 基线面板
- 明确展示 `Gateway / Authority / Executor / Runtime` 四层状态
- 固定回归检查清单已经进入产品界面，后续每个阶段都沿用同一套清单
- runtime sync 已开始记录 push / pull / command 路径与最近错误
- `requirement.transition`、`room.append`、`room-bindings.upsert`、`dispatch.create` 已开始走 authority command 写入
- chat 主链路里的 room / dispatch 更新，不再默认先本地改再整份 `/runtime` 回灌
- room binding 的合并键已统一为 `roomId + providerId + conversationId + actorId`，避免 authority 与前端按不同身份规则覆盖

仍然保留：

- `/runtime` 兼容同步路径仍开启
- room / dispatch / room bindings 已切第一版 command 写入，但 room delete / artifact 等链路还未收口
- Authority Doctor 仍然是“设置页基线版”，还不是完整的修复工具

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
- 主线 requirement / room / dispatch 已经有第一批 authority command 写入样板
- 主线 requirement / room / room binding / dispatch 已经形成一组更完整的 authority command 写入样板
- 后续每一轮架构升级，都可以继续在这份路线图里增量回填阶段状态和验证结果

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
