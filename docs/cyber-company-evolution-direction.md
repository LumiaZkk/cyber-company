# Cyber Company 演进方向建议

Status: Draft  
Last updated: 2026-03-13  
Depends on:

- `docs/paperclip-comparison-report.md`
- `docs/paperclip-borrowing-tracker.md`
- `docs/v1-stability-roadmap.md`

## 1. 目的

这份文档不是重复 `paperclip` 对比报告，而是在对比基础上回答 4 个更具体的问题：

1. `cyber-company` 应该借鉴 `paperclip` 的哪些能力
2. `cyber-company` 不应该复制 `paperclip` 的哪些做法
3. 当前项目最有防御力的演进方向是什么
4. 接下来两个版本应该如何落地

## 2. 先说结论

推荐方向：

- 把 `cyber-company` 继续做成 **OpenClaw-native 的需求控制平面**
- 保持 `RequirementAggregate` 作为前台主线真相
- 把 `paperclip` 里成熟的“平台底座能力”逐步吸收进 `authority`
- 不要把产品重心改造成通用 issue/project 平台

一句话定义：

`cyber-company` 最应该成为“一个操作者驱动一支 AI 团队完成需求闭环的控制面”，而不是“另一个通用 agent company OS”。

## 2.1 如何阅读这份文档

从这份文档开始，凡是明确借鉴 `paperclip` 的能力，尽量引用追踪表中的固定 ID。

追踪表位置：

- `docs/paperclip-borrowing-tracker.md`
- `docs/v1-stability-roadmap.md`

这样做的目的是让后续每次架构升级都能回答：

- 借鉴了什么
- 为什么借
- 借到了什么程度
- 最终有没有带来稳定性和可控性收益

## 2.2 当前推进到哪里

截至 2026-03-13，V1 已经从“纯规划”进入“第一批实现”：

- `PC-OPS-01` / `PC-OPS-02`
  设置页已经有一版 Doctor 基线，可以直接区分 `Gateway / Authority / Executor / Runtime`
- `PC-STATE-02`
  `requirement.transition`、`room.append`、`room-bindings.upsert`、`dispatch.create` 已经改成 authority command 写入，开始从“浏览器整份 runtime 回灌”收口

这让 Phase 2 的推进更接近“主链路成组收口”，而不再只是单点样板；当前剩余的兼容路径主要集中在 room delete、artifact 和其他非主链对象上。

这意味着当前项目的稳定性改造，已经从“讨论方向”进入“有代码、有界面、有追踪文档”的阶段。

## 3. 为什么这是更好的方向

当前项目已经在以下几件事上形成明显产品楔子：

- `CEO 首页 -> CEO 深聊 -> 需求中心` 的单线体验
- 基于 `RequirementAggregate` 的主线收敛
- 需求房、派单、阻塞、恢复、验收这些贴近真实协作现场的建模
- 把“聊天协调”转成“需求推进可视化”

这些不是 `paperclip` 的强项。

`paperclip` 更强的是：

- 平台底座
- adapter 体系
- 部署与自检工具链
- 审批、预算、heartbeat、治理
- 持久化 business objects

因此更合理的策略不是产品收敛到 `paperclip`，而是架构上吸收它的底层强项。

## 4. 三条可选路线

### 路线 A：继续强化需求控制平面

定义：

- 保持 Requirement Center 为唯一主中枢
- 所有主要页面围绕 primary requirement 投影工作
- Authority 演进成更稳的产品后端，但仍服务于需求推进主线

优点：

- 与当前 PRD 和信息架构完全一致
- 产品辨识度最高
- 更适合 OpenClaw 用户的真实工作流
- 可以在不失去产品灵魂的前提下逐步补平台能力

缺点：

- 平台通用性增长较慢
- 短期内不适合承接太多异构 runtime

判断：

- **推荐**

### 路线 B：向通用 agent company 平台收敛

定义：

- 以 issue / project / goal / approval / org chart 为主要用户界面
- 把需求中心退化成某个视图
- 把架构重心转向多 adapter、多公司、多用户治理

优点：

- 市场叙事更容易对齐 `paperclip` 一类平台
- 技术抽象更通用

缺点：

