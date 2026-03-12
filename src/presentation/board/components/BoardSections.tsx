import {
  AlertCircle,
  Archive,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Play,
  Trash2,
  Users,
} from "lucide-react";
import { ActionFormDialog } from "../../../components/ui/action-form-dialog";
import { ExecutionStateBadge } from "../../../components/execution-state-badge";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import type { RequirementRoomRecord } from "../../../domain/delegation/types";
import type { DraftRequirementRecord } from "../../../domain/mission/types";
import type { EmployeeRef } from "../../../domain/org/types";
import type { TaskLane } from "../../../domain/mission/task-lane";
import type { GatewaySessionRow } from "../../../application/gateway";
import type { BoardTaskItem, BoardTaskSection } from "../../../application/mission/board-task-surface";
import { resolveExecutionState, type ResolvedExecutionState } from "../../../application/mission/execution-state";
import { formatTime } from "../../../lib/utils";
import { BoardTaskCard } from "./BoardTaskCard";

export const TASK_LANE_META: Record<
  Exclude<TaskLane, "done">,
  { title: string; description: string; empty: string }
> = {
  critical: {
    title: "1. 先处理阻塞和接管",
    description: "这些任务会直接卡住全局推进，应该最先看。",
    empty: "当前没有需要立即接管或排障的任务。",
  },
  needs_input: {
    title: "2. 等你确认或补材料",
    description: "这些任务在等用户输入、确认或补充资源。",
    empty: "当前没有等待你确认的任务。",
  },
  handoff: {
    title: "3. 等待交接或他人反馈",
    description: "这些任务已经转交出去，下一步取决于其他成员回应。",
    empty: "当前没有等待交接结果的任务。",
  },
  active: {
    title: "4. 正在推进",
    description: "这些任务仍在推进中，可以持续跟进，不必马上打断。",
    empty: "当前没有明显正在推进的任务。",
  },
  queued: {
    title: "5. 待启动或信息不足",
    description: "这些任务还没有进入明确执行态，适合排到后面梳理。",
    empty: "当前没有待启动任务。",
  },
};

