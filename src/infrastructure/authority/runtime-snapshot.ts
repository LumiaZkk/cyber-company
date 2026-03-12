import type { CompanyRuntimeState } from "../company/runtime/types";
import type { AuthorityBootstrapSnapshot, AuthorityCompanyRuntimeSnapshot } from "./contract";
import {
  buildRoomRecordIdFromWorkItem,
  normalizeProductWorkItemIdentity,
  normalizeStrategicRoundId,
  normalizeStrategicWorkItemId,
} from "../../application/mission/work-item";
import { sanitizeRequirementAggregateRecords } from "../../application/mission/requirement-aggregate";
import { sanitizeRequirementRoomRecords } from "../company/persistence/room-persistence";
import { sanitizeWorkItemRecords } from "../company/persistence/work-item-persistence";
import type { RequirementStageGateStatus } from "../../domain/mission/types";
import type { DecisionTicketRecord, RequirementRoomRecord } from "../../domain/delegation/types";
import type { RequirementAggregateRecord, WorkItemRecord } from "../../domain/mission/types";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStageGateStatus(value: unknown): RequirementStageGateStatus | null {
  return value === "none" || value === "waiting_confirmation" || value === "confirmed"
    ? value
    : null;
}

function normalizeRoomId(
  roomId: string | null | undefined,
  workItemId?: string | null,
): string | null {
  const normalizedWorkItemId =
    normalizeStrategicWorkItemId(workItemId) ?? readString(workItemId);
  if (normalizedWorkItemId) {
    return buildRoomRecordIdFromWorkItem(normalizedWorkItemId);
  }
  const normalizedRoomId = readString(roomId);
  if (!normalizedRoomId) {
    return null;
  }
  if (normalizedRoomId.startsWith("workitem:")) {
    const roomWorkItemId =
      normalizeStrategicWorkItemId(normalizedRoomId.slice("workitem:".length)) ??
      readString(normalizedRoomId.slice("workitem:".length));
    return roomWorkItemId ? buildRoomRecordIdFromWorkItem(roomWorkItemId) : normalizedRoomId;
  }
  return normalizedRoomId;
}

function normalizeConversationStates(
  states: AuthorityCompanyRuntimeSnapshot["activeConversationStates"],
): AuthorityCompanyRuntimeSnapshot["activeConversationStates"] {
  return states
    .map((state) => {
      const normalizedTopicKey = normalizeProductWorkItemIdentity({
        topicKey: state.draftRequirement?.topicKey,
        title: state.draftRequirement?.summary,
      }).topicKey;
      return {
        ...state,
        conversationId: state.conversationId.trim(),
        currentWorkKey:
          normalizeStrategicWorkItemId(state.currentWorkKey) ??
          readString(state.currentWorkKey),
        currentWorkItemId:
          normalizeStrategicWorkItemId(state.currentWorkItemId) ??
          readString(state.currentWorkItemId),
        currentRoundId:
          normalizeStrategicRoundId(state.currentRoundId) ??
          readString(state.currentRoundId),
        draftRequirement: state.draftRequirement
          ? {
              ...state.draftRequirement,
              topicKey: normalizedTopicKey,
              topicText: state.draftRequirement.topicText.trim(),
              summary: state.draftRequirement.summary.trim(),
              ownerActorId: readString(state.draftRequirement.ownerActorId),
              ownerLabel: state.draftRequirement.ownerLabel.trim(),
              stage: state.draftRequirement.stage.trim(),
              nextAction: state.draftRequirement.nextAction.trim(),
              promotionReason: state.draftRequirement.promotionReason ?? null,
              stageGateStatus: normalizeStageGateStatus(state.draftRequirement.stageGateStatus),
            }
          : null,
      };
    })
    .filter((state) => state.conversationId.length > 0);
}

function normalizeMissionRecords(
  missions: AuthorityCompanyRuntimeSnapshot["activeMissionRecords"],
): AuthorityCompanyRuntimeSnapshot["activeMissionRecords"] {
  return missions.map((mission) => {
    const normalizedIdentity = normalizeProductWorkItemIdentity({
      workItemId: mission.id,
      topicKey: mission.topicKey,
      title: mission.title,
    });
    const normalizedMissionId =
      normalizeStrategicWorkItemId(mission.id) ?? mission.id.trim();
    return {
      ...mission,
      id: normalizedMissionId,
      sessionKey: mission.sessionKey.trim(),
      topicKey: normalizedIdentity.topicKey ?? undefined,
      roomId:
        normalizeRoomId(
          mission.roomId ?? null,
          normalizedIdentity.workItemId ?? normalizedMissionId,
        ) ?? undefined,
      ownerAgentId: readString(mission.ownerAgentId),
      nextAgentId: readString(mission.nextAgentId),
      promotionReason: mission.promotionReason ?? null,
    };
  });
}