- 会直接削弱当前项目最有差异化的产品表达
- 容易进入平台复杂度激增而产品价值变平的阶段
- 与现有 docs 中的状态源和页面职责设计冲突

判断：

- **当前阶段不推荐**

### 路线 C：双层结构，产品层与平台层并进

定义：

- 前台保持 Requirement Center 主线
- 底层逐渐引入更标准化的 issue / budget / approval / runtime policy 对象
- 明确区分“用户主线对象”和“系统执行对象”

优点：

- 既能保留产品楔子，也能逐步吸收平台能力
- 中长期最稳

缺点：

- 需要更清晰的边界设计，否则会产生双重真相

判断：

- **推荐作为路线 A 的中长期落地方向**

## 5. 建议借鉴 Paperclip 的 5 个能力

对应追踪表：

- `PC-OPS-01`
- `PC-OPS-02`
- `PC-STATE-01`
- `PC-GOV-01`
- `PC-GOV-02`
- `PC-WS-01`
- `PC-ADAPTER-01`

### 5.1 自检与运维链路

借鉴项 ID：

- `PC-OPS-01`
- `PC-OPS-02`

建议借鉴：

- `doctor`
- health check
- 更明确的启动 banner / 状态检查
- 配置有效性检查

对当前项目的意义：

- 降低“authority 已启动但 executor 未就绪”这类灰状态
- 帮助用户区分 authority 问题、gateway 问题、executor 问题

建议落点：

- `authority` 启动自检
- 设置页执行后端检查
- connect / settings / ops 共用同一套诊断模型

### 5.2 更稳定的持久化边界

借鉴项 ID：

- `PC-STATE-01`
- `PC-STATE-02`
- `PC-STATE-03`

建议借鉴：

- 明确 schema
- 迁移机制
- 备份恢复能力
- 权威状态与运行态的清晰分层

对当前项目的意义：

- 当前 Authority 已经是状态中枢，但仍偏本地控制面
- 后续要让需求主线更可信，就需要更稳的持久化边界

建议落点：

- 保持 `RequirementAggregate` 为产品真相
- 为 aggregate / dispatch / room / artifact / acceptance event 建立更稳定的持久化协议

### 5.3 治理原语

借鉴项 ID：

- `PC-GOV-01`
- `PC-GOV-02`
- `PC-GOV-03`

建议借鉴：

- approval
- budget guardrail
- pause / override / kill switch
- audit trail

对当前项目的意义：

- 当前系统已强调“恢复”和“排障”，下一步自然是“安全地放权”
- 没有治理原语，自动化和持续运行能力会很快失控

建议落点：

- 先做轻量版本，不必上来就做完整 board governance
- 从“危险动作需确认”“超预算提醒”“自动化需手动授权”开始

### 5.4 运行工作区策略

借鉴项 ID：

- `PC-WS-01`
- `PC-WS-02`

建议借鉴：

- worktree / workspace policy
- runtime workspace isolation
- project execution workspace settings

对当前项目的意义：

- 当前项目已有 workspace、artifact、authority 文件镜像概念
- 但还缺少更系统的“哪类任务在什么工作区执行、如何恢复、如何隔离”

建议落点：

- 为不同 agent / dispatch / requirement 定义 workspace policy
- 明确交付物、临时文件、工具链工作区的边界

### 5.5 执行底座抽象

借鉴项 ID：

- `PC-ADAPTER-01`
- `PC-ADAPTER-02`

建议借鉴：

- adapter boundary
- runtime-specific env injection
- 执行器能力声明

对当前项目的意义：

- 当前项目暂时不需要全面多 adapter 化
- 但应该避免把所有 authority 逻辑写死在 OpenClaw 专属路径上

建议落点：

- 保持 OpenClaw-first
- 但把 executor capability 抽成边界，而不是到处散落条件分支

## 6. 不建议复制 Paperclip 的 5 个点

### 6.1 不要让 issue 取代 requirement 成为前台主线

原因：

- 这会直接冲掉当前 Requirement Center 的设计核心
- 用户感知会从“推进这条需求”退回到“管理一组任务”

建议：

- issue 可以作为执行对象存在
- 但 requirement 仍应是用户看到的主线对象

### 6.2 不要过早做全面多 runtime 平台

原因：

