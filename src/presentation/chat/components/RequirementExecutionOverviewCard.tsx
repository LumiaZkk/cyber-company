import { AlertCircle, Clock3, Flag, Gauge, Users } from "lucide-react";
import { cn } from "../../../lib/utils";
import type {
  RequirementCollaborationSurface,
  RequirementExecutionTaskStatus,
} from "../../../application/mission/requirement-collaboration-surface";

function statusClassName(status: RequirementExecutionTaskStatus): string {
  switch (status) {
    case "已完成":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "已提交待收口":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "进行中":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "已接单":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "已派发":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "已阻塞":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "未启动":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function participantToneClassName(isBlocking: boolean, isCurrent: boolean): string {
  if (isBlocking) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (isCurrent) {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }
  return "border-slate-200 bg-white text-slate-600";
}

export function RequirementExecutionOverviewCard(input: {
  collaborationSurface: RequirementCollaborationSurface;
  variant?: "panel" | "inline";
}) {
  const { collaborationSurface } = input;
  const variant = input.variant ?? "inline";
  const isPanel = variant === "panel";
  const { executionPlan } = collaborationSurface;

  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200 bg-white/90 shadow-sm",
        isPanel ? "px-4 py-4 shadow-none" : "px-4 py-4",
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                多人协作态
              </span>
              {executionPlan.closable ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  可收口
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">执行总览</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              目标：{collaborationSurface.overviewSummary.goalSummary}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>
                <span className="font-medium text-slate-700">当前阶段：</span>
                {collaborationSurface.overviewSummary.phaseLabel}
              </span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span>
                <span className="font-medium text-slate-700">协作模式：</span>
                {collaborationSurface.collaborationLabel}
              </span>
              {collaborationSurface.isSingleOwnerClosure && collaborationSurface.closureOwnerLabel ? (
                <>
                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                  <span>
                    <span className="font-medium text-slate-700">当前收口人：</span>
                    {collaborationSurface.closureOwnerLabel}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="w-full shrink-0 rounded-2xl border border-slate-200 bg-slate-50/90 p-3 lg:w-[22rem]">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>整体进度</span>
              <span>
                {executionPlan.doneCount}/{executionPlan.totalCount}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  executionPlan.blockedCount > 0 ? "bg-rose-400" : "bg-indigo-500",
                )}
                style={{ width: `${Math.max(6, executionPlan.progressPct)}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[11px] text-slate-500">总子任务</div>
                <div className="mt-1 font-semibold text-slate-900">{executionPlan.totalCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[11px] text-slate-500">已完成</div>
                <div className="mt-1 font-semibold text-emerald-700">{executionPlan.doneCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[11px] text-slate-500">进行中</div>
                <div className="mt-1 font-semibold text-indigo-700">{executionPlan.inProgressCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[11px] text-slate-500">阻塞</div>
                <div className="mt-1 font-semibold text-rose-700">{executionPlan.blockedCount}</div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">
              {collaborationSurface.overviewSummary.closureHint}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <Users className="h-3.5 w-3.5" />
              协作成员
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {collaborationSurface.activeParticipants.length > 0 ? (
                collaborationSurface.activeParticipants.map((participant) => (
                  <div
                    key={participant.agentId}
                    className={cn(
                      "min-w-[11rem] rounded-2xl border px-3 py-2",
                      participantToneClassName(participant.isBlocking, participant.isCurrent),
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{participant.nickname}</span>
                      <span className="text-[11px]">{participant.statusLabel}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">{participant.role}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-600">{participant.detail}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                  暂时还没有协作成员状态，等待第一轮明确派单。
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <AlertCircle className="h-3.5 w-3.5" />
                当前卡点
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {collaborationSurface.overviewSummary.currentBlocker ?? "当前没有明确卡点，协作可继续推进。"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <Flag className="h-3.5 w-3.5" />
                最新有效结论
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {collaborationSurface.overviewSummary.latestConclusionSummary ?? "还没有新的有效结论。"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Gauge className="h-3.5 w-3.5" />
            子任务状态
          </div>
          <div className="mt-3 grid gap-2">
            {executionPlan.tasks.length > 0 ? (
              executionPlan.tasks.map((task) => (
                <div
                  key={task.id}
                  className="grid gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 lg:grid-cols-[auto_minmax(0,1fr)_auto]"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    {String(task.index).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{task.title}</span>
                      <span className="text-[11px] text-slate-500">负责人：{task.ownerLabel}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{task.latestUpdateSummary}</p>
                  </div>
                  <div className="flex items-start justify-start lg:justify-end">
                    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", statusClassName(task.status))}>
                      {task.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-6 text-sm text-slate-500">
                还没有可追踪的执行项，先让 CEO 明确拆解计划后再进入并行推进。
              </div>
            )}
          </div>
          {executionPlan.tasks.length > 0 ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              <span>“已提交待收口”会计入整体完成度，但关房仍需 CEO 最终收口。</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
