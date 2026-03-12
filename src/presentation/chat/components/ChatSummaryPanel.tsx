import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Suspense, lazy } from "react";
import type { ChatSummaryPanelBodyProps } from "../../../components/chat/chat-summary-panel-body";
import { cn } from "../../../lib/utils";

const ChatSummaryPanelBody = lazy(
  () => import("../../../components/chat/chat-summary-panel-body.runtime"),
);

type SummaryPanelView = "owner" | "team" | "debug";

export function ChatSummaryPanel(
  input: {
    open: boolean;
    summaryPanelView: SummaryPanelView;
    isGroup: boolean;
    hasTechnicalSummary: boolean;
    effectiveHeadline: string;
    headerStatusBadgeClass: string;
    effectiveStatusLabel: string;
    effectiveOwnerLabel: string;
    requirementTeamBatonLabel?: string | null;
    displayNextBatonLabel: string;
    effectiveStage: string;
    effectiveActionHint: string;
    onSummaryPanelViewChange: (view: SummaryPanelView) => void;
  } & ChatSummaryPanelBodyProps,
) {
  const {
    open,
    summaryPanelView,
    isGroup,
    hasTechnicalSummary,
    effectiveHeadline,
    headerStatusBadgeClass,
    effectiveStatusLabel,
    effectiveOwnerLabel,
    requirementTeamBatonLabel,
    displayNextBatonLabel,
    effectiveStage,
    effectiveActionHint,
    onSummaryPanelViewChange,
    ...bodyProps
  } = input;

  if (!open) {
    return null;
  }

  const collaborationSurface = bodyProps.collaborationSurface ?? null;
  const collaborationPanel = isGroup && Boolean(collaborationSurface);
  const panelTitle = collaborationPanel ? "需求协作总览" : "规划/任务面板";
  const panelDescription = collaborationPanel
    ? "聊天流只保留协作时间线。这里集中看这条需求的全貌、子任务进度、协作状态和收口条件。"
    : "聊天流和规划/任务流分开看。这里集中看本轮 plan、进度、当前卡点和下一步。";
  const summaryTitle =
    summaryPanelView === "team"
      ? "团队时间线"
      : summaryPanelView === "debug"
        ? "调试信息"
        : collaborationPanel
          ? "当前需求总览"
          : effectiveHeadline;
  const summaryMeta =
    summaryPanelView === "team"
      ? collaborationPanel
        ? `多人协作 · ${collaborationSurface?.activeParticipantsLabel ?? "等待成员接入"}`
        : `负责人：${effectiveOwnerLabel} · 当前 baton：${requirementTeamBatonLabel ?? effectiveOwnerLabel} · 下一棒：${displayNextBatonLabel}`
      : summaryPanelView === "debug"
        ? "这里只保留系统对象、闭环、交接和异常数据。"
        : collaborationPanel
          ? `阶段：${collaborationSurface?.overviewSummary.phaseLabel ?? effectiveStage} · 当前卡点：${collaborationSurface?.overviewSummary.currentBlocker ?? "暂无明确卡点"}`
          : `当前负责人：${effectiveOwnerLabel} · 当前环节：${effectiveStage}`;
  const summaryHint =
    summaryPanelView === "team"
      ? "这里按群聊式时间线展示团队成员的结论性发言、交付物和关键进展，不展示工具噪音。"
      : summaryPanelView === "debug"
        ? "普通使用时可以不看；只有在排障、查闭环或核对内部对象时再打开。"
        : collaborationPanel
          ? "先看这条需求的目标、进度、子任务和关房条件，再回到聊天流处理具体上下文。"
          : effectiveActionHint;

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/20 backdrop-blur-[1px]" />
      <Dialog.Content className="fixed inset-y-0 right-0 z-[81] w-full max-w-[min(100vw,42rem)] border-l border-slate-200 bg-white shadow-2xl focus:outline-none">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-base font-semibold text-slate-900">
                  {panelTitle}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-6 text-slate-500">
                  {panelDescription}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                  aria-label="关闭任务面板"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{summaryTitle}</span>
                {summaryPanelView !== "debug" ? (
                  <span className={headerStatusBadgeClass}>{effectiveStatusLabel}</span>
                ) : null}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-600">{summaryMeta}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{summaryHint}</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSummaryPanelViewChange("owner")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  summaryPanelView === "owner"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {collaborationPanel ? "需求总览" : "负责人视角"}
              </button>
              {bodyProps.requirementTeam ? (
                <button
                  type="button"
                  onClick={() => onSummaryPanelViewChange("team")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    summaryPanelView === "team"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {collaborationPanel ? "团队时间线" : "需求团队"}
                </button>
              ) : null}
              {hasTechnicalSummary ? (
                <button
                  type="button"
                  onClick={() => onSummaryPanelViewChange("debug")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    summaryPanelView === "debug"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  调试
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <Suspense
              fallback={
                <div className="grid gap-4">
                  <div className="animate-pulse rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="h-4 w-28 rounded bg-slate-200" />
                    <div className="mt-3 h-3 w-full rounded bg-slate-200" />
                    <div className="mt-2 h-3 w-3/4 rounded bg-slate-200" />
                  </div>
                  <div className="animate-pulse rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="h-4 w-24 rounded bg-slate-200" />
                    <div className="mt-3 h-24 rounded-xl bg-slate-200" />
                  </div>
                </div>
              }
            >
              <ChatSummaryPanelBody
                summaryPanelView={summaryPanelView}
                hasTechnicalSummary={hasTechnicalSummary}
                headerStatusBadgeClass={headerStatusBadgeClass}
                effectiveStatusLabel={effectiveStatusLabel}
                displayNextBatonLabel={displayNextBatonLabel}
                {...bodyProps}
              />
            </Suspense>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