- 当前最关键问题不是 adapter 数量不够
- 而是需求主线、恢复能力和执行一致性还没有完全跑顺

建议：

- 先把 OpenClaw-first 做深
- 等 authority 语义稳定后再谈多 runtime

### 6.3 不要把产品主叙事让给 Dashboard / Board / Ops

原因：

- Requirement Center IA 已明确：
  - Ops 负责排障
  - Workspace 负责交付
  - 主线中枢是需求中心

建议：

- Dashboard、Board、Ops 保持支持视图地位
- 不要重新走回“很多功能页并列竞争主入口”

### 6.4 不要过早为平台化引入过重的后端复杂度

原因：

- 如果在产品主线未稳定前就引入大量平台对象、auth、多租户和插件机制
- 团队会同时背产品迭代和平台演进两套复杂度

建议：

- 只为当前最痛的可靠性和治理问题增加后端能力
- 不做超前平台建设

### 6.5 不要制造双重真相

原因：

- 一旦 requirement、board item、issue、workspace entry 各自维护一套“当前状态”
- 系统很快会失去可信度

建议：

- 明确区分：
  - 用户主线真相：`RequirementAggregate`
  - 执行对象：`dispatch / work item / issue-like execution object`
  - 证据对象：`artifact / event / transcript`

### 6.6 不要让页面职责再次发散

原因：

- 当前项目已经不是“页面太少”，而是“有些页面开始重复表达同一类状态”
- 一旦主线、异常、交付、报表在多个页面都可以扩张
- 最后会变成每个页面都能做一点，但谁都不是权威入口

当前最明显的信号：

- `Requirement Center` 已经直接复用 `buildBoardRequirementSurface`、`buildBoardTaskSurface`、`useBoardRuntimeState`、`useBoardCommunicationSync`
- `Board` 与 `Ops` 都在展示请求、SLA、接管提醒
- `CEO 首页` 与 `Dashboard` 都在展示结果/复盘摘要

建议：

- 把“主线 / 异常 / 交付 / 报表 / 接入诊断”分成明确页面职责
- 允许多页面读取同一条主线，但不允许多页面各自扩张成完整主界面
- V1 期间新增卡片和面板时，先检查是否在抢别的页面职责

## 7. 推荐的产品北极星

建议把项目北极星表述为：

> Cyber Company 是一个建立在 OpenClaw 之上的需求控制平面，让一个操作者能够发起、收敛、推进、排障、交付并验收一条多 agent 需求主线。

这句话的重要性在于：

- 它保住了当前最有辨识度的产品方向
- 它没有把产品降格成“agent dashboard”
- 它也为后续增加治理和自动化能力留下空间

## 8. 推荐的架构演进原则

### 8.1 `RequirementAggregate` 继续做前台权威状态

这条原则不建议动。

如果后续引入 issue 或 project，也应满足：

- issue 是 requirement 的执行分解或投影
- project 是 requirement 的背景或组织容器
- 都不应该替代 requirement 成为用户主叙事

### 8.2 Authority 从“本地控制面”逐步升级为“稳态产品后端”

不建议一步变成通用平台后端。

更合理的演进是：

- 先让 authority 更可靠
- 再让 authority 更可迁移、更可恢复、更可诊断
- 最后再考虑更通用的 runtime abstraction

### 8.3 先定义对象边界，再扩对象数量

优先级应该是：

1. 明确 requirement、dispatch、room、artifact、acceptance 的关系
2. 统一 timeline 和 evidence 模型
3. 再引入 budget、approval、workspace policy 等治理对象

### 8.4 自动化能力必须晚于治理能力

如果没有：

- 预算边界
- 人工确认点
- 失败回退机制
- 执行证据

那么更强自动化只会放大失控。

## 9. 未来两个版本建议

下面的版本不是营销发布节奏，而是产品/架构演进阶段。

### 版本 1：Requirement Control Plane Hardening

目标：

- 把当前 requirement-centered 主线真正打实

本版本主要借鉴项：

- `PC-STATE-01`
- `PC-STATE-02`
- `PC-STATE-03`
- `PC-OPS-01`
- `PC-OPS-02`
- `PC-OPS-03`
- `PC-OPS-04`

重点：

