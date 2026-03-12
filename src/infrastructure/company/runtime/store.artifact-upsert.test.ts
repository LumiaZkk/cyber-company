import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authorityControl from "../../../application/gateway/authority-control";
import { useAuthorityRuntimeSyncStore } from "../../authority/runtime-sync-store";
import { useCompanyRuntimeStore } from "./store";
import type { ArtifactRecord, Company, WorkItemRecord } from "./types";

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

function createArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "workspace:company-1:co-cto:/workspace/plan.md",
    workItemId: "topic:mission:alpha",
    title: "plan.md",
    kind: "file",
    status: "ready",
    ownerActorId: "co-cto",
    providerId: "authority",
    sourceActorId: "co-cto",
    sourceName: "plan.md",
    sourcePath: "/workspace/plan.md",
    summary: "当前方案初稿",
    content: "# plan",
    revision: 1,
    createdAt: 3_000,
    updatedAt: 3_000,
    ...overrides,
  };
}

describe("useCompanyRuntimeStore authority-backed artifacts", () => {
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
      commandRoutes: ["artifact.upsert", "artifact.sync-mirror", "artifact.delete"],
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

  it("routes artifact upserts through authority", async () => {
    const artifact = createArtifact();
    const upsertSpy = vi
      .spyOn(authorityControl, "upsertAuthorityArtifact")
      .mockResolvedValue({
        companyId: "company-1",
        activeRoomRecords: [],
        activeMissionRecords: [],
        activeConversationStates: [],
        activeWorkItems: [createWorkItem({ artifactIds: [artifact.id], updatedAt: 3_000 })],
        activeRequirementAggregates: [],
        activeRequirementEvidence: [],
        primaryRequirementId: null,
        activeRoundRecords: [],
        activeArtifacts: [artifact],
        activeDispatches: [],
        activeRoomBindings: [],
        activeSupportRequests: [],
        activeEscalations: [],
        activeDecisionTickets: [],
        updatedAt: 3_000,
      });

    useCompanyRuntimeStore.getState().upsertArtifactRecord(artifact);

    await vi.waitFor(() => {
      expect(upsertSpy).toHaveBeenCalledWith({
        companyId: "company-1",
        artifact,
      });
      expect(useCompanyRuntimeStore.getState().activeArtifacts).toEqual([artifact]);
    });
  });

  it("routes artifact mirror sync through authority", async () => {
    const artifact = createArtifact();
    const syncSpy = vi
      .spyOn(authorityControl, "syncAuthorityArtifactMirrors")
      .mockResolvedValue({
        companyId: "company-1",
        activeRoomRecords: [],
        activeMissionRecords: [],
        activeConversationStates: [],
        activeWorkItems: [createWorkItem({ artifactIds: [artifact.id], updatedAt: 4_000 })],
        activeRequirementAggregates: [],
        activeRequirementEvidence: [],
        primaryRequirementId: null,
        activeRoundRecords: [],
        activeArtifacts: [artifact],
        activeDispatches: [],
        activeRoomBindings: [],
        activeSupportRequests: [],
        activeEscalations: [],
        activeDecisionTickets: [],
        updatedAt: 4_000,
      });

    useCompanyRuntimeStore.getState().syncArtifactMirrorRecords([artifact], "workspace:");

    await vi.waitFor(() => {
      expect(syncSpy).toHaveBeenCalledWith({
        companyId: "company-1",
        artifacts: [artifact],
        mirrorPrefix: "workspace:",
      });
      expect(useCompanyRuntimeStore.getState().activeArtifacts).toEqual([artifact]);
    });
  });

  it("routes artifact deletion through authority", async () => {
    const artifact = createArtifact();
    const deleteSpy = vi
      .spyOn(authorityControl, "deleteAuthorityArtifact")
      .mockResolvedValue({
        companyId: "company-1",
        activeRoomRecords: [],
        activeMissionRecords: [],
        activeConversationStates: [],
        activeWorkItems: [createWorkItem({ artifactIds: [], updatedAt: 4_500 })],
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
        updatedAt: 4_500,
      });

    useCompanyRuntimeStore.setState({
      activeArtifacts: [artifact],
      activeWorkItems: [createWorkItem({ artifactIds: [artifact.id] })],
    });

    useCompanyRuntimeStore.getState().deleteArtifactRecord(artifact.id);

    await vi.waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith({
        companyId: "company-1",
        artifactId: artifact.id,
      });
      expect(useCompanyRuntimeStore.getState().activeArtifacts).toEqual([]);
      expect(useCompanyRuntimeStore.getState().activeWorkItems[0]?.artifactIds).toEqual([]);
    });
  });
});
