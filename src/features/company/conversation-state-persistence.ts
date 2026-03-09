import type { ConversationStateRecord } from "./types";

const CONVERSATION_STATE_CACHE_PREFIX = "cyber_company_conversation_state:";
const CONVERSATION_STATE_LIMIT = 128;

function getConversationStateCacheKey(companyId: string) {
  return `${CONVERSATION_STATE_CACHE_PREFIX}${companyId.trim()}`;
}

function isConversationStateRecord(value: unknown): value is ConversationStateRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ConversationStateRecord>;
  return (
    typeof candidate.companyId === "string" &&
    typeof candidate.conversationId === "string" &&
    (typeof candidate.currentWorkKey === "string" || candidate.currentWorkKey == null) &&
    (typeof candidate.currentWorkItemId === "string" || candidate.currentWorkItemId == null) &&
    (typeof candidate.currentRoundId === "string" || candidate.currentRoundId == null) &&
    typeof candidate.updatedAt === "number"
  );
}

function sanitizeConversationStateRecords(
  companyId: string,
  records: ConversationStateRecord[],
): ConversationStateRecord[] {
  const deduped = new Map<string, ConversationStateRecord>();
  for (const record of records) {
    if (!isConversationStateRecord(record)) {
      continue;
    }
    const normalized: ConversationStateRecord = {
      ...record,
      companyId,
      conversationId: record.conversationId.trim(),
      currentWorkKey: record.currentWorkKey?.trim() || null,
      currentWorkItemId: record.currentWorkItemId?.trim() || null,
      currentRoundId: record.currentRoundId?.trim() || null,
    };
    if (!normalized.conversationId) {
      continue;
    }
    const previous = deduped.get(normalized.conversationId);
    if (!previous || normalized.updatedAt >= previous.updatedAt) {
      deduped.set(normalized.conversationId, normalized);
    }
  }
  return [...deduped.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, CONVERSATION_STATE_LIMIT);
}

export function loadConversationStateRecords(
  companyId: string | null | undefined,
): ConversationStateRecord[] {
  if (!companyId) {
    return [];
  }

  const raw = localStorage.getItem(getConversationStateCacheKey(companyId));
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return sanitizeConversationStateRecords(companyId, parsed.filter(isConversationStateRecord));
  } catch {
    return [];
  }
}

export function persistConversationStateRecords(
  companyId: string | null | undefined,
  records: ConversationStateRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = sanitizeConversationStateRecords(companyId, records);
  localStorage.setItem(getConversationStateCacheKey(companyId), JSON.stringify(trimmed));
}

export function clearConversationStateRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  localStorage.removeItem(getConversationStateCacheKey(companyId));
}
