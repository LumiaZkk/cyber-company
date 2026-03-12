# Paperclip 对比分析报告

Status: Draft  
Last updated: 2026-03-13  
Scope: 对比 `paperclipai/paperclip` 与当前 `cyber-company` 项目在产品定位、状态建模、技术架构、工程成熟度和战略方向上的异同、优劣与可借鉴点

Related docs:

- `docs/paperclip-borrowing-tracker.md`
- `docs/cyber-company-evolution-direction.md`

## 1. 分析对象

### 1.1 当前项目

- Repo: `cyber-company`
- 本地分析基线：
  - `README.md`
  - `docs/cyber-company-prd.md`
  - `docs/engineering-onboarding.md`
  - `src/App.tsx`
  - `packages/authority-daemon/src/server.ts`

### 1.2 对标项目

- Repo: `https://github.com/paperclipai/paperclip`
- 分析快照：
  - 首次快照：2026-03-12
  - 首次快照 commit：`55c145bff25f2be6aa2aec465b92a1e8a46590cc`
  - 最新核验：2026-03-13
  - 最新核验 commit：`5201222ce7c73d50c4cf021ea6fdd24bd401dfe6`
- 重点参考：
  - `README.md`
  - `doc/DEVELOPING.md`
  - `cli/src/commands/doctor.ts`
  - `cli/src/commands/db-backup.ts`
  - `server/package.json`
  - `server/src/services/issues.ts`
  - `ui/package.json`
  - `packages/db/package.json`
  - `server/src/index.ts`
  - `packages/db/src/schema/*`

## 2. 分析方法与边界

本报告基于仓库文档、代码结构、关键入口文件、依赖与测试分布进行静态分析。

本报告没有做以下事情：

- 没有把两个系统都完整跑起来做运行态对照
- 没有对实际性能、稳定性、运维复杂度做压测级验证
- 没有对团队真实使用数据做定量 A/B 对比

因此，以下结论更适合用于产品与架构判断，而不是替代运行态验收。

## 3. 执行摘要

`paperclip` 和 `cyber-company` 都在尝试回答同一个大问题：如何把多个 AI agent 从“会聊天/会执行”提升到“可运营、可协作、可治理”的公司级系统。

但两者切入层级并不完全相同：

- `paperclip` 更像通用型 orchestration platform。它重点解决的是多 agent 公司运行的底座问题，例如目标对齐、工单、审批、预算、heartbeat、持久化、adapter 接入、多公司隔离和部署运维。
- `cyber-company` 更像 OpenClaw-native 的运营产品。它重点解决的是单个操作者如何通过 CEO 首页、CEO 深聊、需求中心、需求房、Ops、Board 等视图，把一个多 agent 工作流真正推进到交付和验收。

一句话判断：

- `paperclip` 强在平台完整度和长期自治能力。
- `cyber-company` 强在需求主线、人机协作透明度和产品叙事张力。

这意味着两者不是简单的“谁替代谁”的关系。更合理的判断是：

- 如果目标是做最好的 OpenClaw 运营产品，`cyber-company` 的方向更有差异化。
- 如果目标是做通用 agent company 平台，`paperclip` 的底座能力更成熟，也更接近平台化终局。

2026-03-13 按 `paperclip` 最新 master 重新核验后，这个判断没有变化，反而更明确了两边的差异：

- `paperclip` 的强项仍然是 durable object、治理原语和本地 operator tooling。
- `cyber-company` 的强项仍然是 requirement-centered 的前台主线和协作现场投影。

## 4. 项目定位对比

### 4.1 Paperclip

根据其 README，`paperclip` 的核心定位是：

- open-source orchestration for zero-human companies
- If OpenClaw is an employee, Paperclip is the company

它把自己定义成“公司控制平面”，而不是聊天产品、agent framework 或 workflow builder。它强调的核心对象包括：

- company
- org chart
- goal
- project
- issue
- approval
- heartbeat
- budget
- audit log
- company portability

这是一种明显的平台式定位。

### 4.2 Cyber Company

根据本仓库 README 与 PRD，`cyber-company` 的核心定位是：

