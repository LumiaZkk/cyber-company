import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gateway } from "../../../application/gateway";
import * as authorityControl from "../../../application/gateway/authority-control";
import { useCompanyRuntimeStore } from "./store";
import type { Company, WorkItemRecord } from "./types";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "小说创作工作室",
    description: "测试公司",
    icon: "🦞",
    template: "novel",
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo" },
      { agentId: "co-cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto" },
      { agentId: "co-coo", nickname: "COO", role: "Chief Operating Officer", isMeta: true, metaRole: "coo" },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createWorkItem(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: "topic:mission:alpha",
    workKey: "topic:mission:alpha",
    kind: "strategic",
    roundId: "topic:mission:alpha",
    companyId: "company-1",
    sessionKey: "agent:co-ceo:main",
    topicKey: "mission:alpha",
    sourceActorId: "co-ceo",
    sourceActorLabel: "CEO",
    sourceSessionKey: "agent:co-ceo:main",
    sourceConversationId: "agent:co-ceo:main",
    providerId: null,
    title: "一致性底座",
    goal: "建设一致性底座",
    headline: "一致性底座",
    displayStage: "CEO 统筹",
    displaySummary: "当前主线正在推进。",
    displayOwnerLabel: "CEO",
    displayNextAction: "继续推进 CTO 输出。",
    status: "active",
    lifecyclePhase: "active_requirement",
    stageGateStatus: "confirmed",
    stageLabel: "CEO 统筹",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    batonActorId: "co-cto",
    batonLabel: "CTO",
    roomId: "workitem:topic:mission:alpha",
    artifactIds: [],
    dispatchIds: [],
    startedAt: 1_000,
    updatedAt: 2_000,
    completedAt: null,
    summary: "当前主线正在推进。",
    nextAction: "继续推进 CTO 输出。",
    steps: [],
    ...overrides,
  };
}

