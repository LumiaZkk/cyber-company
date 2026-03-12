# Paperclip 借鉴追踪表

Status: Draft  
Last updated: 2026-03-13  
Purpose: 记录 `cyber-company` 可以从 `paperclip` 借鉴的能力、当前采纳状态、计划落点、预期收益，以及后续架构升级时的回填方式

## 1. 使用方式

这份文档的目标不是证明 `cyber-company` 要变成 `paperclip`，而是回答三个更实际的问题：

1. `paperclip` 有哪些成熟能力值得系统性借鉴
2. 当前方案到底借鉴了哪些点，借鉴到什么程度
3. 每一轮架构升级之后，我们如何回看节奏、效果和偏差

更新原则：

- 每个可借鉴点使用固定 ID
- 每次方案落地时，必须在“当前采用情况”里更新状态
- 每个版本计划都要显式引用相关 ID
- 如果决定不借鉴，也要记录原因，避免反复讨论

## 2. 状态说明

| 状态 | 含义 |
|---|---|
| `observed` | 在 `paperclip` 中识别到，但尚未进入本项目规划 |
| `candidate` | 判断值得借鉴，已进入讨论或文档建议 |
| `planned` | 已进入明确版本计划 |
| `in_progress` | 正在实现 |
| `adopted` | 已落地到当前架构或产品 |
| `rejected` | 明确决定不借鉴或暂不借鉴 |

## 3. 借鉴总原则

只借鉴以下类型的能力：

- 让系统更稳
- 让状态更可信
- 让自动化更可控
- 让部署、恢复、诊断更成熟

不借鉴以下方向作为主线：

- issue-first 的用户叙事
- 通用 agent company OS 的产品表面
- 过早的平台化复杂度

## 4. 借鉴清单总览

| ID | 类别 | Paperclip 能力 | 对 `cyber-company` 的建议 | 当前状态 | 目标版本 |
|---|---|---|---|---|---|
| `PC-STATE-01` | 状态模型 | durable entity + schema-backed writes | 把关键对象从 runtime projection 提升为更稳定实体 | `candidate` | V1 |
| `PC-STATE-02` | 状态模型 | command/transaction 风格更新 | 用 command/event 替代浏览器整份 runtime 回灌 | `in_progress` | V1 |
| `PC-STATE-03` | 状态模型 | execution record 与 business record 分层 | 区分主线对象、执行对象、证据对象 | `candidate` | V1 |
| `PC-GOV-01` | 治理 | approval 对象 | 引入轻量 approval gate | `planned` | V2 |
| `PC-GOV-02` | 治理 | budget / usage guardrail | requirement 或 agent 级预算提醒与软限制 | `planned` | V2 |
| `PC-GOV-03` | 治理 | audit trail | 关键动作保留可追溯轨迹 | `candidate` | V2 |
| `PC-EXEC-01` | 执行 | heartbeat run records | 自动化/班次执行日志稳定建模 | `planned` | V2 |
| `PC-EXEC-02` | 执行 | task checkout / execution locking | 对高风险执行对象增加锁与拥有权语义 | `candidate` | V2 |
| `PC-EXEC-03` | 执行 | persistent task session | 提升 requirement / dispatch 的恢复一致性 | `candidate` | V2 |
| `PC-WS-01` | 工作区 | execution workspace policy | 明确执行目录、交付目录、镜像目录边界 | `planned` | V2 |
| `PC-WS-02` | 工作区 | worktree / isolated workspace thinking | 为复杂项目执行预留更强隔离能力 | `candidate` | Later |
| `PC-OPS-01` | 运维 | doctor/self-check | 增加 authority 自检与修复入口 | `in_progress` | V1 |
| `PC-OPS-02` | 运维 | startup health / startup banner | 强化 authority 启动信息与异常分型 | `in_progress` | V1 |
| `PC-OPS-03` | 运维 | migrations / backup | 增加 authority 数据迁移与备份恢复路径 | `candidate` | V1 |
| `PC-OPS-04` | 运维 | local-first onboarding | 提升本地一键跑通和恢复体验 | `candidate` | V1 |
| `PC-ADAPTER-01` | 执行器抽象 | adapter boundary | 把 executor capability 从 OpenClaw 专属逻辑里抽出来 | `candidate` | V2 |
| `PC-ADAPTER-02` | 执行器抽象 | environment / capability checks | 执行器接入前做能力与环境检查 | `candidate` | V2 |
| `PC-AUTH-01` | 权限 | user/company membership & permission model | 只在确实需要多用户治理时引入，当前不抢优先级 | `observed` | Later |
| `PC-PROD-01` | 产品支撑 | costs / usage visibility | 把成本/执行代价做得更可信 | `candidate` | V2 |
| `PC-PROD-02` | 产品支撑 | activity / inbox semantics | 提升跨视图事件可追踪性 | `candidate` | V2 |

