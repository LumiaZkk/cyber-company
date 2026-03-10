# Cyber Company PRD

Status: Draft
Last updated: 2026-03-06
Basis: Real UI walkthrough plus live gateway-backed chat/session evidence

## 1. Product Summary

`cyber-company` is a multi-agent operations console that turns raw agent/session/cron primitives into a company metaphor: companies, employees, departments, board, automation, and reports.

The product is not a generic AI chat shell. Its core promise is that one operator can run a small AI team, assign work by role, monitor progress, handle failure, and keep work moving across multiple agents.

## 2. Problem Statement

Today, advanced users can operate multiple agents, but they still shoulder too much orchestration overhead:

- they must manually understand which role owns which task
- they must manually chase timeouts and missing replies
- they must manually recover from browser/tool failures
- they must manually reconstruct state from long chat threads

The current product partially solves this by adding company and role abstractions, but real usage shows that it still behaves more like a message relay layer than a reliable operations system.

## 3. Evidence Base

This draft is grounded in two evidence sources gathered on 2026-03-06:

- Real browser walkthrough of the running UI across connect, select, lobby, employee, board, automation, dashboard, and chat views.
- Live session and chat history from the real `小说创作工作室` company in the gateway.

Observed live usage signals from the real company:

- 7 agents, 8 relevant sessions
- `timeout` mentions: 15
- `tab not found` mentions: 7
- manual fallback mentions: 30
- `失联` / `未回复` / `离线` mentions: 11
- `ANNOUNCE_SKIP` mentions: 7
- `等待` / `待命` / `待处理` mentions: 80

Interpretation:

- task execution is unstable
- cross-agent handoff is fragile
- orchestration chatter is too high
- fallback is happening, but too late and too manually

## 4. Target Users

### Primary

- Solo operators running a multi-agent workflow
- Technical founders or PMs coordinating AI workers
- Heavy AI workflow users who already accept role-based delegation

### Secondary

- Domain-specific operators such as content studio owners, research leads, or customer-support workflow builders

### Non-goals

- First-time non-technical AI users
- Users who only want a single chat box
- Teams seeking polished reporting without operational depth

## 5. Jobs To Be Done

### JTBD 1

When I need to move a multi-step project forward, I want to assign work by role and keep a global view, so I do not have to micromanage each agent individually.

### JTBD 2

When a task stalls, I want the system to tell me who is blocked, why it is blocked, and what fallback is available, so I can recover quickly.

### JTBD 3

When work spans many turns and many agents, I want state to persist across views and sessions, so I do not lose context or repeat coordination work.

## 6. Core User Flow

1. Connect to a gateway.
2. Choose or create a company.
3. Enter a company control surface.
4. Assign work to a role or open a role conversation.
5. Watch status across chat, board, and activity surfaces.
6. Detect failure, timeout, or missing handoff.
7. Decide whether to retry, reassign, or switch to manual execution.
8. Review outcomes and operating cost.

## 7. Product Principles

- The product should reduce orchestration overhead, not increase it.
- Exceptions should become visible state, not hidden chat prose.
- Handoffs should be system objects, not only message patterns.
- Company context should persist reliably across reloads and deep links.
- Reports must reflect real system state or clearly explain why data is missing.

## 8. What Works Today

- The company metaphor is strong and legible.
- The company selection page is clear and low-friction.
- The CEO chat view is differentiated and useful: it blends delegation, deadlines, summaries, and escalation into one surface.
- The employee page already suggests an operating model rather than a flat agent list.
- The board and dashboard point in the right direction, even though they are incomplete.

## 9. Current Product Gaps

### 9.1 Access And Continuity

- Connection errors are not accurately explained.
- A valid gateway token can still produce misleading UI guidance if the underlying failure is identity or origin policy related.
- Company context is not stable enough across refreshes and deep routes.

### 9.2 Execution Reliability

- Browser-driven work fails repeatedly in real usage.
- Timeouts and missing replies recur across multiple agents.
- Manual fallback exists, but appears only after repeated failures.

