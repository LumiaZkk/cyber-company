import type {
  ArtifactRecord,
  ConversationMissionRecord,
  DispatchRecord,
  RequirementRoomRecord,
  WorkItemRecord,
  WorkStepRecord,
} from "../company/types";
import type { RequirementExecutionOverview } from "./requirement-overview";
import {
  applyWorkItemDisplayFields,
  buildRoomRecordIdFromWorkItem,
  buildWorkItemRecordFromMission,
  buildWorkItemRecordFromRequirementOverview,
  deriveWorkItemFlowFromDispatches,
  resolveStableWorkItemTitle,
  touchWorkItemArtifacts,
  touchWorkItemDispatches,
} from "./work-item";

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function buildWorkItemArtifactNeedles(workItem: WorkItemRecord): string[] {
  return [workItem.topicKey, workItem.title, workItem.goal, workItem.summary]
    .map(normalizeText)
    .filter((value) => value.length > 2);
}

function matchesArtifactToWorkItem(artifact: ArtifactRecord, workItem: WorkItemRecord): boolean {
  if (artifact.workItemId && artifact.workItemId === workItem.id) {
    return true;
  }

  const haystack = [
    artifact.title,
    artifact.kind,
    artifact.sourcePath,
    artifact.sourceUrl,
    artifact.summary,
  ]
    .map(normalizeText)
    .join(" ");
  if (!haystack) {
    return false;
  }

  return buildWorkItemArtifactNeedles(workItem).some((needle) => haystack.includes(needle));
}

function matchesDispatchToWorkItem(dispatch: DispatchRecord, workItem: WorkItemRecord): boolean {
  if (dispatch.workItemId === workItem.id) {
    return true;
  }
  if (dispatch.topicKey && workItem.topicKey && dispatch.topicKey === workItem.topicKey) {
    return true;
  }
  return false;
}

function mergeWorkItemSteps(
  existingSteps: WorkStepRecord[],
  incomingSteps: WorkStepRecord[],
): WorkStepRecord[] {
  if (incomingSteps.length === 0) {
    return existingSteps;
  }

  const merged = new Map<string, WorkStepRecord>();
  for (const step of existingSteps) {
    merged.set(step.id, step);
  }
  for (const step of incomingSteps) {
    const previous = merged.get(step.id);
    merged.set(
      step.id,
      previous && previous.updatedAt > step.updatedAt
        ? {
            ...step,
            ...previous,
            title: step.title || previous.title,
            assigneeActorId: step.assigneeActorId ?? previous.assigneeActorId,
            assigneeLabel: step.assigneeLabel || previous.assigneeLabel,
            completionCriteria: step.completionCriteria ?? previous.completionCriteria,
            detail: step.detail ?? previous.detail,
          }
        : step,
    );
  }
  return [...merged.values()].sort((left, right) => left.updatedAt - right.updatedAt);
}

function areWorkItemsOnSameMainline(
  existingWorkItem: WorkItemRecord | null | undefined,
  candidate: WorkItemRecord | null | undefined,
): boolean {
  if (!existingWorkItem || !candidate) {
    return false;
  }
  if (existingWorkItem.id === candidate.id) {
    return true;
  }
  if (existingWorkItem.workKey && candidate.workKey && existingWorkItem.workKey === candidate.workKey) {
    return true;
  }
  if (
    existingWorkItem.kind === candidate.kind &&
    existingWorkItem.topicKey &&
    candidate.topicKey &&
    existingWorkItem.topicKey === candidate.topicKey
  ) {
    return true;
  }
  return false;
}

function resolveCompletedAt(
  status: WorkItemRecord["status"],
  mergedSteps: WorkStepRecord[],
  existingCompletedAt?: number | null,
  updatedAt?: number,
): number | null {
  if (status === "completed" || (mergedSteps.length > 0 && mergedSteps.every((step) => step.status === "done"))) {
    return existingCompletedAt ?? updatedAt ?? Date.now();
  }
  return null;
}

function deriveWorkItemFlowFromRoom(input: {
  workItem: WorkItemRecord;
  room: RequirementRoomRecord;
  dispatches: DispatchRecord[];
}): Pick<
  WorkItemRecord,
  "status" | "stageLabel" | "batonActorId" | "batonLabel" | "nextAction" | "summary" | "updatedAt"
