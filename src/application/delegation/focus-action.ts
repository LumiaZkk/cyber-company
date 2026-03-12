import { gateway, startTurnToCompanyActor, type ProviderManifest } from "../gateway";
import { enqueueDelegationDispatch } from "./async-dispatch";
import type { DispatchRecord } from "../../domain/delegation/types";
import type { Company } from "../../domain/org/types";

export type ChatFocusCommand = {
  id: string;
  label: string;
  description: string;
  targetAgentId?: string;
  followupTargetAgentId?: string;
  followupTargetLabel?: string;
  message?: string;
};

export type ExecutedFocusAction = {
  actionTrackingId: string;
  providerRunId: string | null;
  dispatchId: string | null;
  resolvedSessionKey: string;
  runtimeTargetAgentId: string | null;
  dispatchRecord: DispatchRecord | null;
};

export async function executeChatFocusAction(input: {
  action: ChatFocusCommand;
  company: Company | null;
  providerManifest: ProviderManifest;
  sessionKey: string | null;
  targetAgentId: string | null;
  currentWorkItemId: string | null;
  currentTopicKey?: string | null;
}): Promise<ExecutedFocusAction> {
  if (!input.action.message) {
    throw new Error("缺少可发送的动作消息");
  }

  const actionStartedAt = Date.now();
  const actionTrackingId = `focus:${input.action.id}:${actionStartedAt}`;
  const runtimeTargetAgentId = input.action.targetAgentId ?? input.targetAgentId ?? null;
  let resolvedSessionKey = input.sessionKey;
  let providerRunId: string | null = null;
  let dispatchId: string | null = null;
  let dispatchRecord: DispatchRecord | null = null;

  if (runtimeTargetAgentId && input.company && input.currentWorkItemId) {
    dispatchId = `dispatch:${input.currentWorkItemId}:focus:${runtimeTargetAgentId}:${actionStartedAt}`;
    const enqueued = await enqueueDelegationDispatch({
      backend: gateway,
      manifest: input.providerManifest,
      company: input.company,
      actorId: runtimeTargetAgentId,
      dispatchId,
      workItemId: input.currentWorkItemId,
      title: input.action.label,
      message: input.action.message,
      summary: input.action.description,
      fromActorId: input.targetAgentId ?? "unknown",
      targetActorIds: [runtimeTargetAgentId],
      topicKey: input.currentTopicKey,
      createdAt: actionStartedAt,
    });
    resolvedSessionKey = enqueued.providerConversationRef.conversationId;
    dispatchRecord = enqueued.dispatch;
  } else if (runtimeTargetAgentId && input.company) {
    const prepared = await startTurnToCompanyActor({
      backend: gateway,
      manifest: input.providerManifest,
      company: input.company,
      actorId: runtimeTargetAgentId,
      message: input.action.message,
      timeoutMs: 300_000,
    });
    resolvedSessionKey = prepared.providerConversationRef.conversationId;
    void prepared.send.catch((error) => {
      console.error("Failed to send focus action asynchronously", error);
    });
  } else if (input.sessionKey) {
    const ack = await gateway.sendChatMessage(input.sessionKey, input.action.message, { timeoutMs: 300_000 });
    resolvedSessionKey = input.sessionKey;
    providerRunId = ack.runId;
  }

  if (!resolvedSessionKey) {
    throw new Error("未找到可发送的目标会话");
  }

  return {
    actionTrackingId,
    providerRunId,
    dispatchId,
    resolvedSessionKey,
    runtimeTargetAgentId,
    dispatchRecord,
  };
}
