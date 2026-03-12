import {
  buildRequirementDecisionTicketId,
  isOpenRequirementDecisionTicket,
  selectLatestRequirementDecisionTicket,
} from "../../../src/application/mission/requirement-decision-ticket";
import { reconcileRequirementAggregateState } from "../../../src/application/mission/requirement-aggregate";
import type {
  AssistantControlDecision,
  AssistantControlRequirementDraft,
  Company,
  ConversationStateRecord,
  DecisionTicketRecord,
  DraftRequirementRecord,
} from "../../../src/domain";
import { readAssistantControlEnvelope } from "../../../src/domain";
import type { AuthorityCompanyRuntimeSnapshot } from "../../../src/infrastructure/authority/contract";
import type { ChatMessage } from "../../../src/infrastructure/gateway/openclaw/sessions";

type AssistantControlUpdate = {
  sessionKey: string;
  message: ChatMessage;
  timestamp: number;
};

type RequirementControlReconcileResult = {
  runtime: AuthorityCompanyRuntimeSnapshot;
  violations: string[];
};

function shallowEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function upsertConversationStateRecord(input: {
  companyId: string;
  conversationStates: ConversationStateRecord[];
  sessionKey: string;
  draftRequirement: DraftRequirementRecord;
  timestamp: number;
}): ConversationStateRecord[] {
  const next = [...input.conversationStates];
  const index = next.findIndex((record) => record.conversationId === input.sessionKey);
  const record: ConversationStateRecord = index >= 0
    ? {
        ...next[index]!,
        companyId: input.companyId,
        conversationId: input.sessionKey,
        draftRequirement: input.draftRequirement,
        updatedAt: input.timestamp,
      }
    : {
        companyId: input.companyId,
        conversationId: input.sessionKey,
        currentWorkKey: null,
        currentWorkItemId: null,
        currentRoundId: null,
        draftRequirement: input.draftRequirement,
        updatedAt: input.timestamp,
      };
  if (index >= 0) {
    next[index] = record;
  } else {
    next.push(record);
  }
  return next.sort((left, right) => right.updatedAt - left.updatedAt);
}

function buildAuthorityDraftRequirement(input: {
  company: Company | null;
  previousDraft: DraftRequirementRecord | null;
  structuredDraft: AssistantControlRequirementDraft;
  timestamp: number;
  hasRuntimeRequirementSignal: boolean;
  allowWaitingConfirmation: boolean;
}): DraftRequirementRecord {
  const ceo = input.company?.employees.find((employee) => employee.metaRole === "ceo") ?? null;
  return {
    topicKey:
      input.structuredDraft.topicKey ??
      input.previousDraft?.topicKey ??
      null,
    topicText:
      input.previousDraft?.topicText ??
      input.structuredDraft.summary,
    summary: input.structuredDraft.summary,
    ownerActorId:
      input.structuredDraft.ownerActorId ??
      input.previousDraft?.ownerActorId ??
      ceo?.agentId ??
      null,
    ownerLabel:
      input.structuredDraft.ownerLabel ??
      input.previousDraft?.ownerLabel ??
      ceo?.nickname ??
      "CEO",
    stage:
      input.structuredDraft.stage ??
      input.previousDraft?.stage ??
      "CEO 正在收敛目标和推进方式",
    nextAction: input.structuredDraft.nextAction,
    stageGateStatus:
      input.allowWaitingConfirmation
        ? input.structuredDraft.stageGateStatus
        : input.structuredDraft.stageGateStatus === "confirmed"
          ? "confirmed"
          : input.previousDraft?.stageGateStatus ?? null,
    state: input.hasRuntimeRequirementSignal ? "active_requirement" : "draft_ready",
    promotionReason: input.previousDraft?.promotionReason ?? null,
    promotable: input.hasRuntimeRequirementSignal,
    updatedAt: input.timestamp,
  };
}

function matchRequirementDecisionTicket(
  ticket: DecisionTicketRecord,
  identity: {
    aggregateId?: string | null;
    workItemId?: string | null;
    sourceConversationId?: string | null;
    roomId?: string | null;
  },
): boolean {
  return Boolean(
    (identity.aggregateId && ticket.aggregateId === identity.aggregateId) ||
      (identity.workItemId && ticket.workItemId === identity.workItemId) ||
      (identity.sourceConversationId && ticket.sourceConversationId === identity.sourceConversationId) ||
      (identity.roomId && ticket.roomId === identity.roomId) ||
      (identity.aggregateId && ticket.sourceId === identity.aggregateId) ||
      (identity.workItemId && ticket.sourceId === identity.workItemId) ||
      (identity.sourceConversationId && ticket.sourceId === identity.sourceConversationId),
  );
}

