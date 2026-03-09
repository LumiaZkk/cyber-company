import { create } from "zustand";
import {
  deleteCompanyCascade,
  loadCompanyConfig,
  peekCachedCompanyConfig,
  saveCompanyConfig,
  setPersistedActiveCompanyId,
} from "./persistence";
import {
  loadConversationMissionRecords,
  persistConversationMissionRecords,
} from "./mission-persistence";
import {
  loadConversationStateRecords,
  persistConversationStateRecords,
} from "./conversation-state-persistence";
import {
  loadRoundRecords,
  persistRoundRecords,
  sanitizeRoundRecords,
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
  sanitizeRequirementRoomRecords,
} from "./room-persistence";
import {
  loadRoomConversationBindings,
  persistRoomConversationBindings,
} from "./room-binding-persistence";
import {
  loadWorkItemRecords,
  persistWorkItemRecords,
  sanitizeWorkItemRecords,
} from "./work-item-persistence";
import type {
  ConversationMissionRecord,
  ConversationStateRecord,
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
  normalizeProductWorkItemIdentity,
  touchWorkItemArtifacts,
  touchWorkItemDispatches,
} from "../execution/work-item";
import {
  areRequirementRoomRecordsEquivalent,
  sortRequirementRoomMemberIds,
} from "../execution/requirement-room";
import { isArtifactRequirementTopic } from "../execution/requirement-kind";
import { reconcileWorkItemRecord } from "../execution/work-item-reconciler";

type CompanyBootstrapPhase = "idle" | "restoring" | "ready" | "missing" | "error";

interface CompanyState {
  config: CyberCompanyConfig | null;
  activeCompany: Company | null;
  activeRoomRecords: RequirementRoomRecord[];
  activeMissionRecords: ConversationMissionRecord[];
  activeConversationStates: ConversationStateRecord[];
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
  deleteCompany: (id: string) => Promise<void>;
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
  setConversationCurrentWorkKey: (
    conversationId: string,
    workKey: string | null,
    workItemId?: string | null,
    roundId?: string | null,
  ) => void;
  clearConversationState: (conversationId: string) => void;
  upsertWorkItemRecord: (workItem: WorkItemRecord) => void;
  deleteWorkItemRecord: (workItemId: string) => void;
  upsertRoundRecord: (round: RoundRecord) => void;
  deleteRoundRecord: (roundId: string) => void;
  upsertArtifactRecord: (artifact: ArtifactRecord) => void;
  syncArtifactMirrorRecords: (artifacts: ArtifactRecord[], mirrorPrefix?: string) => void;
  deleteArtifactRecord: (artifactId: string) => void;
  upsertDispatchRecord: (dispatch: DispatchRecord) => void;
  replaceDispatchRecords: (dispatches: DispatchRecord[]) => void;
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
  return sortRequirementRoomMemberIds([...existing, ...incoming]);
}

function persistActiveRooms(companyId: string | null | undefined, rooms: RequirementRoomRecord[]) {
  persistRequirementRoomRecords(companyId, rooms);
}

function normalizeRoomRecordForState(
  room: RequirementRoomRecord,
  companyId: string,
): RequirementRoomRecord {
  const normalizedIdentity = normalizeProductWorkItemIdentity({
    workItemId: room.workItemId,
    topicKey: room.topicKey,
    title: room.title,
  });
  const normalizedWorkItemId = normalizedIdentity.workItemId ?? room.workItemId;
  const normalizedRoomId = normalizedWorkItemId
    ? buildRoomRecordIdFromWorkItem(normalizedWorkItemId)
    : room.id;
  return {
    ...room,
    id: normalizedRoomId,
    companyId: room.companyId ?? companyId,
    workItemId: normalizedWorkItemId,
    sessionKey:
      normalizedWorkItemId && room.sessionKey.startsWith("room:")
        ? `room:${normalizedRoomId}`
        : room.sessionKey,
    topicKey: normalizedIdentity.topicKey ?? room.topicKey,
    ownerActorId: room.ownerActorId ?? room.ownerAgentId ?? null,
    batonActorId: room.batonActorId ?? null,
    memberIds: mergeRoomMemberIds(room.memberIds, []),
    memberActorIds: mergeRoomMemberIds(room.memberActorIds ?? room.memberIds, room.memberIds),
    headline: room.headline ?? room.title,
  };
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

function persistActiveConversationStates(
  companyId: string | null | undefined,
  states: ConversationStateRecord[],
) {
  persistConversationStateRecords(companyId, states);
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

function areStringArraysEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  const leftValues = left ?? [];
  const rightValues = right ?? [];
  if (leftValues.length !== rightValues.length) {
    return false;
  }
  return leftValues.every((value, index) => value === rightValues[index]);
}

function areWorkStepRecordsEquivalent(
  left: WorkItemRecord["steps"][number],
  right: WorkItemRecord["steps"][number],
): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    (left.assigneeActorId ?? null) === (right.assigneeActorId ?? null) &&
    left.assigneeLabel === right.assigneeLabel &&
    left.status === right.status &&
    (left.completionCriteria ?? null) === (right.completionCriteria ?? null) &&
    (left.detail ?? null) === (right.detail ?? null)
  );
}