### 9.3 Workflow Structure

- Important work objects such as chapter handoff checklists, review signoff, setting changes, and foreshadow tracking live in chat text instead of product state.
- CEO often behaves like a relay operator, forwarding instructions and waiting for replies, instead of being supported by a stronger control plane.

### 9.4 Reporting And Trust

- The dashboard can show empty cost fields despite the gateway returning valid usage data.
- This reduces trust in the operational surfaces.

### 9.5 Template Fit

- Automation templates remain generic and demo-like.
- The real company scenario is novel creation, but the automation defaults still reflect generic summaries and inspections.

## 10. Requirements Backlog

## P0: Reliability And Trust

### P0-1 Connection Error Typing And Guidance

Background:
Real usage showed that the gateway can fail for materially different reasons, but the current connect UI collapses them into generic troubleshooting copy. This increases false diagnosis and slows first-time success.

User story:
As an operator connecting to a gateway, I want the app to tell me exactly why connection failed and what to do next, so I can recover without guessing.

Scope:

- In scope:
  - classify connection failures into user-visible error types
  - show tailored next-step guidance for each type
  - preserve clear success and reconnect recovery messaging
- Out of scope:
  - changing gateway auth policy itself
  - introducing a new auth method

Required error classes:

- gateway unavailable
- token invalid or missing
- device identity required
- origin not allowed
- unknown connect failure

Interaction requirements:

- While connecting, show a single in-progress state.
- On failure, show:
  - normalized error title
  - short explanation
  - next step list
  - retry action
- On reconnect success, show a recovery state distinct from first-time success.

State requirements:

- Add a normalized connect error model in frontend state.
- The UI must not rely on raw gateway strings alone.
- The last normalized error should remain visible until the next connect attempt starts.

Implementation notes:

- Normalize request and close errors at the gateway client or gateway store layer.
- Map known gateway messages and codes into typed frontend errors.
- Keep the raw gateway message as a debug detail, but not as the only user-facing explanation.

Impacted surfaces:

- connect page
- gateway store
- gateway browser client error handling
- reconnect toast behavior

Acceptance criteria:

- A real `origin not allowed` response renders an origin-specific message.
- A real `device identity required` response renders an identity-specific message.
- Invalid token and gateway offline scenarios render distinct user guidance.
- Retry clears the previous error state and re-enters a clean connecting state.

Technical risks:

- Gateway failures may arrive as either request errors or close reasons.
- Some failure classes may initially require message-pattern matching until upstream codes are standardized.

### P0-2 Company Context Persistence

Background:
In real browser testing, selecting a company works in-session, but reloads and direct deep links can still drop the user back to `/select`. This breaks continuity and makes the app feel unreliable.

User story:
As an operator already inside a company, I want refreshes and deep links to preserve my active company context, so I can resume work without reselecting.

Scope:

- In scope:
  - persist active company identity locally
  - restore active company before route-level redirects run
  - validate persisted company identity against loaded config
- Out of scope:
  - multi-device state sync
  - server-driven route restoration

Functional requirements:

- Persist the active company ID in local storage independently of in-memory state.
- On boot:
  - load config
  - resolve active company from persisted value or config default
  - only redirect to `/select` after restoration fails
- Deep routes such as `/employees`, `/board`, `/automation`, `/dashboard`, and `/chat/:id` must not bounce to `/select` if a valid company exists.

Interaction requirements:

- During restoration, show a lightweight restoring state instead of redirecting immediately.
- If persisted company ID is stale or deleted, show a controlled fallback to `/select`.

State requirements:

- Add an explicit bootstrap phase for company restoration.
- Distinguish:
  - no config exists
  - config exists but active company is invalid
  - config exists and company is restored

Implementation notes:

- Persist `activeCompanyId` separately from full config cache.
- Avoid route guards that run before company bootstrap completes.
- Ensure switching company updates both in-memory state and persisted active company selection.

Impacted surfaces:

- app route gating
- company store
- company persistence layer
- full-screen onboarding routes

