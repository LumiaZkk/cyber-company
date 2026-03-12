import type { ReactNode } from "react";
import { ChevronDown, RefreshCcw, Users } from "lucide-react";
import type { RequirementCollaborationSurface } from "../../application/mission/requirement-collaboration-surface";
import { RequirementExecutionOverviewCard } from "../../presentation/chat/components/RequirementExecutionOverviewCard";
import { Button } from "../ui/button";
import { ExecutionStateBadge } from "../execution-state-badge";
import { formatRequestDeliveryStateLabel } from "../../application/governance/focus-summary";
import { resolveExecutionState } from "../../application/mission/execution-state";
import type { RequirementTeamMember, RequirementTeamView } from "../../application/assignment/requirement-team";
import { cn, formatTime } from "../../lib/utils";

type SummaryPanelView = "owner" | "team" | "debug";
type FocusActionTone = "primary" | "secondary" | "ghost";
type FocusActionKind = "message" | "navigate" | "recover" | "copy";

type SummaryAction = {
  id: string;
  label: string;
  description: string;
  kind: FocusActionKind;
  tone: FocusActionTone;
};

type MissionStep = {
  id: string;
  title: string;
  assigneeLabel: string;
  status: "done" | "wip" | "pending";
  statusLabel: string;
  detail?: string | null;
  isCurrent?: boolean;
  isNext?: boolean;
};

type ActiveMission = {
  statusLabel: string;
  progressLabel: string;
  title: string;
  summary: string;
  guidance: string;
  ownerLabel: string;
  currentStepLabel: string;
  nextLabel: string;
  planSteps: MissionStep[];
};

type ProgressGroupSummary = {
  working: string;
  waiting: string;
  completed: string;
};

type ProgressEvent = {
  id: string;
  timestamp: number;
  actorLabel: string;
  title: string;
  summary: string;
  detail?: string;
  tone: "slate" | "emerald" | "amber" | "rose" | "indigo";
};

type ActionWatchCard = {
  id: string;
  title: string;
  description: string;
  elapsedLabel: string;
};

type LifecycleParticipant = {
  agentId: string;
  nickname: string;
  tone: "slate" | "emerald" | "amber" | "rose" | "indigo" | "violet" | "blue";
  statusLabel: string;
  isCurrent?: boolean;
  role: string;
  stage: string;
  detail: string;
  updatedAt: number;
};

type LifecycleSection = {
  id: string;
  title: string;
  summary: string;
  items: LifecycleParticipant[];
};

type LifecycleEvent = {
  id: string;
  title: string;
  summary: string;
  detail?: string;
  timestamp: number;
  actorLabel: string;
  tone: "slate" | "emerald" | "amber" | "rose" | "indigo";
  kind: "action" | "feedback" | "state";
  isCurrent?: boolean;
};

type TeamMemberCard = RequirementTeamMember & {
  adjustAction: SummaryAction;
  isAdjustLoading: boolean;
};

type TechnicalTakeoverPack = {
  failureSummary: string;
  recommendedNextAction: string;
};

type StructuredTaskPreview = {
  summary?: string;
  state?: string | null;
};

type RequestPreview = {
  id: string;
  title: string;
  summary: string;
  responseSummary?: string;
  deliveryState?: Parameters<typeof formatRequestDeliveryStateLabel>[0];
};

type HandoffPreview = {
  id: string;
  title: string;
  summary: string;
};

type RequestHealth = {
  active: number;
  pending: number;
  acknowledged: number;
  blocked: number;
};

type CeoSurface = {
  activeBlockers: number;
  openRequests: number;
  pendingHandoffs: number;
  overdueItems: number;
  manualTakeovers: number;
};

type TimelinePreviewItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
};

