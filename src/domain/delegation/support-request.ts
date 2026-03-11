import type { SupportRequestRecord, SupportRequestStatus } from "./types";

export function normalizeSupportRequestStatus(
  status: string | null | undefined,
): SupportRequestStatus {
  switch (status) {
    case "acknowledged":
    case "in_progress":
    case "blocked":
    case "fulfilled":
    case "cancelled":
    case "open":
      return status;
    case "pending":
      return "open";
    case "completed":
    case "superseded":
      return "fulfilled";
    default:
      return "open";
  }
}

export function normalizeSupportRequestRecord(
  request: SupportRequestRecord,
): SupportRequestRecord {
  return {
    ...request,
    status: normalizeSupportRequestStatus(request.status),
  };
}

export function isSupportRequestActive(
  request: Pick<SupportRequestRecord, "status">,
): boolean {
  return (
    request.status === "open"
    || request.status === "acknowledged"
    || request.status === "in_progress"
    || request.status === "blocked"
  );
}
