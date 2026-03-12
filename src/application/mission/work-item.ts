import type {
  ArtifactRecord,
  ConversationStateRecord,
  ConversationMissionRecord,
  ConversationMissionStepRecord,
  DispatchRecord,
  RequirementRoomRecord,
  RoundMessageSnapshot,
  RoundRecord,
  WorkItemRecord,
  WorkStepRecord,
} from "../../domain";
import { buildWorkItemIdentity, normalizeStrategicWorkItemId } from "../../domain/mission/work-item-identity";
import { sanitizeRoundPreview, sanitizeRoundTitle } from "../../application/mission/history/round-history";
import type { RequirementExecutionOverview } from "./requirement-overview";
import { isParticipantCompletedStatus } from "./requirement-kind";
import { parseAgentIdFromSessionKey } from "../../lib/sessions";
import {
  resolveRequirementLifecyclePhase,
  resolveRequirementStageGateStatus,
} from "./requirement-lifecycle";

export {
  buildStableStrategicTopicKey,
  buildWorkItemIdentity,
  deriveWorkKeyFromWorkItemId,
  normalizeProductWorkItemIdentity,
  normalizeStrategicRoundId,
  normalizeStrategicWorkItemId,
  resolveStableWorkItemTitle,
} from "../../domain/mission/work-item-identity";
export {
  deriveWorkItemFlowFromDispatches,
  pickLatestRelevantDispatch,
} from "../../domain/delegation/dispatch-reply";

function resolveWorkItemSourceActorId(input: {
  sourceActorId?: string | null;
  legacySourceSessionKey?: string | null;
  ownerActorId?: string | null;
}): string | null {
  return (
    input.sourceActorId?.trim() ||
    // Compatibility-only migration from legacy mission/session inputs.
    parseAgentIdFromSessionKey(input.legacySourceSessionKey ?? "") ||
    input.ownerActorId?.trim() ||
    null
  );
}

function resolveWorkItemSourceActorLabel(input: {
  sourceActorLabel?: string | null;
  ownerLabel?: string | null;
}): string | null {
  return input.sourceActorLabel?.trim() || input.ownerLabel?.trim() || null;
}

function buildWorkItemDisplayFields(input: {
  title: string;
  stageLabel: string;
  summary: string;
  ownerLabel: string;
  nextAction: string;
  status: WorkItemRecord["status"];
  lifecyclePhase: WorkItemRecord["lifecyclePhase"];
  stageGateStatus: WorkItemRecord["stageGateStatus"];
}): Pick<
  WorkItemRecord,
  "headline" | "displayStage" | "displaySummary" | "displayOwnerLabel" | "displayNextAction"
> {
  const displayStage =
    input.lifecyclePhase === "pre_requirement"
      ? input.stageGateStatus === "waiting_confirmation"
        ? "待确认启动"
        : "需求已固化"
      : input.stageLabel || (input.status === "completed" ? "已完成" : "进行中");
  const displaySummary =
    input.lifecyclePhase === "pre_requirement"
      ? input.summary || "CEO 已经把这条主线固化，可以先进入需求房补充细节。"
      : input.summary || input.nextAction || input.stageLabel || input.title;
  const displayNextAction =
    input.lifecyclePhase === "pre_requirement"
      ? input.stageGateStatus === "waiting_confirmation"
        ? "进入需求房补充、澄清或确认后再启动执行。"
        : input.nextAction || "先在需求房补充和明确主线。"
      : input.nextAction || input.stageLabel || "继续推进当前工作项。";
  return {
    headline: input.title,
    displayStage,
    displaySummary,
    displayOwnerLabel: input.ownerLabel || "当前负责人",
    displayNextAction,
  };
}

type WorkItemDisplayBackfillInput = Omit<
  WorkItemRecord,
  | "headline"
  | "displayStage"
  | "displaySummary"
  | "displayOwnerLabel"
  | "displayNextAction"
  | "lifecyclePhase"
  | "stageGateStatus"
