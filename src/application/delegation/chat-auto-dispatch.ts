import type { AutoDispatchPlan } from "../assignment/dispatch-planning";
import { gateway } from "../gateway";
import type { ProviderManifest } from "../gateway";
import { enqueueDelegationDispatch } from "./async-dispatch";
import type { DispatchRecord } from "../../domain/delegation/types";
import type { Company } from "../../domain/org/types";
import type { FocusProgressEvent } from "../governance/chat-progress";

type ExecuteAutoDispatchInput = {
  company: Company;
  providerManifest: ProviderManifest;
  plan: AutoDispatchPlan;
  fromActorId: string;
  workItemId: string;
  topicKey?: string | null;
  createdAt?: number;
};

type AutoDispatchResult = {
  dispatch: DispatchRecord;
  progressEvent: FocusProgressEvent;
};

export async function executeAutoDispatchPlan(
  input: ExecuteAutoDispatchInput,
): Promise<AutoDispatchResult> {
  const startedAt = input.createdAt ?? Date.now();
  try {
    const enqueued = await enqueueDelegationDispatch({
      backend: gateway,
      company: input.company,
      manifest: input.providerManifest,
      actorId: input.plan.targetAgentId,
      dispatchId: input.plan.dispatchId,
      workItemId: input.workItemId,
      title: input.plan.title,
      message: input.plan.message,
      summary: input.plan.summary,
      fromActorId: input.fromActorId,
      targetActorIds: [input.plan.targetAgentId],
      topicKey: input.topicKey,
      sourceMessageId: input.plan.sourceStepId,
      sourceStepId: input.plan.sourceStepId,
      createdAt: startedAt,
    });

    return {
      dispatch: enqueued.dispatch satisfies DispatchRecord,
      progressEvent: {
        id: `auto-dispatch:${input.plan.dispatchId}`,
        timestamp: startedAt,
        actorLabel: "系统",
        actorAgentId: input.plan.targetAgentId,
        title: `已受理自动派单给 ${input.plan.targetLabel}`,
        summary: `已把当前主线交给 ${input.plan.targetLabel}，正在后台确认投递并等待对方回执。`,
        detail: input.plan.summary,
        tone: "indigo",
        category: "receipt",
        source: "local",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const dispatch: DispatchRecord = {
      id: input.plan.dispatchId,
      workItemId: input.workItemId,
      revision: 1,
      roomId: null,
      title: input.plan.title,
      summary: input.plan.summary,
      fromActorId: input.fromActorId,
      targetActorIds: [input.plan.targetAgentId],
      status: "blocked",
      sourceMessageId: input.plan.sourceStepId,
      topicKey: input.topicKey ?? undefined,
      createdAt: startedAt,
      updatedAt: startedAt,
    };

    return {
      dispatch,
      progressEvent: {
        id: `auto-dispatch-failed:${input.plan.dispatchId}`,
        timestamp: startedAt,
        actorLabel: "系统",
        actorAgentId: input.plan.targetAgentId,
        title: `自动派单失败：${input.plan.targetLabel}`,
        summary: message,
        detail: input.plan.summary,
        tone: "rose",
        category: "receipt",
        source: "local",
      },
    };
  }
}
