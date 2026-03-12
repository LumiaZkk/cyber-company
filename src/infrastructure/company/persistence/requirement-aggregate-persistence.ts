import type {
  RequirementAcceptanceStatus,
  RequirementAggregateRecord,
  RequirementLifecyclePhase,
  RequirementLifecycleState,
  RequirementStageGateStatus,
} from "./types";

const REQUIREMENT_AGGREGATE_LIMIT = 64;
const requirementAggregateCache = new Map<string, RequirementAggregateRecord[]>();

function isRequirementLifecycleState(value: unknown): value is RequirementLifecycleState {
  return (
    value === "draft" ||
    value === "active" ||
    value === "waiting_peer" ||
    value === "waiting_owner" ||
    value === "waiting_review" ||
    value === "blocked" ||
    value === "completed" ||
    value === "archived"
  );
}

function isRequirementLifecyclePhase(value: unknown): value is RequirementLifecyclePhase {
  return (
    value === "pre_requirement" ||
    value === "active_requirement" ||
    value === "completed"
  );
}

function isRequirementStageGateStatus(value: unknown): value is RequirementStageGateStatus {
  return value === "none" || value === "waiting_confirmation" || value === "confirmed";
}

function isRequirementAcceptanceStatus(value: unknown): value is RequirementAcceptanceStatus {
  return (
    value === "not_requested" ||
    value === "pending" ||
    value === "accepted" ||
    value === "rejected"
  );
}

function isRequirementAggregateRecord(value: unknown): value is RequirementAggregateRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RequirementAggregateRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.companyId === "string" &&
    (candidate.kind === "strategic" || candidate.kind === "execution") &&
    typeof candidate.primary === "boolean" &&
    Array.isArray(candidate.memberIds) &&
    typeof candidate.ownerLabel === "string" &&
    (candidate.lifecyclePhase == null || isRequirementLifecyclePhase(candidate.lifecyclePhase)) &&
    (candidate.stageGateStatus == null ||
      isRequirementStageGateStatus(candidate.stageGateStatus)) &&
    typeof candidate.stage === "string" &&
    typeof candidate.summary === "string" &&
    typeof candidate.nextAction === "string" &&
    typeof candidate.startedAt === "number" &&
    typeof candidate.updatedAt === "number" &&
    typeof candidate.revision === "number" &&
    isRequirementLifecycleState(candidate.status) &&
    isRequirementAcceptanceStatus(candidate.acceptanceStatus ?? "not_requested")
  );
}

export function sanitizeRequirementAggregateRecords(
  companyId: string,
  records: RequirementAggregateRecord[],
): RequirementAggregateRecord[] {
  const deduped = new Map<string, RequirementAggregateRecord>();
  records.forEach((record) => {
    if (!isRequirementAggregateRecord(record) || record.companyId !== companyId) {
      return;
    }
    const previous = deduped.get(record.id);
    if (!previous || record.updatedAt >= previous.updatedAt) {
      deduped.set(record.id, {
        ...record,
        topicKey: record.topicKey?.trim() || null,
        workItemId: record.workItemId?.trim() || null,
        roomId: record.roomId?.trim() || null,
        ownerActorId: record.ownerActorId?.trim() || null,
        sourceConversationId: record.sourceConversationId?.trim() || null,
        lifecyclePhase: isRequirementLifecyclePhase(record.lifecyclePhase)
          ? record.lifecyclePhase
          : "active_requirement",
        stageGateStatus: isRequirementStageGateStatus(record.stageGateStatus)
          ? record.stageGateStatus
          : "none",
        memberIds: [...new Set(record.memberIds.filter(Boolean))].sort((left, right) =>
          left.localeCompare(right),
        ),
        lastEvidenceAt: typeof record.lastEvidenceAt === "number" ? record.lastEvidenceAt : null,
        acceptanceStatus: isRequirementAcceptanceStatus(record.acceptanceStatus)
          ? record.acceptanceStatus
          : "not_requested",
        acceptanceNote:
          typeof record.acceptanceNote === "string" && record.acceptanceNote.trim().length > 0
            ? record.acceptanceNote.trim()
            : null,
      });
    }
  });

  let primaryAssigned = false;
  return [...deduped.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((record) => {
      if (record.primary && !primaryAssigned) {
        primaryAssigned = true;
        return record;
      }
      if (record.primary) {
        return { ...record, primary: false };
      }
      return record;
    });
}

export function loadRequirementAggregateRecords(
  companyId: string | null | undefined,
): RequirementAggregateRecord[] {
  if (!companyId) {
    return [];
  }
  return requirementAggregateCache.get(companyId) ?? [];
}

export function persistRequirementAggregateRecords(
  companyId: string | null | undefined,
  records: RequirementAggregateRecord[],
) {
  if (!companyId) {
    return;
  }
  const sanitized = sanitizeRequirementAggregateRecords(companyId, records).slice(
    0,
    REQUIREMENT_AGGREGATE_LIMIT,
  );
  requirementAggregateCache.set(companyId, sanitized);
}

export function clearRequirementAggregateRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  requirementAggregateCache.delete(companyId);
}
