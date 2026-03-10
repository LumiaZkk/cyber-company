import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  areRequirementRoomChatMessagesEqual,
  buildRequirementRoomRecordSignature,
  createIncomingRequirementRoomMessage,
} from "../../../application/delegation/room-routing";
import { initializeChatSession } from "../../../application/chat/session-runtime";
import { parseChatEventPayload, resolveDispatchReplyUpdates } from "../../../application/delegation/chat-dispatch";
import { gateway, type ChatMessage } from "../../../application/gateway";
import { buildTrackedTaskFromChatFinal } from "../../../application/mission/chat-task-tracker";
import type { RequirementSessionSnapshot } from "../../../domain/mission/requirement-snapshot";
import type {
  DispatchRecord,
  RequirementRoomMessage,
  RequirementRoomRecord,
  RoomConversationBindingRecord,
} from "../../../domain/delegation/types";
import type { RoundRecord, TrackedTask } from "../../../domain/mission/types";
import type { Company } from "../../../domain/org/types";
import { toast } from "../../../components/system/toast-store";
import {
  buildVisibleChatMessage,
  CHAT_UI_MESSAGE_LIMIT,
  extractTextFromMessage,
  limitChatMessages,
  normalizeMessage,
  sanitizeVisibleChatFlow,
  shouldKeepVisibleChatMessage,
} from "../view-models/messages";

export type ChatSessionRuntimeInput = {
  activeCompany: Company | null;
  agentId: string | null;
  archiveId: string | null;
  activeArchivedRound: RoundRecord | null;
  companyRouteReady: boolean;
  connected: boolean;
  routeCompanyConflictMessage: string | null;
  groupTopicKey?: string | null;
  groupTitle: string;
  historyAgentId: string | null;
  isArchiveView: boolean;
  isGroup: boolean;
  providerId: string;
  persistedWorkItemStartedAt?: number | null;
  targetAgentId: string | null;
  effectiveOwnerAgentId: string | null;
  effectiveGroupSessionKey: string | null;
  effectiveRequirementRoom: RequirementRoomRecord | null;
  effectiveRequirementRoomSnapshots: RequirementSessionSnapshot[];
  requirementRoomSessions: Array<{ sessionKey: string; agentId: string }>;
  requirementRoomSessionKeys: Set<string>;
  requirementRoomTargetAgentIds: string[];
  groupWorkItemId: string | null;
  sessionKey: string | null;
  productRoomId: string | null;
  activeRoomBindings: RoomConversationBindingRecord[];
  activeDispatches: DispatchRecord[];
  currentConversationWorkItemId: string | null;
  currentConversationTopicKey?: string | null;
  lastSyncedRoomSignatureRef: MutableRefObject<string | null>;
  streamTextRef: MutableRefObject<string | null>;
  activeRunIdRef: MutableRefObject<string | null>;
  setActiveRunId: (value: string | null) => void;
  setLoading: (value: boolean) => void;
  setSessionKey: (value: string | null) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setIsGenerating: (value: boolean) => void;
  updateStreamText: (value: string | null) => void;
  upsertRoomRecord: (room: RequirementRoomRecord) => void;
  upsertRoomConversationBindings: (bindings: RoomConversationBindingRecord[]) => void;
  appendRoomMessages: (
    roomId: string,
    messages: RequirementRoomMessage[],
    meta?: Partial<Omit<RequirementRoomRecord, "id" | "transcript">>,
  ) => void;
  upsertDispatchRecord: (dispatch: DispatchRecord) => void;
  upsertTask: (task: TrackedTask) => Promise<void>;
};

