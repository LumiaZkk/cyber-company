import type {
  DispatchDeliveryState,
  DispatchRecord,
  HandoffRecord,
  RequestRecord,
} from "./types";
import type { Company } from "../org/types";

export type DelegationEventKind =
  | "dispatch_enqueued"
  | "dispatch_sent"
  | "dispatch_unconfirmed"
  | "dispatch_blocked"
  | "report_acknowledged"
  | "report_answered"
  | "report_blocked"
  | "subtask_spawned"
  | "subtask_completed"
  | "subtask_blocked";

export type WorkflowEventKind =
  | "requirement_seeded"
  | "requirement_promoted"
  | "requirement_progressed"
  | "requirement_change_requested"
  | "requirement_owner_changed"
  | "requirement_room_bound"
  | "requirement_completed"
  | "requirement_acceptance_requested"
  | "requirement_accepted"
  | "requirement_reopened";

export type GovernanceEventKind =
  | "ops_cycle_applied"
  | "operator_action_recorded"
  | "support_request_record_upserted"
  | "support_request_record_deleted"
  | "escalation_record_upserted"
  | "escalation_record_deleted"
  | "decision_record_upserted"
  | "decision_record_deleted"
  | "decision_resolved"
  | "decision_cancelled"
  | "dispatch_record_upserted"
  | "dispatch_record_deleted"
  | "room_record_upserted"
  | "room_record_deleted"
  | "room_bindings_upserted"
  | "artifact_record_upserted"
  | "artifact_record_deleted"
  | "artifact_mirror_synced"
  | "runtime_repaired";

export type CompanyEventKind = DelegationEventKind | WorkflowEventKind | GovernanceEventKind;