function areWorkItemRecordsEquivalent(left: WorkItemRecord, right: WorkItemRecord): boolean {
  if (
    left.id !== right.id ||
    left.workKey !== right.workKey ||
    left.kind !== right.kind ||
    left.roundId !== right.roundId ||
    left.companyId !== right.companyId ||
    (left.sessionKey ?? null) !== (right.sessionKey ?? null) ||
    (left.topicKey ?? null) !== (right.topicKey ?? null) ||
    (left.sourceActorId ?? null) !== (right.sourceActorId ?? null) ||
    (left.sourceActorLabel ?? null) !== (right.sourceActorLabel ?? null) ||
    (left.sourceSessionKey ?? null) !== (right.sourceSessionKey ?? null) ||
    (left.sourceConversationId ?? null) !== (right.sourceConversationId ?? null) ||
    (left.providerId ?? null) !== (right.providerId ?? null) ||
    left.title !== right.title ||
    left.goal !== right.goal ||
    left.status !== right.status ||
    left.stageLabel !== right.stageLabel ||
    (left.ownerActorId ?? null) !== (right.ownerActorId ?? null) ||
    left.ownerLabel !== right.ownerLabel ||
    (left.batonActorId ?? null) !== (right.batonActorId ?? null) ||
    left.batonLabel !== right.batonLabel ||
    (left.roomId ?? null) !== (right.roomId ?? null) ||
    left.startedAt !== right.startedAt ||
    (left.completedAt ?? null) !== (right.completedAt ?? null) ||
    left.summary !== right.summary ||
    left.nextAction !== right.nextAction ||
    left.headline !== right.headline ||
    left.displayStage !== right.displayStage ||
    left.displaySummary !== right.displaySummary ||
    left.displayOwnerLabel !== right.displayOwnerLabel ||
    left.displayNextAction !== right.displayNextAction
  ) {
    return false;
  }

  if (!areStringArraysEqual(left.artifactIds, right.artifactIds)) {
    return false;
  }
  if (!areStringArraysEqual(left.dispatchIds, right.dispatchIds)) {
    return false;
  }
  if (left.steps.length !== right.steps.length) {
    return false;
  }
  return left.steps.every((step, index) => areWorkStepRecordsEquivalent(step, right.steps[index]!));
}

function areRoundRecordsEquivalent(left: RoundRecord, right: RoundRecord): boolean {
  return (
    left.id === right.id &&
    left.companyId === right.companyId &&
    left.title === right.title &&
    (left.preview ?? null) === (right.preview ?? null) &&
    (left.workItemId ?? null) === (right.workItemId ?? null) &&
    (left.roomId ?? null) === (right.roomId ?? null) &&
    (left.reason ?? null) === (right.reason ?? null) &&
    (left.sourceActorId ?? null) === (right.sourceActorId ?? null) &&
    (left.sourceActorLabel ?? null) === (right.sourceActorLabel ?? null) &&
    (left.sourceSessionKey ?? null) === (right.sourceSessionKey ?? null) &&
    (left.sourceConversationId ?? null) === (right.sourceConversationId ?? null) &&
    (left.providerArchiveId ?? null) === (right.providerArchiveId ?? null) &&
    left.archivedAt === right.archivedAt &&
    left.restorable === right.restorable &&
    left.messages.length === right.messages.length &&
    left.messages.every((message, index) => {
      const other = right.messages[index];
      if (!other) {
        return false;
      }
      return (
        message.role === other.role &&
        message.text === other.text &&
        message.timestamp === other.timestamp
      );
    })
  );
}

