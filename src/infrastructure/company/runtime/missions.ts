import { persistConversationMissionRecords } from "../persistence/mission-persistence";
import { sanitizeWorkItemRecords } from "../persistence/work-item-persistence";
import type { CompanyRuntimeState, ConversationMissionRecord, RuntimeGet, RuntimeSet } from "./types";
import { buildWorkItemRecordFromMission } from "../../../application/mission/work-item";
import { isArtifactRequirementTopic } from "../../../application/mission/requirement-kind";
import { reconcileWorkItemRecord } from "../../../application/mission/work-item-reconciler";
import { persistActiveWorkItems } from "./work-items";
import {
  persistActiveRequirementAggregates,
  reconcileActiveRequirementState,
} from "./requirements";

export function persistActiveMissions(
  companyId: string | null | undefined,
  missions: ConversationMissionRecord[],
) {
  persistConversationMissionRecords(companyId, missions);
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

export function isSameMissionRecord(
  left: ConversationMissionRecord,
  right: ConversationMissionRecord,
): boolean {
  return (
    left.id === right.id &&
    left.sessionKey === right.sessionKey &&
    left.topicKey === right.topicKey &&
    left.roomId === right.roomId &&
    left.startedAt === right.startedAt &&
    left.promotionState === right.promotionState &&
    (left.promotionReason ?? null) === (right.promotionReason ?? null) &&
    left.lifecyclePhase === right.lifecyclePhase &&
    left.stageGateStatus === right.stageGateStatus &&
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

export function buildMissionActions(
  set: RuntimeSet,
  get: RuntimeGet,
): Pick<CompanyRuntimeState, "upsertMissionRecord" | "deleteMissionRecord"> {
  return {
    upsertMissionRecord: (mission) => {
      const {
        activeCompany,
        activeConversationStates,
        activeMissionRecords,
        activeRequirementAggregates,
        activeRequirementEvidence,
        activeRoomBindings,
        activeRoomRecords,
        activeWorkItems,
        primaryRequirementId,
      } = get();
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
          company: activeCompany,
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
          const existingLinkedWorkItem = nextWorkItems[workItemIndex];
          if (workItem.updatedAt > existingLinkedWorkItem.updatedAt) {
            nextWorkItems[workItemIndex] = {
              ...existingLinkedWorkItem,
              ...workItem,
              roomId: workItem.roomId ?? existingLinkedWorkItem.roomId,
              artifactIds: workItem.artifactIds.length > 0 ? workItem.artifactIds : existingLinkedWorkItem.artifactIds,
              dispatchIds: workItem.dispatchIds.length > 0 ? workItem.dispatchIds : existingLinkedWorkItem.dispatchIds,
            };
          }
        } else {
          nextWorkItems.push(workItem);
        }
      }

      const sortedWorkItems = sanitizeWorkItemRecords(nextWorkItems);
      const reconciledRequirements = reconcileActiveRequirementState({
        companyId: activeCompany.id,
        activeRequirementAggregates,
        primaryRequirementId,
        activeConversationStates,
        activeWorkItems: sortedWorkItems,
        activeRoomRecords,
        activeRequirementEvidence,
      });
      set({
        activeMissionRecords: sorted,
        activeWorkItems: sortedWorkItems,
        activeRequirementAggregates: reconciledRequirements.activeRequirementAggregates,
        primaryRequirementId: reconciledRequirements.primaryRequirementId,
      });
      persistActiveMissions(activeCompany.id, sorted);
      persistActiveWorkItems(activeCompany.id, sortedWorkItems);
      persistActiveRequirementAggregates(activeCompany.id, reconciledRequirements.activeRequirementAggregates);
    },

    deleteMissionRecord: (missionId) => {
      const { activeCompany, activeMissionRecords } = get();
      if (!activeCompany) {
        return;
      }

      const next = activeMissionRecords.filter((mission) => mission.id !== missionId);
      set({ activeMissionRecords: next });
      persistActiveMissions(activeCompany.id, next);
    },
  };
}
