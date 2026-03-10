# Task Plan: Evaluate CEO Response Against Product Expectation

## Goal
判断当前项目里 CEO 对“组建 AI 团队做小说创作与番茄发布”的回复，是否符合产品定位、交互预期和系统可消费的输出格式。

## Current Phase
Phase 4

## Phases
### Phase 1: Requirements & Discovery
- [x] 理解用户问题与评估目标
- [x] 查找 CEO 角色定义、UI 文案、会话解析逻辑
- [x] 记录关键代码证据
- **Status:** complete

### Phase 2: Product Expectation Mapping
- [x] 对齐 CEO 在产品中的角色职责
- [x] 对齐会话流里的“plan / owner / next step”预期
- [x] 对齐任务追踪与阶段格式要求
- **Status:** complete

### Phase 3: Gap Analysis
- [x] 逐条比对示例回复与项目预期
- [x] 判断哪些部分“内容正确但产品上不对”
- [x] 提炼用户视角的风险
- **Status:** complete

### Phase 4: Delivery
- [x] 给出结论
- [x] 给出关键证据引用
- [x] 给出建议的 CEO 响应方向
- **Status:** complete

## Key Questions
1. 项目里的 CEO 被设计成“顾问”还是“总调度”？
2. 产品是否要求 CEO 首轮回复就收敛成可执行 plan？
3. 该回复是否满足系统可识别的 tracker / stage-gate 结构？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 用代码和测试而不是主观感受来评估 | 用户问的是“当前项目里是否符合预期”，必须以项目实现为准 |
| 从产品视角和用户视角分开判断 | 可能出现“内容质量不错，但不符合产品主线”的情况 |
| 将结论定义为“部分符合，但整体不达标” | 内容策略方向基本正确，但没有收敛成产品需要的 plan / owner / next-step / tracker |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `session-catchup.py` 未输出可用信息 | 1 | 改为直接查看相关源码、测试和模板 |

## Notes
- 重点判断“是否推进主线”，而不是“是否写得有道理”。
- 最终结论需要区分：内容质量、产品契合度、系统可消费性。

## Addendum: 2026-03-11 Chat Stream Recovery

### Goal
修复 CEO 聊天页的流式体验：发送后立即显示用户消息；切到别的菜单时流式 partial 仍被应用层接住；切回聊天页时恢复“执行中 + 当前 partial”，而不是错误显示“待命”。

### Phases
1. 定位发送链路、页面级订阅、路由切换后的状态丢失点。
2. 把 in-flight stream 状态提升到应用级 runtime，而不是仅存在 `ChatPage` 本地 state。
3. 在 `ChatPage` 挂载时恢复 live stream，并验证构建通过。

### Status
- [x] Diagnose root cause
- [x] Implement optimistic send + runtime-backed stream recovery
- [x] Verify with `npm run build`

## Addendum: 2026-03-11 Refectory Promotion Merge

### Goal
以 `codex/refectory` 的 DDD 架构为新基线，完整接管 `main`；先安全保存 `main` 上未提交改动，再在 refectory 基线上补回仍然需要的增量，并完成本地验证与分支切换。

### Phases
1. 记录分叉事实、确认不适合直接普通 merge。
2. 保存 `main` 当前脏工作区到安全分支和提交。
3. 从 `codex/refectory` 创建集成分支，移植仍然需要的 `main` 增量。
4. 运行构建/测试验证集成结果。
5. 将本地 `main` 移动到验证通过的集成结果。

### Status
- [x] Diagnose branch divergence and merge risk
- [ ] Preserve current `main` worktree state
- [ ] Build integration branch from `codex/refectory`
- [ ] Validate merged result
- [ ] Promote integration branch to local `main`
