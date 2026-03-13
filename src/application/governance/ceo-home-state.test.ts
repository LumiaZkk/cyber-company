import { describe, expect, it } from "vitest";
import { buildCeoHomeSnapshot } from "./ceo-home-state";
import type { AgentSessionRecord } from "../agent-runtime";
import type { GatewaySessionRow, ChatMessage } from "../gateway";
import type { Company } from "../../domain/org/types";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "Cyber Company",
    description: "Runtime visibility tests",
    icon: "building",
    template: "default",
    createdAt: 1,
    quickPrompts: [],
    departments: [
      {
        id: "dep-ceo",
        name: "Executive",
        leadAgentId: "ceo",
      },
      {
        id: "dep-tech",
        name: "Technology",
        leadAgentId: "cto",
      },
    ],
    employees: [
      {
        agentId: "ceo",
        nickname: "CEO",
        role: "Chief Executive Officer",
        isMeta: true,
        metaRole: "ceo",
        departmentId: "dep-ceo",
      },
      {
        agentId: "cto",
        nickname: "CTO",
        role: "Chief Technology Officer",
        isMeta: true,
        metaRole: "cto",
        departmentId: "dep-tech",
      },
    ],
    tasks: [],
    handoffs: [],
    requests: [],
    supportRequests: [],
    escalations: [],
    decisionTickets: [],
  };
}

function createSession(overrides: Partial<GatewaySessionRow> = {}): GatewaySessionRow {
  return {
    key: overrides.key ?? "agent:cto:main",
    actorId: overrides.actorId ?? "cto",
    kind: overrides.kind ?? "direct",
    label: overrides.label ?? "CTO main",
    displayName: overrides.displayName ?? "CTO main",
    derivedTitle: overrides.derivedTitle ?? "CTO main",
    lastMessagePreview: overrides.lastMessagePreview ?? "still working",
    updatedAt: overrides.updatedAt ?? 0,
    abortedLastRun: overrides.abortedLastRun,
  };
}

describe("buildCeoHomeSnapshot", () => {
  it("prefers agent session runtime over stale session activity heuristics", () => {
    const activeAgentSessions: AgentSessionRecord[] = [
      {
        sessionKey: "agent:cto:main",
        agentId: "cto",
        providerId: "openclaw",
        sessionState: "running",
        lastSeenAt: 10,
        lastStatusSyncAt: 10,
        lastMessageAt: 10,
        abortedLastRun: false,
        lastError: null,
        source: "lifecycle",
      },
    ];

    const snapshot = buildCeoHomeSnapshot({
      company: createCompany(),
      sessions: [createSession({ updatedAt: 1 })],
      ceoHistory: [] as ChatMessage[],
      currentTime: 1_000_000,
      activeAgentSessions,
      activeAgentRuntime: [],
      activeRoomRecords: [],
      activeRoomBindings: [],
      activeWorkItems: [],
      activeSupportRequests: [],
      activeEscalations: [],
      activeDecisionTickets: [],
    });

    const ctoCard = snapshot.managerCards.find((card) => card.agentId === "cto");
    expect(ctoCard?.state).toBe("running");
  });
});
