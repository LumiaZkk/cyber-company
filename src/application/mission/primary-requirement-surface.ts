import { buildCurrentRequirementState } from "./current-requirement-state";
import { buildRequirementOverviewTitle, summarizeRequirementText } from "../../domain/mission/requirement-topic";
import {
  selectLatestRequirementDecisionTicket,
  selectOpenRequirementDecisionTicket,
} from "./requirement-decision-ticket";
import { buildRoomRecordIdFromWorkItem } from "./work-item";
import { selectPrimaryRequirementProjection } from "./requirement-aggregate";
import { buildRequirementRecentReports } from "./requirement-room-backfill";
import type { RequirementExecutionOverview } from "./requirement-overview";
import type { RequirementScope } from "./requirement-scope";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import type { Company, ConversationStateRecord, RequirementAggregateRecord, RequirementEvidenceEvent, WorkItemRecord } from "../../domain";
import type { DecisionTicketRecord, RequirementRoomRecord, RequestRecord } from "../../domain/delegation/types";
import type { GatewaySessionRow } from "../gateway";

export type PrimaryRequirementSurface = {
  aggregateId: string | null;
  workItemId: string | null;
  roomId: string | null;
  title: string;
  summary: string;
  ownerActorId: string | null;
  ownerLabel: string;
  currentStep: string;
  nextBatonActorId: string | null;
  nextBatonLabel: string;
  lifecyclePhase: RequirementAggregateRecord["lifecyclePhase"] | WorkItemRecord["lifecyclePhase"] | null;
  stageGateStatus: RequirementAggregateRecord["stageGateStatus"] | WorkItemRecord["stageGateStatus"];
  updatedAt: number | null;
  latestBlocker: string | null;
  latestReportSummary: string | null;
  roomStatus: "missing" | "ready";
  openDecisionTicket: DecisionTicketRecord | null;
  latestDecisionTicket: DecisionTicketRecord | null;
  aggregate: RequirementAggregateRecord | null;
  workItem: WorkItemRecord | null;
  room: RequirementRoomRecord | null;
  requirementOverview: RequirementExecutionOverview | null;
  requirementScope: RequirementScope | null;
  roomMemberIds: string[];
  recentReports: Array<{
    id: string;
    actorId: string | null;
    actorLabel: string;
    status: string;
    text: string;
    timestamp: number;
  }>;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const LOW_SIGNAL_REQUIREMENT_TITLES = new Set([
  "当前需求",
  "当前主线",
  "当前主线正在推进。",
  "当前主线正在推进",
  "需求团队房间",
  "需求团队",
]);

function isLowSignalRequirementTitle(value: string | null | undefined): boolean {
  const normalized = readString(value);
  if (!normalized) {
    return true;
  }
  return LOW_SIGNAL_REQUIREMENT_TITLES.has(normalized);
}

function dedupeIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => readString(value)).filter((value): value is string => Boolean(value)))];
}

function isGenericOwnerLabel(value: string | null | undefined): boolean {
  const normalized = readString(value);
  return !normalized || normalized === "当前负责人";
}

function buildRequirementTitleFromInstruction(text: string | null | undefined): string | null {
  const normalized = readString(text);
  if (!normalized) {
    return null;
  }
  const derived = buildRequirementOverviewTitle("mission:", [normalized]);
  return isLowSignalRequirementTitle(derived) ? null : derived;
}

function findRequirementTitleHintFromRoom(room: RequirementRoomRecord | null): string | null {
  const messages = [...(room?.transcript ?? [])]
    .filter((message) => typeof message.text === "string" && message.text.trim().length > 20)
    .sort((left, right) => left.timestamp - right.timestamp);
  const preferred = messages.find(
    (message) =>
      message.role === "user" ||
      message.source === "user" ||
      message.source === "owner_dispatch",
  );
  const candidates = preferred ? [preferred, ...messages.filter((message) => message !== preferred)] : messages;
  for (const message of candidates) {
    const title = buildRequirementTitleFromInstruction(message.text);
    if (title) {
      return title;
    }
  }
  return null;
}

