# CTO 技术中台最终交付标准

Status: Active  
Last updated: 2026-03-13

## 1. 目的

这份文档定义的是 **最终版本标准**，不是阶段性 MVP 标准。

它回答 4 个问题：

- CTO 技术中台最终做成什么样，才算真正完成
- 当前已经做到哪一层
- 后续每一层还差什么
- 后续任务应该怎么按标准推进，而不是按场景临时定制

一句话定义：

**CTO 技术中台的最终形态，是一个让公司内能力能够被发布、发现、使用、反馈、修复、复用，并可稳定跨业务场景工作的正式平台。**

## 2. 核心对象

最终版平台的核心对象固定为 6 个，不再随业务场景变化而变化：

- `Resource`
  - 公司可消费的内容、数据、状态、报告、资产、工具输出
- `App`
  - 员工使用的正式公司入口
- `AppManifest`
  - App 消费哪些 Resource、怎么分区展示、有哪些白名单动作
- `SkillDefinition`
  - CTO 提供的可执行能力定义
- `CapabilityRequest`
  - 业务负责人向 CTO 提出的新能力需求
- `CapabilityIssue`
  - 工具不可用、报错、结果错误的正式反馈

这 6 个对象是平台主真相源。  
小说、游戏、运营、设计等场景都只能在这套对象上做配置和模板差异，不能继续发明新的平台级主对象。

## 3. 最终版本 Definition Of Done

只有同时满足下面 10 条，才允许判定“CTO 技术中台最终版本”完成。

### 3.1 对象模型完成

- 公司内所有正式能力都能落到 6 个核心对象中
- 不允许再出现“只存在于聊天”“只存在于某个路径”“只存在于 CTO 自己认知里”的组织能力
- 每个对象都必须可持久化、可查询、可在工作目录中展示

### 3.2 Resource 契约完成

- 所有进入平台的资源都必须带：
  - `resourceType`
  - `tags`
  - `source`
  - `updatedAt`
- Resource 可以被多个 App 复用
- Resource 的内部标签不直接暴露给用户
- 模板体验层必须仍然显示业务化文案，例如：
  - 小说场景显示 `正文 / 设定 / 报告`
  - 游戏场景显示 `运行画面 / 角色状态 / 事件日志`

### 3.3 App 平台完成

- 任何公司都可以显式挂载 `CompanyWorkspaceApp`
- App 不再依赖公司类型推导才出现
- App 至少支持：
  - `template`
  - `embedded`
- App 必须可选绑定：
  - `manifestArtifactId`
  - `embeddedHostKey`
  - `embeddedPermissions`
- 工作目录成为公司 App 的唯一正式入口

### 3.4 AppManifest 完成

- 至少所有正式 App 都由 `AppManifest` 驱动，而不是业务特例硬编码
- `AppManifest` 必须至少支持：
  - `sections`
  - `resources`
  - `actions`
- 历史临时契约，例如 `reader-index`，都必须已迁移为通用 manifest
- AppManifest 可以表达：
  - 资源分区
  - 白名单动作
  - 空状态
  - 默认展示顺序

### 3.5 Skill 平台完成

- 公司可以登记、发布、停用 `SkillDefinition`
- Skill 至少必须有这些字段：
  - `id`
  - `title`
  - `summary`
  - `ownerAgentId`
  - `status`
  - `entryPath`
  - `allowedTriggers`
  - `writesResourceTypes`
  - `smokeTest`
- Skill 不能裸存在，必须至少挂在：
  - App action
  - 或流程节点
- Skill 触发后必须是真实执行，而不是只写回模拟回执
- Skill 输出必须写回 `Resource`

### 3.6 工作流绑定完成

- App 和 Skill 必须能绑定到流程节点
- 员工在执行任务时，系统必须能直接告诉他：
  - 当前步骤该打开哪个 App
  - 当前步骤该触发哪个 Skill
  - 结果应该写回哪里
- 员工不需要自己猜“什么时候该用一致性检查”“什么时候该打开阅读器”

### 3.7 治理回路完成

- `CapabilityRequest` 必须形成完整流转：
  - `open -> triaged -> building -> ready -> verified -> closed`
- `CapabilityIssue` 必须形成完整流转：
  - `open -> acknowledged -> fixing -> ready_for_verify -> verified -> closed`
- 默认规则固定：
  - 普通员工先向业务负责人反馈
  - 业务负责人再转 CTO
- 平台里必须能看见：
  - backlog
  - 当前建设中
  - 待验证
  - 已关闭

### 3.8 Embedded Runtime 完成

- `embedded app` 运行在产品宿主壳中，不裸奔
- App 只能：
  - 读 manifest 范围内资源
  - 写自己的 app state
  - 触发白名单动作
- App 和 Skill 都不能直接改公司主配置或主运行态
- 宿主必须提供最小运行时：
  - app state
  - resource read API
  - action trigger API
  - 权限边界

### 3.9 可观测性与运维完成

- 平台必须能看到：
  - Skill 执行记录
  - App manifest 状态
  - open requests
  - open issues
  - 最近失败
  - 最近验证
- Skill 执行至少要有：
  - 开始时间
  - 结束时间
  - 输入摘要
  - 输出资源
  - 错误信息
- 平台必须可做基本运维：
  - doctor
  - 备份
  - 恢复
  - 基础审计

### 3.10 跨场景通用性完成

