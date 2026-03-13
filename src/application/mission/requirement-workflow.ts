import type {
  RequirementAggregateRecord,
  RequirementEvidenceEvent,
} from "../../domain/mission/types";

type RequirementWorkflowChanges = Partial<
  Omit<RequirementAggregateRecord, "id" | "companyId" | "primary" | "revision">
>;

export type RequirementWorkflowEventKind =
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

export function resolveRequirementWorkflowEventKind(input: {
  previousAggregate: RequirementAggregateRecord;
  nextAggregate: RequirementAggregateRecord;
  changes: Partial<
    Omit<RequirementAggregateRecord, "id" | "companyId" | "primary" | "revision">
  >;
}): RequirementWorkflowEventKind {
  const { previousAggregate, nextAggregate, changes } = input;
  if (nextAggregate.acceptanceStatus === "accepted") {
    return "requirement_accepted";
  }
  if (
    /需求变更/.test(
      `${changes.stage ?? nextAggregate.stage} ${changes.acceptanceNote ?? ""} ${changes.nextAction ?? ""}`,
    )
  ) {
    return "requirement_change_requested";
  }
  if (
    nextAggregate.acceptanceStatus === "pending" &&
    previousAggregate.acceptanceStatus !== "pending"
  ) {
    return "requirement_acceptance_requested";
  }
  if (
    nextAggregate.acceptanceStatus === "rejected" ||
    (previousAggregate.acceptanceStatus === "accepted" && nextAggregate.status === "active")
  ) {
    return "requirement_reopened";
  }
  if (nextAggregate.status === "completed" || nextAggregate.status === "archived") {
    return "requirement_completed";
  }
  if (changes.roomId && changes.roomId !== previousAggregate.roomId) {
    return "requirement_room_bound";
  }
  if (changes.ownerActorId && changes.ownerActorId !== previousAggregate.ownerActorId) {
    return "requirement_owner_changed";
  }
  return "requirement_progressed";
}

export function buildRequirementWorkflowEvidencePayload(input: {
  previousAggregate: RequirementAggregateRecord | null;
  nextAggregate: RequirementAggregateRecord;
  source?: RequirementEvidenceEvent["source"];
  changes?: RequirementWorkflowChanges | null;
}) {
  const { previousAggregate, nextAggregate } = input;
  const explicitChangedFields = Object.keys(input.changes ?? {}).filter(
    (key) => key !== "updatedAt" && key !== "lastEvidenceAt",
  );
  const changedFields = [...new Set([
    ...explicitChangedFields,
    ...(previousAggregate?.id !== nextAggregate.id ? ["primaryRequirementId"] : []),
  ])];
  return {
    ownerActorId: nextAggregate.ownerActorId,
    ownerLabel: nextAggregate.ownerLabel,
    stage: nextAggregate.stage,
    summary: nextAggregate.summary,
    nextAction: nextAggregate.nextAction,
    memberIds: nextAggregate.memberIds,
    status: nextAggregate.status,
    stageGateStatus: nextAggregate.stageGateStatus,
    acceptanceStatus: nextAggregate.acceptanceStatus,
    acceptanceNote: nextAggregate.acceptanceNote ?? null,
    revision: nextAggregate.revision,
    workItemId: nextAggregate.workItemId,
    topicKey: nextAggregate.topicKey,
    roomId: nextAggregate.roomId,
    source: input.source ?? null,
    changedFields,
    previousAggregateId: previousAggregate?.id ?? null,
    previousOwnerActorId: previousAggregate?.ownerActorId ?? null,
    previousOwnerLabel: previousAggregate?.ownerLabel ?? null,
    previousRoomId: previousAggregate?.roomId ?? null,
    previousRevision: previousAggregate?.revision ?? null,
    previousStatus: previousAggregate?.status ?? null,
    previousStageGateStatus: previousAggregate?.stageGateStatus ?? null,
    previousAcceptanceStatus: previousAggregate?.acceptanceStatus ?? null,
  };
}

export function buildRequirementWorkflowEvidence(input: {
  companyId: string;
  eventType: RequirementWorkflowEventKind;
  aggregate: RequirementAggregateRecord;
  previousAggregate: RequirementAggregateRecord | null;
  actorId?: string | null;
  timestamp: number;
  source?: RequirementEvidenceEvent["source"];
  changes?: RequirementWorkflowChanges | null;
}): RequirementEvidenceEvent {
  return {
    id: `local:${input.aggregate.id}:${input.eventType}:${input.aggregate.revision}`,
    companyId: input.companyId,
    aggregateId: input.aggregate.id,
    source: input.source ?? "local-command",
    sessionKey: input.aggregate.sourceConversationId ?? null,
    actorId: input.actorId ?? input.aggregate.ownerActorId ?? null,
    eventType: input.eventType,
    timestamp: input.timestamp,
    payload: buildRequirementWorkflowEvidencePayload({
      previousAggregate: input.previousAggregate,
      nextAggregate: input.aggregate,
      source: input.source,
      changes: input.changes,
    }),
    applied: true,
  };
}