> &
  Partial<
    Pick<
      WorkItemRecord,
      | "headline"
      | "displayStage"
      | "displaySummary"
      | "displayOwnerLabel"
      | "displayNextAction"
      | "lifecyclePhase"
      | "stageGateStatus"
    >
  >;

export function applyWorkItemDisplayFields(
  workItem: WorkItemDisplayBackfillInput,
): WorkItemRecord {
  const lifecyclePhase = workItem.lifecyclePhase ?? "active_requirement";
  const stageGateStatus = workItem.stageGateStatus ?? "none";
  return {
    ...workItem,
    lifecyclePhase,
    stageGateStatus,
    ...buildWorkItemDisplayFields({
      title: workItem.title,
      stageLabel: workItem.stageLabel,
      summary: workItem.summary || workItem.goal,
      ownerLabel: workItem.ownerLabel,
      nextAction: workItem.nextAction,
      status: workItem.status,
      lifecyclePhase,
      stageGateStatus,
    }),
  };
}

function normalizeWorkItemStatus(
  mission: ConversationMissionRecord,
): WorkItemRecord["status"] {
  if (mission.completed) {
    return "completed";
  }
  if (
    mission.lifecyclePhase === "pre_requirement" &&
    mission.stageGateStatus === "waiting_confirmation"
  ) {
    return "waiting_review";
  }
  if (mission.lifecyclePhase === "pre_requirement") {
    return "draft";
  }

  const normalized = mission.statusLabel.trim().toLowerCase();
  if (normalized.includes("确认")) {
    return "waiting_review";
  }
  if (normalized.includes("收口") || normalized.includes("汇总")) {
    return "waiting_owner";
  }
  if (normalized.includes("阻塞") || normalized.includes("卡")) {
    return "blocked";
  }
  return "active";
}

function toWorkStepRecord(
  step: ConversationMissionStepRecord,
  updatedAt: number,
): WorkStepRecord {
  return {
    id: step.id,
    title: step.title,
    assigneeActorId: step.assigneeAgentId ?? null,
    assigneeLabel: step.assigneeLabel,
    status:
      step.status === "done" ? "done" : step.status === "wip" ? "active" : "pending",
    completionCriteria: step.detail ?? null,
    detail: step.detail ?? null,
    updatedAt,
  };
}

export function buildWorkItemRecordFromMission(input: {
  companyId: string;
  mission: ConversationMissionRecord;
  room?: RequirementRoomRecord | null;
}): WorkItemRecord {
  const { companyId, mission, room } = input;
  const steps = mission.planSteps.map((step) => toWorkStepRecord(step, mission.updatedAt));
  const batonActorId = mission.nextAgentId ?? mission.ownerAgentId ?? null;
  const batonLabel = mission.nextLabel || mission.ownerLabel;
  const completedAt = mission.completed ? mission.updatedAt : null;
  const stageGateStatus = resolveRequirementStageGateStatus({
    explicitStageGateStatus: mission.stageGateStatus,
    promotionState: mission.promotionState,
    completed: mission.completed,
  });
  const lifecyclePhase = resolveRequirementLifecyclePhase({
    explicitLifecyclePhase: mission.lifecyclePhase,
    stageGateStatus,
    promotionState: mission.promotionState,
    workItemStatus: normalizeWorkItemStatus(mission),
    completed: mission.completed,
    hasExecutionSignal: mission.planSteps.some((step) => step.status !== "pending"),
  });
  const identity = buildWorkItemIdentity({
    topicKey: mission.topicKey,
    title: mission.title,
    fallbackId: mission.id,
    startedAt: mission.startedAt ?? null,
    updatedAt: mission.updatedAt,
  });
  return applyWorkItemDisplayFields({
    id: identity.id,
    workKey: identity.workKey,
    kind: identity.kind,
    roundId: identity.roundId,
    companyId,
    sessionKey: mission.sessionKey,
    topicKey: identity.topicKey ?? mission.topicKey,
    sourceActorId: resolveWorkItemSourceActorId({
      legacySourceSessionKey: mission.sessionKey,
      ownerActorId: mission.ownerAgentId,
    }),
    sourceActorLabel: resolveWorkItemSourceActorLabel({
      ownerLabel: mission.ownerLabel,
    }),
    sourceSessionKey: mission.sessionKey,
    sourceConversationId: mission.sessionKey,
    providerId: null,
    title: mission.title,
    goal: mission.summary,
    status: normalizeWorkItemStatus(mission),
    lifecyclePhase,
    stageGateStatus,
    stageLabel: mission.currentStepLabel,
    ownerActorId: mission.ownerAgentId ?? null,
    ownerLabel: mission.ownerLabel,
    batonActorId,
    batonLabel,
    roomId: room?.id ?? mission.roomId ?? null,
    artifactIds: [],
    dispatchIds: [],
    startedAt: mission.startedAt ?? mission.updatedAt,
    updatedAt: mission.updatedAt,
    completedAt,
    summary: mission.summary,
    nextAction: mission.guidance || mission.nextLabel,
    steps,
    sourceMissionId: mission.id,
  });
}

