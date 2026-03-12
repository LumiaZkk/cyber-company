import {
  buildRequirementRoomRecord,
  createIncomingRequirementRoomMessage,
  createOutgoingRequirementRoomMessage,
  mergeRequirementRoomTranscript,
} from "../delegation/room-routing";
import type { ChatMessage } from "../gateway";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import type { DispatchRecord, RequirementRoomRecord, RequestRecord } from "../../domain/delegation/types";
import type { RequirementAggregateRecord, RequirementEvidenceEvent, WorkItemRecord } from "../../domain/mission/types";
import type { Company, EmployeeRef } from "../../domain/org/types";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function dedupeIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => readString(value)).filter((value): value is string => Boolean(value)))];
}

function matchRequirement(input: {
  dispatch?: DispatchRecord | null;
  request?: RequestRecord | null;
  event?: RequirementEvidenceEvent | null;
  aggregate: RequirementAggregateRecord;
  room: RequirementRoomRecord;
  workItem: WorkItemRecord | null;
}): boolean {
  const workItemId = input.workItem?.id ?? input.aggregate.workItemId;
  const roomId = input.room.id;
  const topicKey = input.workItem?.topicKey ?? input.aggregate.topicKey;

  if (input.dispatch) {
    return Boolean(
      (workItemId && input.dispatch.workItemId === workItemId) ||
        input.dispatch.roomId === roomId ||
        (topicKey && input.dispatch.topicKey === topicKey),
    );
  }

  if (input.request) {
    return Boolean(
      (workItemId && input.request.taskId === workItemId) ||
        (topicKey && input.request.topicKey === topicKey),
    );
  }

  if (input.event) {
    const payload = input.event.payload ?? {};
    return Boolean(
      input.event.aggregateId === input.aggregate.id ||
        (workItemId && readString(payload.workItemId) === workItemId) ||
        readString(payload.roomId) === roomId ||
        (topicKey && readString(payload.topicKey) === topicKey) ||
        input.event.sessionKey === input.aggregate.sourceConversationId,
    );
  }

  return false;
}

function resolveEmployeeLabel(
  employees: EmployeeRef[],
  actorId: string | null | undefined,
  fallback: string,
): string {
  const matched = actorId
    ? employees.find((employee) => employee.agentId === actorId) ?? null
    : null;
  return matched?.nickname ?? fallback;
}

function buildDispatchText(dispatch: DispatchRecord): string {
  const title = readString(dispatch.title);
  const summary = readString(dispatch.summary);
  if (title && summary) {
    return title === summary ? title : `${title}\n${summary}`;
  }
  return summary ?? title ?? "已派发协作请求。";
}

function buildRequestText(request: RequestRecord): string | null {
  return (
    readString(request.responseDetails) ??
    readString(request.responseSummary) ??
    readString(request.summary) ??
    readString(request.title)
  );
}

function createSyntheticIncomingMessage(input: {
  company: Company;
  actorId: string;
  sessionKey: string;
  roomId: string;
  ownerAgentId: string | null;
  text: string;
  timestamp: number;
}): ReturnType<typeof createIncomingRequirementRoomMessage> {
  return createIncomingRequirementRoomMessage({
    company: input.company,
    agentId: input.actorId,
    roomId: input.roomId,
    ownerAgentId: input.ownerAgentId,
    sessionKey: input.sessionKey,
    message: {
      role: "assistant",
      text: input.text,
      content: [{ type: "text", text: input.text }],
      timestamp: input.timestamp,
    } satisfies ChatMessage,
  });
}

