import {
  BarChart,
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  Copy,
  GitFork,
  MessageSquare,
  Play,
  Server,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { formatKnowledgeKindLabel } from "../../../application/artifact/shared-knowledge";
import type { SharedKnowledgeKind } from "../../../domain/artifact/types";
import { ActionFormDialog } from "../../../components/ui/action-form-dialog";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { ImmersiveHireDialog, type HireConfig } from "../../../components/ui/immersive-hire-dialog";
import { RequirementSummaryCard } from "../../shared/RequirementSummaryCard";

type TopAction = {
  id: string;
  title: string;
  summary: string;
  actionLabel: string;
  href: string;
};

type KnowledgeItem = {
  id: string;
  title: string;
  kind: SharedKnowledgeKind;
  summary: string;
  details?: string;
  status: "active" | "watch" | "draft";
};

export function OpsSectionCard(props: {
  title: string;
  description: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { title, description, meta, defaultOpen = false, children } = props;
  return (
    <details open={defaultOpen} className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
        <div>
          <div className="text-sm font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          {meta ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">{meta}</span> : null}
          <span className="inline-flex items-center gap-1 font-medium">
            <ChevronDown className="h-3.5 w-3.5" />
            展开详情
          </span>
        </div>
      </summary>
      <div className="border-t border-slate-200 px-4 py-4">{children}</div>
    </details>
  );
}

export function LobbyHeroSection(props: {
  title: string;
  description: string;
  canContactCeo: boolean;
  canOpenRequirementCenter?: boolean;
  onOpenBoard: () => void;
  onContactCeo: () => void;
  onOpenRequirementCenter?: () => void;
}) {
  const {
    title,
    description,
    canContactCeo,
    canOpenRequirementCenter = false,
    onOpenBoard,
    onContactCeo,
    onOpenRequirementCenter,
  } = props;
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canOpenRequirementCenter && onOpenRequirementCenter ? (
          <Button variant="outline" onClick={onOpenRequirementCenter}>
            <BookOpenCheck className="mr-2 h-4 w-4" />
            返回需求中心
          </Button>
        ) : null}
        <Button variant="outline" onClick={onOpenBoard}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          查看工作看板
        </Button>
        {canContactCeo ? (
          <Button variant="outline" onClick={onContactCeo}>
            <MessageSquare className="mr-2 h-4 w-4" />
            联系 CEO
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function LobbyRequirementCard(props: {
  visible: boolean;
  title: string;
  currentStep: string;
  summary: string;
  owner: string;
  stage: string;
  nextStep: string;
  onOpenOwner: (() => void) | null;
  onOpenBoard: () => void;
  onOpenRequirementCenter?: () => void;
}) {
  const {
    visible,
    title,
    currentStep,
    summary,
    owner,
    stage,
    nextStep,
    onOpenOwner,
    onOpenBoard,
    onOpenRequirementCenter,
  } = props;
  return (
    <RequirementSummaryCard
      visible={visible}
      variant="summary"
      title={title}
      currentStep={currentStep}
      summary={summary}
      owner={owner}
      stage={stage}
      nextStep={nextStep}
      actions={
        <>
          {onOpenRequirementCenter ? (
            <Button variant="outline" onClick={onOpenRequirementCenter}>
              <BookOpenCheck className="mr-2 h-4 w-4" />
              返回需求中心
            </Button>
          ) : null}
          {onOpenOwner ? (
            <Button onClick={onOpenOwner}>
              <MessageSquare className="mr-2 h-4 w-4" />
              打开当前负责人
            </Button>
          ) : null}
          <Button variant="outline" onClick={onOpenBoard}>
            查看工作看板
          </Button>
        </>
      }
    />
  );
}

export function LobbyMetricCards(props: {
  hasRequirement: boolean;
  scopedEmployeeCount: number;
  employeeCount: number;
  teamHealthLabel: string;
  teamHealthClass: string;
  activeSessions: number;
  completedSessions: number;
  usageCost: number | null;
}) {
  const {
    hasRequirement,
    scopedEmployeeCount,
    employeeCount,
    teamHealthLabel,
    teamHealthClass,
    activeSessions,
    completedSessions,
    usageCost,
  } = props;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="bg-gradient-to-br from-slate-50 to-white shadow-sm border-slate-200">
        <CardContent className="p-3 md:p-4 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] md:text-xs font-semibold uppercase text-slate-500 tracking-wider">
              {hasRequirement ? "当前协作成员" : "团队成员"}
            </span>
            <Server className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl md:text-3xl font-bold tracking-tight">
              {hasRequirement ? scopedEmployeeCount : employeeCount}
            </span>
            <span className={`text-[9px] md:text-xs font-medium px-1.5 py-0.5 rounded ${teamHealthClass}`}>
              {teamHealthLabel}
            </span>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-slate-50 to-white shadow-sm border-slate-200">
        <CardContent className="p-3 md:p-4 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] md:text-xs font-semibold uppercase text-slate-500 tracking-wider">
              {hasRequirement ? "当前主线进行中" : "进行中的任务流"}
            </span>
            <Play className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl md:text-3xl font-bold tracking-tight text-blue-700">
              {activeSessions}
            </span>
            <span className="text-[9px] md:text-xs text-slate-500">处理中事务</span>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-slate-50 to-white shadow-sm border-slate-200">
        <CardContent className="p-3 md:p-4 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] md:text-xs font-semibold uppercase text-slate-500 tracking-wider">
              {hasRequirement ? "当前主线已完成" : "最近结束的任务流"}
            </span>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl md:text-3xl font-bold tracking-tight text-slate-700">
              {completedSessions}
            </span>
            <span className="text-[9px] md:text-xs text-slate-500">笔交付记录</span>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-slate-50 to-white shadow-sm border-slate-200">
        <CardContent className="p-3 md:p-4 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] md:text-xs font-semibold uppercase text-slate-500 tracking-wider">
              近 30 天估算成本
            </span>
            <BarChart className="w-4 h-4 text-orange-400" />
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl md:text-3xl font-bold tracking-tight text-orange-600">
              <span className="text-lg md:text-xl">$</span> {usageCost !== null ? usageCost.toFixed(4) : "--"}
            </span>
            <span className="text-[9px] md:text-xs text-slate-500">USD 估算</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function LobbyStatusStrip(props: {
  hasPrimaryWorkItem: boolean;
  displayOwner: string;
  displayStage: string;
  displayNext: string;
  completedWorkSteps: number;
  totalWorkSteps: number;
  visibleManualCount: number;
  blockedCount: number;
  waitingCount: number;
  runningCount: number;
  showOperationalQueues: boolean;
  handoffCount: number;
  visiblePendingHandoffs: number;
  visibleBlockedHandoffs: number;
  requestTotal: number;
  requestActive: number;
  requestBlocked: number;
  fallbackBadges: ReactNode;
}) {
  const {
    hasPrimaryWorkItem,
    displayOwner,
    displayStage,
    displayNext,
    completedWorkSteps,
    totalWorkSteps,
    visibleManualCount,
    blockedCount,
    waitingCount,
    runningCount,
    showOperationalQueues,
    handoffCount,
    visiblePendingHandoffs,
    visibleBlockedHandoffs,
    requestTotal,
    requestActive,
    requestBlocked,
    fallbackBadges,
  } = props;

  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      {hasPrimaryWorkItem ? (
        <>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
            当前负责人：{displayOwner}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
            当前环节：{displayStage}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
            下一步：{displayNext}
          </span>
          {totalWorkSteps > 0 ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              进度：{completedWorkSteps}/{totalWorkSteps}
            </span>
          ) : null}
          {visibleManualCount > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
              当前需求需人工介入 {visibleManualCount} 项
            </span>
          ) : null}
        </>
      ) : (
        <>
          {fallbackBadges}
          <span className="text-xs text-slate-500">
            {blockedCount > 0 ? `${blockedCount} 位成员需要优先排障` : "当前没有高优先级阻塞"}
          </span>
          <span className="text-xs text-slate-500">
            {visibleManualCount > 0 ? `${visibleManualCount} 位成员已进入人工接管态` : `${runningCount} 位成员仍在执行中`}
          </span>
          {showOperationalQueues && handoffCount > 0 ? (
            <span className="text-xs text-slate-500">
              交接 {handoffCount} 条，待完成 {visiblePendingHandoffs}，阻塞 {visibleBlockedHandoffs}
            </span>
          ) : null}
          {showOperationalQueues && requestTotal > 0 ? (
            <span className="text-xs text-slate-500">
              请求 {requestTotal} 条，活跃 {requestActive}，阻塞 {requestBlocked}
            </span>
          ) : null}
          {!showOperationalQueues && waitingCount > 0 ? (
            <span className="text-xs text-slate-500">{waitingCount} 位成员正在等待输入或反馈</span>
          ) : null}
        </>
      )}
    </div>
  );
}

export function LobbyActionStrip(props: {
  title: string;
  description: string;
  blockedCount: number;
  visiblePendingHandoffs: number;
  visibleRequestActive: number;
  visibleSlaAlerts: number;
  visibleManualCount: number;
  recoveringCommunication: boolean;
  hasPrimaryWorkItem: boolean;
  completedWorkSteps: number;
  totalWorkSteps: number;
  primaryOwnerLabel?: string | null;
  ceoAvailable: boolean;
  topActions: TopAction[];
  onRecoverCommunication: () => void;
  onOpenCurrentOwner?: () => void;
  onOpenCeo?: () => void;
  onOpenBoard?: () => void;
  onNavigateHref?: (href: string) => void;
}) {
  const {
    title,
    description,
    blockedCount,
    visiblePendingHandoffs,
    visibleRequestActive,
    visibleSlaAlerts,
    visibleManualCount,
    recoveringCommunication,
    hasPrimaryWorkItem,
    completedWorkSteps,
    totalWorkSteps,
    topActions,
    onRecoverCommunication,
    onOpenCurrentOwner,
    onOpenCeo,
    onOpenBoard,
    onNavigateHref,
  } = props;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{description}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
            阻塞 {blockedCount}
          </Badge>
          {hasPrimaryWorkItem ? (
            totalWorkSteps > 0 ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                进度 {completedWorkSteps}/{totalWorkSteps}
              </Badge>
            ) : null
          ) : (
            <>
              <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                交接 {visiblePendingHandoffs}
              </Badge>
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                请求 {visibleRequestActive}
              </Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                SLA {visibleSlaAlerts}
              </Badge>
            </>
          )}
          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
            接管 {visibleManualCount}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="border-slate-200 bg-white"
            disabled={recoveringCommunication}
            onClick={onRecoverCommunication}
          >
            {recoveringCommunication ? "恢复中..." : "恢复当前阻塞"}
          </Button>
        </div>
      </div>
      {hasPrimaryWorkItem ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {onOpenCurrentOwner ? (
            <button
              type="button"
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3 text-left transition-colors hover:bg-indigo-100"
              onClick={onOpenCurrentOwner}
            >
              <div className="text-sm font-medium text-slate-900">打开当前负责人</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">现在就去处理当前卡点</div>
              <div className="mt-2 text-[11px] font-medium text-slate-500">进入会话</div>
            </button>
          ) : null}
          {onOpenCeo ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-100"
              onClick={onOpenCeo}
            >
              <div className="text-sm font-medium text-slate-900">回 CEO 会话</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">继续推进主线指令和跨节点协作。</div>
              <div className="mt-2 text-[11px] font-medium text-slate-500">查看主会话</div>
            </button>
          ) : null}
          {onOpenBoard ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-100"
              onClick={onOpenBoard}
            >
              <div className="text-sm font-medium text-slate-900">查看当前需求看板</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">只看这条主线的任务顺序、当前步骤和下一棒。</div>
              <div className="mt-2 text-[11px] font-medium text-slate-500">进入工作看板</div>
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-100"
            onClick={onRecoverCommunication}
            disabled={recoveringCommunication}
          >
            <div className="text-sm font-medium text-slate-900">
              {recoveringCommunication ? "同步当前阻塞中..." : "同步当前阻塞"}
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-600">
              重扫这条主线的请求、交接和回复，清掉过期卡点。
            </div>
            <div className="mt-2 text-[11px] font-medium text-slate-500">只同步当前需求</div>
          </button>
        </div>
      ) : topActions.length > 0 && onNavigateHref ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {topActions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-100"
              onClick={() => onNavigateHref(item.href)}
            >
              <div className="text-sm font-medium text-slate-900">{item.title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">{item.summary}</div>
              <div className="mt-2 text-[11px] font-medium text-slate-500">{item.actionLabel}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LobbyAlertStrip(props: {
  visible: boolean;
  tone: "amber" | "sky" | "rose";
  title: string;
  description: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  children?: ReactNode;
}) {
  const { visible, tone, title, description, actionLabel, actionDisabled, onAction, children } = props;
  if (!visible) {
    return null;
  }
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : tone === "sky"
        ? "border-sky-200 bg-sky-50 text-sky-950"
        : "border-rose-200 bg-rose-50 text-rose-950";
  const buttonClass =
    tone === "amber"
      ? "border-amber-200 bg-white text-amber-900 hover:bg-amber-100"
      : tone === "sky"
        ? "border-sky-200 bg-white text-sky-900 hover:bg-sky-100"
        : "border-rose-200 bg-white text-rose-900 hover:bg-rose-100";

  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs">{description}</div>
        </div>
        {actionLabel && onAction ? (
          <Button
            size="sm"
            variant="outline"
            className={buttonClass}
            disabled={actionDisabled}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export function LobbyKnowledgeSection(props: {
  knowledgeItems: KnowledgeItem[];
  cronCount: number;
  retrospectiveSummary: string;
  quickTaskTarget: string;
  quickTaskInput: string;
  employees: Array<{ agentId: string; nickname: string; role: string }>;
  quickTaskSubmitting: boolean;
  onChangeQuickTaskTarget: (value: string) => void;
  onChangeQuickTaskInput: (value: string) => void;
  onSubmitQuickTask: () => void;
  onKeyDownQuickTask: (key: string) => void;
  onSyncKnowledge: () => void;
  onCopyBlueprint: () => void;
}) {
  const {
    knowledgeItems,
    cronCount,
    retrospectiveSummary,
    quickTaskTarget,
    quickTaskInput,
    employees,
    quickTaskSubmitting,
    onChangeQuickTaskTarget,
    onChangeQuickTaskInput,
    onSubmitQuickTask,
    onKeyDownQuickTask,
    onSyncKnowledge,
    onCopyBlueprint,
  } = props;

  return (
    <OpsSectionCard
      title="运营工具与共享知识"
      description="把规范、复用和快速派单放在第二层，首屏先保留异常与下一步。"
      meta={`知识 ${knowledgeItems.length} · 班次 ${cronCount}`}
    >
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1.7fr,1fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-slate-50/60">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  共享知识板
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  把设定、职责、里程碑和默认交付流程沉淀成共享知识，而不是散在聊天里。
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={onSyncKnowledge}>
                <Copy className="mr-2 h-4 w-4" />
                写入公司知识
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2">
              {knowledgeItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                      <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                        {formatKnowledgeKindLabel(item.kind)}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        item.status === "active"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : item.status === "watch"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                      }
                    >
                      {item.status === "active" ? "已启用" : item.status === "watch" ? "需关注" : "草稿"}
                    </Badge>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-700">{item.summary}</div>
                  <div className="mt-3 text-xs leading-5 text-slate-500">{item.details}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b bg-slate-50/60">
              <CardTitle className="text-base flex items-center gap-2">
                <GitFork className="w-4 h-4 text-teal-600" />
                可复用团队蓝图
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                复制当前公司的组织、知识和自动化蓝图，在新公司中直接复用。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">知识条目</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{knowledgeItems.length}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">自动化班次</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{cronCount}</div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                蓝图会带上当前组织的员工结构、共享知识层、快捷指令和自动化班次，适合复制到新的项目或团队。
              </div>
              <Button className="w-full" onClick={onCopyBlueprint}>
                <Copy className="mr-2 h-4 w-4" />
                复制组织蓝图
              </Button>
              <div className="rounded-lg border border-dashed border-slate-200 bg-white p-3">
                <div className="text-xs font-semibold text-slate-600">当前运营复盘摘要</div>
                <div className="mt-2 text-sm leading-6 text-slate-800">{retrospectiveSummary}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="bg-white border rounded-lg p-1.5 flex flex-col md:flex-row md:items-center shadow-sm gap-2">
          <select
            className="h-10 px-3 md:border-r border-slate-200 bg-transparent outline-none text-sm font-medium w-full md:w-[200px] shrink-0 hover:bg-slate-50 transition-colors"
            value={quickTaskTarget}
            onChange={(event) => onChangeQuickTaskTarget(event.target.value)}
          >
            <option value="" disabled>
              选择直接派单成员...
            </option>
            {employees.map((employee) => (
              <option key={employee.agentId} value={employee.agentId}>
                {employee.nickname} ({employee.role})
              </option>
            ))}
          </select>
          <input
            type="text"
            className="flex-1 h-10 px-4 outline-none text-sm bg-transparent placeholder:text-slate-400"
            placeholder="直接交给所选成员，例如：开始巡检数据库健康状态"
            value={quickTaskInput}
            onChange={(event) => onChangeQuickTaskInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onKeyDownQuickTask(event.key);
              }
            }}
          />
          <Button
            size="sm"
            className="h-9 px-6 rounded shadow-none w-full md:w-auto"
            disabled={quickTaskSubmitting || !quickTaskTarget || !quickTaskInput.trim()}
            onClick={onSubmitQuickTask}
          >
            {quickTaskSubmitting ? (
              <span className="animate-spin mr-2">◓</span>
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}{" "}
            快速指派
          </Button>
        </div>
      </div>
    </OpsSectionCard>
  );
}

export function LobbyDialogs(props: {
  hireDialogOpen: boolean;
  setHireDialogOpen: (open: boolean) => void;
  onHireSubmit: (config: HireConfig) => Promise<void>;
  hireSubmitting: boolean;
  groupChatDialogOpen: boolean;
  setGroupChatDialogOpen: (open: boolean) => void;
  onGroupChatSubmit: (values: Record<string, string | boolean | undefined>) => Promise<void>;
  groupChatSubmitting: boolean;
  employees: Array<{ agentId: string; nickname: string; role: string }>;
  updateRoleDialogOpen: boolean;
  setUpdateRoleDialogOpen: (open: boolean) => void;
  updateRoleInitial: { role: string; description: string };
  onUpdateRoleSubmit: (values: Record<string, string>) => Promise<void>;
  updateRoleSubmitting: boolean;
  fireEmployeeDialogOpen: boolean;
  setFireEmployeeDialogOpen: (open: boolean) => void;
  onFireEmployeeSubmit: () => Promise<void>;
}) {
  const {
    hireDialogOpen,
    setHireDialogOpen,
    onHireSubmit,
    hireSubmitting,
    groupChatDialogOpen,
    setGroupChatDialogOpen,
    onGroupChatSubmit,
    groupChatSubmitting,
    employees,
    updateRoleDialogOpen,
    setUpdateRoleDialogOpen,
    updateRoleInitial,
    onUpdateRoleSubmit,
    updateRoleSubmitting,
    fireEmployeeDialogOpen,
    setFireEmployeeDialogOpen,
    onFireEmployeeSubmit,
  } = props;

  return (
    <>
      <ImmersiveHireDialog
        open={hireDialogOpen}
        onOpenChange={setHireDialogOpen}
        onSubmit={onHireSubmit}
        busy={hireSubmitting}
      />

      <ActionFormDialog
        open={groupChatDialogOpen}
        onOpenChange={setGroupChatDialogOpen}
        title="发起跨部门会议"
        description="选择会议主题和参会人员，系统将自动创建会议并通知相关人员。"
        confirmLabel="发起会议"
        busy={groupChatSubmitting}
        fields={[
          {
            name: "topic",
            label: "会议主题",
            type: "text",
            required: true,
            placeholder: "例如: 第二届双十一大促复盘",
          },
          ...employees.map((employee) => ({
            name: `member_${employee.agentId}`,
            label: `邀请: ${employee.nickname} (${employee.role})`,
            type: "checkbox" as const,
            defaultValue: "true",
            required: false,
            placeholder: "",
          })),
        ]}
        onSubmit={onGroupChatSubmit}
      />

      <ActionFormDialog
        open={updateRoleDialogOpen}
        onOpenChange={setUpdateRoleDialogOpen}
        title="调整成员职责"
        description="系统将联系 HR 下发结构变动与系统提示词修改命令。"
        confirmLabel="确认调岗"
        busy={updateRoleSubmitting}
        fields={[
          {
            name: "role",
            label: "岗位名称",
            defaultValue: updateRoleInitial.role || "",
            required: true,
            placeholder: "例如：高级架构师",
          },
          {
            name: "description",
            label: "岗位补充说明",
            defaultValue: updateRoleInitial.description || "",
            required: true,
            multiline: true,
            placeholder: "输入新的职责描述",
          },
        ]}
        onSubmit={onUpdateRoleSubmit}
      />
      <ActionFormDialog
        open={fireEmployeeDialogOpen}
        onOpenChange={setFireEmployeeDialogOpen}
        title="移除此成员"
        description="移除后该成员将被彻底隔离并从团队中除名，此操作不可逆。是否继续？"
        confirmLabel="确认移除"
        fields={[]}
        onSubmit={onFireEmployeeSubmit}
      />
    </>
  );
}
