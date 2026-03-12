import type { DispatchRecord } from "./types";
import type { WorkItemRecord } from "../mission/types";

function isDispatchOpenStatus(status: DispatchRecord["status"]): boolean {
  return status === "pending" || status === "sent" || status === "acknowledged";
}

function isDispatchDoneStatus(status: DispatchRecord["status"]): boolean {
  return status === "answered" || status === "superseded";
}

function pickLatestDispatchByStatus(
  dispatches: DispatchRecord[],
  predicate: (status: DispatchRecord["status"]) => boolean,
): DispatchRecord | null {
  return (
    [...dispatches]
      .filter((dispatch) => predicate(dispatch.status))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
  );
}

export function pickLatestRelevantDispatch(
  dispatches: DispatchRecord[],
): DispatchRecord | null {
  if (dispatches.length === 0) {
    return null;
  }
  const ranked = [...dispatches].sort((left, right) => right.updatedAt - left.updatedAt);
  return (
    ranked.find((dispatch) => isDispatchOpenStatus(dispatch.status)) ??
    ranked.find((dispatch) => dispatch.status === "blocked") ??
    ranked.find((dispatch) => isDispatchDoneStatus(dispatch.status)) ??
    ranked[0] ??
    null
  );
}

export function deriveWorkItemFlowFromDispatches(
  workItem: WorkItemRecord,
  dispatches: DispatchRecord[],
): Pick<
  WorkItemRecord,
  "status" | "batonActorId" | "batonLabel" | "nextAction" | "summary" | "updatedAt"
> | null {
  const latestOpenDispatch = pickLatestDispatchByStatus(dispatches, isDispatchOpenStatus);
  const latestBlockedDispatch = pickLatestDispatchByStatus(
    dispatches,
    (status) => status === "blocked",
  );
  const latestAnsweredDispatch = pickLatestDispatchByStatus(dispatches, isDispatchDoneStatus);
  const latestDispatch =
    latestBlockedDispatch &&
    (!latestOpenDispatch || latestBlockedDispatch.updatedAt >= latestOpenDispatch.updatedAt) &&
    (!latestAnsweredDispatch || latestBlockedDispatch.updatedAt >= latestAnsweredDispatch.updatedAt)
      ? latestBlockedDispatch
      : latestAnsweredDispatch &&
          (!latestOpenDispatch || latestAnsweredDispatch.updatedAt > latestOpenDispatch.updatedAt)
        ? latestAnsweredDispatch
        : latestOpenDispatch ?? latestAnsweredDispatch ?? latestBlockedDispatch;
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
    const openSummary =
      latestDispatch.status === "acknowledged"
        ? `${targetLabel} 已接单，等待回复。`
        : latestDispatch.deliveryState === "unknown"
          ? `${targetLabel} 的派单投递仍未确认，先等待回执或直接结果。`
          : latestDispatch.deliveryState === "pending"
            ? `${targetLabel} 的派单已受理，正在等待发送。`
            : `${targetLabel} 已派发，等待回执。`;
    return {
      status: workItem.status === "draft" ? "active" : workItem.status,
      batonActorId: primaryTarget,
      batonLabel: targetLabel,
      nextAction: latestDispatch.summary || latestDispatch.title || workItem.nextAction,
      summary: openSummary,
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