Acceptance criteria:

- Reloading any in-company route preserves current company when valid config exists.
- Opening a bookmarked deep route restores the company before rendering the page.
- Invalid persisted company IDs fall back to `/select` only after validation.

Technical risks:

- Current redirect logic runs early and may race against config restoration.
- Persisted active company can diverge from gateway-backed config if not validated carefully.

### P0-3 Dashboard Data Integrity

Background:
The live gateway returns valid `usage.cost` totals, but the dashboard still renders `--`. This creates a trust gap between actual backend state and visible product state.

User story:
As an operator reviewing reports, I want the dashboard to show real usage and cost values when the gateway has them, so I can trust the reporting layer.

Scope:

- In scope:
  - normalize `usage.cost` response parsing
  - display data freshness and load state
  - surface empty-state reason when data is unavailable
- Out of scope:
  - redesigning the whole dashboard
  - building new analytics metrics beyond current usage totals

Functional requirements:

- The gateway client must support the real response shape returned by the gateway.
- The dashboard must render:
  - total tokens
  - total cost
  - updated time
  - loading, stale, and unavailable states

Interaction requirements:

- During load, show a clear loading state.
- On success, render values and freshness metadata.
- On no-data, show a specific empty state, not raw placeholders.
- On parse or transport failure, show a recoverable error state.

State requirements:

- Track `loading`, `loaded`, `empty`, and `error` separately.
- Preserve last successful usage snapshot until a newer refresh succeeds or explicit invalidation occurs.

Implementation notes:

- Normalize the gateway response inside the gateway client, not page-level code.
- Add a typed adapter that supports both wrapped and direct payload shapes if necessary.
- Keep dashboard rendering logic simple by consuming a stable client contract.

Impacted surfaces:

- gateway client usage parser
- dashboard page
- any future report widgets reading cost or token totals

Acceptance criteria:

- When the gateway returns totals, the dashboard renders non-placeholder values.
- The dashboard shows last updated time.
- Failures no longer silently degrade to `--` without explanation.

Technical risks:

- Upstream response shape may vary by gateway version.
- Polling and stale state handling can produce flicker if not normalized centrally.

### P0-4 Unified Execution State Model

Background:
Real chat records show repeated mentions of waiting, timeout, lost contact, and manual fallback, but these states are mostly embedded in prose. Users must read long threads to understand current execution state.

User story:
As an operator managing several agents, I want the system to summarize execution state consistently across pages, so I can understand blockers quickly without reading full conversations.

Scope:

- In scope:
  - define a normalized execution state model
  - derive state from sessions, chat events, and known failure markers
  - reuse the same state badges and summaries across core pages
- Out of scope:
  - full task-object implementation
  - replacing chat history itself

Proposed normalized states:

- idle
- running
- waiting_input
- waiting_peer
- blocked_timeout
- blocked_tool_failure
- manual_takeover_required
- completed
- unknown

Functional requirements:

- Lobby cards, activity feed, board cards, and chat context must consume the same normalized state vocabulary.
- The system must support a summary layer that groups repeated coordination noise into a smaller number of state transitions.

Interaction requirements:

- Users should see the current normalized state near the responsible role or task.
- State transitions that require action must be visually distinct from passive status.
- Repeated timeout or waiting messages should collapse into one summarized blocker state where possible.

State derivation requirements:

- Derive state from:
  - session activity
  - chat event status
  - repeated timeout markers
  - explicit manual fallback markers
  - peer no-response conditions
- Keep raw evidence available for drill-down.

Implementation notes:

- Build a shared resolver module that converts raw gateway/session/chat signals into normalized states.
- Avoid duplicating state inference logic in each page.
- Expect partial inference until P1 task objects exist.

Impacted surfaces:

- lobby
- board
- chat
- automation
- future report widgets

Acceptance criteria:

- The same stalled workflow shows the same normalized state across lobby, board, and chat.
- Repeated waiting chatter is summarized into a smaller number of visible blocker states.
- Operators can identify actionable blockers without opening every session.