describe("useCompanyRuntimeStore requirement aggregate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(gateway, "appendCompanyEvent").mockResolvedValue({
      ok: true,
      event: {
        eventId: "test-event",
        companyId: "company-1",
        kind: "requirement_seeded",
        fromActorId: "system:test",
        createdAt: Date.now(),
        payload: {},
      },
    });
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      configurable: true,
      writable: true,
    });

    useCompanyRuntimeStore.setState({
      config: null,
      activeCompany: createCompany(),
      activeRoomRecords: [],
      activeMissionRecords: [],
      activeConversationStates: [],
      activeWorkItems: [],
      activeRequirementAggregates: [],
      activeRequirementEvidence: [],
      primaryRequirementId: null,
      activeRoundRecords: [],
      activeArtifacts: [],
      activeDispatches: [],
      activeRoomBindings: [],
      activeSupportRequests: [],
      activeEscalations: [],
      activeDecisionTickets: [],
      loading: false,
      error: null,
      bootstrapPhase: "ready",
    });
  });

  it("creates and preserves a single primary aggregate from local work item writes", () => {
    const alpha = createWorkItem();
    const beta = createWorkItem({
      id: "topic:mission:beta",
      workKey: "topic:mission:beta",
      roundId: "topic:mission:beta",
      topicKey: "mission:beta",
      title: "发布链路重构",
      updatedAt: 9_000,
      startedAt: 8_000,
    });

    useCompanyRuntimeStore.getState().upsertWorkItemRecord(alpha);
    const firstPrimaryRequirementId = useCompanyRuntimeStore.getState().primaryRequirementId;
    expect(firstPrimaryRequirementId).toBeTruthy();

    useCompanyRuntimeStore.getState().upsertWorkItemRecord(beta);
    expect(useCompanyRuntimeStore.getState().primaryRequirementId).toBe(firstPrimaryRequirementId);
    expect(useCompanyRuntimeStore.getState().activeRequirementAggregates.filter((item) => item.primary)).toHaveLength(1);
    expect(
      useCompanyRuntimeStore
        .getState()
        .activeRequirementEvidence.some(
          (event) =>
            event.source === "local-command" &&
            event.eventType === "requirement_seeded" &&
            event.aggregateId === firstPrimaryRequirementId,
        ),
    ).toBe(true);
  });

  it("seeds a visible pre-requirement aggregate from a stable CEO draft", () => {
    useCompanyRuntimeStore.getState().setConversationDraftRequirement("agent:co-ceo:main", {
      topicKey: "mission:alpha",
      topicText: "先梳理当前公司能力和下一步",
      summary: "先由 CEO 判断现有能力能否直接承接当前目标。",
      ownerActorId: "co-ceo",
      ownerLabel: "CEO",
      stage: "CEO 正在收敛目标和推进方式",
      nextAction: "先确认当前公司里已有的角色、知识和工具。",
      stageGateStatus: "waiting_confirmation",
      state: "awaiting_promotion_choice",
      promotionReason: null,
      promotable: true,
      updatedAt: 1_000,
    });

    const state = useCompanyRuntimeStore.getState();
    expect(state.activeConversationStates[0]?.draftRequirement?.summary).toContain("现有能力");
    expect(state.activeRequirementAggregates).toHaveLength(1);
    expect(state.primaryRequirementId).toBe("topic:mission:alpha");
    expect(state.activeRequirementAggregates[0]).toMatchObject({
      lifecyclePhase: "pre_requirement",
      stageGateStatus: "waiting_confirmation",
      sourceConversationId: "agent:co-ceo:main",
    });
  });

  it("ensures a requirement room with fallback member bindings even before a native room exists", () => {
    useCompanyRuntimeStore.setState({
      activeRequirementAggregates: [
        {
          id: "topic:mission:alpha",
          companyId: "company-1",
          topicKey: "mission:alpha",
          kind: "strategic",
          primary: true,
          workItemId: null,
          roomId: "workitem:topic:mission:alpha",
          ownerActorId: "co-ceo",
          ownerLabel: "CEO",
          lifecyclePhase: "pre_requirement",
          stageGateStatus: "waiting_confirmation",
          stage: "待你确认下一步",
          summary: "等待老板在方案里做决策。",
          nextAction: "先进入需求房继续澄清。",
          memberIds: ["co-ceo", "co-cto", "co-coo"],
          sourceConversationId: "agent:co-ceo:main",
          startedAt: 1_000,
          updatedAt: 2_000,
          revision: 1,
          lastEvidenceAt: null,
          status: "waiting_owner",
          acceptanceStatus: "not_requested",
        },
      ],
      primaryRequirementId: "topic:mission:alpha",
      activeRoomRecords: [],
      activeRoomBindings: [],
      activeWorkItems: [],
    });

    const room = useCompanyRuntimeStore.getState().ensureRequirementRoomForAggregate("topic:mission:alpha");
    const state = useCompanyRuntimeStore.getState();

    expect(room).toMatchObject({
      id: "workitem:topic:mission:alpha",
      scope: "decision",
    });
    expect(state.activeRoomBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomId: "workitem:topic:mission:alpha",
          conversationId: "agent:co-ceo:main",
          actorId: "co-ceo",
          providerId: "runtime-fallback",
        }),
        expect.objectContaining({
          roomId: "workitem:topic:mission:alpha",
          conversationId: "agent:co-cto:main",
          actorId: "co-cto",
          providerId: "runtime-fallback",
        }),
        expect.objectContaining({
          roomId: "workitem:topic:mission:alpha",
          conversationId: "agent:co-coo:main",
          actorId: "co-coo",
          providerId: "runtime-fallback",
        }),
      ]),
    );
  });

  it("switches the primary aggregate only when a local conversation command explicitly points to another work item", () => {
    const alpha = createWorkItem();
    const beta = createWorkItem({
      id: "topic:mission:beta",
      workKey: "topic:mission:beta",
      roundId: "topic:mission:beta",
      topicKey: "mission:beta",
      title: "发布链路重构",
      updatedAt: 9_000,
      startedAt: 8_000,
    });

    useCompanyRuntimeStore.getState().upsertWorkItemRecord(alpha);
    useCompanyRuntimeStore.getState().upsertWorkItemRecord(beta);
    const persistedBeta =
      useCompanyRuntimeStore
        .getState()
        .activeWorkItems.find((item) => item.topicKey === "mission:beta") ?? null;
    expect(persistedBeta).toBeTruthy();
    const betaAggregate =
      useCompanyRuntimeStore
        .getState()
        .activeRequirementAggregates.find((item) => item.workItemId === persistedBeta?.id) ?? null;
    expect(betaAggregate).toBeTruthy();
    useCompanyRuntimeStore.getState().setConversationCurrentWorkKey(
      "agent:co-ceo:main",
      persistedBeta?.workKey ?? null,
      persistedBeta?.id ?? null,
      persistedBeta?.roundId ?? null,
    );

    expect(useCompanyRuntimeStore.getState().primaryRequirementId).toBe(betaAggregate?.id ?? null);
    expect(useCompanyRuntimeStore.getState().activeRequirementAggregates.filter((item) => item.primary)).toHaveLength(1);
    expect(
      useCompanyRuntimeStore
        .getState()
        .activeRequirementEvidence.some(
          (event) =>
            event.source === "local-command" &&
            event.eventType === "requirement_promoted" &&
            event.aggregateId === betaAggregate?.id,
        ),
    ).toBe(true);
  });

  it("reopens acceptance without creating a second primary aggregate", () => {
    const alpha = createWorkItem({
      status: "completed",
      displayStage: "已完成",
      stageLabel: "已完成",
      completedAt: 5_000,
      updatedAt: 5_000,
    });

    useCompanyRuntimeStore.getState().upsertWorkItemRecord(alpha);
    const primaryRequirementId = useCompanyRuntimeStore.getState().primaryRequirementId;
    expect(primaryRequirementId).toBeTruthy();

    useCompanyRuntimeStore.getState().applyRequirementTransition({
      aggregateId: primaryRequirementId!,
      changes: {
        status: "waiting_review",
        acceptanceStatus: "pending",
        stage: "待你验收",
        nextAction: "请确认当前交付是否满足预期。",
      },
      timestamp: 6_000,
      source: "local-command",
    });
    useCompanyRuntimeStore.getState().applyRequirementTransition({
      aggregateId: primaryRequirementId!,
      changes: {
        status: "active",
        acceptanceStatus: "rejected",
        stage: "驳回重开",
        nextAction: "根据验收反馈重新推进。",
      },
      timestamp: 7_000,
      source: "local-command",
    });

    const state = useCompanyRuntimeStore.getState();
    const aggregate =
      state.activeRequirementAggregates.find((item) => item.id === primaryRequirementId) ?? null;

    expect(state.primaryRequirementId).toBe(primaryRequirementId);
    expect(state.activeRequirementAggregates.filter((item) => item.primary)).toHaveLength(1);
    expect(aggregate?.acceptanceStatus).toBe("rejected");
    expect(aggregate?.status).toBe("active");
    expect(
      state.activeRequirementEvidence.some(
        (event) =>
          event.source === "local-command" &&
          (event.eventType === "requirement_acceptance_requested" ||
            event.eventType === "requirement_progressed") &&
          event.aggregateId === primaryRequirementId,
      ),
    ).toBe(true);
    expect(
      state.activeRequirementEvidence.some(
        (event) =>
          event.source === "local-command" &&
          event.eventType === "requirement_reopened" &&
          event.aggregateId === primaryRequirementId,
      ),
    ).toBe(true);
  });

  it("records requirement change requests as a first-class lifecycle event", () => {
    const alpha = createWorkItem();

    useCompanyRuntimeStore.getState().upsertWorkItemRecord(alpha);
    const primaryRequirementId = useCompanyRuntimeStore.getState().primaryRequirementId;
    expect(primaryRequirementId).toBeTruthy();

    useCompanyRuntimeStore.getState().applyRequirementTransition({
      aggregateId: primaryRequirementId!,
      changes: {
        status: "waiting_owner",
        acceptanceStatus: "not_requested",
        acceptanceNote: "需求变更待确认",
        stage: "需求变更中",
        nextAction: "请先在需求房确认变更范围、优先级和受影响任务，再决定是否继续执行。",
        stageGateStatus: "waiting_confirmation",
      },
      timestamp: 6_000,
      source: "local-command",
    });

    const state = useCompanyRuntimeStore.getState();
    const aggregate =
      state.activeRequirementAggregates.find((item) => item.id === primaryRequirementId) ?? null;

    expect(aggregate?.stageGateStatus).toBe("waiting_confirmation");
    expect(aggregate?.status).toBe("waiting_owner");
    expect(
      state.activeRequirementEvidence.some(
        (event) =>
          event.source === "local-command" &&
          event.eventType === "requirement_change_requested" &&
          event.aggregateId === primaryRequirementId,
      ),
    ).toBe(true);
  });

  it("routes requirement transitions through authority when runtime is authority-backed", async () => {
    useCompanyRuntimeStore.setState({
      authorityBackedState: true,
      activeRequirementAggregates: [
        {
          id: "topic:mission:alpha",
          companyId: "company-1",
          topicKey: "mission:alpha",
          kind: "strategic",
          primary: true,
          workItemId: "topic:mission:alpha",
          roomId: "workitem:topic:mission:alpha",
          ownerActorId: "co-ceo",
          ownerLabel: "CEO",
          lifecyclePhase: "active_requirement",
          stageGateStatus: "confirmed",
          stage: "待你验收",
          summary: "当前需求等待验收。",
          nextAction: "请先确认交付结果。",
          memberIds: ["co-ceo", "co-cto", "co-coo"],
          sourceConversationId: "agent:co-ceo:main",
          startedAt: 1_000,
          updatedAt: 2_000,
          revision: 2,
          lastEvidenceAt: 2_000,
          status: "waiting_review",
          acceptanceStatus: "pending",
        },
      ],
      activeRequirementEvidence: [],
      primaryRequirementId: "topic:mission:alpha",
    });

    const transitionSpy = vi
      .spyOn(authorityControl, "transitionAuthorityRequirement")
      .mockResolvedValue({
        companyId: "company-1",
        activeRoomRecords: [],
        activeMissionRecords: [],
        activeConversationStates: [],
        activeWorkItems: [],
        activeRequirementAggregates: [
          {
            id: "topic:mission:alpha",
            companyId: "company-1",
            topicKey: "mission:alpha",
            kind: "strategic",
            primary: true,
            workItemId: "topic:mission:alpha",
            roomId: "workitem:topic:mission:alpha",
            ownerActorId: "co-ceo",
            ownerLabel: "CEO",
            lifecyclePhase: "active_requirement",
            stageGateStatus: "confirmed",
            stage: "驳回重开",
            summary: "当前需求已重新打开。",
            nextAction: "根据验收反馈重新推进。",
            memberIds: ["co-ceo", "co-cto", "co-coo"],
            sourceConversationId: "agent:co-ceo:main",
            startedAt: 1_000,
            updatedAt: 7_000,
            revision: 3,
            lastEvidenceAt: 7_000,
            status: "active",
            acceptanceStatus: "rejected",
          },
        ],
        activeRequirementEvidence: [
          {
            id: "local:topic:mission:alpha:requirement_reopened:3",
            companyId: "company-1",
            aggregateId: "topic:mission:alpha",
            source: "local-command",
            sessionKey: "agent:co-ceo:main",
            actorId: "co-ceo",
            eventType: "requirement_reopened",
            timestamp: 7_000,
            payload: {
              ownerActorId: "co-ceo",
              ownerLabel: "CEO",
              stage: "驳回重开",
              summary: "当前需求已重新打开。",
              nextAction: "根据验收反馈重新推进。",
              memberIds: ["co-ceo", "co-cto", "co-coo"],
              status: "active",
              stageGateStatus: "confirmed",
              acceptanceStatus: "rejected",
              acceptanceNote: null,
              revision: 3,
              workItemId: "topic:mission:alpha",
              topicKey: "mission:alpha",
              roomId: "workitem:topic:mission:alpha",
              previousStatus: "waiting_review",
              previousStageGateStatus: "confirmed",
              previousAcceptanceStatus: "pending",
            },
            applied: true,
          },
        ],
        primaryRequirementId: "topic:mission:alpha",
        activeRoundRecords: [],
        activeArtifacts: [],
        activeDispatches: [],
        activeRoomBindings: [],
        activeSupportRequests: [],
        activeEscalations: [],
        activeDecisionTickets: [],
        updatedAt: 7_000,
      });

    useCompanyRuntimeStore.getState().applyRequirementTransition({
      aggregateId: "topic:mission:alpha",
      changes: {
        status: "active",
        acceptanceStatus: "rejected",
        stage: "驳回重开",
        summary: "当前需求已重新打开。",
        nextAction: "根据验收反馈重新推进。",
      },
      timestamp: 7_000,
      source: "local-command",
    });

    await vi.waitFor(() => {
      expect(transitionSpy).toHaveBeenCalledWith({
        companyId: "company-1",
        aggregateId: "topic:mission:alpha",
        changes: {
          status: "active",
          acceptanceStatus: "rejected",
          stage: "驳回重开",
          summary: "当前需求已重新打开。",
          nextAction: "根据验收反馈重新推进。",
        },
        timestamp: 7_000,
        source: "local-command",
      });
      const state = useCompanyRuntimeStore.getState();
      expect(state.activeRequirementAggregates[0]).toMatchObject({
        status: "active",
        acceptanceStatus: "rejected",
        revision: 3,
      });
      expect(
        state.activeRequirementEvidence.some(
          (event) => event.eventType === "requirement_reopened" && event.aggregateId === "topic:mission:alpha",
        ),
      ).toBe(true);
    });
  });
});