function normalizeRequirementEvidence(
  events: AuthorityCompanyRuntimeSnapshot["activeRequirementEvidence"],
): AuthorityCompanyRuntimeSnapshot["activeRequirementEvidence"] {
  return events.map((event) => {
    const payload = event.payload ?? {};
    const payloadWorkItemId =
      normalizeStrategicWorkItemId(readString(payload.workItemId)) ??
      readString(payload.workItemId);
    const payloadTopicKey = normalizeProductWorkItemIdentity({
      workItemId: payloadWorkItemId,
      topicKey: readString(payload.topicKey),
    }).topicKey;
    return {
      ...event,
      aggregateId:
        normalizeStrategicWorkItemId(event.aggregateId) ??
        readString(event.aggregateId),
      sessionKey: readString(event.sessionKey),
      actorId: readString(event.actorId),
      payload: {
        ...payload,
        workItemId: payloadWorkItemId ?? payload.workItemId,
        topicKey: payloadTopicKey ?? payload.topicKey,
        roomId:
          normalizeRoomId(readString(payload.roomId), payloadWorkItemId) ??
          payload.roomId,
      },
    };
  });
}

function matchesRequirementDecisionTicket(
  ticket: DecisionTicketRecord,
  input: {
    aggregate: RequirementAggregateRecord | null;
    workItem: WorkItemRecord | null;
    room: RequirementRoomRecord;
  },
): boolean {
  const aggregateId = readString(input.aggregate?.id);
  const workItemId = readString(input.workItem?.id) ?? readString(input.room.workItemId);
  const sourceConversationId =
    readString(input.aggregate?.sourceConversationId) ?? readString(input.workItem?.sourceConversationId);
  const roomId = readString(input.room.id);
  return Boolean(
    (aggregateId && (ticket.aggregateId === aggregateId || ticket.sourceId === aggregateId)) ||
      (workItemId && (ticket.workItemId === workItemId || ticket.sourceId === workItemId)) ||
      (sourceConversationId &&
        (ticket.sourceConversationId === sourceConversationId || ticket.sourceId === sourceConversationId)) ||
      (roomId && ticket.roomId === roomId),
  );
}

