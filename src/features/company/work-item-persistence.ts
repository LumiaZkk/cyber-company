import type { WorkItemRecord, WorkStepRecord, WorkItemStatus } from "./types";

const WORK_ITEM_CACHE_PREFIX = "cyber_company_work_items:";
const WORK_ITEM_LIMIT = 64;

function isWorkStepStatus(value: unknown): value is WorkStepRecord["status"] {
  return (
    value === "pending" ||
    value === "active" ||
    value === "done" ||
    value === "blocked" ||
    value === "skipped"
  );
}

function isWorkItemStatus(value: unknown): value is WorkItemStatus {
  return (
    value === "draft" ||
    value === "active" ||
    value === "waiting_review" ||
    value === "waiting_owner" ||
    value === "completed" ||
    value === "blocked" ||
    value === "archived"
  );
}

function isWorkStepRecord(value: unknown): value is WorkStepRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WorkStepRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.assigneeLabel === "string" &&
    isWorkStepStatus(candidate.status) &&
    typeof candidate.updatedAt === "number"
  );
}

function isWorkItemRecord(value: unknown): value is WorkItemRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WorkItemRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.companyId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.goal === "string" &&
    isWorkItemStatus(candidate.status) &&
    typeof candidate.stageLabel === "string" &&
    typeof candidate.ownerLabel === "string" &&
    typeof candidate.batonLabel === "string" &&
    Array.isArray(candidate.artifactIds) &&
    Array.isArray(candidate.dispatchIds) &&
    Array.isArray(candidate.steps) &&
    candidate.steps.every(isWorkStepRecord) &&
    typeof candidate.startedAt === "number" &&
    typeof candidate.updatedAt === "number" &&
    typeof candidate.summary === "string" &&
    typeof candidate.nextAction === "string"
  );
}

function getWorkItemCacheKey(companyId: string) {
  return `${WORK_ITEM_CACHE_PREFIX}${companyId.trim()}`;
}

export function loadWorkItemRecords(companyId: string | null | undefined): WorkItemRecord[] {
  if (!companyId) {
    return [];
  }

  const raw = localStorage.getItem(getWorkItemCacheKey(companyId));
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isWorkItemRecord).sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export function persistWorkItemRecords(
  companyId: string | null | undefined,
  records: WorkItemRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = [...records]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, WORK_ITEM_LIMIT);
  localStorage.setItem(getWorkItemCacheKey(companyId), JSON.stringify(trimmed));
}

export function clearWorkItemRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  localStorage.removeItem(getWorkItemCacheKey(companyId));
}
