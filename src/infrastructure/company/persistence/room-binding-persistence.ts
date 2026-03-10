import type { RoomConversationBindingRecord } from "./types";

const ROOM_BINDING_LIMIT = 256;
const roomBindingCache = new Map<string, RoomConversationBindingRecord[]>();

export function loadRoomConversationBindings(
  companyId: string | null | undefined,
): RoomConversationBindingRecord[] {
  if (!companyId) {
    return [];
  }
  return roomBindingCache.get(companyId) ?? [];
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
  roomBindingCache.set(companyId, trimmed);
}

export function clearRoomConversationBindings(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  roomBindingCache.delete(companyId);
}
