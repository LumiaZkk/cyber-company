import type { RequirementRoomRecord } from "./types";
import { isArtifactRequirementTopic } from "../../../application/mission/requirement-kind";
import {
  mergeRequirementRoomTranscript,
  sortRequirementRoomMemberIds,
} from "../../../application/delegation/room-routing";
import {
  buildRoomRecordIdFromWorkItem,
  normalizeProductWorkItemIdentity,
} from "../../../application/mission/work-item";

const ROOM_LIMIT = 24;
const roomCache = new Map<string, RequirementRoomRecord[]>();

function mergeNormalizedRequirementRoomRecords(
  rooms: RequirementRoomRecord[],
): RequirementRoomRecord[] {
  const byId = new Map<string, RequirementRoomRecord>();

  for (const room of rooms) {
    const semanticId = buildRequirementRoomSemanticId(room);
    const existing = byId.get(semanticId);
    if (!existing) {
      byId.set(semanticId, room);
      continue;
    }

    byId.set(semanticId, {
      ...existing,
      ...room,
      companyId: room.companyId ?? existing.companyId,
      workItemId: room.workItemId ?? existing.workItemId,
      ownerActorId:
        room.ownerActorId ?? existing.ownerActorId ?? room.ownerAgentId ?? existing.ownerAgentId ?? null,
      memberIds: sortRequirementRoomMemberIds([...existing.memberIds, ...room.memberIds]),
      memberActorIds: sortRequirementRoomMemberIds([
        ...(existing.memberActorIds ?? existing.memberIds),
        ...(room.memberActorIds ?? room.memberIds),
      ]),
      topicKey: room.topicKey ?? existing.topicKey,
      title:
        room.updatedAt >= existing.updatedAt
          ? room.title || existing.title
          : existing.title || room.title,
      transcript: mergeRequirementRoomTranscript([...(existing.transcript ?? []), ...(room.transcript ?? [])]),
      updatedAt: Math.max(existing.updatedAt, room.updatedAt),
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
  const titleLooksExecution =
    /第\s*\d+\s*章|章节|正文|写手|审校|主编|终审|发布|交稿|稿件/i.test(room.title);
  if (topicLooksStrategic && titleLooksExecution) {
    return `title:${normalizedTitle}|members:${memberKey}`;
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
    ...room,
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