> | null {
  const { workItem, room, dispatches } = input;
  if (!room.lastConclusionAt) {
    return null;
  }

  const latestDispatchAt =
    dispatches.reduce((latest, dispatch) => Math.max(latest, dispatch.updatedAt), 0) || 0;
  if (latestDispatchAt > room.lastConclusionAt) {
    return null;
  }

  const ownerActorId = room.ownerActorId ?? workItem.ownerActorId ?? null;
  const ownerLabel = workItem.ownerLabel || workItem.displayOwnerLabel || "负责人";
  const roomProgress = room.progress?.trim();
  const summary = roomProgress
    ? `${roomProgress}，等待 ${ownerLabel} 收口。`
    : `团队成员已经给出结论反馈，等待 ${ownerLabel} 收口。`;

  return {
    status: workItem.completedAt ? "completed" : "waiting_owner",
    stageLabel: "团队回执已到齐",
    batonActorId: ownerActorId,
    batonLabel: ownerLabel,
    nextAction: `${ownerLabel} 收口并决定下一步。`,
    summary,
    updatedAt: Math.max(workItem.updatedAt, room.lastConclusionAt),
  };
}

type ReconcileWorkItemInput = {
  companyId: string;
  existingWorkItem?: WorkItemRecord | null;
  mission?: ConversationMissionRecord | null;
  overview?: RequirementExecutionOverview | null;
  room?: RequirementRoomRecord | null;
  artifacts?: ArtifactRecord[];
  dispatches?: DispatchRecord[];
  fallbackSessionKey?: string | null;
  fallbackRoomId?: string | null;
};

function extractRoundAnchor(roundId: string | null | undefined): string | null {
  const normalized = roundId?.trim() ?? "";
  if (!normalized) {
    return null;
  }
  const separatorIndex = normalized.lastIndexOf("@");
  if (separatorIndex < 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }
  return normalized.slice(separatorIndex + 1);
}