function findRoomForRequirement(input: {
  aggregate: RequirementAggregateRecord | null;
  workItem: WorkItemRecord | null;
  overview: RequirementExecutionOverview | null;
  rooms: RequirementRoomRecord[];
}): RequirementRoomRecord | null {
  const { aggregate, workItem, overview, rooms } = input;
  return (
    rooms.find((room) => room.id === aggregate?.roomId) ??
    rooms.find((room) => room.id === workItem?.roomId) ??
    rooms.find((room) => room.workItemId === workItem?.id) ??
    rooms.find((room) => room.workItemId === aggregate?.workItemId) ??
    (aggregate?.topicKey ? rooms.find((room) => room.topicKey === aggregate.topicKey) : null) ??
    (workItem?.topicKey ? rooms.find((room) => room.topicKey === workItem.topicKey) : null) ??
    (overview?.topicKey ? rooms.find((room) => room.topicKey === overview.topicKey) : null) ??
    null
  );
}

function isDecisionRoomPending(input: {
  room: RequirementRoomRecord | null;
  workItem: WorkItemRecord | null;
  aggregate: RequirementAggregateRecord | null;
  openDecisionTicket: DecisionTicketRecord | null;
  latestDecisionTicket: DecisionTicketRecord | null;
}): boolean {
  if (input.openDecisionTicket?.requiresHuman) {
    return true;
  }
  if (input.room?.scope !== "decision") {
    return false;
  }
  if (input.latestDecisionTicket?.status === "resolved" || input.latestDecisionTicket?.status === "cancelled") {
    return false;
  }
  const stageGateStatus =
    input.workItem?.stageGateStatus ?? input.aggregate?.stageGateStatus ?? "none";
  if (stageGateStatus === "waiting_confirmation") {
    return true;
  }
  return !input.latestDecisionTicket;
}

function resolveNextBaton(input: {
  workItem: WorkItemRecord | null;
  overview: RequirementExecutionOverview | null;
  isDecisionRoomPending: boolean;
  isUnboundPreRequirementShell: boolean;
}) {
  if (input.isDecisionRoomPending) {
    return {
      actorId: null,
      label: "你",
    };
  }

  if (input.isUnboundPreRequirementShell) {
    return {
      actorId: null,
      label: "待结构化确认",
    };
  }

  if (input.workItem?.batonActorId) {
    return {
      actorId: input.workItem.batonActorId,
      label: input.workItem.batonLabel || "下一棒",
    };
  }

  const nextParticipant =
    input.overview?.participants.find((participant) => !participant.isCurrent && !participant.isBlocking) ?? null;
  if (nextParticipant) {
    return {
      actorId: nextParticipant.agentId,
      label: nextParticipant.nickname,
    };
  }

  return {
    actorId: null,
    label: "继续推进",
  };
}

function resolveLatestBlocker(input: {
  aggregate: RequirementAggregateRecord | null;
  scope: RequirementScope | null;
}): string | null {
  const blockedRequest =
    input.scope?.requests.find((request) => request.status === "blocked") ?? null;
  if (blockedRequest) {
    return readString(blockedRequest.responseSummary) ?? readString(blockedRequest.summary);
  }
  const blockedHandoff =
    input.scope?.handoffs.find((handoff) => handoff.status === "blocked") ?? null;
  if (blockedHandoff) {
    return readString(blockedHandoff.summary);
  }
  const blockedTask =
    input.scope?.tasks.find(
      (task) =>
        task.state === "blocked_timeout" ||
        task.state === "blocked_tool_failure" ||
        task.state === "manual_takeover_required",
    ) ?? null;
  if (blockedTask) {
    return readString(blockedTask.blockedReason) ?? readString(blockedTask.summary);
  }
  if (input.aggregate?.status === "blocked") {
    return readString(input.aggregate.nextAction) ?? readString(input.aggregate.summary);
  }
  return null;
}

