import { create } from "zustand";
import {
  loadCompanyConfig,
  saveCompanyConfig,
  setPersistedActiveCompanyId,
} from "./persistence";
import {
  loadConversationMissionRecords,
  persistConversationMissionRecords,
} from "./mission-persistence";
import {
  loadRoundRecords,
  persistRoundRecords,
} from "./round-persistence";
import {
  loadArtifactRecords,
  persistArtifactRecords,
} from "./artifact-persistence";
import {
  loadDispatchRecords,
  persistDispatchRecords,
} from "./dispatch-persistence";
import {
  loadRequirementRoomRecords,
  persistRequirementRoomRecords,
} from "./room-persistence";
import {
  loadRoomConversationBindings,
  persistRoomConversationBindings,
} from "./room-binding-persistence";
import {
  loadWorkItemRecords,
  persistWorkItemRecords,
} from "./work-item-persistence";
import type {
  ConversationMissionRecord,
  CyberCompanyConfig,
  Company,
  DispatchRecord,
  HandoffRecord,
  ArtifactRecord,
  RoomConversationBindingRecord,
  RoundRecord,
  RequirementRoomMessage,
  RequirementRoomRecord,
  RequestRecord,
  SharedKnowledgeItem,
  TrackedTask,
  WorkItemRecord,
} from "./types";
import {
  buildRoomRecordIdFromWorkItem,
  buildWorkItemRecordFromMission,
  touchWorkItemArtifacts,
  touchWorkItemDispatches,
} from "../execution/work-item";

type CompanyBootstrapPhase = "idle" | "restoring" | "ready" | "missing" | "error";

interface CompanyState {
  config: CyberCompanyConfig | null;
  activeCompany: Company | null;
  activeRoomRecords: RequirementRoomRecord[];
  activeMissionRecords: ConversationMissionRecord[];
  activeWorkItems: WorkItemRecord[];
  activeRoundRecords: RoundRecord[];
  activeArtifacts: ArtifactRecord[];
  activeDispatches: DispatchRecord[];
  activeRoomBindings: RoomConversationBindingRecord[];
  loading: boolean;
  error: string | null;
  bootstrapPhase: CompanyBootstrapPhase;

  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;

  // Basic operations
  switchCompany: (id: string) => void;
  updateCompany: (company: Partial<Company>) => Promise<void>;
  upsertTask: (task: TrackedTask) => Promise<void>;
  upsertHandoff: (handoff: HandoffRecord) => Promise<void>;
  upsertRequest: (request: RequestRecord) => Promise<void>;
  upsertKnowledgeItem: (knowledgeItem: SharedKnowledgeItem) => Promise<void>;
  upsertRoomRecord: (room: RequirementRoomRecord) => void;
  appendRoomMessages: (
    roomId: string,
    messages: RequirementRoomMessage[],
    meta?: Partial<Omit<RequirementRoomRecord, "id" | "transcript">>,
  ) => void;
  upsertRoomConversationBindings: (bindings: RoomConversationBindingRecord[]) => void;
  deleteRoomRecord: (roomId: string) => void;
  upsertMissionRecord: (mission: ConversationMissionRecord) => void;
  deleteMissionRecord: (missionId: string) => void;
  upsertWorkItemRecord: (workItem: WorkItemRecord) => void;
  deleteWorkItemRecord: (workItemId: string) => void;
  upsertRoundRecord: (round: RoundRecord) => void;
  deleteRoundRecord: (roundId: string) => void;
  upsertArtifactRecord: (artifact: ArtifactRecord) => void;
  syncArtifactMirrorRecords: (artifacts: ArtifactRecord[], mirrorPrefix?: string) => void;
  deleteArtifactRecord: (artifactId: string) => void;
  upsertDispatchRecord: (dispatch: DispatchRecord) => void;
  deleteDispatchRecord: (dispatchId: string) => void;
}

const ROOM_MESSAGE_LIMIT = 120;

function mergeRoomTranscript(
  existing: RequirementRoomMessage[],
  incoming: RequirementRoomMessage[],
): RequirementRoomMessage[] {
  const byId = new Map(existing.map((message) => [message.id, message] as const));
  for (const message of incoming) {
    const previous = byId.get(message.id);
    byId.set(message.id, previous ? { ...previous, ...message } : message);
  }
  return [...byId.values()]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-ROOM_MESSAGE_LIMIT);
}

