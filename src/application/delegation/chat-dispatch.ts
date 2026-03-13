import type { DispatchRecord } from "../../domain/delegation/types";
import { buildDispatchCheckoutUpdate, buildActorMainSessionKey } from "../../domain/delegation/dispatch-checkout";
import type { ChatEventPayload } from "../gateway";

export function parseChatEventPayload(payload: unknown): ChatEventPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Partial<ChatEventPayload>;
  if (typeof candidate.sessionKey !== "string" || typeof candidate.state !== "string") {
    return null;
  }

  if (
    candidate.state !== "delta" &&
    candidate.state !== "final" &&
    candidate.state !== "aborted" &&
    candidate.state !== "error"
  ) {
    return null;
  }

  return {
    runId: typeof candidate.runId === "string" ? candidate.runId : "",
    sessionKey: candidate.sessionKey,
    state: candidate.state,
    seq: typeof candidate.seq === "number" ? candidate.seq : 0,
    message: candidate.message,
    errorMessage: typeof candidate.errorMessage === "string" ? candidate.errorMessage : undefined,
  };
}

export function resolveDispatchReplyUpdates(input: {
  dispatches: DispatchRecord[];
  workItemId?: string | null;
  roomId?: string | null;
  actorId: string;
  responseMessageId: string;
  timestamp: number;
}): DispatchRecord[] {
  const candidates = input.dispatches
    .filter((dispatch) => {
      if (!dispatch.targetActorIds.includes(input.actorId)) {
        return false;
      }
      if (dispatch.status !== "pending" && dispatch.status !== "sent" && dispatch.status !== "acknowledged") {
        return false;
      }
      if (input.workItemId && dispatch.workItemId !== input.workItemId) {
        return false;
      }
      if (input.roomId && dispatch.roomId && dispatch.roomId !== input.roomId) {
        return false;
      }
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);

  if (candidates.length === 0) {
    return [];
  }

  return candidates.map((dispatch, index) => ({
    ...dispatch,
    status: index === 0 ? "answered" : "superseded",
    responseMessageId: index === 0 ? input.responseMessageId : dispatch.responseMessageId,
    updatedAt: Math.max(dispatch.updatedAt, input.timestamp),
    ...buildDispatchCheckoutUpdate({
      existing: dispatch,
      nextStatus: index === 0 ? "answered" : "superseded",
      timestamp: input.timestamp,
      actorId: index === 0 ? input.actorId : null,
      sessionKey: index === 0 ? buildActorMainSessionKey(input.actorId) : null,
      targetActorIds: dispatch.targetActorIds,
    }),
  }));
}
