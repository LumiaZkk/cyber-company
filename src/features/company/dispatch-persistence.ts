import type { DispatchRecord, DispatchStatus } from "./types";

const DISPATCH_CACHE_PREFIX = "cyber_company_dispatch_records:";
const DISPATCH_LIMIT = 240;

function isDispatchStatus(value: unknown): value is DispatchStatus {
  return (
    value === "pending" ||
    value === "sent" ||
    value === "acknowledged" ||
    value === "answered" ||
    value === "blocked" ||
    value === "superseded"
  );
}

function isDispatchRecord(value: unknown): value is DispatchRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DispatchRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.workItemId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.targetActorIds) &&
    candidate.targetActorIds.every((actorId) => typeof actorId === "string") &&
    isDispatchStatus(candidate.status) &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

function getDispatchCacheKey(companyId: string) {
  return `${DISPATCH_CACHE_PREFIX}${companyId.trim()}`;
}

export function loadDispatchRecords(companyId: string | null | undefined): DispatchRecord[] {
  if (!companyId) {
    return [];
  }

  const raw = localStorage.getItem(getDispatchCacheKey(companyId));
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isDispatchRecord).sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export function persistDispatchRecords(
  companyId: string | null | undefined,
  dispatches: DispatchRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = [...dispatches]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, DISPATCH_LIMIT);
  localStorage.setItem(getDispatchCacheKey(companyId), JSON.stringify(trimmed));
}

export function clearDispatchRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  localStorage.removeItem(getDispatchCacheKey(companyId));
}