## 5. 详细借鉴项

### `PC-STATE-01` 关键对象稳定化

- Paperclip 参考：
  - `issues`
  - `approvals`
  - `heartbeat_runs`
- 借鉴点：
  - 关键对象应有稳定 schema、明确写入边界和长期语义
- 对应到本项目：
  - `RequirementAggregate`
  - `Dispatch`
  - `DecisionTicket`
  - `Artifact`
  - `RequirementRoom`
- 不直接照搬的地方：
  - 不把 `issue` 当作前台主线对象
- 当前采用情况：
  - 已在文档中明确方向，尚未完成实体化收口
- 预期收益：
  - 降低漂移、双重真相、读时自愈写回带来的不确定性

### `PC-STATE-02` 命令式写入替代快照回灌

- Paperclip 参考：
  - service 层显式 `create/update`
- 借鉴点：
  - 用“业务命令”替代“浏览器整份状态同步”
- 对应到本项目：
  - 浏览器逐步停止成为 runtime 主写者
  - authority 成为单写者
- 不直接照搬的地方：
  - 不需要复制完整的 service/API 面，只需要先把主线写入路径收紧
- 当前采用情况：
  - `requirement.transition`、`room.append`、`room-bindings.upsert`、`dispatch.create` 已切到 authority command 写入
  - room binding 的复合身份键已统一，authority 不再只按 `roomId + conversationId` 落库
  - 浏览器整份 `/runtime` 回灌仍保留为兼容路径
- 预期收益：
  - 降低 race condition、整片覆盖和旧 snapshot 回灌

### `PC-STATE-03` 主线对象 / 执行对象 / 证据对象分层

- Paperclip 参考：
  - issue、approval、heartbeat_run、activity 分工清晰
- 借鉴点：
  - 不同语义对象不要混在同一层 runtime 快照里理解
- 对应到本项目：
  - 用户主线对象：`RequirementAggregate`
  - 执行对象：`Dispatch`、`WorkItem`
  - 证据对象：`RequirementEvidenceEvent`、`Artifact`、chat control signal
- 当前采用情况：
  - 在文档里已明确，是后续架构升级的边界基础

### `PC-GOV-01` 轻量审批

- Paperclip 参考：
  - `approvals`
- 借鉴点：
  - 对危险动作和高成本动作增加明确确认点
- 对应到本项目：
  - 自动化启用
  - 组织变更
  - 高风险恢复动作
  - 重大 requirement transition
- 当前采用情况：
  - 已进入 V2 计划

### `PC-GOV-02` 预算与使用量护栏

- Paperclip 参考：
  - 预算与成本控制语义
- 借鉴点：
  - 自动化放权前先把 guardrail 做出来
- 对应到本项目：
  - requirement 级预算提醒
  - agent 级软限制
  - automation 使用量异常提示
- 当前采用情况：
  - 已进入 V2 计划

### `PC-GOV-03` 审计轨迹

- Paperclip 参考：
  - issue / approval / run log / activity 的可追踪性
- 借鉴点：
  - 系统需要回答“谁改了什么、为什么、什么时候”
- 对应到本项目：
  - requirement transition
  - dispatch 生命周期
  - 验收动作
  - 恢复动作
- 当前采用情况：
  - 方向明确，但未形成统一审计模型

### `PC-EXEC-01` 自动化执行记录

- Paperclip 参考：
  - `heartbeat_runs`
- 借鉴点：
  - 自动化不只要有 cron，还要有稳定 run record
- 对应到本项目：
  - automation 执行日志
  - 成功/失败/中断原因
  - requirement 与 automation run 的关联
- 当前采用情况：
  - 已进入 V2 计划

### `PC-EXEC-02` 执行锁与拥有权

- Paperclip 参考：
  - checkout / execution run linkage
- 借鉴点：
  - 高价值执行对象应有“谁在执行、何时锁定、何时释放”的语义
- 对应到本项目：
  - `Dispatch`
  - 关键 `WorkItem`
