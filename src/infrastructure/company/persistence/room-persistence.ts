import type { RequirementRoomRecord } from "./types";
import { isArtifactRequirementTopic } from "../../../application/mission/requirement-kind";
import {
  mergeRequirementRoomTranscript,
  sortRequirementRoomMemberIds,
} from "../../../application/delegation/room-routing";
import {
  buildStableStrategicTopicKey,
  buildRoomRecordIdFromWorkItem,
  normalizeProductWorkItemIdentity,
} from "../../../application/mission/work-item";

const ROOM_LIMIT = 24;
const roomCache = new Map<string, RequirementRoomRecord[]>();

function normalizeRoomRevision(room: RequirementRoomRecord): RequirementRoomRecord {
  return {
    ...room,
    revision:
      Number.isFinite(room.revision ?? null) && (room.revision ?? 0) > 0
        ? Math.floor(room.revision ?? 1)
        : 1,
  };
}

function mergeNormalizedRequirementRoomRecords(
  rooms: RequirementRoomRecord[],
): RequirementRoomRecord[] {
  const byId = new Map<string, RequirementRoomRecord>();

  for (const room of rooms) {
    const normalizedRoom = normalizeRoomRevision(room);
    const semanticId = buildRequirementRoomSemanticId(normalizedRoom);
    const existing = byId.get(semanticId);
    if (!existing) {
      byId.set(semanticId, normalizedRoom);
      continue;
    }

    byId.set(semanticId, {
      ...existing,
      ...normalizedRoom,
      companyId: normalizedRoom.companyId ?? existing.companyId,
      workItemId: normalizedRoom.workItemId ?? existing.workItemId,
      ownerActorId:
        normalizedRoom.ownerActorId ?? existing.ownerActorId ?? normalizedRoom.ownerAgentId ?? existing.ownerAgentId ?? null,
      memberIds: sortRequirementRoomMemberIds([...existing.memberIds, ...normalizedRoom.memberIds]),
      memberActorIds: sortRequirementRoomMemberIds([
        ...(existing.memberActorIds ?? existing.memberIds),
        ...(normalizedRoom.memberActorIds ?? normalizedRoom.memberIds),
      ]),
      topicKey: normalizedRoom.topicKey ?? existing.topicKey,
      title:
        normalizedRoom.updatedAt >= existing.updatedAt
          ? normalizedRoom.title || existing.title
          : existing.title || normalizedRoom.title,
      transcript: mergeRequirementRoomTranscript([...(existing.transcript ?? []), ...(normalizedRoom.transcript ?? [])]),
      updatedAt: Math.max(existing.updatedAt, normalizedRoom.updatedAt),
      revision: Math.max(existing.revision ?? 1, normalizedRoom.revision ?? 1),
    });
  }

  return [...byId.values()];
}

function buildRequirementRoomSemanticId(room: RequirementRoomRecord): string {
  const normalizedIdentity = normalizeProductWorkItemIdentity({
    workItemId: room.workItemId,
    topicKey: room.topicKey,
    title: room.title,
  });
  const normalizedTitle = room.title.trim().toLowerCase();
  const memberKey = sortRequirementRoomMemberIds(room.memberIds ?? []).join(",");
  const topicLooksStrategic = (normalizedIdentity.topicKey ?? "").startsWith("mission:");
  const stableStrategicTopicKey = topicLooksStrategic
    ? buildStableStrategicTopicKey({
        topicKey: normalizedIdentity.topicKey,
        title: room.title,
      })
    : null;
  const titleLooksExecution =
    /第\s*\d+\s*章|章节|正文|写手|审校|主编|终审|发布|交稿|稿件/i.test(room.title);
  if (topicLooksStrategic && titleLooksExecution) {
    return `title:${normalizedTitle}|members:${memberKey}`;
  }
  if (stableStrategicTopicKey) {
    return `work:topic:${stableStrategicTopicKey}`;
  }
  if (normalizedIdentity.workItemId) {
    return `work:${normalizedIdentity.workItemId}`;
  }
  if (normalizedIdentity.workKey) {
    return `work:${normalizedIdentity.workKey}`;
  }
  if (normalizedIdentity.topicKey) {
    return `topic:${normalizedIdentity.topicKey.trim().toLowerCase()}`;
  }
  return `title:${normalizedTitle}|members:${memberKey}`;
}

export function normalizeRequirementRoomRecordForCompany(
  room: RequirementRoomRecord,
  companyId: string,
): RequirementRoomRecord | null {
  const normalizedTopicKey = room.topicKey?.trim() || null;
  if (
    (normalizedTopicKey && isArtifactRequirementTopic(normalizedTopicKey)) ||
    room.workItemId?.startsWith("topic:artifact:")
  ) {
    return null;
  }

  const memberIds = sortRequirementRoomMemberIds(room.memberIds ?? []);
  const memberActorIds =
    room.memberActorIds && room.memberActorIds.length > 0
      ? sortRequirementRoomMemberIds(room.memberActorIds)
      : memberIds;
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
    ...normalizeRoomRevision(room),
    id: normalizedRoomId,
    companyId: room.companyId ?? companyId,
    workItemId: normalizedWorkItemId ?? undefined,
    sessionKey:
      normalizedWorkItemId && room.sessionKey.startsWith("room:")
        ? `room:${normalizedRoomId}`
        : room.sessionKey,
    ownerActorId: room.ownerActorId ?? room.ownerAgentId ?? null,
    memberIds,
    memberActorIds,
    topicKey: normalizedIdentity.topicKey ?? room.topicKey,
    status: room.status ?? "active",
    providerConversationRefs: undefined,
    transcript: mergeRequirementRoomTranscript(room.transcript),
  };
}

export function sanitizeRequirementRoomRecords(
  companyId: string,
  rooms: RequirementRoomRecord[],
): RequirementRoomRecord[] {
  return mergeNormalizedRequirementRoomRecords(
    rooms
      .map((room) => normalizeRequirementRoomRecordForCompany(room, companyId))
      .filter((room): room is RequirementRoomRecord => Boolean(room)),
  ).sort((left, right) => right.updatedAt - left.updatedAt);
}

export function loadRequirementRoomRecords(companyId: string | null | undefined): RequirementRoomRecord[] {
  if (!companyId) {
    return [];
  }
  return roomCache.get(companyId) ?? [];
}

export function persistRequirementRoomRecords(
  companyId: string | null | undefined,
  rooms: RequirementRoomRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = sanitizeRequirementRoomRecords(companyId, [...rooms]).slice(0, ROOM_LIMIT);
  roomCache.set(companyId, trimmed);
}

export function clearRequirementRoomRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  roomCache.delete(companyId);
}