function mergeRoomMemberIds(
  existing: Array<string | null | undefined>,
  incoming: Array<string | null | undefined>,
): string[] {
  return [...new Set([...existing, ...incoming].map((agentId) => agentId?.trim()).filter(Boolean) as string[])];
}

function persistActiveRooms(companyId: string | null | undefined, rooms: RequirementRoomRecord[]) {
  persistRequirementRoomRecords(companyId, rooms);
}

function persistActiveRoomBindings(
  companyId: string | null | undefined,
  bindings: RoomConversationBindingRecord[],
) {
  persistRoomConversationBindings(companyId, bindings);
}

function persistActiveMissions(
  companyId: string | null | undefined,
  missions: ConversationMissionRecord[],
) {
  persistConversationMissionRecords(companyId, missions);
}

function persistActiveWorkItems(
  companyId: string | null | undefined,
  workItems: WorkItemRecord[],
) {
  persistWorkItemRecords(companyId, workItems);
}

function persistActiveRounds(companyId: string | null | undefined, rounds: RoundRecord[]) {
  persistRoundRecords(companyId, rounds);
}

function persistActiveArtifacts(companyId: string | null | undefined, artifacts: ArtifactRecord[]) {
  persistArtifactRecords(companyId, artifacts);
}

function persistActiveDispatches(
  companyId: string | null | undefined,
  dispatches: DispatchRecord[],
) {
  persistDispatchRecords(companyId, dispatches);
}

function mergeProviderConversationRefs(
  existing: RequirementRoomRecord["providerConversationRefs"] | undefined,
  incoming: RequirementRoomRecord["providerConversationRefs"] | undefined,
): RequirementRoomRecord["providerConversationRefs"] {
  const merged = [...(existing ?? []), ...(incoming ?? [])].filter(
    (ref): ref is NonNullable<RequirementRoomRecord["providerConversationRefs"]>[number] =>
      Boolean(ref?.providerId) && Boolean(ref?.conversationId),
  );
  if (merged.length === 0) {
    return undefined;
  }
  return merged.filter(
    (ref, index, refs) =>
      refs.findIndex(
        (candidate) =>
          candidate.providerId === ref.providerId &&
          candidate.conversationId === ref.conversationId &&
          (candidate.actorId ?? null) === (ref.actorId ?? null),
      ) === index,
  );
}

function syncArtifactLinks(
  workItems: WorkItemRecord[],
  artifacts: ArtifactRecord[],
): WorkItemRecord[] {
  return workItems.map((workItem) => {
    const linkedArtifacts = artifacts.filter((artifact) => artifact.workItemId === workItem.id);
    if (linkedArtifacts.length === 0) {
      return workItem;
    }
    return touchWorkItemArtifacts(workItem, linkedArtifacts);
  });
}

function syncDispatchLinks(
  workItems: WorkItemRecord[],
  dispatches: DispatchRecord[],
): WorkItemRecord[] {
  return workItems.map((workItem) => {
    const linkedDispatches = dispatches.filter((dispatch) => dispatch.workItemId === workItem.id);
    if (linkedDispatches.length === 0) {
      return workItem;
    }
    return touchWorkItemDispatches(workItem, linkedDispatches);
  });
}

function areMissionStepsEqual(
  left: ConversationMissionRecord["planSteps"],
  right: ConversationMissionRecord["planSteps"],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((step, index) => {
    const other = right[index];
    return (
      step.id === other?.id &&
      step.title === other?.title &&
      step.assigneeLabel === other?.assigneeLabel &&
      step.assigneeAgentId === other?.assigneeAgentId &&
      step.status === other?.status &&
      step.statusLabel === other?.statusLabel &&
      step.detail === other?.detail &&
      step.isCurrent === other?.isCurrent &&
      step.isNext === other?.isNext
    );
  });
}