- 当前采用情况：
  - 候选项，尚未规划到实现阶段

### `PC-EXEC-03` 持续执行会话恢复

- Paperclip 参考：
  - persistent task sessions
- 借鉴点：
  - 恢复后不应只剩文本历史，而应该能恢复工作上下文
- 对应到本项目：
  - requirement / dispatch / room 的恢复一致性
- 当前采用情况：
  - 候选项

### `PC-WS-01` 工作区策略

- Paperclip 参考：
  - project execution workspace settings
  - default agent workspace model
- 借鉴点：
  - 执行空间、交付空间、镜像空间要有稳定边界
- 对应到本项目：
  - authority 文件镜像
  - workspace 交付区
  - executor 工作目录
- 当前采用情况：
  - 已进入 V2 计划

### `PC-WS-02` 隔离式工作区

- Paperclip 参考：
  - worktree-local instance thinking
- 借鉴点：
  - 对复杂任务或多实验场景，执行环境隔离很重要
- 对应到本项目：
  - 暂时只作为后续演进候选，不抢当前优先级
- 当前采用情况：
  - 候选项

### `PC-OPS-01` Authority Doctor

- Paperclip 参考：
  - `paperclipai doctor`
- 借鉴点：
  - 本地 authority 需要一套“哪里坏了”的统一检查器
- 对应到本项目：
  - authority 是否启动
  - SQLite 是否可用
  - OpenClaw executor 是否就绪
  - token / URL / provider 配置是否有效
- 当前采用情况：
  - 设置页已落一版 Doctor 基线，能先区分 Gateway / Authority / Executor / Runtime 四层状态
  - 还没有完整的修复动作和独立 Doctor 命令

### `PC-OPS-02` 启动体检与健康信息

- Paperclip 参考：
  - startup banner
  - migration summary
  - health endpoint
- 借鉴点：
  - 把当前系统的灰状态显式化
- 对应到本项目：
  - connect / settings / ops 统一诊断模型
  - authority 启动信息面板
- 当前采用情况：
  - 设置页已展示统一诊断模型和固定回归清单
  - connect / ops 视图尚未完全接入同一套模型

### `PC-OPS-03` 迁移与备份恢复

- Paperclip 参考：
  - migration / db backup 流程
- 借鉴点：
  - authority 数据层需要更标准的演进与恢复路径
- 对应到本项目：
  - schema migration
  - snapshot backup
  - restore path
- 当前采用情况：
  - 候选项，建议尽快进入 V1

### `PC-OPS-04` 本地一键跑通

- Paperclip 参考：
  - onboard / run
- 借鉴点：
  - 减少“本地跑起来但实际不可用”的假启动
- 对应到本项目：
  - dev 启动前检查 authority / gateway / executor 依赖
- 当前采用情况：
  - 候选项

### `PC-ADAPTER-01` 执行器能力边界

- Paperclip 参考：
  - adapter packages
- 借鉴点：
  - 执行器差异应该被边界吸收，而不是散落在产品逻辑里
- 对应到本项目：
  - executor capability model
  - authority bridge contract
- 当前采用情况：
  - 候选项，V2 更合适

### `PC-ADAPTER-02` 执行器环境检查

- Paperclip 参考：
  - adapter environment test
- 借鉴点：
  - 接入前先知道“能不能跑、缺什么、哪些能力不可用”
- 对应到本项目：
  - OpenClaw executor readiness
  - provider model availability
  - file mirror/path capability
- 当前采用情况：
  - 候选项

### `PC-AUTH-01` 多用户权限模型

- Paperclip 参考：
  - membership / permission / user role model
- 借鉴点：
  - 多用户治理最终会需要，但当前不是最高优先级
- 对应到本项目：
  - 仅在项目从 solo operator 转向 multi-user control plane 时再推进
- 当前采用情况：
  - 观察项

### `PC-PROD-01` 可信成本视图

- Paperclip 参考：
  - costs / usage reporting
- 借鉴点：
  - 成本与结果要对得上，才有放权基础
- 对应到本项目：
  - dashboard 成本可信度
  - requirement 级别成本归因
- 当前采用情况：
  - 候选项

### `PC-PROD-02` 跨视图活动语义

- Paperclip 参考：
  - activity / inbox semantics
- 借鉴点：
  - 系统应该统一表达“发生了什么、现在该看哪里”
