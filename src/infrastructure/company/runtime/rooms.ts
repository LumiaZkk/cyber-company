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
import {
  buildRoomConversationBindingKey,
  mergeRoomConversationBindings,
} from "../../../application/delegation/room-records";
import { isArtifactRequirementTopic } from "../../../application/mission/requirement-kind";
import {
  persistActiveWorkItems,
  reconcileStoredWorkItems,
} from "./work-items";
import {
  persistActiveRequirementAggregates,
  reconcileActiveRequirementState,
} from "./requirements";
import { backfillRequirementRoomRecord } from "../../../application/mission/requirement-room-backfill";
import {
  appendAuthorityRoom,
  deleteAuthorityRoom,
  upsertAuthorityRoomBindings,
} from "../../../application/gateway/authority-control";
import {
  applyAuthorityRuntimeCommandError,
  applyAuthorityRuntimeSnapshotToStore,
} from "../../authority/runtime-command";

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

function buildFallbackRoomBindings(input: {
  room: RequirementRoomRecord;
  existingBindings: RoomConversationBindingRecord[];
}): RoomConversationBindingRecord[] {
  const memberActorIds = mergeRoomMemberIds(
    input.room.memberActorIds ?? input.room.memberIds,
    input.room.memberIds,
  );
  if (memberActorIds.length === 0) {
    return [];
  }

  const timestamp = Math.max(input.room.updatedAt, Date.now());
  const existingActorIds = new Set(
    input.existingBindings
      .filter((binding) => binding.roomId === input.room.id)
      .map((binding) => binding.actorId?.trim())
      .filter((actorId): actorId is string => Boolean(actorId)),
  );
  return memberActorIds
    .filter((actorId) => !existingActorIds.has(actorId))
    .map((actorId) => ({
      roomId: input.room.id,
      providerId: "runtime-fallback",
      conversationId: `agent:${actorId}:main`,
      actorId,
      nativeRoom: false,
      updatedAt: timestamp,
    }));
}

function preserveRoomRecordForAuthorityState(
  room: RequirementRoomRecord,
  companyId: string,
): RequirementRoomRecord {
  return {
    ...room,
    companyId: room.companyId ?? companyId,
    ownerActorId: room.ownerActorId ?? room.ownerAgentId ?? null,
    batonActorId: room.batonActorId ?? null,
    scope: room.scope ?? "company",
    memberIds: mergeRoomMemberIds(room.memberIds, []),
    memberActorIds: mergeRoomMemberIds(room.memberActorIds ?? room.memberIds, room.memberIds),
    headline: room.headline ?? room.title,
    status: room.status ?? "active",
    transcript: mergeRoomTranscript([], room.transcript),
  };
}

