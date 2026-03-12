import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authorityControl from "../../../application/gateway/authority-control";
import { useAuthorityRuntimeSyncStore } from "../../authority/runtime-sync-store";
import { useCompanyRuntimeStore } from "./store";
import type { Company, RoomConversationBindingRecord } from "./types";

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

function createBinding(
  overrides: Partial<RoomConversationBindingRecord> = {},
): RoomConversationBindingRecord {
  return {
    roomId: "workitem:topic:mission:alpha",
    providerId: "authority",
    conversationId: "agent:co-cto:main",
    actorId: "co-cto",
    nativeRoom: false,
    updatedAt: 2_000,
    ...overrides,
  };
}

function createAuthorityBindingsSnapshot(bindings: RoomConversationBindingRecord[]) {
  return {
    companyId: "company-1",
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
    activeRoomBindings: bindings,
    activeSupportRequests: [],
    activeEscalations: [],
    activeDecisionTickets: [],
    updatedAt: Math.max(...bindings.map((binding) => binding.updatedAt), 0),
  };
}

describe("useCompanyRuntimeStore upsertRoomConversationBindings", () => {
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
      commandRoutes: ["requirement.transition", "room.append", "room-bindings.upsert", "dispatch.create"],
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
      activeWorkItems: [],
      activeRoundRecords: [],
      activeArtifacts: [],
      activeDispatches: [],
      activeRoomBindings: [
        createBinding({
          providerId: "runtime-fallback",
          conversationId: "agent:co-cto:fallback",
          updatedAt: 1_500,
        }),
      ],
      activeSupportRequests: [],
      activeEscalations: [],
      activeDecisionTickets: [],
      loading: false,
      error: null,
      bootstrapPhase: "ready",
    });
  });

  it("routes authority-backed binding writes through authority commands", async () => {
    const upsertBindingsSpy = vi
      .spyOn(authorityControl, "upsertAuthorityRoomBindings")
      .mockImplementation(async ({ bindings }) =>
        createAuthorityBindingsSnapshot([
          createBinding({
            providerId: "runtime-fallback",
            conversationId: "agent:co-cto:fallback",
            updatedAt: 1_500,
          }),
          ...bindings,
        ]),
      );

    useCompanyRuntimeStore.getState().upsertRoomConversationBindings([
      createBinding({
        providerId: "authority",
        conversationId: "agent:co-cto:main",
        updatedAt: 3_000,
      }),
      createBinding({
        providerId: "runtime-fallback",
        conversationId: "agent:co-cto:main",
        updatedAt: 2_500,
      }),
    ]);

    await vi.waitFor(() => {
      expect(upsertBindingsSpy).toHaveBeenCalledTimes(1);
      expect(upsertBindingsSpy).toHaveBeenCalledWith({
        companyId: "company-1",
        bindings: [
          expect.objectContaining({
            providerId: "authority",
            conversationId: "agent:co-cto:main",
            updatedAt: 3_000,
          }),
          expect.objectContaining({
            providerId: "runtime-fallback",
            conversationId: "agent:co-cto:main",
            updatedAt: 2_500,
          }),
        ],
      });
      expect(useCompanyRuntimeStore.getState().activeRoomBindings).toHaveLength(3);
      expect(useCompanyRuntimeStore.getState().activeRoomBindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            providerId: "authority",
            conversationId: "agent:co-cto:main",
            updatedAt: 3_000,
          }),
          expect.objectContaining({
            providerId: "runtime-fallback",
            conversationId: "agent:co-cto:main",
            updatedAt: 2_500,
          }),
          expect.objectContaining({
            providerId: "runtime-fallback",
            conversationId: "agent:co-cto:fallback",
            updatedAt: 1_500,
          }),
        ]),
      );
      expect(useAuthorityRuntimeSyncStore.getState().lastAppliedSource).toBe("command");
    });
  });
});
