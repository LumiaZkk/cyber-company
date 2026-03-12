import { RefreshCcw, Trash2 } from "lucide-react";
import { ExecutionStateBadge } from "../../../components/execution-state-badge";
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar";
import type { GatewaySessionRow } from "../../../application/gateway";
import type { HistoryRoundItem } from "../../../application/mission/history/round-history";
import type { ResolvedExecutionState } from "../../../application/mission/execution-state";
import type { RoundRecord } from "../../../domain/mission/types";
import type { EmployeeRef } from "../../../domain/org/types";
import { getAvatarUrl } from "../../../lib/utils";
import { ChatHistoryMenu } from "./ChatHistoryMenu";

export function ChatSessionHeader(input: {
  isGroup: boolean;
  groupTopic: string | null;
  groupTitle: string;
  groupSubtitle?: string | null;
  emp: EmployeeRef | null;
  isArchiveView: boolean;
  showRequirementStatus: boolean;
  headerStatusBadgeClass: string;
  effectiveStatusLabel: string;
  sessionExecution: ResolvedExecutionState;
  sessionKey: string | null;
  connected: boolean;
  isSyncStale?: boolean;
  historyLoading: boolean;
  canShowSessionHistory: boolean;
  isHistoryMenuOpen: boolean;
  setIsHistoryMenuOpen: (open: boolean) => void;
  archiveId: string | null;
  sending: boolean;
  isGenerating: boolean;
  supportsSessionHistory: boolean;
  supportsSessionArchiveRestore: boolean;
  recentAgentSessions: GatewaySessionRow[];
  historySessionPresentations: Map<string, { title: string; route: string }>;
  historyRoundItems: HistoryRoundItem[];
  archiveSectionNotice: string | null;
  deletingHistorySessionKey: string | null;
  deletingArchiveId: string | null;
  restoringArchiveId: string | null;
  activeArchivedRound: RoundRecord | null;
  activeRunId: string | null;
  onNavigateToCurrentConversation: () => void;
  onNavigateToRoute: (route: string) => void;
  onNavigateToArchivedRound: (archiveId: string) => void;
  onClearSession: (mode?: "new") => Promise<unknown> | void;
  onDeleteRecentSession: (sessionKey: string) => Promise<unknown> | void;
  onRestoreArchivedRound: (archiveId: string) => Promise<unknown> | void;
  onDeleteArchivedRound: (archiveId: string) => Promise<unknown> | void;
  onStopTask: (sessionKey: string, activeRunId?: string) => void;
}) {
  const {
    isGroup,
    groupTopic,
    groupTitle,
    groupSubtitle,
    emp,
    isArchiveView,
    showRequirementStatus,
    headerStatusBadgeClass,
    effectiveStatusLabel,
    sessionExecution,
    sessionKey,
    connected,
    isSyncStale,
    historyLoading,
    canShowSessionHistory,
    isHistoryMenuOpen,
    setIsHistoryMenuOpen,
    archiveId,
    sending,
    isGenerating,
    supportsSessionHistory,
    supportsSessionArchiveRestore,
    recentAgentSessions,
    historySessionPresentations,
    historyRoundItems,
    archiveSectionNotice,
    deletingHistorySessionKey,
    deletingArchiveId,
    restoringArchiveId,
    activeArchivedRound,
    activeRunId,
    onNavigateToCurrentConversation,
    onNavigateToRoute,
    onNavigateToArchivedRound,
    onClearSession,
    onDeleteRecentSession,
    onRestoreArchivedRound,
    onDeleteArchivedRound,
    onStopTask,
  } = input;

  return (
    <>
      <header className="z-10 flex h-16 flex-none items-center justify-between border-b border-slate-200 bg-white/80 px-6 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Avatar className="h-10 w-10 rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
            <AvatarImage
              src={
                isGroup
                  ? `https://api.dicebear.com/7.x/shapes/svg?seed=${groupTopic}`
                  : getAvatarUrl(emp?.agentId, emp?.avatarJobId)
              }
              className="object-cover"
            />
            <AvatarFallback className="rounded-lg bg-slate-100 font-mono text-xs text-slate-500">
              {isGroup ? "GRP" : emp?.nickname.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                {isGroup ? groupTitle : emp?.nickname}
              </span>
              {isArchiveView ? (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                  已归档
                </span>
              ) : showRequirementStatus ? (
                <span className={headerStatusBadgeClass}>{effectiveStatusLabel}</span>
              ) : (
                <ExecutionStateBadge compact status={sessionExecution} />
              )}
            </div>
            <span className="text-[10px] text-slate-500">
              {isArchiveView
                ? "归档轮次（只读）"
                : isGroup
                  ? (groupSubtitle?.trim() || "需求团队房间")
                  : emp?.role}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-400">
            {sessionKey && connected && !isSyncStale ? (
              <>
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                <span className="select-none">会话已连接</span>
              </>
            ) : sessionKey && isSyncStale ? (
              <>
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.4)]" />
                <span className="select-none">状态可能过期</span>
              </>
            ) : (
              <>
                <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="select-none">准备中...</span>
              </>
            )}
          </div>
          {!isGroup && (historyLoading || canShowSessionHistory) ? (
            <ChatHistoryMenu
              open={isHistoryMenuOpen}
              onOpenChange={setIsHistoryMenuOpen}
              isArchiveView={isArchiveView}
              sessionKey={sessionKey}
              archiveId={archiveId}
              sending={sending}
              isGenerating={isGenerating}
              historyLoading={historyLoading}
              supportsSessionHistory={supportsSessionHistory}
              supportsSessionArchives={supportsSessionArchiveRestore}
              recentAgentSessions={recentAgentSessions}
              historySessionPresentations={historySessionPresentations}
              historyRoundItems={historyRoundItems}
              archiveSectionNotice={archiveSectionNotice}
              deletingHistorySessionKey={deletingHistorySessionKey}
              deletingArchiveId={deletingArchiveId}
              restoringArchiveId={restoringArchiveId}
              navigateToCurrentConversation={onNavigateToCurrentConversation}
              navigateToRoute={onNavigateToRoute}
              navigateToArchivedRound={onNavigateToArchivedRound}
              onClearSession={() => onClearSession("new")}
              onDeleteRecentSession={onDeleteRecentSession}
              onRestoreArchivedRound={onRestoreArchivedRound}
              onDeleteArchivedRound={onDeleteArchivedRound}
            />
          ) : null}
          {sessionKey ? (
            <button
              onClick={() => void onClearSession()}
              disabled={sending || isGenerating}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
              title="一键清理对话记忆"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
          {isGenerating && sessionKey ? (
            <button
              onClick={() => onStopTask(sessionKey!, activeRunId ?? undefined)}
              className="ml-2 cursor-pointer rounded-full p-1 text-slate-400 hover:bg-slate-200/50 hover:text-slate-600"
              title="强行中止所有下级进程"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </header>

      {isArchiveView ? (
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-col gap-1 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <span className="font-semibold text-slate-900">正在查看归档轮次。</span>
              <span className="ml-2 text-slate-600">
                这里只读显示你之前跟 {emp?.nickname ?? "当前 agent"} 的旧记录，不会覆盖当前
                live 会话。
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void onRestoreArchivedRound(archiveId!)}
                disabled={
                  !sessionKey ||
                  restoringArchiveId === archiveId ||
                  (!activeArchivedRound && !supportsSessionArchiveRestore)
                }
              >
                {restoringArchiveId === archiveId ? "正在恢复..." : "恢复为当前会话"}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition-colors hover:bg-slate-100"
                onClick={onNavigateToCurrentConversation}
              >
                返回当前会话
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