- 构建在 OpenClaw 之上的多 Agent 运营控制台
- 面向 CEO-first 的操作体验
- 把请求、交接、阻塞、恢复动作和运营视图做成显式产品状态
- 帮助一个操作者推进真实需求，而不是维护一堆 agent 聊天窗口

当前 vNext 方向进一步收束为：

- `CEO 首页 -> CEO 深聊 -> 需求中心`

也就是说，项目并不想成为通用平台，而是在强化“需求主线推进”和“人在环运营控制”的产品闭环。

### 4.3 定位差异总结

`paperclip` 偏平台：

- 管的是公司运行底座
- 关注自治、治理、预算、审批、长期运行

`cyber-company` 偏产品：

- 管的是需求推进控制面
- 关注上下文收敛、协作透明、排障恢复、用户验收

## 5. 相同点

两者存在明显重叠：

- 都使用“公司”作为 agent orchestration 的主隐喻
- 都不是把 agent 当成单个聊天窗口
- 都在把 ownership、handoff、state、cost、coordination 从聊天文本提升为系统状态
- 都默认多 agent 协作，而不是单 agent 使用场景
- 都把 OpenClaw 视为重要执行层或接入对象之一

这说明两边确实在处理同一类问题，只是切入深度和产品表达不同。

## 6. 核心差异

### 6.1 产品主线

`paperclip` 的主线更接近：

- 定义公司目标
- 雇佣 agent
- 建立组织结构
- 发 issue / approval / heartbeat
- 在 dashboard 中持续监督

`cyber-company` 的主线更接近：

- 在 CEO 首页提出目标
- 在 CEO 深聊中收敛需求
- 进入需求中心看当前主线
- 在需求房中展开协作
- 出现阻塞时切到 Ops 处理
- 回到主线完成交付与验收

区别在于：

- `paperclip` 管的是“组织如何运转”
- `cyber-company` 管的是“需求如何被推进并闭环”

### 6.2 第一性状态对象

`paperclip` 的第一性对象是持久化 business object：

- companies
- goals
- projects
- issues
- approvals
- memberships
- secrets
- assets
- heartbeat runs
- cost events
- agent task sessions

从 `packages/db/src/schema/*` 可以看出，它对数据库 schema 的投入很深，系统是围绕长期持久化实体来设计的。

2026-03-13 最新 master 上的 `approvals.ts` 和 `heartbeat_runs.ts` 进一步强化了这一点：

- `approvals` 带完整的 `requestedBy* / decidedBy* / status / payload` 字段，明显是 durable governance entity。
- `heartbeat_runs` 带 `status / usageJson / resultJson / contextSnapshot / logRef`，说明自动化执行在 `paperclip` 里不是临时日志，而是长期执行账本。

`cyber-company` 的第一性对象更偏协作 runtime object：

- requirement aggregate
- requirement room
- dispatch
- work item
- room binding
- support request
- escalation
- decision ticket
- artifact
- round

从 `src/infrastructure/authority/contract.ts` 和 `packages/authority-daemon/src/server.ts` 能看到，这些对象更直接服务于“当前需求推进”和“当前协作现场”。

区别在于：

- `paperclip` 更像系统记录“公司运营账本”
- `cyber-company` 更像系统投影“协作现场状态”

### 6.3 技术架构

`paperclip` 当前是标准 monorepo 平台架构：

- `cli`
- `server`
- `ui`
- `packages/db`
- `packages/shared`
- `packages/adapters/*`
- `tests/e2e`

服务端使用：

- Express
- Drizzle
- PostgreSQL
- embedded-postgres
- better-auth
- adapter packages

这说明它的边界不止是 UI，而是完整控制平面。

`cyber-company` 当前架构更轻，更偏产品驱动：

- Vite React 前端
- 本地 `authority-daemon`
- Authority 本地 SQLite
- OpenClaw executor bridge
- 前端分层：`pages -> presentation -> application -> domain/infrastructure`

它已经不是纯前端，但 authority 仍然更像“本地控制面 + OpenClaw 适配层”，不是一个完全通用的 orchestration backend。

