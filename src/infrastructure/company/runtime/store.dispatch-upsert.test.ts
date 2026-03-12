import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authorityControl from "../../../application/gateway/authority-control";
import { useAuthorityRuntimeSyncStore } from "../../authority/runtime-sync-store";
import { useCompanyRuntimeStore } from "./store";
import type { Company, DispatchRecord, WorkItemRecord } from "./types";

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

function createDispatch(overrides: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    id: "dispatch:topic:mission:alpha:3000",
    workItemId: "topic:mission:alpha",
    roomId: "workitem:topic:mission:alpha",
    title: "需求团队派单 · CTO",
    summary: "请 CTO 接手输出方案。",
    fromActorId: "co-ceo",
    targetActorIds: ["co-cto"],
    status: "pending",
    deliveryState: "pending",
    topicKey: "mission:alpha",
    createdAt: 3_000,
    updatedAt: 3_000,
    ...overrides,
  };
}

describe("useCompanyRuntimeStore upsertDispatchRecord", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
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

    useAuthorityRuntimeSyncStore.setState({
      compatibilityPathEnabled: true,
      commandRoutes: ["requirement.transition", "room.append", "dispatch.create"],
      mode: "compatibility_snapshot",
      lastSnapshotUpdatedAt: null,
      lastAppliedSignature: null,
      lastAppliedSource: null,
      lastAppliedAt: null,
      lastPushAt: null,
      lastPullAt: null,
      lastCommandAt: null,
      pushCount: 0,
      pullCount: 0,
      commandCount: 0,
      lastError: null,
      lastErrorAt: null,
      lastErrorOperation: null,
    });

    useCompanyRuntimeStore.setState({
      config: null,
      activeCompany: createCompany(),
      authorityBackedState: true,
      activeRoomRecords: [],
      activeMissionRecords: [],
      activeConversationStates: [],
      activeRequirementAggregates: [],
      activeRequirementEvidence: [],
      activeWorkItems: [createWorkItem()],
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

  it("routes authority-backed dispatch writes through authority and applies the returned runtime", async () => {
    const dispatch = createDispatch();
    const upsertDispatchSpy = vi
      .spyOn(authorityControl, "upsertAuthorityDispatch")
      .mockResolvedValue({
        companyId: "company-1",
        activeRoomRecords: [],
        activeMissionRecords: [],
        activeConversationStates: [],
        activeWorkItems: [
          createWorkItem({
            dispatchIds: [dispatch.id],
            updatedAt: 3_000,
          }),
        ],
        activeRequirementAggregates: [],
        activeRequirementEvidence: [],
        primaryRequirementId: null,
        activeRoundRecords: [],
        activeArtifacts: [],
        activeDispatches: [dispatch],
        activeRoomBindings: [],
        activeSupportRequests: [],
        activeEscalations: [],
        activeDecisionTickets: [],
        updatedAt: 3_000,
      });

    useCompanyRuntimeStore.getState().upsertDispatchRecord(dispatch);

    await vi.waitFor(() => {
      expect(upsertDispatchSpy).toHaveBeenCalledWith({
        companyId: "company-1",
        dispatch,
      });
      const state = useCompanyRuntimeStore.getState();
      expect(state.activeDispatches).toEqual([dispatch]);
      expect(state.activeWorkItems[0]?.dispatchIds).toContain(dispatch.id);
    });
  });
});
