import type { RoomConversationBindingRecord } from "./types";

const ROOM_BINDING_CACHE_PREFIX = "cyber_company_room_bindings:";
const ROOM_BINDING_LIMIT = 256;

function getRoomBindingCacheKey(companyId: string) {
  return `${ROOM_BINDING_CACHE_PREFIX}${companyId.trim()}`;
}

function isRoomConversationBindingRecord(value: unknown): value is RoomConversationBindingRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RoomConversationBindingRecord>;
  return (
    typeof candidate.roomId === "string" &&
    typeof candidate.providerId === "string" &&
    typeof candidate.conversationId === "string" &&
    typeof candidate.updatedAt === "number"
  );
}

export function loadRoomConversationBindings(
  companyId: string | null | undefined,
): RoomConversationBindingRecord[] {
  if (!companyId) {
    return [];
  }

  const raw = localStorage.getItem(getRoomBindingCacheKey(companyId));
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isRoomConversationBindingRecord)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export function persistRoomConversationBindings(
  companyId: string | null | undefined,
  bindings: RoomConversationBindingRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = [...bindings]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, ROOM_BINDING_LIMIT);
  localStorage.setItem(getRoomBindingCacheKey(companyId), JSON.stringify(trimmed));
}

export function clearRoomConversationBindings(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  localStorage.removeItem(getRoomBindingCacheKey(companyId));
}
