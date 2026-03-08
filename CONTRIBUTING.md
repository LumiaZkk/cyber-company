# Contributing to Cyber Company

Thanks for your interest in Cyber Company.

This project is an opinionated control plane on top of OpenClaw. The main goal is to help a single operator run a small AI team that can complete real work with less manual coordination.

## Local setup

### Prerequisites

- Node.js 22+
- A running OpenClaw Gateway

### Install and run

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Useful commands

```bash
npm run dev
npm run build
npm run lint
```

## Good contribution areas

- reliability fixes for long-running workflows
- request / handoff visibility and recovery
- company templates and blueprint workflows
- operational UX for CEO / board / chat surfaces
- documentation for setup, architecture, and real use cases

## Project boundaries

Keep the app-layer boundary clear:

- OpenClaw is the execution and transport layer
- Cyber Company is the company model, control plane, and operator UX

When possible, model workflow state explicitly in the app instead of hiding it inside chat prose.

## Reporting bugs

Please include:

- what you expected to happen
- what actually happened
- reproduction steps
- browser and platform details
- relevant screenshots or console output

If the issue depends on gateway behavior, include the OpenClaw version and a minimal scenario.

## Security and secrets

- never commit real gateway tokens
- never commit personal or production configuration values
- use obviously fake placeholders in examples and docs

## Architecture pointers

- `src/features/company/` for company config and persistence
- `src/features/requests/` for request inference, health, and reconciliation
- `src/features/handoffs/` for handoff state
- `src/features/execution/` for lifecycle and bottleneck summaries
- `src/features/gateway/` for gateway integration
- `docs/cyber-company-prd.md` for current product framing

## Scope guidance

Please keep changes focused. Small, well-explained pull requests are much easier to review than broad rewrites.