function withDecisionTicketStageGate<T extends {
  stageGateStatus: string;
  updatedAt: number;
}>(record: T, latestTicket: DecisionTicketRecord | null): T {
  if (!latestTicket || latestTicket.sourceType !== "requirement") {
    return record;
  }
  if (isOpenRequirementDecisionTicket(latestTicket)) {
    return {
      ...record,
      stageGateStatus: "waiting_confirmation",
      updatedAt: Math.max(record.updatedAt, latestTicket.updatedAt),
    };
  }
  if (latestTicket.status === "resolved") {
    return {
      ...record,
      stageGateStatus: "confirmed",
      updatedAt: Math.max(record.updatedAt, latestTicket.updatedAt),
    };
  }
  return record;
}

function applyDecisionTicketDerivedStageGate(input: {
  runtime: AuthorityCompanyRuntimeSnapshot;
}): AuthorityCompanyRuntimeSnapshot {
  const { runtime } = input;
  const nextConversationStates = runtime.activeConversationStates.map((state) => {
    const latestTicket = selectLatestRequirementDecisionTicket({
      activeDecisionTickets: runtime.activeDecisionTickets,
      workItemId: state.currentWorkItemId ?? null,
      sourceConversationId: state.conversationId,
    });
    if (!state.draftRequirement || !latestTicket) {
      return state;
    }
    return {
      ...state,
      draftRequirement: {
        ...state.draftRequirement,
        stageGateStatus:
          latestTicket.status === "resolved"
            ? "confirmed"
            : isOpenRequirementDecisionTicket(latestTicket)
              ? "waiting_confirmation"
              : state.draftRequirement.stageGateStatus ?? null,
        updatedAt: Math.max(state.draftRequirement.updatedAt, latestTicket.updatedAt),
      },
      updatedAt: Math.max(state.updatedAt, latestTicket.updatedAt),
    };
  });

  const nextWorkItems = runtime.activeWorkItems.map((workItem) => {
    const latestTicket = selectLatestRequirementDecisionTicket({
      activeDecisionTickets: runtime.activeDecisionTickets,
      aggregateId: null,
      workItemId: workItem.id,
      sourceConversationId: workItem.sourceConversationId ?? workItem.sessionKey ?? null,
      roomId: workItem.roomId ?? null,
    });
    return withDecisionTicketStageGate(workItem, latestTicket);
  });

  const nextAggregates = runtime.activeRequirementAggregates.map((aggregate) => {
    const latestTicket = selectLatestRequirementDecisionTicket({
      activeDecisionTickets: runtime.activeDecisionTickets,
      aggregateId: aggregate.id,
      workItemId: aggregate.workItemId,
      sourceConversationId: aggregate.sourceConversationId,
      roomId: aggregate.roomId,
    });
    return withDecisionTicketStageGate(aggregate, latestTicket);
  });

  const nextMissions = runtime.activeMissionRecords.map((mission) => {
    const latestTicket = selectLatestRequirementDecisionTicket({
      activeDecisionTickets: runtime.activeDecisionTickets,
      aggregateId: mission.id,
      workItemId: mission.id,
      sourceConversationId: mission.sessionKey,
      roomId: mission.roomId ?? null,
    });
    const nextMission = withDecisionTicketStageGate(mission, latestTicket);
    if (!latestTicket || !isOpenRequirementDecisionTicket(latestTicket)) {
      return nextMission;
    }
    return {
      ...nextMission,
      nextAgentId: null,
      nextLabel: "你",
    };
  });

  return {
    ...runtime,
    activeConversationStates: nextConversationStates,
    activeWorkItems: nextWorkItems,
    activeRequirementAggregates: nextAggregates,
    activeMissionRecords: nextMissions,
  };
}