export type ChatSummaryPanelBodyProps = {
  summaryPanelView: SummaryPanelView;
  activeConversationMission: ActiveMission | null;
  isRequirementBootstrapPending: boolean;
  progressGroupSummary: ProgressGroupSummary | null;
  latestProgressDisplay: ProgressEvent | null;
  missionIsCompleted: boolean;
  sending: boolean;
  isGenerating: boolean;
  recentProgressEvents: ProgressEvent[];
  actionWatchCards: ActionWatchCard[];
  lifecycleSections: LifecycleSection[];
  collaborationLifecycle: LifecycleEvent[];
  detailActions: SummaryAction[];
  runningFocusActionId: string | null;
  recoveringCommunication: boolean;
  requirementTeam: RequirementTeamView | null;
  teamMemberCards: TeamMemberCard[];
  displayNextBatonLabel: string;
  displayNextBatonAgentId: string | null;
  targetAgentId: string | null;
  teamGroupRoute: string | null;
  primaryOpenAction: SummaryAction | null;
  summaryRecoveryAction: SummaryAction | null;
  hasTechnicalSummary: boolean;
  isTechnicalSummaryOpen: boolean;
  takeoverPack: TechnicalTakeoverPack | null;
  structuredTaskPreview: StructuredTaskPreview | null;
  hasRequirementOverview: boolean;
  headerStatusBadgeClass: string;
  effectiveStatusLabel: string;
  effectiveSummary: string;
  requestPreview: RequestPreview[];
  requestHealth: RequestHealth;
  ceoSurface: CeoSurface | null;
  collaborationSurface?: RequirementCollaborationSurface | null;
  orgAdvisorSummary: string | null;
  handoffPreview: HandoffPreview[];
  summaryAlertCount: number;
  relatedSlaAlertCount: number;
  localSlaFallbackAlertCount: number;
  onClearSession: () => void;
  onRunAction: (action: SummaryAction) => void;
  onNavigateToChat: (agentId: string) => void;
  onNavigateToTeamGroup: () => void;
  onToggleTechnicalSummary: () => void;
  onCopyTakeoverPack: () => void;
};

function cardToneClass(tone: ProgressEvent["tone"] | LifecycleEvent["tone"]) {
  if (tone === "rose") {
    return "border-rose-200 bg-rose-50/60";
  }
  if (tone === "emerald") {
    return "border-emerald-200 bg-emerald-50/60";
  }
  if (tone === "indigo") {
    return "border-indigo-200 bg-indigo-50/60";
  }
  return "border-amber-200 bg-amber-50/60";
}

function participantToneClass(tone: LifecycleParticipant["tone"]) {
  if (tone === "rose") {
    return "border-rose-200 bg-rose-50/50";
  }
  if (tone === "amber") {
    return "border-amber-200 bg-amber-50/50";
  }
  if (tone === "emerald") {
    return "border-emerald-200 bg-emerald-50/50";
  }
  if (tone === "violet") {
    return "border-violet-200 bg-violet-50/50";
  }
  if (tone === "blue") {
    return "border-indigo-200 bg-indigo-50/50";
  }
  return "border-slate-200 bg-slate-50/70";
}

function TimelinePreview({
  title,
  description,
  count,
  previewItems,
  children,
}: {
  title: string;
  description: string;
  count: number;
  previewItems: TimelinePreviewItem[];
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <details className="group" open={false}>
        <summary className="list-none cursor-pointer">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" />
              {count} 条
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {previewItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-900">{item.title}</div>
                  <div className="text-[11px] text-slate-500">{item.meta}</div>
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{item.subtitle}</div>
              </div>
            ))}
          </div>
        </summary>
        <div className="mt-4 border-t border-slate-200 pt-4">{children}</div>
      </details>
    </section>
  );
}

