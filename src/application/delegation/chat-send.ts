import {
  createOutgoingRequirementRoomMessage,
  resolveRequirementRoomMentionTargets,
} from "./room-routing";
import { recordDispatchSent } from "./closed-loop";
import { gateway, sendTurnToCompanyActor, type ProviderManifest } from "../gateway";
import { resolveDefaultDepartmentDispatchTarget } from "../org/department-autonomy";
import type {
  DispatchRecord,
  RequirementRoomMessage,
  RequirementRoomRecord,
  RoomConversationBindingRecord,
} from "../../domain/delegation/types";
import type { Company } from "../../domain/org/types";

export type ChatSendAttachment = {
  mimeType: string;
  dataUrl: string;
};

type ExecuteChatSendInput = {
  company: Company | null;
  providerManifest: ProviderManifest;
  providerId: string;
  sessionKey: string;
  text: string;
  attachments: ChatSendAttachment[];
  isGroup: boolean;
  roomBroadcastMode: boolean;
  targetAgentId: string | null;
  displayNextBatonAgentId: string | null;
  requirementRoomTargetAgentIds: string[];
  requirementTeamOwnerAgentId?: string | null;
  effectiveRequirementRoom: RequirementRoomRecord | null;
  currentConversationWorkItemId: string | null;
  currentConversationTopicKey?: string | null;
  productRoomId: string | null;
  groupTitle: string;
  upsertRoomConversationBindings: (bindings: RoomConversationBindingRecord[]) => void;
  upsertDispatchRecord: (dispatch: DispatchRecord) => void;
  appendRoomMessages: (
    roomId: string,
    messages: RequirementRoomMessage[],
    meta?: Partial<Omit<RequirementRoomRecord, "id" | "transcript">>,
  ) => void;
};

export type ChatSendResult =
  | {
      ok: true;
      runId: string | null;
      roomAudienceAgentIds?: string[];
      resetRoomBroadcastMode: boolean;
    }
  | {
      ok: false;
      reason: "no_targets";
      message: string;
    };

function buildApiAttachments(attachments: ChatSendAttachment[]) {
  if (attachments.length === 0) {
    return undefined;
  }
  return attachments.map((attachment) => ({
    type: "image",
    mimeType: attachment.mimeType,
    content: attachment.dataUrl.split(",")[1] || "",
  }));
}

function buildAudienceTitle(company: Company | null, audienceAgentIds: string[], groupTitle: string, roomBroadcastMode: boolean) {
  if (roomBroadcastMode) {
    return `${groupTitle} · 群发派单`;
  }
  return `需求团队派单 · ${audienceAgentIds
    .map((agentId) => company?.employees.find((employee) => employee.agentId === agentId)?.nickname ?? agentId)
    .join("、")}`;
}