- 至少 3 类完全不同业务场景可复用同一套平台对象而不新增平台级主模型
- 推荐验收样例：
  - 小说创作
  - 游戏模拟
  - 非内容型内部运营工具
- 差异只能落在：
  - Resource tags
  - AppManifest 配置
  - 模板体验
- 不能因为换场景就重做平台逻辑

## 4. 阶段标准

最终版不是一步到位做完的，所以这里明确分成 3 个阶段。  
只有 `Stage C` 才是最终版本。

### Stage A: Foundation

这是第一阶段，不是最终版。

退出标准：

- App 已显式注册
- AppManifest 已生效
- Skill 可登记
- CapabilityRequest / CapabilityIssue 可登记和推进
- App action 可桥接 Skill
- Skill 至少能写回回执或结构化占位结果

### Stage B: Operational

这是第二阶段，表示平台已经能真实运转，但还不算最终版。

退出标准：

- Skill 已能真实执行
- 输出能稳定写回 Resource
- 流程节点已能绑定 required apps / skills
- 使用方能在任务流里被明确引导
- Request / Issue 有稳定 backlog 与待验证回路
- embedded host 已有正式 app state / resource API / action API

### Stage C: Final / GA

这才是最终版本。

退出标准：

- 满足第 3 节全部 10 条
- 至少 3 个异构业务场景复用成功
- 平台不再依赖业务特例补洞
- 平台已有稳定运维、可观测和审计能力

## 5. 当前代码所处阶段

截至 2026-03-13，当前实现只应被视为：

**Stage A 已完成**

当前已具备：

- 显式 App
- 通用 AppManifest
- Resource tags
- SkillDefinition
- CapabilityRequest
- CapabilityIssue
- CTO 工具工坊里的最小闭环
- App action -> Skill bridge

当前还不具备，因此还不是最终版：

- 真实 Skill 执行引擎
- Skill 真正写回业务结果资源
- 流程节点绑定 required apps / skills
- embedded host 的正式 app runtime
- 完整 backlog / SLA / 验证运营机制
- 跨 3 类业务场景的通用性验收
- 完整的运维与审计能力

## 6. 标准推进任务

后续推进统一按下面 8 个标准任务包执行，不再按业务场景临时拆。

### T1. 对象模型收口

目标：
- 新能力必须先进入统一对象模型

完成条件：
- `Company / Artifact / Runtime` 类型补齐
- 运行时命令能持久化新对象

### T2. App 与 Manifest 收口

目标：
- 页面不再裸奔，必须成为正式 App

完成条件：
- App 可显式挂载
- App 可绑定 manifest
- 旧特例已迁移到通用 manifest

### T3. 真实 Skill 执行

目标：
- Skill 不再只写回回执，而是真实执行

完成条件：
- Skill 可触发真实执行
- 可写回结果 Resource
- 失败会自动形成 Issue 或 run error

### T4. 工作流绑定

目标：
- 让员工在实际任务流里知道何时使用什么能力

完成条件：
- 流程节点可绑定 required apps / skills
- UI 能在正确时机给出明确入口

### T5. 治理回路运营化

目标：
- 让 backlog、修复、验证真正长期运转

完成条件：
- Request / Issue 有稳定状态流
- 有待验证和关闭机制
- 有负责人视角和 CTO 视角的工作面板

### T6. Embedded Runtime

目标：
- 让小说阅读器、游戏模拟器这类强交互 App 有正式宿主

完成条件：
- app state 可用
- resource read API 可用
- action API 可用
- 权限边界明确

### T7. 运维与可观测性

目标：
- 让平台可维护、可追踪、可恢复

完成条件：
- Skill run ledger
- doctor
- 备份/恢复
- 基础审计

### T8. 跨场景 GA 验收

目标：
- 证明平台已经是平台，而不是小说特化实现

完成条件：
- 至少 3 个异构场景通过同一套平台标准验收
- 不新增平台级主对象

## 7. 标准任务卡模板

以后每个推进任务都按这个模板创建，不再自由发挥：

### 任务卡字段

- `Title`
- `Objective`
- `Stage`
  - `A / B / C`
- `Objects Involved`
- `User Path`
- `Write Path`
- `Acceptance`
- `Out Of Scope`

### 任务卡示例

`Title`
- 让阅读器从 AppManifest 读取资源

`Objective`
- 去掉阅读器对专用 reader-index 的长期依赖

`Stage`
- `A`

`Objects Involved`
- `App`
- `AppManifest`
- `Resource`

`User Path`
- 进入工作目录
- 打开阅读器
- 看见 manifest 驱动的“正文 / 设定 / 报告”分区

`Write Path`
- 生成或更新 `app_manifest` artifact
- 更新 `CompanyWorkspaceApp.manifestArtifactId`

`Acceptance`
- `tsc` 通过
- manifest 单测通过
- 浏览器里可看到阅读器头部动作条与资源分区

`Out Of Scope`
- 不做真实 Skill 执行
- 不做 workspace bundle 加载

## 8. 当前推荐的下一阶段顺序

当前已经完成 `Stage A`，后续固定按这个顺序推进：

1. 真实 Skill 执行引擎
2. Skill 输出结果资源，而不只是 `receipt`
3. 流程节点绑定 required apps / skills
4. embedded host 的 app state 与宿主 API
5. Request / Issue 的 backlog 与待验证机制
6. 运维与 run ledger
7. 跨场景 GA 验收

一句话：

**先从“能登记、能看见”升级到“能真实运行”，再从“能真实运行”升级到“跨场景稳定复用”。**