Technical risks:

- State inference from unstructured history is inherently lossy before task objectization.
- Historical sessions may contain inconsistent phrasing across agents and roles.

### P0-5 Manual Takeover Pack

Background:
Real sessions show that external execution failures often end in user manual action, but only after repeated retries, timeout chatter, and fragmented context gathering. The system needs a first-class manual takeover artifact.

User story:
As an operator asked to take over a failing task manually, I want a concise package of everything I need, so I can complete the task without reading the entire thread.

Scope:

- In scope:
  - define a structured takeover package
  - generate it when failure thresholds are crossed
  - surface it from chat, board, and lobby
- Out of scope:
  - fully automated human-in-the-loop approval workflows
  - external app automation reliability fixes themselves

Trigger conditions:

- repeated timeout threshold reached
- repeated tool/browser failure threshold reached
- peer unreachable beyond SLA
- explicit agent declaration that manual action is required

Required package fields:

- task title
- current owner
- source session
- failure summary
- last successful step
- failed step
- recommended next action
- required URL(s)
- required file path(s) or artifact reference(s)
- optional copyable operator note

Interaction requirements:

- The package should appear inline in chat and be linkable from board or lobby.
- Manual takeover should be visually distinct from passive failure states.
- The operator should be able to copy or reuse the package without reconstructing context.

State requirements:

- Generating a takeover package should also move the task or session into `manual_takeover_required`.
- Once the operator acknowledges takeover, the UI should reflect that ownership has shifted.

Implementation notes:

- Start with a generated summary assembled from recent session history and known failure markers.
- Keep the package schema stable even if the first version uses heuristics for field extraction.
- Add a lightweight acknowledgment action so the system can stop repeated escalation spam.

Impacted surfaces:

- chat page
- board page
- lobby activity stream
- future execution status resolver

Acceptance criteria:

- A failing workflow can generate a structured takeover package without requiring the user to read the full chat history.
- The package includes enough detail for a human to act immediately.
- Once generated, the workflow state changes to a clearly visible manual takeover state.

Technical risks:

- Some sessions may not contain enough clean structure to produce a perfect package in v1.
- Generated summaries may need fallback text when required fields cannot be inferred.

## P1: Workflow Structure

### P1-1 Task Object Model

Problem:
Tasks are inferred from chat content and markdown fragments rather than managed explicitly.

Requirement:
Introduce structured task entities with:

- owner
- source
- deliverable
- deadline
- status
- blocker
- fallback

Acceptance criteria:

- Board and chat can reference the same task record.
- Status changes do not depend on markdown parsing alone.

### P1-2 Handoff Object Model

Problem:
Critical handoff content lives in message text.

Requirement:
Model handoff artifacts such as:

- chapter handoff checklist
- review report
- settings or canon changes
- foreshadow tracking

Acceptance criteria:

- Handoff records are visible from the task and employee context.
- Missing handoff items are explicit and blocking when required.

### P1-3 Role SLA And Escalation Rules

Problem:
The system often waits passively for replies.

Requirement:
Define role-based escalation rules for no-reply, timeout, and repeated failure.

Acceptance criteria:

- The system automatically flags overdue work.
- The CEO surface receives escalations without requiring manual polling.
- Repeated timeout paths can recommend reassignment or manual takeover.

### P1-4 Scenario-Specific Automation Templates

Problem:
Automation templates do not match the real workflow of the active company.

Requirement:
Generate automation templates based on company type or template.

Example for novel creation:

- chapter publish tracking
- review SLA reminder
- 23:30 daily metrics digest
- milestone retro every 50k words

Acceptance criteria:

- Automation suggestions differ by company type.
- Suggested templates align with actual work being done.

### P1-5 Shared Knowledge Layer

Problem:
Global context is uneven across writer, reviewer, and editor roles.

Requirement:
Provide a company-level shared knowledge surface for:

- canon/settings
- role responsibilities
- project roadmap
- foreshadow inventory

Acceptance criteria:

