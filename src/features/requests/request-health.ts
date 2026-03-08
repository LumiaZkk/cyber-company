import type { RequestRecord } from "../company/types";

export function getActiveRequests(requests: RequestRecord[]): RequestRecord[] {
  return requests.filter((request) => {
    if (request.status === "superseded") {
      return false;
    }
    return !(request.status === "answered" && request.resolution === "complete");
  });
}

export function summarizeRequestHealth(requests: RequestRecord[]) {
  const active = getActiveRequests(requests);
  return {
    total: requests.length,
    active: active.length,
    pending: active.filter((request) => request.status === "pending").length,
    acknowledged: active.filter((request) => request.status === "acknowledged").length,
    blocked: active.filter((request) => request.status === "blocked").length,
    answered: requests.filter((request) => request.status === "answered").length,
    superseded: requests.filter((request) => request.status === "superseded").length,
  };
}
