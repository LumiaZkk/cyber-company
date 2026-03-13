import { describe, expect, it } from "vitest";
import {
  applyProviderRuntimeEvent,
  applyProviderSessionStatusToAgentRuntime,
  applyProviderSessionStatusToAgentSessions,
  buildCanonicalAgentStatusProjection,
  buildAgentRuntimeProjection,
  buildAgentSessionRecordsFromSessions,
  normalizeProviderSessionStatus,
} from "./index";
import type { DispatchRecord } from "../../domain/delegation/types";
import type { Company } from "../../domain/org/types";
import type { GatewaySessionRow } from "../../infrastructure/gateway/runtime/types";

function createSession(input: Partial<GatewaySessionRow> & Pick<GatewaySessionRow, "key">): GatewaySessionRow {
  return {
    key: input.key,
    actorId: input.actorId ?? null,
    kind: input.kind ?? "direct",
    label: input.label ?? input.key,
    displayName: input.displayName ?? input.label ?? input.key,
    derivedTitle: input.derivedTitle ?? input.label ?? input.key,
    lastMessagePreview: input.lastMessagePreview ?? "",
    updatedAt: input.updatedAt ?? Date.now(),
    abortedLastRun: input.abortedLastRun,
  };
}

function createCompany(): Company {
  return {
    id: "company-1",
    name: "Cyber Company",
    description: "runtime projection tests",
    icon: "building",
    template: "default",
    createdAt: 1,
    quickPrompts: [],
    departments: [
      { id: "dep-ceo", name: "Executive", leadAgentId: "ceo" },
      { id: "dep-tech", name: "Technology", leadAgentId: "cto" },
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

describe("agent runtime projection", () => {
  it("marks an agent busy when any session is running", () => {
    const sessions = buildAgentSessionRecordsFromSessions({
      providerId: "openclaw",
      sessions: [
        createSession({ key: "agent:cto:main", actorId: "cto", updatedAt: 100 }),
        createSession({ key: "agent:cto:review", actorId: "cto", updatedAt: 90 }),
      ],
    });
    const updatedSessions = applyProviderSessionStatusToAgentSessions({
      sessions,
      status: normalizeProviderSessionStatus("openclaw", "agent:cto:review", {
        actorId: "cto",
        state: "running",
        updatedAt: 120,
      }),
    });

    const runtime = buildAgentRuntimeProjection({
      providerId: "openclaw",
      sessions: updatedSessions,
      runs: [],
    });

    expect(runtime).toHaveLength(1);
    expect(runtime[0]).toMatchObject({
      agentId: "cto",
      availability: "busy",
      currentWorkload: "busy",
      activeSessionKeys: ["agent:cto:review"],
    });
  });

  it("tracks run lifecycle and removes terminal runs after completion", () => {
    const accepted = applyProviderRuntimeEvent({
      sessions: [],
      runs: [],
      event: {
        providerId: "openclaw",
        agentId: "cto",
        sessionKey: "agent:cto:main",
        runId: "run-1",
        streamKind: "lifecycle",
        runState: "accepted",
        timestamp: 100,
      },
    });

    expect(accepted.runs).toHaveLength(1);
    expect(accepted.runs[0]?.state).toBe("accepted");

    const streaming = applyProviderRuntimeEvent({
      sessions: accepted.sessions,
      runs: accepted.runs,
      event: {
        providerId: "openclaw",
        agentId: "cto",
        sessionKey: "agent:cto:main",
        runId: "run-1",
        streamKind: "assistant",
        runState: "streaming",
        timestamp: 110,
      },
    });

    expect(streaming.sessions[0]?.sessionState).toBe("streaming");
    expect(streaming.runs[0]?.state).toBe("streaming");

    const completed = applyProviderRuntimeEvent({
      sessions: streaming.sessions,
      runs: streaming.runs,
      event: {
        providerId: "openclaw",
        agentId: "cto",
        sessionKey: "agent:cto:main",
        runId: "run-1",
        streamKind: "lifecycle",
        runState: "completed",
        timestamp: 130,
      },
    });

    expect(completed.runs).toHaveLength(0);
    expect(completed.sessions[0]?.sessionState).toBe("idle");
  });

  it("prefers session status snapshots when the provider reports idle or error", () => {
    const sessions = buildAgentSessionRecordsFromSessions({
      providerId: "openclaw",
      sessions: [createSession({ key: "agent:cto:main", actorId: "cto", updatedAt: 100 })],
    });

    const idle = applyProviderSessionStatusToAgentSessions({
      sessions,
      status: normalizeProviderSessionStatus("openclaw", "agent:cto:main", {
        actorId: "cto",
        status: "idle",
        updatedAt: 150,
      }),
    });

    expect(idle[0]).toMatchObject({
      sessionState: "idle",
      source: "session_status",
      lastStatusSyncAt: expect.any(Number),
    });

    const errored = applyProviderSessionStatusToAgentSessions({
      sessions: idle,
      status: normalizeProviderSessionStatus("openclaw", "agent:cto:main", {
        actorId: "cto",
        error: "tool failed",
        updatedAt: 180,
      }),
    });

    expect(errored[0]).toMatchObject({
      sessionState: "error",
      lastError: "tool failed",
    });
  });

  it("repairs runtime from session_status when lifecycle events are missing", () => {
    const sessions = buildAgentSessionRecordsFromSessions({
      providerId: "openclaw",
      sessions: [createSession({ key: "agent:cto:main", actorId: "cto", updatedAt: 100 })],
    });

    const repaired = applyProviderSessionStatusToAgentRuntime({
      sessions,
      runs: [],
      status: normalizeProviderSessionStatus("openclaw", "agent:cto:main", {
        actorId: "cto",
        status: "running",
        runId: "repair-run-1",
        updatedAt: 160,
      }),
      now: 200,
    });

    const runtime = buildAgentRuntimeProjection({
      providerId: "openclaw",
      sessions: repaired.sessions,
      runs: repaired.runs,
    });

    expect(repaired.runs[0]).toMatchObject({
      runId: "repair-run-1",
      state: "running",
    });
    expect(runtime[0]).toMatchObject({
      agentId: "cto",
      availability: "busy",
      activeRunIds: ["repair-run-1"],
    });
  });

  it("uses executing over waiting when runtime is still active", () => {
    const statuses = buildCanonicalAgentStatusProjection({
      company: createCompany(),
      activeWorkItems: [],
      activeDispatches: [
        {
          id: "dispatch-1",
          workItemId: "work-1",
          roomId: "workitem:work-1",
          title: "Please continue",
          fromActorId: "ceo",
          targetActorIds: ["cto"],
          summary: "Please continue",
          status: "acknowledged",
          createdAt: 100,
          updatedAt: 100,
        },
      ] satisfies DispatchRecord[],
      activeSupportRequests: [],
      activeEscalations: [],
      activeAgentRuntime: [
        {
          agentId: "cto",
          providerId: "openclaw",
          availability: "busy",
          activeSessionKeys: ["agent:cto:main"],
          activeRunIds: ["run-1"],
          lastSeenAt: 100,
          lastBusyAt: 100,
          lastIdleAt: null,
          latestTerminalAt: null,
          latestTerminalSummary: null,
          currentWorkload: "busy",
          runtimeEvidence: [],
        },
      ],
    });

    const cto = statuses.find((status) => status.agentId === "cto");
    expect(cto).toMatchObject({
      runtimeState: "busy",
      coordinationState: "executing",
      interventionState: "healthy",
    });
    expect(cto?.reason).toContain("活跃 run");
  });

  it("marks waiting peer as overdue when there is no active runtime", () => {
    const statuses = buildCanonicalAgentStatusProjection({
      company: createCompany(),
      activeWorkItems: [],
      activeDispatches: [
        {
          id: "dispatch-1",
          workItemId: "work-1",
          roomId: "workitem:work-1",
          title: "Please continue",
          fromActorId: "ceo",
          targetActorIds: ["cto"],
          summary: "Please continue",
          status: "pending",
          createdAt: 100,
          updatedAt: 100,
        },
      ] satisfies DispatchRecord[],
      activeSupportRequests: [],
      activeEscalations: [],
      activeAgentRuntime: [],
      now: 100 + 20 * 60_000,
    });

    const cto = statuses.find((status) => status.agentId === "cto");
    expect(cto).toMatchObject({
      runtimeState: "no_signal",
      coordinationState: "waiting_peer",
      interventionState: "overdue",
    });
  });

  it("keeps only the current owner in intervention when stale blocked history exists", () => {
    const company: Company = {
      id: "company-scope",
      name: "Scope Co",
      description: "scope tests",
      icon: "building",
      template: "default",
      createdAt: 1,
      quickPrompts: [],
      departments: [
        { id: "dep-ceo", name: "Executive", leadAgentId: "ceo" },
        { id: "dep-ops", name: "Operations", leadAgentId: "coo" },
        { id: "dep-tech", name: "Technology", leadAgentId: "cto" },
        { id: "dep-hr", name: "People", leadAgentId: "hr" },
      ],
      employees: [
        { agentId: "ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo", departmentId: "dep-ceo" },
        { agentId: "coo", nickname: "COO", role: "Chief Operating Officer", isMeta: true, metaRole: "coo", departmentId: "dep-ops" },
        { agentId: "cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto", departmentId: "dep-tech" },
        { agentId: "hr", nickname: "HR", role: "Human Resources Director", isMeta: true, metaRole: "hr", departmentId: "dep-hr" },
      ],
      tasks: [],
      supportRequests: [],
      decisionTickets: [],
      requests: [
        {
          id: "request-old-blocked-cto",
          sessionKey: "agent:ceo:main",
          taskId: "work-legacy",
          fromAgentId: "ceo",
          toAgentIds: ["cto"],
          title: "CTO，请立即开始技术开发工作。",
          summary: "任务：启动A - 开始开发",
          status: "blocked",
          resolution: "partial",
          createdAt: 100,
          updatedAt: 100,
        },
        {
          id: "request-new-complete-cto",
          sessionKey: "agent:ceo:main",
          taskId: "work-current",
          fromAgentId: "ceo",
          toAgentIds: ["cto"],
          title: "需求团队派单 · CTO",
          summary: "@CTO 进度怎么样了",
          status: "answered",
          resolution: "complete",
          createdAt: 900,
          updatedAt: 920,
        },
        {
          id: "request-old-blocked-hr",
          sessionKey: "agent:ceo:main",
          taskId: "work-legacy",
          fromAgentId: "ceo",
          toAgentIds: ["hr"],
          title: "HR，请立即激活内容总监岗位/人员。",
          summary: "任务：启动B - 激活内容总监",
          status: "blocked",
          resolution: "partial",
          createdAt: 110,
          updatedAt: 110,
        },
      ],
      handoffs: [
        {
          id: "handoff-old-blocked-coo",
          sessionKey: "agent:ceo:main",
          taskId: "work-legacy",
          toAgentIds: ["coo"],
          title: "COO，请立即注册平台账号。",
          summary: "任务：启动C - 注册平台账号",
          status: "blocked",
          createdAt: 120,
          updatedAt: 120,
        },
      ],
      escalations: [
        {
          id: "escalation-org",
          sourceType: "org_policy",
          sourceId: "underload:content",
          companyId: "company-scope",
          targetActorId: "ceo",
          reason: "部门长期低负载",
          severity: "warning",
          status: "open",
          createdAt: 950,
          updatedAt: 950,
        },
      ],
    };

    const statuses = buildCanonicalAgentStatusProjection({
      company,
      activeWorkItems: [
        {
          id: "work-current",
          workKey: "work-current",
          kind: "strategic",
          roundId: "round-current",
          companyId: "company-scope",
          sessionKey: "agent:ceo:main",
          topicKey: "mission:current",
          sourceActorId: "ceo",
          sourceActorLabel: "CEO",
          sourceSessionKey: "agent:ceo:main",
          sourceConversationId: "agent:ceo:main",
          providerId: null,
          title: "当前主线正在推进。",
          goal: "等待 COO 收口",
          headline: "当前主线正在推进。",
          displayStage: "待确认启动",
          displaySummary: "87 条结论回传，等待 COO 收口。",
          displayOwnerLabel: "COO",
          displayNextAction: "进入需求房补充、澄清或确认后再启动执行。",
          status: "waiting_owner",
          lifecyclePhase: "pre_requirement",
          stageGateStatus: "waiting_confirmation",
          stageLabel: "团队回执已到齐",
          ownerActorId: "coo",
          ownerLabel: "COO",
          batonActorId: "ceo",
          batonLabel: "CEO",
          roomId: "workitem:work-current",
          artifactIds: [],
          dispatchIds: ["dispatch-current-cto"],
          startedAt: 800,
          updatedAt: 1_000,
          completedAt: null,
          summary: "87 条结论回传，等待 COO 收口。",
          nextAction: "COO 收口并决定下一步。",
          steps: [
            {
              id: "step-ceo",
              title: "团队回执已到齐",
              assigneeActorId: "ceo",
              assigneeLabel: "CEO",
              status: "active",
              completionCriteria: "等待 COO 收口",
              detail: "等待 COO 收口",
              updatedAt: 1_000,
            },
          ],
        },
      ],
      activeDispatches: [
        {
          id: "dispatch-current-cto",
          workItemId: "work-current",
          roomId: "workitem:work-current",
          title: "需求团队派单 · CTO",
          fromActorId: "ceo",
          targetActorIds: ["cto"],
          summary: "@CTO 进度怎么样了",
          status: "answered",
          createdAt: 900,
          updatedAt: 920,
        },
      ] satisfies DispatchRecord[],
      activeSupportRequests: [],
      activeEscalations: company.escalations ?? [],
      activeAgentRuntime: [
        {
          agentId: "ceo",
          providerId: "openclaw",
          availability: "idle",
          activeSessionKeys: [],
          activeRunIds: [],
          lastSeenAt: 1_000,
          lastBusyAt: null,
          lastIdleAt: 1_000,
          latestTerminalAt: null,
          latestTerminalSummary: null,
          currentWorkload: "free",
          runtimeEvidence: [],
        },
        {
          agentId: "coo",
          providerId: "openclaw",
          availability: "idle",
          activeSessionKeys: [],
          activeRunIds: [],
          lastSeenAt: 1_000,
          lastBusyAt: null,
          lastIdleAt: 1_000,
          latestTerminalAt: null,
          latestTerminalSummary: null,
          currentWorkload: "free",
          runtimeEvidence: [],
        },
        {
          agentId: "cto",
          providerId: "openclaw",
          availability: "idle",
          activeSessionKeys: [],
          activeRunIds: [],
          lastSeenAt: 1_000,
          lastBusyAt: null,
          lastIdleAt: 1_000,
          latestTerminalAt: null,
          latestTerminalSummary: null,
          currentWorkload: "free",
          runtimeEvidence: [],
        },
        {
          agentId: "hr",
          providerId: "openclaw",
          availability: "idle",
          activeSessionKeys: [],
          activeRunIds: [],
          lastSeenAt: 1_000,
          lastBusyAt: null,
          lastIdleAt: 1_000,
          latestTerminalAt: null,
          latestTerminalSummary: null,
          currentWorkload: "free",
          runtimeEvidence: [],
        },
      ],
      now: 1_000 + 20 * 60_000,
    });

    expect(statuses.find((status) => status.agentId === "coo")).toMatchObject({
      runtimeState: "idle",
      coordinationState: "waiting_input",
      interventionState: "overdue",
    });
    expect(statuses.find((status) => status.agentId === "ceo")).toMatchObject({
      runtimeState: "idle",
      coordinationState: "none",
      interventionState: "healthy",
    });
    expect(statuses.find((status) => status.agentId === "cto")).toMatchObject({
      runtimeState: "idle",
      coordinationState: "completed",
      interventionState: "healthy",
    });
    expect(statuses.find((status) => status.agentId === "hr")).toMatchObject({
      runtimeState: "idle",
      coordinationState: "none",
      interventionState: "healthy",
    });
  });
});
