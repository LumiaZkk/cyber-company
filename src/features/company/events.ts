import type {
  Company,
  DispatchRecord,
  HandoffRecord,
  RequestRecord,
} from "./types";

export type CompanyEventKind =
  | "dispatch_sent"
  | "dispatch_blocked"
  | "report_acknowledged"
  | "report_answered"
  | "report_blocked"
  | "subtask_spawned"
  | "subtask_completed"
  | "subtask_blocked";

export type CompanyEvent = {
  eventId: string;
  companyId: string;
  kind: CompanyEventKind;
  dispatchId?: string;
  parentDispatchId?: string;
  workItemId?: string;
  topicKey?: string;
  roomId?: string;
  fromActorId: string;
  targetActorId?: string;
  sessionKey?: string;
  providerRunId?: string;
  createdAt: number;
  payload: Record<string, unknown>;
};

export type CompanyEventsListResult = {
  companyId: string;
  events: CompanyEvent[];
  nextCursor: string | null;
};

export function createCompanyEvent(
  input: Omit<CompanyEvent, "eventId" | "createdAt"> & {
    eventId?: string;
    createdAt?: number;
  },
): CompanyEvent {
  return {
    ...input,
    eventId: input.eventId ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? Date.now(),
  };
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPayloadBoolean(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

function readPayloadStringArray(payload: Record<string, unknown>, key: string): string[] | undefined {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}

function resolveDispatchSessionKey(event: CompanyEvent): string | undefined {
  if (event.sessionKey?.trim()) {
    return event.sessionKey.trim();
  }
  if (event.targetActorId?.trim()) {
    return `agent:${event.targetActorId.trim()}:main`;
  }
  return undefined;
}

function resolveDispatchTitle(event: CompanyEvent, existing?: DispatchRecord): string {
  if (event.kind.startsWith("report_")) {
    return existing?.title ?? readPayloadString(event.payload, "title") ?? "Company dispatch";
  }
  return readPayloadString(event.payload, "title") ?? existing?.title ?? "Company dispatch";
}

function resolveDispatchSummary(event: CompanyEvent, existing?: DispatchRecord): string {
  if (event.kind.startsWith("report_")) {
    return (
      existing?.summary ??
      readPayloadString(event.payload, "message") ??
      readPayloadString(event.payload, "summary") ??
      ""
    );
  }
  return (
    readPayloadString(event.payload, "message") ??
    readPayloadString(event.payload, "summary") ??
    existing?.summary ??
    ""
  );
}

function resolveDispatchOwnerActorId(
  event: CompanyEvent,
  existing?: DispatchRecord,
): DispatchRecord["fromActorId"] {
  if (existing?.fromActorId) {
    return existing.fromActorId;
  }
  if (event.kind.startsWith("report_")) {
    return event.targetActorId?.trim() ?? null;
  }
  return event.fromActorId?.trim() ?? null;
}

function resolveDispatchTargetActorIds(
  event: CompanyEvent,
  existing?: DispatchRecord,
): string[] {
  if (existing?.targetActorIds?.length) {
    return existing.targetActorIds;
  }
  if (event.kind.startsWith("report_")) {
    return event.fromActorId?.trim() ? [event.fromActorId.trim()] : [];
  }
  return event.targetActorId?.trim() ? [event.targetActorId.trim()] : [];
}

function resolveDispatchStatusFromEvent(kind: CompanyEventKind): DispatchRecord["status"] | null {
  if (kind === "dispatch_sent") {
    return "sent";
  }
  if (kind === "dispatch_blocked") {
    return "blocked";
  }
  if (kind === "report_acknowledged") {
    return "acknowledged";
  }
  if (kind === "report_answered") {
    return "answered";
  }
  if (kind === "report_blocked") {
    return "blocked";
  }
  return null;
}

function resolveRequestStatusFromEvent(kind: CompanyEventKind): RequestRecord["status"] | null {
  if (kind === "report_acknowledged") {
    return "acknowledged";
  }
  if (kind === "report_answered") {
    return "answered";
  }
  if (kind === "report_blocked") {
    return "blocked";
  }
  return null;
}

function resolveRequestResolution(event: CompanyEvent): RequestRecord["resolution"] {
  const resolution = readPayloadString(event.payload, "resolution");
  if (
    resolution === "pending" ||
    resolution === "complete" ||
    resolution === "partial" ||
    resolution === "manual_takeover"
  ) {
    return resolution;
  }
  if (event.kind === "report_answered") {
    return "complete";
  }
  if (event.kind === "report_blocked") {
    return "partial";
  }
  return "pending";
}

export function uniqueHandoffList(items: HandoffRecord[]): HandoffRecord[] {
  const byId = new Map<string, HandoffRecord>();
  items.forEach((item) => {
    const current = byId.get(item.id);
    if (!current || item.updatedAt >= current.updatedAt) {
      byId.set(item.id, item);
    }
  });
  return [...byId.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function mergeDispatchRecords(
  existing: DispatchRecord[],
  projected: DispatchRecord[],
): DispatchRecord[] {
  const byId = new Map<string, DispatchRecord>();
  existing.forEach((dispatch) => {
    byId.set(dispatch.id, dispatch);
  });
  projected.forEach((dispatch) => {
    const current = byId.get(dispatch.id);
    if (!current || dispatch.updatedAt >= current.updatedAt) {
      byId.set(dispatch.id, { ...current, ...dispatch });
    }
  });
  return [...byId.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function projectCompanyCommunicationFromEvents(input: {
  company: Company;
  events: CompanyEvent[];
  existingDispatches?: DispatchRecord[];
}): {
  dispatches: DispatchRecord[];
  requests: RequestRecord[];
  handoffs: HandoffRecord[];
  coveredSessionKeys: Set<string>;
} {
  const dispatchById = new Map<string, DispatchRecord>();
  const requestById = new Map<string, RequestRecord>();
  const handoffById = new Map<string, HandoffRecord>();
  const coveredSessionKeys = new Set<string>();
  const existingDispatchById = new Map(
    (input.existingDispatches ?? []).map((dispatch) => [dispatch.id, dispatch] as const),
  );
  const orderedEvents = [...input.events].sort((left, right) => left.createdAt - right.createdAt);

  orderedEvents.forEach((event) => {
    if (event.sessionKey?.trim()) {
      coveredSessionKeys.add(event.sessionKey.trim());
    }
    if (!event.dispatchId) {
      return;
    }

    const existingDispatch =
      dispatchById.get(event.dispatchId) ?? existingDispatchById.get(event.dispatchId);
    const dispatchStatus = resolveDispatchStatusFromEvent(event.kind);
    if (dispatchStatus) {
      const nextDispatch: DispatchRecord = {
        id: event.dispatchId,
        workItemId: event.workItemId ?? existingDispatch?.workItemId ?? "work:unknown",
        roomId: event.roomId ?? existingDispatch?.roomId ?? null,
        title: resolveDispatchTitle(event, existingDispatch),
        summary: resolveDispatchSummary(event, existingDispatch),
        fromActorId: resolveDispatchOwnerActorId(event, existingDispatch),
        targetActorIds: resolveDispatchTargetActorIds(event, existingDispatch),
        status: dispatchStatus,
        sourceMessageId:
          readPayloadString(event.payload, "sourceStepId") ?? existingDispatch?.sourceMessageId,
        responseMessageId:
          event.kind.startsWith("report_") ? event.eventId : existingDispatch?.responseMessageId,
        providerRunId: event.providerRunId ?? existingDispatch?.providerRunId,
        topicKey: event.topicKey ?? existingDispatch?.topicKey,
        syncSource: "event",
        createdAt: existingDispatch?.createdAt ?? event.createdAt,
        updatedAt: Math.max(existingDispatch?.updatedAt ?? 0, event.createdAt),
      };
      dispatchById.set(event.dispatchId, nextDispatch);
      const dispatchSessionKey = resolveDispatchSessionKey(event);
      if (dispatchSessionKey) {
        coveredSessionKeys.add(dispatchSessionKey);
      }

      if (
        event.kind === "dispatch_sent" ||
        event.kind === "dispatch_blocked" ||
        readPayloadBoolean(event.payload, "handoff")
      ) {
        const handoffId = `handoff:${event.dispatchId}`;
        const currentHandoff = handoffById.get(handoffId);
        const nextHandoff: HandoffRecord = {
          id: handoffId,
          sessionKey: dispatchSessionKey ?? currentHandoff?.sessionKey ?? `agent:${event.targetActorId ?? "unknown"}:main`,
          taskId: event.workItemId,
          fromAgentId: event.fromActorId,
          toAgentIds:
            event.targetActorId?.trim() ? [event.targetActorId.trim()] : currentHandoff?.toAgentIds ?? [],
          title: resolveDispatchTitle(event, existingDispatch),
          summary: resolveDispatchSummary(event, existingDispatch),
          status: event.kind === "dispatch_blocked" ? "blocked" : currentHandoff?.status ?? "pending",
          sourceMessageTs: currentHandoff?.sourceMessageTs ?? event.createdAt,
          syncSource: "event",
          createdAt: currentHandoff?.createdAt ?? event.createdAt,
          updatedAt: Math.max(currentHandoff?.updatedAt ?? 0, event.createdAt),
        };
        handoffById.set(handoffId, nextHandoff);
      }
    }

    const requestStatus = resolveRequestStatusFromEvent(event.kind);
    if (requestStatus) {
      const dispatch = dispatchById.get(event.dispatchId) ?? existingDispatchById.get(event.dispatchId);
      const handoffId = `handoff:${event.dispatchId}`;
      const currentRequest = requestById.get(handoffId);
      const sessionKey =
        dispatch?.targetActorIds[0] ? `agent:${dispatch.targetActorIds[0]}:main` : dispatch?.id ?? "unknown";
      const nextRequest: RequestRecord = {
        id: `${handoffId}:request`,
        sessionKey,
        topicKey: event.topicKey ?? dispatch?.topicKey,
        taskId: dispatch?.workItemId,
        handoffId,
        fromAgentId: dispatch?.fromActorId ?? event.fromActorId,
        toAgentIds: dispatch?.targetActorIds ?? [],
        title: dispatch?.title ?? "Company request",
        summary: dispatch?.summary ?? readPayloadString(event.payload, "summary") ?? "",
        status: requestStatus,
        resolution: resolveRequestResolution(event),
        requiredItems: readPayloadStringArray(event.payload, "requiredItems"),
        responseSummary: readPayloadString(event.payload, "summary"),
        sourceMessageTs: dispatch?.createdAt ?? event.createdAt,
        responseMessageTs: event.createdAt,
        syncSource: "event",
        createdAt: currentRequest?.createdAt ?? dispatch?.createdAt ?? event.createdAt,
        updatedAt: Math.max(currentRequest?.updatedAt ?? 0, event.createdAt),
      };
      requestById.set(nextRequest.id, nextRequest);

      const currentHandoff = handoffById.get(handoffId);
      if (currentHandoff) {
        handoffById.set(handoffId, {
          ...currentHandoff,
          status:
            requestStatus === "answered"
              ? "completed"
              : requestStatus === "acknowledged"
                ? "acknowledged"
                : "blocked",
          updatedAt: Math.max(currentHandoff.updatedAt, event.createdAt),
        });
      }
    }
  });

  return {
    dispatches: [...dispatchById.values()].sort((left, right) => right.updatedAt - left.updatedAt),
    requests: [...requestById.values()].sort((left, right) => right.updatedAt - left.updatedAt),
    handoffs: uniqueHandoffList([...handoffById.values()]),
    coveredSessionKeys,
  };
}
