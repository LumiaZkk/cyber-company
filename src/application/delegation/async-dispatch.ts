import type { DispatchRecord } from "../../domain/delegation/types";
import type { Company } from "../../domain/org/types";
import {
  startTurnToCompanyActor,
  type BackendCore,
  type ProviderManifest,
} from "../gateway";
import {
  DISPATCH_TRANSPORT_ACK_WINDOW_MS,
  DISPATCH_TRANSPORT_REQUEST_TIMEOUT_MS,
  buildDelegationDispatchMessage,
  isDeterministicDispatchFailure,
} from "./dispatch-policy";
import {
  recordDispatchBlocked,
  recordDispatchEnqueued,
  recordDispatchSent,
  recordDispatchUnconfirmed,
} from "./closed-loop";

export type EnqueueDelegationDispatchInput = {
  backend: BackendCore;
  manifest: ProviderManifest;
  company: Company | null | undefined;
  actorId: string;
  dispatchId: string;
  workItemId: string;
  title: string;
  message: string;
  summary: string;
  fromActorId: string;
  targetActorIds: string[];
  topicKey?: string | null;
  roomId?: string | null;
  sourceMessageId?: string;
  sourceStepId?: string;
  attachments?: Array<{ type: string; mimeType: string; content: string }>;
  handoff?: boolean;
  createdAt?: number;
};

export type EnqueuedDelegationDispatch = {
  dispatch: DispatchRecord;
  actorRef: Awaited<ReturnType<typeof startTurnToCompanyActor>>["actorRef"];
  conversationRef: Awaited<ReturnType<typeof startTurnToCompanyActor>>["conversationRef"];
  providerConversationRef: Awaited<ReturnType<typeof startTurnToCompanyActor>>["providerConversationRef"];
};

export async function enqueueDelegationDispatch(
  input: EnqueueDelegationDispatchInput,
): Promise<EnqueuedDelegationDispatch> {
  if (!input.company?.id) {
    throw new Error("当前公司上下文未就绪，暂时无法记录派单事件。");
  }

  const createdAt = input.createdAt ?? Date.now();
  const dispatch: DispatchRecord = {
    id: input.dispatchId,
    workItemId: input.workItemId,
    revision: 1,
    roomId: input.roomId ?? null,
    title: input.title,
    summary: input.summary,
    fromActorId: input.fromActorId,
    targetActorIds: [input.actorId],
    status: "pending",
    deliveryState: "pending",
    sourceMessageId: input.sourceMessageId,
    topicKey: input.topicKey ?? undefined,
    createdAt,
    updatedAt: createdAt,
  };

  let prepared: Awaited<ReturnType<typeof startTurnToCompanyActor>>;
  try {
    prepared = await startTurnToCompanyActor({
      backend: input.backend,
      manifest: input.manifest,
      company: input.company,
      actorId: input.actorId,
      message: buildDelegationDispatchMessage(input.message, input.dispatchId),
      timeoutMs: DISPATCH_TRANSPORT_REQUEST_TIMEOUT_MS,
      attachments: input.attachments,
      targetActorIds: input.targetActorIds,
    });
  } catch (error) {
    if (input.company?.id) {
      await recordDispatchBlocked({
        companyId: input.company.id,
        dispatchId: input.dispatchId,
        workItemId: input.workItemId,
        topicKey: input.topicKey,
        roomId: input.roomId,
        fromActorId: input.fromActorId,
        targetActorId: input.actorId,
        createdAt,
        title: input.title,
        message: input.message,
        sourceStepId: input.sourceStepId,
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    }
    throw error;
  }

  await recordDispatchEnqueued({
    companyId: input.company.id,
    dispatchId: input.dispatchId,
    workItemId: input.workItemId,
    topicKey: input.topicKey,
    roomId: input.roomId,
    fromActorId: input.fromActorId,
    targetActorId: input.actorId,
    sessionKey: prepared.providerConversationRef.conversationId,
    createdAt,
    title: input.title,
    message: input.message,
    summary: input.summary,
    sourceStepId: input.sourceStepId,
    handoff: input.handoff,
  });

  let unconfirmedRecorded = false;
  const markUnconfirmed = async (reason?: string) => {
    if (unconfirmedRecorded) {
      return;
    }
    unconfirmedRecorded = true;
    await recordDispatchUnconfirmed({
      companyId: input.company!.id,
      dispatchId: input.dispatchId,
      workItemId: input.workItemId,
      topicKey: input.topicKey,
      roomId: input.roomId,
      fromActorId: input.fromActorId,
      targetActorId: input.actorId,
      sessionKey: prepared.providerConversationRef.conversationId,
      createdAt: Date.now(),
      title: input.title,
      message: input.message,
      summary: input.summary,
      sourceStepId: input.sourceStepId,
      handoff: input.handoff,
      error: reason,
    }).catch(() => undefined);
  };

  const timerId = globalThis.setTimeout(() => {
    void markUnconfirmed();
  }, DISPATCH_TRANSPORT_ACK_WINDOW_MS);

  void prepared.send
    .then(async (ack) => {
      globalThis.clearTimeout(timerId);
      await recordDispatchSent({
        companyId: input.company!.id,
        dispatchId: input.dispatchId,
        workItemId: input.workItemId,
        topicKey: input.topicKey,
        roomId: input.roomId,
        fromActorId: input.fromActorId,
        targetActorId: input.actorId,
        sessionKey: prepared.providerConversationRef.conversationId,
        providerRunId: ack.runId,
        createdAt: Date.now(),
        title: input.title,
        message: input.message,
        summary: input.summary,
        sourceStepId: input.sourceStepId,
        handoff: input.handoff,
      });
    })
    .catch(async (error) => {
      globalThis.clearTimeout(timerId);
      const message = error instanceof Error ? error.message : String(error);
      if (isDeterministicDispatchFailure(error)) {
        await recordDispatchBlocked({
          companyId: input.company!.id,
          dispatchId: input.dispatchId,
          workItemId: input.workItemId,
          topicKey: input.topicKey,
          roomId: input.roomId,
          fromActorId: input.fromActorId,
          targetActorId: input.actorId,
          createdAt: Date.now(),
          title: input.title,
          message: input.message,
          sourceStepId: input.sourceStepId,
          error: message,
        }).catch(() => undefined);
        return;
      }
      await markUnconfirmed(message);
    });

  return {
    dispatch,
    actorRef: prepared.actorRef,
    conversationRef: prepared.conversationRef,
    providerConversationRef: prepared.providerConversationRef,
  };
}