function normalizeWorkItemStatusFromOverview(
  overview: RequirementExecutionOverview,
): WorkItemRecord["status"] {
  const combined = `${overview.headline} ${overview.currentStage} ${overview.summary}`.toLowerCase();
  if (
    overview.participants.length > 0 &&
    overview.participants.every((participant) =>
      isParticipantCompletedStatus(participant.statusLabel),
    )
  ) {
    return "completed";
  }
  if (combined.includes("阻塞") || combined.includes("卡住")) {
    return "blocked";
  }
  if (combined.includes("整合") || combined.includes("收口") || combined.includes("交付老板")) {
    return "waiting_owner";
  }
  if (combined.includes("确认") || combined.includes("审阅")) {
    return "waiting_review";
  }
  return "active";
}

export function buildWorkItemRecordFromRequirementOverview(input: {
  companyId: string;
  overview: RequirementExecutionOverview;
  roomId?: string | null;
  ownerSessionKey?: string | null;
}): WorkItemRecord {
  const { companyId, overview, roomId, ownerSessionKey } = input;
  const status = normalizeWorkItemStatusFromOverview(overview);
  const stageGateStatus = resolveRequirementStageGateStatus({
    explicitStageGateStatus:
      /确认|审阅/.test(`${overview.currentStage} ${overview.nextAction}`) ? "waiting_confirmation" : "none",
    completed:
      overview.participants.length > 0 &&
      overview.participants.every((participant) =>
        isParticipantCompletedStatus(participant.statusLabel),
      ),
  });
  const lifecyclePhase = resolveRequirementLifecyclePhase({
    stageGateStatus,
    workItemStatus: status,
    hasExecutionSignal:
      status !== "draft" ||
      overview.participants.some((participant) => participant.isCurrent),
  });
  const identity = buildWorkItemIdentity({
    topicKey: overview.topicKey,
    title: overview.title,
    fallbackId: `topic:${overview.topicKey}@${overview.startedAt}`,
    startedAt: overview.startedAt,
  });
  return applyWorkItemDisplayFields({
    id: identity.id,
    workKey: identity.workKey,
    kind: identity.kind,
    roundId: identity.roundId,
    companyId,
    sessionKey: ownerSessionKey ?? undefined,
    topicKey: identity.topicKey ?? overview.topicKey,
    sourceActorId: resolveWorkItemSourceActorId({
      legacySourceSessionKey: ownerSessionKey,
      ownerActorId: overview.currentOwnerAgentId,
    }),
    sourceActorLabel: resolveWorkItemSourceActorLabel({
      ownerLabel: overview.currentOwnerLabel,
    }),
    sourceSessionKey: ownerSessionKey ?? null,
    sourceConversationId: ownerSessionKey ?? null,
    providerId: null,
    title: overview.title,
    goal: overview.summary,
    status,
    lifecyclePhase,
    stageGateStatus,
    stageLabel: overview.currentStage,
    ownerActorId: overview.currentOwnerAgentId ?? null,
    ownerLabel: overview.currentOwnerLabel || "当前负责人",
    batonActorId: overview.currentOwnerAgentId ?? null,
    batonLabel: overview.currentOwnerLabel || "当前负责人",
    roomId: roomId ?? null,
    artifactIds: [],
    dispatchIds: [],
    startedAt: overview.startedAt,
    updatedAt: Math.max(
      overview.startedAt,
      ...overview.participants.map((participant) => participant.updatedAt),
    ),
    completedAt:
      overview.participants.length > 0 &&
      overview.participants.every((participant) =>
        isParticipantCompletedStatus(participant.statusLabel),
      )
        ? Math.max(...overview.participants.map((participant) => participant.updatedAt))
        : null,
    summary: overview.summary,
    nextAction: overview.nextAction,
    steps: overview.participants.map((participant) => ({
      id: `${overview.topicKey}:${participant.agentId}`,
      title: participant.stage,
      assigneeActorId: participant.agentId,
      assigneeLabel: participant.nickname,
      status:
        isParticipantCompletedStatus(participant.statusLabel)
          ? "done"
          : participant.isCurrent
            ? "active"
            : participant.isBlocking
              ? "blocked"
              : "pending",
      completionCriteria: participant.detail,
      detail: participant.detail,
      updatedAt: participant.updatedAt,
    })),
  });
}