### 6.4 Agent 接入方式

`paperclip` 强调 bring-your-own-agent：

- 本地 Claude
- Codex
- Cursor
- Gemini
- OpenClaw
- 其他 adapter

其 adapter 能力是平台的一部分。

`cyber-company` 当前更强绑定 OpenClaw：

- Authority 当前 executor type 主要围绕 `openclaw`
- 产品体验建立在已有 OpenClaw/Gateway 能力之上

区别在于：

- `paperclip` 更适合 heterogeneous runtime
- `cyber-company` 更适合 OpenClaw 深度集成

### 6.5 部署与运维

`paperclip` 的开发与部署入口更成熟：

- `npx paperclipai onboard --yes`
- embedded PostgreSQL 自动初始化
- Docker / Compose quickstart
- `doctor`
- `db:backup`
- `worktree init`
- `allowed-hostname`
- migration 机制

最新 master 上的 `cli/src/commands/doctor.ts` 和 `cli/src/commands/db-backup.ts` 也说明了这套运维入口的成熟度：

- `doctor` 是分层检查、可修复检查和修复后复验，不只是 health ping。
- `db:backup` 是显式 CLI 能力，直接暴露 backup dir、retention 和 connection source。

这类能力说明它不仅在做产品，也在做“平台落地链路”。

`cyber-company` 的运行成本在已有 OpenClaw 环境下较低：

- `npm install`
- `npm run dev`

但它的前提更强：

- 需要可达的 OpenClaw Gateway
- executor 不可用时能力会降级

因此：

- `paperclip` 更适合独立部署成一个完整系统
- `cyber-company` 更适合作为 OpenClaw 生态上的产品层

### 6.6 用户体验风格

`paperclip` 的产品体验更像：

- agent company OS
- issue/project/dashboard/governance 工具
- 更平台化、更稳态

`cyber-company` 的产品体验更像：

- CEO cockpit
- 需求控制台
- 协作现场投影
- 更叙事化、更偏操作流程

这是两者最大的产品差异之一。

## 7. 工程成熟度对比

### 7.1 规模信号

基于 repo-owned TS/TSX/JS/MJS 文件粗略统计：

- `cyber-company`：约 426 个源码文件，主要位于 `src` 和 `packages`
- `paperclip`：约 563 个源码文件，主要位于 `cli`、`server`、`ui`、`packages`

这说明 `paperclip` 在平台边界上更广，但 `cyber-company` 的代码体量也已经不是 demo 级。

### 7.2 测试信号

repo-owned 测试文件粗略统计：

- `cyber-company`：62 个测试文件
- `paperclip`：67 个测试文件，另有 Playwright e2e

`cyber-company` 的测试覆盖并不弱，尤其在 application / domain / infrastructure / authority 这些层面已经形成较清晰的验证面。

`paperclip` 的优势在于测试覆盖的对象范围更“平台化”，包括：

- auth
- adapter environment
- approvals
- issues
- company routes
- workspace policy
- health
- onboarding
- e2e

因此：

- `cyber-company` 在产品逻辑层已经有较好的工程纪律
- `paperclip` 在平台基础设施层更成熟

## 8. 优势与不足

### 8.1 Paperclip 的优势

- 平台化程度高，底座能力完整
- 数据层明确，schema 体系成熟
- 支持多 agent runtime 接入，不强绑单一执行器
- 有部署、迁移、健康检查、worktree 等配套工具
- 更适合长期自治运行、预算管理、审批治理、多公司隔离

### 8.2 Paperclip 的不足

- 产品表达更通用，差异化体验不如 `cyber-company` 鲜明
- 系统复杂度高，理解与维护成本更大
- 对“一个需求如何被 CEO 和团队共同推进到验收”的产品表达不如 `cyber-company` 聚焦
- 对 OpenClaw-native 的深度协作体验未必有本项目贴合

### 8.3 Cyber Company 的优势

