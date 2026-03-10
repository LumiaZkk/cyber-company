import type { ConversationMissionRecord } from "./types";

const MISSION_LIMIT = 48;
const missionCache = new Map<string, ConversationMissionRecord[]>();

export function loadConversationMissionRecords(
  companyId: string | null | undefined,
): ConversationMissionRecord[] {
  if (!companyId) {
    return [];
  }
  return missionCache.get(companyId) ?? [];
}

export function persistConversationMissionRecords(
  companyId: string | null | undefined,
  records: ConversationMissionRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = [...records]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MISSION_LIMIT);
  missionCache.set(companyId, trimmed);
}

export function clearConversationMissionRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  missionCache.delete(companyId);
}
