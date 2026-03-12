export type RequirementMetricName =
  | "requirement_center_opened"
  | "requirement_collaboration_opened"
  | "requirement_workspace_opened"
  | "requirement_ops_opened"
  | "requirement_change_requested"
  | "requirement_acceptance_requested"
  | "requirement_accepted"
  | "requirement_reopened";

export type RequirementMetricEvent = {
  id: string;
  companyId: string;
  requirementId: string | null;
  name: RequirementMetricName;
  timestamp: number;
  metadata?: Record<string, string | number | boolean | null>;
};

const MAX_EVENTS = 200;

function buildStorageKey(companyId: string) {
  return `cyber-company:requirement-metrics:${companyId}`;
}

export function loadRequirementMetricEvents(companyId: string | null | undefined): RequirementMetricEvent[] {
  if (!companyId || typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(buildStorageKey(companyId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is RequirementMetricEvent => Boolean(item && typeof item === "object"))
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
        companyId,
        requirementId: typeof item.requirementId === "string" ? item.requirementId : null,
        name: item.name,
        timestamp: typeof item.timestamp === "number" ? item.timestamp : Date.now(),
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : undefined,
      }))
      .filter((item) => typeof item.name === "string")
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, MAX_EVENTS);
  } catch {
    return [];
  }
}

export function trackRequirementMetric(input: {
  companyId: string | null | undefined;
  requirementId: string | null;
  name: RequirementMetricName;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  if (!input.companyId || typeof window === "undefined") {
    return;
  }
  const nextEvent: RequirementMetricEvent = {
    id: crypto.randomUUID(),
    companyId: input.companyId,
    requirementId: input.requirementId,
    name: input.name,
    timestamp: Date.now(),
    metadata: input.metadata,
  };
  const existing = loadRequirementMetricEvents(input.companyId);
  try {
    window.localStorage.setItem(
      buildStorageKey(input.companyId),
      JSON.stringify([nextEvent, ...existing].slice(0, MAX_EVENTS)),
    );
  } catch {
    // Best-effort telemetry only.
  }
}
