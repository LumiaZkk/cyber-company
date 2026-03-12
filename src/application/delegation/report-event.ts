import { createCompanyEvent, type CompanyEvent, type CompanyEventKind } from "../../domain/delegation/events";
import type { RequestRecord } from "../../domain/delegation/types";

function resolveReportEventKind(status: RequestRecord["status"]): CompanyEventKind | null {
  if (status === "acknowledged") {
    return "report_acknowledged";
  }
  if (status === "answered") {
    return "report_answered";
  }
  if (status === "blocked") {
    return "report_blocked";
  }
  return null;
}

function resolveDispatchIdFromHandoffId(handoffId: string | undefined): string | null {
  if (!handoffId?.startsWith("handoff:dispatch:")) {
    return null;
  }
  const dispatchId = handoffId.slice("handoff:".length).trim();
  return dispatchId.length > 0 ? dispatchId : null;
}

function buildRecoveredReportEventId(input: {
  dispatchId: string;
  status: RequestRecord["status"];
  actorId: string;
  timestamp: number;
}) {
  return `report:${input.dispatchId}:${input.status}:${input.actorId}:${input.timestamp}`;
}

function buildEventPayload(request: RequestRecord, timestamp: number) {
  return Object.fromEntries(
    Object.entries({
      title: request.title,
      summary: request.responseSummary ?? request.summary,
      details: request.responseDetails,
      resolution: request.resolution,
      requiredItems: request.requiredItems,
      transport: request.transport ?? "inferred",
      deliveryState: request.deliveryState ?? "unknown",
      consumerSessionKey: request.consumerSessionKey,
      consumedAt: request.consumedAt ?? timestamp,
      sourceMessageTs: request.sourceMessageTs,
      responseMessageTs: request.responseMessageTs ?? timestamp,
    }).filter(([, value]) => value !== undefined),
  );
}

export function buildRecoveredReportEvents(input: {
  companyId: string;
  existingEvents: CompanyEvent[];
  recoveredRequests: Array<{
    agentId?: string | null;
    sessionKey: string;
    request: RequestRecord;
  }>;
}): CompanyEvent[] {
  const existingEventIds = new Set(input.existingEvents.map((event) => event.eventId));
  const nextEventIds = new Set<string>();

  return input.recoveredRequests.flatMap((entry) => {
    const kind = resolveReportEventKind(entry.request.status);
    const dispatchId = resolveDispatchIdFromHandoffId(entry.request.handoffId);
    const fromActorId = entry.agentId?.trim();
    if (!kind || !dispatchId || !fromActorId) {
      return [];
    }

    const timestamp = entry.request.responseMessageTs ?? entry.request.updatedAt ?? Date.now();
    const eventId = buildRecoveredReportEventId({
      dispatchId,
      status: entry.request.status,
      actorId: fromActorId,
      timestamp,
    });
    if (existingEventIds.has(eventId) || nextEventIds.has(eventId)) {
      return [];
    }
    nextEventIds.add(eventId);

    return [
      createCompanyEvent({
        eventId,
        companyId: input.companyId,
        kind,
        dispatchId,
        workItemId: entry.request.taskId,
        topicKey: entry.request.topicKey,
        fromActorId,
        targetActorId: entry.request.fromAgentId ?? undefined,
        sessionKey: entry.sessionKey,
        createdAt: timestamp,
        payload: buildEventPayload(entry.request, timestamp),
      }),
    ];
  });
}