function upsertRequirementDecisionTicket(input: {
  runtime: AuthorityCompanyRuntimeSnapshot;
  company: Company | null;
  decision: AssistantControlDecision;
  sessionKey: string;
  timestamp: number;
}): DecisionTicketRecord[] {
  const aggregate =
    input.runtime.activeRequirementAggregates.find((record) =>
      matchRequirementDecisionTicket(
        {
          id: `probe:${record.id}`,
          companyId: input.runtime.companyId,
          sourceType: "requirement",
          sourceId: record.id,
          aggregateId: record.id,
          workItemId: record.workItemId,
          sourceConversationId: record.sourceConversationId,
          decisionOwnerActorId: "system:requirement",
          decisionType: input.decision.type,
          summary: input.decision.summary,
          options: input.decision.options,
          requiresHuman: true,
          status: "pending_human",
          createdAt: input.timestamp,
          updatedAt: input.timestamp,
        },
        {
          aggregateId: input.decision.aggregateId,
          workItemId: input.decision.workItemId,
          sourceConversationId: input.decision.sourceConversationId ?? input.sessionKey,
        },
      ),
    ) ?? null;
  const workItem =
    input.runtime.activeWorkItems.find(
      (record) =>
        record.id === input.decision.workItemId ||
        record.id === aggregate?.workItemId ||
        record.sourceConversationId === (input.decision.sourceConversationId ?? input.sessionKey) ||
        record.sessionKey === (input.decision.sourceConversationId ?? input.sessionKey),
    ) ?? null;
  const sourceId =
    input.decision.aggregateId ??
    aggregate?.id ??
    input.decision.workItemId ??
    workItem?.id ??
    input.decision.sourceConversationId ??
    input.sessionKey;
  const ticketId = buildRequirementDecisionTicketId({
    sourceType: "requirement",
    sourceId,
    decisionType: input.decision.type,
  });
  const ownerActorId =
    aggregate?.ownerActorId ??
    workItem?.ownerActorId ??
    input.company?.employees.find((employee) => employee.metaRole === "ceo")?.agentId ??
    "system:requirement";
  const nextTicket: DecisionTicketRecord = {
    id: ticketId,
    companyId: input.runtime.companyId,
    sourceType: "requirement",
    sourceId,
    escalationId: null,
    aggregateId: input.decision.aggregateId ?? aggregate?.id ?? null,
    workItemId: input.decision.workItemId ?? workItem?.id ?? null,
    sourceConversationId: input.decision.sourceConversationId ?? input.sessionKey,
    decisionOwnerActorId: ownerActorId,
    decisionType: input.decision.type,
    summary: input.decision.summary,
    options: input.decision.options,
    requiresHuman: true,
    status: "pending_human",
    resolution: null,
    resolutionOptionId: null,
    roomId: aggregate?.roomId ?? workItem?.roomId ?? null,
    createdAt:
      input.runtime.activeDecisionTickets.find((ticket) => ticket.id === ticketId)?.createdAt ??
      input.timestamp,
    updatedAt: input.timestamp,
  };
  const next = [
    nextTicket,
    ...input.runtime.activeDecisionTickets.filter((ticket) => ticket.id !== ticketId),
  ];
  return next.sort((left, right) => right.updatedAt - left.updatedAt);
}

export function reconcileAuthorityRequirementRuntime(input: {
  company: Company | null;
  runtime: AuthorityCompanyRuntimeSnapshot;
  controlUpdate?: AssistantControlUpdate | null;
}): RequirementControlReconcileResult {
  let runtime = input.runtime;
  const violations: string[] = [];

  if (input.controlUpdate) {
    const control = readAssistantControlEnvelope(input.controlUpdate.message);
    if (control?.requirementDraft) {
      const previousState =
        runtime.activeConversationStates.find(
          (record) => record.conversationId === input.controlUpdate?.sessionKey,
        ) ?? null;
      const hasRuntimeRequirementSignal = Boolean(
        runtime.activeWorkItems.some(
          (item) =>
            item.sourceConversationId === input.controlUpdate?.sessionKey ||
            item.sessionKey === input.controlUpdate?.sessionKey,
        ) ||
          runtime.activeRequirementAggregates.some(
            (aggregate) => aggregate.sourceConversationId === input.controlUpdate?.sessionKey,
          ),
      );
      const allowWaitingConfirmation = !(
        control.requirementDraft.stageGateStatus === "waiting_confirmation" &&
        !control.decision
      );
      if (!allowWaitingConfirmation) {
        violations.push(
          `assistant_control_missing_decision:${input.controlUpdate.sessionKey}:${input.controlUpdate.timestamp}`,
        );
      }
      const nextDraftRequirement = buildAuthorityDraftRequirement({
        company: input.company,
        previousDraft: previousState?.draftRequirement ?? null,
        structuredDraft: control.requirementDraft,
        timestamp: input.controlUpdate.timestamp,
        hasRuntimeRequirementSignal,
        allowWaitingConfirmation,
      });
      runtime = {
        ...runtime,
        activeConversationStates: upsertConversationStateRecord({
          companyId: runtime.companyId,
          conversationStates: runtime.activeConversationStates,
          sessionKey: input.controlUpdate.sessionKey,
          draftRequirement: nextDraftRequirement,
          timestamp: input.controlUpdate.timestamp,
        }),
      };
    }
  }

  const reconciledAggregates = reconcileRequirementAggregateState({
    companyId: runtime.companyId,
    existingAggregates: runtime.activeRequirementAggregates,
    primaryRequirementId: runtime.primaryRequirementId,
    activeConversationStates: runtime.activeConversationStates,
    activeWorkItems: runtime.activeWorkItems,
    activeRoomRecords: runtime.activeRoomRecords,
    activeRequirementEvidence: runtime.activeRequirementEvidence,
  });

  runtime = {
    ...runtime,
    activeRequirementAggregates: reconciledAggregates.activeRequirementAggregates,
    primaryRequirementId: reconciledAggregates.primaryRequirementId,
  };

  if (input.controlUpdate) {
    const control = readAssistantControlEnvelope(input.controlUpdate.message);
    if (control?.decision) {
      runtime = {
        ...runtime,
        activeDecisionTickets: upsertRequirementDecisionTicket({
          runtime,
          company: input.company,
          decision: control.decision,
          sessionKey: input.controlUpdate.sessionKey,
          timestamp: input.controlUpdate.timestamp,
        }),
      };
    }
  }

  runtime = applyDecisionTicketDerivedStageGate({ runtime });

  return {
    runtime,
    violations,
  };
}