- CEO-first 和 requirement-centered 的产品叙事非常清楚
- 能更自然地承载模糊目标澄清、需求推进、协作投影、验收闭环
- 对多 agent 现实协作中的 dispatch、阻塞、升级、回退问题建模细腻
- 前端分层明确，产品演进方向稳定
- 对已使用 OpenClaw 的团队更轻、更直接

### 8.4 Cyber Company 的不足

- 平台层能力不如 `paperclip` 完整
- 当前对 OpenClaw executor 的依赖较强
- 多 runtime、多租户、auth/governance、长期运行治理等能力较弱
- Authority 更像本地控制面，而不是已成型的通用 orchestration backend

## 9. 战略判断

### 9.1 两者是否直接竞争

不是完全直接竞争。

更准确的说法是：

- 两者都在解决公司级多 agent orchestration
- 但 `paperclip` 偏底座平台
- `cyber-company` 偏上层产品体验

如果未来 `cyber-company` 往通用平台继续扩张，两者竞争会更直接。
如果 `cyber-company` 继续深挖 OpenClaw-native 的需求推进体验，两者反而可能形成上下层关系。

### 9.2 哪个方向更适合当前项目

基于当前仓库的 PRD 和代码结构判断，`cyber-company` 最强的价值不是复制 `paperclip`，而是：

- 成为更强的 OpenClaw 运营产品
- 把“需求主线推进”做成不可替代的体验
- 把协作透明度、失败恢复、验收闭环做深

如果直接向 `paperclip` 的平台路线收拢，风险是：

- 会稀释现在最有辨识度的 CEO/需求中心产品楔子
- 会引入大量平台工程复杂度
- 会在平台底座上进入更直接、更难打的竞争

## 10. 建议

### 10.1 不建议直接复制的部分

- 不要把产品重写成 issue/project/dashboard 主导的通用平台
- 不要过早为了“平台化”牺牲 requirement-centered 的核心体验
- 不要在还没有明确多 runtime 需求时，就全面复制 adapter 体系

### 10.2 强烈建议借鉴的部分

- 更稳定的持久化数据边界和 schema 设计
- 审批、预算、heartbeat 等长期运行原语
- 更清晰的部署与运维工具链
- 更显式的 health / doctor / migrate / backup 能力
- 更标准化的工作区和 runtime policy 设计

### 10.3 建议的演进路线

短期建议：

- 继续把 `CEO 首页 -> CEO 深聊 -> 需求中心` 做透
- 强化 requirement aggregate 与 dispatch / room / acceptance 的一致性
- 补齐 authority 与 UI 之间的可靠性和恢复能力

中期建议：

- 借鉴 `paperclip` 的治理原语，但保持本项目产品表达不变
- 逐步把关键状态从“本地 runtime 快照”推进到更稳定的权威持久层
- 提升 authority 的可部署性和自检能力

长期建议：

- 决定项目究竟要成为：
  - OpenClaw 上最好的运营产品
  - 还是通用 agent company 平台

这两个方向可以兼容一段时间，但最终的产品和架构重心不同，越晚决策，越容易同时背两套复杂度。

## 11. 最终结论

`paperclip` 是一个值得认真研究的对标对象，但它更像“平台底座的优秀样本”，而不是 `cyber-company` 应该直接复制的产品终局。

`cyber-company` 当前真正有潜力建立壁垒的地方，是：

- CEO-first 的控制面
- requirement-centered 的主线体验
- 多 agent 协作现场的可视化与可恢复性
- 从“聊天协调”走向“需求闭环”的产品表达

因此，更合理的策略不是“变成另一个 `paperclip`”，而是：

- 保留自己的产品楔子
- 有选择地吸收 `paperclip` 在平台底座上的强项

一句话总结：

`paperclip` 更像值得借鉴的基础设施老师，`cyber-company` 更应该继续做一个更锋利、更有体验辨识度的运营产品。

## 12. 后续可跟进项

基于本报告，后续可以继续产出：

1. `cyber-company` 可借鉴 `paperclip` 的能力清单与优先级
2. 面向架构演进的 gap analysis
3. 面向产品路线的取舍决策文档
4. “如果保持当前产品定位，未来 2 个版本应该补什么” 的 roadmap 草案