- Multiple agents can reference the same shared state.
- Key project context does not depend on one person or one chat thread.

### P1-6 CEO Control Surface

Problem:
The CEO chat acts as a relay channel rather than a stronger operational cockpit.

Requirement:
Add a structured control layer for:

- active blockers
- waiting handoffs
- overdue items
- retry or takeover actions

Acceptance criteria:

- The CEO can identify the next management action without reading the full thread.
- Operational decisions become faster and less chat-dependent.

## P2: Optimization And Scale

### P2-1 Organizational Load Analysis

- Detect overloaded roles, idle roles, and single points of failure.

### P2-2 Template Replication

- Package successful company structures, workflows, and automations into reusable templates.

### P2-3 Outcome-Oriented Reporting

- Add completion rate, rework rate, timeout rate, manual takeover rate, and cycle time.

### P2-4 Agent Reliability Profiles

- Track per-agent execution success, latency, and failure mode patterns.

### P2-5 Retrospective Loop

- Convert repeated operational failures into structured process improvements.

## 11. Prioritized Build Slice

Recommended immediate sequence:

1. P0-1 Connection Error Typing And Guidance
2. P0-2 Company Context Persistence
3. P0-3 Dashboard Data Integrity
4. P0-4 Unified Execution State Model
5. P0-5 Manual Takeover Pack
6. P1-1 Task Object Model

## 12. Key Risks

- The product may add more surfaces without actually reducing orchestration cost.
- Strong role metaphor may hide weak execution reliability.
- Chat-first workflows may continue to leak state unless key objects move into product state.
- Browser automation may remain a brittle dependency for external task execution.

## 13. Open Questions

- Should the system optimize for operator control or for autonomous delegation by default?
- Which workflow objects should be strictly required before handoff can proceed?
- Should the CEO remain a conversational surface first, or become a dashboard first?
- How much company state should live in gateway-backed files versus frontend persistence?

## 14. Implementation Plan

### 14.1 Development Readiness

- Development can start immediately.
- `P0-1`, `P0-2`, and `P0-3` do not require a gateway protocol change.
- `P0-4` and `P0-5` should start after a short shared model pass to lock normalized execution states and the takeover-pack schema.
- Current repo verification is lightweight: `npm run build`, `npm run lint`, and manual browser checks. There is no automated test script in `package.json` yet, so first delivery should include a documented manual QA checklist.

### 14.2 Recommended Delivery Waves

#### Wave 1: Reliability Baseline

Scope:

- `P0-1 Connection Error Typing And Guidance`
- `P0-2 Company Context Persistence`
- `P0-3 Dashboard Data Integrity`

Target:

- 2 to 3 working days for one engineer
- 1 to 1.5 working days if split across two engineers

Exit criteria:

- connect failures are typed and actionable
- company context survives refresh and deep links
- dashboard cost/token data is trustworthy again

#### Wave 2: Actionable Operations Layer

Scope:

- `P0-4 Unified Execution State Model`
- `P0-5 Manual Takeover Pack`

Target:

- 2 to 3 additional working days for one engineer
- 1.5 to 2 working days if shared-state work and UI integration are split

Exit criteria:

- stalled work surfaces consistently across lobby, board, and chat
- manual takeover becomes a first-class action rather than a chat-only fallback

### 14.3 Shared Engineering Decisions Before Wave 2

These decisions should be locked before implementation of `P0-4` and `P0-5`:

- normalized execution states:
  - `idle`
  - `running`
  - `waiting_input`
  - `waiting_peer`
  - `blocked_timeout`
  - `blocked_tool_failure`
  - `manual_takeover_required`
  - `completed`
  - `unknown`
- manual takeover pack fields:
  - task title
  - owner role
  - target surface or channel
  - latest known blocker
  - recent evidence
  - recommended next step
  - source session key
  - generated timestamp
- severity rules:
  - timeout count threshold
  - tool failure markers such as `tab not found`
  - lost-contact markers such as `未回复` and `失联`

### 14.4 Build Slice Details