export function buildPrimaryRequirementSurface(input: {
  company: Company;
  activeConversationStates: ConversationStateRecord[];
  activeWorkItems: WorkItemRecord[];
  activeRequirementAggregates: RequirementAggregateRecord[];
  activeRequirementEvidence: RequirementEvidenceEvent[];
  activeDecisionTickets: DecisionTicketRecord[];
  primaryRequirementId: string | null;
  activeRoomRecords: RequirementRoomRecord[];
  companySessions: Array<GatewaySessionRow & { agentId: string }>;
  companySessionSnapshots: RequirementSessionSnapshot[];
  currentTime: number;
  ceoAgentId: string | null;
}): PrimaryRequirementSurface {
  const requirementState = buildCurrentRequirementState({
    company: input.company,
    activeConversationStates: input.activeConversationStates,
    activeWorkItems: input.activeWorkItems,
    activeRequirementAggregates: input.activeRequirementAggregates,
    primaryRequirementId: input.primaryRequirementId,
    activeRoomRecords: input.activeRoomRecords,
    companySessions: input.companySessions,
    companySessionSnapshots: input.companySessionSnapshots,
    currentTime: input.currentTime,
    ceoAgentId: input.ceoAgentId,
  });
  const projection = selectPrimaryRequirementProjection({
    company: input.company,
    activeRequirementAggregates: input.activeRequirementAggregates,
    primaryRequirementId: input.primaryRequirementId,
    activeWorkItems: input.activeWorkItems,
    activeRoomRecords: input.activeRoomRecords,
  });
  const aggregate = projection.aggregate ?? requirementState.primaryRequirementAggregate;
  const requirementOverview = requirementState.requirementOverview;
  const requirementScope = requirementState.requirementScope;
  const projectedWorkItem = projection.workItem ?? requirementState.currentWorkItem;
  const projectedRoom =
    projection.room ??
    findRoomForRequirement({
      aggregate,
      workItem: projectedWorkItem,
      overview: requirementOverview,
      rooms: input.activeRoomRecords,
    });
  const workItem = projectedWorkItem;
  const room =
    projectedRoom ??
    findRoomForRequirement({
      aggregate,
      workItem,
      overview: requirementOverview,
      rooms: input.activeRoomRecords,
    });
  const openDecisionTicket = selectOpenRequirementDecisionTicket({
    activeDecisionTickets: input.activeDecisionTickets,
    aggregateId: aggregate?.id ?? null,
    workItemId: workItem?.id ?? aggregate?.workItemId ?? null,
    sourceConversationId: aggregate?.sourceConversationId ?? workItem?.sourceConversationId ?? null,
    roomId: room?.id ?? aggregate?.roomId ?? workItem?.roomId ?? null,
  });
  const latestDecisionTicket = selectLatestRequirementDecisionTicket({
    activeDecisionTickets: input.activeDecisionTickets,
    aggregateId: aggregate?.id ?? null,
    workItemId: workItem?.id ?? aggregate?.workItemId ?? null,
    sourceConversationId: aggregate?.sourceConversationId ?? workItem?.sourceConversationId ?? null,
    roomId: room?.id ?? aggregate?.roomId ?? workItem?.roomId ?? null,
  });
  const isDecisionShellPending = isDecisionRoomPending({
    room,
    workItem,
    aggregate,
    openDecisionTicket,
    latestDecisionTicket,
  });
  const roomMemberIds = dedupeIds([
    ...(room?.memberIds ?? []),
    ...(aggregate?.memberIds ?? []),
    workItem?.ownerActorId,
    workItem?.batonActorId,
    ...((workItem?.steps ?? []).map((step) => step.assigneeActorId ?? null)),
    ...((requirementOverview?.participants ?? []).map((participant) => participant.agentId)),
  ]);
  const nextBaton = resolveNextBaton({
    workItem,
    overview: requirementOverview,
    isDecisionRoomPending: isDecisionShellPending,
    isUnboundPreRequirementShell:
      aggregate?.lifecyclePhase === "pre_requirement" &&
      !workItem &&
      !room,
  });
  const isPreRequirementDecisionRoom =
    room?.scope === "decision" &&
    !workItem &&
    aggregate?.lifecyclePhase === "pre_requirement";
  const isUnboundPreRequirementShell =
    aggregate?.lifecyclePhase === "pre_requirement" &&
    !workItem &&
    !room;
  const recentReports = buildRequirementRecentReports({
    company: input.company,
    scopeRequests: requirementScope?.requests ?? ([] as RequestRecord[]),
    evidence: input.activeRequirementEvidence,
    aggregateId: aggregate?.id ?? null,
  });
  const latestReportSummary = recentReports[0]?.text ?? null;
  const roomDerivedTitle = findRequirementTitleHintFromRoom(room);
  const instructionDerivedTitle = buildRequirementTitleFromInstruction(
    requirementState.ceoInstructionHint?.text,
  ) ?? roomDerivedTitle;
  const fallbackTitle = buildRequirementOverviewTitle(
    workItem?.topicKey ?? aggregate?.topicKey ?? requirementOverview?.topicKey ?? "mission:",
    [
      instructionDerivedTitle,
      roomDerivedTitle,
      requirementState.ceoInstructionHint?.text,
      workItem?.title,
      workItem?.displaySummary,
      workItem?.summary,
      requirementOverview?.title,
      requirementOverview?.summary,
      aggregate?.summary,
      room?.headline,
      room?.title,
      latestReportSummary,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );
  const titleCandidate =
    instructionDerivedTitle ??
    readString(workItem?.title) ??
    readString(requirementOverview?.title) ??
    readString(room?.title) ??
    readString(room?.headline) ??
    readString(aggregate?.summary) ??
    null;
  const title = isLowSignalRequirementTitle(titleCandidate) ? fallbackTitle : titleCandidate ?? fallbackTitle;
  const summary =
    readString(summarizeRequirementText(requirementState.ceoInstructionHint?.text ?? "", 120)) ??
    readString(workItem?.displaySummary) ??
    readString(workItem?.summary) ??
    readString(requirementOverview?.summary) ??
    readString(aggregate?.summary) ??
    latestReportSummary ??
    "CEO 正在把这条主线收敛为可执行结果。";
  const ownerActorId =
    (isDecisionShellPending || isPreRequirementDecisionRoom || isUnboundPreRequirementShell
      ? input.ceoAgentId
      : null) ??
    workItem?.ownerActorId ??
    requirementOverview?.currentOwnerAgentId ??
    aggregate?.ownerActorId ??
    null;
  const ownerEmployee =
    ownerActorId
      ? input.company.employees.find((employee) => employee.agentId === ownerActorId) ?? null
      : null;
  const rawOwnerLabel =
    readString(workItem?.displayOwnerLabel) ??
    readString(workItem?.ownerLabel) ??
    readString(requirementOverview?.currentOwnerLabel) ??
    readString(aggregate?.ownerLabel) ??
    "当前负责人";
  const ownerLabel =
    (isDecisionShellPending || isPreRequirementDecisionRoom || isUnboundPreRequirementShell) &&
    ownerEmployee?.nickname
      ? ownerEmployee.nickname
      : isGenericOwnerLabel(rawOwnerLabel) && ownerEmployee?.nickname
        ? ownerEmployee.nickname
        : rawOwnerLabel;
  const rawCurrentStep =
    readString(workItem?.displayStage) ??
    readString(workItem?.stageLabel) ??
    readString(requirementOverview?.currentStage) ??
    readString(aggregate?.stage) ??
    "待推进";
  const currentStep =
    isDecisionShellPending || isPreRequirementDecisionRoom
      ? "待你确认下一步"
      : isUnboundPreRequirementShell
        ? "等待结构化状态声明"
        : rawCurrentStep === "0 条可见消息" && room?.scope === "decision"
          ? "待你确认下一步"
          : rawCurrentStep;
  const workItemId = workItem?.id ?? aggregate?.workItemId ?? null;
  const stageGateStatus = isDecisionShellPending
    ? "waiting_confirmation"
    : latestDecisionTicket?.status === "resolved"
      ? "confirmed"
      : workItem?.stageGateStatus ?? aggregate?.stageGateStatus ?? "none";
  return {
    aggregateId: aggregate?.id ?? null,
    workItemId,
    roomId:
      room?.id ??
      aggregate?.roomId ??
      workItem?.roomId ??
      (workItemId ? buildRoomRecordIdFromWorkItem(workItemId) : null),
    title,
    summary,
    ownerActorId,
    ownerLabel,
    currentStep,
    nextBatonActorId: nextBaton.actorId,
    nextBatonLabel: nextBaton.label,
    lifecyclePhase:
      isDecisionShellPending
        ? "pre_requirement"
        : workItem?.lifecyclePhase ?? aggregate?.lifecyclePhase ?? null,
    stageGateStatus,
    updatedAt:
      Math.max(
        aggregate?.updatedAt ?? 0,
        workItem?.updatedAt ?? 0,
        room?.updatedAt ?? 0,
        recentReports[0]?.timestamp ?? 0,
        latestDecisionTicket?.updatedAt ?? 0,
      ) || null,
    latestBlocker: resolveLatestBlocker({
      aggregate,
      scope: requirementScope,
    }),
    latestReportSummary:
      latestReportSummary && latestReportSummary !== summary
        ? summarizeRequirementText(latestReportSummary, 72)
        : latestReportSummary,
    roomStatus: room ? "ready" : "missing",
    openDecisionTicket,
    latestDecisionTicket,
    aggregate,
    workItem,
    room,
    requirementOverview,
    requirementScope,
    roomMemberIds,
    recentReports,
  };
}
