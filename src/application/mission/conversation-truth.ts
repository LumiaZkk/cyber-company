import {
  buildRequirementRoomRecord,
  buildRequirementRoomRecordFromSnapshots,
} from "../delegation/room-routing";
import {
  buildChatConversationMissionRecord,
  resolveConversationMissionUpdatedAt,
} from "./chat-mission-record";
import { reconcileWorkItemRecord } from "./work-item-reconciler";
import { buildRoomRecordIdFromWorkItem } from "./work-item";
import type { ArtifactRecord } from "../../domain/artifact/types";
import type { DispatchRecord, RequirementRoomRecord } from "../../domain/delegation/types";
import type {
  ConversationMissionRecord,
  ConversationMissionStepRecord,
  WorkItemRecord,
} from "../../domain/mission/types";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import type { Company } from "../../domain/org/types";
import type {
  RequirementExecutionOverview,
} from "./requirement-overview";

export type ConversationMissionView = {
  title: string;
  statusLabel: string;
  progressLabel: string;
  ownerLabel: string;
  currentStepLabel: string;
  nextLabel: string;
  summary: string;
  guidance: string;
  planSteps: ConversationMissionStepRecord[];
};

type WorkSelection = {
  workKey: string | null;
  workItemId: string | null;
  roundId: string | null;
};

export function buildConversationMissionTruth(input: {
  allowConversationPersistence: boolean;
  isGroup: boolean;
  isCeoSession: boolean;
  sessionKey: string | null;
  isArchiveView: boolean;
  isFreshConversation: boolean;
  isRequirementBootstrapPending: boolean;
  latestMessageTimestamp: number;
  effectiveRequirementRoom: RequirementRoomRecord | null;
  requirementOverview: RequirementExecutionOverview | null;
  persistedWorkItem: WorkItemRecord | null;
  persistedConversationMission: ConversationMissionRecord | null;
  conversationMission: ConversationMissionView | null;
  hasStableConversationWorkItem: boolean;
  shouldPreferPersistedConversationMission: boolean;
  groupTopicKey: string | null | undefined;
  productRoomId: string | null;
  effectiveOwnerAgentId: string | null;
  displayNextBatonAgentId: string | null;
  missionIsCompleted: boolean;
}) {
  const shouldPersistConversationTruth =
    input.isGroup || (input.isCeoSession && input.allowConversationPersistence);
  const conversationMissionUpdatedAt = resolveConversationMissionUpdatedAt({
    latestMessageTimestamp: input.latestMessageTimestamp,
    requirementRoomUpdatedAt: input.effectiveRequirementRoom?.updatedAt,
    requirementStartedAt: input.requirementOverview?.startedAt,
    persistedWorkItemUpdatedAt: input.persistedWorkItem?.updatedAt,
    persistedConversationMissionUpdatedAt: input.persistedConversationMission?.updatedAt,
  });

  const conversationMissionRecord = buildChatConversationMissionRecord({
    conversationMission: input.conversationMission,
    sessionKey: input.sessionKey,
    isArchiveView: input.isArchiveView,
    isFreshConversation: input.isFreshConversation,
    isRequirementBootstrapPending: input.isRequirementBootstrapPending,
    isGroup: input.isGroup,
    requirementRoomTranscriptCount: input.effectiveRequirementRoom?.transcript.length ?? 0,
    conversationMissionUpdatedAt,
    hasStableConversationWorkItem: input.hasStableConversationWorkItem,
    shouldPreferPersistedConversationMission: input.shouldPreferPersistedConversationMission,
    persistedWorkItem: input.persistedWorkItem,
    topicKey: input.requirementOverview?.topicKey ?? input.groupTopicKey ?? null,
    roomId: input.productRoomId,
    startedAt:
      input.requirementOverview?.startedAt ?? input.effectiveRequirementRoom?.createdAt ?? null,
    latestMessageTimestamp: input.latestMessageTimestamp,
    effectiveOwnerAgentId: input.effectiveOwnerAgentId,
    displayNextBatonAgentId: input.displayNextBatonAgentId,
    missionIsCompleted: input.missionIsCompleted,
  });

  return {
    shouldPersistConversationTruth,
    conversationMissionRecord,
    conversationMissionRecordSignature: conversationMissionRecord
      ? JSON.stringify(conversationMissionRecord)
      : null,
  };
}

export function buildConversationWorkItemTruth(input: {
  shouldPersistConversationTruth: boolean;
  activeCompany: Company | null;
  persistedWorkItem: WorkItemRecord | null;
  conversationMissionRecord: ConversationMissionRecord | null;
  requirementOverview: RequirementExecutionOverview | null;
  effectiveRequirementRoom: RequirementRoomRecord | null;
  activeArtifacts: ArtifactRecord[];
  activeDispatches: DispatchRecord[];
  sessionKey: string | null;
  productRoomId: string | null;
}) {
  if (
    !input.shouldPersistConversationTruth ||
    !input.activeCompany ||
    !input.conversationMissionRecord
  ) {
    return null;
  }

  return reconcileWorkItemRecord({
    companyId: input.activeCompany.id,
    company: input.activeCompany,
    existingWorkItem: input.persistedWorkItem,
    mission: input.conversationMissionRecord,
    overview: input.requirementOverview,
    room: input.effectiveRequirementRoom,
    artifacts: input.activeArtifacts,
    dispatches: input.activeDispatches,
    fallbackSessionKey: input.sessionKey,
    fallbackRoomId: input.productRoomId,
  });
}

