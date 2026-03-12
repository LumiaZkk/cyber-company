import type { WorkItemRecord } from "../../domain/mission/types";

function areStringArraysEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  const leftValues = left ?? [];
  const rightValues = right ?? [];
  if (leftValues.length !== rightValues.length) {
    return false;
  }
  return leftValues.every((value, index) => value === rightValues[index]);
}

function areWorkStepRecordsEquivalent(
  left: WorkItemRecord["steps"][number],
  right: WorkItemRecord["steps"][number],
): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    (left.assigneeActorId ?? null) === (right.assigneeActorId ?? null) &&
    left.assigneeLabel === right.assigneeLabel &&
    left.status === right.status &&
    (left.completionCriteria ?? null) === (right.completionCriteria ?? null) &&
    (left.detail ?? null) === (right.detail ?? null)
  );
}

export function areWorkItemRecordsEquivalent(left: WorkItemRecord, right: WorkItemRecord): boolean {
  if (
    left.id !== right.id ||
    left.workKey !== right.workKey ||
    left.kind !== right.kind ||
    left.roundId !== right.roundId ||
    left.companyId !== right.companyId ||
    (left.sessionKey ?? null) !== (right.sessionKey ?? null) ||
    (left.topicKey ?? null) !== (right.topicKey ?? null) ||
    (left.sourceActorId ?? null) !== (right.sourceActorId ?? null) ||
    (left.sourceActorLabel ?? null) !== (right.sourceActorLabel ?? null) ||
    (left.sourceSessionKey ?? null) !== (right.sourceSessionKey ?? null) ||
    (left.sourceConversationId ?? null) !== (right.sourceConversationId ?? null) ||
    (left.providerId ?? null) !== (right.providerId ?? null) ||
    left.title !== right.title ||
    left.goal !== right.goal ||
    left.status !== right.status ||
    left.lifecyclePhase !== right.lifecyclePhase ||
    left.stageGateStatus !== right.stageGateStatus ||
    left.stageLabel !== right.stageLabel ||
    (left.owningDepartmentId ?? null) !== (right.owningDepartmentId ?? null) ||
    (left.executionLevel ?? null) !== (right.executionLevel ?? null) ||
    (left.ownerActorId ?? null) !== (right.ownerActorId ?? null) ||
    left.ownerLabel !== right.ownerLabel ||
    (left.batonActorId ?? null) !== (right.batonActorId ?? null) ||
    left.batonLabel !== right.batonLabel ||
    (left.parentWorkItemId ?? null) !== (right.parentWorkItemId ?? null) ||
    (left.roomId ?? null) !== (right.roomId ?? null) ||
    left.startedAt !== right.startedAt ||
    (left.completedAt ?? null) !== (right.completedAt ?? null) ||
    left.summary !== right.summary ||
    left.nextAction !== right.nextAction ||
    left.headline !== right.headline ||
    left.displayStage !== right.displayStage ||
    left.displaySummary !== right.displaySummary ||
    left.displayOwnerLabel !== right.displayOwnerLabel ||
    left.displayNextAction !== right.displayNextAction
  ) {
    return false;
  }

  if (!areStringArraysEqual(left.artifactIds, right.artifactIds)) {
    return false;
  }
  if (!areStringArraysEqual(left.dispatchIds, right.dispatchIds)) {
    return false;
  }
  if (left.steps.length !== right.steps.length) {
    return false;
  }
  return left.steps.every((step, index) => areWorkStepRecordsEquivalent(step, right.steps[index]!));
}

export function areWorkItemRecordCollectionsEquivalent(
  left: WorkItemRecord[],
  right: WorkItemRecord[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((workItem, index) => {
    const other = right[index];
    return Boolean(other) && areWorkItemRecordsEquivalent(workItem, other);
  });
}