- 对应到本项目：
  - CEO 首页、Requirement Center、Ops、Board 之间的事件链路
- 当前采用情况：
  - 候选项

## 6. 当前方案已借鉴的部分

本轮文档方案里，已经明确借鉴并写入方向建议的项目如下：

| 借鉴项 ID | 本轮采用程度 | 落在哪份文档 |
|---|---|---|
| `PC-OPS-01` | 已落一版 Doctor 基线 | `docs/v1-stability-roadmap.md` |
| `PC-OPS-02` | 已落统一诊断模型与固定回归清单 | `docs/v1-stability-roadmap.md` |
| `PC-STATE-01` | 明确提出关键对象稳定化 | `docs/cyber-company-evolution-direction.md` |
| `PC-STATE-02` | `requirement.transition`、`room.append`、`dispatch.create` 已切到 authority command 写入 | `docs/v1-stability-roadmap.md` |
| `PC-STATE-03` | 明确提出主线/执行/证据三层分工 | 本追踪表 + 后续架构讨论 |
| `PC-GOV-01` | 纳入 V2 轻量审批 | `docs/cyber-company-evolution-direction.md` |
| `PC-GOV-02` | 纳入 V2 预算护栏 | `docs/cyber-company-evolution-direction.md` |
| `PC-WS-01` | 纳入 V2 workspace policy | `docs/cyber-company-evolution-direction.md` |
| `PC-ADAPTER-01` | 明确提出 capability boundary | `docs/cyber-company-evolution-direction.md` |

## 7. 当前明确不借鉴为主线的部分

以下 Paperclip 特征不作为当前主线借鉴目标：

| 对标项 | 原因 |
|---|---|
| issue-first 产品叙事 | 会冲掉 Requirement Center 主线 |
| 通用 agent company OS 产品表面 | 会稀释当前最有辨识度的需求控制平面定位 |
| 过早多 runtime 平台化 | 当前真正问题是主线稳定性，不是 adapter 数量 |
| 过重多用户治理优先级 | 当前主要用户仍偏 solo operator |

## 8. 版本节奏建议

### V1: Requirement Control Plane Hardening

应重点推进这些借鉴项：

- `PC-STATE-01`
- `PC-STATE-02`
- `PC-STATE-03`
- `PC-OPS-01`
- `PC-OPS-02`
- `PC-OPS-03`
- `PC-OPS-04`

预期效果：

- 主线更稳
- 状态更可信
- authority 更容易诊断和恢复

### V2: Managed Autonomy Layer

应重点推进这些借鉴项：

- `PC-GOV-01`
- `PC-GOV-02`
- `PC-GOV-03`
- `PC-EXEC-01`
- `PC-EXEC-02`
- `PC-EXEC-03`
- `PC-WS-01`
- `PC-ADAPTER-01`
- `PC-ADAPTER-02`
- `PC-PROD-01`
- `PC-PROD-02`

预期效果：

- 自动化更可控
- 失败更容易解释
- 放权更安全

## 9. 每次架构升级后怎么更新

每次升级建议至少更新这 4 处：

1. 更新本表的状态字段
2. 在对应版本文档中引用本次涉及的借鉴项 ID
3. 记录“引入了什么稳定性提升”
4. 记录“代价是什么，是否出现副作用”

推荐追加一行简短变更记录：

| 日期 | 版本/PR | 借鉴项 ID | 变更摘要 | 预期效果 | 实际效果 |
|---|---|---|---|---|---|
| 2026-03-12 | 文档基线 | `PC-STATE-01`, `PC-OPS-01` | 建立借鉴追踪机制并纳入 V1/V2 规划 | 让后续架构升级更可追踪 | 待实现 |
| 2026-03-13 | V1 起步 | `PC-OPS-01`, `PC-OPS-02`, `PC-STATE-02` | 设置页落 Doctor 基线；Requirement / room / dispatch 切到 authority command | 先看清哪层异常，并减少主线写入对 `/runtime` 的依赖 | 已落第一批基础能力，后续继续扩主线 |

## 10. 判断标准

如果后续一个升级项满足下面至少两个条件，就值得优先推进：

- 明显减少双重真相
- 明显减少恢复成本
- 明显降低自动化失控风险
- 明显提升状态可解释性
- 不会冲掉 Requirement Center 主线

如果一个升级项虽然“很平台”，但会削弱以上目标，就不应该因为它像 `paperclip` 而优先做。