- Requirement Center 成为唯一主中枢
- Board / Workspace / Ops 彻底围绕同一条 primary requirement 投影
- Acceptance、reopen、change 等动作和 timeline 完整打通
- 强化 authority 与 UI 的一致性和恢复能力
- 收紧页面职责，避免 Board / Ops / Dashboard / Workspace 再次长成并列主入口

建议交付项：

- 统一 requirement timeline 去重与证据归并
- 更稳定的 aggregate 持久化与恢复
- connect / settings / ops 共用的诊断模型
- 从 Ops 回到 Requirement Center 的恢复闭环
- 交付物与需求 revision 的映射关系
- 关键操作的回放与补账能力
- `Requirement Center` 从 `Board` 语义依赖里抽离成中性主线模块
- `Board`、`Ops`、`Dashboard`、`Workspace` 页面职责矩阵固定下来

成功指标建议：

- 用户能只靠 `CEO 首页 -> CEO 深聊 -> 需求中心` 推进一条真实需求
- 需求中心状态与 Board / Workspace / Ops 不再出现明显漂移
- 刷新、断连、恢复后主线不会丢

### 版本 2：Managed Autonomy Layer

目标：

- 在不破坏主线体验的前提下，引入可控自动化和治理

本版本主要借鉴项：

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

重点：

- 轻量 approval
- 预算/使用量 guardrail
- automation/heartbeat 的可解释运行
- workspace policy
- 审计和恢复

建议交付项：

- 轻量 approval gate：危险操作、自动化启用、组织变更需确认
- agent 或 requirement 级预算提醒和软限制
- automation 执行日志与失败原因聚合
- workspace policy：执行目录、交付目录、镜像目录分离
- authority health / doctor / backup
- 执行器能力模型，为未来非 OpenClaw runtime 预留边界

成功指标建议：

- 用户能放心开启自动化而不是担心失控
- 失败时可以明确知道哪里坏了、怎么恢复
- 治理对象进入系统，但不喧宾夺主

## 10. 一个更现实的中长期蓝图

如果项目继续往前走，推荐形成三层：

### 第一层：用户主线层

- CEO 首页
- CEO 深聊
- 需求中心
- 需求房

职责：

- 让用户理解“现在在推进哪条需求”

### 第二层：运营支持层

- Board
- Ops
- Workspace
- Dashboard

职责：

- 让用户理解“推进过程出了什么问题、结果在哪里、代价如何”

### 第三层：执行与治理层

- Authority
- executor bridge
- approval
- budget
- automation policy
- runtime diagnostics

职责：

- 让系统能稳地跑，而不是只看起来像能跑

这个三层结构下：

- `paperclip` 值得借鉴的部分主要落在第三层
- `cyber-company` 最有壁垒的部分主要在第一层和第一层到第二层的衔接

## 11. 当前最重要的战略取舍

接下来最重要的不是“要不要变平台”，而是先回答这两个问题：

1. 你们是要做“一个操作者推进一条需求”的最佳体验，还是“很多 agent 长期自治”的通用平台？
2. 你们愿不愿意接受 Requirement Center 永远是主入口，而不是让 Dashboard / Board / Ops 去抢这个位置？

如果这两个问题的答案是：

- 前者：最佳需求推进体验
- 后者：是，Requirement Center 永远是主入口

那项目演进方向就很清楚：

- 产品上继续收敛
- 架构上继续加固
- 能力上选择性借鉴 `paperclip`

## 12. 最后建议

建议把未来 1 到 2 个版本的口号定成：

- **先把主线打实**
- **再把自动化放权做稳**

顺序不要反。

因为当前项目最危险的演进方式，不是“做得慢”，而是：

- 在主线还没稳定时过早平台化
- 在治理还没准备好时过早自动化

这两件事都会削弱产品可信度。

相反，如果顺序正确，`cyber-company` 会形成一个很清楚的差异化定位：

- 不是另一个通用平台
- 而是最懂“如何把多 agent 协作真正推进成需求闭环”的控制面

## 13. 后续更新要求

从这版开始，后续凡是涉及架构升级、authority 稳定性收口、治理原语引入或自动化边界调整，都建议同步更新：

1. `docs/paperclip-borrowing-tracker.md`
2. 本文档中相关版本章节
3. 如果方向发生变化，再更新 `docs/paperclip-comparison-report.md`
