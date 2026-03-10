import type { DispatchRecord } from "./types";

const DISPATCH_LIMIT = 240;
const dispatchCache = new Map<string, DispatchRecord[]>();

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

  const trimmed = [...dispatches]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, DISPATCH_LIMIT);
  dispatchCache.set(companyId, trimmed);
}

export function clearDispatchRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  dispatchCache.delete(companyId);
}