function matchesWorkItemTopic(item: WorkItemRecord, topicKey: string | null | undefined): boolean {
  return Boolean(topicKey) && item.topicKey === topicKey;
}

function matchesWorkItemRound(item: WorkItemRecord, startedAt: number | null | undefined): boolean {
  if (!startedAt || !item.startedAt) {
    return false;
  }
  return item.startedAt >= startedAt - 1_000;
}

function scoreWorkItemMatch(input: {
  item: WorkItemRecord;
  sessionKey?: string | null;
  roomId?: string | null;
  topicKey?: string | null;
  startedAt?: number | null;
}): number {
  const { item, roomId, sessionKey, topicKey, startedAt } = input;
  let score = 0;
  if (matchesWorkItemTopic(item, topicKey)) {
    score += 100;
  }
  if (matchesWorkItemRound(item, startedAt)) {
    score += 60;
  }
  if (roomId && item.roomId === roomId) {
    score += 40;
  }
  if (sessionKey && item.sourceConversationId === sessionKey) {
    score += 30;
  }
  if (sessionKey && item.sessionKey === sessionKey) {
    score += 20;
  }
  if (item.status !== "completed" && item.status !== "archived") {
    score += 5;
  }
  return score;
}

export function matchesWorkItemSourceActor(
  item: WorkItemRecord,
  actorId: string | null | undefined,
): boolean {
  if (!actorId) {
    return false;
  }
  if (item.sourceActorId === actorId) {
    return true;
  }
  if (item.ownerActorId === actorId && !item.sourceActorId) {
    return true;
  }
  return false;
}

