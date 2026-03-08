import type { ConversationMissionRecord, ConversationMissionStepRecord } from "./types";

const MISSION_CACHE_PREFIX = "cyber_company_mission_records:";
const MISSION_LIMIT = 48;

function isMissionStepRecord(value: unknown): value is ConversationMissionStepRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ConversationMissionStepRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.assigneeLabel === "string" &&
    (candidate.status === "done" || candidate.status === "wip" || candidate.status === "pending") &&
    typeof candidate.statusLabel === "string" &&
    typeof candidate.isCurrent === "boolean" &&
    typeof candidate.isNext === "boolean"
  );
}

function isMissionRecord(value: unknown): value is ConversationMissionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ConversationMissionRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.sessionKey === "string" &&
    (typeof candidate.startedAt === "number" || typeof candidate.startedAt === "undefined") &&
    typeof candidate.title === "string" &&
    typeof candidate.statusLabel === "string" &&
    typeof candidate.progressLabel === "string" &&
    typeof candidate.ownerLabel === "string" &&
    typeof candidate.currentStepLabel === "string" &&
    typeof candidate.nextLabel === "string" &&
    typeof candidate.summary === "string" &&
    typeof candidate.guidance === "string" &&
    typeof candidate.completed === "boolean" &&
    typeof candidate.updatedAt === "number" &&
    Array.isArray(candidate.planSteps) &&
    candidate.planSteps.every(isMissionStepRecord)
  );
}

function getMissionCacheKey(companyId: string) {
  return `${MISSION_CACHE_PREFIX}${companyId.trim()}`;
}

export function loadConversationMissionRecords(
  companyId: string | null | undefined,
): ConversationMissionRecord[] {
  if (!companyId) {
    return [];
  }

  const raw = localStorage.getItem(getMissionCacheKey(companyId));
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isMissionRecord).sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
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
  localStorage.setItem(getMissionCacheKey(companyId), JSON.stringify(trimmed));
}
