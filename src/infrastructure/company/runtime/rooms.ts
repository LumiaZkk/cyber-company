import { persistRequirementRoomRecords, sanitizeRequirementRoomRecords } from "../persistence/room-persistence";
import { persistRoomConversationBindings } from "../persistence/room-binding-persistence";
import type {
  CompanyRuntimeState,
  RequirementRoomMessage,
  RequirementRoomRecord,
  RuntimeGet,
  RuntimeSet,
  RoomConversationBindingRecord,
} from "./types";
import {
  buildRoomRecordIdFromWorkItem,
  normalizeProductWorkItemIdentity,
} from "../../../application/mission/work-item";
import { areWorkItemRecordCollectionsEquivalent } from "../../../application/mission/work-item-equivalence";
import {
  areRequirementRoomRecordsEquivalent,
  sortRequirementRoomMemberIds,
} from "../../../application/delegation/room-routing";
import { isArtifactRequirementTopic } from "../../../application/mission/requirement-kind";
import {
  persistActiveWorkItems,
  reconcileStoredWorkItems,
} from "./work-items";
import {
  persistActiveRequirementAggregates,
  reconcileActiveRequirementState,
} from "./requirements";

const ROOM_MESSAGE_LIMIT = 120;

export function mergeRoomTranscript(
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

export function mergeRoomMemberIds(
  existing: Array<string | null | undefined>,
  incoming: Array<string | null | undefined>,
): string[] {
  return sortRequirementRoomMemberIds([...existing, ...incoming]);
}

export function persistActiveRooms(companyId: string | null | undefined, rooms: RequirementRoomRecord[]) {
  persistRequirementRoomRecords(companyId, rooms);
}

export function normalizeRoomRecordForState(
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
    scope: room.scope ?? "company",
    ownerActorId: room.ownerActorId ?? room.ownerAgentId ?? null,
    batonActorId: room.batonActorId ?? null,
    memberIds: mergeRoomMemberIds(room.memberIds, []),
    memberActorIds: mergeRoomMemberIds(room.memberActorIds ?? room.memberIds, room.memberIds),
    headline: room.headline ?? room.title,
  };
}

export function persistActiveRoomBindings(
  companyId: string | null | undefined,
  bindings: RoomConversationBindingRecord[],
) {
  persistRoomConversationBindings(companyId, bindings);
}

export function areRequirementRoomRecordCollectionsEquivalent(
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

export function buildRoomActions(
  set: RuntimeSet,
  get: RuntimeGet,
): Pick<
  CompanyRuntimeState,
  "upsertRoomRecord" | "appendRoomMessages" | "upsertRoomConversationBindings" | "deleteRoomRecord"
> {
  return {
    upsertRoomRecord: (room) => {
      const {
        activeCompany,
        activeConversationStates,
        activeRequirementAggregates,
        activeRequirementEvidence,
        activeRoomRecords,
        activeWorkItems,
        activeArtifacts,
        activeDispatches,
        primaryRequirementId,
      } = get();
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
          scope: normalizedRoom.scope ?? existing.scope ?? "company",
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
          scope: normalizedRoom.scope ?? "company",
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
        company: activeCompany,
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
      const reconciledRequirements = reconcileActiveRequirementState({
        companyId: activeCompany.id,
        activeRequirementAggregates,
        primaryRequirementId,
        activeConversationStates,
        activeWorkItems: reconciledWorkItems,
        activeRoomRecords: sorted,
        activeRequirementEvidence,
      });
      set({
        activeRoomRecords: sorted,
        activeWorkItems: reconciledWorkItems,
        activeRequirementAggregates: reconciledRequirements.activeRequirementAggregates,
        primaryRequirementId: reconciledRequirements.primaryRequirementId,
      });
      persistActiveRooms(activeCompany.id, sorted);
      persistActiveWorkItems(activeCompany.id, reconciledWorkItems);
      persistActiveRequirementAggregates(activeCompany.id, reconciledRequirements.activeRequirementAggregates);
    },

    appendRoomMessages: (roomId, messages, meta) => {
      const {
        activeCompany,
        activeConversationStates,
        activeRequirementAggregates,
        activeRequirementEvidence,
        activeRoomRecords,
        activeWorkItems,
        activeArtifacts,
        activeDispatches,
        primaryRequirementId,
      } = get();
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
          scope: meta?.scope ?? "company",
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
          scope: draftRoom.scope ?? existing.scope ?? "company",
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
        company: activeCompany,
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
      const reconciledRequirements = reconcileActiveRequirementState({
        companyId: activeCompany.id,
        activeRequirementAggregates,
        primaryRequirementId,
        activeConversationStates,
        activeWorkItems: reconciledWorkItems,
        activeRoomRecords: sorted,
        activeRequirementEvidence,
      });
      set({
        activeRoomRecords: sorted,
        activeWorkItems: reconciledWorkItems,
        activeRequirementAggregates: reconciledRequirements.activeRequirementAggregates,
        primaryRequirementId: reconciledRequirements.primaryRequirementId,
      });
      persistActiveRooms(activeCompany.id, sorted);
      persistActiveWorkItems(activeCompany.id, reconciledWorkItems);
      persistActiveRequirementAggregates(activeCompany.id, reconciledRequirements.activeRequirementAggregates);
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

    deleteRoomRecord: (roomId) => {
      const {
        activeCompany,
        activeConversationStates,
        activeRequirementAggregates,
        activeRequirementEvidence,
        activeRoomRecords,
        activeRoomBindings,
        activeWorkItems,
        primaryRequirementId,
      } = get();
      if (!activeCompany) {
        return;
      }

      const next = activeRoomRecords.filter((room) => room.id !== roomId);
      const nextBindings = activeRoomBindings.filter((binding) => binding.roomId !== roomId);
      const reconciledRequirements = reconcileActiveRequirementState({
        companyId: activeCompany.id,
        activeRequirementAggregates,
        primaryRequirementId,
        activeConversationStates,
        activeWorkItems,
        activeRoomRecords: next,
        activeRequirementEvidence,
      });
      set({
        activeRoomRecords: next,
        activeRoomBindings: nextBindings,
        activeRequirementAggregates: reconciledRequirements.activeRequirementAggregates,
        primaryRequirementId: reconciledRequirements.primaryRequirementId,
      });
      persistActiveRooms(activeCompany.id, next);
      persistActiveRoomBindings(activeCompany.id, nextBindings);
      persistActiveRequirementAggregates(activeCompany.id, reconciledRequirements.activeRequirementAggregates);
    },
  };
}