export function pickWorkItemRecord(input: {
  items: WorkItemRecord[];
  sessionKey?: string | null;
  roomId?: string | null;
  topicKey?: string | null;
  startedAt?: number | null;
}): WorkItemRecord | null {
  const { items, roomId, sessionKey, topicKey, startedAt } = input;
  if (items.length === 0) {
    return null;
  }

  const ranked = [...items]
    .map((item) => ({
      item,
      score: scoreWorkItemMatch({
        item,
        roomId,
        sessionKey,
        topicKey,
        startedAt,
      }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return right.item.updatedAt - left.item.updatedAt;
    });

  if (ranked.length > 0) {
    return ranked[0]?.item ?? null;
  }
  return null;
}

export function pickConversationScopedWorkItem(input: {
  items: WorkItemRecord[];
  conversationStates: ConversationStateRecord[];
  actorId?: string | null;
}): WorkItemRecord | null {
  const { items, conversationStates, actorId } = input;
  if (items.length === 0 || conversationStates.length === 0) {
    return null;
  }

  const itemsById = new Map(items.map((item) => [item.id, item] as const));
  const itemsByWorkKey = new Map(items.map((item) => [item.workKey, item] as const));
  const sortedStates = [...conversationStates].sort((left, right) => right.updatedAt - left.updatedAt);

  for (const state of sortedStates) {
    const matched =
      (state.currentWorkItemId ? itemsById.get(state.currentWorkItemId) : null) ??
      (state.currentWorkKey ? itemsByWorkKey.get(state.currentWorkKey) : null) ??
      null;
    if (!matched) {
      continue;
    }
    if (
      actorId &&
      !matchesWorkItemSourceActor(matched, actorId) &&
      matched.ownerActorId !== actorId &&
      matched.batonActorId !== actorId
    ) {
      continue;
    }
    if (matched.status === "completed" || matched.status === "archived") {
      continue;
    }
    return matched;
  }

  return null;
}

export function buildRoomRecordIdFromWorkItem(workItemId: string): string {
  return `workitem:${normalizeStrategicWorkItemId(workItemId) ?? workItemId}`;
}

export function isRoomBackedWorkItem(item: WorkItemRecord): boolean {
  return typeof item.roomId === "string" && item.roomId.trim().length > 0;
}

export function buildRoundRecord(input: {
  companyId: string;
  title: string;
  preview?: string | null;
  reason?: RoundRecord["reason"];
  workItemId?: string | null;
  roomId?: string | null;
  sourceActorId?: string | null;
  sourceActorLabel?: string | null;
  sourceSessionKey?: string | null;
  sourceConversationId?: string | null;
  providerArchiveId?: string | null;
  providerId?: string | null;
  messages?: RoundMessageSnapshot[];
  archivedAt?: number;
  restorable?: boolean;
}): RoundRecord {
  const archivedAt = input.archivedAt ?? Date.now();
  const normalizedTitle = sanitizeRoundTitle(input.title) || "已归档轮次";
  const normalizedPreview = sanitizeRoundPreview(input.preview);
  const roundIdentity =
    input.workItemId ??
    input.roomId ??
    input.sourceActorId ??
    input.sourceConversationId ??
    input.sourceSessionKey ??
    normalizedTitle;
  return {
    id: `${roundIdentity}@${Math.floor(archivedAt)}`,
    companyId: input.companyId,
    workItemId: input.workItemId ?? null,
    roomId: input.roomId ?? null,
    title: normalizedTitle,
    preview: normalizedPreview,
    reason: input.reason ?? "product",
    sourceActorId: input.sourceActorId ?? null,
    sourceActorLabel: input.sourceActorLabel ?? null,
    sourceSessionKey: input.sourceSessionKey ?? null,
    sourceConversationId: input.sourceConversationId ?? input.sourceSessionKey ?? null,
    providerArchiveId: input.providerArchiveId ?? null,
    providerId: input.providerId ?? null,
    messages: input.messages ?? [],
    archivedAt,
    restorable: input.restorable ?? true,
  };
}

export function touchWorkItemArtifacts(
  workItem: WorkItemRecord,
  artifacts: ArtifactRecord[],
): WorkItemRecord {
  return applyWorkItemDisplayFields({
    ...workItem,
    artifactIds: [...new Set(artifacts.map((artifact) => artifact.id))],
    updatedAt: Math.max(workItem.updatedAt, ...artifacts.map((artifact) => artifact.updatedAt)),
  });
}

export function touchWorkItemDispatches(
  workItem: WorkItemRecord,
  dispatches: DispatchRecord[],
): WorkItemRecord {
  return applyWorkItemDisplayFields({
    ...workItem,
    dispatchIds: [...new Set(dispatches.map((dispatch) => dispatch.id))],
    updatedAt: Math.max(workItem.updatedAt, ...dispatches.map((dispatch) => dispatch.updatedAt)),
  });
}
