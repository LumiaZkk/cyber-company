import { describe, expect, it } from "vitest";
import { buildRuntimeInspectorSurface } from "./index";
import type { AgentRunRecord, AgentRuntimeRecord, AgentSessionRecord } from "../agent-runtime";
import type { DispatchRecord, EscalationRecord, SupportRequestRecord } from "../../domain/delegation/types";
import type { WorkItemRecord } from "../../domain/mission/types";
import type { Company } from "../../domain/org/types";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "Cyber Company",
    description: "Runtime inspector tests",
    icon: "building",
    template: "default",
    createdAt: 1,
    quickPrompts: [],
    departments: [
      { id: "dep-exec", name: "Executive", leadAgentId: "ceo" },
      { id: "dep-tech", name: "Technology", leadAgentId: "cto" },
    ],
    employees: [
      {
        agentId: "ceo",
        nickname: "CEO",
        role: "Chief Executive Officer",
        isMeta: true,
        metaRole: "ceo",
        departmentId: "dep-exec",
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

function createRuntime(overrides: Partial<AgentRuntimeRecord> = {}): AgentRuntimeRecord {
  return {
    agentId: "cto",
    providerId: "openclaw",
    availability: "busy",
    activeSessionKeys: ["agent:cto:main"],
    activeRunIds: ["run-1"],
    lastSeenAt: 100,
    lastBusyAt: 100,
    lastIdleAt: null,
    currentWorkload: "busy",
    runtimeEvidence: [{ kind: "run", summary: "agent:cto:main 正在执行 (running)", timestamp: 100 }],
    ...overrides,
  };
}

function createSession(overrides: Partial<AgentSessionRecord> = {}): AgentSessionRecord {
  return {
    sessionKey: "agent:cto:main",
    agentId: "cto",
    providerId: "openclaw",
    sessionState: "running",
    lastSeenAt: 100,
    lastStatusSyncAt: 100,
    lastMessageAt: 100,
    abortedLastRun: false,
    lastError: null,
    source: "lifecycle",
    ...overrides,
  };
}

function createRun(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    runId: "run-1",
    agentId: "cto",
    sessionKey: "agent:cto:main",
    providerId: "openclaw",
    state: "running",
    startedAt: 90,
    lastEventAt: 100,
    endedAt: null,
    streamKindsSeen: ["lifecycle"],
    error: null,
    ...overrides,
  };
}

function createWorkItem(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: "topic:mission:platform",
    workKey: "topic:mission:platform",
    kind: "strategic",
    roundId: "topic:mission:platform@100",
    companyId: "company-1",
    title: "Build platform",
    goal: "Ship runtime inspector",
    headline: "Build platform",
    displayStage: "执行中",
    displaySummary: "Current mission",
    displayOwnerLabel: "CTO",
    displayNextAction: "Keep coding",
    status: "active",
    lifecyclePhase: "active_requirement",
    stageGateStatus: "none",
    stageLabel: "执行中",
    ownerActorId: "cto",
    ownerLabel: "CTO",
    batonActorId: "cto",
    batonLabel: "CTO",
    roomId: "workitem:topic:mission:platform",
    artifactIds: [],
    dispatchIds: [],
    startedAt: 90,
    updatedAt: 100,
    summary: "Build the runtime inspector",
    nextAction: "Keep coding",
    steps: [],
    ...overrides,
  };
}

describe("buildRuntimeInspectorSurface", () => {
  it("classifies busy technical agents into the tech lab and surfaces current work", () => {
    const surface = buildRuntimeInspectorSurface({
      activeCompany: createCompany(),
      activeWorkItems: [createWorkItem()],
      activeDispatches: [] as DispatchRecord[],
      activeSupportRequests: [] as SupportRequestRecord[],
      activeEscalations: [] as EscalationRecord[],
      activeAgentSessions: [createSession()],
      activeAgentRuns: [createRun()],
      activeAgentRuntime: [createRuntime()],
      activeAgentStatuses: [],
    });

    const cto = surface?.agents.find((entry) => entry.agentId === "cto");
    expect(cto).toMatchObject({
      availability: "busy",
      activityLabel: "构建中",
      sceneZoneId: "tech-lab",
      currentAssignment: "Build platform",
      activeSessionCount: 1,
      activeRunCount: 1,
    });
  });

  it("marks escalated agents as critical even if runtime is still running", () => {
    const surface = buildRuntimeInspectorSurface({
      activeCompany: createCompany(),
      activeWorkItems: [createWorkItem()],
      activeDispatches: [] as DispatchRecord[],
      activeSupportRequests: [] as SupportRequestRecord[],
      activeEscalations: [
        {
          id: "esc-1",
          sourceType: "work_item",
          sourceId: "topic:mission:platform",
          companyId: "company-1",
          targetActorId: "cto",
          reason: "SLA breach",
          severity: "critical",
          status: "open",
          createdAt: 120,
          updatedAt: 120,
        },
      ] satisfies EscalationRecord[],
      activeAgentSessions: [createSession()],
      activeAgentRuns: [createRun()],
      activeAgentRuntime: [createRuntime()],
      activeAgentStatuses: [],
    });

    const cto = surface?.agents.find((entry) => entry.agentId === "cto");
    expect(cto?.attention).toBe("critical");
    expect(cto?.attentionReason).toContain("升级");
    expect(surface?.criticalAgents).toBe(1);
  });

  it("does not attribute downstream blocked work to the CEO only because they started it", () => {
    const surface = buildRuntimeInspectorSurface({
      activeCompany: createCompany(),
      activeWorkItems: [
        createWorkItem({
          status: "blocked",
          ownerActorId: "cto",
          batonActorId: "cto",
          sourceActorId: "ceo",
        }),
      ],
      activeDispatches: [] as DispatchRecord[],
      activeSupportRequests: [] as SupportRequestRecord[],
      activeEscalations: [] as EscalationRecord[],
      activeAgentSessions: [createSession()],
      activeAgentRuns: [createRun()],
      activeAgentRuntime: [createRuntime()],
      activeAgentStatuses: [],
    });

    const ceo = surface?.agents.find((entry) => entry.agentId === "ceo");
    const cto = surface?.agents.find((entry) => entry.agentId === "cto");

    expect(ceo?.attention).toBe("healthy");
    expect(cto?.attention).toBe("critical");
  });
});