export function useChatSessionRuntime(input: ChatSessionRuntimeInput) {
  useEffect(() => {
    async function initChat() {
      if (
        !input.agentId ||
        !input.connected ||
        input.routeCompanyConflictMessage ||
        !input.companyRouteReady
      ) {
        if (input.routeCompanyConflictMessage) {
          input.setLoading(false);
          input.setMessages([]);
          input.setSessionKey(null);
        }
        return;
      }

      try {
        const initialization = await initializeChatSession({
          activeCompany: input.activeCompany,
          archiveId: input.archiveId,
          activeArchivedRound: input.activeArchivedRound,
          effectiveGroupSessionKey: input.effectiveGroupSessionKey,
          effectiveOwnerAgentId: input.effectiveOwnerAgentId,
          effectiveRequirementRoom: input.effectiveRequirementRoom,
          effectiveRequirementRoomSnapshots: input.effectiveRequirementRoomSnapshots,
          groupTitle: input.groupTitle,
          groupTopicKey: input.groupTopicKey,
          groupWorkItemId: input.groupWorkItemId,
          historyAgentId: input.historyAgentId,
          isArchiveView: input.isArchiveView,
          isGroup: input.isGroup,
          persistedWorkItemStartedAt: input.persistedWorkItemStartedAt,
          providerId: input.providerId,
          requirementRoomSessions: input.requirementRoomSessions,
          requirementRoomTargetAgentIds: input.requirementRoomTargetAgentIds,
          targetAgentId: input.targetAgentId,
        });

        if (!initialization.sessionKey) {
          return;
        }

        input.setSessionKey(initialization.sessionKey);
        if (initialization.roomRecord && initialization.roomRecordSignature) {
          const existingRoomSignature = buildRequirementRoomRecordSignature(
            input.effectiveRequirementRoom,
          );
          if (
            initialization.roomRecordSignature !== input.lastSyncedRoomSignatureRef.current &&
            initialization.roomRecordSignature !== existingRoomSignature
          ) {
            input.lastSyncedRoomSignatureRef.current = initialization.roomRecordSignature;
            input.upsertRoomRecord(initialization.roomRecord);
          }
        }
        if (initialization.roomBindings && initialization.roomBindings.length > 0) {
          input.upsertRoomConversationBindings(initialization.roomBindings);
        }
        if (initialization.messages) {
          const nextMessages = input.isGroup
            ? initialization.messages
            : sanitizeVisibleChatFlow(initialization.messages);
          input.setMessages((previous) =>
            areRequirementRoomChatMessagesEqual(previous, nextMessages)
              ? previous
              : nextMessages,
          );
        }
        if (typeof initialization.isGenerating === "boolean") {
          input.setIsGenerating(initialization.isGenerating);
        }
        if (initialization.streamText !== undefined) {
          input.updateStreamText(initialization.streamText);
        }
      } catch (error) {
        console.error("Failed to init chat:", error);
      } finally {
        input.setLoading(false);
      }
    }

    void initChat();
  }, [input]);

  useEffect(() => {
    if (!input.sessionKey || input.isArchiveView) {
      return;
    }

    const clearStreamingState = () => {
      input.activeRunIdRef.current = null;
      input.setActiveRunId(null);
      input.updateStreamText(null);
      input.setIsGenerating(false);
    };

    const unsubscribe = gateway.subscribe("chat", (rawPayload) => {
      const payload = parseChatEventPayload(rawPayload);
      const payloadMatchesSession = input.isGroup
        ? input.requirementRoomSessionKeys.has(payload?.sessionKey ?? "")
        : payload?.sessionKey === input.sessionKey;
      if (!payload || !payloadMatchesSession) {
        return;
      }

      if (payload.state === "delta") {
        if (input.isGroup) {
          return;
        }
        const deltaText = extractTextFromMessage(payload.message);
        if (deltaText && deltaText.length >= (input.streamTextRef.current?.length ?? 0)) {
          input.activeRunIdRef.current = payload.runId || null;
          input.setActiveRunId(payload.runId || null);
          input.updateStreamText(deltaText);
        }
        return;
      }

      if (payload.state === "final") {
        const incoming = payload.message ? normalizeMessage(payload.message) : null;
        const visibleIncoming = incoming ? buildVisibleChatMessage(incoming) : null;
        if (input.isGroup) {
          const roomId = input.productRoomId ?? input.effectiveRequirementRoom?.id ?? null;
          const payloadSourceActorId =
            incoming &&
            typeof incoming.provenance === "object" &&
            incoming.provenance &&
            typeof (incoming.provenance as Record<string, unknown>).sourceActorId === "string"
              ? String((incoming.provenance as Record<string, unknown>).sourceActorId)
              : null;
          const agentKey =
            input.requirementRoomSessions.find((session) => session.sessionKey === payload.sessionKey)
              ?.agentId ??
            input.activeRoomBindings.find(
              (binding) =>
                binding.roomId === roomId &&
                binding.conversationId === payload.sessionKey &&
                typeof binding.actorId === "string" &&
                binding.actorId.trim().length > 0,
            )?.actorId ??
            payloadSourceActorId;
          const roomMessage =
            incoming && agentKey
              ? createIncomingRequirementRoomMessage({
                  company: input.activeCompany,
                  message: incoming,
                  sessionKey: payload.sessionKey,
                  agentId: agentKey,
                  roomId: roomId ?? undefined,
                  ownerAgentId:
                    input.effectiveRequirementRoom?.ownerAgentId ??
                    input.effectiveRequirementRoom?.ownerActorId ??
                    input.targetAgentId,
                })
              : null;

          if (roomMessage && input.sessionKey && agentKey) {
            input.upsertRoomConversationBindings([
              {
                roomId: roomId ?? "room:unknown",
                providerId: input.providerId,
                conversationId: payload.sessionKey,
                actorId: agentKey,
                nativeRoom: payload.sessionKey.includes(":group:"),
                updatedAt: roomMessage.timestamp,
              },
            ]);
            const dispatchUpdates = resolveDispatchReplyUpdates({
              dispatches: input.activeDispatches,
              workItemId: input.currentConversationWorkItemId,
              roomId,
              actorId: agentKey,
              responseMessageId: roomMessage.id,
              timestamp: roomMessage.timestamp,
            });
            dispatchUpdates.forEach((dispatch) => input.upsertDispatchRecord(dispatch));
            input.appendRoomMessages(
              roomId ?? "room:unknown",
              [roomMessage],
              {
                sessionKey: input.sessionKey,
                companyId: input.activeCompany?.id,
                workItemId: input.currentConversationWorkItemId ?? undefined,
                title: input.effectiveRequirementRoom?.title ?? input.groupTitle,
                memberActorIds:
                  input.effectiveRequirementRoom?.memberActorIds ?? input.requirementRoomTargetAgentIds,
                memberIds:
                  input.effectiveRequirementRoom?.memberIds ?? input.requirementRoomTargetAgentIds,
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
          }
          clearStreamingState();
          return;
        }

        input.setMessages((previous) => {
          if (visibleIncoming && shouldKeepVisibleChatMessage(visibleIncoming)) {
            const base = previous.filter(
              (message) =>
                !(message.role === visibleIncoming.role && message.timestamp === visibleIncoming.timestamp),
            );
            return limitChatMessages([...base, visibleIncoming]) as ChatMessage[];
          }
          if (input.streamTextRef.current?.trim()) {
            return limitChatMessages([
              ...previous,
              {
                role: "assistant",
                content: [{ type: "text", text: input.streamTextRef.current }],
                timestamp: Date.now(),
              },
            ]) as ChatMessage[];
          }
          return previous;
        });
        clearStreamingState();

        const finalText = incoming ? extractTextFromMessage(incoming) : input.streamTextRef.current;
        if (finalText && input.sessionKey) {
          const trackedTask = buildTrackedTaskFromChatFinal({
            finalText,
            sessionKey: input.sessionKey,
            agentId: input.agentId || "",
            company: input.activeCompany,
          });
          if (trackedTask) {
            void input.upsertTask(trackedTask).catch(console.error);
          }
        }
        return;
      }

      if (payload.state === "aborted") {
        if (input.isGroup) {
          clearStreamingState();
          return;
        }
        if (payload.runId && input.activeRunIdRef.current && payload.runId !== input.activeRunIdRef.current) {
          return;
        }

        input.setMessages((previous) => {
          if (input.streamTextRef.current?.trim()) {
            return limitChatMessages([
              ...previous,
              {
                role: "assistant",
                content: [{ type: "text", text: `${input.streamTextRef.current}\n\n[已中止]` }],
                timestamp: Date.now(),
              },
            ]) as ChatMessage[];
          }
          return previous;
        });
        clearStreamingState();
        return;
      }

      if (payload.state === "error") {
        if (input.isGroup) {
          clearStreamingState();
          toast.error("团队房间消息失败", payload.errorMessage ?? "请重试或改为直接联系成员。");
          return;
        }
        input.setMessages((previous) =>
          [
            ...limitChatMessages(previous),
            {
              role: "system" as const,
              content: payload.errorMessage ? `[Error] ${payload.errorMessage}` : "[Error] chat error",
              timestamp: Date.now(),
            },
          ].slice(-CHAT_UI_MESSAGE_LIMIT),
        );
        clearStreamingState();
      }
    });

    return () => unsubscribe();
  }, [input]);
}
