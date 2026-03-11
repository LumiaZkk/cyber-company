import { loadWorkItemRecords, persistWorkItemRecords, sanitizeWorkItemRecords } from "../persistence/work-item-persistence";
import type {
  ArtifactRecord,
  Company,
  CompanyRuntimeState,
  DispatchRecord,
  RequirementRoomRecord,
  RuntimeGet,
  RuntimeSet,
  WorkItemRecord,
} from "./types";
import {
  buildRoomRecordIdFromWorkItem,
  touchWorkItemArtifacts,
  touchWorkItemDispatches,
} from "../../../application/mission/work-item";
import {
  areWorkItemRecordsEquivalent,
} from "../../../application/mission/work-item-equivalence";
import { isArtifactRequirementTopic } from "../../../application/mission/requirement-kind";
import { reconcileWorkItemRecord } from "../../../application/mission/work-item-reconciler";
import { persistActiveRooms } from "./rooms";
import {
  appendRequirementLocalEvidence,
  emitRequirementCompanyEvent,
  persistActiveRequirementAggregates,
  persistActiveRequirementEvidence,
  reconcileActiveRequirementState,
} from "./requirements";

export function persistActiveWorkItems(
  companyId: string | null | undefined,
  workItems: WorkItemRecord[],
) {
  persistWorkItemRecords(companyId, workItems);
}

export function syncArtifactLinks(
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

export function syncDispatchLinks(
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

export function reconcileStoredWorkItems(input: {
  companyId: string;
  company?: Company | null;
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
            company: input.company,
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
        company: input.company,
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

export function loadStoredWorkItems(input: {
  company?: Company | null;
  companyId: string;
  rooms: RequirementRoomRecord[];
  artifacts: ArtifactRecord[];
  dispatches: DispatchRecord[];
}) {
  return reconcileStoredWorkItems({
    company: input.company,
    companyId: input.companyId,
    workItems: sanitizeWorkItemRecords(loadWorkItemRecords(input.companyId)),
    rooms: input.rooms,
    artifacts: input.artifacts,
    dispatches: input.dispatches,
  });
}

export function buildWorkItemActions(
  set: RuntimeSet,
  get: RuntimeGet,
): Pick<CompanyRuntimeState, "upsertWorkItemRecord" | "deleteWorkItemRecord"> {
  return {
    upsertWorkItemRecord: (workItem) => {
      const {
        activeCompany,
        activeConversationStates,
        activeRequirementAggregates,
        activeRequirementEvidence,
        activeWorkItems,
        activeRoomRecords,
        primaryRequirementId,
      } = get();
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
      const reconciledRequirements = reconcileActiveRequirementState({
        companyId: activeCompany.id,
        activeRequirementAggregates,
        primaryRequirementId,
        activeConversationStates,
        activeWorkItems: sorted,
        activeRoomRecords: nextRooms,
        activeRequirementEvidence,
      });
      const previousPrimaryAggregate =
        primaryRequirementId
          ? activeRequirementAggregates.find((aggregate) => aggregate.id === primaryRequirementId) ?? null
          : null;
      const nextPrimaryAggregate =
        reconciledRequirements.primaryRequirementId
          ? reconciledRequirements.activeRequirementAggregates.find(
              (aggregate) => aggregate.id === reconciledRequirements.primaryRequirementId,
            ) ?? null
          : null;
      const nextEvidence =
        nextPrimaryAggregate &&
        reconciledRequirements.primaryRequirementId !== primaryRequirementId
          ? appendRequirementLocalEvidence({
              companyId: activeCompany.id,
              evidence: activeRequirementEvidence,
              eventType: primaryRequirementId ? "requirement_promoted" : "requirement_seeded",
              aggregate: nextPrimaryAggregate,
              previousAggregate: previousPrimaryAggregate,
              actorId: nextPrimaryAggregate.ownerActorId,
              timestamp: normalizedWorkItem.updatedAt,
            })
          : activeRequirementEvidence;
      set({
        activeWorkItems: sorted,
        activeRoomRecords: nextRooms,
        activeRequirementAggregates: reconciledRequirements.activeRequirementAggregates,
        activeRequirementEvidence: nextEvidence,
        primaryRequirementId: reconciledRequirements.primaryRequirementId,
      });
      persistActiveWorkItems(activeCompany.id, sorted);
      persistActiveRooms(activeCompany.id, nextRooms);
      persistActiveRequirementAggregates(activeCompany.id, reconciledRequirements.activeRequirementAggregates);
      if (nextEvidence !== activeRequirementEvidence) {
        persistActiveRequirementEvidence(activeCompany.id, nextEvidence);
      }
      if (
        nextPrimaryAggregate &&
        reconciledRequirements.primaryRequirementId !== primaryRequirementId
      ) {
        emitRequirementCompanyEvent({
          companyId: activeCompany.id,
          kind: primaryRequirementId ? "requirement_promoted" : "requirement_seeded",
          aggregate: nextPrimaryAggregate,
          actorId: nextPrimaryAggregate.ownerActorId,
        });
      }
    },

    deleteWorkItemRecord: (workItemId) => {
      const {
        activeCompany,
        activeConversationStates,
        activeRequirementAggregates,
        activeRequirementEvidence,
        activeRoomRecords,
        activeWorkItems,
        primaryRequirementId,
      } = get();
      if (!activeCompany) {
        return;
      }

      const next = activeWorkItems.filter((item) => item.id !== workItemId);
      const reconciledRequirements = reconcileActiveRequirementState({
        companyId: activeCompany.id,
        activeRequirementAggregates,
        primaryRequirementId,
        activeConversationStates,
        activeWorkItems: next,
        activeRoomRecords,
        activeRequirementEvidence,
      });
      set({
        activeWorkItems: next,
        activeRequirementAggregates: reconciledRequirements.activeRequirementAggregates,
        primaryRequirementId: reconciledRequirements.primaryRequirementId,
      });
      persistActiveWorkItems(activeCompany.id, next);
      persistActiveRequirementAggregates(activeCompany.id, reconciledRequirements.activeRequirementAggregates);
    },
  };
}