export type DelegationEvent = {
  eventId: string;
  companyId: string;
  kind: DelegationEventKind;
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

export type CompanyEvent = Omit<DelegationEvent, "kind"> & {
  kind: CompanyEventKind;
};

export type DelegationEventsListResult = {
  companyId: string;
  events: DelegationEvent[];
  nextCursor: string | null;
};

export type CompanyEventsListResult = DelegationEventsListResult;

export function createDelegationEvent(
  input: Omit<DelegationEvent, "eventId" | "createdAt"> & {
    eventId?: string;
    createdAt?: number;
  },
): DelegationEvent {
  return {
    ...input,
    eventId: input.eventId ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? Date.now(),
  };
}

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

function isDelegationEventKind(kind: CompanyEventKind): kind is DelegationEventKind {
  return (
    kind === "dispatch_enqueued" ||
    kind === "dispatch_sent" ||
    kind === "dispatch_unconfirmed" ||
    kind === "dispatch_blocked" ||
    kind === "report_acknowledged" ||
    kind === "report_answered" ||
    kind === "report_blocked" ||
    kind === "subtask_spawned" ||
    kind === "subtask_completed" ||
    kind === "subtask_blocked"
  );
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

function dispatchMaterialChanged(
  existing: DispatchRecord | undefined,
  next: DispatchRecord,
): boolean {
  if (!existing) {
    return true;
  }
  return (
    existing.workItemId !== next.workItemId ||
    (existing.roomId ?? null) !== (next.roomId ?? null) ||
    existing.title !== next.title ||
    existing.summary !== next.summary ||
    (existing.fromActorId ?? null) !== (next.fromActorId ?? null) ||
    existing.targetActorIds.join("|") !== next.targetActorIds.join("|") ||
    existing.status !== next.status ||
    (existing.deliveryState ?? null) !== (next.deliveryState ?? null) ||
    (existing.sourceMessageId ?? null) !== (next.sourceMessageId ?? null) ||
    (existing.responseMessageId ?? null) !== (next.responseMessageId ?? null) ||
    (existing.providerRunId ?? null) !== (next.providerRunId ?? null) ||
    (existing.topicKey ?? null) !== (next.topicKey ?? null) ||
    (existing.latestEventId ?? null) !== (next.latestEventId ?? null) ||
    (existing.consumedAt ?? null) !== (next.consumedAt ?? null) ||
    (existing.consumerSessionKey ?? null) !== (next.consumerSessionKey ?? null) ||
    (existing.syncSource ?? null) !== (next.syncSource ?? null)
  );
}

function resolveDispatchStatusFromEvent(
  kind: CompanyEventKind,
): DispatchRecord["status"] | null {
  if (!isDelegationEventKind(kind)) {
    return null;
  }
  if (kind === "dispatch_sent") {
    return "sent";
  }
  if (kind === "dispatch_enqueued" || kind === "dispatch_unconfirmed") {
    return "pending";
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

function resolveDispatchDeliveryStateFromEvent(
  kind: CompanyEventKind,
): DispatchDeliveryState | null {
  if (!isDelegationEventKind(kind)) {
    return null;
  }
  if (kind === "dispatch_sent") {
    return "sent";
  }
  if (kind === "dispatch_enqueued") {
    return "pending";
  }
  if (kind === "dispatch_unconfirmed") {
    return "unknown";
  }
  if (kind === "dispatch_blocked") {
    return "failed";
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
  if (!isDelegationEventKind(kind)) {
    return null;
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

function isOpenDispatchStatus(status: DispatchRecord["status"]): boolean {
  return status === "pending" || status === "sent" || status === "acknowledged";
}

function buildLogicalDispatchKey(dispatch: DispatchRecord): string {
  return [
    dispatch.workItemId,
    dispatch.topicKey ?? "",
    dispatch.roomId ?? "",
    dispatch.fromActorId ?? "",
    [...dispatch.targetActorIds].sort().join(","),
    dispatch.title.trim(),
  ].join("|");
}

function supersedeShadowedDispatches(dispatches: DispatchRecord[]): DispatchRecord[] {
  const byLogicalKey = new Map<string, DispatchRecord[]>();
  dispatches.forEach((dispatch) => {
    if (!isOpenDispatchStatus(dispatch.status)) {
      return;
    }
    const key = buildLogicalDispatchKey(dispatch);
    const current = byLogicalKey.get(key);
    if (current) {
      current.push(dispatch);
      return;
    }
    byLogicalKey.set(key, [dispatch]);
  });

  const winnerByLogicalKey = new Map<string, DispatchRecord>();
  byLogicalKey.forEach((group, key) => {
    const winner = [...group].sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      return right.createdAt - left.createdAt;
    })[0];
    winnerByLogicalKey.set(key, winner);
  });

  return [...dispatches]
    .map((dispatch) => {
      if (!isOpenDispatchStatus(dispatch.status)) {
        return dispatch;
      }
      const winner = winnerByLogicalKey.get(buildLogicalDispatchKey(dispatch));
      if (!winner || winner.id === dispatch.id) {
        return dispatch;
      }
      return {
        ...dispatch,
        status: "superseded" as const,
        updatedAt: Math.max(dispatch.updatedAt, winner.updatedAt),
      };
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
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
  return supersedeShadowedDispatches([...byId.values()]);
}

export function projectDelegationFromEvents(input: {
  company: Company;
  events: CompanyEvent[];
  existingDispatches?: DispatchRecord[];
}): {
  dispatches: DispatchRecord[];
  requests: RequestRecord[];
  handoffs: HandoffRecord[];
  coveredSessionKeys: Set<string>;
  responseCoveredSessionKeys: Set<string>;
} {
  const dispatchById = new Map<string, DispatchRecord>();
  const requestById = new Map<string, RequestRecord>();
  const handoffById = new Map<string, HandoffRecord>();
  const coveredSessionKeys = new Set<string>();
  const responseCoveredSessionKeys = new Set<string>();
  const existingDispatchById = new Map(
    (input.existingDispatches ?? []).map((dispatch) => [dispatch.id, dispatch] as const),
  );
  const orderedEvents = [...input.events].sort((left, right) => left.createdAt - right.createdAt);

  orderedEvents.forEach((event) => {
    if (!isDelegationEventKind(event.kind)) {
      return;
    }
    if (event.sessionKey?.trim()) {
      coveredSessionKeys.add(event.sessionKey.trim());
    }
    if (
      (event.kind === "report_acknowledged" ||
        event.kind === "report_answered" ||
        event.kind === "report_blocked") &&
      event.fromActorId?.trim()
    ) {
      responseCoveredSessionKeys.add(`agent:${event.fromActorId.trim()}:main`);
    }
    if (!event.dispatchId) {
      return;
    }

    const existingDispatch =
      dispatchById.get(event.dispatchId) ?? existingDispatchById.get(event.dispatchId);
    const dispatchStatus = resolveDispatchStatusFromEvent(event.kind);
    const dispatchDeliveryState = resolveDispatchDeliveryStateFromEvent(event.kind);
    if (dispatchStatus) {
      const consumerSessionKey =
        event.kind.startsWith("report_")
          ? existingDispatch?.fromActorId?.trim()
            ? `agent:${existingDispatch.fromActorId.trim()}:main`
            : null
          : null;
      const consumedAt =
        event.kind === "report_answered" || event.kind === "report_blocked"
          ? event.createdAt
          : existingDispatch?.consumedAt ?? null;
      const nextDispatch: DispatchRecord = {
        id: event.dispatchId,
        workItemId: event.workItemId ?? existingDispatch?.workItemId ?? "work:unknown",
        revision: 1,
        roomId: event.roomId ?? existingDispatch?.roomId ?? null,
        title: resolveDispatchTitle(event, existingDispatch),
        summary: resolveDispatchSummary(event, existingDispatch),
        fromActorId: resolveDispatchOwnerActorId(event, existingDispatch),
        targetActorIds: resolveDispatchTargetActorIds(event, existingDispatch),
        status: dispatchStatus,
        deliveryState:
          dispatchDeliveryState ??
          existingDispatch?.deliveryState ??
          (dispatchStatus === "pending" ? "pending" : "unknown"),
        sourceMessageId:
          readPayloadString(event.payload, "sourceStepId") ?? existingDispatch?.sourceMessageId,
        responseMessageId:
          event.kind.startsWith("report_") ? event.eventId : existingDispatch?.responseMessageId,
        providerRunId: event.providerRunId ?? existingDispatch?.providerRunId,
        topicKey: event.topicKey ?? existingDispatch?.topicKey,
        latestEventId: event.eventId,
        consumedAt,
        consumerSessionKey:
          consumerSessionKey ?? existingDispatch?.consumerSessionKey ?? null,
        syncSource: "event",
        createdAt: existingDispatch?.createdAt ?? event.createdAt,
        updatedAt: Math.max(existingDispatch?.updatedAt ?? 0, event.createdAt),
      };
      nextDispatch.revision = existingDispatch
        ? dispatchMaterialChanged(existingDispatch, nextDispatch)
          ? Math.max(existingDispatch.revision ?? 1, 1) + 1
          : Math.max(existingDispatch.revision ?? 1, 1)
        : 1;
      dispatchById.set(event.dispatchId, nextDispatch);
      const dispatchSessionKey = resolveDispatchSessionKey(event);
      if (dispatchSessionKey) {
        coveredSessionKeys.add(dispatchSessionKey);
      }

      if (
        event.kind === "dispatch_enqueued" ||
        event.kind === "dispatch_sent" ||
        event.kind === "dispatch_unconfirmed" ||
        event.kind === "dispatch_blocked" ||
        readPayloadBoolean(event.payload, "handoff")
      ) {
        const handoffId = `handoff:${event.dispatchId}`;
        const currentHandoff = handoffById.get(handoffId);
        const nextHandoff: HandoffRecord = {
          id: handoffId,
          sessionKey:
            dispatchSessionKey ??
            currentHandoff?.sessionKey ??
            `agent:${event.targetActorId ?? "unknown"}:main`,
          taskId: event.workItemId,
          fromAgentId: event.fromActorId,
          toAgentIds:
            event.targetActorId?.trim()
              ? [event.targetActorId.trim()]
              : currentHandoff?.toAgentIds ?? [],
          title: resolveDispatchTitle(event, existingDispatch),
          summary: resolveDispatchSummary(event, existingDispatch),
          status:
            event.kind === "dispatch_blocked" ? "blocked" : currentHandoff?.status ?? "pending",
          sourceMessageTs: currentHandoff?.sourceMessageTs ?? event.createdAt,
          syncSource: "event",
          createdAt: currentHandoff?.createdAt ?? event.createdAt,
          updatedAt: Math.max(currentHandoff?.updatedAt ?? 0, event.createdAt),
        };
        handoffById.set(handoffId, nextHandoff);

        const currentRequest = requestById.get(`${handoffId}:request`);
        const nextRequest: RequestRecord = {
          id: `${handoffId}:request`,
          dispatchId: event.dispatchId,
          sessionKey:
            dispatchSessionKey ??
            currentRequest?.sessionKey ??
            `agent:${event.targetActorId ?? "unknown"}:main`,
          topicKey: event.topicKey ?? existingDispatch?.topicKey,
          taskId: event.workItemId ?? existingDispatch?.workItemId,
          handoffId,
          fromAgentId: resolveDispatchOwnerActorId(event, existingDispatch) ?? undefined,
          toAgentIds: resolveDispatchTargetActorIds(event, existingDispatch),
          title: resolveDispatchTitle(event, existingDispatch),
          summary: resolveDispatchSummary(event, existingDispatch),
          status: event.kind === "dispatch_blocked" ? "blocked" : currentRequest?.status ?? "pending",
          deliveryState:
            event.kind === "dispatch_blocked"
              ? "failed"
              : dispatchDeliveryState ?? currentRequest?.deliveryState ?? "pending",
          resolution:
            event.kind === "dispatch_blocked"
              ? "partial"
              : currentRequest?.resolution ?? "pending",
          requiredItems:
            readPayloadStringArray(event.payload, "requiredItems") ?? currentRequest?.requiredItems,
          responseSummary:
            event.kind === "dispatch_blocked"
              ? readPayloadString(event.payload, "error") ?? currentRequest?.responseSummary
              : currentRequest?.responseSummary,
          responseDetails:
            event.kind === "dispatch_blocked"
              ? readPayloadString(event.payload, "error") ?? currentRequest?.responseDetails
              : currentRequest?.responseDetails,
          eventId: event.eventId,
          consumedAt: currentRequest?.consumedAt ?? null,
          consumerSessionKey: currentRequest?.consumerSessionKey ?? null,
          sourceMessageTs: currentRequest?.sourceMessageTs ?? event.createdAt,
          responseMessageTs:
            event.kind === "dispatch_blocked"
              ? event.createdAt
              : currentRequest?.responseMessageTs,
          syncSource: "event",
          transport: "company_report",
          createdAt: currentRequest?.createdAt ?? event.createdAt,
          updatedAt: Math.max(currentRequest?.updatedAt ?? 0, event.createdAt),
        };
        requestById.set(nextRequest.id, nextRequest);
      }
    }

    const requestStatus = resolveRequestStatusFromEvent(event.kind);
    if (requestStatus) {
      const dispatch =
        dispatchById.get(event.dispatchId) ?? existingDispatchById.get(event.dispatchId);
      const handoffId = `handoff:${event.dispatchId}`;
      const requestId = `${handoffId}:request`;
      const currentRequest = requestById.get(requestId);
      const sessionKey =
        dispatch?.targetActorIds[0]
          ? `agent:${dispatch.targetActorIds[0]}:main`
          : dispatch?.id ?? "unknown";
      const nextRequest: RequestRecord = {
        id: `${handoffId}:request`,
        dispatchId: event.dispatchId,
        sessionKey,
        topicKey: event.topicKey ?? dispatch?.topicKey,
        taskId: dispatch?.workItemId,
        handoffId,
        fromAgentId: dispatch?.fromActorId ?? event.fromActorId,
        toAgentIds: dispatch?.targetActorIds ?? [],
        title: dispatch?.title ?? "Company request",
        summary: dispatch?.summary ?? readPayloadString(event.payload, "summary") ?? "",
        status: requestStatus,
        deliveryState:
          resolveDispatchDeliveryStateFromEvent(event.kind) ??
          currentRequest?.deliveryState ??
          dispatch?.deliveryState ??
          "unknown",
        resolution: resolveRequestResolution(event),
        requiredItems: readPayloadStringArray(event.payload, "requiredItems"),
        responseSummary: readPayloadString(event.payload, "summary"),
        responseDetails: readPayloadString(event.payload, "summary"),
        eventId: event.eventId,
        consumedAt:
          event.kind === "report_answered" || event.kind === "report_blocked"
            ? event.createdAt
            : currentRequest?.consumedAt ?? null,
        consumerSessionKey:
          dispatch?.fromActorId?.trim()
            ? `agent:${dispatch.fromActorId.trim()}:main`
            : currentRequest?.consumerSessionKey ?? null,
        sourceMessageTs: dispatch?.createdAt ?? event.createdAt,
        responseMessageTs: event.createdAt,
        syncSource: "event",
        transport: "company_report",
        createdAt: currentRequest?.createdAt ?? dispatch?.createdAt ?? event.createdAt,
        updatedAt: Math.max(currentRequest?.updatedAt ?? 0, event.createdAt),
      };
      requestById.set(requestId, nextRequest);

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
    dispatches: supersedeShadowedDispatches([...dispatchById.values()]),
    requests: [...requestById.values()].sort((left, right) => right.updatedAt - left.updatedAt),
    handoffs: uniqueHandoffList([...handoffById.values()]),
    coveredSessionKeys,
    responseCoveredSessionKeys,
  };
}

export const projectCompanyCommunicationFromEvents = projectDelegationFromEvents;
