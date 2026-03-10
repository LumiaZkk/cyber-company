import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { executeChatSend, type ChatSendAttachment } from "../../../application/delegation/chat-send";
import type { ProviderManifest, ChatMessage } from "../../../application/gateway";
import type {
  DispatchRecord,
  RequirementRoomMessage,
  RequirementRoomRecord,
  RoomConversationBindingRecord,
} from "../../../domain/delegation/types";
import type { Company } from "../../../domain/org/types";
import { toast } from "../../../components/system/toast-store";
import { limitChatMessages } from "../view-models/messages";

export function useChatSend(input: {
  activeCompany: Company | null;
  providerManifest: ProviderManifest;
  providerId: string;
  sessionKey: string | null;
  isArchiveView: boolean;
  isGroup: boolean;
  sending: boolean;
  routeCompanyConflictMessage: string | null;
  attachments: ChatSendAttachment[];
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
  handleClearSession: (reason?: "new" | "reset") => Promise<boolean>;
  markScrollIntent: (mode?: "preserve" | "follow") => void;
  updateStreamText: (value: string | null) => void;
  activeRunIdRef: MutableRefObject<string | null>;
  setActiveRunId: (value: string | null) => void;
  setAttachments: Dispatch<SetStateAction<ChatSendAttachment[]>>;
  setSending: (value: boolean) => void;
  setIsGenerating: (value: boolean) => void;
  setRoomBroadcastMode: (value: boolean) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  upsertRoomConversationBindings: (bindings: RoomConversationBindingRecord[]) => void;
  upsertDispatchRecord: (dispatch: DispatchRecord) => void;
  appendRoomMessages: (
    roomId: string,
    messages: RequirementRoomMessage[],
    meta?: Partial<Omit<RequirementRoomRecord, "id" | "transcript">>,
  ) => void;
}) {
  return useCallback(
    async (draft: string): Promise<boolean> => {
      const text = draft.trim();
      const hasAttachments = input.attachments.length > 0;
      if (input.isArchiveView) {
        toast.warning("归档轮次只读", "请先返回当前会话，再继续和负责人对话。");
        return false;
      }
      if ((!text && !hasAttachments) || !input.sessionKey || input.sending) {
        return false;
      }
      if (input.routeCompanyConflictMessage) {
        toast.error("无法发送", input.routeCompanyConflictMessage);
        return false;
      }
      if (text === "/new" && !hasAttachments) {
        if (input.isGroup) {
          toast.info("需求团队房间暂不支持 /new", "请在 CEO 或成员 1v1 会话里开启新会话。");
          return false;
        }
        return await input.handleClearSession("new");
      }

      const currentAttachments = [...input.attachments];
      input.setAttachments([]);
      input.setSending(true);
      input.setIsGenerating(true);
      input.markScrollIntent("follow");
      input.activeRunIdRef.current = null;
      input.setActiveRunId(null);
      input.updateStreamText(null);

      try {
        const result = await executeChatSend({
          company: input.activeCompany,
          providerManifest: input.providerManifest,
          providerId: input.providerId,
          sessionKey: input.sessionKey,
          text,
          attachments: currentAttachments,
          isGroup: input.isGroup,
          roomBroadcastMode: input.roomBroadcastMode,
          targetAgentId: input.targetAgentId,
          displayNextBatonAgentId: input.displayNextBatonAgentId,
          requirementRoomTargetAgentIds: input.requirementRoomTargetAgentIds,
          requirementTeamOwnerAgentId: input.requirementTeamOwnerAgentId,
          effectiveRequirementRoom: input.effectiveRequirementRoom,
          currentConversationWorkItemId: input.currentConversationWorkItemId,
          currentConversationTopicKey: input.currentConversationTopicKey,
          productRoomId: input.productRoomId,
          groupTitle: input.groupTitle,
          upsertRoomConversationBindings: input.upsertRoomConversationBindings,
          upsertDispatchRecord: input.upsertDispatchRecord,
          appendRoomMessages: input.appendRoomMessages,
        });

        if (!result.ok) {
          if (result.reason === "no_targets") {
            toast.warning("没有匹配到团队成员", result.message);
          }
          input.setIsGenerating(false);
          return false;
        }

        if (result.runId) {
          input.activeRunIdRef.current = result.runId;
          input.setActiveRunId(result.runId);
        }

        if (!input.isGroup) {
          const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
          if (text) {
            contentBlocks.push({ type: "text", text });
          }
          if (hasAttachments) {
            currentAttachments.forEach((attachment) => {
              contentBlocks.push({
                type: "image",
                source: { type: "base64", media_type: attachment.mimeType, data: attachment.dataUrl },
              });
            });
          }
          input.setMessages((previous) => {
            const nextMessages: ChatMessage[] = [
              ...previous,
              {
                role: "user",
                content: contentBlocks,
                timestamp: Date.now(),
                ...(result.roomAudienceAgentIds ? { roomAudienceAgentIds: result.roomAudienceAgentIds } : {}),
              },
            ];
            return limitChatMessages(nextMessages) as ChatMessage[];
          });
        }

        if (result.resetRoomBroadcastMode) {
          input.setRoomBroadcastMode(false);
        }
      } catch (error) {
        console.error("Failed to send message", error);
        const message = error instanceof Error ? error.message : "无法即时联络目标成员";
        toast.error("指令发送失败", message);
        input.setIsGenerating(false);
        return false;
      } finally {
        input.setSending(false);
      }

      return true;
    },
    [input],
  );
}
