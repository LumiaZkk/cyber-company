import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gateway } from "../../../application/gateway";
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
});