export function backfillRequirementRoomRecord(input: {
  company: Company;
  aggregate: RequirementAggregateRecord;
  workItem: WorkItemRecord | null;
  room: RequirementRoomRecord | null;
  dispatches: DispatchRecord[];
  requests?: RequestRecord[];
  evidence?: RequirementEvidenceEvent[];
  snapshots?: RequirementSessionSnapshot[];
}): RequirementRoomRecord {
  const { company, aggregate, workItem } = input;
  const workItemId = workItem?.id ?? aggregate.workItemId ?? aggregate.id;
  const roomId = input.room?.id ?? aggregate.roomId ?? `workitem:${workItemId}`;
  const scope = input.room?.scope ?? (aggregate.lifecyclePhase === "pre_requirement" ? "decision" : "company");
  const ceoAgentId =
    company.employees.find((employee) => employee.metaRole === "ceo")?.agentId ?? null;
  const shouldPreferCeoOwner = scope === "decision" && !workItem;
  const ownerAgentId =
    (shouldPreferCeoOwner ? ceoAgentId : null) ??
    input.room?.ownerActorId ??
    input.room?.ownerAgentId ??
    aggregate.ownerActorId ??
    workItem?.ownerActorId ??
    null;
  const memberIds = dedupeIds([
    ...(input.room?.memberIds ?? []),
    ...aggregate.memberIds,
    workItem?.ownerActorId,
    workItem?.batonActorId,
    ...((workItem?.steps ?? []).map((step) => step.assigneeActorId ?? null)),
  ]);
  const title =
    readString(input.room?.title) ??
    readString(workItem?.title) ??
    readString(aggregate.summary) ??
    "需求团队房间";
  const sessionKey =
    readString(input.room?.sessionKey) ??
    readString(aggregate.sourceConversationId) ??
    `room:${roomId}`;
  const startedAt = aggregate.startedAt ?? workItem?.startedAt ?? input.room?.createdAt ?? 0;
  const relevantDispatches = input.dispatches
    .filter((dispatch) => dispatch.createdAt >= startedAt)
    .filter((dispatch) =>
      matchRequirement({ dispatch, aggregate, room: input.room ?? { id: roomId } as RequirementRoomRecord, workItem }),
    )
    .sort((left, right) => left.createdAt - right.createdAt);
  const relevantRequests = (input.requests ?? input.company.requests ?? [])
    .filter((request) => request.updatedAt >= startedAt)
    .filter((request) => request.status !== "pending" && request.status !== "superseded")
    .filter((request) =>
      matchRequirement({ request, aggregate, room: input.room ?? { id: roomId } as RequirementRoomRecord, workItem }),
    )
    .sort((left, right) => {
      const leftTs = left.responseMessageTs ?? left.updatedAt;
      const rightTs = right.responseMessageTs ?? right.updatedAt;
      return leftTs - rightTs;
    });
  const relevantEvidence = (input.evidence ?? [])
    .filter((event) => event.timestamp >= startedAt)
    .filter((event) => /^report_(acknowledged|answered|blocked)$/.test(event.eventType))
    .filter((event) =>
      matchRequirement({ event, aggregate, room: input.room ?? { id: roomId } as RequirementRoomRecord, workItem }),
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  const relevantSnapshots = (input.snapshots ?? [])
    .filter((snapshot) => memberIds.includes(snapshot.agentId))
    .flatMap((snapshot) =>
      snapshot.messages
        .filter((message) => message.role === "assistant" && message.timestamp >= startedAt)
        .map((message) =>
          createSyntheticIncomingMessage({
            company,
            actorId: snapshot.agentId,
            sessionKey: snapshot.sessionKey,
            roomId,
            ownerAgentId,
            text: message.text,
            timestamp: message.timestamp,
          }),
        )
        .filter((message): message is NonNullable<typeof message> => Boolean(message)),
    );

  const requestIds = new Set(relevantRequests.map((request) => request.eventId).filter(Boolean));
  const backfilledTranscript = mergeRequirementRoomTranscript([
    ...(input.room?.transcript ?? []),
    ...relevantDispatches.map((dispatch) =>
      createOutgoingRequirementRoomMessage({
        sessionKey,
        roomId,
        authorAgentId: dispatch.fromActorId ?? ownerAgentId ?? undefined,
        audienceAgentIds: dispatch.targetActorIds,
        text: buildDispatchText(dispatch),
        timestamp: dispatch.createdAt,
      }),
    ),
    ...relevantRequests
      .map((request) => {
        const actorId =
          request.toAgentIds.find((candidate) => memberIds.includes(candidate)) ??
          request.toAgentIds[0] ??
          null;
        const text = buildRequestText(request);
        if (!actorId || !text) {
          return null;
        }
        return createSyntheticIncomingMessage({
          company,
          actorId,
          sessionKey: request.consumerSessionKey ?? `agent:${actorId}:main`,
          roomId,
          ownerAgentId,
          text,
          timestamp: request.responseMessageTs ?? request.updatedAt,
        });
      })
      .filter((message): message is NonNullable<typeof message> => Boolean(message)),
    ...relevantEvidence
      .map((event) => {
        if (requestIds.has(event.id)) {
          return null;
        }
        const actorId = readString(event.actorId);
        const text =
          readString(event.payload.details) ??
          readString(event.payload.summary) ??
          readString(event.payload.messageText);
        if (!actorId || !text) {
          return null;
        }
        return createSyntheticIncomingMessage({
          company,
          actorId,
          sessionKey:
            readString(event.payload.consumerSessionKey) ??
            readString(event.sessionKey) ??
            `agent:${actorId}:main`,
          roomId,
          ownerAgentId,
          text,
          timestamp: event.timestamp,
        });
      })
      .filter((message): message is NonNullable<typeof message> => Boolean(message)),
    ...relevantSnapshots,
  ]);

  const updatedAt = backfilledTranscript.reduce(
    (latest, message) => Math.max(latest, message.timestamp),
    Math.max(input.room?.updatedAt ?? 0, aggregate.updatedAt, workItem?.updatedAt ?? 0, Date.now()),
  );

  return buildRequirementRoomRecord({
    companyId: company.id,
    workItemId,
    sessionKey,
    title,
    memberIds,
    ownerAgentId,
    topicKey: workItem?.topicKey ?? aggregate.topicKey,
    scope,
    transcript: backfilledTranscript,
    createdAt: input.room?.createdAt ?? aggregate.startedAt ?? workItem?.startedAt ?? updatedAt,
    updatedAt,
    lastSourceSyncAt: updatedAt,
  });
}

export function buildRequirementRecentReports(input: {
  company: Company;
  scopeRequests: RequestRecord[];
  evidence?: RequirementEvidenceEvent[];
  aggregateId: string | null;
}) {
  const requestReports = input.scopeRequests
    .filter((request) => request.status === "acknowledged" || request.status === "answered" || request.status === "blocked")
    .map((request) => {
      const actorId = request.toAgentIds[0] ?? null;
      return {
        id: request.eventId ?? request.id,
        actorId,
        actorLabel: resolveEmployeeLabel(input.company.employees, actorId, "团队成员"),
        status: request.status,
        text: buildRequestText(request) ?? request.summary,
        timestamp: request.responseMessageTs ?? request.updatedAt,
      };
    });
  const evidenceReports = (input.evidence ?? [])
    .filter((event) => event.aggregateId === input.aggregateId)
    .filter((event) => /^report_(acknowledged|answered|blocked)$/.test(event.eventType))
    .map((event) => {
      const actorId = readString(event.actorId);
      return {
        id: event.id,
        actorId,
        actorLabel: resolveEmployeeLabel(input.company.employees, actorId, event.source),
        status: event.eventType.replace("report_", ""),
        text:
          readString(event.payload.details) ??
          readString(event.payload.summary) ??
          readString(event.payload.messageText) ??
          "成员已回报最新进展。",
        timestamp: event.timestamp,
      };
    });

  return [...new Map([...requestReports, ...evidenceReports].map((report) => [report.id, report] as const)).values()]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 3);
}