export async function executeChatSend(input: ExecuteChatSendInput): Promise<ChatSendResult> {
  const apiAttachments = buildApiAttachments(input.attachments);
  if (!input.isGroup) {
    const ack = await gateway.sendChatMessage(input.sessionKey, input.text, {
      timeoutMs: 300_000,
      attachments: apiAttachments,
    });
    return {
      ok: true,
      runId: ack?.runId ?? null,
      resetRoomBroadcastMode: false,
    };
  }

  const mentionedTargets = resolveRequirementRoomMentionTargets({
    text: input.text,
    company: input.company,
    memberIds: input.requirementRoomTargetAgentIds,
  });
  const defaultRoomTargetAgentId =
    input.displayNextBatonAgentId ??
    input.effectiveRequirementRoom?.ownerActorId ??
    input.effectiveRequirementRoom?.ownerAgentId ??
    input.requirementTeamOwnerAgentId ??
    input.requirementRoomTargetAgentIds[0] ??
    null;
  const routedDefaultTargetAgentId =
    resolveDefaultDepartmentDispatchTarget({
      company: input.company,
      fromActorId:
        input.targetAgentId ??
        input.effectiveRequirementRoom?.ownerActorId ??
        input.requirementTeamOwnerAgentId ??
        null,
      preferredTargetAgentId: defaultRoomTargetAgentId,
      explicitOverride: false,
    })?.agentId ?? defaultRoomTargetAgentId;
  const targetAgentIds: string[] = input.roomBroadcastMode
    ? input.requirementRoomTargetAgentIds
    : mentionedTargets.length > 0
      ? mentionedTargets
      : routedDefaultTargetAgentId
        ? [routedDefaultTargetAgentId]
        : [];

  if (targetAgentIds.length === 0) {
    return {
      ok: false,
      reason: "no_targets",
      message: "请用 @agentId、@昵称 或 @角色 指向团队成员。",
    };
  }

  if (!input.company) {
    throw new Error("当前公司上下文未就绪，暂时无法派发团队消息。");
  }

  const audienceAgentIds = [...new Set(targetAgentIds)];
  const dispatchStartedAt = Date.now();
  const results = await Promise.allSettled(
    audienceAgentIds.map((agentId) =>
      sendTurnToCompanyActor({
        backend: gateway,
        manifest: input.providerManifest,
        company: input.company!,
        actorId: agentId,
        message: input.text,
        kind: "direct",
        timeoutMs: 300_000,
        attachments: apiAttachments,
        targetActorIds: audienceAgentIds,
      }),
    ),
  );
  if (!results.some((result) => result.status === "fulfilled")) {
    throw new Error("团队成员都没有接住这条指令");
  }

  const fulfilledDispatches = results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof sendTurnToCompanyActor>>> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
  const roomId = input.productRoomId ?? input.effectiveRequirementRoom?.id ?? null;
  const workItemId = input.currentConversationWorkItemId;
  input.upsertRoomConversationBindings(
    fulfilledDispatches.map((dispatch) => ({
      roomId: roomId ?? "room:unknown",
      ...dispatch.providerConversationRef,
      updatedAt: dispatchStartedAt,
    })),
  );

  const dispatchTitle = buildAudienceTitle(
    input.company,
    audienceAgentIds,
    input.groupTitle,
    input.roomBroadcastMode,
  );
  const dispatchId = workItemId ? `dispatch:${workItemId}:${dispatchStartedAt}` : null;
  const outgoingRoomMessage = createOutgoingRequirementRoomMessage({
    roomId: roomId ?? input.productRoomId ?? input.effectiveRequirementRoom?.id ?? "room:unknown",
    sessionKey: roomId ?? input.productRoomId ?? input.effectiveRequirementRoom?.id ?? "room:unknown",
    text: input.text,
    audienceAgentIds,
    timestamp: dispatchStartedAt,
  });
  if (dispatchId && workItemId) {
    input.upsertDispatchRecord({
      id: dispatchId,
      workItemId,
      roomId: roomId ?? null,
      title: dispatchTitle,
      summary: input.text,
      fromActorId: input.targetAgentId ?? input.effectiveRequirementRoom?.ownerActorId ?? null,
      targetActorIds: audienceAgentIds,
      status: "sent",
      sourceMessageId: outgoingRoomMessage.id,
      providerRunId: fulfilledDispatches[0]?.runId,
      topicKey: input.currentConversationTopicKey ?? undefined,
      createdAt: dispatchStartedAt,
      updatedAt: dispatchStartedAt,
    });
    await Promise.all(
      audienceAgentIds.map((agentId) =>
        recordDispatchSent({
          companyId: input.company!.id,
          dispatchId: `${dispatchId}:${agentId}`,
          workItemId,
          roomId,
          topicKey: input.currentConversationTopicKey,
          fromActorId:
            input.targetAgentId ??
            input.effectiveRequirementRoom?.ownerActorId ??
            "unknown",
          targetActorId: agentId,
          sessionKey: `agent:${agentId}:main`,
          providerRunId: fulfilledDispatches[0]?.runId,
          createdAt: dispatchStartedAt,
          title: dispatchTitle,
          message: input.text,
          handoff: true,
        }),
      ),
    );
  }

  input.appendRoomMessages(
    roomId ?? "room:unknown",
    [outgoingRoomMessage],
    {
      sessionKey: input.effectiveRequirementRoom?.sessionKey ?? input.sessionKey ?? `room:${roomId ?? "unknown"}`,
      companyId: input.company.id,
      workItemId: workItemId ?? undefined,
      title: input.effectiveRequirementRoom?.title ?? input.groupTitle,
      scope: input.effectiveRequirementRoom?.scope ?? "company",
      memberActorIds: input.effectiveRequirementRoom?.memberActorIds ?? input.requirementRoomTargetAgentIds,
      memberIds: input.effectiveRequirementRoom?.memberIds ?? input.requirementRoomTargetAgentIds,
      ownerActorId:
        input.effectiveRequirementRoom?.ownerActorId ??
        input.effectiveRequirementRoom?.ownerAgentId ??
        input.targetAgentId,
      ownerAgentId:
        input.effectiveRequirementRoom?.ownerAgentId ??
        input.effectiveRequirementRoom?.ownerActorId ??
        input.targetAgentId,
      topicKey: input.currentConversationTopicKey ?? undefined,
    },
  );

  return {
    ok: true,
    runId: fulfilledDispatches[0]?.runId ?? null,
    roomAudienceAgentIds: audienceAgentIds,
    resetRoomBroadcastMode: true,
  };
}