#### P0-1 Connection Error Typing And Guidance

Development goal:

- Convert raw websocket/request failures into a stable frontend error contract and render specific recovery guidance.

Proposed module changes:

- `src/infrastructure/gateway/openclaw/browser-client.ts`
  - preserve structured connect failure information from request errors and close reasons
  - stop collapsing everything into plain `"connect failed"`
- `src/infrastructure/gateway/store.ts`
  - add `connectErrorType`, `connectErrorMessage`, and `connectErrorDebug`
  - keep reconnect phase and typed error separate
- `src/presentation/connect/Page.tsx`
  - replace the generic troubleshooting list with per-error guidance blocks
  - render a reconnect-failed state distinct from first-connect failure

Suggested new types:

- `NormalizedConnectErrorType`
  - `gateway_unavailable`
  - `token_invalid`
  - `device_identity_required`
  - `origin_not_allowed`
  - `unknown`

Implementation notes:

- Create a small normalization helper, for example `src/infrastructure/gateway/connect-errors.ts`.
- Match both gateway error codes and message patterns because the live gateway currently leaks important failures through both paths.
- Keep the raw gateway code/message only in debug detail or console output.

Verification:

- wrong URL or stopped gateway
- empty or invalid token
- valid token with identity challenge failure
- valid token with origin rejection
- recovery after a successful retry

Estimate:

- 0.5 to 1 working day

#### P0-2 Company Context Persistence

Development goal:

- Make company restoration finish before route redirects decide whether the user belongs on `/select`.

Proposed module changes:

- `src/infrastructure/company/persistence/persistence.ts`
  - add a dedicated local-storage key for persisted active company selection
  - add helpers to read, write, and validate the active company ID
- `src/application/company/shell.ts`
  - introduce a bootstrap phase such as `idle | restoring | ready | missing`
  - restore active company from persisted selection before exposing route-ready state
  - update persisted active company on switch
- `src/App.tsx`
  - defer in-company redirects until company bootstrap is complete
  - show a restoring placeholder rather than immediate navigation churn

Suggested storage changes:

- keep `cyber_company_config` as the cached config blob
- add a separate key such as `cyber_company_active_company_id`

Implementation notes:

- Do not rely only on `config.activeCompanyId`; it is currently coupled to gateway-backed file state and may arrive later than route guards.
- Validate the persisted ID against loaded config and clear it when the company no longer exists.
- Preserve current behavior for first-time users with no config.

Verification:

- reload from `/lobby`
- reload from `/employees`
- reload from `/dashboard`
- open bookmarked `/chat/:id`
- stale company ID in local storage

Estimate:

- 1 working day

#### P0-3 Dashboard Data Integrity

Development goal:

- Normalize `usage.cost` into one stable client contract so page components stop guessing the gateway response shape.

Proposed module changes:

- `src/infrastructure/gateway/openclaw/client.ts`
  - adapt `getUsageCost()` to accept both direct payload and wrapped payload shapes
  - return a single `CostUsageSummary` contract
- `src/presentation/dashboard/Page.tsx`
  - replace raw `--` placeholder behavior with explicit `loading`, `loaded`, `empty`, and `error` rendering
  - display the last successful refresh time
- `src/presentation/lobby/Page.tsx`
  - reuse the stabilized usage response instead of assuming happy-path totals

Implementation notes:

- Normalize in the client layer, not in each page.
- Preserve the last successful snapshot in page state while a refresh is in-flight.
- If the gateway returns no totals, show an explained empty state rather than silent placeholders.

Verification:

- real gateway totals render in dashboard KPI cards
- last updated timestamp changes after refresh
- simulated parse failure produces visible error state
- lobby cost widget still renders when totals exist

Estimate:

- 0.5 working day

#### P0-4 Unified Execution State Model

Development goal:

- Derive a shared operational state vocabulary from live session rows, chat events, and failure markers, then reuse it across lobby, board, and chat.

Proposed module changes:

