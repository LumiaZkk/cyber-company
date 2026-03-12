import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, MoreHorizontal, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { ResolvedExecutionState } from "../../../application/mission/execution-state";
import type { RequirementCollaborationSurface } from "../../../application/mission/requirement-collaboration-surface";
import { ExecutionStateBadge } from "../../../components/execution-state-badge";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import type { FocusActionButton } from "../view-models/focus";

export function ChatMissionStrip(input: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showRequirementContextTag: boolean;
  isGroup: boolean;
  isRequirementBootstrapPending: boolean;
  stableDisplayWorkItem: boolean;
  sessionExecution: ResolvedExecutionState;
  effectiveHeadline: string;
  effectiveTone: "rose" | "amber" | "emerald" | "indigo" | string;
  effectiveStatusLabel: string;
  effectiveOwnerLabel: string;
  effectiveStepLabel: string;
  effectiveStage: string;
  displayNextBatonLabel: string;
  collaborationSurface?: RequirementCollaborationSurface | null;
  missionIsCompleted: boolean;
  sending: boolean;
  isGenerating: boolean;
  primaryOpenAction: FocusActionButton | null;
  promotionActionLabel?: string | null;
  showRequirementTeamEntry: boolean;
  hasTeamGroupRoute: boolean;
  showSettledRequirementSummary?: boolean;
  settledRequirementSummary?: string | null;
  settledRequirementNextAction?: string | null;
  hasContextSummary: boolean;
  onClearSession: () => Promise<unknown> | void;
  onRunPrimaryAction: (action: FocusActionButton) => Promise<unknown> | void;
  onRunPromotionAction?: (() => Promise<unknown> | void) | null;
  onOpenRequirementTeam: () => void;
  onOpenSummaryPanel: () => void;
  summaryPanel: ReactNode;
}) {
  const {
    open,
    onOpenChange,
    showRequirementContextTag,
    isGroup,
    isRequirementBootstrapPending,
    stableDisplayWorkItem,
    sessionExecution,
    effectiveHeadline,
    effectiveTone,
    effectiveStatusLabel,
    effectiveOwnerLabel,
    effectiveStepLabel,
    displayNextBatonLabel,
    collaborationSurface = null,
    missionIsCompleted,
    sending,
    isGenerating,
    primaryOpenAction,
    promotionActionLabel,
    showRequirementTeamEntry,
    hasTeamGroupRoute,
    showSettledRequirementSummary = false,
    settledRequirementSummary = null,
    settledRequirementNextAction = null,
    hasContextSummary,
    onClearSession,
    onRunPrimaryAction,
    onRunPromotionAction,
    onOpenRequirementTeam,
    onOpenSummaryPanel,
    summaryPanel,
  } = input;
  const hasSecondaryActions = hasContextSummary;
  const showCollaborationMode = isGroup && Boolean(collaborationSurface);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <div className="border-b border-slate-200 bg-white/80 shadow-sm">
        <div className="px-6 py-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {showRequirementContextTag ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {isGroup
                        ? "需求团队房间"
                        : isRequirementBootstrapPending
                          ? "恢复中"
                          : stableDisplayWorkItem
                            ? "当前主线"
                            : "本轮规划/任务"}
                    </span>
                  ) : (
                    <ExecutionStateBadge status={sessionExecution} />
                  )}
                  <span className="text-sm font-semibold text-slate-900">{effectiveHeadline}</span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      effectiveTone === "rose"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : effectiveTone === "amber"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : effectiveTone === "emerald"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : effectiveTone === "indigo"
                              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    {effectiveStatusLabel}
                  </span>
                  {showSettledRequirementSummary ? (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      已收敛需求
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-slate-600">
                  {showCollaborationMode ? (
                    <>
                      <span>
                        <span className="font-medium text-slate-700">当前阶段：</span>
                        {collaborationSurface?.headerSummary.phaseLabel ?? effectiveStepLabel}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span>
                        <span className="font-medium text-slate-700">活跃参与者：</span>
                        {collaborationSurface?.headerSummary.activeParticipantsLabel ?? "等待成员接入"}
                      </span>
                      {collaborationSurface?.headerSummary.currentBlocker ? (
                        <>
                          <span className="h-1 w-1 rounded-full bg-slate-300" />
                          <span className="min-w-0 max-w-full text-[11px] text-slate-500">
                            <span className="font-medium text-slate-700">当前卡点：</span>
                            {collaborationSurface.headerSummary.currentBlocker}
                          </span>
                        </>
                      ) : null}
                      {collaborationSurface?.isSingleOwnerClosure &&
                      collaborationSurface.closureOwnerLabel ? (
                        <>
                          <span className="h-1 w-1 rounded-full bg-slate-300" />
                          <span>
                            <span className="font-medium text-slate-700">当前收口人：</span>
                            {collaborationSurface.closureOwnerLabel}
                          </span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span>
                        <span className="font-medium text-slate-700">负责人：</span>
                        {effectiveOwnerLabel}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span>
                        <span className="font-medium text-slate-700">步骤：</span>
                        {effectiveStepLabel}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span>
                        <span className="font-medium text-slate-700">下一棒：</span>
                        {displayNextBatonLabel}
                      </span>
                    </>
                  )}
                  {showSettledRequirementSummary && settledRequirementSummary ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-indigo-300" />
                      <span className="inline-flex min-w-0 max-w-full items-center rounded-full border border-indigo-100 bg-indigo-50/80 px-2 py-0.5 text-[11px] text-indigo-700">
                        <span className="font-medium">收敛：</span>
                        <span className="ml-1 max-w-[32rem] truncate">{settledRequirementSummary}</span>
                      </span>
                    </>
                  ) : null}
                  {showSettledRequirementSummary && settledRequirementNextAction ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span className="min-w-0 max-w-full text-[11px] text-slate-500">
                        <span className="font-medium text-slate-600">下一步：</span>
                        {settledRequirementNextAction}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {showCollaborationMode && hasContextSummary ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-slate-300 bg-white px-2.5 text-xs text-slate-900 hover:bg-slate-100"
                    onClick={onOpenSummaryPanel}
                  >
                    {open ? "规划/任务面板已开" : "查看规划/任务面板"}
                  </Button>
                ) : null}
                {showRequirementTeamEntry && !isGroup ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={hasTeamGroupRoute ? "default" : "outline"}
                    className={
                      hasTeamGroupRoute
                        ? "h-8 bg-slate-900 px-2.5 text-xs text-white hover:bg-slate-800"
                        : "h-8 border-slate-300 bg-white px-2.5 text-xs text-slate-900 hover:bg-slate-100"
                    }
                    onClick={onOpenRequirementTeam}
                  >
                    <Users className="mr-2 h-3.5 w-3.5" />
                    {hasTeamGroupRoute ? "打开需求房间" : "查看需求团队"}
                  </Button>
                ) : null}
                {missionIsCompleted ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-emerald-200 bg-emerald-50 px-2.5 text-xs text-emerald-700 hover:bg-emerald-100"
                    onClick={() => void onClearSession()}
                    disabled={sending || isGenerating}
                  >
                    开启下一轮规划/任务
                  </Button>
                ) : null}
                {primaryOpenAction && !showCollaborationMode ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      showRequirementTeamEntry
                        ? "outline"
                        : primaryOpenAction.kind === "message"
                          ? "default"
                          : "outline"
                    }
                    className={
                      showRequirementTeamEntry
                        ? "h-8 border-slate-300 bg-white px-2.5 text-xs text-slate-900 hover:bg-slate-100"
                        : primaryOpenAction.kind === "message"
                        ? "h-8 bg-slate-900 px-2.5 text-xs text-white hover:bg-slate-800"
                        : "h-8 border-slate-300 bg-white px-2.5 text-xs text-slate-900 hover:bg-slate-100"
                    }
                    onClick={() => void onRunPrimaryAction(primaryOpenAction)}
                  >
                    {primaryOpenAction.label}
                  </Button>
                ) : null}
                {!primaryOpenAction && promotionActionLabel && onRunPromotionAction ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 bg-slate-900 px-2.5 text-xs text-white hover:bg-slate-800"
                    onClick={() => void onRunPromotionAction()}
                    disabled={sending || isGenerating}
                  >
                    {promotionActionLabel}
                  </Button>
                ) : null}
                {hasSecondaryActions ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 border-slate-300 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        <MoreHorizontal className="mr-1.5 h-3.5 w-3.5" />
                        更多
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-50 w-56 bg-white">
                      {!showCollaborationMode && hasContextSummary ? (
                        <DropdownMenuItem onClick={onOpenSummaryPanel}>
                          <ChevronDown className="mr-2 h-4 w-4" />
                          {open ? "规划/任务面板已开" : "查看规划/任务面板"}
                        </DropdownMenuItem>
                      ) : null}
                      {showCollaborationMode && primaryOpenAction ? (
                        <DropdownMenuItem onClick={() => void onRunPrimaryAction(primaryOpenAction)}>
                          {primaryOpenAction.label}
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      {hasContextSummary && open ? summaryPanel : null}
    </Dialog.Root>
  );
}
