import type {
  ArtifactRecord,
  ConversationMissionRecord,
  ConversationMissionStepRecord,
  DispatchRecord,
  RequirementRoomRecord,
  RoundMessageSnapshot,
  RoundRecord,
  WorkItemRecord,
  WorkStepRecord,
} from "../company/types";
import type { RequirementExecutionOverview } from "./requirement-overview";
import { isParticipantCompletedStatus } from "./requirement-kind";

function normalizeWorkItemStatus(
  mission: ConversationMissionRecord,
): WorkItemRecord["status"] {
  if (mission.completed) {
    return "completed";
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

function toWorkStepRecord(step: ConversationMissionStepRecord): WorkStepRecord {
  return {
    id: step.id,
    title: step.title,
    assigneeActorId: step.assigneeAgentId ?? null,
    assigneeLabel: step.assigneeLabel,
    status:
      step.status === "done" ? "done" : step.status === "wip" ? "active" : "pending",
    completionCriteria: step.detail ?? null,
    detail: step.detail ?? null,
    updatedAt: Date.now(),
  };
}

export function buildWorkItemRecordFromMission(input: {
  companyId: string;
  mission: ConversationMissionRecord;
  room?: RequirementRoomRecord | null;
}): WorkItemRecord {
  const { companyId, mission, room } = input;
  const steps = mission.planSteps.map(toWorkStepRecord);
  const batonActorId = mission.nextAgentId ?? mission.ownerAgentId ?? null;
  const batonLabel = mission.nextLabel || mission.ownerLabel;
  const completedAt = mission.completed ? mission.updatedAt : null;
  return {
    id: mission.id,
    companyId,
    sessionKey: mission.sessionKey,
    topicKey: mission.topicKey,
    title: mission.title,
    goal: mission.summary,
    status: normalizeWorkItemStatus(mission),
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
  };
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
  return {
    id: `topic:${overview.topicKey}@${overview.startedAt}`,
    companyId,
    sessionKey: ownerSessionKey ?? undefined,
    topicKey: overview.topicKey,
    title: overview.title,
    goal: overview.summary,
    status: normalizeWorkItemStatusFromOverview(overview),
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
  };
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
  if (sessionKey && item.sessionKey === sessionKey) {
    score += 20;
  }
  if (item.status !== "completed" && item.status !== "archived") {
    score += 5;
  }
  return score;
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
  return items[0] ?? null;
}

export function buildRoomRecordIdFromWorkItem(workItemId: string): string {
  return `workitem:${workItemId}`;
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
  return {
    id: `${input.workItemId ?? input.sourceSessionKey ?? input.title}@${Math.floor(archivedAt)}`,
    companyId: input.companyId,
    workItemId: input.workItemId ?? null,
    roomId: input.roomId ?? null,
    title: input.title,
    preview: input.preview ?? null,
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
  return {
    ...workItem,
    artifactIds: [...new Set(artifacts.map((artifact) => artifact.id))],
    updatedAt: Math.max(workItem.updatedAt, ...artifacts.map((artifact) => artifact.updatedAt)),
  };
}

export function touchWorkItemDispatches(
  workItem: WorkItemRecord,
  dispatches: DispatchRecord[],
): WorkItemRecord {
  return {
    ...workItem,
    dispatchIds: [...new Set(dispatches.map((dispatch) => dispatch.id))],
    updatedAt: Math.max(workItem.updatedAt, ...dispatches.map((dispatch) => dispatch.updatedAt)),
  };
}

function isDispatchOpenStatus(status: DispatchRecord["status"]): boolean {
  return status === "pending" || status === "sent" || status === "acknowledged";
}

function isDispatchDoneStatus(status: DispatchRecord["status"]): boolean {
  return status === "answered" || status === "superseded";
}

export function pickLatestRelevantDispatch(
  dispatches: DispatchRecord[],
): DispatchRecord | null {
  if (dispatches.length === 0) {
    return null;
  }
  const ranked = [...dispatches].sort((left, right) => right.updatedAt - left.updatedAt);
  return (
    ranked.find((dispatch) => isDispatchOpenStatus(dispatch.status))
    ?? ranked.find((dispatch) => dispatch.status === "blocked")
    ?? ranked.find((dispatch) => isDispatchDoneStatus(dispatch.status))
    ?? ranked[0]
    ?? null
  );
}

export function deriveWorkItemFlowFromDispatches(
  workItem: WorkItemRecord,
  dispatches: DispatchRecord[],
): Pick<
  WorkItemRecord,
  "status" | "batonActorId" | "batonLabel" | "nextAction" | "summary" | "updatedAt"
> | null {
  const latestDispatch = pickLatestRelevantDispatch(dispatches);
  if (!latestDispatch) {
    return null;
  }

  const primaryTarget = latestDispatch.targetActorIds[0] ?? null;
  const targetLabel =
    latestDispatch.targetActorIds.length > 0
      ? latestDispatch.targetActorIds.join("、")
      : workItem.batonLabel || workItem.ownerLabel;

  if (latestDispatch.status === "blocked") {
    return {
      status: "blocked",
      batonActorId: primaryTarget,
      batonLabel: targetLabel,
      nextAction: latestDispatch.summary || latestDispatch.title || workItem.nextAction,
      summary: latestDispatch.summary || workItem.summary,
      updatedAt: Math.max(workItem.updatedAt, latestDispatch.updatedAt),
    };
  }

  if (isDispatchOpenStatus(latestDispatch.status)) {
    return {
      status: workItem.status === "draft" ? "active" : workItem.status,
      batonActorId: primaryTarget,
      batonLabel: targetLabel,
      nextAction: latestDispatch.summary || latestDispatch.title || workItem.nextAction,
      summary:
        latestDispatch.status === "acknowledged"
          ? `${targetLabel} 已接单，等待回复。`
          : `${targetLabel} 正在处理当前派单。`,
      updatedAt: Math.max(workItem.updatedAt, latestDispatch.updatedAt),
    };
  }

  if (latestDispatch.status === "answered") {
    return {
      status: workItem.completedAt ? "completed" : "waiting_owner",
      batonActorId: workItem.ownerActorId ?? null,
      batonLabel: workItem.ownerLabel || "负责人",
      nextAction: "负责人收口并决定下一步。",
      summary: `${targetLabel} 已回传结果，等待负责人收口。`,
      updatedAt: Math.max(workItem.updatedAt, latestDispatch.updatedAt),
    };
  }

  return {
    status: workItem.status,
    batonActorId: workItem.batonActorId ?? primaryTarget,
    batonLabel: workItem.batonLabel || targetLabel,
    nextAction: workItem.nextAction,
    summary: workItem.summary,
    updatedAt: Math.max(workItem.updatedAt, latestDispatch.updatedAt),
  };
}
