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
  buildRoomRecordIdFromWorkItem,
  buildWorkItemRecordFromMission,
  buildWorkItemRecordFromRequirementOverview,
  deriveWorkItemFlowFromDispatches,
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
  const merged: WorkItemRecord = {
    ...existingWorkItem,
    ...candidate,
    companyId,
    sessionKey: candidate.sessionKey ?? existingWorkItem?.sessionKey ?? input.fallbackSessionKey ?? undefined,
    topicKey: candidate.topicKey ?? existingWorkItem?.topicKey,
    roomId:
      room?.id ??
      candidate.roomId ??
      input.fallbackRoomId ??
      existingWorkItem?.roomId ??
      buildRoomRecordIdFromWorkItem(candidate.id),
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
    startedAt: existingWorkItem?.startedAt ?? candidate.startedAt,
    updatedAt: Math.max(
      existingWorkItem?.updatedAt ?? 0,
      candidate.updatedAt,
      room?.updatedAt ?? 0,
    ),
    summary: candidate.summary || existingWorkItem?.summary || candidate.goal,
    nextAction: candidate.nextAction || existingWorkItem?.nextAction || candidate.stageLabel,
    steps: mergedSteps,
    artifactIds: existingWorkItem?.artifactIds ?? candidate.artifactIds ?? [],
    dispatchIds: existingWorkItem?.dispatchIds ?? candidate.dispatchIds ?? [],
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

  const resolvedCompletedAt = resolveCompletedAt(
    reconciled.status,
    reconciled.steps,
    existingWorkItem?.completedAt ?? candidate.completedAt ?? null,
    reconciled.updatedAt,
  );
  return {
    ...reconciled,
    completedAt: resolvedCompletedAt,
  };
}
