import { buildConversationMissionRecord } from "./conversation-mission";
import {
  resolveRequirementLifecyclePhase,
  resolveRequirementStageGateStatus,
} from "./requirement-lifecycle";
import type { ConversationMissionRecord, ConversationMissionStepRecord, WorkItemRecord } from "../../domain/mission/types";

type ConversationMissionView = {
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

export function resolveConversationMissionUpdatedAt(input: {
  latestMessageTimestamp: number;
  requirementRoomUpdatedAt?: number | null;
  requirementStartedAt?: number | null;
  persistedWorkItemUpdatedAt?: number | null;
  persistedConversationMissionUpdatedAt?: number | null;
}): number {
  if (input.latestMessageTimestamp > 0) {
    return input.latestMessageTimestamp;
  }
  if (input.requirementRoomUpdatedAt) {
    return input.requirementRoomUpdatedAt;
  }
  if (input.requirementStartedAt) {
    return input.requirementStartedAt;
  }
  if (input.persistedWorkItemUpdatedAt) {
    return input.persistedWorkItemUpdatedAt;
  }
  return input.persistedConversationMissionUpdatedAt ?? 0;
}

export function buildChatConversationMissionRecord(input: {
  conversationMission: ConversationMissionView | null;
  sessionKey?: string | null;
  isArchiveView: boolean;
  isFreshConversation: boolean;
  isRequirementBootstrapPending: boolean;
  isGroup: boolean;
  requirementRoomTranscriptCount: number;
  conversationMissionUpdatedAt: number;
  hasStableConversationWorkItem: boolean;
  shouldPreferPersistedConversationMission: boolean;
  persistedWorkItem: WorkItemRecord | null;
  promotionState?: ConversationMissionRecord["promotionState"];
  promotionReason?: ConversationMissionRecord["promotionReason"];
  draftStageGateStatus?: ConversationMissionRecord["stageGateStatus"] | null;
  topicKey?: string | null;
  roomId?: string | null;
  startedAt?: number | null;
  latestMessageTimestamp: number;
  effectiveOwnerAgentId: string | null;
  displayNextBatonAgentId: string | null;
  missionIsCompleted: boolean;
}): ConversationMissionRecord | null {
  if (
    !input.conversationMission ||
    !input.sessionKey ||
    input.isArchiveView ||
    input.isFreshConversation ||
    input.isRequirementBootstrapPending ||
    input.conversationMissionUpdatedAt <= 0 ||
    (input.isGroup && input.requirementRoomTranscriptCount === 0)
  ) {
    return null;
  }

  if ((input.hasStableConversationWorkItem || input.shouldPreferPersistedConversationMission) && input.persistedWorkItem) {
    return null;
  }

  const stageGateStatus = resolveRequirementStageGateStatus({
    explicitStageGateStatus: null,
    draftStageGateStatus: input.draftStageGateStatus,
    promotionState: input.promotionState,
    completed: input.missionIsCompleted,
  });
  const lifecyclePhase = resolveRequirementLifecyclePhase({
    stageGateStatus,
    promotionState: input.promotionState,
    completed: input.missionIsCompleted,
    hasExecutionSignal:
      Boolean(input.persistedWorkItem) ||
      input.requirementRoomTranscriptCount > 0 ||
      input.hasStableConversationWorkItem,
  });

  return buildConversationMissionRecord({
    sessionKey: input.sessionKey,
    topicKey: input.topicKey ?? null,
    roomId: input.roomId ?? null,
    startedAt: input.startedAt ?? input.latestMessageTimestamp,
    promotionState: input.promotionState,
    promotionReason: input.promotionReason ?? null,
    lifecyclePhase,
    stageGateStatus,
    title: input.conversationMission.title,
    statusLabel: input.conversationMission.statusLabel,
    progressLabel: input.conversationMission.progressLabel,
    ownerAgentId: input.effectiveOwnerAgentId,
    ownerLabel: input.conversationMission.ownerLabel,
    currentStepLabel: input.conversationMission.currentStepLabel,
    nextAgentId: input.displayNextBatonAgentId,
    nextLabel: input.conversationMission.nextLabel,
    summary: input.conversationMission.summary,
    guidance: input.conversationMission.guidance,
    completed: input.missionIsCompleted,
    updatedAt: input.conversationMissionUpdatedAt,
    planSteps: input.conversationMission.planSteps,
  });
}