export function reconcileWorkItemRecord(input: ReconcileWorkItemInput): WorkItemRecord | null {
  const { companyId, existingWorkItem, mission, overview, room } = input;
  const candidate =
    mission
      ? buildWorkItemRecordFromMission({
          companyId,
          mission,
          room,
        })
      : overview
        ? buildWorkItemRecordFromRequirementOverview({
            companyId,
            overview,
            roomId: room?.id ?? input.fallbackRoomId ?? existingWorkItem?.roomId ?? null,
            ownerSessionKey: input.fallbackSessionKey ?? existingWorkItem?.sessionKey ?? null,
          })
        : existingWorkItem ?? null;

  if (!candidate) {
    return null;
  }

  const mergedSteps = mergeWorkItemSteps(existingWorkItem?.steps ?? [], candidate.steps ?? []);
  const sameMainline = areWorkItemsOnSameMainline(existingWorkItem, candidate);
  const stableTitle = sameMainline
    ? resolveStableWorkItemTitle({
        existingTitle: existingWorkItem?.title,
        candidateTitle: candidate.title,
        kind: candidate.kind,
      })
    : candidate.title;
  const preserveStrategicIdentity = Boolean(
    existingWorkItem &&
      existingWorkItem.kind === "strategic" &&
      candidate.kind === "strategic" &&
      existingWorkItem.workKey &&
      sameMainline,
  );
  const stableWorkKey = preserveStrategicIdentity
    ? existingWorkItem?.workKey ?? candidate.workKey
    : candidate.workKey;
  const stableId = preserveStrategicIdentity
    ? existingWorkItem?.id ?? candidate.id
    : candidate.id;
  const stableTopicKey = preserveStrategicIdentity
    ? existingWorkItem?.topicKey ?? candidate.topicKey
    : candidate.topicKey ?? existingWorkItem?.topicKey;
  const resolvedRoundAnchor =
    extractRoundAnchor(candidate.roundId) ??
    extractRoundAnchor(existingWorkItem?.roundId) ??
    String(Math.floor(candidate.updatedAt || candidate.startedAt || Date.now()));
  const stableRoundId =
    candidate.kind === "strategic"
      ? `${stableWorkKey}@${resolvedRoundAnchor}`
      : candidate.roundId ?? existingWorkItem?.roundId ?? `${stableWorkKey}@${resolvedRoundAnchor}`;
  const merged: WorkItemRecord = {
    ...(sameMainline ? existingWorkItem : null),
    ...candidate,
    companyId,
    id: stableId,
    workKey: stableWorkKey,
    roundId: stableRoundId,
    title: stableTitle,
    sessionKey: candidate.sessionKey ?? existingWorkItem?.sessionKey ?? input.fallbackSessionKey ?? undefined,
    topicKey: stableTopicKey,
    sourceActorId:
      candidate.sourceActorId ??
      existingWorkItem?.sourceActorId ??
      candidate.ownerActorId ??
      existingWorkItem?.ownerActorId ??
      null,
    sourceActorLabel:
      candidate.sourceActorLabel ??
      existingWorkItem?.sourceActorLabel ??
      candidate.ownerLabel ??
      existingWorkItem?.ownerLabel ??
      null,
    sourceSessionKey:
      candidate.sourceSessionKey ??
      existingWorkItem?.sourceSessionKey ??
      candidate.sessionKey ??
      existingWorkItem?.sessionKey ??
      input.fallbackSessionKey ??
      null,
    sourceConversationId:
      candidate.sourceConversationId ??
      existingWorkItem?.sourceConversationId ??
      candidate.sessionKey ??
      existingWorkItem?.sessionKey ??
      input.fallbackSessionKey ??
      null,
    providerId: candidate.providerId ?? existingWorkItem?.providerId ?? null,
    roomId:
      room?.id ??
      candidate.roomId ??
      input.fallbackRoomId ??
      existingWorkItem?.roomId ??
      buildRoomRecordIdFromWorkItem(stableId),
    ownerActorId: candidate.ownerActorId ?? existingWorkItem?.ownerActorId ?? null,
    ownerLabel: candidate.ownerLabel || existingWorkItem?.ownerLabel || "当前负责人",
    batonActorId:
      candidate.batonActorId ??
      existingWorkItem?.batonActorId ??
      candidate.ownerActorId ??
      existingWorkItem?.ownerActorId ??
      null,
    batonLabel:
      candidate.batonLabel ||
      existingWorkItem?.batonLabel ||
      candidate.ownerLabel ||
      existingWorkItem?.ownerLabel ||
      "当前负责人",
    startedAt: sameMainline ? (existingWorkItem?.startedAt ?? candidate.startedAt) : candidate.startedAt,
    updatedAt: Math.max(
      sameMainline ? (existingWorkItem?.updatedAt ?? 0) : 0,
      candidate.updatedAt,
      room?.updatedAt ?? 0,
    ),
    summary: candidate.summary || existingWorkItem?.summary || candidate.goal,
    nextAction: candidate.nextAction || existingWorkItem?.nextAction || candidate.stageLabel,
    steps: mergedSteps,
    artifactIds: sameMainline ? (existingWorkItem?.artifactIds ?? candidate.artifactIds ?? []) : (candidate.artifactIds ?? []),
    dispatchIds: sameMainline ? (existingWorkItem?.dispatchIds ?? candidate.dispatchIds ?? []) : (candidate.dispatchIds ?? []),
  };

  const matchedArtifacts = (input.artifacts ?? []).filter((artifact) =>
    matchesArtifactToWorkItem(artifact, merged),
  );
  const matchedDispatches = (input.dispatches ?? []).filter((dispatch) =>
    matchesDispatchToWorkItem(dispatch, merged),
  );

  let reconciled = merged;
  if (matchedArtifacts.length > 0) {
    reconciled = touchWorkItemArtifacts(reconciled, matchedArtifacts);
  }
  if (matchedDispatches.length > 0) {
    reconciled = touchWorkItemDispatches(reconciled, matchedDispatches);
  }

  const dispatchFlow = deriveWorkItemFlowFromDispatches(reconciled, matchedDispatches);
  if (dispatchFlow) {
    reconciled = {
      ...reconciled,
      ...dispatchFlow,
    };
  }

  if (room) {
    const roomFlow = deriveWorkItemFlowFromRoom({
      workItem: reconciled,
      room,
      dispatches: matchedDispatches,
    });
    if (roomFlow) {
      reconciled = {
        ...reconciled,
        ...roomFlow,
      };
    }
  }

  const resolvedCompletedAt = resolveCompletedAt(
    reconciled.status,
    reconciled.steps,
    sameMainline ? (existingWorkItem?.completedAt ?? candidate.completedAt ?? null) : (candidate.completedAt ?? null),
    reconciled.updatedAt,
  );
  return applyWorkItemDisplayFields({
    ...reconciled,
    completedAt: resolvedCompletedAt,
  });
}
