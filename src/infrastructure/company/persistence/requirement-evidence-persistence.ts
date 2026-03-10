import type { RequirementEvidenceEvent } from "./types";

const REQUIREMENT_EVIDENCE_LIMIT = 256;
const requirementEvidenceCache = new Map<string, RequirementEvidenceEvent[]>();

function isRequirementEvidenceEvent(value: unknown): value is RequirementEvidenceEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RequirementEvidenceEvent>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.companyId === "string" &&
    (candidate.aggregateId == null || typeof candidate.aggregateId === "string") &&
    (candidate.source === "gateway-chat" ||
      candidate.source === "company-event" ||
      candidate.source === "local-command" ||
      candidate.source === "backfill") &&
    (candidate.sessionKey == null || typeof candidate.sessionKey === "string") &&
    (candidate.actorId == null || typeof candidate.actorId === "string") &&
    typeof candidate.eventType === "string" &&
    typeof candidate.timestamp === "number" &&
    Boolean(candidate.payload) &&
    typeof candidate.payload === "object" &&
    !Array.isArray(candidate.payload) &&
    typeof candidate.applied === "boolean"
  );
}

export function sanitizeRequirementEvidenceEvents(
  companyId: string,
  events: RequirementEvidenceEvent[],
): RequirementEvidenceEvent[] {
  const byId = new Map<string, RequirementEvidenceEvent>();
  events.forEach((event) => {
    if (!isRequirementEvidenceEvent(event) || event.companyId !== companyId) {
      return;
    }
    const previous = byId.get(event.id);
    if (!previous || event.timestamp >= previous.timestamp) {
      byId.set(event.id, {
        ...event,
        aggregateId: event.aggregateId?.trim() || null,
        sessionKey: event.sessionKey?.trim() || null,
        actorId: event.actorId?.trim() || null,
      });
    }
  });
  return [...byId.values()]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, REQUIREMENT_EVIDENCE_LIMIT);
}

export function loadRequirementEvidenceEvents(
  companyId: string | null | undefined,
): RequirementEvidenceEvent[] {
  if (!companyId) {
    return [];
  }
  return requirementEvidenceCache.get(companyId) ?? [];
}

export function persistRequirementEvidenceEvents(
  companyId: string | null | undefined,
  events: RequirementEvidenceEvent[],
) {
  if (!companyId) {
    return;
  }
  const sanitized = sanitizeRequirementEvidenceEvents(companyId, events);
  requirementEvidenceCache.set(companyId, sanitized);
}

export function clearRequirementEvidenceEvents(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  requirementEvidenceCache.delete(companyId);
}
