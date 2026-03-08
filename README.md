# Cyber Company

Cyber Company is a CEO-first multi-agent operations console built on top of OpenClaw.

It turns raw agent chats, sessions, automations, and handoffs into a small working company with roles, departments, requests, blockers, recovery actions, and operator-facing dashboards.

## Why this exists

Most agent tooling gives you powerful primitives but still leaves the human operator doing too much orchestration work by hand:

- figuring out who owns the current bottleneck
- checking whether a cross-agent ask is truly closed
- recovering after missing replies, tool failures, or stale handoffs
- reconstructing state from long chat threads

Cyber Company adds an opinionated control plane for real work. It is designed for people who want AI agents to actually move a project forward, not just produce isolated chat replies.

## What it does

- Connects to an OpenClaw Gateway and restores company state across reloads
- Creates AI companies with CEO / HR / CTO / COO plus domain workers
- Supports starter templates and blueprint import / export
- Tracks requests, handoffs, blockers, and execution focus as app state
- Exposes CEO-first orchestration views instead of a flat chat list
- Surfaces recovery actions for stale blocked work and missing replies
- Attributes session activity and usage back to the company

## Product surfaces

- `CEO Home` (`/`) for the current bottleneck, company health, and next action
- `Operations Hall` (`/ops`) for anomalies, recovery, quick dispatch, and activity
- `Chat` (`/chat/:agentId`) for role-based conversations plus lifecycle context
- `Employees` (`/employees`) for org structure, employee state, and org fixes
- `Board` (`/board`) for cross-task execution state
- `Automation` (`/automation`) for recurring work patterns
- `Dashboard` (`/dashboard`) for usage, cost attribution, and outcomes

## Screenshots

### CEO Home

![CEO Home](docs/images/ceo-home.png)

### CEO Chat

![CEO Chat](docs/images/ceo-chat.png)

### Operations Hall

![Operations Hall](docs/images/ops.png)

### Board

![Board](docs/images/board.png)

## Relationship to OpenClaw

Cyber Company is not a replacement for OpenClaw. It uses OpenClaw as the execution and transport layer, then adds a higher-level operations model on top.

- OpenClaw handles agents, sessions, tools, approvals, routing, and automations
- Cyber Company handles company structure, request closure, bottleneck detection, and recovery UX

## Current status

This project is experimental but real-use-oriented. It has been shaped by live gateway-backed workflows and repeated reliability fixes around long-running, multi-agent work.

The current UI is Chinese-first. The repository is being prepared for broader open-source collaboration.

For more context, see `docs/cyber-company-prd.md`.

## Quick start

### Prerequisites

- Node.js 22+
- A running OpenClaw Gateway

### Install

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, connect to your gateway, then create or select a company.

If you are running OpenClaw locally, the default gateway is usually `ws://localhost:18789`.

## Typical flow

1. Start or connect to an OpenClaw Gateway.
2. Open Cyber Company in the browser.
3. Create a company from a template or import a blueprint.
4. Let the app provision CEO / HR / CTO / COO and role workers.
5. Use the CEO homepage to spot the current bottleneck.
6. Jump into the owner’s chat, recover, reassign, or escalate as needed.
7. Review requests, handoffs, automation, and cost from the board, ops, and dashboard views.

## Development

```bash
npm run dev
npm run build
npm run lint
```

Key files:

- `src/App.tsx`
- `src/pages/CEOHomePage.tsx`
- `src/pages/CompanyLobby.tsx`
- `src/pages/ChatPage.tsx`
- `docs/cyber-company-prd.md`

## Contributing

Contributions are welcome. See `CONTRIBUTING.md` for setup notes and scope guidance.

## Roadmap

- strengthen open-source onboarding and contributor docs
- ship more production-ready company templates
- harden long-running workflow recovery
- publish more real-world case studies and usage examples