function repairLegacyDecisionShellState(input: {
  activeWorkItems: WorkItemRecord[];
  activeRequirementAggregates: RequirementAggregateRecord[];
  activeRoomRecords: RequirementRoomRecord[];
  activeDecisionTickets: DecisionTicketRecord[];
}): {
  activeWorkItems: WorkItemRecord[];
  activeRequirementAggregates: RequirementAggregateRecord[];
} {
  const workItemById = new Map(input.activeWorkItems.map((item) => [item.id, item] as const));
  const aggregateById = new Map(
    input.activeRequirementAggregates.map((aggregate) => [aggregate.id, aggregate] as const),
  );

  input.activeRoomRecords.forEach((room) => {
    if (room.scope !== "decision") {
      return;
    }
    const workItem =
      (room.workItemId ? workItemById.get(room.workItemId) ?? null : null) ??
      input.activeWorkItems.find((candidate) => candidate.roomId === room.id) ??
      (room.topicKey
        ? input.activeWorkItems.find((candidate) => candidate.topicKey === room.topicKey) ?? null
        : null);
    const aggregate =
      input.activeRequirementAggregates.find((candidate) => candidate.roomId === room.id) ??
      (room.workItemId
        ? input.activeRequirementAggregates.find((candidate) => candidate.workItemId === room.workItemId) ?? null
        : null) ??
      (room.topicKey
        ? input.activeRequirementAggregates.find((candidate) => candidate.topicKey === room.topicKey) ?? null
        : null);
    const latestDecisionTicket =
      input.activeDecisionTickets
        .filter((ticket) => ticket.sourceType === "requirement")
        .filter((ticket) =>
          matchesRequirementDecisionTicket(ticket, {
            aggregate: aggregate ?? null,
            workItem: workItem ?? null,
            room,
          }),
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
    if (latestDecisionTicket?.status === "resolved" || latestDecisionTicket?.status === "cancelled") {
      return;
    }

    if (workItem && workItem.status !== "completed" && workItem.status !== "archived") {
      workItemById.set(workItem.id, {
        ...workItem,
        lifecyclePhase: "pre_requirement",
        stageGateStatus: "waiting_confirmation",
      });
    }
    if (aggregate) {
      aggregateById.set(aggregate.id, {
        ...aggregate,
        lifecyclePhase: "pre_requirement",
        stageGateStatus: "waiting_confirmation",
      });
    }
  });

  return {
    activeWorkItems: [...workItemById.values()],
    activeRequirementAggregates: [...aggregateById.values()],
  };
}

export function runtimeStateFromAuthorityRuntimeSnapshot(
  runtime: AuthorityCompanyRuntimeSnapshot | null,
): Pick<
  CompanyRuntimeState,
  | "authorityBackedState"
  | "activeRoomRecords"
  | "activeMissionRecords"
  | "activeConversationStates"
  | "activeWorkItems"
  | "activeRequirementAggregates"
  | "activeRequirementEvidence"
  | "primaryRequirementId"
  | "activeRoundRecords"
  | "activeArtifacts"
  | "activeDispatches"
  | "activeRoomBindings"
  | "activeSupportRequests"
  | "activeEscalations"
  | "activeDecisionTickets"
> {
  const companyId = runtime?.companyId ?? null;
  const activeWorkItems = runtime ? sanitizeWorkItemRecords(runtime.activeWorkItems ?? []) : [];
  const activeRoomRecords =
    companyId && runtime
      ? sanitizeRequirementRoomRecords(companyId, runtime.activeRoomRecords ?? [])
      : [];
  const activeConversationStates = runtime
    ? normalizeConversationStates(runtime.activeConversationStates ?? [])
    : [];
  const activeRequirementEvidence = runtime
    ? normalizeRequirementEvidence(runtime.activeRequirementEvidence ?? [])
    : [];
  const normalizedPrimaryRequirementId =
    normalizeStrategicWorkItemId(runtime?.primaryRequirementId) ??
    runtime?.primaryRequirementId ??
    null;
  const activeRequirementAggregates = runtime
    ? sanitizeRequirementAggregateRecords(
        runtime.activeRequirementAggregates ?? [],
        normalizedPrimaryRequirementId,
      )
    : [];
  const healedDecisionShellState = repairLegacyDecisionShellState({
    activeWorkItems,
    activeRequirementAggregates,
    activeRoomRecords,
    activeDecisionTickets: runtime?.activeDecisionTickets ?? [],
  });

  return {
    authorityBackedState: Boolean(runtime?.companyId),
    activeRoomRecords,
    activeMissionRecords: runtime ? normalizeMissionRecords(runtime.activeMissionRecords ?? []) : [],
    activeConversationStates,
    activeWorkItems: healedDecisionShellState.activeWorkItems,
    activeRequirementAggregates: sanitizeRequirementAggregateRecords(
      healedDecisionShellState.activeRequirementAggregates,
      normalizedPrimaryRequirementId,
    ),
    activeRequirementEvidence,
    primaryRequirementId: normalizedPrimaryRequirementId,
    activeRoundRecords: runtime?.activeRoundRecords ?? [],
    activeArtifacts: runtime?.activeArtifacts ?? [],
    activeDispatches: runtime?.activeDispatches ?? [],
    activeRoomBindings: runtime?.activeRoomBindings ?? [],
    activeSupportRequests: runtime?.activeSupportRequests ?? [],
    activeEscalations: runtime?.activeEscalations ?? [],
    activeDecisionTickets: runtime?.activeDecisionTickets ?? [],
  };
}

export function runtimeStateFromAuthorityBootstrap(
  snapshot: AuthorityBootstrapSnapshot,
): Pick<
  CompanyRuntimeState,
  | "config"
  | "activeCompany"
  | "authorityBackedState"
  | "activeRoomRecords"
  | "activeMissionRecords"
  | "activeConversationStates"
  | "activeWorkItems"
  | "activeRequirementAggregates"
  | "activeRequirementEvidence"
  | "primaryRequirementId"
  | "activeRoundRecords"
  | "activeArtifacts"
  | "activeDispatches"
  | "activeRoomBindings"
  | "activeSupportRequests"
  | "activeEscalations"
  | "activeDecisionTickets"
> {
  return {
    ...runtimeStateFromAuthorityRuntimeSnapshot(snapshot.runtime),
    config: snapshot.config,
    activeCompany: snapshot.activeCompany,
    authorityBackedState: Boolean(snapshot.activeCompany),
  };
}
