import { useEffect } from "react";
import { gateway } from "../../../application/gateway";
import { resolveProgressTone, summarizeProgressText } from "../../../application/governance/chat-progress";
import { extractTextFromMessage, normalizeMessage } from "../view-models/messages";
import type { FocusActionWatch } from "../view-models/focus";

export function useChatActionWatchSync(input: {
  connected: boolean;
  isPageVisible: boolean;
  actionWatches: FocusActionWatch[];
  appendLocalProgressEvent: (event: {
    id: string;
    timestamp: number;
    actorLabel: string;
    actorAgentId?: string;
    title: string;
    summary: string;
    detail?: string;
    tone: "slate" | "emerald" | "amber" | "rose" | "indigo";
    category: "receipt" | "status";
  }) => void;
  setActionWatches: React.Dispatch<React.SetStateAction<FocusActionWatch[]>>;
  syncCompanyCommunication: (options?: { force?: boolean }) => Promise<unknown>;
}) {
  const {
    connected,
    isPageVisible,
    actionWatches,
    appendLocalProgressEvent,
    setActionWatches,
    syncCompanyCommunication,
  } = input;

  useEffect(() => {
    if (!connected || !isPageVisible || actionWatches.length === 0) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const refreshed: FocusActionWatch[] = [];
      let shouldSyncCompanyState = false;

      for (const watch of actionWatches) {
        try {
          const history = await gateway.getChatHistory(watch.sessionKey, 10);
          const newAssistantMessages = (history.messages ?? [])
            .map(normalizeMessage)
            .filter((message) => (message.timestamp ?? 0) > watch.lastSeenTimestamp)
            .filter((message) => message.role === "assistant")
            .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0));
          const latestMeaningfulMessage = newAssistantMessages.find((message) => {
            const text = extractTextFromMessage(message);
            return Boolean(text && summarizeProgressText(text));
          });

          if (latestMeaningfulMessage) {
            const text = extractTextFromMessage(latestMeaningfulMessage);
            const summary = text ? summarizeProgressText(text) : null;
            if (summary) {
              appendLocalProgressEvent({
                id: `watch:${watch.id}:${latestMeaningfulMessage.timestamp ?? Date.now()}`,
                timestamp: latestMeaningfulMessage.timestamp ?? Date.now(),
                actorLabel: watch.targetLabel,
                actorAgentId: watch.targetAgentId,
                title:
                  watch.kind === "handoff"
                    ? `下一棒新进展：${watch.targetLabel}`
                    : `负责人已反馈：${watch.actionLabel}`,
                summary: summary.summary,
                detail: summary.detail,
                tone: resolveProgressTone(`${summary.summary} ${summary.detail ?? ""}`),
                category: "receipt",
              });
              shouldSyncCompanyState = true;
            }

            const nextSeenTimestamp = latestMeaningfulMessage.timestamp ?? watch.lastSeenTimestamp;
            const shouldContinue =
              watch.kind === "handoff" &&
              summary !== null &&
              !/已收到失败回传|未成功|失败|已收到明确结果|已完成|已通过/.test(
                `${summary.title} ${summary.summary} ${summary.detail ?? ""}`,
              ) &&
              Date.now() - watch.startedAt < 180_000;

            if (shouldContinue) {
              refreshed.push({
                ...watch,
                lastSeenTimestamp: nextSeenTimestamp,
              });
            }
            continue;
          }

          const latestAssistantTimestamp =
            newAssistantMessages[0]?.timestamp ?? watch.lastSeenTimestamp;
          const elapsed = Date.now() - watch.startedAt;
          if (elapsed >= 45_000 && !watch.hasReminder) {
            appendLocalProgressEvent({
              id: `watch-waiting:${watch.id}`,
              timestamp: Date.now(),
              actorLabel: watch.targetLabel,
              actorAgentId: watch.targetAgentId,
              title: watch.kind === "handoff" ? `等待 ${watch.targetLabel} 接棒` : `等待 ${watch.targetLabel} 回执`,
              summary:
                watch.kind === "handoff"
                  ? `已经发出上一棒，系统仍在等 ${watch.targetLabel} 真正接住并回传结果。`
                  : `动作已经发出，但 ${watch.targetLabel} 还没有给出新的明确反馈。`,
              tone: "amber",
              category: "status",
            });
            refreshed.push({
              ...watch,
              lastSeenTimestamp: latestAssistantTimestamp,
              hasReminder: true,
            });
            continue;
          }

          if (elapsed < 180_000) {
            refreshed.push({
              ...watch,
              lastSeenTimestamp: latestAssistantTimestamp,
            });
          }
        } catch {
          if (Date.now() - watch.startedAt < 180_000) {
            refreshed.push(watch);
          }
        }
      }

      if (!cancelled) {
        if (shouldSyncCompanyState) {
          try {
            await syncCompanyCommunication();
          } catch (error) {
            console.error("focus action sync failed", error);
          }
        }
        setActionWatches(refreshed);
      }
    }, 6000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    actionWatches,
    appendLocalProgressEvent,
    connected,
    isPageVisible,
    setActionWatches,
    syncCompanyCommunication,
  ]);
}