function mergeAuthorityRoomRecord(
  existing: RequirementRoomRecord | null,
  incoming: RequirementRoomRecord,
  companyId: string,
): RequirementRoomRecord {
  const base = preserveRoomRecordForAuthorityState(incoming, companyId);
  if (!existing) {
    return base;
  }
  return {
    ...existing,
    ...base,
    id: existing.id,
    companyId: base.companyId ?? existing.companyId ?? companyId,
    workItemId: existing.workItemId ?? base.workItemId,
    sessionKey: existing.sessionKey || base.sessionKey,
    title: base.title || existing.title,
    headline: base.headline ?? existing.headline ?? base.title ?? existing.title,
    ownerActorId: base.ownerActorId ?? existing.ownerActorId ?? existing.ownerAgentId ?? null,
    batonActorId: base.batonActorId ?? existing.batonActorId ?? null,
    scope: base.scope ?? existing.scope ?? "company",
    memberIds: mergeRoomMemberIds(existing.memberIds, base.memberIds),
    memberActorIds: mergeRoomMemberIds(
      existing.memberActorIds ?? existing.memberIds,
      base.memberActorIds ?? base.memberIds,
    ),
    status: base.status ?? existing.status ?? "active",
    progress: base.progress ?? existing.progress,
    topicKey: existing.topicKey ?? base.topicKey,
    providerConversationRefs:
      existing.providerConversationRefs ?? base.providerConversationRefs,
    transcript: mergeRoomTranscript(existing.transcript, base.transcript),
    lastConclusionAt: base.lastConclusionAt ?? existing.lastConclusionAt ?? null,
    lastSourceSyncAt: Math.max(existing.lastSourceSyncAt ?? 0, base.lastSourceSyncAt ?? 0) || undefined,
    createdAt: existing.createdAt ?? base.createdAt,
    updatedAt: Math.max(existing.updatedAt, base.updatedAt),
  };
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
  | "upsertRoomRecord"
  | "appendRoomMessages"
  | "ensureRequirementRoomForAggregate"
  | "upsertRoomConversationBindings"
  | "deleteRoomRecord"
> {
  return {
    upsertRoomRecord: (room) => {
      const {
        activeCompany,
        authorityBackedState,
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

      if (authorityBackedState) {
        const preservedRoom = preserveRoomRecordForAuthorityState(room, activeCompany.id);
        const next = [...activeRoomRecords];
        const index = next.findIndex((item) => item.id === preservedRoom.id);
        const nextRoomRecord = mergeAuthorityRoomRecord(
          index >= 0 ? next[index] : null,
          preservedRoom,
          activeCompany.id,
        );
        if (index >= 0) {
          if (areRequirementRoomRecordsEquivalent(next[index], nextRoomRecord)) {
            return;
          }
          next[index] = nextRoomRecord;
        } else {
          next.push(nextRoomRecord);
        }
        const sorted = [...next].sort((left, right) => right.updatedAt - left.updatedAt);
        if (areRequirementRoomRecordCollectionsEquivalent(activeRoomRecords, sorted)) {
          return;
        }
        void appendAuthorityRoom({
          companyId: activeCompany.id,
          room: nextRoomRecord,
        })
          .then((snapshot) => {
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "room.append",
              set,
              get,
            });
          })
          .catch((error) => {
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to upsert room through authority",
            });
          });
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
        authorityBackedState,
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
      if (authorityBackedState) {
        const incomingRoom = preserveRoomRecordForAuthorityState(
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
            providerConversationRefs: meta?.providerConversationRefs,
          },
          activeCompany.id,
        );
        const next = [...activeRoomRecords];
        const index = next.findIndex((room) => room.id === roomId);
        const nextRoomRecord = mergeAuthorityRoomRecord(
          index >= 0 ? next[index] : null,
          {
            ...incomingRoom,
            transcript: mergeRoomTranscript(
              index >= 0 ? next[index]?.transcript ?? [] : [],
              incomingRoom.transcript,
            ),
          },
          activeCompany.id,
        );
        if (index >= 0) {
          if (areRequirementRoomRecordsEquivalent(next[index], nextRoomRecord)) {
            return;
          }
          next[index] = nextRoomRecord;
        } else {
          next.push(nextRoomRecord);
        }
        const sorted = [...next].sort((left, right) => right.updatedAt - left.updatedAt);
        if (areRequirementRoomRecordCollectionsEquivalent(activeRoomRecords, sorted)) {
          return;
        }
        void appendAuthorityRoom({
          companyId: activeCompany.id,
          room: nextRoomRecord,
        })
          .then((snapshot) => {
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "room.append",
              set,
              get,
            });
          })
          .catch((error) => {
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to append room messages through authority",
            });
          });
        return;
      }

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

    ensureRequirementRoomForAggregate: (aggregateId) => {
      const {
        activeCompany,
        activeDispatches,
        activeRequirementAggregates,
        activeRequirementEvidence,
        activeRoomBindings,
        activeRoomRecords,
        activeWorkItems,
      } = get();
      if (!activeCompany) {
        return null;
      }

      const aggregate =
        activeRequirementAggregates.find((record) => record.id === aggregateId) ?? null;
      if (!aggregate) {
        return null;
      }
      const workItem =
        activeWorkItems.find((item) => item.id === aggregate.workItemId) ??
        activeWorkItems.find((item) => item.id === aggregate.id) ??
        (aggregate.topicKey
          ? activeWorkItems.find((item) => item.topicKey === aggregate.topicKey)
          : null) ??
        null;
      const existingRoom =
        activeRoomRecords.find((room) => room.id === aggregate.roomId) ??
        activeRoomRecords.find((room) => room.workItemId === aggregate.workItemId) ??
        (aggregate.topicKey
          ? activeRoomRecords.find((room) => room.topicKey === aggregate.topicKey)
          : null) ??
        null;
      const nextRoom = backfillRequirementRoomRecord({
        company: activeCompany,
        aggregate,
        workItem,
        room: existingRoom,
        dispatches: activeDispatches,
        requests: activeCompany.requests ?? [],
        evidence: activeRequirementEvidence,
      });
      get().upsertRoomRecord(nextRoom);
      const fallbackBindings = buildFallbackRoomBindings({
        room: nextRoom,
        existingBindings: activeRoomBindings,
      });
      if (fallbackBindings.length > 0) {
        get().upsertRoomConversationBindings(fallbackBindings);
      }
      return nextRoom;
    },

    upsertRoomConversationBindings: (bindings) => {
      const { activeCompany, activeRoomBindings, authorityBackedState } = get();
      if (!activeCompany || bindings.length === 0) {
        return;
      }

      const sorted = mergeRoomConversationBindings({
        existing: activeRoomBindings,
        incoming: bindings,
      });
      if (authorityBackedState) {
        const incomingKeys = new Set(bindings.map((binding) => buildRoomConversationBindingKey(binding)));
        const nextBindings = sorted.filter((binding) => incomingKeys.has(buildRoomConversationBindingKey(binding)));
        void upsertAuthorityRoomBindings({
          companyId: activeCompany.id,
          bindings: nextBindings,
        })
          .then((snapshot) =>
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "room-bindings.upsert",
              set,
              get,
            }),
          )
          .catch((error) =>
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to sync authority room bindings",
            }),
          );
        return;
      }
      set({ activeRoomBindings: sorted });
      persistActiveRoomBindings(activeCompany.id, sorted);
    },

    deleteRoomRecord: (roomId) => {
      const {
        activeCompany,
        authorityBackedState,
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
      if (authorityBackedState) {
        void deleteAuthorityRoom({
          companyId: activeCompany.id,
          roomId,
        })
          .then((snapshot) =>
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "room.delete",
              set,
              get,
            }),
          )
          .catch((error) =>
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to delete room through authority",
            }),
          );
        return;
      }
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
