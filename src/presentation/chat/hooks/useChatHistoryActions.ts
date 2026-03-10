import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { buildProductRoundRestorePrompt } from "../../../application/mission/history/round-restore";
import { gateway, type GatewaySessionArchiveRow, type GatewaySessionRow } from "../../../application/gateway";
import { AgentOps } from "../../../application/org/employee-ops";
import type { RoundRecord } from "../../../domain/mission/types";
import { toast } from "../../../components/system/toast-store";
import { deriveWorkKeyFromWorkItemId } from "../../../application/mission/work-item";

export function useChatHistoryActions(input: {
  sessionKey: string | null;
  archiveId: string | null;
  historyAgentId: string | null;
  conversationStateKey: string | null;
  currentActorLabel: string;
  supportsSessionArchiveRestore: boolean;
  productArchivedRounds: RoundRecord[];
  setRecentAgentSessions: Dispatch<SetStateAction<GatewaySessionRow[]>>;
  setRecentArchivedRounds: Dispatch<SetStateAction<GatewaySessionArchiveRow[]>>;
  deleteRoundRecord: (roundId: string) => void;
  setConversationCurrentWorkKey: (
    conversationId: string,
    workKey: string | null,
    workItemId: string | null,
    roundId: string | null,
  ) => void;
  incrementHistoryRefreshNonce: () => void;
  navigateToCurrentConversation: () => void;
  resetConversationView: (options?: { isGenerating?: boolean }) => void;
}) {
  const [deletingHistorySessionKey, setDeletingHistorySessionKey] = useState<string | null>(null);
  const [deletingArchiveId, setDeletingArchiveId] = useState<string | null>(null);
  const [restoringArchiveId, setRestoringArchiveId] = useState<string | null>(null);

  const handleDeleteRecentSession = useCallback(
    async (historySessionKey: string) => {
      if (!historySessionKey || historySessionKey === input.sessionKey || deletingHistorySessionKey) {
        return;
      }
      setDeletingHistorySessionKey(historySessionKey);
      try {
        const result = await gateway.deleteSession(historySessionKey);
        if (result.ok && result.deleted) {
          input.setRecentAgentSessions((previous) =>
            previous.filter((session) => session.key !== historySessionKey),
          );
          input.incrementHistoryRefreshNonce();
          toast.success("历史会话已删除", "它不会再出现在历史会话下拉里。");
        } else {
          toast.warning("删除未生效", "这个会话可能已经不存在，稍后刷新再看。");
        }
      } catch (error) {
        console.error("Failed to delete recent session", error);
        toast.error("删除历史会话失败", error instanceof Error ? error.message : "请稍后重试");
      } finally {
        setDeletingHistorySessionKey(null);
      }
    },
    [deletingHistorySessionKey, input],
  );

  const handleDeleteArchivedRound = useCallback(
    async (historyArchiveId: string) => {
      if (!historyArchiveId || deletingArchiveId) {
        return;
      }
      setDeletingArchiveId(historyArchiveId);
      try {
        const localRound = input.productArchivedRounds.find((round) => round.id === historyArchiveId) ?? null;
        if (localRound) {
          input.deleteRoundRecord(historyArchiveId);
          input.incrementHistoryRefreshNonce();
          if (input.archiveId === historyArchiveId) {
            input.navigateToCurrentConversation();
          }
          toast.success("归档轮次已删除", "它不会再出现在归档历史里。");
        } else if (input.historyAgentId) {
          const result = await gateway.deleteSessionArchive(input.historyAgentId, historyArchiveId);
          if (result.ok && result.removed) {
            input.setRecentArchivedRounds((previous) =>
              previous.filter((archive) => archive.id !== historyArchiveId),
            );
            input.incrementHistoryRefreshNonce();
            if (input.archiveId === historyArchiveId) {
              input.navigateToCurrentConversation();
            }
            toast.success("归档轮次已删除", "它不会再出现在归档历史里。");
          } else {
            toast.warning("删除未生效", "这个归档轮次可能已经不存在，稍后刷新再看。");
          }
        } else {
          toast.warning("删除未生效", "当前无法定位这条归档轮次。");
        }
      } catch (error) {
        console.error("Failed to delete archived round", error);
        toast.error("删除归档轮次失败", error instanceof Error ? error.message : "请稍后重试");
      } finally {
        setDeletingArchiveId(null);
      }
    },
    [deletingArchiveId, input],
  );

  const handleRestoreArchivedRound = useCallback(
    async (historyArchiveId: string) => {
      if (!historyArchiveId || !input.sessionKey || restoringArchiveId) {
        return;
      }
      setRestoringArchiveId(historyArchiveId);
      try {
        const localRound = input.productArchivedRounds.find((round) => round.id === historyArchiveId) ?? null;
        if (localRound) {
          if (input.conversationStateKey && localRound.workItemId) {
            input.setConversationCurrentWorkKey(
              input.conversationStateKey,
              deriveWorkKeyFromWorkItemId(localRound.workItemId),
              localRound.workItemId,
              localRound.id,
            );
          }
          if (localRound.providerArchiveId && input.supportsSessionArchiveRestore && input.historyAgentId) {
            const result = await gateway.restoreSessionArchive(
              input.historyAgentId,
              localRound.providerArchiveId,
              input.sessionKey,
            );
            if (result.ok) {
              input.resetConversationView();
              input.incrementHistoryRefreshNonce();
              input.navigateToCurrentConversation();
              toast.success("归档已恢复为当前会话", "你可以继续在这条会话上接着聊。");
            }
          } else {
            await AgentOps.resetSession(input.sessionKey, "reset");
            await gateway.sendChatMessage(
              input.sessionKey,
              buildProductRoundRestorePrompt(
                localRound,
                input.currentActorLabel || localRound.sourceActorLabel || "当前负责人",
              ),
              { timeoutMs: 300_000 },
            );
            input.resetConversationView({ isGenerating: true });
            input.incrementHistoryRefreshNonce();
            input.navigateToCurrentConversation();
            toast.success("产品归档已恢复到当前会话", "系统已把这轮摘要重新发给负责人继续接住。");
          }
        } else if (input.historyAgentId) {
          const result = await gateway.restoreSessionArchive(
            input.historyAgentId,
            historyArchiveId,
            input.sessionKey,
          );
          if (result.ok) {
            input.resetConversationView();
            input.incrementHistoryRefreshNonce();
            input.navigateToCurrentConversation();
            toast.success("归档已恢复为当前会话", "你可以继续在这条会话上接着聊。");
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "请稍后重试";
        if (/unknown method:\s*sessions\.archives\.restore/i.test(message)) {
          toast.warning(
            "当前 Gateway 版本还不支持归档恢复",
            "升级 Gateway 后，就可以把旧轮次直接恢复成当前会话。",
          );
        } else {
          console.error("Failed to restore archived round", error);
          toast.error("恢复归档轮次失败", message);
        }
      } finally {
        setRestoringArchiveId(null);
      }
    },
    [input, restoringArchiveId],
  );

  return {
    deletingHistorySessionKey,
    deletingArchiveId,
    restoringArchiveId,
    handleDeleteRecentSession,
    handleDeleteArchivedRound,
    handleRestoreArchivedRound,
  };
}