export function ChatSummaryPanelBody({
  summaryPanelView,
  activeConversationMission,
  isRequirementBootstrapPending,
  progressGroupSummary,
  latestProgressDisplay,
  missionIsCompleted,
  sending,
  isGenerating,
  recentProgressEvents,
  actionWatchCards,
  lifecycleSections,
  collaborationLifecycle,
  detailActions,
  runningFocusActionId,
  recoveringCommunication,
  requirementTeam,
  teamMemberCards,
  displayNextBatonAgentId,
  targetAgentId,
  teamGroupRoute,
  primaryOpenAction,
  summaryRecoveryAction,
  hasTechnicalSummary,
  isTechnicalSummaryOpen,
  takeoverPack,
  structuredTaskPreview,
  hasRequirementOverview,
  headerStatusBadgeClass,
  effectiveStatusLabel,
  effectiveSummary,
  requestPreview,
  requestHealth,
  ceoSurface,
  collaborationSurface = null,
  orgAdvisorSummary,
  handoffPreview,
  summaryAlertCount,
  relatedSlaAlertCount,
  localSlaFallbackAlertCount,
  onClearSession,
  onRunAction,
  onNavigateToChat,
  onNavigateToTeamGroup,
  onToggleTechnicalSummary,
  onCopyTakeoverPack,
}: ChatSummaryPanelBodyProps) {
  const isRequirementOverviewMode =
    summaryPanelView === "owner" && Boolean(collaborationSurface);

  return (
    <div className="grid gap-4">
      {isRequirementOverviewMode ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">需求全貌</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  这里是这条需求的稳定总览。先看目标、阶段和最新有效结论，再回到聊天流处理上下文。
                </div>
              </div>
              <span className={headerStatusBadgeClass}>{effectiveStatusLabel}</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">目标</div>
                <div className="mt-2 text-sm leading-6 text-slate-900">
                  {collaborationSurface?.overviewSummary.goalSummary}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">当前阶段</div>
                <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                  {collaborationSurface?.overviewSummary.phaseLabel}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">最新有效结论</div>
                <div className="mt-2 text-sm leading-6 text-slate-900">
                  {collaborationSurface?.overviewSummary.latestConclusionSummary ?? "还没有新的有效结论。"}
                </div>
              </div>
            </div>
          </section>

          <RequirementExecutionOverviewCard
            collaborationSurface={collaborationSurface!}
            variant="panel"
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">协作与收口</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  这里看当前是谁在并行推进、有没有关键卡点，以及距离关房还差什么。
                </div>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-600">
                {collaborationSurface?.executionPlan.doneCount ?? 0}/
                {collaborationSurface?.executionPlan.totalCount ?? 0} 已完成
              </span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">活跃参与者</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {collaborationSurface?.activeParticipants.length ? (
                    collaborationSurface.activeParticipants.map((participant) => (
                      <span
                        key={participant.agentId}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                          participant.isBlocking
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : participant.isCurrent
                              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-white text-slate-600",
                        )}
                      >
                        {participant.nickname} · {participant.statusLabel}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">等待协作成员接入</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">关房条件</div>
                <div className="mt-2 text-sm leading-6 text-slate-900">
                  {collaborationSurface?.overviewSummary.closureHint}
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-500">
                  {collaborationSurface?.executionPlan.closable
                    ? "已经满足子任务完成与无阻塞条件，等待 CEO 最终归档。"
                    : "仍需补齐未完成项、阻塞项或待决策事项后才能关房。"}
                </div>
              </div>
            </div>
          </section>

          {!isRequirementBootstrapPending && detailActions.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">下一步操作</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                先看总览，再决定是否需要催推进、解阻或继续同步。
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {detailActions.map((action) => {
                  const isLoading =
                    runningFocusActionId === action.id ||
                    (action.kind === "recover" && recoveringCommunication);
                  return (
                    <div
                      key={action.id}
                      className={cn(
                        "rounded-xl border px-3 py-3",
                        action.tone === "primary"
                          ? "border-slate-300 bg-slate-50"
                          : action.tone === "secondary"
                            ? "border-indigo-200 bg-indigo-50/40"
                            : "border-slate-200 bg-white",
                      )}
                    >
                      <div className="text-sm font-medium text-slate-900">{action.label}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-600">{action.description}</div>
                      <div className="mt-3">
                        <Button
                          type="button"
                          size="sm"
                          variant={action.tone === "ghost" ? "outline" : "default"}
                          disabled={isLoading}
                          className={cn(
                            action.tone === "primary" && "bg-slate-900 text-white hover:bg-slate-800",
                            action.tone === "secondary" && "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50",
                          )}
                          onClick={() => onRunAction(action)}
                        >
                          {isLoading ? (
                            <>
                              <RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />
                              {action.kind === "recover" ? "同步中..." : "发送中..."}
                            </>
                          ) : (
                            action.label
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : summaryPanelView === "owner" ? (
        <>
          {activeConversationMission ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">本轮规划/任务</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    这一轮对话只解决这一份规划/任务。你继续跟 CEO 聊，就是在调整这份规划/任务，CEO 会持续更新并负责收口。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-600">
                    状态 {activeConversationMission.statusLabel}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-600">
                    进度 {activeConversationMission.progressLabel}
                  </span>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="text-sm font-semibold text-slate-900">{activeConversationMission.title}</div>
                <div className="mt-2 text-sm leading-6 text-slate-800">{activeConversationMission.summary}</div>
                <div className="mt-2 text-xs leading-5 text-slate-500">{activeConversationMission.guidance}</div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">当前负责人</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{activeConversationMission.ownerLabel}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">这轮规划/任务由他负责持续推进和回收结果。</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">当前待办</div>
                  <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">{activeConversationMission.currentStepLabel}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">{activeConversationMission.guidance}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">下一棒</div>
                  <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">{activeConversationMission.nextLabel}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">
                    {missionIsCompleted ? "这轮已经收口，可以复盘或开启下一轮。" : "用它判断这条链是不是继续往下走。"}
                  </div>
                </div>
              </div>
              {!isRequirementBootstrapPending && progressGroupSummary ? (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3">
                    <div className="text-xs font-semibold text-indigo-700">正在工作</div>
                    <div className="mt-2 text-sm leading-6 text-slate-800">{progressGroupSummary.working}</div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                    <div className="text-xs font-semibold text-amber-800">等待接棒</div>
                    <div className="mt-2 text-sm leading-6 text-slate-800">{progressGroupSummary.waiting}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                    <div className="text-xs font-semibold text-emerald-700">已完成本轮</div>
                    <div className="mt-2 text-sm leading-6 text-slate-800">{progressGroupSummary.completed}</div>
                  </div>
                </div>
              ) : null}
              {activeConversationMission.planSteps.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-semibold text-slate-900">计划与待办</div>
                  <div className="text-xs leading-5 text-slate-500">
                    这是当前对话真正正在解决的 plan。后续你继续聊，改的是这一份，不会另起一套。
                  </div>
                  {activeConversationMission.planSteps.map((step) => (
                    <div
                      key={step.id}
                      className={cn(
                        "rounded-xl border px-4 py-3",
                        step.status === "done"
                          ? "border-emerald-200 bg-emerald-50/50"
                          : step.isCurrent
                            ? "border-amber-200 bg-amber-50/60"
                            : step.isNext
                              ? "border-indigo-200 bg-indigo-50/50"
                              : "border-slate-200 bg-slate-50/70",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-slate-900">{step.title}</div>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px]",
                            step.status === "done"
                              ? "border-emerald-200 bg-white text-emerald-700"
                              : step.isCurrent
                                ? "border-amber-200 bg-white text-amber-800"
                                : step.isNext
                                  ? "border-indigo-200 bg-white text-indigo-700"
                                  : "border-slate-200 bg-white text-slate-600",
                          )}
                        >
                          {step.statusLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        负责人：{step.assigneeLabel}
                        {step.isCurrent ? " · 当前待办" : step.isNext ? " · 下一棒" : ""}
                      </div>
                      {step.detail ? <div className="mt-2 text-sm leading-6 text-slate-700">{step.detail}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {latestProgressDisplay ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">最新反馈</div>
                    <div className="text-[11px] text-slate-500">{formatTime(latestProgressDisplay.timestamp)}</div>
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {latestProgressDisplay.actorLabel} · {latestProgressDisplay.title}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-slate-700">{latestProgressDisplay.summary}</div>
                </div>
              ) : null}
              {missionIsCompleted ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4">
                  <div className="text-sm font-semibold text-emerald-800">这轮规划/任务已完成</div>
                  <div className="mt-1 text-sm leading-6 text-slate-700">
                    你现在可以继续跟 CEO 做总结复盘，或者直接开启下一轮新的规划/任务。
                  </div>
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-emerald-700 text-white hover:bg-emerald-800"
                      onClick={onClearSession}
                      disabled={sending || isGenerating}
                    >
                      开启下一轮规划/任务
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {!isRequirementBootstrapPending && recentProgressEvents.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">最近操作回执</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                这里只看刚才发出的动作有没有被其他会话接住、有没有新的回传。当前窗口里的正常回复会直接留在正文里。
              </div>
              <div className="mt-3 space-y-2">
                {recentProgressEvents.slice(0, 4).map((event) => (
                  <div key={event.id} className={cn("rounded-xl border px-3 py-3", cardToneClass(event.tone))}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900">{event.title}</div>
                      <div className="text-[11px] text-slate-500">
                        {formatTime(event.timestamp)} · {event.actorLabel}
                      </div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-800">{event.summary}</div>
                    {event.detail ? <div className="mt-1 text-xs leading-5 text-slate-600">{event.detail}</div> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!isRequirementBootstrapPending && actionWatchCards.length > 0 ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="text-sm font-semibold text-amber-950">当前等待回执</div>
              <div className="mt-1 text-xs leading-5 text-amber-800">
                这些动作已经发出。系统正在持续盯新消息，一旦有明确回执会自动同步回来。
              </div>
              <div className="mt-3 space-y-2">
                {actionWatchCards.map((watch) => (
                  <div key={watch.id} className="rounded-xl border border-amber-200 bg-white/90 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900">{watch.title}</div>
                      <div className="text-[11px] text-slate-500">{watch.elapsedLabel}</div>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-600">{watch.description}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!isRequirementBootstrapPending && lifecycleSections.length > 0 ? (
            <TimelinePreview
              title="协作生命周期"
              description="默认只看最近几个关键节点，需要时再展开完整生命周期。"
              count={lifecycleSections.reduce((sum, section) => sum + section.items.length, 0)}
              previewItems={lifecycleSections
                .flatMap((section) =>
                  section.items.map((participant) => ({
                    id: `${section.id}:${participant.agentId}`,
                    title: `${participant.nickname} · ${participant.statusLabel}`,
                    subtitle: `${section.title} · ${participant.stage}`,
                    meta: formatTime(participant.updatedAt),
                  })),
                )
                .slice(0, 3)}
            >
              <div className="space-y-4">
                {lifecycleSections.map((section) => (
                  <div key={section.id} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">{section.title}</div>
                      <div className="text-[11px] text-slate-500">{section.summary}</div>
                    </div>
                    <div className="space-y-2">
                      {section.items.map((participant) => (
                        <div
                          key={participant.agentId}
                          className={cn(
                            "rounded-xl border px-4 py-3",
                            participant.isCurrent ? "border-rose-200 bg-rose-50/70" : participantToneClass(participant.tone),
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-medium text-slate-900">{participant.nickname}</div>
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                                  {participant.statusLabel}
                                </span>
                                {participant.isCurrent ? (
                                  <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] text-rose-700">
                                    当前关键节点
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {participant.role} · 当前环节：{participant.stage}
                              </div>
                            </div>
                            {participant.agentId !== targetAgentId ? (
                              <Button type="button" size="sm" variant="outline" onClick={() => onNavigateToChat(participant.agentId)}>
                                打开 {participant.nickname}
                              </Button>
                            ) : null}
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-700">{participant.detail}</div>
                          <div className="mt-2 text-[11px] text-slate-400">最近更新：{formatTime(participant.updatedAt)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TimelinePreview>
          ) : !isRequirementBootstrapPending && collaborationLifecycle.length > 0 ? (
            <TimelinePreview
              title="协作生命周期"
              description="默认只看最近的关键流转，展开后再看完整历史。"
              count={collaborationLifecycle.length}
              previewItems={collaborationLifecycle.slice(0, 3).map((event) => ({
                id: event.id,
                title: `${event.actorLabel} · ${event.title}`,
                subtitle: event.summary,
                meta: formatTime(event.timestamp),
              }))}
            >
              <div className="space-y-2">
                {collaborationLifecycle.map((event) => (
                  <div key={event.id} className={cn("rounded-xl border px-3 py-3", cardToneClass(event.tone))}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900">{event.title}</div>
                      <div className="text-[11px] text-slate-500">
                        {formatTime(event.timestamp)} · {event.actorLabel}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="rounded-full border border-white/80 bg-white/90 px-2 py-0.5">
                        {event.kind === "action" ? "已发出动作" : event.kind === "feedback" ? "收到反馈" : "当前状态"}
                      </span>
                      {event.isCurrent ? (
                        <span className="rounded-full border border-slate-200 bg-white/90 px-2 py-0.5">当前关键节点</span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-800">{event.summary}</div>
                    {event.detail ? <div className="mt-2 text-xs leading-5 text-slate-600">{event.detail}</div> : null}
                  </div>
                ))}
              </div>
            </TimelinePreview>
          ) : null}

          {!isRequirementBootstrapPending && detailActions.length > 0 ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">你现在可以做什么</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">先按主操作推进。如果结果已经出来但页面还没同步，再点“同步当前阻塞”。</div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {detailActions.map((action) => {
                  const isLoading = runningFocusActionId === action.id || (action.kind === "recover" && recoveringCommunication);
                  return (
                    <div
                      key={action.id}
                      className={cn(
                        "rounded-xl border px-3 py-3",
                        action.tone === "primary"
                          ? "border-slate-300 bg-slate-50"
                          : action.tone === "secondary"
                            ? "border-indigo-200 bg-indigo-50/40"
                            : "border-slate-200 bg-white",
                      )}
                    >
                      <div className="text-sm font-medium text-slate-900">{action.label}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-600">{action.description}</div>
                      <div className="mt-3">
                        <Button
                          type="button"
                          size="sm"
                          variant={action.tone === "ghost" ? "outline" : "default"}
                          disabled={isLoading}
                          className={cn(
                            action.tone === "primary" && "bg-slate-900 text-white hover:bg-slate-800",
                            action.tone === "secondary" && "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50",
                          )}
                          onClick={() => onRunAction(action)}
                        >
                          {isLoading ? (
                            <>
                              <RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />
                              {action.kind === "recover" ? "同步中..." : "发送中..."}
                            </>
                          ) : (
                            action.label
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {summaryPanelView === "team" && requirementTeam ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">团队总览</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">负责人盯闭环，团队房间盯 baton、成员状态和结论发言。</div>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600">
                进度 {requirementTeam.progressLabel}
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/80 bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  协作模式
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {collaborationSurface?.collaborationLabel ?? "多人并行"}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-600">
                  负责人：{requirementTeam.ownerLabel}
                </div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  当前卡点
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {collaborationSurface?.overviewSummary.currentBlocker ?? "暂无明确卡点"}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-600">多人协作默认并行推进，不强调单一接棒。</div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">当前判断</div>
                <div className="mt-2 text-sm leading-6 text-slate-800">{requirementTeam.summary}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {teamGroupRoute ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                  onClick={onNavigateToTeamGroup}
                >
                  <Users className="mr-2 h-3.5 w-3.5" />
                  打开需求团队房间
                </Button>
              ) : null}
              {primaryOpenAction ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                  onClick={() => onRunAction(primaryOpenAction)}
                >
                  {primaryOpenAction.label}
                </Button>
              ) : null}
              {summaryRecoveryAction ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                  onClick={() => onRunAction(summaryRecoveryAction)}
                >
                  同步当前阻塞
                </Button>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">团队成员</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">这里只看这条需求相关的人。你可以直接打开会话，或者打断让他调整处理方式。</div>
            <div className="mt-4 space-y-3">
              {teamMemberCards.map((member) => (
                <div key={member.agentId} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-slate-900">{member.label}</div>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                          {member.statusLabel}
                        </span>
                        {member.isOwner ? (
                          <span className="rounded-full border border-slate-200 bg-slate-900 px-2 py-0.5 text-[11px] text-white">负责人</span>
                        ) : null}
                        {member.isCurrent ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                            当前活跃
                          </span>
                        ) : null}
                        {!collaborationSurface?.isSingleOwnerClosure &&
                        (displayNextBatonAgentId === member.agentId || member.isNext) ? (
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                            下一棒
                          </span>
                          ) : null}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {member.role} · 当前环节：{member.stage}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">{member.detail}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {member.agentId !== targetAgentId ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => onNavigateToChat(member.agentId)}>
                          打开会话
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={member.isAdjustLoading}
                        className="border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                        onClick={() => onRunAction(member.adjustAction)}
                      >
                        {member.isAdjustLoading ? (
                          <>
                            <RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />
                            处理中...
                          </>
                        ) : (
                          `让 ${member.label} 调整`
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <TimelinePreview
            title="群聊式时间线"
            description="默认只看最近几条关键发言，展开后再看完整协作历史。"
            count={requirementTeam.timeline.length}
            previewItems={requirementTeam.timeline.slice(0, 3).map((event) => ({
              id: event.id,
              title: `${event.agentLabel} · ${event.headline}`,
              subtitle: event.summary,
              meta: formatTime(event.timestamp),
            }))}
          >
            <div className="space-y-3">
              {requirementTeam.timeline.map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium text-slate-900">{event.agentLabel}</div>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                        {event.kind === "dispatch" ? "收到指令" : event.kind === "reply" ? "结论发言" : "团队状态"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">{formatTime(event.timestamp)}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">{event.role}</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">{event.headline}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-700">{event.summary}</div>
                  {event.detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{event.detail}</div> : null}
                </div>
              ))}
            </div>
          </TimelinePreview>

          {requirementTeam.artifacts.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">交付物</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">这里看这条需求已经落下来的文件，方便判断某一步到底有没有真正交付。</div>
              <div className="mt-3 space-y-2">
                {requirementTeam.artifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{artifact.label}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {artifact.ownerLabel} · {artifact.path}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        artifact.exists
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-800",
                      )}
                    >
                      {artifact.exists ? "已落盘" : "未找到"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {summaryPanelView === "debug" && hasTechnicalSummary ? (
        <section className="rounded-xl border border-slate-200 bg-white/90">
          <button
            type="button"
            className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
            onClick={onToggleTechnicalSummary}
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">调试信息</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">这里只保留系统对象和异常提示，默认不影响正常阅读。</div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isTechnicalSummaryOpen && "rotate-180")} />
              {isTechnicalSummaryOpen ? "收起细节" : "展开细节"}
            </span>
          </button>
          {isTechnicalSummaryOpen ? (
            <div className="border-t border-slate-200 px-4 py-4">
              <div className="grid gap-4">
                {takeoverPack ? (
                  <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-amber-950">人工接管包</div>
                        <div className="mt-1 text-xs leading-5 text-amber-800">{takeoverPack.failureSummary}</div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-amber-200 bg-white text-amber-900 hover:bg-amber-100"
                        onClick={onCopyTakeoverPack}
                      >
                        复制接管包
                      </Button>
                    </div>
                    <div className="mt-3 text-sm text-slate-800">{takeoverPack.recommendedNextAction}</div>
                  </section>
                ) : null}
                {structuredTaskPreview ? (
                  <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-slate-900">任务摘要</div>
                      {hasRequirementOverview ? (
                        <span className={headerStatusBadgeClass}>{effectiveStatusLabel}</span>
                      ) : structuredTaskPreview.state ? (
                        <ExecutionStateBadge
                          compact
                          status={resolveExecutionState({
                            fallbackState: undefined,
                            evidenceTexts: [structuredTaskPreview.summary ?? ""],
                          })}
                        />
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm text-slate-700">{hasRequirementOverview ? effectiveSummary : structuredTaskPreview.summary}</div>
                  </section>
                ) : null}
                {requestPreview.length > 0 ? (
                  <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                    <div className="text-sm font-semibold text-sky-950">请求闭环</div>
                    <div className="mt-1 text-xs leading-5 text-sky-800">
                      活跃 {requestHealth.active} · 待答 {requestHealth.pending} · 已接单 {requestHealth.acknowledged} · 阻塞 {requestHealth.blocked}
                    </div>
                    <div className="mt-3 space-y-2">
                      {requestPreview.slice(0, 3).map((request) => (
                        <div key={request.id} className="rounded-lg border border-sky-200 bg-white/90 px-3 py-3 text-sm text-slate-800">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-slate-900">{request.title}</div>
                            <div className="text-[11px] font-medium text-sky-700">
                              {formatRequestDeliveryStateLabel(request.deliveryState)}
                            </div>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-600">
                            {request.responseSummary ?? request.summary}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                {ceoSurface ? (
                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-950">CEO 控制面</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      阻塞 {ceoSurface.activeBlockers} · 请求 {ceoSurface.openRequests} · 交接 {ceoSurface.pendingHandoffs} · SLA {ceoSurface.overdueItems} · 接管 {ceoSurface.manualTakeovers}
                    </div>
                    {orgAdvisorSummary ? <div className="mt-2 text-xs leading-5 text-slate-600">{orgAdvisorSummary}</div> : null}
                  </section>
                ) : null}
                {handoffPreview.length > 0 ? (
                  <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
                    <div className="text-sm font-semibold text-violet-950">交接摘要</div>
                    <div className="mt-3 space-y-2">
                      {handoffPreview.slice(0, 3).map((handoff) => (
                        <div key={handoff.id} className="rounded-lg border border-violet-200 bg-white/90 px-3 py-2 text-xs text-slate-700">
                          <div className="font-medium text-slate-900">{handoff.title}</div>
                          <div className="mt-1">{handoff.summary}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                {summaryAlertCount > 0 ? (
                  <section className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
                    <div className="text-sm font-semibold text-rose-950">升级提醒</div>
                    <div className="mt-1 text-xs text-rose-700">
                      {relatedSlaAlertCount > 0 ? `${relatedSlaAlertCount} 条升级规则命中` : `${localSlaFallbackAlertCount} 条会话级 SLA 提示`}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