export function mergeAuthorityControlledRuntimeSlices(input: {
  currentRuntime: AuthorityCompanyRuntimeSnapshot;
  incomingRuntime: AuthorityCompanyRuntimeSnapshot;
}): AuthorityCompanyRuntimeSnapshot {
  const conversationStateMap = new Map(
    input.currentRuntime.activeConversationStates.map((record) => [record.conversationId, record] as const),
  );
  input.incomingRuntime.activeConversationStates.forEach((record) => {
    const existing = conversationStateMap.get(record.conversationId);
    if (!existing) {
      conversationStateMap.set(record.conversationId, {
        ...record,
        draftRequirement: null,
      });
      return;
    }
    conversationStateMap.set(record.conversationId, {
      ...existing,
      currentWorkKey:
        typeof record.currentWorkKey === "string" || record.currentWorkKey === null
          ? record.currentWorkKey
          : existing.currentWorkKey,
      currentWorkItemId:
        typeof record.currentWorkItemId === "string" || record.currentWorkItemId === null
          ? record.currentWorkItemId
          : existing.currentWorkItemId,
      currentRoundId:
        typeof record.currentRoundId === "string" || record.currentRoundId === null
          ? record.currentRoundId
          : existing.currentRoundId,
      draftRequirement: existing.draftRequirement ?? null,
      updatedAt: Math.max(existing.updatedAt, record.updatedAt),
    });
  });

  const decisionTicketMap = new Map(
    input.currentRuntime.activeDecisionTickets.map((ticket) => [ticket.id, ticket] as const),
  );
  input.incomingRuntime.activeDecisionTickets.forEach((ticket) => {
    const existing = decisionTicketMap.get(ticket.id);
    if (!existing || ticket.updatedAt >= existing.updatedAt) {
      decisionTicketMap.set(ticket.id, ticket);
    }
  });

  return {
    ...input.incomingRuntime,
    activeConversationStates: [...conversationStateMap.values()].sort((left, right) => right.updatedAt - left.updatedAt),
    activeDecisionTickets: [...decisionTicketMap.values()].sort((left, right) => right.updatedAt - left.updatedAt),
  };
}

export function runtimeRequirementControlChanged(
  left: AuthorityCompanyRuntimeSnapshot,
  right: AuthorityCompanyRuntimeSnapshot,
): boolean {
  return !shallowEqual(
    {
      activeConversationStates: left.activeConversationStates,
      activeMissionRecords: left.activeMissionRecords,
      activeWorkItems: left.activeWorkItems,
      activeRequirementAggregates: left.activeRequirementAggregates,
      activeDecisionTickets: left.activeDecisionTickets,
      primaryRequirementId: left.primaryRequirementId,
    },
    {
      activeConversationStates: right.activeConversationStates,
      activeMissionRecords: right.activeMissionRecords,
      activeWorkItems: right.activeWorkItems,
      activeRequirementAggregates: right.activeRequirementAggregates,
      activeDecisionTickets: right.activeDecisionTickets,
      primaryRequirementId: right.primaryRequirementId,
    },
  );
}
