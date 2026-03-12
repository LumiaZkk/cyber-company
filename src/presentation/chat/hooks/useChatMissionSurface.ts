import { useMemo } from "react";
import {
  buildStrategicDirectParticipantView,
  type StrategicDirectParticipantView,
} from "../../../application/assignment/chat-participants";
import {
  buildRequirementRoomSummary,
  type RequirementRoomSummaryView,
} from "../../../application/delegation/chat-room-summary";
import { buildChatMissionSurface, type ChatMissionSurface, type TaskPlanOverview } from "../../../application/mission/chat-mission-surface";
import { pickConversationMissionRecord } from "../../../application/mission/conversation-mission";
import type { RequirementTeamView } from "../../../application/assignment/requirement-team";
import type { ChatMessage } from "../../../application/gateway";
import type { FocusProgressTone } from "../../../application/governance/chat-progress";
import type { WorkItemPrimaryView } from "../../../application/mission/conversation-work-item-view";
import type {
  RequirementExecutionOverview,
  RequirementParticipantProgress,
} from "../../../application/mission/requirement-overview";
import type { ConversationMissionRecord, WorkItemRecord } from "../../../domain/mission/types";
import type { RequirementRoomRecord } from "../../../domain/delegation/types";
import type { Company } from "../../../domain/org/types";

type RequirementProgressGroups = {
  working: RequirementParticipantProgress[];
  waiting: RequirementParticipantProgress[];
  completed: RequirementParticipantProgress[];
};

type UseChatMissionSurfaceInput = {
  activeCompany: Company | null;
  activeMissionRecords: ConversationMissionRecord[];
  sessionKey: string | null;
  productRoomId: string | null;
  groupTopicKey: string | null;
  effectiveRequirementRoom: RequirementRoomRecord | null;
  roomBoundWorkItem: WorkItemRecord | null;
  persistedWorkItem: WorkItemRecord | null;
  groupTitle: string;
  messages: ChatMessage[];
  requirementRoomTargetAgentIds: string[];
  requirementRoomSessionCount: number;
  targetAgentId: string | null;
  isGroup: boolean;
  isFreshConversation: boolean;
  isRequirementBootstrapPending: boolean;
  isCeoSession: boolean;
  isChapterExecutionRequirement: boolean;
  ceoLabel: string;
  stableDisplayWorkItem: WorkItemRecord | null;
  stableDisplayPrimaryView: WorkItemPrimaryView | null;
  requirementOverview: RequirementExecutionOverview | null;
  requirementProgressGroups: RequirementProgressGroups | null;
  taskPlanOverview: TaskPlanOverview | null;
  shouldAdvanceToNextPhase: boolean;
  shouldDispatchPublish: boolean;
  shouldDirectToTechDispatch: boolean;
  publishDispatchTargetAgentId: string | null;
  publishDispatchTargetLabel: string;
  requirementTeam: RequirementTeamView | null;
  workbenchHeadline: string;
  workbenchOwnerAgentId: string | null;
  workbenchOwnerLabel: string;
  workbenchStage: string;
  workbenchSummary: string;
  workbenchActionHint: string;
  workbenchStatusLabel: string;
  workbenchTone: FocusProgressTone;
  hasStableConversationWorkItem: boolean;
  shouldUsePersistedWorkItemPrimaryView: boolean;
  structuredTaskTitle: string | null;
};

export type ChatMissionSurfaceState = {
  strategicDirectParticipantView: StrategicDirectParticipantView | null;
  persistedConversationMission: ConversationMissionRecord | null;
  requirementRoomSummary: RequirementRoomSummaryView | null;
  missionSurface: ChatMissionSurface;
};

