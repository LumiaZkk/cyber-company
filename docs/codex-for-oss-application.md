# Codex for OSS Application Draft

Status: ready to customize and submit

- Program page: `https://developers.openai.com/codex/community/codex-for-oss/`
- Apply link: `https://openai.com/form/codex-for-oss/`

## Recommended positioning

Lead with this:

- Cyber Company is a real-work, OpenClaw-based multi-agent operations console
- it turns agent primitives into an operator-facing control plane
- it focuses on request closure, bottleneck detection, recovery, and execution visibility
- it is meant to help founders and operators turn ideas into finished outcomes, not just isolated chats

Do not lead with this:

- generic dashboard language
- “just a Vite app”
- vague “AI productivity” claims without workflow detail

## Current strengths

- Strong product thesis: move from agent chat to operable company workflows
- Real OpenClaw integration instead of mock orchestration
- Live evidence already shaped the product direction
- Clear extension value for the broader OpenClaw and OSS agent ecosystem

## Current gaps to close before submitting

- Make the repository public
- Add 2–4 screenshots or a short demo GIF
- Prepare one stable public repository URL
- Be ready to describe one real workflow the project already supports

The project now has:

- a real project README
- a contribution guide
- an `Apache-2.0` license
- a PRD describing the product and evidence base

## Recommended screenshot set

Best 4 to attach first:

- `output/playwright/codex-for-oss/02-ceo-home.png`
- `output/playwright/codex-for-oss/03-ceo-chat.png`
- `output/playwright/codex-for-oss/04-ops.png`
- `output/playwright/codex-for-oss/05-board.png`

Good optional fifth:

- `output/playwright/codex-for-oss/06-dashboard.png`

## Recommended short description

Cyber Company is an OpenClaw-based multi-agent operations console that helps one operator run a small AI company with roles, handoffs, request tracking, bottleneck detection, and recovery workflows.

## Recommended project summary

Cyber Company is an opinionated control plane built on top of OpenClaw. Instead of exposing only raw agents and chats, it models a working company with a CEO, managers, domain workers, departments, requests, handoffs, automation, and operational dashboards. The goal is to help a single operator turn real ideas into real execution by making ownership, blockers, and recovery paths visible across a multi-agent workflow.

## Recommended ecosystem / impact explanation

Cyber Company explores a missing layer in open-source agent tooling: the gap between powerful agent primitives and a reliable operator experience. OpenClaw already provides the execution substrate, but many real workflows still break down because ownership is unclear, requests do not really close, and recovery depends on manually reading long chat histories. This project turns those problems into explicit product state and operator-facing workflows.

Even if the project is still early, it is valuable as a reference implementation for the OSS agent ecosystem because it focuses on a hard and under-served problem: how to make multi-agent systems actually operable for real work.

## Recommended “why now” explanation

The project is at the point where open-sourcing and hardening it would unlock outsized value. The core product direction is already visible, but the next stage needs better documentation, more contributor-friendly workflows, stronger regression coverage, and more maintainer automation around reliability and review.

## Recommended use of support

### ChatGPT Pro with Codex

- maintain feature work and bug triage
- review and refactor complex request / handoff / lifecycle code paths
- draft contributor docs and onboarding material

### API credits

- automate pull request review for orchestration-heavy changes
- run maintainer workflows for docs, release prep, and issue triage
- build scenario-based checks around request closure, recovery, and UI regressions

### Codex Security

- review approval surfaces, persistence flows, and gateway-facing integrations
- audit request recovery and reconciliation logic
- inspect cases where operator-visible state can drift from underlying execution state

## Ready-to-paste application draft

Use this as the base answer in English:

> I maintain Cyber Company, an OpenClaw-based multi-agent operations console designed to help a single operator run a small AI company that can complete real work. The project adds a CEO-first control plane on top of OpenClaw, with company structure, role-based orchestration, request and handoff tracking, bottleneck detection, recovery actions, and operational dashboards.
>
> The reason I believe this project matters to the ecosystem is that there is still a large gap between raw agent capabilities and real operator usability. Many OSS agent projects can create agents and route messages, but users still have to manually reconstruct ownership, chase missing replies, and recover from broken workflows. Cyber Company focuses on turning those failure modes into explicit product state and visible workflows.
>
> If accepted, I would use ChatGPT Pro with Codex and API credits to speed up maintainer work across PR review, bug triage, documentation, regression checks, and release workflows. I would also use the support to harden the most complex parts of the project: request closure, handoff recovery, operator approval flows, and gateway-facing reliability. Codex Security would be especially valuable for reviewing the security-sensitive parts of the operator control plane and execution recovery flows.
>
> The project is still early, but it is already driven by real workflow needs rather than toy demos, and I believe it can become a useful open-source reference for how to make multi-agent systems more operable in practice.

## Submission checklist

You will still need to fill in:

- your public repository URL
- your name
- your email
- your GitHub handle
- your OpenAI Organization ID if the form asks for it

## Suggested honesty guardrails

- Do not claim broad adoption unless you can show it
- Do not claim production readiness if the project is still experimental
- Do claim that the project is real-use-oriented and grounded in live workflow evidence
- Do emphasize why the project matters even if it is still early