- new shared resolver module, for example `src/application/mission/execution-state.ts`
  - define the normalized state enum
  - expose `resolveExecutionState()` and summary helpers
- `src/presentation/lobby/Page.tsx`
  - replace simple `running | idle | stopped` employee status with normalized states where evidence exists
  - compress the unified stream into blocker-oriented summaries
- `src/presentation/board/Page.tsx`
  - attach normalized execution state to tracked tasks and session cards
- `src/presentation/chat/ChatPageContent.tsx`
  - render current execution state near the conversation header and latest run context

Implementation notes:

- Reuse existing inputs before inventing new storage:
  - session activity from `listSessions()`
  - chat run states such as `delta`, `final`, `aborted`, `error`
  - failure phrases already visible in live history
- Keep the resolver pure and unit-testable once a test harness is added.
- Accept partial inference for now; the resolver should expose both `state` and `evidence`.

Verification:

- the same stalled workflow shows the same state in lobby, board, and chat
- repeated timeout chatter collapses into a single blocker summary
- successful completion resolves to `completed`

Estimate:

- 1.5 to 2 working days

Dependencies:

- should land after `P0-1` through `P0-3`

#### P0-5 Manual Takeover Pack

Development goal:

- Generate a structured operator handoff artifact whenever the system decides automation is no longer the best next step.

Proposed module changes:

- new helper module, for example `src/application/delegation/takeover-pack.ts`
  - build a takeover pack from session metadata, normalized execution state, and recent chat evidence
- `src/presentation/chat/ChatPageContent.tsx`
  - add a visible takeover panel or action when the current run reaches `manual_takeover_required`
- `src/presentation/board/Page.tsx`
  - expose takeover actions from blocked tasks
- `src/presentation/lobby/Page.tsx`
  - surface takeover-required items in the top activity slice

Suggested takeover pack shape:

- `title`
- `ownerRole`
- `sessionKey`
- `state`
- `failureReason`
- `recentEvidence[]`
- `recommendedAction`
- `generatedAt`

Implementation notes:

- Start with a frontend-generated artifact; no gateway write-back is required for V1.
- Prefer copyable structured text or JSON plus a readable card in the UI.
- Trigger pack creation from normalized states plus thresholds, not from a single failed message.

Verification:

- repeated `tab not found` or timeout failures produce a takeover pack
- the pack includes enough context to act without opening the full thread
- operators can reach the pack from chat and board

Estimate:

- 1 to 1.5 working days

Dependencies:

- depends on `P0-4 Unified Execution State Model`

### 14.5 Start Recommendation

Recommended start order if one engineer begins today:

1. `P0-3` first because it is the smallest confidence-restoring fix.
2. `P0-1` next because it directly improves first-run usability.
3. `P0-2` next because it removes the most obvious continuity bug.
4. Lock the Wave 2 state vocabulary.
5. Implement `P0-4`, then `P0-5`.

Recommended split if two engineers begin today:

- Engineer A: `P0-1` and `P0-3`
- Engineer B: `P0-2`
- converge on `P0-4` schema review after Wave 1 lands

Practical answer:

- coding can start today
- the first usable Wave 1 branch should be ready in 2 to 3 working days
- a meaningful V1 reliability slice including takeover support should be ready in 4 to 6 working days

## 15. Delivery Tracker

Status vocabulary:

- `DONE`: production slice landed and verified in the real UI
- `DOING`: active implementation in progress or only partially landed
- `TODO`: not started yet
- `BLOCKED`: cannot proceed without an external dependency or product decision

Current status as of 2026-03-07:

| Item | Status | Notes |
| --- | --- | --- |
| `P0-1 Connection Error Typing And Guidance` | `DONE` | Typed connect failures landed in the gateway store and connect page; verified with invalid-token and real gateway flows. |
| `P0-2 Company Context Persistence` | `DONE` | Active company bootstrap and deep-link persistence landed; refresh on deep routes no longer drops to `/select`. |
| `P0-3 Dashboard Data Integrity` | `DONE` | `usage.cost` normalization, estimate labeling, and company-attributed usage landed; verified against real gateway totals. |
| `P0-4 Unified Execution State Model` | `DONE` | Shared execution resolver and badges now drive the main operational surfaces, while reporting and automation consume the same structured task state. |
| `P0-5 Manual Takeover Pack` | `DONE` | Shared takeover pack, chat rendering, board/lobby entry points, and copy flow are live, making manual takeover an explicit product path instead of hidden chat text. |
| `P1-1 Task Object Model` | `DONE` | Structured task fields now power board, chat, dashboard, and downstream analytics, giving the product a stable task object instead of markdown-only state. |
| `P1-2 Handoff Object Model` | `DONE` | Handoff objects now surface recipients, missing items, queue status, and blocking context across lobby, board, chat, and analytics. |
| `P1-3 Role SLA And Escalation Rules` | `DONE` | SLA queues now flag overdue tasks and handoffs in product state and feed CEO and reporting surfaces directly. |
| `P1-4 Scenario-Specific Automation Templates` | `DONE` | Automation recommendations now adapt to the detected company scenario, default executor, and existing cron jobs. |
| `P1-5 Shared Knowledge Layer` | `DONE` | Shared knowledge objects now exist at the company layer and can be written back from the lobby as persistent company state. |
| `P1-6 CEO Control Surface` | `DONE` | CEO-facing anomaly, workload, handoff, and next-action views are now visible in the lobby and CEO chat. |
| `P2-1 Organizational Load Analysis` | `DONE` | Employee management now computes per-role load, overload, and rebalance signals from live tasks, handoffs, sessions, and SLA alerts. |
| `P2-2 Template Replication` | `DONE` | The lobby can now export a reusable company blueprint, and company creation can paste that blueprint to recreate organization, knowledge, prompts, and automations. |
| `P2-3 Outcome-Oriented Reporting` | `DONE` | The dashboard now centers task completion, handoff closure, manual takeover, and SLA stability instead of only system and token metrics. |
| `P2-4 Agent Reliability Profiles` | `DONE` | Employee and dashboard surfaces now compute per-agent reliability scores and expose fragile vs. strong nodes. |
| `P2-5 Retrospective Loop` | `DONE` | The dashboard now generates action-oriented retrospectives and can write them back into persistent company state. |

## 16. Browser Verification Notes

Real-browser verification was rerun on 2026-03-07 after the product slices above landed.

Important distinction:

- `DONE` in the delivery tracker means the code slice is implemented.
- Real-browser acceptance is tracked separately here, because a clean browser profile exposed a remaining bootstrap/regression issue.

Observed browser results:

- Fresh browser session can open `/connect` and render the expected Gateway onboarding copy.
- In a clean browser profile with `cyber_company_gateway_url`, `cyber_company_gateway_token`, and `cyber_company_gateway_connected_once` seeded, navigation to `/lobby` does not settle into the expected company view.
- Playwright observed `/lobby` commit successfully, then the app URL drifted to `/select` instead of restoring a working active company route.
- In the same clean connected-browser run, DOM reads on the connected route state timed out, which means connected-route rendering is not yet healthy enough to call the full product flow browser-verified.
- CDP-based verification captured `timeout: Runtime.evaluate` for `/lobby`, followed by `timeout: Page.navigate` for `/employees`, `/dashboard`, and `/automation`.

Artifacts:

- `output/playwright/final-verify/01-connect-page-fresh.png`
- `output/playwright/final-verify/pw-01-connect.png`
- `output/playwright/final-verify/verification-summary.json`

Remaining verification/fix tasks:

1. Fix fresh-profile active-company bootstrap so a browser with valid Gateway credentials can restore directly into a working company context instead of falling back to `/select`.
2. Fix connected-route responsiveness after bootstrap so `/select`, `/lobby`, and downstream routes remain queryable in a real browser session.
3. Rerun real-browser acceptance on `/lobby`, `/employees`, `/dashboard`, `/automation`, and the CEO chat route after the bootstrap issue is fixed.
