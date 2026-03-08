import type { RequirementRoomRecord } from "./types";

const ROOM_CACHE_PREFIX = "cyber_company_room_records:";
const ROOM_LIMIT = 24;

function isRequirementRoomMessage(value: unknown): value is RequirementRoomRecord["transcript"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RequirementRoomRecord["transcript"][number]>;
  return (
    typeof candidate.id === "string" &&
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.timestamp === "number"
  );
}

function isRequirementRoomRecord(value: unknown): value is RequirementRoomRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RequirementRoomRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.sessionKey === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.memberIds) &&
    Array.isArray(candidate.transcript) &&
    candidate.transcript.every(isRequirementRoomMessage) &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

function getRoomCacheKey(companyId: string) {
  return `${ROOM_CACHE_PREFIX}${companyId.trim()}`;
}

function normalizeRequirementRoomRecord(
  room: RequirementRoomRecord,
  companyId: string,
): RequirementRoomRecord {
  const memberIds = [...new Set((room.memberIds ?? []).filter(Boolean))];
  const memberActorIds =
    room.memberActorIds && room.memberActorIds.length > 0
      ? [...new Set(room.memberActorIds.filter(Boolean))]
      : memberIds;

  return {
    ...room,
    companyId: room.companyId ?? companyId,
    workItemId: room.workItemId ?? undefined,
    ownerActorId: room.ownerActorId ?? room.ownerAgentId ?? null,
    memberIds,
    memberActorIds,
    status: room.status ?? "active",
    transcript: [...room.transcript].sort((left, right) => left.timestamp - right.timestamp),
  };
}

export function loadRequirementRoomRecords(companyId: string | null | undefined): RequirementRoomRecord[] {
  if (!companyId) {
    return [];
  }

  const raw = localStorage.getItem(getRoomCacheKey(companyId));
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isRequirementRoomRecord)
      .map((room) => normalizeRequirementRoomRecord(room, companyId))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export function persistRequirementRoomRecords(
  companyId: string | null | undefined,
  rooms: RequirementRoomRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = [...rooms]
    .map((room) => normalizeRequirementRoomRecord(room, companyId))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, ROOM_LIMIT);
  localStorage.setItem(getRoomCacheKey(companyId), JSON.stringify(trimmed));
}

export function clearRequirementRoomRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  localStorage.removeItem(getRoomCacheKey(companyId));
}