function areRoundRecordCollectionsEquivalent(left: RoundRecord[], right: RoundRecord[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((round, index) => {
    const other = right[index];
    return Boolean(other) && areRoundRecordsEquivalent(round, other);
  });
}

function areRequirementRoomRecordCollectionsEquivalent(
  left: RequirementRoomRecord[],
  right: RequirementRoomRecord[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((room, index) => {
    const other = right[index];
    return Boolean(other) && areRequirementRoomRecordsEquivalent(room, other);
  });
}

function areWorkItemRecordCollectionsEquivalent(
  left: WorkItemRecord[],
  right: WorkItemRecord[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((workItem, index) => {
    const other = right[index];
    return Boolean(other) && areWorkItemRecordsEquivalent(workItem, other);
  });
}

function areConversationStateRecordsEquivalent(
  left: ConversationStateRecord,
  right: ConversationStateRecord,
): boolean {
  return (
    left.companyId === right.companyId &&
    left.conversationId === right.conversationId &&
    (left.currentWorkKey ?? null) === (right.currentWorkKey ?? null) &&
    (left.currentWorkItemId ?? null) === (right.currentWorkItemId ?? null) &&
    (left.currentRoundId ?? null) === (right.currentRoundId ?? null)
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

function reconcileStoredWorkItems(input: {
  companyId: string;
  workItems: WorkItemRecord[];
  rooms: RequirementRoomRecord[];
  artifacts: ArtifactRecord[];
  dispatches: DispatchRecord[];
  targetWorkItemIds?: Array<string | null | undefined>;
  targetRoomIds?: Array<string | null | undefined>;
  targetTopicKeys?: Array<string | null | undefined>;
}): WorkItemRecord[] {
  const workItemIdSet = new Set(
    (input.targetWorkItemIds ?? []).filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const roomIdSet = new Set(
    (input.targetRoomIds ?? []).filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const topicKeySet = new Set(
    (input.targetTopicKeys ?? []).filter((value): value is string => typeof value === "string" && value.length > 0),
  );

  if (workItemIdSet.size === 0 && roomIdSet.size === 0 && topicKeySet.size === 0) {
    return input.workItems
      .map((workItem) => {
        const matchingRoom =
          input.rooms.find((room) => room.workItemId === workItem.id || room.id === workItem.roomId) ?? null;
        return (
          reconcileWorkItemRecord({
            companyId: input.companyId,
            existingWorkItem: workItem,
            room: matchingRoom,
            artifacts: input.artifacts,
            dispatches: input.dispatches,
            fallbackSessionKey: workItem.sourceSessionKey ?? workItem.sessionKey ?? null,
            fallbackRoomId: matchingRoom?.id ?? workItem.roomId ?? null,
          }) ?? workItem
        );
      })
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  const next = input.workItems.map((workItem) => {
    const matchesTarget =
      workItemIdSet.has(workItem.id) ||
      (workItem.roomId ? roomIdSet.has(workItem.roomId) : false) ||
      (workItem.topicKey ? topicKeySet.has(workItem.topicKey) : false);
    if (!matchesTarget) {
      return workItem;
    }

    const matchingRoom =
      input.rooms.find((room) => room.workItemId === workItem.id || room.id === workItem.roomId) ?? null;
    return (
      reconcileWorkItemRecord({
        companyId: input.companyId,
        existingWorkItem: workItem,
        room: matchingRoom,
        artifacts: input.artifacts,
        dispatches: input.dispatches,
        fallbackSessionKey: workItem.sourceSessionKey ?? workItem.sessionKey ?? null,
        fallbackRoomId: matchingRoom?.id ?? workItem.roomId ?? null,
      }) ?? workItem
    );
  });

  return next.sort((left, right) => right.updatedAt - left.updatedAt);
}

function loadProductState(companyId: string) {
  const loadedRooms = loadRequirementRoomRecords(companyId);
  const loadedMissions = loadConversationMissionRecords(companyId);
  const loadedConversationStates = loadConversationStateRecords(companyId);
  const loadedArtifacts = loadArtifactRecords(companyId);
  const loadedDispatches = loadDispatchRecords(companyId);
  const loadedRoomBindings = loadRoomConversationBindings(companyId);
  const loadedRounds = loadRoundRecords(companyId);
  const loadedWorkItems = reconcileStoredWorkItems({
    companyId,
    workItems: sanitizeWorkItemRecords(loadWorkItemRecords(companyId)),
    rooms: loadedRooms,
    artifacts: loadedArtifacts,
    dispatches: loadedDispatches,
  });

  return {
    loadedRooms,
    loadedMissions,
    loadedConversationStates,
    loadedWorkItems: syncArtifactLinks(syncDispatchLinks(loadedWorkItems, loadedDispatches), loadedArtifacts),
    loadedRounds,
    loadedArtifacts,
    loadedDispatches,
    loadedRoomBindings,
  };
}

function createEmptyProductState() {
  return {
    loadedRooms: [] as RequirementRoomRecord[],
    loadedMissions: [] as ConversationMissionRecord[],
    loadedConversationStates: [] as ConversationStateRecord[],
    loadedWorkItems: [] as WorkItemRecord[],
    loadedRounds: [] as RoundRecord[],
    loadedArtifacts: [] as ArtifactRecord[],
    loadedDispatches: [] as DispatchRecord[],
    loadedRoomBindings: [] as RoomConversationBindingRecord[],
  };
}

function loadInitialCompanyState() {
  try {
    const config = peekCachedCompanyConfig();
    const activeCompany = config?.companies.find((company) => company.id === config.activeCompanyId) ?? null;
    const state = activeCompany ? loadProductState(activeCompany.id) : createEmptyProductState();

    return {
      config: config ?? null,
      activeCompany,
      activeRoomRecords: state.loadedRooms,
      activeMissionRecords: state.loadedMissions,
      activeConversationStates: state.loadedConversationStates,
      activeWorkItems: state.loadedWorkItems,
      activeRoundRecords: state.loadedRounds,
      activeArtifacts: state.loadedArtifacts,
      activeDispatches: state.loadedDispatches,
      activeRoomBindings: state.loadedRoomBindings,
      bootstrapPhase: activeCompany ? ("ready" as const) : config ? ("missing" as const) : ("idle" as const),
    };
  } catch {
    return {
      config: null,
      activeCompany: null,
      activeRoomRecords: [] as RequirementRoomRecord[],
      activeMissionRecords: [] as ConversationMissionRecord[],
      activeConversationStates: [] as ConversationStateRecord[],
      activeWorkItems: [] as WorkItemRecord[],
      activeRoundRecords: [] as RoundRecord[],
      activeArtifacts: [] as ArtifactRecord[],
      activeDispatches: [] as DispatchRecord[],
      activeRoomBindings: [] as RoomConversationBindingRecord[],
      bootstrapPhase: "idle" as const,
    };
  }
}

const initialCompanyState = loadInitialCompanyState();

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
  config: initialCompanyState.config,
  activeCompany: initialCompanyState.activeCompany,
  activeRoomRecords: initialCompanyState.activeRoomRecords,
  activeMissionRecords: initialCompanyState.activeMissionRecords,
  activeConversationStates: initialCompanyState.activeConversationStates,
  activeWorkItems: initialCompanyState.activeWorkItems,
  activeRoundRecords: initialCompanyState.activeRoundRecords,
  activeArtifacts: initialCompanyState.activeArtifacts,
  activeDispatches: initialCompanyState.activeDispatches,
  activeRoomBindings: initialCompanyState.activeRoomBindings,
  loading: false,
  error: null,
  bootstrapPhase: initialCompanyState.bootstrapPhase,

  loadConfig: async () => {
    set({ loading: true, error: null, bootstrapPhase: "restoring" });
    try {
      const config = await loadCompanyConfig();
      if (config) {
        const active = config.companies.find((c) => c.id === config.activeCompanyId) || null;
        const state = active ? loadProductState(active.id) : createEmptyProductState();
        set({
          config,
          activeCompany: active,
          activeRoomRecords: state.loadedRooms,
          activeMissionRecords: state.loadedMissions,
          activeConversationStates: state.loadedConversationStates,
          activeWorkItems: state.loadedWorkItems,
          activeRoundRecords: state.loadedRounds,
          activeArtifacts: state.loadedArtifacts,
          activeDispatches: state.loadedDispatches,
          activeRoomBindings: state.loadedRoomBindings,
          loading: false,
          bootstrapPhase: active ? "ready" : "missing",
        });
        if (active) {
          persistActiveWorkItems(active.id, state.loadedWorkItems);
        }
      } else {
        set({
          config: null,
          activeCompany: null,
          activeRoomRecords: [],
          activeMissionRecords: [],
          activeConversationStates: [],
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
        activeConversationStates: [],
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
    const state = loadProductState(company.id);
    setPersistedActiveCompanyId(id);
    set({
      config: newConfig,
      activeCompany: company,
      activeRoomRecords: state.loadedRooms,
      activeMissionRecords: state.loadedMissions,
      activeConversationStates: state.loadedConversationStates,
      activeWorkItems: state.loadedWorkItems,
      activeRoundRecords: state.loadedRounds,
      activeArtifacts: state.loadedArtifacts,
      activeDispatches: state.loadedDispatches,
      activeRoomBindings: state.loadedRoomBindings,
      bootstrapPhase: "ready",
    });
    persistActiveWorkItems(company.id, state.loadedWorkItems);
    persistActiveConversationStates(company.id, state.loadedConversationStates);

    // Auto save on switch
    get().saveConfig();
  },

  deleteCompany: async (id: string) => {
    const { config } = get();
    if (!config) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const nextConfig = await deleteCompanyCascade(config, id);
      const nextActiveCompany =
        nextConfig?.companies.find((company) => company.id === nextConfig.activeCompanyId) ?? null;
      const nextState = nextActiveCompany ? loadProductState(nextActiveCompany.id) : createEmptyProductState();

      set({
        config: nextConfig,
        activeCompany: nextActiveCompany,
        activeRoomRecords: nextState.loadedRooms,
        activeMissionRecords: nextState.loadedMissions,
        activeConversationStates: nextState.loadedConversationStates,
        activeWorkItems: nextState.loadedWorkItems,
        activeRoundRecords: nextState.loadedRounds,
        activeArtifacts: nextState.loadedArtifacts,
        activeDispatches: nextState.loadedDispatches,
        activeRoomBindings: nextState.loadedRoomBindings,
        loading: false,
        bootstrapPhase: nextActiveCompany ? "ready" : "missing",
      });

      if (nextActiveCompany) {
        persistActiveWorkItems(nextActiveCompany.id, nextState.loadedWorkItems);
        persistActiveConversationStates(nextActiveCompany.id, nextState.loadedConversationStates);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      throw error;
    }
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
    const { activeCompany, activeRoomRecords, activeWorkItems, activeArtifacts, activeDispatches } = get();
    if (!activeCompany) {
      return;
    }
    if (
      (room.topicKey && isArtifactRequirementTopic(room.topicKey)) ||
      room.workItemId?.startsWith("topic:artifact:")
    ) {
      return;
    }

    const normalizedRoom = normalizeRoomRecordForState(room, activeCompany.id);
    const canonicalRoomId = normalizedRoom.id;
    const canonicalWorkItemId = normalizedRoom.workItemId ?? null;
    const next = [...activeRoomRecords];
    const index = next.findIndex(
      (item) =>
        item.id === canonicalRoomId ||
        (canonicalWorkItemId
          ? item.workItemId === canonicalWorkItemId || item.id === buildRoomRecordIdFromWorkItem(canonicalWorkItemId)
          : false),
    );
    let nextRoomRecord: RequirementRoomRecord;
    if (index >= 0) {
      const existing = next[index];
      nextRoomRecord = {
        ...existing,
        ...normalizedRoom,
        id: canonicalRoomId,
        companyId: normalizedRoom.companyId ?? existing.companyId ?? activeCompany.id,
        workItemId: normalizedRoom.workItemId ?? existing.workItemId,
        ownerActorId: normalizedRoom.ownerActorId ?? existing.ownerActorId ?? normalizedRoom.ownerAgentId ?? existing.ownerAgentId ?? null,
        batonActorId: normalizedRoom.batonActorId ?? existing.batonActorId ?? null,
        memberActorIds: mergeRoomMemberIds(existing.memberActorIds ?? existing.memberIds, normalizedRoom.memberActorIds ?? normalizedRoom.memberIds),
        status: normalizedRoom.status ?? existing.status ?? "active",
        headline: normalizedRoom.headline ?? existing.headline ?? normalizedRoom.title ?? existing.title,
        progress: normalizedRoom.progress ?? existing.progress,
        lastConclusionAt:
          normalizedRoom.lastConclusionAt ??
          existing.lastConclusionAt ??
          null,
        memberIds: mergeRoomMemberIds(existing.memberIds, normalizedRoom.memberIds),
        topicKey: normalizedRoom.topicKey ?? existing.topicKey,
        transcript: mergeRoomTranscript(existing.transcript, normalizedRoom.transcript),
        updatedAt: Math.max(existing.updatedAt, normalizedRoom.updatedAt),
      };
      if (areRequirementRoomRecordsEquivalent(existing, nextRoomRecord)) {
        return;
      }
      next[index] = nextRoomRecord;
    } else {
      nextRoomRecord = {
        ...normalizedRoom,
        id: canonicalRoomId,
        companyId: normalizedRoom.companyId ?? activeCompany.id,
        workItemId: normalizedRoom.workItemId,
        ownerActorId: normalizedRoom.ownerActorId ?? normalizedRoom.ownerAgentId ?? null,
        batonActorId: normalizedRoom.batonActorId ?? null,
        memberActorIds: mergeRoomMemberIds(normalizedRoom.memberActorIds ?? normalizedRoom.memberIds, normalizedRoom.memberIds),
        status: normalizedRoom.status ?? "active",
        headline: normalizedRoom.headline ?? normalizedRoom.title,
        progress: normalizedRoom.progress,
        transcript: mergeRoomTranscript([], normalizedRoom.transcript),
        lastConclusionAt: normalizedRoom.lastConclusionAt ?? null,
      };
      next.push(nextRoomRecord);
    }

    const sorted = sanitizeRequirementRoomRecords(activeCompany.id, next);
    const roomRecord = sorted.find((item) => item.id === canonicalRoomId) ?? nextRoomRecord;
    const reconciledWorkItems = reconcileStoredWorkItems({
      companyId: activeCompany.id,
      workItems: activeWorkItems,
      rooms: sorted,
      artifacts: activeArtifacts,
      dispatches: activeDispatches,
      targetWorkItemIds: [roomRecord?.workItemId],
      targetRoomIds: [roomRecord?.id],
      targetTopicKeys: [roomRecord?.topicKey],
    });
    if (
      areRequirementRoomRecordCollectionsEquivalent(activeRoomRecords, sorted) &&
      areWorkItemRecordCollectionsEquivalent(activeWorkItems, reconciledWorkItems)
    ) {
      return;
    }
    set({ activeRoomRecords: sorted, activeWorkItems: reconciledWorkItems });
    persistActiveRooms(activeCompany.id, sorted);
    persistActiveWorkItems(activeCompany.id, reconciledWorkItems);
  },

  appendRoomMessages: (roomId, messages, meta) => {
    const { activeCompany, activeRoomRecords, activeWorkItems, activeArtifacts, activeDispatches } = get();
    if (!activeCompany || messages.length === 0) {
      return;
    }
    if (
      (meta?.topicKey && isArtifactRequirementTopic(meta.topicKey)) ||
      meta?.workItemId?.startsWith("topic:artifact:")
    ) {
      return;
    }

    const now = messages.reduce((latest, message) => Math.max(latest, message.timestamp), Date.now());
    const draftRoom = normalizeRoomRecordForState(
      {
        id: roomId,
        sessionKey: meta?.sessionKey ?? roomId,
        title: meta?.title ?? "需求团队房间",
        companyId: meta?.companyId ?? activeCompany.id,
        workItemId: meta?.workItemId,
        topicKey: meta?.topicKey,
        ownerActorId: meta?.ownerActorId ?? meta?.ownerAgentId ?? null,
        batonActorId: meta?.batonActorId ?? null,
        memberActorIds: mergeRoomMemberIds(meta?.memberActorIds ?? meta?.memberIds ?? [], meta?.memberIds ?? []),
        status: meta?.status ?? "active",
        headline: meta?.headline ?? meta?.title ?? "需求团队房间",
        progress: meta?.progress,
        memberIds: meta?.memberIds ?? [],
        ownerAgentId: meta?.ownerAgentId ?? null,
        transcript: messages,
        createdAt: now,
        updatedAt: now,
        lastConclusionAt:
          meta?.lastConclusionAt ??
          (messages
            .filter((message) => message.role === "assistant")
            .reduce((latest, message) => Math.max(latest, message.timestamp), 0) || null),
        lastSourceSyncAt: meta?.lastSourceSyncAt,
      },
      activeCompany.id,
    );
    const canonicalRoomId = draftRoom.id;
    const canonicalWorkItemId = draftRoom.workItemId ?? null;
    const index = activeRoomRecords.findIndex(
      (room) =>
        room.id === canonicalRoomId ||
        (canonicalWorkItemId
          ? room.workItemId === canonicalWorkItemId || room.id === buildRoomRecordIdFromWorkItem(canonicalWorkItemId)
          : false),
    );
    const next = [...activeRoomRecords];
    let nextRoomRecord: RequirementRoomRecord;

    if (index >= 0) {
      const existing = next[index];
      nextRoomRecord = {
        ...existing,
        ...draftRoom,
        id: existing.id,
        companyId: draftRoom.companyId ?? existing.companyId ?? activeCompany.id,
        workItemId: draftRoom.workItemId ?? existing.workItemId,
        ownerActorId: draftRoom.ownerActorId ?? existing.ownerActorId ?? existing.ownerAgentId ?? null,
        batonActorId: draftRoom.batonActorId ?? existing.batonActorId ?? null,
        memberActorIds: mergeRoomMemberIds(existing.memberActorIds ?? existing.memberIds, draftRoom.memberActorIds ?? draftRoom.memberIds ?? []),
        status: draftRoom.status ?? existing.status ?? "active",
        headline: draftRoom.headline ?? existing.headline ?? draftRoom.title ?? existing.title,
        progress: draftRoom.progress ?? existing.progress,
        memberIds: mergeRoomMemberIds(existing.memberIds, draftRoom.memberIds ?? []),
        topicKey: draftRoom.topicKey ?? existing.topicKey,
        transcript: mergeRoomTranscript(existing.transcript, messages),
        lastConclusionAt:
          draftRoom.lastConclusionAt ??
          existing.lastConclusionAt ??
          (messages
            .filter((message) => message.role === "assistant")
            .reduce((latest, message) => Math.max(latest, message.timestamp), 0) || null),
        updatedAt: Math.max(existing.updatedAt, now),
      };
      if (areRequirementRoomRecordsEquivalent(existing, nextRoomRecord)) {
        return;
      }
      next[index] = nextRoomRecord;
    } else {
      nextRoomRecord = {
        ...draftRoom,
        id: canonicalRoomId,
        transcript: mergeRoomTranscript([], messages),
      };
      next.push(nextRoomRecord);
    }

    const sorted = sanitizeRequirementRoomRecords(activeCompany.id, next);
    const roomRecord = sorted.find((room) => room.id === canonicalRoomId) ?? null;
    const reconciledWorkItems = reconcileStoredWorkItems({
      companyId: activeCompany.id,
      workItems: activeWorkItems,
      rooms: sorted,
      artifacts: activeArtifacts,
      dispatches: activeDispatches,
      targetWorkItemIds: [roomRecord?.workItemId],
      targetRoomIds: [roomRecord?.id ?? canonicalRoomId],
      targetTopicKeys: [roomRecord?.topicKey],
    });
    if (
      areRequirementRoomRecordCollectionsEquivalent(activeRoomRecords, sorted) &&
      areWorkItemRecordCollectionsEquivalent(activeWorkItems, reconciledWorkItems)
    ) {
      return;
    }
    set({ activeRoomRecords: sorted, activeWorkItems: reconciledWorkItems });
    persistActiveRooms(activeCompany.id, sorted);
    persistActiveWorkItems(activeCompany.id, reconciledWorkItems);
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
    const { activeCompany, activeMissionRecords, activeRoomBindings, activeRoomRecords, activeWorkItems } = get();
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
    const roomIdFromBinding =
      mission.roomId
        ? activeRoomBindings.find((binding) => binding.conversationId === mission.roomId)?.roomId ?? null
        : null;
    const matchingRoom =
      activeRoomRecords.find((room) => room.id === mission.roomId || room.workItemId === mission.id)
      ?? (roomIdFromBinding ? activeRoomRecords.find((room) => room.id === roomIdFromBinding) ?? null : null)
      ?? null;
    const existingWorkItem =
      activeWorkItems.find((item) => item.id === mission.id)
      ?? activeWorkItems.find((item) => item.sourceMissionId === mission.id)
      ?? null;
    const workItem =
      mission.topicKey && isArtifactRequirementTopic(mission.topicKey)
        ? null
        :
      reconcileWorkItemRecord({
        companyId: activeCompany.id,
        existingWorkItem,
        mission,
        room: matchingRoom,
        fallbackSessionKey: mission.sessionKey,
        fallbackRoomId: matchingRoom?.id ?? mission.roomId ?? null,
      })
      ?? buildWorkItemRecordFromMission({
        companyId: activeCompany.id,
        mission,
        room: matchingRoom,
      });
    const nextWorkItems = [...activeWorkItems];
    if (workItem) {
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
    }

    const sortedWorkItems = sanitizeWorkItemRecords(nextWorkItems);
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

  setConversationCurrentWorkKey: (conversationId, workKey, workItemId, roundId) => {
    const { activeCompany, activeConversationStates } = get();
    if (!activeCompany || !conversationId) {
      return;
    }

    const nextRecord: ConversationStateRecord = {
      companyId: activeCompany.id,
      conversationId,
      currentWorkKey: workKey ?? null,
      currentWorkItemId: workItemId ?? null,
      currentRoundId: roundId ?? null,
      updatedAt: Date.now(),
    };
    const next = [...activeConversationStates];
    const index = next.findIndex((record) => record.conversationId === conversationId);
    if (index >= 0) {
      const existing = next[index]!;
      const merged: ConversationStateRecord = {
        ...existing,
        ...nextRecord,
        companyId: activeCompany.id,
      };
      if (areConversationStateRecordsEquivalent(existing, merged)) {
        return;
      }
      next[index] = merged;
    } else {
      next.push(nextRecord);
    }
    const sorted = next.sort((left, right) => right.updatedAt - left.updatedAt);
    set({ activeConversationStates: sorted });
    persistActiveConversationStates(activeCompany.id, sorted);
  },

  clearConversationState: (conversationId) => {
    const { activeCompany, activeConversationStates } = get();
    if (!activeCompany || !conversationId) {
      return;
    }
    const next = activeConversationStates.filter((record) => record.conversationId !== conversationId);
    if (next.length === activeConversationStates.length) {
      return;
    }
    set({ activeConversationStates: next });
    persistActiveConversationStates(activeCompany.id, next);
  },

  upsertWorkItemRecord: (workItem: WorkItemRecord) => {
    const { activeCompany, activeWorkItems, activeRoomRecords } = get();
    if (!activeCompany) {
      return;
    }
    if (workItem.topicKey && isArtifactRequirementTopic(workItem.topicKey)) {
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
      const mergedWorkItem = {
        ...existing,
        ...normalizedWorkItem,
        artifactIds: normalizedWorkItem.artifactIds.length > 0 ? normalizedWorkItem.artifactIds : existing.artifactIds,
        dispatchIds: normalizedWorkItem.dispatchIds.length > 0 ? normalizedWorkItem.dispatchIds : existing.dispatchIds,
        sourceActorId: normalizedWorkItem.sourceActorId ?? existing.sourceActorId ?? null,
        sourceActorLabel: normalizedWorkItem.sourceActorLabel ?? existing.sourceActorLabel ?? null,
        sourceSessionKey: normalizedWorkItem.sourceSessionKey ?? existing.sourceSessionKey ?? null,
        sourceConversationId:
          normalizedWorkItem.sourceConversationId ?? existing.sourceConversationId ?? null,
        providerId: normalizedWorkItem.providerId ?? existing.providerId ?? null,
        updatedAt: Math.max(existing.updatedAt, normalizedWorkItem.updatedAt),
      };
      if (areWorkItemRecordsEquivalent(existing, mergedWorkItem)) {
        return;
      }
      next[index] = mergedWorkItem;
    } else {
      next.push(normalizedWorkItem);
    }

    const sorted = sanitizeWorkItemRecords(next);
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

    const sorted = sanitizeRoundRecords(next);
    if (areRoundRecordCollectionsEquivalent(activeRoundRecords, sorted)) {
      return;
    }
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
    const { activeCompany, activeArtifacts, activeWorkItems, activeDispatches, activeRoomRecords } = get();
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
    const syncedWorkItems = reconcileStoredWorkItems({
      companyId: activeCompany.id,
      workItems: syncDispatchLinks(
      syncArtifactLinks(activeWorkItems, sortedArtifacts),
      activeDispatches,
      ),
      rooms: activeRoomRecords,
      artifacts: sortedArtifacts,
      dispatches: activeDispatches,
      targetWorkItemIds: [artifact.workItemId],
    });
    set({ activeArtifacts: sortedArtifacts, activeWorkItems: syncedWorkItems });
    persistActiveArtifacts(activeCompany.id, sortedArtifacts);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },

  syncArtifactMirrorRecords: (artifacts: ArtifactRecord[], mirrorPrefix = "workspace:") => {
    const { activeCompany, activeArtifacts, activeWorkItems, activeDispatches, activeRoomRecords } = get();
    if (!activeCompany) {
      return;
    }

    const preserved = activeArtifacts.filter((artifact) => !artifact.id.startsWith(mirrorPrefix));
    const mergedById = new Map<string, ArtifactRecord>();
    for (const artifact of preserved) {
      mergedById.set(artifact.id, artifact);
    }
    const normalizedIncoming = artifacts.map((artifact) => ({
      ...artifact,
      updatedAt: artifact.updatedAt || Date.now(),
      createdAt: artifact.createdAt || Date.now(),
    }));
    for (const artifact of normalizedIncoming) {
      const existing = mergedById.get(artifact.id);
      if (!existing) {
        mergedById.set(artifact.id, artifact);
        continue;
      }
      mergedById.set(artifact.id, {
        ...existing,
        ...artifact,
        summary: artifact.summary ?? existing.summary,
        content: artifact.content ?? existing.content,
      });
    }
    const sortedArtifacts = [...mergedById.values()].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );
    const syncedWorkItems = reconcileStoredWorkItems({
      companyId: activeCompany.id,
      workItems: syncDispatchLinks(
      syncArtifactLinks(activeWorkItems, sortedArtifacts),
      activeDispatches,
      ),
      rooms: activeRoomRecords,
      artifacts: sortedArtifacts,
      dispatches: activeDispatches,
      targetWorkItemIds: normalizedIncoming.map((artifact) => artifact.workItemId),
    });
    set({ activeArtifacts: sortedArtifacts, activeWorkItems: syncedWorkItems });
    persistActiveArtifacts(activeCompany.id, sortedArtifacts);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },

  deleteArtifactRecord: (artifactId: string) => {
    const { activeCompany, activeArtifacts, activeWorkItems, activeDispatches, activeRoomRecords } = get();
    if (!activeCompany) {
      return;
    }

    const deletedArtifact = activeArtifacts.find((artifact) => artifact.id === artifactId) ?? null;
    const next = activeArtifacts.filter((artifact) => artifact.id !== artifactId);
    const syncedWorkItems = reconcileStoredWorkItems({
      companyId: activeCompany.id,
      workItems: syncDispatchLinks(syncArtifactLinks(activeWorkItems, next), activeDispatches),
      rooms: activeRoomRecords,
      artifacts: next,
      dispatches: activeDispatches,
      targetWorkItemIds: [deletedArtifact?.workItemId],
    });
    set({ activeArtifacts: next, activeWorkItems: syncedWorkItems });
    persistActiveArtifacts(activeCompany.id, next);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },

  upsertDispatchRecord: (dispatch: DispatchRecord) => {
    const { activeCompany, activeDispatches, activeWorkItems, activeArtifacts, activeRoomRecords } = get();
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
    const syncedWorkItems = reconcileStoredWorkItems({
      companyId: activeCompany.id,
      workItems: syncArtifactLinks(
      syncDispatchLinks(activeWorkItems, sortedDispatches),
      activeArtifacts,
      ),
      rooms: activeRoomRecords,
      artifacts: activeArtifacts,
      dispatches: sortedDispatches,
      targetWorkItemIds: [dispatch.workItemId],
      targetRoomIds: [dispatch.roomId],
      targetTopicKeys: [dispatch.topicKey],
    });
    set({ activeDispatches: sortedDispatches, activeWorkItems: syncedWorkItems });
    persistActiveDispatches(activeCompany.id, sortedDispatches);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },

  replaceDispatchRecords: (dispatches: DispatchRecord[]) => {
    const { activeCompany, activeWorkItems, activeArtifacts, activeRoomRecords } = get();
    if (!activeCompany) {
      return;
    }

    const sortedDispatches = [...dispatches].sort((left, right) => right.updatedAt - left.updatedAt);
    const syncedWorkItems = reconcileStoredWorkItems({
      companyId: activeCompany.id,
      workItems: syncArtifactLinks(syncDispatchLinks(activeWorkItems, sortedDispatches), activeArtifacts),
      rooms: activeRoomRecords,
      artifacts: activeArtifacts,
      dispatches: sortedDispatches,
    });
    set({ activeDispatches: sortedDispatches, activeWorkItems: syncedWorkItems });
    persistActiveDispatches(activeCompany.id, sortedDispatches);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },

  deleteDispatchRecord: (dispatchId: string) => {
    const { activeCompany, activeDispatches, activeWorkItems, activeArtifacts, activeRoomRecords } = get();
    if (!activeCompany) {
      return;
    }

    const deletedDispatch = activeDispatches.find((dispatch) => dispatch.id === dispatchId) ?? null;
    const next = activeDispatches.filter((dispatch) => dispatch.id !== dispatchId);
    const syncedWorkItems = reconcileStoredWorkItems({
      companyId: activeCompany.id,
      workItems: syncArtifactLinks(syncDispatchLinks(activeWorkItems, next), activeArtifacts),
      rooms: activeRoomRecords,
      artifacts: activeArtifacts,
      dispatches: next,
      targetWorkItemIds: [deletedDispatch?.workItemId],
      targetRoomIds: [deletedDispatch?.roomId],
      targetTopicKeys: [deletedDispatch?.topicKey],
    });
    set({ activeDispatches: next, activeWorkItems: syncedWorkItems });
    persistActiveDispatches(activeCompany.id, next);
    persistActiveWorkItems(activeCompany.id, syncedWorkItems);
  },
}));
