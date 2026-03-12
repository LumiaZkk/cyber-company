import { pickCurrentParticipant, type ParticipantProgressTone } from "../../domain/mission/participant-progress";
import type { RequirementExecutionOverview, RequirementParticipantProgress } from "./requirement-overview";
import type { RequirementRoomRecord } from "../../domain/delegation/types";
import type {
  Company,
  RequirementAcceptanceStatus,
  ConversationStateRecord,
  DraftRequirementRecord,
  RequirementAggregateRecord,
  RequirementEvidenceEvent,
  RequirementLifecycleState,
  WorkItemRecord,
} from "../../domain";
import { isArtifactRequirementTopic, isStrategicRequirementTopic } from "./requirement-kind";
import { isCanonicalProductWorkItemRecord } from "./work-item-signal";
import {
  resolveRequirementLifecyclePhase,
  resolveRequirementStageGateStatus,
} from "./requirement-lifecycle";
import { isVisibleRequirementRoomMessage } from "../delegation/room-routing";
import {
  buildRoomRecordIdFromWorkItem,
  normalizeProductWorkItemIdentity,
  normalizeStrategicWorkItemId,
} from "./work-item";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => readString(entry)).filter((entry): entry is string => Boolean(entry)))];
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => readString(value)).filter((value): value is string => Boolean(value)))];
}

function hasStableDraftRequirement(
  draftRequirement: ConversationStateRecord["draftRequirement"] | null | undefined,
): draftRequirement is DraftRequirementRecord {
  return Boolean(
    draftRequirement &&
      readString(draftRequirement.summary) &&
      readString(draftRequirement.nextAction),
  );
}

