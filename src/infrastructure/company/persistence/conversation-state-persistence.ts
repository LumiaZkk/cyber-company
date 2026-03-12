import type { ConversationStateRecord } from "./types";

const CONVERSATION_STATE_LIMIT = 128;
const conversationStateCache = new Map<string, ConversationStateRecord[]>();

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
    (candidate.draftRequirement == null ||
      (typeof candidate.draftRequirement === "object" &&
        typeof candidate.draftRequirement.topicText === "string" &&
        typeof candidate.draftRequirement.summary === "string" &&
        (typeof candidate.draftRequirement.topicKey === "string" || candidate.draftRequirement.topicKey == null) &&
        (typeof candidate.draftRequirement.ownerActorId === "string" ||
          candidate.draftRequirement.ownerActorId == null) &&
        typeof candidate.draftRequirement.ownerLabel === "string" &&
        typeof candidate.draftRequirement.stage === "string" &&
        typeof candidate.draftRequirement.nextAction === "string" &&
        (candidate.draftRequirement.stageGateStatus == null ||
          typeof candidate.draftRequirement.stageGateStatus === "string") &&
        typeof candidate.draftRequirement.state === "string" &&
        (typeof candidate.draftRequirement.promotionReason === "string" ||
          candidate.draftRequirement.promotionReason == null) &&
        typeof candidate.draftRequirement.promotable === "boolean" &&
        typeof candidate.draftRequirement.updatedAt === "number")) &&
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
      draftRequirement: record.draftRequirement
        ? {
            ...record.draftRequirement,
            topicKey: record.draftRequirement.topicKey?.trim() || null,
            topicText: record.draftRequirement.topicText.trim(),
            summary: record.draftRequirement.summary.trim(),
            ownerActorId: record.draftRequirement.ownerActorId?.trim() || null,
            ownerLabel: record.draftRequirement.ownerLabel.trim(),
            stage: record.draftRequirement.stage.trim(),
            nextAction: record.draftRequirement.nextAction.trim(),
            stageGateStatus:
              typeof record.draftRequirement.stageGateStatus === "string"
                ? record.draftRequirement.stageGateStatus
                : null,
            state: record.draftRequirement.state,
            promotionReason: record.draftRequirement.promotionReason ?? null,
          }
        : null,
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
  return conversationStateCache.get(companyId) ?? [];
}

export function persistConversationStateRecords(
  companyId: string | null | undefined,
  records: ConversationStateRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = sanitizeConversationStateRecords(companyId, records);
  conversationStateCache.set(companyId, trimmed);
}

export function clearConversationStateRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  conversationStateCache.delete(companyId);
}
