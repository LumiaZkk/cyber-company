import type { DispatchRecord } from "./types";

const DISPATCH_LIMIT = 240;
const dispatchCache = new Map<string, DispatchRecord[]>();

export function normalizeDispatchRecord(record: DispatchRecord): DispatchRecord {
  const revision = record.revision;
  return {
    ...record,
    revision: typeof revision === "number" && Number.isFinite(revision) && revision > 0
      ? Math.floor(revision)
      : 1,
  };
}

export function sanitizeDispatchRecords(dispatches: DispatchRecord[]): DispatchRecord[] {
  const deduped = new Map<string, DispatchRecord>();
  for (const record of dispatches) {
    const normalized = normalizeDispatchRecord(record);
    const previous = deduped.get(normalized.id);
    const normalizedRevision = normalized.revision ?? 1;
    const previousRevision = previous?.revision ?? 1;
    if (
      !previous ||
      normalizedRevision > previousRevision ||
      (normalizedRevision === previousRevision && normalized.updatedAt >= previous.updatedAt)
    ) {
      deduped.set(normalized.id, normalized);
    }
  }
  return [...deduped.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function loadDispatchRecords(companyId: string | null | undefined): DispatchRecord[] {
  if (!companyId) {
    return [];
  }
  return dispatchCache.get(companyId) ?? [];
}

export function persistDispatchRecords(
  companyId: string | null | undefined,
  dispatches: DispatchRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = sanitizeDispatchRecords(dispatches).slice(0, DISPATCH_LIMIT);
  dispatchCache.set(companyId, trimmed);
}

export function clearDispatchRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  dispatchCache.delete(companyId);
}