export function BoardHeroSection(props: {
  description: string;
  trackedTasks: number;
  wipSteps: number;
  doneSteps: number;
  totalSteps: number;
  globalPct: number;
  canOpenCeo: boolean;
  canOpenRequirementCenter?: boolean;
  onOpenOps: () => void;
  onOpenCeo: () => void;
  onOpenRequirementCenter?: () => void;
}) {
  const {
    description,
    trackedTasks,
    wipSteps,
    doneSteps,
    totalSteps,
    globalPct,
    canOpenCeo,
    canOpenRequirementCenter = false,
    onOpenOps,
    onOpenCeo,
    onOpenRequirementCenter,
  } = props;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between shrink-0">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
          <LayoutDashboard className="w-8 h-8 text-indigo-600" />
          任务看板
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2 md:gap-3 items-center">
        {canOpenRequirementCenter && onOpenRequirementCenter ? (
          <Button variant="outline" onClick={onOpenRequirementCenter}>
            <BookOpenCheck className="w-4 h-4 mr-2" />
            返回需求中心
          </Button>
        ) : null}
        <Button variant="outline" onClick={onOpenOps}>
          <Play className="w-4 h-4 mr-2" />
          去运营大厅看监控
        </Button>
        {canOpenCeo ? (
          <Button variant="outline" onClick={onOpenCeo}>
            <MessageSquare className="w-4 h-4 mr-2" />
            继续和 CEO 对话
          </Button>
        ) : null}
        <div className="flex gap-2 md:gap-4 items-center bg-slate-100 px-3 md:px-4 py-2 rounded-lg border">
          <div className="flex flex-col items-center">
            <span className="text-2xl font-black text-indigo-600">{trackedTasks}</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              项任务组
            </span>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-black text-amber-600">{wipSteps}</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              执行中节点
            </span>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-black text-emerald-600">{doneSteps}</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              已交付节点
            </span>
          </div>
        </div>
        {totalSteps > 0 ? (
          <div className="flex flex-col items-center px-3">
            <span className="text-lg font-black text-indigo-700">{globalPct}%</span>
            <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all"
                style={{ width: `${globalPct}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BoardRequirementCard(props: {
  visible: boolean;
  title: string;
  currentStep: string;
  summary: string;
  owner: string;
  stage: string;
  nextStep: string;
  onOpenOwner?: () => void;
  onOpenCeo?: () => void;
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
    onOpenCeo,
    onOpenRequirementCenter,
  } = props;
  if (!visible) {
    return null;
  }
  return (
    <Card className="shrink-0 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm">
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.4fr,1fr,auto] lg:items-center">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-500">
            本次需求总览
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-950">{title}</div>
          <div className="mt-2 text-sm leading-6 text-slate-700">{currentStep}</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">{summary}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              当前负责人
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{owner}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">当前环节：{stage}</div>
          </div>
          <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              下一步
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-800">{nextStep}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {onOpenRequirementCenter ? (
            <Button variant="outline" onClick={onOpenRequirementCenter}>
              <BookOpenCheck className="w-4 h-4 mr-2" />
              返回需求中心
            </Button>
          ) : null}
          {onOpenOwner ? (
            <Button variant="default" onClick={onOpenOwner}>
              <MessageSquare className="w-4 h-4 mr-2" />
              打开当前负责人
            </Button>
          ) : null}
          {onOpenCeo ? <Button variant="outline" onClick={onOpenCeo}>回 CEO 会话</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function BoardRoomPanel(props: {
  visible: boolean;
  rooms: RequirementRoomRecord[];
  roomPreview: (room: RequirementRoomRecord) => string;
  route?: string | null;
  onOpenRoom: (roomId: string) => void;
  onCreateRoom: () => void;
}) {
  const { visible, rooms, roomPreview, route, onOpenRoom, onCreateRoom } = props;
  if (!visible) {
    return null;
  }

  return (
    <Card className="shrink-0 border-slate-200 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-indigo-600" />
          需求团队房间
        </CardTitle>
        <CardDescription>
          现在按需求固定房间。点同一条需求时会优先复用同一个房间，不再按临时标题反复创建新群。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rooms.length > 0 ? (
          rooms.map((room, index) => (
            <div
              key={room.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-slate-900">{room.title}</div>
                  <Badge variant="outline" className="text-[10px]">
                    {index === 0 ? "当前主房间" : "相关房间"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {room.memberIds.length} 人
                  </Badge>
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  最近更新：{formatTime(room.updatedAt)}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-700">{roomPreview(room)}</div>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button variant="outline" onClick={() => onOpenRoom(room.id)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  打开房间
                </Button>
              </div>
            </div>
          ))
        ) : route ? (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">当前需求还没有固定房间</div>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                第一次打开后会固化成这条需求的固定群聊，后面从 CEO、看板或大厅点进去都会回到同一个房间。
              </div>
            </div>
            <Button onClick={onCreateRoom}>
              <Users className="mr-2 h-4 w-4" />
              创建并进入房间
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm leading-6 text-slate-600">
            当前还没有可靠的进行中工作项，暂时不能创建需求团队房间。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BoardTaskSequencePanel(props: {
  visible: boolean;
  title: string;
  items: BoardTaskItem[];
}) {
  const { visible, title, items } = props;
  if (!visible) {
    return null;
  }
  return (
    <Card className="shrink-0 border-slate-200 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.task.id}
            className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 lg:grid-cols-[68px,1.1fr,1.1fr,auto]"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              #{String(index + 1).padStart(2, "0")}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">{item.task.title}</div>
              <div className="mt-1 text-xs text-slate-500">
                负责人 {item.ownerLabel} · 已完成 {item.stepSummary.doneCount}/{item.stepSummary.total}
              </div>
            </div>
            <div className="min-w-0 text-sm text-slate-700">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                当前动作
              </div>
              <div className="mt-1 line-clamp-2">{item.focusSummary.currentWork}</div>
              {item.focusSummary.blockReason ? (
                <div className="mt-1 text-xs text-rose-700">当前卡点：{item.focusSummary.blockReason}</div>
              ) : (
                <div className="mt-1 text-xs text-slate-500">下一步：{item.focusSummary.nextStep}</div>
              )}
            </div>
            <div className="flex items-start justify-end">
              <ExecutionStateBadge compact status={item.execution} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function BoardAlertStrip(props: {
  visible: boolean;
  tone: "amber" | "sky" | "violet" | "rose";
  title: string;
  description: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  const { visible, tone, title, description, actionLabel, actionDisabled, onAction, children } = props;
  if (!visible) return null;
  const classes =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : tone === "sky"
        ? "border-sky-200 bg-sky-50 text-sky-950"
        : tone === "violet"
          ? "border-violet-200 bg-violet-50 text-violet-950"
          : "border-rose-200 bg-rose-50 text-rose-950";
  const buttonClass =
    tone === "amber"
      ? "border-amber-200 bg-white text-amber-900 hover:bg-amber-100"
      : tone === "sky"
        ? "border-sky-200 bg-white text-sky-900 hover:bg-sky-100"
        : tone === "violet"
          ? "border-violet-200 bg-white text-violet-900 hover:bg-violet-100"
          : "border-rose-200 bg-white text-rose-900 hover:bg-rose-100";

  return (
    <div className={`shrink-0 rounded-xl border px-4 py-3 shadow-sm ${classes}`}>
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

export function BoardTaskBoardSection(props: {
  trackedTasks: number;
  orderedTaskSections: BoardTaskSection[];
  activeTasks: number;
  archivedTaskItems: BoardTaskItem[];
  showArchived: boolean;
  setShowArchived: (next: boolean) => void;
  activeRoomRecords: RequirementRoomRecord[];
  activeCompanyEmployees: EmployeeRef[];
  preRequirementDraft?: DraftRequirementRecord | null;
  onOpenCeo?: () => void;
  onOpenRoute: (route: string) => void;
}) {
  const {
    trackedTasks,
    orderedTaskSections,
    activeTasks,
    archivedTaskItems,
    showArchived,
    setShowArchived,
    activeRoomRecords,
    activeCompanyEmployees,
    preRequirementDraft = null,
    onOpenCeo,
    onOpenRoute,
  } = props;

  if (trackedTasks <= 0) {
    if (preRequirementDraft) {
      return (
        <Card className="flex-1 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm">
          <CardContent className="grid gap-4 p-6 lg:grid-cols-[1.3fr,1fr,auto] lg:items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-500">
                CEO 正在收敛目标
              </div>
              <div className="mt-3 text-lg font-semibold text-slate-950">当前还没有正式的任务主线</div>
              <div className="mt-2 text-sm leading-6 text-slate-700">{preRequirementDraft.summary}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                等 CEO 确认或继续推进后，这里会自动切换成 requirement/work item 看板。
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  当前阶段
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{preRequirementDraft.stage}</div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  建议下一步
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-800">{preRequirementDraft.nextAction}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {onOpenCeo ? (
                <Button variant="default" onClick={onOpenCeo}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  打开 CEO 会话
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20">
        <div className="bg-indigo-50 p-6 rounded-2xl mb-6">
          <ListChecks className="w-16 h-16 text-indigo-300" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-2">当前没有可靠的进行中工作项</h3>
        <p className="text-sm text-slate-500 max-w-md text-center leading-relaxed">
          看板现在只展示产品真相源里的工作项，不再从旧请求、旧交接和历史会话里猜主线。先去 CEO 会话确认新的规划/任务，生成当前工作项后这里会自动出现。
        </p>
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 max-w-lg">
          <p className="text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>提示：</strong>当前看板不再复活历史任务。只有被系统确认为当前 WorkItem 的任务，才会在这里展示步骤、负责人和进度。
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="space-y-8 pb-10">
        {orderedTaskSections.map((section) => {
          const meta = TASK_LANE_META[section.key];
          return (
            <section key={section.key} className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{meta.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{meta.description}</p>
                </div>
                <Badge variant="outline" className="bg-white text-slate-600">
                  {section.items.length} 项
                </Badge>
              </div>
              {section.items.length > 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {section.items.map((item, index) => (
                    <BoardTaskCard
                      key={item.task.id}
                      item={item}
                      activeRoomRecords={activeRoomRecords}
                      activeCompanyEmployees={activeCompanyEmployees}
                      onOpenRoute={onOpenRoute}
                      orderLabel={`${meta.title} · ${String(index + 1).padStart(2, "0")}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  {meta.empty}
                </div>
              )}
            </section>
          );
        })}

        {activeTasks === 0 && archivedTaskItems.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-10 opacity-70">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
            <p className="text-slate-500 font-medium">当前没有进行中的任务，所有工作均已完成。</p>
          </div>
        ) : null}

        {archivedTaskItems.length > 0 ? (
          <div className="border-t border-slate-200/60 pt-6">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mx-auto px-4 py-2 rounded-full hover:bg-slate-100"
            >
              <Archive className="w-4 h-4" />
              <span className="text-sm font-medium">
                {showArchived ? "收起已归档记录" : `展开已归档记录 (${archivedTaskItems.length})`}
              </span>
              {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showArchived ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-6 animate-in fade-in slide-in-from-top-4 duration-300">
                {archivedTaskItems.map((item, index) => (
                  <BoardTaskCard
                    key={item.task.id}
                    item={item}
                    activeRoomRecords={activeRoomRecords}
                    activeCompanyEmployees={activeCompanyEmployees}
                    onOpenRoute={onOpenRoute}
                    isArchived
                    orderLabel={`已归档 · ${String(index + 1).padStart(2, "0")}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BoardSessionMonitor(props: {
  showSessions: boolean;
  setShowSessions: (next: boolean) => void;
  activeSessions: Array<GatewaySessionRow & { agentId: string }>;
  archivedSessions: Array<GatewaySessionRow & { agentId: string }>;
  sessionMeta: Map<string, { topic?: string }>;
  sessionStates: Map<string, ResolvedExecutionState>;
  sessionTakeoverPacks: Map<string, unknown>;
  getEmpName: (agentId: string) => string;
  resolveUpdatedAt: (session: GatewaySessionRow) => number;
  onOpenSession: (sessionKey: string, actorId: string | null) => void;
  onNudge: (sessionKey: string) => void;
  onDelete: (sessionKey: string) => void;
}) {
  const {
      showSessions,
      setShowSessions,
      activeSessions,
      archivedSessions,
      sessionMeta,
      sessionStates,
      sessionTakeoverPacks,
      getEmpName,
      resolveUpdatedAt,
      onOpenSession,
      onNudge,
      onDelete,
  } = props;

  return (
    <div className="shrink-0 border-t pt-2">
      <button
        type="button"
        className="w-full flex items-center justify-between py-2 px-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        onClick={() => setShowSessions(!showSessions)}
      >
        <span className="flex items-center gap-2">
          <Play className="w-4 h-4" />
          活跃通道监控
          <Badge variant="secondary" className="text-[10px]">
            {activeSessions.length} 活跃 / {archivedSessions.length} 归档
          </Badge>
        </span>
        {showSessions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {showSessions ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 max-h-[40vh] overflow-y-auto pb-4">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 flex items-center gap-1">
              <Play className="w-3 h-3" /> 进行中 ({activeSessions.length})
            </h4>
            {activeSessions.length > 0 ? (
              activeSessions.map((session) => (
                <div
                  key={session.key}
                  className="bg-white p-3 rounded-lg border shadow-sm text-xs flex items-center justify-between group hover:shadow-md transition-shadow"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-700 truncate">{getEmpName(session.agentId)}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <ExecutionStateBadge
                        compact
                        status={
                          sessionStates.get(session.key) ??
                          resolveExecutionState({ session, fallbackState: "idle" })
                        }
                      />
                      {sessionTakeoverPacks.has(session.key) ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] border-amber-200 bg-amber-50 text-amber-800"
                        >
                          接管
                        </Badge>
                      ) : null}
                    </div>
                    {sessionMeta.get(session.key)?.topic ? (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {sessionMeta.get(session.key)!.topic}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] text-slate-400">
                      <Clock className="w-3 h-3 inline mr-0.5" />
                      {formatTime(resolveUpdatedAt(session) || undefined)}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-1.5"
                        onClick={() => onOpenSession(session.key, session.agentId)}
                      >
                        <MessageSquare className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-1.5 text-amber-600"
                        onClick={() => onNudge(session.key)}
                      >
                        催
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-1.5 text-red-500"
                        onClick={() => onDelete(session.key)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-slate-400 py-4 text-center">暂无活跃通道</div>
            )}
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 归档 ({archivedSessions.length})
            </h4>
            {archivedSessions.length > 0 ? (
              archivedSessions.slice(0, 10).map((session) => (
                <div
                  key={session.key}
                  className="bg-white p-3 rounded-lg border shadow-sm text-xs flex items-center justify-between opacity-70 hover:opacity-100 transition-opacity"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-600 truncate">{getEmpName(session.agentId)}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <ExecutionStateBadge
                        compact
                        status={
                          sessionStates.get(session.key) ??
                          resolveExecutionState({ session, fallbackState: "completed" })
                        }
                      />
                      {sessionTakeoverPacks.has(session.key) ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] border-amber-200 bg-amber-50 text-amber-800"
                        >
                          接管
                        </Badge>
                      ) : null}
                    </div>
                    {sessionMeta.get(session.key)?.topic ? (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        📋 {sessionMeta.get(session.key)!.topic}
                      </div>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                    {formatTime(resolveUpdatedAt(session) || undefined)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-slate-400 py-4 text-center">暂无归档</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BoardDialogs(props: {
  dialogConfig: { open: boolean; type: "nudge" | "delete" | null; sessionKey: string | null };
  dialogSubmitting: boolean;
  setDialogOpen: (open: boolean) => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const { dialogConfig, dialogSubmitting, setDialogOpen, onSubmit } = props;
  return (
    <>
      {dialogConfig.type === "nudge" ? (
        <ActionFormDialog
          open={dialogConfig.open}
          onOpenChange={setDialogOpen}
          title="下发催促指令"
          description="指令将强行插入该节点的工作流中，并中断当前长思考。"
          confirmLabel="传达指令"
          busy={dialogSubmitting}
          fields={[
            { name: "nudgeText", label: "补充说明", defaultValue: "请报告当前进度并加快处理" },
          ]}
          onSubmit={onSubmit}
        />
      ) : null}

      {dialogConfig.type === "delete" ? (
        <ActionFormDialog
          open={dialogConfig.open}
          onOpenChange={setDialogOpen}
          title="彻底销毁事项"
          description="确定要彻底剥离并不可逆地销毁这条流转记录吗？在编历史将彻底丢失。"
          confirmLabel="永久销毁"
          busy={dialogSubmitting}
          fields={[]}
          onSubmit={onSubmit}
        />
      ) : null}
    </>
  );
}
