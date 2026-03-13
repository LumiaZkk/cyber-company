import { useCallback } from "react";
import type { FocusProgressEvent } from "../../../application/governance/chat-progress";
import { appendOperatorActionAuditEvent } from "../../../application/governance/operator-action-audit";
import { toast } from "../../../components/system/toast-store";

export function useChatCoordinationActions(input: {
  takeoverPack: { operatorNote: string } | null;
  activeCompanyId: string | null;
  syncCompanyCommunication: (options?: { force?: boolean }) => Promise<{
    requestsAdded: number;
    requestsUpdated: number;
    tasksRecovered: number;
    handoffsRecovered: number;
  } | null>;
  appendLocalProgressEvent: (event: FocusProgressEvent) => void;
  setIsSummaryOpen: (value: boolean) => void;
  setRecoveringCommunication: (value: boolean) => void;
}) {
  const handleCopyTakeoverPack = useCallback(async () => {
    if (!input.takeoverPack) {
      return;
    }

    try {
      await navigator.clipboard.writeText(input.takeoverPack.operatorNote);
      if (input.activeCompanyId) {
        void appendOperatorActionAuditEvent({
          companyId: input.activeCompanyId,
          action: "takeover_pack_copy",
          surface: "chat",
          outcome: "succeeded",
          details: {
            hasTakeoverPack: true,
            noteLength: input.takeoverPack.operatorNote.length,
          },
        });
      }
      input.appendLocalProgressEvent({
        id: `copy-takeover:${Date.now()}`,
        timestamp: Date.now(),
        actorLabel: "系统",
        title: "已复制接管包",
        summary: "接管信息已经复制到剪贴板，可以直接转给人工继续处理。",
        tone: "amber",
        category: "status",
        source: "local",
      });
      input.setIsSummaryOpen(true);
      toast.success("接管包已复制", "可以直接贴给人工执行者继续处理。");
    } catch (error) {
      if (input.activeCompanyId) {
        void appendOperatorActionAuditEvent({
          companyId: input.activeCompanyId,
          action: "takeover_pack_copy",
          surface: "chat",
          outcome: "failed",
          error: error instanceof Error ? error.message : String(error),
          details: {
            hasTakeoverPack: true,
            noteLength: input.takeoverPack.operatorNote.length,
          },
        });
      }
      input.appendLocalProgressEvent({
        id: `copy-takeover-failed:${Date.now()}`,
        timestamp: Date.now(),
        actorLabel: "系统",
        title: "复制接管包失败",
        summary: error instanceof Error ? error.message : String(error),
        tone: "rose",
        category: "status",
        source: "local",
      });
      toast.error("复制失败", error instanceof Error ? error.message : String(error));
    }
  }, [input]);

  const handleRecoverCommunication = useCallback(async () => {
    if (!input.activeCompanyId) {
      return;
    }

    input.setRecoveringCommunication(true);
    try {
      const summary = await input.syncCompanyCommunication();
      if (!summary) {
        return;
      }
      void appendOperatorActionAuditEvent({
        companyId: input.activeCompanyId,
        action: "communication_recovery",
        surface: "chat",
        outcome: "succeeded",
        requestsAdded: summary.requestsAdded,
        requestsUpdated: summary.requestsUpdated,
        tasksRecovered: summary.tasksRecovered,
        handoffsRecovered: summary.handoffsRecovered,
      });
      input.appendLocalProgressEvent({
        id: `recover:${Date.now()}`,
        timestamp: Date.now(),
        actorLabel: "系统",
        title: "已同步当前阻塞",
        summary: `新增 ${summary.requestsAdded} 条请求，更新 ${summary.requestsUpdated} 条，恢复任务 ${summary.tasksRecovered} 条，恢复交接 ${summary.handoffsRecovered} 条。`,
        tone: "emerald",
        category: "status",
        source: "local",
      });
      input.setIsSummaryOpen(true);
      toast.success(
        "当前阻塞已同步",
        `新增 ${summary.requestsAdded}，更新 ${summary.requestsUpdated}，恢复任务 ${summary.tasksRecovered}，恢复交接 ${summary.handoffsRecovered}。`,
      );
    } catch (error) {
      void appendOperatorActionAuditEvent({
        companyId: input.activeCompanyId,
        action: "communication_recovery",
        surface: "chat",
        outcome: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      input.appendLocalProgressEvent({
        id: `recover-failed:${Date.now()}`,
        timestamp: Date.now(),
        actorLabel: "系统",
        title: "同步当前阻塞失败",
        summary: error instanceof Error ? error.message : String(error),
        tone: "rose",
        category: "status",
        source: "local",
      });
      toast.error("同步失败", error instanceof Error ? error.message : String(error));
    } finally {
      input.setRecoveringCommunication(false);
    }
  }, [input]);

  return {
    handleCopyTakeoverPack,
    handleRecoverCommunication,
  };
}