function isSameMissionRecord(
  left: ConversationMissionRecord,
  right: ConversationMissionRecord,
): boolean {
  return (
    left.id === right.id &&
    left.sessionKey === right.sessionKey &&
    left.topicKey === right.topicKey &&
    left.roomId === right.roomId &&
    left.startedAt === right.startedAt &&
    left.title === right.title &&
    left.statusLabel === right.statusLabel &&
    left.progressLabel === right.progressLabel &&
    left.ownerAgentId === right.ownerAgentId &&
    left.ownerLabel === right.ownerLabel &&
    left.currentStepLabel === right.currentStepLabel &&
    left.nextAgentId === right.nextAgentId &&
    left.nextLabel === right.nextLabel &&
    left.summary === right.summary &&
    left.guidance === right.guidance &&
    left.completed === right.completed &&
    areMissionStepsEqual(left.planSteps, right.planSteps)
  );
}

export const useCompanyStore = create<CompanyState>((set, get) => ({
  config: null,
  activeCompany: null,
  activeRoomRecords: [],
  activeMissionRecords: [],
  activeWorkItems: [],
  activeRoundRecords: [],
  activeArtifacts: [],
  activeDispatches: [],
  activeRoomBindings: [],
  loading: false,
  error: null,
  bootstrapPhase: "idle",

  loadConfig: async () => {
    set({ loading: true, error: null, bootstrapPhase: "restoring" });
    try {
      const config = await loadCompanyConfig();
      if (config) {
        const active = config.companies.find((c) => c.id === config.activeCompanyId) || null;
        const loadedRooms = active ? loadRequirementRoomRecords(active.id) : [];
        const loadedMissions = active ? loadConversationMissionRecords(active.id) : [];
        const loadedWorkItems = active ? loadWorkItemRecords(active.id) : [];
        const loadedRounds = active ? loadRoundRecords(active.id) : [];
        const loadedArtifacts = active ? loadArtifactRecords(active.id) : [];
        const loadedDispatches = active ? loadDispatchRecords(active.id) : [];
        const loadedRoomBindings = active ? loadRoomConversationBindings(active.id) : [];
        set({
          config,
          activeCompany: active,
          activeRoomRecords: loadedRooms,
          activeMissionRecords: loadedMissions,
          activeWorkItems: syncArtifactLinks(
            syncDispatchLinks(loadedWorkItems, loadedDispatches),
            loadedArtifacts,
          ),
          activeRoundRecords: loadedRounds,
          activeArtifacts: loadedArtifacts,
          activeDispatches: loadedDispatches,
          activeRoomBindings: loadedRoomBindings,
          loading: false,
          bootstrapPhase: active ? "ready" : "missing",
        });
      } else {
        set({
          config: null,
          activeCompany: null,
          activeRoomRecords: [],
          activeMissionRecords: [],
          activeWorkItems: [],
          activeRoundRecords: [],
          activeArtifacts: [],
          activeDispatches: [],
          activeRoomBindings: [],
          loading: false,
          bootstrapPhase: "missing",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({
        error: message,
        activeRoomRecords: [],
        activeMissionRecords: [],
        activeWorkItems: [],
        activeRoundRecords: [],
        activeArtifacts: [],
        activeDispatches: [],
        activeRoomBindings: [],
        loading: false,
        bootstrapPhase: "error",
      });
    }
  },

  saveConfig: async () => {
    const { config } = get();
    if (!config) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const success = await saveCompanyConfig(config);
      if (!success) {
        set({ error: "Failed to persist configuration" });
      }
      set({ loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },

  switchCompany: (id: string) => {
    const { config } = get();
    if (!config) {
      return;
    }

    const company = config.companies.find((c) => c.id === id);
    if (!company) {
      return;
    }

    const newConfig = { ...config, activeCompanyId: id };
    const loadedRooms = loadRequirementRoomRecords(company.id);
    const loadedMissions = loadConversationMissionRecords(company.id);
    const loadedWorkItems = loadWorkItemRecords(company.id);
    const loadedRounds = loadRoundRecords(company.id);
    const loadedArtifacts = loadArtifactRecords(company.id);
    const loadedDispatches = loadDispatchRecords(company.id);
    const loadedRoomBindings = loadRoomConversationBindings(company.id);
    setPersistedActiveCompanyId(id);
    set({
      config: newConfig,
      activeCompany: company,
      activeRoomRecords: loadedRooms,
      activeMissionRecords: loadedMissions,
      activeWorkItems: syncArtifactLinks(
        syncDispatchLinks(loadedWorkItems, loadedDispatches),
        loadedArtifacts,
      ),
      activeRoundRecords: loadedRounds,
      activeArtifacts: loadedArtifacts,
      activeDispatches: loadedDispatches,
      activeRoomBindings: loadedRoomBindings,
      bootstrapPhase: "ready",
    });

    // Auto save on switch
    get().saveConfig();
  },

  updateCompany: async (updates: Partial<Company>) => {
    const { config, activeCompany } = get();
    if (!config || !activeCompany) {
      return;
    }

    const newCompany = { ...activeCompany, ...updates };
    const newCompanies = config.companies.map((c) => (c.id === activeCompany.id ? newCompany : c));

    const newConfig = { ...config, companies: newCompanies };
    set({ config: newConfig, activeCompany: newCompany });

    // Auto save
    await get().saveConfig();
  },

  upsertTask: async (task: TrackedTask) => {
    const { config, activeCompany } = get();
    if (!config || !activeCompany) {
      return;
    }

    const existingTasks = activeCompany.tasks ?? [];
    const idx = existingTasks.findIndex((t) => t.sessionKey === task.sessionKey);

    let nextTasks: TrackedTask[];
    if (idx >= 0) {
      // Update existing task (only if newer)
      const existing = existingTasks[idx];
      if (task.updatedAt <= existing.updatedAt) {
        return;
      }
      nextTasks = [...existingTasks];
      nextTasks[idx] = { ...existing, ...task };
    } else {
      // Insert new task
      nextTasks = [...existingTasks, task];
    }

    await get().updateCompany({ tasks: nextTasks });
  },

  upsertHandoff: async (handoff: HandoffRecord) => {
    const { config, activeCompany } = get();
    if (!config || !activeCompany) {
      return;
    }

    const existingHandoffs = activeCompany.handoffs ?? [];
    const idx = existingHandoffs.findIndex((item) => item.id === handoff.id);

    let nextHandoffs: HandoffRecord[];
    if (idx >= 0) {
      const existing = existingHandoffs[idx];
      if (handoff.updatedAt <= existing.updatedAt) {
        return;
      }
      nextHandoffs = [...existingHandoffs];
      nextHandoffs[idx] = { ...existing, ...handoff };
    } else {
      nextHandoffs = [...existingHandoffs, handoff];
    }

    await get().updateCompany({ handoffs: nextHandoffs });
  },

  upsertRequest: async (request: RequestRecord) => {
    const { config, activeCompany } = get();
    if (!config || !activeCompany) {
      return;
    }

    const existingRequests = activeCompany.requests ?? [];
    const idx = existingRequests.findIndex((item) => item.id === request.id);

    let nextRequests: RequestRecord[];
    if (idx >= 0) {
      const existing = existingRequests[idx];
      if (request.updatedAt <= existing.updatedAt) {
        return;
      }
      nextRequests = [...existingRequests];
      nextRequests[idx] = { ...existing, ...request };
    } else {
      nextRequests = [...existingRequests, request];
    }

    await get().updateCompany({ requests: nextRequests });
  },

  upsertKnowledgeItem: async (knowledgeItem: SharedKnowledgeItem) => {
    const { config, activeCompany } = get();
    if (!config || !activeCompany) {
      return;
    }

    const existingItems = activeCompany.knowledgeItems ?? [];
    const idx = existingItems.findIndex((item) => item.id === knowledgeItem.id);

    let nextItems: SharedKnowledgeItem[];
    if (idx >= 0) {
      const existing = existingItems[idx];
      if (knowledgeItem.updatedAt <= existing.updatedAt) {
        return;
      }
      nextItems = [...existingItems];
      nextItems[idx] = { ...existing, ...knowledgeItem };
    } else {
      nextItems = [...existingItems, knowledgeItem];
    }

    await get().updateCompany({ knowledgeItems: nextItems });
  },

  upsertRoomRecord: (room: RequirementRoomRecord) => {
    const { activeCompany, activeRoomRecords } = get();
    if (!activeCompany) {
      return;
    }

    const next = [...activeRoomRecords];
    const index = next.findIndex((item) => item.id === room.id);
    if (index >= 0) {
      const existing = next[index];
      next[index] = {
        ...existing,
        ...room,
        companyId: room.companyId ?? existing.companyId ?? activeCompany.id,
        workItemId: room.workItemId ?? existing.workItemId,
        ownerActorId: room.ownerActorId ?? existing.ownerActorId ?? room.ownerAgentId ?? existing.ownerAgentId ?? null,
        memberActorIds: mergeRoomMemberIds(existing.memberActorIds ?? existing.memberIds, room.memberActorIds ?? room.memberIds),
        status: room.status ?? existing.status ?? "active",
        providerConversationRefs: mergeProviderConversationRefs(
          existing.providerConversationRefs,
          room.providerConversationRefs,
        ),
        memberIds: mergeRoomMemberIds(existing.memberIds, room.memberIds),
        topicKey: room.topicKey ?? existing.topicKey,
        transcript: mergeRoomTranscript(existing.transcript, room.transcript),
        updatedAt: Math.max(existing.updatedAt, room.updatedAt),
      };
    } else {
      next.push({
        ...room,
        companyId: room.companyId ?? activeCompany.id,
        workItemId: room.workItemId,
        ownerActorId: room.ownerActorId ?? room.ownerAgentId ?? null,
        memberActorIds: mergeRoomMemberIds(room.memberActorIds ?? room.memberIds, room.memberIds),
        status: room.status ?? "active",
        providerConversationRefs: mergeProviderConversationRefs(undefined, room.providerConversationRefs),
        transcript: mergeRoomTranscript([], room.transcript),
      });
    }

    const sorted = next.sort((left, right) => right.updatedAt - left.updatedAt);
    set({ activeRoomRecords: sorted });
    persistActiveRooms(activeCompany.id, sorted);
  },

  appendRoomMessages: (roomId, messages, meta) => {
    const { activeCompany, activeRoomRecords } = get();
    if (!activeCompany || messages.length === 0) {
      return;
    }

    const index = activeRoomRecords.findIndex((room) => room.id === roomId);
    const now = messages.reduce((latest, message) => Math.max(latest, message.timestamp), Date.now());
    const next = [...activeRoomRecords];

    if (index >= 0) {
      const existing = next[index];
      next[index] = {
        ...existing,
        ...meta,
        id: existing.id,
        companyId: meta?.companyId ?? existing.companyId ?? activeCompany.id,
        workItemId: meta?.workItemId ?? existing.workItemId,
        ownerActorId: meta?.ownerActorId ?? existing.ownerActorId ?? existing.ownerAgentId ?? null,
        memberActorIds: mergeRoomMemberIds(existing.memberActorIds ?? existing.memberIds, meta?.memberActorIds ?? meta?.memberIds ?? []),
        status: meta?.status ?? existing.status ?? "active",
        providerConversationRefs: mergeProviderConversationRefs(
          existing.providerConversationRefs,
          meta?.providerConversationRefs,
        ),
        memberIds: mergeRoomMemberIds(existing.memberIds, meta?.memberIds ?? []),
        topicKey: meta?.topicKey ?? existing.topicKey,
        transcript: mergeRoomTranscript(existing.transcript, messages),
        updatedAt: Math.max(existing.updatedAt, now),
      };
    } else {
      next.push({
        id: roomId,
        sessionKey: meta?.sessionKey ?? roomId,
        title: meta?.title ?? "需求团队房间",
        companyId: meta?.companyId ?? activeCompany.id,
        workItemId: meta?.workItemId,
        topicKey: meta?.topicKey,
        ownerActorId: meta?.ownerActorId ?? meta?.ownerAgentId ?? null,
        memberActorIds: mergeRoomMemberIds(meta?.memberActorIds ?? meta?.memberIds ?? [], meta?.memberIds ?? []),
        status: meta?.status ?? "active",
        providerConversationRefs: mergeProviderConversationRefs(undefined, meta?.providerConversationRefs),
        memberIds: meta?.memberIds ?? [],
        ownerAgentId: meta?.ownerAgentId ?? null,
        transcript: mergeRoomTranscript([], messages),
        createdAt: now,
        updatedAt: now,
        lastSourceSyncAt: meta?.lastSourceSyncAt,
      });
    }

    const sorted = next.sort((left, right) => right.updatedAt - left.updatedAt);
    set({ activeRoomRecords: sorted });
    persistActiveRooms(activeCompany.id, sorted);
  },

  upsertRoomConversationBindings: (bindings) => {
    const { activeCompany, activeRoomBindings } = get();
    if (!activeCompany || bindings.length === 0) {
      return;
    }

    const next = new Map(
      activeRoomBindings.map((binding) => [
        `${binding.roomId}:${binding.providerId}:${binding.conversationId}:${binding.actorId ?? ""}`,
        binding,
      ] as const),
    );
    for (const binding of bindings) {
      const normalized: RoomConversationBindingRecord = {
        ...binding,
        updatedAt: binding.updatedAt ?? Date.now(),
      };
      next.set(
        `${normalized.roomId}:${normalized.providerId}:${normalized.conversationId}:${normalized.actorId ?? ""}`,
        normalized,
      );
    }
    const sorted = [...next.values()].sort((left, right) => right.updatedAt - left.updatedAt);
    set({ activeRoomBindings: sorted });
    persistActiveRoomBindings(activeCompany.id, sorted);
  },

  deleteRoomRecord: (roomId: string) => {
    const { activeCompany, activeRoomRecords, activeRoomBindings } = get();
    if (!activeCompany) {
      return;
    }

    const next = activeRoomRecords.filter((room) => room.id !== roomId);
    const nextBindings = activeRoomBindings.filter((binding) => binding.roomId !== roomId);
    set({ activeRoomRecords: next, activeRoomBindings: nextBindings });
    persistActiveRooms(activeCompany.id, next);
    persistActiveRoomBindings(activeCompany.id, nextBindings);
  },

  upsertMissionRecord: (mission: ConversationMissionRecord) => {
    const { activeCompany, activeMissionRecords, activeRoomRecords, activeWorkItems } = get();
    if (!activeCompany) {
      return;
    }

    const next = [...activeMissionRecords];
    const index = next.findIndex((item) => item.id === mission.id);
    if (index >= 0) {
      const existing = next[index];
      const merged = { ...existing, ...mission };
      if (isSameMissionRecord(existing, merged)) {
        return;
      }
      if (mission.updatedAt <= existing.updatedAt) {
        return;
      }
      next[index] = merged;
    } else {
      next.push(mission);
    }

    const sorted = next.sort((left, right) => right.updatedAt - left.updatedAt);
    const matchingRoom =
      activeRoomRecords.find((room) => room.id === mission.roomId || room.workItemId === mission.id)
      ?? (mission.roomId ? activeRoomRecords.find((room) => room.sessionKey === mission.roomId) : null)
      ?? null;
    const workItem = buildWorkItemRecordFromMission({
      companyId: activeCompany.id,
      mission,
      room: matchingRoom,
    });
    const nextWorkItems = [...activeWorkItems];
    const workItemIndex = nextWorkItems.findIndex((item) => item.id === workItem.id);
    if (workItemIndex >= 0) {
      const existingWorkItem = nextWorkItems[workItemIndex];
      if (workItem.updatedAt > existingWorkItem.updatedAt) {
        nextWorkItems[workItemIndex] = {
          ...existingWorkItem,
          ...workItem,
          roomId: workItem.roomId ?? existingWorkItem.roomId,
          artifactIds: workItem.artifactIds.length > 0 ? workItem.artifactIds : existingWorkItem.artifactIds,
          dispatchIds: workItem.dispatchIds.length > 0 ? workItem.dispatchIds : existingWorkItem.dispatchIds,
        };
      }
    } else {
      nextWorkItems.push(workItem);
    }

    const sortedWorkItems = nextWorkItems.sort((left, right) => right.updatedAt - left.updatedAt);
    set({ activeMissionRecords: sorted, activeWorkItems: sortedWorkItems });
    persistActiveMissions(activeCompany.id, sorted);
    persistActiveWorkItems(activeCompany.id, sortedWorkItems);
  },

  deleteMissionRecord: (missionId: string) => {
    const { activeCompany, activeMissionRecords } = get();
    if (!activeCompany) {
      return;
    }

    const next = activeMissionRecords.filter((mission) => mission.id !== missionId);
    set({ activeMissionRecords: next });
    persistActiveMissions(activeCompany.id, next);
  },

  upsertWorkItemRecord: (workItem: WorkItemRecord) => {
    const { activeCompany, activeWorkItems, activeRoomRecords } = get();
    if (!activeCompany) {
      return;
    }

    const next = [...activeWorkItems];
    const index = next.findIndex((item) => item.id === workItem.id);
    const normalizedRoomId = workItem.roomId ?? buildRoomRecordIdFromWorkItem(workItem.id);
    const normalizedWorkItem = {
      ...workItem,
      companyId: activeCompany.id,
      roomId: normalizedRoomId,
    };
    if (index >= 0) {
      const existing = next[index];
      if (normalizedWorkItem.updatedAt <= existing.updatedAt) {
        return;
      }
      next[index] = {
        ...existing,
        ...normalizedWorkItem,
        artifactIds: normalizedWorkItem.artifactIds.length > 0 ? normalizedWorkItem.artifactIds : existing.artifactIds,
        dispatchIds: normalizedWorkItem.dispatchIds.length > 0 ? normalizedWorkItem.dispatchIds : existing.dispatchIds,
      };
    } else {
      next.push(normalizedWorkItem);
    }

    const sorted = next.sort((left, right) => right.updatedAt - left.updatedAt);
    const nextRooms = activeRoomRecords.map((room) =>
      room.workItemId === normalizedWorkItem.id || room.id === normalizedWorkItem.roomId
        ? {
            ...room,
            companyId: room.companyId ?? activeCompany.id,
            workItemId: normalizedWorkItem.id,
            ownerActorId: normalizedWorkItem.ownerActorId ?? room.ownerActorId ?? room.ownerAgentId ?? null,
            ownerAgentId: normalizedWorkItem.ownerActorId ?? room.ownerAgentId ?? null,
            status: normalizedWorkItem.status === "archived" ? "archived" : room.status ?? "active",
          }
        : room,
    );
    set({ activeWorkItems: sorted, activeRoomRecords: nextRooms });
    persistActiveWorkItems(activeCompany.id, sorted);
    persistActiveRooms(activeCompany.id, nextRooms);
  },

  deleteWorkItemRecord: (workItemId: string) => {
    const { activeCompany, activeWorkItems } = get();
    if (!activeCompany) {
      return;
    }

    const next = activeWorkItems.filter((item) => item.id !== workItemId);
    set({ activeWorkItems: next });
    persistActiveWorkItems(activeCompany.id, next);
  },

  upsertRoundRecord: (round: RoundRecord) => {
    const { activeCompany, activeRoundRecords } = get();
    if (!activeCompany) {
      return;
    }

    const next = [...activeRoundRecords];
    const index = next.findIndex((item) => item.id === round.id);
    const normalized = {
      ...round,
      companyId: activeCompany.id,
    };
    if (index >= 0) {
      const existing = next[index];
      if (normalized.archivedAt <= existing.archivedAt) {
        return;
      }
      next[index] = { ...existing, ...normalized };
    } else {
      next.push(normalized);
    }

    const sorted = next.sort((left, right) => right.archivedAt - left.archivedAt);
    set({ activeRoundRecords: sorted });
    persistActiveRounds(activeCompany.id, sorted);
  },

  deleteRoundRecord: (roundId: string) => {
    const { activeCompany, activeRoundRecords } = get();
    if (!activeCompany) {
      return;
    }

    const next = activeRoundRecords.filter((round) => round.id !== roundId);
    set({ activeRoundRecords: next });
    persistActiveRounds(activeCompany.id, next);
  },

  upsertArtifactRecord: (artifact: ArtifactRecord) => {
    const { activeCompany, activeArtifacts, activeWorkItems, activeDispatches } = get();
    if (!activeCompany) {
      return;
    }

    const normalized: ArtifactRecord = {
      ...artifact,
      updatedAt: artifact.updatedAt || Date.now(),
      createdAt: artifact.createdAt || Date.now(),
    };
    const next = [...activeArtifacts];
    const index = next.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      const existing = next[index];
      if (normalized.updatedAt <= existing.updatedAt) {
        return;
      }
      next[index] = { ...existing, ...normalized };
    } else {
      next.push(normalized);
    }

    const sortedArtifacts = next.sort((left, right) => right.updatedAt - left.updatedAt);
    const syncedWorkItems = syncDispatchLinks(
      syncArtifactLinks(activeWorkItems, sortedArtifacts),
      activeDispatches,
    );
    set({ activeArtifacts: sortedArtifacts, activeWorkItems: syncedWorkItems });
    persistActiveArtifacts(activeCompany.id, sortedArtifacts);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },

  syncArtifactMirrorRecords: (artifacts: ArtifactRecord[], mirrorPrefix = "workspace:") => {
    const { activeCompany, activeArtifacts, activeWorkItems, activeDispatches } = get();
    if (!activeCompany) {
      return;
    }

    const preserved = activeArtifacts.filter((artifact) => !artifact.id.startsWith(mirrorPrefix));
    const normalizedIncoming = artifacts.map((artifact) => ({
      ...artifact,
      updatedAt: artifact.updatedAt || Date.now(),
      createdAt: artifact.createdAt || Date.now(),
    }));
    const sortedArtifacts = [...preserved, ...normalizedIncoming].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );
    const syncedWorkItems = syncDispatchLinks(
      syncArtifactLinks(activeWorkItems, sortedArtifacts),
      activeDispatches,
    );
    set({ activeArtifacts: sortedArtifacts, activeWorkItems: syncedWorkItems });
    persistActiveArtifacts(activeCompany.id, sortedArtifacts);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },

  deleteArtifactRecord: (artifactId: string) => {
    const { activeCompany, activeArtifacts, activeWorkItems, activeDispatches } = get();
    if (!activeCompany) {
      return;
    }

    const next = activeArtifacts.filter((artifact) => artifact.id !== artifactId);
    const syncedWorkItems = syncDispatchLinks(syncArtifactLinks(activeWorkItems, next), activeDispatches);
    set({ activeArtifacts: next, activeWorkItems: syncedWorkItems });
    persistActiveArtifacts(activeCompany.id, next);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },

  upsertDispatchRecord: (dispatch: DispatchRecord) => {
    const { activeCompany, activeDispatches, activeWorkItems, activeArtifacts } = get();
    if (!activeCompany) {
      return;
    }

    const normalized: DispatchRecord = {
      ...dispatch,
      createdAt: dispatch.createdAt || Date.now(),
      updatedAt: dispatch.updatedAt || Date.now(),
    };
    const next = [...activeDispatches];
    const index = next.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      const existing = next[index];
      if (normalized.updatedAt <= existing.updatedAt) {
        return;
      }
      next[index] = { ...existing, ...normalized };
    } else {
      next.push(normalized);
    }

    const sortedDispatches = next.sort((left, right) => right.updatedAt - left.updatedAt);
    const syncedWorkItems = syncArtifactLinks(
      syncDispatchLinks(activeWorkItems, sortedDispatches),
      activeArtifacts,
    );
    set({ activeDispatches: sortedDispatches, activeWorkItems: syncedWorkItems });
    persistActiveDispatches(activeCompany.id, sortedDispatches);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },

  deleteDispatchRecord: (dispatchId: string) => {
    const { activeCompany, activeDispatches, activeWorkItems, activeArtifacts } = get();
    if (!activeCompany) {
      return;
    }

    const next = activeDispatches.filter((dispatch) => dispatch.id !== dispatchId);
    const syncedWorkItems = syncArtifactLinks(syncDispatchLinks(activeWorkItems, next), activeArtifacts);
    set({ activeDispatches: next, activeWorkItems: syncedWorkItems });
    persistActiveDispatches(activeCompany.id, next);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },
}));