export function shouldPersistPreviewConversationWorkItem(input: {
  shouldPersistConversationTruth: boolean;
  activeCompany: Company | null;
  previewConversationWorkItem: WorkItemRecord | null;
  shouldPreferPreviewConversationWorkItem: boolean;
}) {
  return Boolean(
    input.shouldPersistConversationTruth &&
      input.activeCompany &&
      input.previewConversationWorkItem &&
      input.shouldPreferPreviewConversationWorkItem,
  );
}

export function buildRequirementTeamRoomTruth(input: {
  activeCompany: Company | null;
  requirementTeam:
    | {
        title: string;
        topicKey: string | null;
        memberIds: string[];
        ownerAgentId: string | null;
      }
    | null;
  isFreshConversation: boolean;
  isRequirementBootstrapPending: boolean;
  persistedWorkItem: WorkItemRecord | null;
  groupWorkItemId: string | null;
  conversationMissionRecord: ConversationMissionRecord | null;
  activeRoomRecords: RequirementRoomRecord[];
  effectiveOwnerAgentId: string | null;
  targetAgentId: string | null;
  effectiveRequirementRoomSnapshots: RequirementSessionSnapshot[];
}) {
  if (
    !input.activeCompany ||
    !input.requirementTeam ||
    input.requirementTeam.memberIds.length < 2 ||
    input.isFreshConversation ||
    input.isRequirementBootstrapPending
  ) {
    return null;
  }

  const workItemId =
    input.persistedWorkItem?.id ??
    input.groupWorkItemId ??
    input.conversationMissionRecord?.id ??
    null;
  if (!workItemId) {
    return null;
  }

  const roomId = buildRoomRecordIdFromWorkItem(workItemId);
  const existingRoom =
    input.activeRoomRecords.find(
      (room) => room.id === roomId || room.workItemId === workItemId,
    ) ?? null;
  const preferredRoomTitle =
    input.persistedWorkItem?.title?.trim() ||
    input.requirementTeam.title?.trim() ||
    existingRoom?.title?.trim() ||
    "需求团队房间";
  const now = Date.now();
  const roomBaseInput = {
    company: input.activeCompany,
    companyId: input.activeCompany.id,
    workItemId,
    sessionKey: existingRoom?.sessionKey ?? `room:${roomId}`,
    title: preferredRoomTitle,
    memberIds: input.requirementTeam.memberIds,
    ownerAgentId:
      existingRoom?.ownerActorId ??
      existingRoom?.ownerAgentId ??
      input.requirementTeam.ownerAgentId ??
      input.persistedWorkItem?.ownerActorId ??
      input.effectiveOwnerAgentId ??
      input.targetAgentId ??
      null,
    topicKey:
      existingRoom?.topicKey ??
      input.persistedWorkItem?.topicKey ??
      input.requirementTeam.topicKey,
    scope:
      existingRoom?.scope ??
      (input.persistedWorkItem?.parentWorkItemId
        ? "support_request"
        : input.persistedWorkItem?.owningDepartmentId
          ? "department"
          : "company"),
    createdAt: existingRoom?.createdAt ?? input.persistedWorkItem?.startedAt ?? now,
    updatedAt: existingRoom?.updatedAt ?? now,
  } as const;

  return input.effectiveRequirementRoomSnapshots.length > 0
    ? buildRequirementRoomRecordFromSnapshots({
        ...roomBaseInput,
        startedAt: input.persistedWorkItem?.startedAt ?? null,
        seedTranscript: existingRoom?.transcript ?? [],
        snapshots: input.effectiveRequirementRoomSnapshots,
      })
    : buildRequirementRoomRecord({
        companyId: roomBaseInput.companyId,
        workItemId: roomBaseInput.workItemId,
        sessionKey: roomBaseInput.sessionKey,
        title: roomBaseInput.title,
        memberIds: roomBaseInput.memberIds,
        ownerAgentId: roomBaseInput.ownerAgentId,
        topicKey: roomBaseInput.topicKey,
        scope: roomBaseInput.scope,
        transcript: existingRoom?.transcript ?? [],
        createdAt: roomBaseInput.createdAt,
        updatedAt: roomBaseInput.updatedAt,
      });
}

export function shouldResetConversationCurrentWork(input: {
  conversationStateKey: string | null;
  ceoReplyExplicitlyRequestsNewTask: boolean;
  isArchiveView: boolean;
}) {
  return Boolean(
    input.conversationStateKey &&
      input.ceoReplyExplicitlyRequestsNewTask &&
      !input.isArchiveView,
  );
}

export function resolveConversationCurrentWorkSelection(input: {
  conversationStateKey: string | null;
  persistedWorkItem: WorkItemRecord | null;
  isArchiveView: boolean;
  isGroup: boolean;
  isCeoSession: boolean;
  previewConversationWorkItem: WorkItemRecord | null;
  doesWorkItemMatchCurrentConversation: (workItem: WorkItemRecord) => boolean;
}): WorkSelection | null {
  if (!input.conversationStateKey || !input.persistedWorkItem || input.isArchiveView) {
    return null;
  }
  if (
    !input.isGroup &&
    input.isCeoSession &&
    !input.doesWorkItemMatchCurrentConversation(input.persistedWorkItem) &&
    input.previewConversationWorkItem
  ) {
    return null;
  }
  return {
    workKey: input.persistedWorkItem.workKey,
    workItemId: input.persistedWorkItem.id,
    roundId: input.persistedWorkItem.roundId,
  };
}