function sortIds(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function inferRequirementKind(topicKey: string | null | undefined): RequirementAggregateRecord["kind"] {
  return isStrategicRequirementTopic(topicKey) ? "strategic" : "execution";
}

function normalizeRequirementTopicKey(
  topicKey: string | null | undefined,
  workItemId?: string | null,
  title?: string | null,
): string | null {
  return normalizeProductWorkItemIdentity({
    workItemId,
    topicKey,
    title,
  }).topicKey;
}

function normalizeRequirementAggregateRecord(
  record: RequirementAggregateRecord,
): RequirementAggregateRecord {
  const normalizedId = normalizeStrategicWorkItemId(record.id) ?? record.id;
  const normalizedIdentity = normalizeProductWorkItemIdentity({
    workItemId: record.workItemId ?? (normalizedId.startsWith("topic:") ? normalizedId : null),
    topicKey: record.topicKey,
    title: record.summary,
  });
  const normalizedWorkItemId =
    normalizedIdentity.workItemId ??
    normalizeStrategicWorkItemId(record.workItemId) ??
    (normalizedId.startsWith("topic:") ? normalizedId : null);
  const normalizedTopicKey =
    normalizedIdentity.topicKey ??
    normalizeRequirementTopicKey(
      normalizedId.startsWith("topic:") ? normalizedId.slice("topic:".length) : null,
      normalizedWorkItemId,
      record.summary,
    ) ??
    null;

  return {
    ...record,
    id: normalizedId,
    topicKey: normalizedTopicKey,
    workItemId: normalizedWorkItemId,
    roomId:
      normalizedWorkItemId
        ? buildRoomRecordIdFromWorkItem(normalizedWorkItemId)
        : readString(record.roomId),
    ownerActorId: readString(record.ownerActorId),
    sourceConversationId: readString(record.sourceConversationId),
  };
}

function deriveRequirementAcceptanceStatus(input: {
  existing: RequirementAggregateRecord | null;
  nextLifecycleStatus: RequirementLifecycleState;
}): RequirementAcceptanceStatus {
  const existingAcceptanceStatus = input.existing?.acceptanceStatus ?? "not_requested";
  if (existingAcceptanceStatus === "rejected") {
    return "rejected";
  }
  if (existingAcceptanceStatus === "accepted") {
    return input.nextLifecycleStatus === "completed" || input.nextLifecycleStatus === "archived"
      ? "accepted"
      : "not_requested";
  }
  if (
    input.nextLifecycleStatus === "completed" ||
    input.nextLifecycleStatus === "waiting_review" ||
    existingAcceptanceStatus === "pending"
  ) {
    return input.nextLifecycleStatus === "draft" ||
      input.nextLifecycleStatus === "active" ||
      input.nextLifecycleStatus === "waiting_peer" ||
      input.nextLifecycleStatus === "waiting_owner" ||
      input.nextLifecycleStatus === "blocked"
      ? "not_requested"
      : "pending";
  }
  return "not_requested";
}

export function mapWorkItemStatusToRequirementLifecycleState(
  status: WorkItemRecord["status"],
): RequirementLifecycleState {
  if (status === "draft") {
    return "draft";
  }
  if (status === "waiting_owner") {
    return "waiting_owner";
  }
  if (status === "waiting_review") {
    return "waiting_review";
  }
  if (status === "blocked") {
    return "blocked";
  }
  if (status === "completed") {
    return "completed";
  }
  if (status === "archived") {
    return "archived";
  }
  return "active";
}

function mapRoomStatusToRequirementLifecycleState(
  room: RequirementRoomRecord | null,
): RequirementLifecycleState | null {
  if (!room) {
    return null;
  }
  if (room.status === "archived") {
    return "archived";
  }
  return "active";
}

function mapLifecycleToParticipantStatus(
  status: RequirementLifecycleState,
): {
  statusLabel: string;
  tone: ParticipantProgressTone;
  isBlocking: boolean;
} {
  if (status === "blocked") {
    return { statusLabel: "已阻塞", tone: "rose", isBlocking: true };
  }
  if (status === "waiting_peer") {
    return { statusLabel: "待回复", tone: "amber", isBlocking: false };
  }
  if (status === "waiting_owner") {
    return { statusLabel: "待接手", tone: "violet", isBlocking: false };
  }
  if (status === "waiting_review") {
    return { statusLabel: "已确认", tone: "emerald", isBlocking: false };
  }
  if (status === "completed" || status === "archived") {
    return { statusLabel: "已回复", tone: "emerald", isBlocking: false };
  }
  if (status === "draft") {
    return { statusLabel: "待排期", tone: "slate", isBlocking: false };
  }
  return { statusLabel: "已开工", tone: "blue", isBlocking: false };
}

function mapWorkStepToParticipantStatus(
  status: WorkItemRecord["steps"][number]["status"],
): {
  statusLabel: string;
  tone: ParticipantProgressTone;
  isBlocking: boolean;
} {
  if (status === "blocked") {
    return { statusLabel: "已阻塞", tone: "rose", isBlocking: true };
  }
  if (status === "active") {
    return { statusLabel: "已开工", tone: "blue", isBlocking: false };
  }
  if (status === "done" || status === "skipped") {
    return { statusLabel: "已回复", tone: "emerald", isBlocking: false };
  }
  return { statusLabel: "待回复", tone: "amber", isBlocking: false };
}

function resolveEmployee(company: Company, actorId: string | null | undefined) {
  if (!actorId) {
    return null;
  }
  return company.employees.find((employee) => employee.agentId === actorId) ?? null;
}

function buildAggregateId(input: {
  existingId?: string | null;
  workItem?: WorkItemRecord | null;
  room?: RequirementRoomRecord | null;
  topicKey?: string | null;
  fallbackId?: string | null;
}): string | null {
  const workItemId = normalizeStrategicWorkItemId(input.workItem?.id) ?? readString(input.workItem?.id);
  if (workItemId) {
    return workItemId;
  }
  const roomWorkItemId =
    normalizeStrategicWorkItemId(input.room?.workItemId) ?? readString(input.room?.workItemId);
  if (roomWorkItemId) {
    return roomWorkItemId;
  }
  const topicKey =
    normalizeRequirementTopicKey(
      readString(input.topicKey) ?? readString(input.room?.topicKey),
      workItemId ?? roomWorkItemId,
    ) ??
    null;
  if (topicKey) {
    return `topic:${topicKey}`;
  }
  const existingId = normalizeStrategicWorkItemId(input.existingId) ?? readString(input.existingId);
  if (existingId) {
    return existingId;
  }
  const fallbackId = normalizeStrategicWorkItemId(input.fallbackId) ?? readString(input.fallbackId);
  if (fallbackId) {
    return fallbackId;
  }
  return readString(input.room?.id);
}

function findMatchingRoom(
  workItem: WorkItemRecord | null,
  rooms: RequirementRoomRecord[],
): RequirementRoomRecord | null {
  if (!workItem) {
    return null;
  }
  return (
    rooms.find(
      (room) =>
        room.id === workItem.roomId ||
        room.workItemId === workItem.id ||
        (workItem.topicKey && room.topicKey === workItem.topicKey),
    ) ?? null
  );
}

function findMatchingWorkItem(
  aggregate: RequirementAggregateRecord,
  workItems: WorkItemRecord[],
): WorkItemRecord | null {
  return (
    workItems.find((item) => item.id === aggregate.workItemId) ??
    workItems.find((item) => item.workKey === aggregate.workItemId) ??
    workItems.find((item) => item.id === aggregate.id) ??
    (aggregate.topicKey
      ? workItems.find((item) => item.topicKey === aggregate.topicKey && item.status !== "archived")
      : null) ??
    null
  );
}

function findMatchingRoomForAggregate(
  aggregate: RequirementAggregateRecord,
  rooms: RequirementRoomRecord[],
): RequirementRoomRecord | null {
  return (
    rooms.find((room) => room.id === aggregate.roomId) ??
    rooms.find((room) => room.workItemId === aggregate.workItemId) ??
    (aggregate.topicKey ? rooms.find((room) => room.topicKey === aggregate.topicKey) : null) ??
    null
  );
}

function findLatestEvidenceTimestamp(
  aggregateId: string,
  evidence: RequirementEvidenceEvent[],
): number | null {
  const normalizedAggregateId = normalizeStrategicWorkItemId(aggregateId) ?? aggregateId;
  const latest = evidence
    .filter((event) => (normalizeStrategicWorkItemId(event.aggregateId) ?? event.aggregateId) === normalizedAggregateId)
    .reduce((max, event) => Math.max(max, event.timestamp), 0);
  return latest > 0 ? latest : null;
}

function readSourceConversationActorId(sessionKey: string | null | undefined): string | null {
  const normalized = readString(sessionKey);
  if (!normalized || !normalized.startsWith("agent:")) {
    return null;
  }
  const parts = normalized.split(":");
  const actorId = parts[1]?.trim();
  return actorId && actorId.length > 0 ? actorId : null;
}

function roomHasVisibleTranscript(room: RequirementRoomRecord | null | undefined): boolean {
  return Boolean(room?.transcript?.some((message) => isVisibleRequirementRoomMessage(message)));
}

function isRoomShellDerivedAggregate(
  aggregate: RequirementAggregateRecord | null,
  room: RequirementRoomRecord | null,
): boolean {
  if (!aggregate || !room || roomHasVisibleTranscript(room)) {
    return false;
  }
  const roomHeadline = readString(room.headline) ?? readString(room.title);
  const roomProgress = readString(room.progress);
  return Boolean(
    roomHeadline &&
      roomProgress &&
      aggregate.summary === roomHeadline &&
      aggregate.stage === roomProgress &&
      aggregate.nextAction === roomProgress,
  );
}

function resolveAggregateOwnerActorId(input: {
  workItem: WorkItemRecord | null;
  room: RequirementRoomRecord | null;
  draftRequirement?: ConversationStateRecord["draftRequirement"] | null;
  existing: RequirementAggregateRecord | null;
}): string | null {
  const existingLooksShellDerived = isRoomShellDerivedAggregate(input.existing, input.room);
  const sourceConversationActorId =
    readSourceConversationActorId(input.draftRequirement ? null : input.existing?.sourceConversationId) ??
    readSourceConversationActorId(input.room?.sessionKey) ??
    readSourceConversationActorId(input.workItem?.sourceConversationId) ??
    readSourceConversationActorId(input.workItem?.sessionKey) ??
    null;
  const trustedRoomOwnerActorId = roomHasVisibleTranscript(input.room)
    ? readString(input.room?.ownerActorId) ?? readString(input.room?.ownerAgentId)
    : null;
  return (
    readString(input.workItem?.ownerActorId) ??
    readString(input.draftRequirement?.ownerActorId) ??
    (existingLooksShellDerived ? null : readString(input.existing?.ownerActorId)) ??
    sourceConversationActorId ??
    trustedRoomOwnerActorId ??
    null
  );
}

function resolveAggregateOwnerLabel(input: {
  workItem: WorkItemRecord | null;
  room: RequirementRoomRecord | null;
  draftRequirement?: ConversationStateRecord["draftRequirement"] | null;
  existing: RequirementAggregateRecord | null;
}): string {
  const existingLooksShellDerived = isRoomShellDerivedAggregate(input.existing, input.room);
  const trustedRoomTitle = roomHasVisibleTranscript(input.room) ? readString(input.room?.title) : null;
  return (
    readString(input.workItem?.ownerLabel) ??
    readString(input.draftRequirement?.ownerLabel) ??
    (existingLooksShellDerived ? null : readString(input.existing?.ownerLabel)) ??
    trustedRoomTitle ??
    "当前负责人"
  );
}

function buildAggregateIdFromConversationState(
  state: ConversationStateRecord,
): string | null {
  const currentWorkItemId =
    normalizeStrategicWorkItemId(state.currentWorkItemId) ?? readString(state.currentWorkItemId);
  if (currentWorkItemId) {
    return currentWorkItemId;
  }
  const currentWorkKey =
    normalizeStrategicWorkItemId(state.currentWorkKey) ?? readString(state.currentWorkKey);
  if (currentWorkKey) {
    return currentWorkKey;
  }
  const draftTopicKey = normalizeRequirementTopicKey(readString(state.draftRequirement?.topicKey));
  if (draftTopicKey) {
    return `topic:${draftTopicKey}`;
  }
  return readString(state.conversationId);
}

function findMatchingConversationState(
  aggregate: RequirementAggregateRecord | null,
  conversationStates: ConversationStateRecord[],
  workItem: WorkItemRecord | null,
): ConversationStateRecord | null {
  return (
    conversationStates.find((state) => state.currentWorkItemId === workItem?.id) ??
    conversationStates.find((state) => state.currentWorkKey === workItem?.workKey) ??
    conversationStates.find((state) => state.conversationId === aggregate?.sourceConversationId) ??
    (aggregate?.topicKey
      ? conversationStates.find((state) => state.draftRequirement?.topicKey === aggregate.topicKey)
      : null) ??
    conversationStates.find((state) => {
      const draft = state.draftRequirement;
      return (
        hasStableDraftRequirement(draft) &&
        (draft.ownerActorId === aggregate?.ownerActorId ||
          draft.summary === aggregate?.summary)
      );
    }) ??
    null
  );
}

function resolveDraftRequirementStatus(input: {
  existing: RequirementAggregateRecord | null;
  draftRequirement: ConversationStateRecord["draftRequirement"] | null | undefined;
}): RequirementLifecycleState {
  if (input.existing?.status) {
    return input.existing.status;
  }
  if (input.draftRequirement?.stageGateStatus === "waiting_confirmation") {
    return "waiting_owner";
  }
  return "active";
}

function buildAggregateMemberIds(
  existing: RequirementAggregateRecord | null,
  workItem: WorkItemRecord | null,
  room: RequirementRoomRecord | null,
  draftRequirement?: ConversationStateRecord["draftRequirement"] | null,
): string[] {
  return sortIds(
    uniqueIds([
      ...(existing?.memberIds ?? []),
      ...(room?.memberIds ?? []),
      ...(room?.memberActorIds ?? []),
      workItem?.ownerActorId,
      workItem?.batonActorId,
      draftRequirement?.ownerActorId,
      ...((workItem?.steps ?? []).map((step) => step.assigneeActorId ?? null)),
    ]),
  );
}

function materializeAggregateRecord(input: {
  companyId: string;
  existing: RequirementAggregateRecord | null;
  workItem: WorkItemRecord | null;
  room: RequirementRoomRecord | null;
  evidence: RequirementEvidenceEvent[];
  draftRequirement?: ConversationStateRecord["draftRequirement"] | null;
  draftConversationId?: string | null;
  fallbackId?: string | null;
}): RequirementAggregateRecord | null {
  const id = buildAggregateId({
    existingId: input.existing?.id,
    workItem: input.workItem,
    room: input.room,
    topicKey: input.workItem?.topicKey ?? input.existing?.topicKey ?? null,
    fallbackId: input.fallbackId ?? null,
  });
  if (!id) {
    return null;
  }

  const topicKey =
    readString(input.workItem?.topicKey) ??
    readString(input.room?.topicKey) ??
    readString(input.draftRequirement?.topicKey) ??
    readString(input.existing?.topicKey) ??
    null;
  if (topicKey && isArtifactRequirementTopic(topicKey)) {
    return null;
  }

  const latestEvidenceAt = findLatestEvidenceTimestamp(id, input.evidence);
  const trustedRoomPresentation = roomHasVisibleTranscript(input.room);
  const existingLooksShellDerived = isRoomShellDerivedAggregate(input.existing, input.room);
  const nextLifecycleStatus =
    (input.workItem
      ? mapWorkItemStatusToRequirementLifecycleState(input.workItem.status)
      : mapRoomStatusToRequirementLifecycleState(input.room)) ??
    (hasStableDraftRequirement(input.draftRequirement)
      ? resolveDraftRequirementStatus({
          existing: input.existing,
          draftRequirement: input.draftRequirement,
        })
      : null) ??
    input.existing?.status ??
    "active";
  const acceptanceStatus = deriveRequirementAcceptanceStatus({
    existing: input.existing,
    nextLifecycleStatus,
  });
  const stageGateStatus = resolveRequirementStageGateStatus({
    explicitStageGateStatus:
      input.workItem?.stageGateStatus ??
      input.existing?.stageGateStatus ??
      input.draftRequirement?.stageGateStatus ??
      "none",
    completed: nextLifecycleStatus === "completed" || nextLifecycleStatus === "archived",
  });
  const lifecyclePhase = resolveRequirementLifecyclePhase({
    explicitLifecyclePhase:
      input.workItem?.lifecyclePhase ?? input.existing?.lifecyclePhase ?? null,
    stageGateStatus,
    promotionState: input.draftRequirement?.state,
    workItemStatus: input.workItem?.status ?? null,
    completed: nextLifecycleStatus === "completed" || nextLifecycleStatus === "archived",
    hasExecutionSignal:
      Boolean(input.room?.lastConclusionAt) ||
      Boolean(input.workItem?.dispatchIds.length) ||
      Boolean(input.workItem?.steps.some((step) => step.status === "active" || step.status === "done")),
  });
  const nextRecordBase: Omit<RequirementAggregateRecord, "revision" | "primary"> = {
    id,
    companyId: input.companyId,
    topicKey,
    kind:
      input.workItem?.kind === "artifact"
        ? inferRequirementKind(topicKey)
        : input.workItem?.kind === "strategic" || input.workItem?.kind === "execution"
          ? input.workItem.kind
          : inferRequirementKind(topicKey),
    workItemId: readString(input.workItem?.id) ?? readString(input.room?.workItemId) ?? readString(input.existing?.workItemId) ?? null,
    roomId: readString(input.room?.id) ?? readString(input.workItem?.roomId) ?? readString(input.existing?.roomId) ?? null,
    ownerActorId: resolveAggregateOwnerActorId({
      workItem: input.workItem,
      room: input.room,
      draftRequirement: input.draftRequirement,
      existing: input.existing,
    }),
    ownerLabel: resolveAggregateOwnerLabel({
      workItem: input.workItem,
      room: input.room,
      draftRequirement: input.draftRequirement,
      existing: input.existing,
    }),
    lifecyclePhase,
    stageGateStatus,
    stage:
      readString(input.workItem?.displayStage) ??
      readString(input.workItem?.stageLabel) ??
      readString(input.draftRequirement?.stage) ??
      (existingLooksShellDerived ? null : readString(input.existing?.stage)) ??
      (trustedRoomPresentation ? readString(input.room?.progress) : null) ??
      (stageGateStatus === "waiting_confirmation" ? "待确认" : "进行中"),
    summary:
      readString(input.workItem?.displaySummary) ??
      readString(input.workItem?.summary) ??
      readString(input.draftRequirement?.summary) ??
      (existingLooksShellDerived ? null : readString(input.existing?.summary)) ??
      (trustedRoomPresentation ? readString(input.room?.headline) : null) ??
      "当前主线正在推进。",
    nextAction:
      readString(input.workItem?.displayNextAction) ??
      readString(input.workItem?.nextAction) ??
      readString(input.draftRequirement?.nextAction) ??
      (existingLooksShellDerived ? null : readString(input.existing?.nextAction)) ??
      (trustedRoomPresentation ? readString(input.room?.progress) : null) ??
      "继续推进当前主线。",
    memberIds: buildAggregateMemberIds(
      input.existing,
      input.workItem,
      input.room,
      input.draftRequirement,
    ),
    sourceConversationId:
      readString(input.workItem?.sourceConversationId) ??
      readString(input.workItem?.sourceSessionKey) ??
      readString(input.workItem?.sessionKey) ??
      readString(input.room?.sessionKey) ??
      readString(input.draftConversationId) ??
      readString(input.existing?.sourceConversationId) ??
      null,
    startedAt:
      input.workItem?.startedAt ??
      input.room?.createdAt ??
      input.draftRequirement?.updatedAt ??
      input.existing?.startedAt ??
      Date.now(),
    updatedAt: Math.max(
      input.workItem?.updatedAt ?? 0,
      input.room?.updatedAt ?? 0,
      input.draftRequirement?.updatedAt ?? 0,
      input.existing?.updatedAt ?? 0,
      latestEvidenceAt ?? 0,
      Date.now(),
    ),
    lastEvidenceAt:
      Math.max(
        input.existing?.lastEvidenceAt ?? 0,
        latestEvidenceAt ?? 0,
        input.room?.lastSourceSyncAt ?? 0,
        input.room?.lastConclusionAt ?? 0,
      ) || null,
    status: nextLifecycleStatus,
    acceptanceStatus,
    acceptanceNote:
      acceptanceStatus === input.existing?.acceptanceStatus
        ? input.existing?.acceptanceNote ?? null
        : null,
  };

  const existing = input.existing;
  const materialChanged =
    !existing ||
    existing.topicKey !== nextRecordBase.topicKey ||
    existing.kind !== nextRecordBase.kind ||
    existing.workItemId !== nextRecordBase.workItemId ||
    existing.roomId !== nextRecordBase.roomId ||
    existing.ownerActorId !== nextRecordBase.ownerActorId ||
    existing.ownerLabel !== nextRecordBase.ownerLabel ||
    existing.lifecyclePhase !== nextRecordBase.lifecyclePhase ||
    existing.stageGateStatus !== nextRecordBase.stageGateStatus ||
    existing.stage !== nextRecordBase.stage ||
    existing.summary !== nextRecordBase.summary ||
    existing.nextAction !== nextRecordBase.nextAction ||
    existing.sourceConversationId !== nextRecordBase.sourceConversationId ||
    existing.status !== nextRecordBase.status ||
    existing.acceptanceStatus !== nextRecordBase.acceptanceStatus ||
    (existing.acceptanceNote ?? null) !== (nextRecordBase.acceptanceNote ?? null) ||
    existing.startedAt !== nextRecordBase.startedAt ||
    existing.memberIds.join("|") !== nextRecordBase.memberIds.join("|");

  return {
    ...nextRecordBase,
    primary: existing?.primary ?? false,
    revision: existing ? (materialChanged ? existing.revision + 1 : existing.revision) : 1,
  };
}

function pickPrimaryAggregateId(input: {
  aggregates: RequirementAggregateRecord[];
  currentPrimaryRequirementId: string | null;
  conversationStates: ConversationStateRecord[];
}): string | null {
  const activeAggregates = input.aggregates.filter((aggregate) => aggregate.status !== "archived");
  const byId = new Map(activeAggregates.map((aggregate) => [aggregate.id, aggregate] as const));
  const normalizedCurrentPrimaryRequirementId =
    normalizeStrategicWorkItemId(input.currentPrimaryRequirementId) ??
    input.currentPrimaryRequirementId;
  const conversationAnchored = [...input.conversationStates]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((state) => {
      if (state.currentWorkItemId) {
        return (
          activeAggregates.find((aggregate) => aggregate.workItemId === state.currentWorkItemId) ??
          activeAggregates.find((aggregate) => aggregate.id === state.currentWorkItemId) ??
          null
        );
      }
      if (state.currentWorkKey) {
        return (
          activeAggregates.find((aggregate) => aggregate.workItemId === state.currentWorkKey) ??
          activeAggregates.find((aggregate) => aggregate.id === state.currentWorkKey) ??
          activeAggregates.find(
            (aggregate) => aggregate.topicKey && `topic:${aggregate.topicKey}` === state.currentWorkKey,
          ) ??
          null
        );
      }
      if (state.draftRequirement?.topicKey) {
        return (
          activeAggregates.find((aggregate) => aggregate.topicKey === state.draftRequirement?.topicKey) ??
          activeAggregates.find((aggregate) => aggregate.id === state.conversationId) ??
          null
        );
      }
      if (state.draftRequirement) {
        return activeAggregates.find((aggregate) => aggregate.id === state.conversationId) ?? null;
      }
      return null;
    })
    .find((aggregate): aggregate is RequirementAggregateRecord => Boolean(aggregate));
  if (conversationAnchored) {
    return conversationAnchored.id;
  }

  const lockedPrimary = normalizedCurrentPrimaryRequirementId
    ? byId.get(normalizedCurrentPrimaryRequirementId) ?? null
    : null;
  if (lockedPrimary) {
    return lockedPrimary.id;
  }

  const existingPrimary =
    activeAggregates.find((aggregate) => aggregate.primary) ??
    null;
  if (existingPrimary) {
    return existingPrimary.id;
  }

  const strategicOpen =
    [...activeAggregates]
      .filter(
        (aggregate) =>
          aggregate.kind === "strategic" &&
          aggregate.status !== "completed" &&
          aggregate.status !== "archived",
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
  if (strategicOpen) {
    return strategicOpen.id;
  }

  const latestOpen =
    [...activeAggregates]
      .filter((aggregate) => aggregate.status !== "completed" && aggregate.status !== "archived")
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
  if (latestOpen) {
    return latestOpen.id;
  }

  return activeAggregates.sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id ?? null;
}

export function sanitizeRequirementAggregateRecords(
  records: RequirementAggregateRecord[],
  primaryRequirementId: string | null,
): RequirementAggregateRecord[] {
  const normalizedPrimaryRequirementId =
    normalizeStrategicWorkItemId(primaryRequirementId) ?? primaryRequirementId;
  const byId = new Map<string, RequirementAggregateRecord>();
  records.forEach((record) => {
    const normalizedRecord = normalizeRequirementAggregateRecord(record);
    const previous = byId.get(normalizedRecord.id);
    if (!previous || normalizedRecord.updatedAt >= previous.updatedAt) {
      byId.set(normalizedRecord.id, normalizedRecord);
    }
  });

  return [...byId.values()]
    .map((record) => ({
      ...record,
      primary: normalizedPrimaryRequirementId ? record.id === normalizedPrimaryRequirementId : false,
      memberIds: sortIds(uniqueIds(record.memberIds)),
      acceptanceStatus: record.acceptanceStatus ?? "not_requested",
      acceptanceNote:
        typeof record.acceptanceNote === "string" && record.acceptanceNote.trim().length > 0
          ? record.acceptanceNote.trim()
          : null,
    }))
    .sort((left, right) => {
      const primaryDelta = Number(right.primary) - Number(left.primary);
      if (primaryDelta !== 0) {
        return primaryDelta;
      }
      return right.updatedAt - left.updatedAt;
    });
}

export function reconcileRequirementAggregateState(input: {
  companyId: string;
  existingAggregates: RequirementAggregateRecord[];
  primaryRequirementId: string | null;
  activeConversationStates: ConversationStateRecord[];
  activeWorkItems: WorkItemRecord[];
  activeRoomRecords: RequirementRoomRecord[];
  activeRequirementEvidence: RequirementEvidenceEvent[];
}): {
  activeRequirementAggregates: RequirementAggregateRecord[];
  primaryRequirementId: string | null;
} {
  const normalizedExistingAggregates = sanitizeRequirementAggregateRecords(
    input.existingAggregates,
    input.primaryRequirementId,
  );
  const normalizedPrimaryRequirementId =
    normalizeStrategicWorkItemId(input.primaryRequirementId) ?? input.primaryRequirementId;
  const candidateWorkItems = input.activeWorkItems.filter(
    (item) =>
      isCanonicalProductWorkItemRecord(item) &&
      item.kind !== "artifact" &&
      !isArtifactRequirementTopic(item.topicKey),
  );
  const candidateIds = new Set<string>(candidateWorkItems.map((item) => item.id));
  input.activeRoomRecords.forEach((room) => {
    const roomWorkItemId = readString(room.workItemId);
    if (roomWorkItemId) {
      candidateIds.add(roomWorkItemId);
      return;
    }
    const topicKey = readString(room.topicKey);
    if (topicKey && !isArtifactRequirementTopic(topicKey)) {
      candidateIds.add(`topic:${topicKey}`);
    }
  });
  input.activeConversationStates.forEach((state) => {
    if (!hasStableDraftRequirement(state.draftRequirement)) {
      return;
    }
    const candidateId = buildAggregateIdFromConversationState(state);
    if (candidateId) {
      candidateIds.add(candidateId);
    }
  });
  normalizedExistingAggregates.forEach((aggregate) => {
    candidateIds.add(aggregate.id);
  });

  const nextAggregates: RequirementAggregateRecord[] = [];
  candidateIds.forEach((candidateId) => {
    const existing =
      normalizedExistingAggregates.find((aggregate) => aggregate.id === candidateId) ??
      normalizedExistingAggregates.find((aggregate) => aggregate.workItemId === candidateId) ??
      normalizedExistingAggregates.find((aggregate) => aggregate.sourceConversationId === candidateId) ??
      null;
    const workItem =
      candidateWorkItems.find((item) => item.id === candidateId) ??
      candidateWorkItems.find((item) => item.workKey === candidateId) ??
      candidateWorkItems.find((item) => item.sourceConversationId === candidateId) ??
      (existing ? findMatchingWorkItem(existing, candidateWorkItems) : null) ??
      null;
    const room =
      findMatchingRoom(workItem, input.activeRoomRecords) ??
      (existing ? findMatchingRoomForAggregate(existing, input.activeRoomRecords) : null) ??
      null;
    const draftConversationState =
      input.activeConversationStates.find(
        (state) => buildAggregateIdFromConversationState(state) === candidateId,
      ) ??
      findMatchingConversationState(existing, input.activeConversationStates, workItem) ??
      null;
    const record = materializeAggregateRecord({
      companyId: input.companyId,
      existing,
      workItem,
      room,
      evidence: input.activeRequirementEvidence,
      draftRequirement: draftConversationState?.draftRequirement ?? null,
      draftConversationId: draftConversationState?.conversationId ?? null,
      fallbackId: candidateId,
    });
    if (record) {
      nextAggregates.push(record);
    }
  });

  const resolvedPrimaryRequirementId = pickPrimaryAggregateId({
    aggregates: nextAggregates,
    currentPrimaryRequirementId: normalizedPrimaryRequirementId,
    conversationStates: input.activeConversationStates,
  });

  return {
    activeRequirementAggregates: sanitizeRequirementAggregateRecords(
      nextAggregates,
      resolvedPrimaryRequirementId,
    ),
    primaryRequirementId: resolvedPrimaryRequirementId,
  };
}

export function selectPrimaryRequirementAggregate(input: {
  activeRequirementAggregates: RequirementAggregateRecord[];
  primaryRequirementId: string | null;
}): RequirementAggregateRecord | null {
  return (
    input.activeRequirementAggregates.find((aggregate) => aggregate.id === input.primaryRequirementId) ??
    input.activeRequirementAggregates.find((aggregate) => aggregate.primary) ??
    null
  );
}

function buildParticipantFromAggregate(input: {
  company: Company;
  actorId: string;
  stage: string;
  statusLabel: string;
  tone: ParticipantProgressTone;
  detail: string;
  updatedAt: number;
  isBlocking: boolean;
  isCurrent: boolean;
}): RequirementParticipantProgress {
  const employee = resolveEmployee(input.company, input.actorId);
  return {
    agentId: input.actorId,
    nickname: employee?.nickname ?? input.actorId,
    role: employee?.role ?? "团队成员",
    stage: input.stage,
    statusLabel: input.statusLabel,
    detail: input.detail,
    updatedAt: input.updatedAt,
    tone: input.tone,
    isBlocking: input.isBlocking,
    isCurrent: input.isCurrent,
  };
}

function buildFallbackParticipants(input: {
  company: Company;
  aggregate: RequirementAggregateRecord;
  workItem: WorkItemRecord | null;
  room: RequirementRoomRecord | null;
}): RequirementParticipantProgress[] {
  const participants: RequirementParticipantProgress[] = [];
  const stepParticipants = (input.workItem?.steps ?? [])
    .map((step) => {
      const actorId = readString(step.assigneeActorId);
      if (!actorId) {
        return null;
      }
      const status = mapWorkStepToParticipantStatus(step.status);
      return buildParticipantFromAggregate({
        company: input.company,
        actorId,
        stage: step.title,
        statusLabel: status.statusLabel,
        tone: status.tone,
        detail: readString(step.detail) ?? readString(step.completionCriteria) ?? input.aggregate.summary,
        updatedAt: step.updatedAt,
        isBlocking: status.isBlocking,
        isCurrent: actorId === input.aggregate.ownerActorId,
      });
    })
    .filter((participant): participant is RequirementParticipantProgress => Boolean(participant));
  participants.push(...stepParticipants);

  const ownerActorId = readString(input.aggregate.ownerActorId);
  if (
    ownerActorId &&
    !participants.some((participant) => participant.agentId === ownerActorId)
  ) {
    const status = mapLifecycleToParticipantStatus(input.aggregate.status);
    participants.push(
      buildParticipantFromAggregate({
        company: input.company,
        actorId: ownerActorId,
        stage: input.aggregate.stage,
        statusLabel: status.statusLabel,
        tone: status.tone,
        detail: input.aggregate.summary,
        updatedAt: input.aggregate.updatedAt,
        isBlocking: status.isBlocking,
        isCurrent: true,
      }),
    );
  }

  uniqueIds([...(input.room?.memberIds ?? []), ...(input.aggregate.memberIds ?? [])]).forEach((actorId) => {
    if (participants.some((participant) => participant.agentId === actorId)) {
      return;
    }
    const status = actorId === ownerActorId
      ? mapLifecycleToParticipantStatus(input.aggregate.status)
      : { statusLabel: "待回复", tone: "amber" as const, isBlocking: false };
    participants.push(
      buildParticipantFromAggregate({
        company: input.company,
        actorId,
        stage: actorId === ownerActorId ? input.aggregate.stage : "待命",
        statusLabel: status.statusLabel,
        tone: status.tone,
        detail: input.aggregate.summary,
        updatedAt: input.aggregate.updatedAt,
        isBlocking: status.isBlocking,
        isCurrent: actorId === ownerActorId,
      }),
    );
  });

  if (participants.length === 0) {
    return [];
  }

  const current = pickCurrentParticipant(participants);
  return participants
    .map((participant) => ({
      ...participant,
      isCurrent: current ? participant.agentId === current.agentId : participant.isCurrent,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function buildAggregateBackedRequirementOverview(input: {
  company: Company;
  aggregate: RequirementAggregateRecord | null;
  workItem: WorkItemRecord | null;
  room: RequirementRoomRecord | null;
  rawOverview?: RequirementExecutionOverview | null;
}): RequirementExecutionOverview | null {
  if (!input.aggregate) {
    return input.rawOverview ?? null;
  }
  const overviewIdentity = normalizeProductWorkItemIdentity({
    workItemId: input.workItem?.id ?? input.aggregate.workItemId ?? input.aggregate.id,
    topicKey: input.aggregate.topicKey ?? input.workItem?.topicKey ?? null,
    title: readString(input.workItem?.title) ?? input.aggregate.summary ?? null,
  });
  const canonicalTopicKey =
    overviewIdentity.topicKey ??
    readString(input.aggregate.topicKey) ??
    readString(input.workItem?.topicKey) ??
    null;
  if (
    input.rawOverview &&
    (!canonicalTopicKey || input.rawOverview.topicKey === canonicalTopicKey)
  ) {
    return canonicalTopicKey && input.rawOverview.topicKey !== canonicalTopicKey
      ? { ...input.rawOverview, topicKey: canonicalTopicKey }
      : input.rawOverview;
  }
  const participants = buildFallbackParticipants({
    company: input.company,
    aggregate: input.aggregate,
    workItem: input.workItem,
    room: input.room,
  });
  const currentParticipant = pickCurrentParticipant(participants);
  return {
    topicKey:
      canonicalTopicKey ??
      input.aggregate.id,
    title: readString(input.workItem?.title) ?? input.aggregate.summary ?? "当前主线",
    startedAt: input.aggregate.startedAt,
    headline: readString(input.workItem?.headline) ?? input.aggregate.summary,
    summary: input.aggregate.summary,
    currentOwnerAgentId: input.aggregate.ownerActorId,
    currentOwnerLabel:
      readString(input.workItem?.ownerLabel) ?? input.aggregate.ownerLabel ?? currentParticipant?.nickname ?? "当前负责人",
    currentStage:
      readString(input.workItem?.displayStage) ?? input.aggregate.stage ?? currentParticipant?.stage ?? "进行中",
    nextAction: input.aggregate.nextAction,
    participants,
  };
}

export function selectPrimaryRequirementProjection(input: {
  company: Company | null;
  activeRequirementAggregates: RequirementAggregateRecord[];
  primaryRequirementId: string | null;
  activeWorkItems: WorkItemRecord[];
  activeRoomRecords: RequirementRoomRecord[];
}): {
  aggregate: RequirementAggregateRecord | null;
  workItem: WorkItemRecord | null;
  room: RequirementRoomRecord | null;
} {
  const aggregate = selectPrimaryRequirementAggregate({
    activeRequirementAggregates: input.activeRequirementAggregates,
    primaryRequirementId: input.primaryRequirementId,
  });
  if (!aggregate) {
    return { aggregate: null, workItem: null, room: null };
  }
  return {
    aggregate,
    workItem: findMatchingWorkItem(aggregate, input.activeWorkItems),
    room: findMatchingRoomForAggregate(aggregate, input.activeRoomRecords),
  };
}

export function resolveRequirementAggregateIdForEvidence(input: {
  activeRequirementAggregates: RequirementAggregateRecord[];
  activeRoomRecords: RequirementRoomRecord[];
  primaryRequirementId: string | null;
  event: RequirementEvidenceEvent;
}): string | null {
  const explicitAggregateId =
    normalizeStrategicWorkItemId(readString(input.event.aggregateId)) ??
    readString(input.event.aggregateId);
  if (
    explicitAggregateId &&
    input.activeRequirementAggregates.some((aggregate) => aggregate.id === explicitAggregateId)
  ) {
    return explicitAggregateId;
  }

  const workItemId =
    normalizeStrategicWorkItemId(readString(input.event.payload.workItemId)) ??
    readString(input.event.payload.workItemId);
  if (workItemId) {
    const matched =
      input.activeRequirementAggregates.find((aggregate) => aggregate.workItemId === workItemId) ??
      input.activeRequirementAggregates.find((aggregate) => aggregate.id === workItemId) ??
      null;
    if (matched) {
      return matched.id;
    }
  }

  const roomId = readString(input.event.payload.roomId);
  if (roomId) {
    const matched =
      input.activeRequirementAggregates.find((aggregate) => aggregate.roomId === roomId) ??
      null;
    if (matched) {
      return matched.id;
    }
  }

  const topicKey = normalizeRequirementTopicKey(readString(input.event.payload.topicKey));
  if (topicKey) {
    const matched =
      input.activeRequirementAggregates.find((aggregate) => aggregate.topicKey === topicKey) ??
      null;
    if (matched) {
      return matched.id;
    }
  }

  const sessionKey = readString(input.event.sessionKey);
  if (sessionKey) {
    const matchedByConversation =
      input.activeRequirementAggregates.find((aggregate) => aggregate.sourceConversationId === sessionKey) ??
      input.activeRequirementAggregates.find((aggregate) =>
        input.activeRoomRecords.some(
          (room) => room.id === aggregate.roomId && room.sessionKey === sessionKey,
        ),
      ) ??
      null;
    if (matchedByConversation) {
      return matchedByConversation.id;
    }
  }

  const actorId = readString(input.event.actorId);
  if (actorId && input.primaryRequirementId) {
    const primary =
      input.activeRequirementAggregates.find((aggregate) => aggregate.id === input.primaryRequirementId) ??
      null;
    if (
      primary &&
      (primary.ownerActorId === actorId || primary.memberIds.includes(actorId))
    ) {
      return primary.id;
    }
  }

  return null;
}

export function applyRequirementEvidenceToAggregates(input: {
  company: Company;
  activeConversationStates: ConversationStateRecord[];
  activeRequirementAggregates: RequirementAggregateRecord[];
  activeRoomRecords: RequirementRoomRecord[];
  activeWorkItems: WorkItemRecord[];
  primaryRequirementId: string | null;
  event: RequirementEvidenceEvent;
}): {
  activeRequirementAggregates: RequirementAggregateRecord[];
  primaryRequirementId: string | null;
  applied: boolean;
  aggregateId: string | null;
} {
  let targetAggregateId = resolveRequirementAggregateIdForEvidence({
    activeRequirementAggregates: input.activeRequirementAggregates,
    activeRoomRecords: input.activeRoomRecords,
    primaryRequirementId: input.primaryRequirementId,
    event: input.event,
  });
  let baseAggregates = input.activeRequirementAggregates;
  let nextPrimaryRequirementId = input.primaryRequirementId;
  if (!targetAggregateId) {
    const workItemId = readString(input.event.payload.workItemId);
    const topicKey = readString(input.event.payload.topicKey);
    const sessionKey = readString(input.event.sessionKey);
    const workItem =
      (workItemId
        ? input.activeWorkItems.find((item) => item.id === workItemId || item.workKey === workItemId) ?? null
        : null) ??
      (topicKey
        ? input.activeWorkItems.find((item) => item.topicKey === topicKey && item.status !== "archived") ?? null
        : null);
    const existing =
      (sessionKey
        ? input.activeRequirementAggregates.find((aggregate) => aggregate.sourceConversationId === sessionKey) ?? null
        : null) ??
      null;
    const room =
      (workItem ? findMatchingRoom(workItem, input.activeRoomRecords) : null) ??
      (existing ? findMatchingRoomForAggregate(existing, input.activeRoomRecords) : null) ??
      (topicKey
        ? input.activeRoomRecords.find((record) => record.topicKey === topicKey) ?? null
        : null);
    const draftConversationState =
      (sessionKey
        ? input.activeConversationStates.find((state) => state.conversationId === sessionKey) ?? null
        : null) ??
      (workItem
        ? input.activeConversationStates.find(
            (state) =>
              state.currentWorkItemId === workItem.id ||
              state.currentWorkKey === workItem.workKey,
          ) ?? null
        : null) ??
      (topicKey
        ? input.activeConversationStates.find((state) => state.draftRequirement?.topicKey === topicKey) ?? null
        : null);
    const bootstrapId =
      readString(input.event.aggregateId) ??
      readString(workItem?.id) ??
      readString(draftConversationState?.currentWorkItemId) ??
      readString(draftConversationState?.currentWorkKey) ??
      (topicKey ? `topic:${topicKey}` : null) ??
      sessionKey;
    const bootstrapAggregate = materializeAggregateRecord({
      companyId: input.company.id,
      existing,
      workItem,
      room,
      evidence: [input.event],
      draftRequirement: draftConversationState?.draftRequirement ?? null,
      draftConversationId: draftConversationState?.conversationId ?? sessionKey,
      fallbackId: bootstrapId,
    });
    if (!bootstrapAggregate) {
      return {
        activeRequirementAggregates: input.activeRequirementAggregates,
        primaryRequirementId: input.primaryRequirementId,
        applied: false,
        aggregateId: null,
      };
    }
    baseAggregates = [...input.activeRequirementAggregates, bootstrapAggregate];
    nextPrimaryRequirementId = pickPrimaryAggregateId({
      aggregates: baseAggregates,
      currentPrimaryRequirementId: input.primaryRequirementId,
      conversationStates: input.activeConversationStates,
    });
    targetAggregateId = bootstrapAggregate.id;
  }

  const nextAggregates = baseAggregates.map((aggregate) => {
    if (aggregate.id !== targetAggregateId) {
      return aggregate;
    }
    const nextOwnerActorId =
      readString(input.event.payload.ownerActorId) ??
      readString(input.event.actorId) ??
      aggregate.ownerActorId;
    const nextOwnerLabel =
      nextOwnerActorId
        ? resolveEmployee(input.company, nextOwnerActorId)?.nickname ?? aggregate.ownerLabel
        : aggregate.ownerLabel;
    const nextStatus = readString(input.event.payload.status);
    const lifecycleStatus: RequirementLifecycleState | null =
      nextStatus === "draft" ||
      nextStatus === "active" ||
      nextStatus === "waiting_peer" ||
      nextStatus === "waiting_owner" ||
      nextStatus === "waiting_review" ||
      nextStatus === "blocked" ||
      nextStatus === "completed" ||
      nextStatus === "archived"
        ? nextStatus
        : null;
    const nextRecord: RequirementAggregateRecord = {
      ...aggregate,
      ownerActorId: nextOwnerActorId,
      ownerLabel: nextOwnerLabel,
      roomId: readString(input.event.payload.roomId) ?? aggregate.roomId,
      topicKey: readString(input.event.payload.topicKey) ?? aggregate.topicKey,
      stage:
        readString(input.event.payload.stage) ??
        readString(input.event.payload.stageLabel) ??
        aggregate.stage,
      summary:
        readString(input.event.payload.summary) ??
        readString(input.event.payload.messageText) ??
        aggregate.summary,
      nextAction: readString(input.event.payload.nextAction) ?? aggregate.nextAction,
      memberIds: sortIds(
        uniqueIds([
          ...aggregate.memberIds,
          nextOwnerActorId,
          ...readStringArray(input.event.payload.memberIds),
        ]),
      ),
      sourceConversationId: readString(input.event.sessionKey) ?? aggregate.sourceConversationId,
      updatedAt: Math.max(aggregate.updatedAt, input.event.timestamp),
      lastEvidenceAt: Math.max(aggregate.lastEvidenceAt ?? 0, input.event.timestamp),
      status: lifecycleStatus ?? aggregate.status,
      revision: aggregate.revision + 1,
    };
    return nextRecord;
  });

  return {
    activeRequirementAggregates: sanitizeRequirementAggregateRecords(
      nextAggregates,
      nextPrimaryRequirementId,
    ),
    primaryRequirementId: nextPrimaryRequirementId,
    applied: true,
    aggregateId: targetAggregateId,
  };
}