export function useChatMissionSurface(
  input: UseChatMissionSurfaceInput,
): ChatMissionSurfaceState {
  return useMemo(() => {
    const requirementCurrentParticipant =
      input.requirementOverview?.participants.find((participant) => participant.isCurrent) ?? null;
    const strategicDirectParticipantView = buildStrategicDirectParticipantView({
      company: input.activeCompany,
      overview: input.requirementOverview,
      targetAgentId: input.targetAgentId,
      isCeoSession: input.isCeoSession,
    });
    const persistedConversationMission = pickConversationMissionRecord({
      missions: input.activeMissionRecords,
      sessionKey: input.sessionKey,
      roomId: input.productRoomId,
      topicKey: input.requirementOverview?.topicKey ?? input.groupTopicKey ?? null,
      startedAt: input.requirementOverview?.startedAt ?? input.effectiveRequirementRoom?.createdAt ?? null,
    });
    const requirementRoomSummary = input.isGroup
      ? buildRequirementRoomSummary({
          activeCompany: input.activeCompany,
          effectiveRequirementRoom: input.effectiveRequirementRoom,
          roomBoundWorkItem: input.roomBoundWorkItem,
          persistedWorkItem: input.persistedWorkItem,
          groupTitle: input.groupTitle,
          messages: input.messages,
          requirementRoomTargetAgentIds: input.requirementRoomTargetAgentIds,
          requirementRoomSessionCount: input.requirementRoomSessionCount,
          targetAgentId: input.targetAgentId,
        })
      : null;
    const missionSurface = buildChatMissionSurface({
      isGroup: input.isGroup,
      isFreshConversation: input.isFreshConversation,
      isRequirementBootstrapPending: input.isRequirementBootstrapPending,
      isCeoSession: input.isCeoSession,
      isChapterExecutionRequirement: input.isChapterExecutionRequirement,
      groupTitle: input.groupTitle,
      ceoLabel: input.ceoLabel,
      stableDisplayWorkItem: input.stableDisplayWorkItem,
      stableDisplayPrimaryView: input.stableDisplayPrimaryView,
      strategicDirectParticipantView,
      requirementOverview: input.requirementOverview,
      requirementCurrentParticipant,
      requirementProgressWorkingCount: input.requirementProgressGroups?.working.length ?? 0,
      requirementRoomSummary,
      taskPlanOverview: input.taskPlanOverview,
      shouldAdvanceToNextPhase: input.shouldAdvanceToNextPhase,
      shouldDispatchPublish: input.shouldDispatchPublish,
      shouldDirectToTechDispatch: input.shouldDirectToTechDispatch,
      publishDispatchTargetAgentId: input.publishDispatchTargetAgentId,
      publishDispatchTargetLabel: input.publishDispatchTargetLabel,
      requirementTeam: input.requirementTeam,
      workbenchHeadline: input.workbenchHeadline,
      workbenchOwnerAgentId: input.workbenchOwnerAgentId,
      workbenchOwnerLabel: input.workbenchOwnerLabel,
      workbenchStage: input.workbenchStage,
      workbenchSummary: input.workbenchSummary,
      workbenchActionHint: input.workbenchActionHint,
      workbenchStatusLabel: input.workbenchStatusLabel,
      workbenchTone: input.workbenchTone,
      persistedWorkItem: input.persistedWorkItem,
      persistedConversationMission,
      hasStableConversationWorkItem: input.hasStableConversationWorkItem,
      shouldUsePersistedWorkItemPrimaryView: input.shouldUsePersistedWorkItemPrimaryView,
      structuredTaskTitle: input.structuredTaskTitle,
    });

    return {
      strategicDirectParticipantView,
      persistedConversationMission,
      requirementRoomSummary,
      missionSurface,
    };
  }, [
    input.activeCompany,
    input.activeMissionRecords,
    input.ceoLabel,
    input.effectiveRequirementRoom,
    input.groupTitle,
    input.groupTopicKey,
    input.hasStableConversationWorkItem,
    input.isCeoSession,
    input.isChapterExecutionRequirement,
    input.isFreshConversation,
    input.isGroup,
    input.isRequirementBootstrapPending,
    input.messages,
    input.persistedWorkItem,
    input.productRoomId,
    input.publishDispatchTargetAgentId,
    input.publishDispatchTargetLabel,
    input.requirementOverview,
    input.requirementProgressGroups,
    input.requirementRoomSessionCount,
    input.requirementRoomTargetAgentIds,
    input.requirementTeam,
    input.roomBoundWorkItem,
    input.sessionKey,
    input.shouldAdvanceToNextPhase,
    input.shouldDirectToTechDispatch,
    input.shouldDispatchPublish,
    input.shouldUsePersistedWorkItemPrimaryView,
    input.stableDisplayPrimaryView,
    input.stableDisplayWorkItem,
    input.structuredTaskTitle,
    input.targetAgentId,
    input.taskPlanOverview,
    input.workbenchActionHint,
    input.workbenchHeadline,
    input.workbenchOwnerAgentId,
    input.workbenchOwnerLabel,
    input.workbenchStage,
    input.workbenchStatusLabel,
    input.workbenchSummary,
    input.workbenchTone,
  ]);
}
