import { describe, expect, it } from "vitest";
import { buildRuntimeInspectorSurface } from "./index";
import type {
  AgentRunRecord,
  AgentRuntimeRecord,
  AgentSessionRecord,
  CanonicalAgentStatusHealthRecord,
} from "../agent-runtime";
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
        agentId: "coo",
        nickname: "COO",
        role: "Chief Operating Officer",
        isMeta: true,
        metaRole: "coo",
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
    toolNamesSeen: [],
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

function createStatusHealth(
  overrides: Partial<CanonicalAgentStatusHealthRecord> = {},
): CanonicalAgentStatusHealthRecord {
  return {
    source: "fallback",
    coverage: "fallback",
    coveredAgentCount: 0,
    expectedAgentCount: 3,
    missingAgentIds: ["ceo", "coo", "cto"],
    isComplete: false,
    generatedAt: 100,
    note: "fallback",
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
      activeAgentStatusHealth: createStatusHealth(),
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
    expect(surface?.focusAgent?.agentId).toBe("cto");
    expect(surface?.triageQueue[0]?.agentId).toBe("cto");
    expect(surface?.timeline[0]).toMatchObject({
      agentId: "cto",
      tone: "info",
    });
    expect(surface?.recommendedActions[0]?.to).toBe("/chat/cto");
    expect(surface?.replay[0]).toMatchObject({
      agentId: "cto",
      modalityLabel: "Run",
      phaseLabel: "执行中",
      tone: "info",
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
      activeAgentStatusHealth: createStatusHealth(),
    });

    const cto = surface?.agents.find((entry) => entry.agentId === "cto");
    expect(cto?.attention).toBe("critical");
    expect(cto?.attentionReason).toContain("升级");
    expect(surface?.criticalAgents).toBe(1);
  });

  it("surfaces recovered execution context when runtime signals are missing", () => {
    const surface = buildRuntimeInspectorSurface({
      activeCompany: createCompany(),
      activeWorkItems: [] as WorkItemRecord[],
      activeDispatches: [] as DispatchRecord[],
      activeSupportRequests: [] as SupportRequestRecord[],
      activeEscalations: [] as EscalationRecord[],
      activeAgentSessions: [
        createSession({
          sessionState: "idle",
          executionContext: {
            dispatchId: "dispatch-recovered",
            workItemId: "work-recovered",
            assignment: "继续完成 execution recovery",
            objective: "把缺失的运行信号恢复成可解释上下文。",
            checkoutState: "claimed",
            actorId: "cto",
            sessionKey: "agent:cto:main",
            updatedAt: 160,
            checkedOutAt: 160,
            releasedAt: null,
            releaseReason: null,
            source: "dispatch_checkout",
          },
        }),
      ],
      activeAgentRuns: [] as AgentRunRecord[],
      activeAgentRuntime: [] as AgentRuntimeRecord[],
      activeAgentStatuses: [],
      activeAgentStatusHealth: createStatusHealth(),
    });

    const cto = surface?.agents.find((entry) => entry.agentId === "cto");
    expect(cto).toMatchObject({
      activityLabel: "恢复执行中",
      sceneActivityLabel: "继续完成 execution recovery",
      currentAssignment: "继续完成 execution recovery",
    });
    expect(surface?.replay[0]).toMatchObject({
      agentId: "cto",
      modalityLabel: "Session",
      phaseLabel: "恢复执行",
      title: "CTO 已恢复执行上下文",
    });
  });

  it("builds a handling chain so the owner can see who is waiting on whom", () => {
    const surface = buildRuntimeInspectorSurface({
      activeCompany: createCompany(),
      activeWorkItems: [
        createWorkItem({
          id: "topic:mission:confirmation",
          title: "Close the launch plan",
          ownerActorId: "coo",
          ownerLabel: "COO",
          batonActorId: "ceo",
          batonLabel: "CEO",
          status: "waiting_owner",
          stageGateStatus: "waiting_confirmation",
          nextAction: "等待 CEO 确认后启动执行。",
          displayNextAction: "等待 CEO 确认后启动执行。",
          updatedAt: 140,
        }),
      ],
      activeDispatches: [] as DispatchRecord[],
      activeSupportRequests: [] as SupportRequestRecord[],
      activeEscalations: [] as EscalationRecord[],
      activeAgentSessions: [] as AgentSessionRecord[],
      activeAgentRuns: [] as AgentRunRecord[],
      activeAgentRuntime: [] as AgentRuntimeRecord[],
      activeAgentStatuses: [],
      activeAgentStatusHealth: createStatusHealth(),
    });

    expect(surface?.chainLinks[0]).toMatchObject({
      kind: "work_item",
      stateLabel: "待确认",
      fromAgentId: "coo",
      toAgentId: "ceo",
      summary: "等待 CEO 确认后启动执行。",
    });
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
      activeAgentStatusHealth: createStatusHealth(),
    });

    const ceo = surface?.agents.find((entry) => entry.agentId === "ceo");
    const cto = surface?.agents.find((entry) => entry.agentId === "cto");

    expect(ceo?.attention).toBe("healthy");
    expect(cto?.attention).toBe("critical");
    expect(surface?.focusAgent?.agentId).toBe("cto");
    expect(surface?.triageQueue[0]?.agentId).toBe("cto");
    expect(surface?.watchlist[0]?.agentId).toBe("cto");
    expect(surface?.timeline[0]).toMatchObject({
      agentId: "cto",
      tone: "danger",
    });
  });

  it("shows claimed dispatches as active execution links", () => {
    const surface = buildRuntimeInspectorSurface({
      activeCompany: createCompany(),
      activeWorkItems: [] as WorkItemRecord[],
      activeDispatches: [
        {
          id: "dispatch-claimed",
          workItemId: "work-claimed",
          roomId: "workitem:work-claimed",
          title: "继续推进 runtime closeout",
          summary: "把 checkout / locking 收好。",
          fromActorId: "ceo",
          targetActorIds: ["cto"],
          status: "acknowledged",
          checkoutState: "claimed",
          checkoutActorId: "cto",
          checkoutSessionKey: "agent:cto:main",
          checkedOutAt: 150,
          createdAt: 100,
          updatedAt: 150,
        },
      ] satisfies DispatchRecord[],
      activeSupportRequests: [] as SupportRequestRecord[],
      activeEscalations: [] as EscalationRecord[],
      activeAgentSessions: [] as AgentSessionRecord[],
      activeAgentRuns: [] as AgentRunRecord[],
      activeAgentRuntime: [] as AgentRuntimeRecord[],
      activeAgentStatuses: [],
      activeAgentStatusHealth: createStatusHealth(),
    });

    expect(surface?.chainLinks.find((link) => link.kind === "dispatch")).toMatchObject({
      stateLabel: "执行中",
      toAgentId: "cto",
    });
    expect(surface?.chainLinks.find((link) => link.kind === "dispatch")?.summary).toContain("已接手");
  });

  it("surfaces tool-running and terminal-completed replay events", () => {
    const surface = buildRuntimeInspectorSurface({
      activeCompany: createCompany(),
      activeWorkItems: [
        createWorkItem({
          id: "topic:mission:tooling",
          title: "Run consistency checks",
          ownerActorId: "cto",
          batonActorId: "cto",
          updatedAt: 110,
        }),
      ],
      activeDispatches: [] as DispatchRecord[],
      activeSupportRequests: [] as SupportRequestRecord[],
      activeEscalations: [] as EscalationRecord[],
      activeAgentSessions: [
        createSession(),
        createSession({
          agentId: "ceo",
          sessionKey: "agent:ceo:main",
          sessionState: "idle",
          lastSeenAt: 160,
          lastTerminalRunState: "completed",
          lastTerminalSummary: "agent:ceo:main 最近一次执行已完成。",
          source: "lifecycle",
        }),
      ],
      activeAgentRuns: [
        createRun({
          streamKindsSeen: ["lifecycle", "tool"],
        }),
      ],
      activeAgentRuntime: [
        createRuntime(),
        createRuntime({
          agentId: "ceo",
          availability: "idle",
          activeSessionKeys: [],
          activeRunIds: [],
          lastSeenAt: 160,
          lastBusyAt: 140,
          lastIdleAt: 160,
          latestTerminalAt: 160,
          latestTerminalSummary: "agent:ceo:main 最近一次执行已完成。",
          currentWorkload: "free",
          runtimeEvidence: [
            { kind: "status", summary: "agent:ceo:main 最近一次执行已完成。", timestamp: 160 },
          ],
        }),
      ],
      activeAgentStatuses: [],
      activeAgentStatusHealth: createStatusHealth(),
    });

    expect(surface?.replay[0]).toMatchObject({
      agentId: "ceo",
      modalityLabel: "Terminal",
      phaseLabel: "完成",
      tone: "success",
    });
    expect(surface?.replay.find((event) => event.agentId === "cto")).toMatchObject({
      modalityLabel: "Tool",
      phaseLabel: "执行中",
      tone: "info",
    });
    expect(surface?.historyWindow.find((event) => event.sourceLabel === "Replay · Tool")).toMatchObject({
      agentId: "cto",
      sourceLabel: "Replay · Tool",
    });
  });

  it("uses authority partial coverage for available members and local fallback for missing members", () => {
    const surface = buildRuntimeInspectorSurface({
      activeCompany: createCompany(),
      activeWorkItems: [createWorkItem()],
      activeDispatches: [] as DispatchRecord[],
      activeSupportRequests: [] as SupportRequestRecord[],
      activeEscalations: [] as EscalationRecord[],
      activeAgentSessions: [createSession()],
      activeAgentRuns: [createRun()],
      activeAgentRuntime: [createRuntime()],
      activeAgentStatuses: [
        {
          agentId: "cto",
          runtimeState: "busy",
          coordinationState: "executing",
          interventionState: "healthy",
          reason: "Authority reports CTO is still executing.",
          currentAssignment: "Build platform",
          currentObjective: "Ship runtime inspector",
          latestSignalAt: 100,
          activeSessionCount: 1,
          activeRunCount: 1,
          openDispatchCount: 0,
          blockedDispatchCount: 0,
          openSupportRequestCount: 0,
          blockedSupportRequestCount: 0,
          openRequestCount: 0,
          blockedRequestCount: 0,
          openHandoffCount: 0,
          blockedHandoffCount: 0,
          openEscalationCount: 0,
          blockedWorkItemCount: 0,
          primaryWorkItemId: "topic:mission:platform",
        },
      ],
      activeAgentStatusHealth: createStatusHealth({
        source: "authority",
        coverage: "authority_partial",
        coveredAgentCount: 1,
        expectedAgentCount: 3,
        missingAgentIds: ["ceo", "coo"],
        note: "Authority missing executive status rows.",
      }),
    });

    const cto = surface?.agents.find((entry) => entry.agentId === "cto");
    const ceo = surface?.agents.find((entry) => entry.agentId === "ceo");

    expect(surface?.statusHealth.coverage).toBe("authority_partial");
    expect(surface?.statusCoverage.label).toBe("Authority 局部覆盖");
    expect(cto?.statusOrigin).toBe("authority");
    expect(cto?.reason).toBe("Authority reports CTO is still executing.");
    expect(ceo?.statusOrigin).toBe("fallback");
  });
});
