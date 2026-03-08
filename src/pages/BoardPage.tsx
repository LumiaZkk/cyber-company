import {
  Play,
  CheckCircle2,
  LayoutDashboard,
  Clock,
  MessageSquare,
  Trash2,
  ChevronDown,
  ChevronUp,
  Users,
  ListChecks,
  AlertCircle,
  Archive,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionFormDialog } from "../components/ui/action-form-dialog";
import { ExecutionStateBadge } from "../components/execution-state-badge";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useCompanyStore } from "../features/company/store";
import { pickConversationMissionRecord } from "../features/execution/conversation-mission";
import { buildRequirementRoomHrefFromRecord, buildRequirementRoomRoute } from "../features/execution/requirement-room";
import type {
  ConversationMissionRecord,
  TaskExecutionState,
  TaskStep,
  TrackedTask,
  WorkItemRecord,
} from "../features/company/types";
import {
  pickWorkItemRecord,
} from "../features/execution/work-item";
import { reconcileWorkItemRecord } from "../features/execution/work-item-reconciler";
import {
  resolveExecutionState,
  type ResolvedExecutionState,
} from "../features/execution/state";
import { buildExecutionFocusSummary } from "../features/execution/focus-summary";
import { buildManualTakeoverPack, type ManualTakeoverPack } from "../features/execution/takeover-pack";
import {
  buildRequirementExecutionOverview,
  createRequirementMessageSnapshots,
  REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT,
  type RequirementExecutionOverview,
  type RequirementParticipantProgress,
  type RequirementSessionSnapshot,
} from "../features/execution/requirement-overview";
import {
  buildRequirementScope,
  filterRequirementSlaAlerts,
} from "../features/execution/requirement-scope";
import {
  isParticipantCompletedStatus,
  isStrategicRequirementTopic,
} from "../features/execution/requirement-kind";
import { evaluateSlaAlerts } from "../features/sla/escalation-rules";
import { getActiveHandoffs } from "../features/handoffs/active-handoffs";
import { buildRequestRecords } from "../features/requests/request-object";
import { reconcileCompanyCommunication } from "../features/requests/reconcile";
import { summarizeRequestHealth } from "../features/requests/request-health";
import { buildTaskObjectSnapshot } from "../features/tasks/task-object";
import { gateway, type GatewaySessionRow, type ChatMessage } from "../features/backend";
import { useGatewayStore } from "../features/gateway/store";
import { toast } from "../features/ui/toast-store";
import {
  isSessionActive,
  parseAgentIdFromSessionKey,
  resolveSessionUpdatedAt,
} from "../lib/sessions";
import { usePageVisibility } from "../lib/use-page-visibility";
import { formatTime } from "../lib/utils";

type TaskLane = "critical" | "needs_input" | "handoff" | "active" | "queued" | "done";

type TaskStepSummary = {
  total: number;
  doneCount: number;
  wipCount: number;
  pendingCount: number;
  completedSteps: TaskStep[];
  currentStep: TaskStep | null;
  upcomingSteps: TaskStep[];
};

function isWorkItemRecord(
  mission: ConversationMissionRecord | WorkItemRecord | null,
): mission is WorkItemRecord {
  return Boolean(mission && "stageLabel" in mission);
}

function isConversationMissionRecord(
  mission: ConversationMissionRecord | WorkItemRecord | null,
): mission is ConversationMissionRecord {
  return Boolean(mission && "currentStepLabel" in mission);
}

const TASK_LANE_META: Record<
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

function summarizeTaskSteps(steps: TaskStep[]): TaskStepSummary {
  const completedSteps = steps.filter((step) => step.status === "done");
  const currentStep = steps.find((step) => step.status === "wip") ?? steps.find((step) => step.status === "pending") ?? null;
  const upcomingSteps = steps
    .filter((step) => step.status === "pending" && step !== currentStep)
    .slice(0, 3);

  return {
    total: steps.length,
    doneCount: completedSteps.length,
    wipCount: steps.filter((step) => step.status === "wip").length,
    pendingCount: steps.filter((step) => step.status === "pending").length,
    completedSteps,
    currentStep,
    upcomingSteps,
  };
}

function getTaskSortWeight(state?: string): number {
  switch (state) {
    case "manual_takeover_required":
      return 0;
    case "blocked_timeout":
    case "blocked_tool_failure":
      return 1;
    case "waiting_input":
      return 2;
    case "waiting_peer":
      return 3;
    case "running":
      return 4;
    case "idle":
      return 5;
    case "unknown":
      return 6;
    case "completed":
      return 7;
    default:
      return 6;
  }
}

function getTaskLane(state?: string): TaskLane {
  switch (state) {
    case "manual_takeover_required":
    case "blocked_timeout":
    case "blocked_tool_failure":
      return "critical";
    case "waiting_input":
      return "needs_input";
    case "waiting_peer":
      return "handoff";
    case "running":
      return "active";
    case "completed":
      return "done";
    default:
      return "queued";
  }
}

function truncateRoomPreview(text: string, maxLength = 88): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function describeRequirementRoomPreview(room: { transcript: Array<{ role: "user" | "assistant"; text?: string; senderLabel?: string; audienceAgentIds?: string[] }> }) {
  const latest = [...room.transcript].reverse().find((message) => typeof message.text === "string" && message.text.trim().length > 0);
  if (!latest?.text) {
    return "房间已建立，等待第一条团队指令。";
  }
  if (latest.role === "assistant") {
    const actor = latest.senderLabel?.trim() || "团队成员";
    return `${actor}：${truncateRoomPreview(latest.text)}`;
  }
  const audienceCount = latest.audienceAgentIds?.length ?? 0;
  const targetLabel = audienceCount > 0 ? `${audienceCount} 位成员` : "团队成员";
  return `最近派发给 ${targetLabel}：${truncateRoomPreview(latest.text)}`;
}

/**
 * Parse a CEO-style TASK-BOARD.md (markdown table format) into TrackedTask[].
 * Expects a table with columns: 优先级 | 任务 | 负责人 | 状态 | 进度 | 截止时间
 */
function parseTaskBoardMd(content: string, sourceAgentId: string): TrackedTask[] {
  const tasks: TrackedTask[] = [];

  // ---- 1) Parse "当前任务总览" table ----
  const overviewMatch = content.match(/##\s*🎯\s*当前任务总览[\s\S]*?(?=\n---\s*\n|\n##\s|$)/);
  if (overviewMatch) {
    const tableLines = overviewMatch[0]
      .split("\n")
      .filter(
        (l) =>
          l.trim().startsWith("|") &&
          !l.includes("---") &&
          !l.includes("优先级") &&
          !l.includes("任务 |"),
      );

    const steps: TaskStep[] = [];
    for (const line of tableLines) {
      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cols.length < 4) continue;
      const [priority, taskName, assignee, statusEmoji, progressStr] = cols;
      const status: TaskStep["status"] =
        statusEmoji?.includes("🔄") || statusEmoji?.includes("进行")
          ? "wip"
          : statusEmoji?.includes("✅") || statusEmoji?.includes("完成")
            ? "done"
            : "pending";
      const pctMatch = progressStr?.match(/(\d+)%/);
      const pct = pctMatch ? parseInt(pctMatch[1], 10) : 0;

      const pText = (priority || "").replace(/\*/g, "").trim();
      const pLabel = pText ? `[${pText}] ` : "";

      steps.push({
        text: `${pLabel}${taskName}`,
        status: status === "done" ? "done" : pct >= 100 ? "done" : pct > 0 ? "wip" : status,
        assignee: assignee || undefined,
      });
    }

    if (steps.length > 0) {
      tasks.push({
        id: `file_overview_${sourceAgentId}`,
        title: "🎯 当前任务总览",
        sessionKey: `__file_task_overview_${sourceAgentId}`,
        agentId: sourceAgentId,
        source: "file",
        sourceAgentId,
        steps,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  // ---- 2) Parse "已完成任务" table ----
  const doneMatch = content.match(/##\s*✅\s*已完成任务[\s\S]*?(?=\n---\s*\n|\n##\s|$)/);
  if (doneMatch) {
    const doneLines = doneMatch[0]
      .split("\n")
      .filter((l) => l.trim().startsWith("|") && !l.includes("---") && !l.includes("任务 |"));

    const steps: TaskStep[] = [];
    for (const line of doneLines) {
      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cols.length < 2) continue;
      const [taskName, assignee] = cols;

      steps.push({ text: taskName, status: "done", assignee: assignee || undefined });
    }

    if (steps.length > 0) {
      tasks.push({
        id: `file_done_${sourceAgentId}`,
        title: "✅ 已完成任务",
        sessionKey: `__file_task_done_${sourceAgentId}`,
        agentId: sourceAgentId,
        source: "file",
        sourceAgentId,
        steps,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  return tasks;
}

function mapParticipantStatusToStepStatus(statusLabel: string): TaskStep["status"] {
  if (["已确认", "已冻结待命", "已回复", "已交接"].includes(statusLabel)) {
    return "done";
  }
  if (
    [
      "已开工",
      "已开工未交付",
      "已阻塞",
      "交接阻塞",
      "待回复",
      "未回复",
      "已接单",
      "已接单未推进",
      "已交付待下游",
      "部分完成",
      "待接手",
      "已就绪待稿",
    ].includes(statusLabel)
  ) {
    return "wip";
  }
  return "pending";
}

function mapRequirementState(
  participant: RequirementParticipantProgress | null,
): TaskExecutionState {
  if (!participant) {
    return "unknown";
  }
  if (participant.isBlocking) {
    return "blocked_timeout";
  }
  if (["待回复", "未回复"].includes(participant.statusLabel)) {
    return "waiting_peer";
  }
  if (["已交付待下游", "待接手", "已就绪待稿"].includes(participant.statusLabel)) {
    return "waiting_peer";
  }
  if (["已确认", "已冻结待命", "已回复", "已交接"].includes(participant.statusLabel)) {
    return "completed";
  }
  if (["已开工", "已开工未交付", "已接单", "已接单未推进", "部分完成"].includes(participant.statusLabel)) {
    return "running";
  }
  return "idle";
}

function buildRequirementSyntheticTask(input: {
  requirementOverview: RequirementExecutionOverview;
  currentOwnerSessionKey?: string;
  titleOverride?: string | null;
  now: number;
}): TrackedTask {
  const { requirementOverview, currentOwnerSessionKey, now, titleOverride } = input;
  const currentParticipant =
    requirementOverview.participants.find((participant) => participant.isCurrent) ?? null;
  const isStrategic = isStrategicRequirementTopic(requirementOverview.topicKey);
  const allParticipantsCompleted =
    requirementOverview.participants.length > 0 &&
    requirementOverview.participants.every((participant) =>
      isParticipantCompletedStatus(participant.statusLabel),
    );

  return {
    id: `requirement:${requirementOverview.topicKey}`,
    title: titleOverride?.trim() || requirementOverview.title,
    sessionKey:
      currentOwnerSessionKey ??
      `requirement:${requirementOverview.topicKey}`,
    agentId:
      requirementOverview.currentOwnerAgentId ??
      requirementOverview.participants[0]?.agentId ??
      "unknown",
    ownerAgentId: requirementOverview.currentOwnerAgentId ?? undefined,
    assigneeAgentIds: requirementOverview.participants.map((participant) => participant.agentId),
    steps: requirementOverview.participants.map((participant) => ({
      text: `${participant.nickname} · ${participant.stage}`,
      status: mapParticipantStatusToStepStatus(participant.statusLabel),
      assignee: `@${participant.nickname}`,
    })),
    state: isStrategic
      ? allParticipantsCompleted
        ? "completed"
        : "running"
      : mapRequirementState(currentParticipant),
    summary: requirementOverview.summary,
    blockedReason:
      !isStrategic && currentParticipant?.isBlocking ? currentParticipant.detail : undefined,
    createdAt: requirementOverview.participants[0]?.updatedAt ?? now,
    updatedAt:
      requirementOverview.participants.reduce(
        (latest, participant) => Math.max(latest, participant.updatedAt),
        0,
      ) || now,
  };
}

function buildStrategicBoardFocusSummary(
  requirementOverview: RequirementExecutionOverview,
): ReturnType<typeof buildExecutionFocusSummary> {
  return {
    headline: requirementOverview.headline,
    ownerLabel: requirementOverview.currentOwnerLabel || "当前负责人",
    ownerRole: "战略主线",
    currentWork: `${requirementOverview.currentOwnerLabel || "当前负责人"} 正在处理：${requirementOverview.currentStage}`,
    blockReason: undefined,
    nextStep: requirementOverview.nextAction,
    detailHint: requirementOverview.summary,
  };
}

function buildStrategicWorkItemFocusSummary(
  workItem: WorkItemRecord,
): ReturnType<typeof buildExecutionFocusSummary> {
  return {
    headline: `${workItem.ownerLabel || "当前负责人"} 正在推进战略主线`,
    ownerLabel: workItem.ownerLabel || "当前负责人",
    ownerRole: "战略主线",
    currentWork: `${workItem.ownerLabel || "当前负责人"} 正在处理：${workItem.stageLabel}`,
    blockReason: workItem.status === "blocked" ? workItem.nextAction : undefined,
    nextStep: workItem.nextAction,
    detailHint: workItem.summary,
  };
}

function isCanonicalWorkItemRecord(
  workItem: WorkItemRecord,
  ceoAgentId: string | null | undefined,
): boolean {
  if (workItem.sessionKey?.includes(":group:")) {
    return true;
  }
  if (!ceoAgentId || !workItem.sessionKey) {
    return false;
  }
  return parseAgentIdFromSessionKey(workItem.sessionKey) === ceoAgentId;
}

function mapWorkStepStatusToTaskStepStatus(status: WorkItemRecord["steps"][number]["status"]): TaskStep["status"] {
  if (status === "done" || status === "skipped") {
    return "done";
  }
  if (status === "active") {
    return "wip";
  }
  return "pending";
}

function mapWorkItemStatusToExecutionState(status: WorkItemRecord["status"]): TaskExecutionState {
  if (status === "completed" || status === "archived") {
    return "completed";
  }
  if (status === "blocked") {
    return "blocked_timeout";
  }
  if (status === "waiting_owner") {
    return "running";
  }
  if (status === "waiting_review") {
    return "waiting_input";
  }
  return "running";
}

function buildWorkItemSyntheticTask(input: {
  workItem: WorkItemRecord;
}): TrackedTask {
  const { workItem } = input;
  const assigneeAgentIds = [
    ...new Set(
      [
        workItem.ownerActorId,
        workItem.batonActorId,
        ...workItem.steps.map((step) => step.assigneeActorId),
      ].filter(Boolean),
    ),
  ] as string[];

  return {
    id: `workitem:${workItem.id}`,
    title: workItem.title,
    sessionKey: workItem.sessionKey ?? workItem.roomId ?? `workitem:${workItem.id}`,
    agentId: workItem.ownerActorId ?? workItem.batonActorId ?? "unknown",
    ownerAgentId: workItem.ownerActorId ?? undefined,
    assigneeAgentIds,
    steps: workItem.steps.map((step) => ({
      text: step.title,
      status: mapWorkStepStatusToTaskStepStatus(step.status),
      assignee: step.assigneeLabel ? `@${step.assigneeLabel}` : undefined,
    })),
    state: mapWorkItemStatusToExecutionState(workItem.status),
    summary: workItem.summary,
    blockedReason: workItem.status === "blocked" ? workItem.nextAction : undefined,
    createdAt: workItem.startedAt,
    updatedAt: workItem.updatedAt,
  };
}

export function BoardPage() {
  const navigate = useNavigate();
  const {
    activeCompany,
    activeMissionRecords,
    activeRoomRecords,
    activeWorkItems,
    activeArtifacts,
    activeDispatches,
    upsertWorkItemRecord,
    upsertTask,
    updateCompany,
  } = useCompanyStore();
  const connected = useGatewayStore((state) => state.connected);
  const isPageVisible = usePageVisibility();
  const [sessions, setSessions] = useState<GatewaySessionRow[]>([]);
  const [, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [sessionMeta, setSessionMeta] = useState<Map<string, { topic: string; msgCount: number }>>(
    new Map(),
  );
  const [sessionStates, setSessionStates] = useState<Map<string, ResolvedExecutionState>>(new Map());
  const [sessionTakeoverPacks, setSessionTakeoverPacks] = useState<Map<string, ManualTakeoverPack>>(
    new Map(),
  );
  const fetchedKeysRef = useRef<Set<string>>(new Set());
  const [showSessions, setShowSessions] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [fileTasks, setFileTasks] = useState<TrackedTask[]>([]);
  const [dialogConfig, setDialogConfig] = useState<{
    open: boolean;
    type: "nudge" | "compact" | "delete" | null;
    sessionKey: string | null;
  }>({ open: false, type: null, sessionKey: null });
  const [dialogSubmitting, setDialogSubmitting] = useState(false);
  const [recoveringCommunication, setRecoveringCommunication] = useState(false);
  const [companySessionSnapshots, setCompanySessionSnapshots] = useState<RequirementSessionSnapshot[]>([]);

  useEffect(() => {
    async function loadBoard() {
      if (!connected || !isPageVisible) {
        return;
      }
      try {
        const res = await gateway.listSessions();
        setSessions(res.sessions || []);
      } catch (err) {
        console.error("Failed to load sessions:", err);
      } finally {
        setLoading(false);
      }

      // Try to load TASK-BOARD.md from CEO's workspace
      if (activeCompany) {
        const ceo = activeCompany.employees.find((e) => e.metaRole === "ceo");
        if (ceo) {
          try {
            const fileResult = await gateway.getAgentFile(ceo.agentId, "TASK-BOARD.md");
            if (fileResult?.file?.content) {
              const parsed = parseTaskBoardMd(fileResult.file.content, ceo.agentId);
              setFileTasks(parsed);
            }
          } catch {
            // TASK-BOARD.md doesn't exist yet – that's fine
          }
        }
      }
    }
    loadBoard();
    const t = setInterval(loadBoard, 15000);
    return () => clearInterval(t);
  }, [activeCompany, connected, isPageVisible]);

  const extractText = useCallback((msg: ChatMessage): string => {
    if (typeof msg.text === "string" && msg.text.trim()) {
      return msg.text.trim();
    }
    if (typeof msg.content === "string" && msg.content.trim()) {
      return msg.content.trim();
    }
    if (Array.isArray(msg.content)) {
      return msg.content
        .map((b: unknown) => {
          if (typeof b === "string") {
            return b;
          }
          if (b && typeof b === "object" && !Array.isArray(b)) {
            const rec = b as Record<string, unknown>;
            if (rec.type === "text" && typeof rec.text === "string") {
              return rec.text;
            }
          }
          return "";
        })
        .join(" ")
        .trim();
    }
    return "";
  }, []);

  useEffect(() => {
    if (!isPageVisible || sessions.length === 0) {
      return;
    }
    const keysToFetch = sessions.map((s) => s.key).filter((k) => !fetchedKeysRef.current.has(k));
    if (keysToFetch.length === 0) {
      return;
    }

    const controller = new AbortController();
    (async () => {
      const entries: Array<[string, { topic: string; msgCount: number }]> = [];
      const snapshots: RequirementSessionSnapshot[] = [];
      const batch = keysToFetch.slice(0, 15);
      const promises = batch.map(async (key) => {
        const session = sessions.find((item) => item.key === key);
        try {
          const history = await gateway.getChatHistory(key, 20);
          const messages = history.messages || [];
          const firstHuman = messages.find((m) => m.role === "user");
          const topic = firstHuman ? extractText(firstHuman) : "";
          const truncatedTopic = topic.length > 120 ? topic.slice(0, 120) + "..." : topic;
          const evidenceTexts = messages
            .map((message) => extractText(message))
            .filter((text): text is string => text.length > 0);
          const execution = resolveExecutionState({
            session,
            evidenceTexts,
            now: Date.now(),
          });
          entries.push([
            key,
            { topic: truncatedTopic || "(未检测到任务指令)", msgCount: messages.length },
          ]);
          const sessionAgentId = session ? parseAgentIdFromSessionKey(session.key) : null;
          if (sessionAgentId) {
            snapshots.push({
              agentId: sessionAgentId,
              sessionKey: key,
              updatedAt: session ? resolveSessionUpdatedAt(session) : Date.now(),
              messages: createRequirementMessageSnapshots(messages, {
                limit: REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT,
              }),
            });
          }
          setSessionStates((prev) => {
            const next = new Map(prev);
            next.set(key, execution);
            return next;
          });
          if (execution.state === "manual_takeover_required") {
            const sessionAgentId = session ? parseAgentIdFromSessionKey(session.key) : null;
            const ownerLabel =
              activeCompany?.employees.find((employee) => employee.agentId === sessionAgentId)
                ?.nickname ??
              sessionAgentId ??
              "未知节点";
            const pack = buildManualTakeoverPack({
              messages,
              sessionKey: key,
              ownerLabel,
              fallbackTitle: truncatedTopic || ownerLabel,
            });
            if (pack) {
              setSessionTakeoverPacks((prev) => {
                const next = new Map(prev);
                next.set(key, pack);
                return next;
              });
            }
          }
          fetchedKeysRef.current.add(key);
        } catch {
          entries.push([key, { topic: "(加载失败)", msgCount: 0 }]);
          setSessionStates((prev) => {
            const next = new Map(prev);
            next.set(
              key,
              resolveExecutionState({
                session,
                fallbackState: "unknown",
              }),
            );
            return next;
          });
          fetchedKeysRef.current.add(key);
        }
      });
      await Promise.allSettled(promises);
      if (!controller.signal.aborted) {
        setSessionMeta((prev) => {
          const next = new Map(prev);
          for (const [k, v] of entries) {
            next.set(k, v);
          }
          return next;
        });
        if (snapshots.length > 0) {
          setCompanySessionSnapshots((prev) => {
            const activeSessionKeys = new Set(sessions.map((session) => session.key));
            const bySessionKey = new Map(prev.map((snapshot) => [snapshot.sessionKey, snapshot]));
            snapshots.forEach((snapshot) => {
              bySessionKey.set(snapshot.sessionKey, snapshot);
            });
            return [...bySessionKey.values()]
              .filter((snapshot) => activeSessionKeys.has(snapshot.sessionKey))
              .sort((left, right) => right.updatedAt - left.updatedAt)
              .slice(0, 12);
          });
        }
      }
    })();
    return () => controller.abort();
  }, [extractText, isPageVisible, sessions]);

  useEffect(() => {
    const activeKeys = new Set(sessions.map((session) => session.key));
    fetchedKeysRef.current = new Set(
      [...fetchedKeysRef.current].filter((key) => activeKeys.has(key)),
    );
    setSessionMeta((previous) => {
      const next = new Map(
        [...previous.entries()].filter(([key]) => activeKeys.has(key)),
      );
      return next.size === previous.size ? previous : next;
    });
    setSessionStates((previous) => {
      const next = new Map(
        [...previous.entries()].filter(([key]) => activeKeys.has(key)),
      );
      return next.size === previous.size ? previous : next;
    });
    setSessionTakeoverPacks((previous) => {
      const next = new Map(
        [...previous.entries()].filter(([key]) => activeKeys.has(key)),
      );
      return next.size === previous.size ? previous : next;
    });
    setCompanySessionSnapshots((previous) => {
      const next = previous.filter((snapshot) => activeKeys.has(snapshot.sessionKey));
      return next.length === previous.length ? previous : next;
    });
  }, [sessions]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  const companyAgentIds = new Set(activeCompany.employees.map((e) => e.agentId));
  const companySessions = [
    ...sessions
      .map((session) => ({ ...session, agentId: parseAgentIdFromSessionKey(session.key) }))
      .filter((session): session is GatewaySessionRow & { agentId: string } => {
        const agentId = session.agentId;
        return typeof agentId === "string" && companyAgentIds.has(agentId);
      }),
  ].sort(
    (a: GatewaySessionRow & { agentId: string }, b: GatewaySessionRow & { agentId: string }) =>
      resolveSessionUpdatedAt(b) - resolveSessionUpdatedAt(a),
  );

  const activeSessions = companySessions.filter(
    (session: GatewaySessionRow & { agentId: string }) => isSessionActive(session, currentTime),
  );
  const archivedSessions = companySessions.filter(
    (session: GatewaySessionRow & { agentId: string }) => !isSessionActive(session, currentTime),
  );

  const getEmpName = (agentId: string) => {
    const emp = activeCompany.employees.find((e) => e.agentId === agentId);
    return emp ? emp.nickname : agentId;
  };
  const ceo = activeCompany.employees.find((employee) => employee.metaRole === "ceo") ?? null;

  const requirementOverview = useMemo(
    () =>
      activeCompany
        ? buildRequirementExecutionOverview({
            company: activeCompany,
            sessionSnapshots: companySessionSnapshots,
            now: currentTime,
          })
        : null,
    [activeCompany, companySessionSnapshots, currentTime],
  );
  const requirementScope = useMemo(
    () => (activeCompany ? buildRequirementScope(activeCompany, requirementOverview) : null),
    [activeCompany, requirementOverview],
  );
  const canonicalWorkItems = useMemo(
    () => activeWorkItems.filter((item) => isCanonicalWorkItemRecord(item, ceo?.agentId)),
    [activeWorkItems, ceo?.agentId],
  );
  const latestOpenWorkItem = useMemo(
    () =>
      [...canonicalWorkItems]
        .filter((item) => item.status !== "completed" && item.status !== "archived")
        .sort((left, right) => {
          const leftSpecific = Number(Boolean(left.topicKey));
          const rightSpecific = Number(Boolean(right.topicKey));
          if (leftSpecific !== rightSpecific) {
            return rightSpecific - leftSpecific;
          }
          return right.updatedAt - left.updatedAt;
        })[0] ?? null,
    [canonicalWorkItems],
  );
  const requirementTopicKeyHint = requirementOverview?.topicKey ?? latestOpenWorkItem?.topicKey ?? null;
  const requirementStartedAtHint = requirementOverview?.startedAt ?? latestOpenWorkItem?.startedAt ?? null;
  const currentRequirementSessionKey =
    requirementOverview?.currentOwnerAgentId
      ? companySessions.find((session) => session.agentId === requirementOverview.currentOwnerAgentId)?.key
      : latestOpenWorkItem?.ownerActorId
        ? companySessions.find((session) => session.agentId === latestOpenWorkItem.ownerActorId)?.key
        : undefined;
  const activeMission = useMemo(
    () =>
      pickConversationMissionRecord({
        missions: activeMissionRecords,
        sessionKey: currentRequirementSessionKey ?? null,
        topicKey: requirementTopicKeyHint,
        startedAt: requirementStartedAtHint,
      }),
    [activeMissionRecords, currentRequirementSessionKey, requirementStartedAtHint, requirementTopicKeyHint],
  );
  const latestMission = useMemo(
    () =>
      [...activeMissionRecords]
        .sort((left, right) => {
          const leftSpecific = Number(Boolean(left.topicKey));
          const rightSpecific = Number(Boolean(right.topicKey));
          if (leftSpecific !== rightSpecific) {
            return rightSpecific - leftSpecific;
          }
          return Number(left.completed) - Number(right.completed) || right.updatedAt - left.updatedAt;
        })[0] ?? null,
    [activeMissionRecords],
  );
  const matchedWorkItem = useMemo(
    () =>
      pickWorkItemRecord({
        items: canonicalWorkItems,
        sessionKey: currentRequirementSessionKey ?? null,
        topicKey: requirementTopicKeyHint,
        startedAt: requirementStartedAtHint,
      }),
    [canonicalWorkItems, currentRequirementSessionKey, requirementStartedAtHint, requirementTopicKeyHint],
  );
  const bootstrapRequirementWorkItem = useMemo(() => {
    if (!activeCompany || !requirementOverview) {
      return null;
    }

    const currentWorkItemMatches =
      matchedWorkItem &&
      matchedWorkItem.topicKey === requirementOverview.topicKey &&
      Math.abs((matchedWorkItem.startedAt ?? 0) - requirementOverview.startedAt) <= 1_000;
    if (currentWorkItemMatches) {
      return null;
    }

    return reconcileWorkItemRecord({
      companyId: activeCompany.id,
      existingWorkItem: matchedWorkItem,
      overview: requirementOverview,
      room: activeRoomRecords.find((room) => room.workItemId === matchedWorkItem?.id) ?? null,
      artifacts: activeArtifacts,
      dispatches: activeDispatches,
      fallbackSessionKey: currentRequirementSessionKey,
    });
  }, [
    activeArtifacts,
    activeCompany,
    activeDispatches,
    activeRoomRecords,
    currentRequirementSessionKey,
    matchedWorkItem,
    requirementOverview,
  ]);
  const activeWorkItem = useMemo(() => {
    if (bootstrapRequirementWorkItem) {
      return bootstrapRequirementWorkItem;
    }
    if (latestOpenWorkItem?.topicKey && !matchedWorkItem?.topicKey) {
      return latestOpenWorkItem;
    }
    return matchedWorkItem ?? latestOpenWorkItem;
  }, [bootstrapRequirementWorkItem, latestOpenWorkItem, matchedWorkItem]);

  useEffect(() => {
    if (!bootstrapRequirementWorkItem) {
      return;
    }
    upsertWorkItemRecord(bootstrapRequirementWorkItem);
  }, [bootstrapRequirementWorkItem, upsertWorkItemRecord]);
  const primaryRequirementTopicKey =
    activeWorkItem?.topicKey ?? activeMission?.topicKey ?? requirementTopicKeyHint;
  const isStrategicRequirement = isStrategicRequirementTopic(primaryRequirementTopicKey);
  const strategicRequirementOverview =
    requirementOverview && requirementOverview.topicKey === primaryRequirementTopicKey
      ? requirementOverview
      : null;
  const latestWorkItem = useMemo(
    () =>
      [...canonicalWorkItems]
        .sort(
          (left, right) =>
            Number(left.status === "completed") - Number(right.status === "completed") ||
            right.updatedAt - left.updatedAt,
        )[0] ?? null,
    [canonicalWorkItems],
  );
  const boardMission = activeWorkItem ?? activeMission ?? latestWorkItem ?? latestMission;
  const latestRequirementRoom = useMemo(
    () =>
      [...activeRoomRecords]
        .filter((room) =>
          (activeWorkItem?.id ? room.workItemId === activeWorkItem.id : true) &&
          (Boolean(room.topicKey) || room.title.trim().length > 0),
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null,
    [activeRoomRecords, activeWorkItem?.id],
  );
  const requirementDisplayTitle =
    isStrategicRequirement && strategicRequirementOverview
      ? strategicRequirementOverview.title
      : boardMission?.title ?? requirementOverview?.title ?? "当前需求";
  const requirementDisplayCurrentStep =
    isStrategicRequirement && strategicRequirementOverview
      ? strategicRequirementOverview.headline
      : (isConversationMissionRecord(boardMission)
          ? boardMission.currentStepLabel
          : isWorkItemRecord(boardMission)
            ? boardMission.stageLabel
            : null) ?? requirementOverview?.headline ?? "待确认";
  const requirementDisplaySummary =
    isStrategicRequirement && strategicRequirementOverview
      ? strategicRequirementOverview.summary
      : boardMission?.summary ?? requirementOverview?.summary ?? "待确认";
  const requirementDisplayOwner =
    isStrategicRequirement && strategicRequirementOverview
      ? strategicRequirementOverview.currentOwnerLabel || "待确认"
      : boardMission?.ownerLabel || requirementOverview?.currentOwnerLabel || "待确认";
  const requirementDisplayStage =
    isStrategicRequirement && strategicRequirementOverview
      ? strategicRequirementOverview.currentStage
      : (isConversationMissionRecord(boardMission)
          ? boardMission.currentStepLabel
          : isWorkItemRecord(boardMission)
            ? boardMission.stageLabel
            : null) ?? requirementOverview?.currentStage ?? "待确认";
  const requirementDisplayNext =
    isStrategicRequirement && strategicRequirementOverview
      ? strategicRequirementOverview.nextAction
      : (isConversationMissionRecord(boardMission)
          ? boardMission.nextLabel
          : isWorkItemRecord(boardMission)
            ? boardMission.nextAction
            : null) ?? requirementOverview?.nextAction ?? "待确认";
  const requirementSyntheticTask = useMemo(
    () =>
      activeWorkItem
        ? buildWorkItemSyntheticTask({
            workItem: activeWorkItem,
          })
        : (strategicRequirementOverview ?? requirementOverview)
          ? buildRequirementSyntheticTask({
              requirementOverview: strategicRequirementOverview ?? requirementOverview!,
              currentOwnerSessionKey: currentRequirementSessionKey,
              titleOverride: requirementDisplayTitle,
              now: currentTime,
            })
          : null,
    [activeWorkItem, currentRequirementSessionKey, currentTime, requirementDisplayTitle, requirementOverview, strategicRequirementOverview],
  );
  const currentRequirementTopicKey =
    strategicRequirementOverview?.topicKey ??
    boardMission?.topicKey ??
    requirementOverview?.topicKey ??
    latestRequirementRoom?.topicKey ??
    null;
  const currentRequirementWorkItemId = activeWorkItem?.id ?? latestRequirementRoom?.workItemId ?? null;
  const currentRequirementRoomTitle =
    strategicRequirementOverview?.title ??
    boardMission?.title ??
    requirementOverview?.title ??
    latestRequirementRoom?.title ??
    requirementDisplayTitle;
  const requirementRoomRecords = useMemo(() => {
    if (!currentRequirementTopicKey && !currentRequirementRoomTitle) {
      return [];
    }
    if (currentRequirementTopicKey) {
      const normalizedTopicKey = currentRequirementTopicKey.trim().toLowerCase();
      const exactMatches = activeRoomRecords.filter(
        (room) => room.topicKey?.trim().toLowerCase() === normalizedTopicKey,
      );
      if (exactMatches.length > 0) {
        return [...exactMatches].sort((left, right) => right.updatedAt - left.updatedAt);
      }
    }
    const normalizedTitle = currentRequirementRoomTitle.trim().toLowerCase();
    return activeRoomRecords
      .filter((room) => room.title.trim().toLowerCase() === normalizedTitle)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }, [activeRoomRecords, currentRequirementRoomTitle, currentRequirementTopicKey]);
  const requirementRoomMemberIds = useMemo(
    () => {
      const overview = strategicRequirementOverview ?? requirementOverview;
      if (overview) {
        return [...new Set(overview.participants.map((participant) => participant.agentId).filter(Boolean))];
      }
      if (boardMission) {
        if (isWorkItemRecord(boardMission)) {
          return [
            ...new Set(
              [
                boardMission.ownerActorId,
                boardMission.batonActorId,
                ...boardMission.steps.map((step) => step.assigneeActorId),
              ].filter(Boolean),
            ),
          ] as string[];
        }
        if (!isWorkItemRecord(boardMission)) {
          const legacyMission = boardMission as ConversationMissionRecord;
          return [
            ...new Set(
              [
                legacyMission.ownerAgentId,
                ...legacyMission.planSteps.map((step) => step.assigneeAgentId),
              ].filter(Boolean),
            ),
          ] as string[];
        }
      }
      if (latestRequirementRoom) {
        return [...new Set(latestRequirementRoom.memberIds.filter(Boolean))];
      }
      return [];
    },
    [boardMission, latestRequirementRoom, requirementOverview, strategicRequirementOverview],
  );
  const requirementRoomRoute = useMemo(() => {
    if ((!currentRequirementTopicKey && !currentRequirementRoomTitle) || requirementRoomMemberIds.length < 2) {
      return null;
    }
    return buildRequirementRoomRoute({
      company: activeCompany,
      memberIds: requirementRoomMemberIds,
      topic: currentRequirementRoomTitle,
      topicKey: currentRequirementTopicKey,
      workItemId: currentRequirementWorkItemId,
      preferredInitiatorAgentId:
        ceo?.agentId ??
        requirementOverview?.currentOwnerAgentId ??
        (isWorkItemRecord(boardMission) ? boardMission.ownerActorId : null) ??
        (isConversationMissionRecord(boardMission) ? boardMission.ownerAgentId : null) ??
        null,
      existingRooms: activeRoomRecords,
    });
  }, [
    activeCompany,
    activeRoomRecords,
    boardMission,
    ceo?.agentId,
    currentRequirementRoomTitle,
    currentRequirementTopicKey,
    currentRequirementWorkItemId,
    requirementOverview?.currentOwnerAgentId,
    requirementRoomMemberIds,
  ]);

  const handleNudge = (sessionKey: string) =>
    setDialogConfig({ open: true, type: "nudge", sessionKey });
  const handleDelete = (sessionKey: string) =>
    setDialogConfig({ open: true, type: "delete", sessionKey });

  const onDialogSubmit = async (values: Record<string, string>) => {
    const { type, sessionKey } = dialogConfig;
    if (!type || !sessionKey) {
      return;
    }
    setDialogSubmitting(true);
    try {
      if (type === "nudge") {
        const msg = values.nudgeText || "请报告当前进度并加快处理";
        await gateway.sendChatMessage(sessionKey, msg);
        toast.success("指令已下发", "已将催促指令强制插入任务流");
      } else if (type === "compact") {
        const res = await gateway.compactSession(sessionKey, 400);
        toast.success(
          "执行完毕",
          res.compacted ? "上下文已成功被安全压缩。" : "该上下文较短，无需压缩。",
        );
      } else if (type === "delete") {
        await gateway.deleteSession(sessionKey);
        toast.success("销毁成功", "任务进程及日志已从底层剥离");
        setSessions((s) => s.filter((x) => x.key !== sessionKey));
      }
      setDialogConfig({ open: false, type: null, sessionKey: null });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      toast.error("操作失败", errMsg);
    } finally {
      setDialogSubmitting(false);
    }
  };

  // === 任务数据聚合：合并 store.tasks + 文件解析任务 ===
  const storeTasks = activeCompany.tasks ?? [];
  const storeTaskIds = new Set(storeTasks.map((t) => t.id));
  const mergedFileTasks = fileTasks.filter((ft) => !storeTaskIds.has(ft.id));
  const mergedTrackedTasks = [...storeTasks, ...mergedFileTasks]
    .map((task) => {
      const linkedSession = companySessions.find((session) => session.key === task.sessionKey);
      const fallbackDone =
        task.steps.length > 0 && task.steps.every((step) => step.status === "done")
          ? "completed"
          : task.steps.some((step) => step.status === "wip")
            ? "running"
            : "idle";
      const execution =
        sessionStates.get(task.sessionKey) ??
        resolveExecutionState({
          session: linkedSession,
          taskSteps: task.steps,
          fallbackState: fallbackDone,
          now: currentTime,
        });
      return buildTaskObjectSnapshot({
        task,
        company: activeCompany,
        execution,
        takeoverPack: sessionTakeoverPacks.get(task.sessionKey),
        now: currentTime,
      });
    })
    .sort((a, b) => {
      const weightDiff = getTaskSortWeight(a.state) - getTaskSortWeight(b.state);
      if (weightDiff !== 0) {
        return weightDiff;
      }

      const aSummary = summarizeTaskSteps(a.steps);
      const bSummary = summarizeTaskSteps(b.steps);
      if (aSummary.pendingCount !== bSummary.pendingCount) {
        return bSummary.pendingCount - aSummary.pendingCount;
      }

      return b.updatedAt - a.updatedAt;
    });
  const scopedTrackedTasks =
    requirementScope && requirementScope.tasks.length > 0
      ? mergedTrackedTasks.filter((task) =>
          requirementScope.tasks.some((scopedTask) => scopedTask.id === task.id),
        )
      : [];
  const shouldUseWorkItemPrimaryView = Boolean(activeWorkItem && requirementSyntheticTask);
  const trackedTasks = (
    shouldUseWorkItemPrimaryView
      ? [requirementSyntheticTask]
      : requirementOverview && isStrategicRequirement && requirementSyntheticTask
        ? [requirementSyntheticTask]
        : requirementOverview && scopedTrackedTasks.length === 0 && requirementSyntheticTask
          ? [requirementSyntheticTask]
          : requirementScope
            ? scopedTrackedTasks
            : mergedTrackedTasks
  ).filter((task): task is TrackedTask => Boolean(task));

  useEffect(() => {
    if (!activeCompany || trackedTasks.length === 0) {
      return;
    }

    const needsBackfill = trackedTasks.filter(
      (task) =>
        !task.ownerAgentId ||
        !task.state ||
        !Array.isArray(task.assigneeAgentIds) ||
        typeof task.summary !== "string",
    );
    if (needsBackfill.length === 0) {
      return;
    }

    needsBackfill.forEach((task) => {
      upsertTask(task).catch(console.error);
    });
  }, [activeCompany, trackedTasks, upsertTask]);

  const totalSteps = trackedTasks.reduce((acc, t) => acc + t.steps.length, 0);
  const doneSteps = trackedTasks.reduce(
    (acc, t) => acc + t.steps.filter((s) => s.status === "done").length,
    0,
  );
  const wipSteps = trackedTasks.reduce(
    (acc, t) => acc + t.steps.filter((s) => s.status === "wip").length,
    0,
  );
  const globalPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  // 分离活跃任务和已归档任务
  const activeTasks = trackedTasks.filter((task) => {
    const total = task.steps.length;
    const done = task.steps.filter((s) => s.status === "done").length;
    return total === 0 || done < total;
  });

  const archivedGroups = trackedTasks.filter((task) => {
    const total = task.steps.length;
    const done = task.steps.filter((s) => s.status === "done").length;
    return total > 0 && done === total;
  });
  const rawHandoffRecords = getActiveHandoffs(activeCompany.handoffs ?? []);
  const handoffRecords = requirementScope?.handoffs ?? rawHandoffRecords;
  const pendingHandoffs = handoffRecords.filter((handoff) => handoff.status !== "completed");
  const rawSlaAlerts = evaluateSlaAlerts(activeCompany, currentTime);
  const slaAlerts = filterRequirementSlaAlerts(rawSlaAlerts, requirementScope);
  const displayRequests = requirementScope?.requests ?? (activeCompany.requests ?? []);
  const requestHealth = summarizeRequestHealth(displayRequests);
  const visibleTakeoverCount = isStrategicRequirement ? 0 : sessionTakeoverPacks.size;
  const visiblePendingHandoffs = isStrategicRequirement ? [] : pendingHandoffs;
  const visibleSlaAlerts = isStrategicRequirement ? [] : slaAlerts;
  const visibleRequestHealth = isStrategicRequirement
    ? { total: 0, active: 0, blocked: 0 }
    : requestHealth;
  const prioritizedActiveTasks = activeTasks.map((task) => {
    const stepSummary = summarizeTaskSteps(task.steps);
    const isStrategicSyntheticTask = Boolean(
      isStrategicRequirement &&
        requirementSyntheticTask &&
        task.id === requirementSyntheticTask.id,
    );
    const execution = isStrategicSyntheticTask
      ? resolveExecutionState({
          fallbackState:
            task.state ??
            (stepSummary.doneCount === stepSummary.total ? "completed" : "running"),
          taskSteps: task.steps,
        })
      : resolveExecutionState({
          fallbackState:
            task.state ??
            (stepSummary.doneCount === stepSummary.total
              ? "completed"
              : stepSummary.wipCount > 0
                ? "running"
                : "idle"),
          evidenceTexts: [task.blockedReason, task.summary],
          taskSteps: task.steps,
        });
    const relatedHandoffs = isStrategicSyntheticTask
      ? []
      : handoffRecords.filter(
          (handoff) => handoff.taskId === task.id || handoff.sessionKey === task.sessionKey,
        );
    const relatedRequests = isStrategicSyntheticTask
      ? []
      : displayRequests.filter(
          (request) =>
            request.taskId === task.id ||
            request.sessionKey === task.sessionKey ||
            request.handoffId === relatedHandoffs[0]?.id,
        );
    const relatedAlerts = isStrategicSyntheticTask
      ? []
      : slaAlerts.filter(
          (alert) => alert.taskId === task.id || alert.sessionKey === task.sessionKey,
        );
    const focusSummary =
      isStrategicSyntheticTask
        ? strategicRequirementOverview
          ? buildStrategicBoardFocusSummary(strategicRequirementOverview)
          : activeWorkItem
            ? buildStrategicWorkItemFocusSummary(activeWorkItem)
            : buildExecutionFocusSummary({
                company: activeCompany,
                targetAgentId: task.ownerAgentId ?? task.agentId,
                targetRoleLabel: "战略主线",
                execution,
                task,
                requests: [],
                handoffs: [],
                takeoverPack: null,
                alerts: [],
              })
        : buildExecutionFocusSummary({
            company: activeCompany,
            targetAgentId: task.ownerAgentId ?? task.agentId,
            targetRoleLabel: "任务",
            execution,
            task,
            requests: relatedRequests,
            handoffs: relatedHandoffs,
            takeoverPack: sessionTakeoverPacks.get(task.sessionKey) ?? null,
            alerts: relatedAlerts,
          });

    return {
      task,
      stepSummary,
      execution,
      lane: isStrategicSyntheticTask ? "active" : getTaskLane(task.state ?? execution.state),
      ownerLabel: getEmpName(task.ownerAgentId || task.agentId),
      takeoverPack: isStrategicSyntheticTask ? null : sessionTakeoverPacks.get(task.sessionKey),
      focusSummary,
    };
  });

  const taskSequence = prioritizedActiveTasks;
  const criticalTaskItems = prioritizedActiveTasks.filter((item) => item.lane === "critical");
  const needsInputTaskItems = prioritizedActiveTasks.filter((item) => item.lane === "needs_input");
  const handoffTaskItems = prioritizedActiveTasks.filter((item) => item.lane === "handoff");
  const activeTaskItems = prioritizedActiveTasks.filter((item) => item.lane === "active");
  const queuedTaskItems = prioritizedActiveTasks.filter((item) => item.lane === "queued");
  const orderedTaskSections: Array<{
    key: Exclude<TaskLane, "done">;
    items: typeof prioritizedActiveTasks;
  }> = [
    { key: "critical", items: criticalTaskItems },
    { key: "needs_input", items: needsInputTaskItems },
    { key: "handoff", items: handoffTaskItems },
    { key: "active", items: activeTaskItems },
    { key: "queued", items: queuedTaskItems },
  ];

  const handleRecoverCommunication = async () => {
    if (!activeCompany) {
      return;
    }

    setRecoveringCommunication(true);
    try {
      const discoveredRequests = (
        await Promise.all(
          companySessions.map(async (session) => {
            const history = await gateway.getChatHistory(session.key, 20);
            const relatedTask = (activeCompany.tasks ?? []).find((task) => task.sessionKey === session.key);
            const relatedHandoffs = rawHandoffRecords.filter(
              (handoff) => handoff.sessionKey === session.key,
            );

            return buildRequestRecords({
              sessionKey: session.key,
              messages: history.messages ?? [],
              handoffs: relatedHandoffs,
              relatedTask,
            });
          }),
        )
      ).flat();

      const { companyPatch, summary } = reconcileCompanyCommunication(
        activeCompany,
        discoveredRequests,
        Date.now(),
      );
      await updateCompany(companyPatch);
      toast.success(
        "请求闭环已同步",
        `新增 ${summary.requestsAdded}，更新 ${summary.requestsUpdated}，恢复任务 ${summary.tasksRecovered}，恢复交接 ${summary.handoffsRecovered}。`,
      );
    } catch (error) {
      toast.error("恢复失败", error instanceof Error ? error.message : String(error));
    } finally {
      setRecoveringCommunication(false);
    }
  };

  const renderTaskCard = (
    task: TrackedTask,
    options?: {
      isArchived?: boolean;
      orderLabel?: string;
    },
  ) => {
    const isArchived = options?.isArchived ?? false;
    const stepSummary = summarizeTaskSteps(task.steps);
    const { completedSteps, doneCount, total } = stepSummary;
    const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
    const isStrategicSyntheticTask = Boolean(
      isStrategicRequirement &&
        requirementSyntheticTask &&
        task.id === requirementSyntheticTask.id,
    );
    const execution = isStrategicSyntheticTask
      ? resolveExecutionState({
          fallbackState: task.state ?? (pct === 100 ? "completed" : "running"),
          taskSteps: task.steps,
        })
      : resolveExecutionState({
          fallbackState:
            task.state ??
            (pct === 100 ? "completed" : stepSummary.wipCount > 0 ? "running" : "idle"),
          evidenceTexts: [task.blockedReason, task.summary],
          taskSteps: task.steps,
        });
    const takeoverPack = isStrategicSyntheticTask
      ? null
      : sessionTakeoverPacks.get(task.sessionKey);
    const isComplete = execution.state === "completed";
    const ownerLabel = getEmpName(task.ownerAgentId || task.agentId);
    const relatedHandoffs = isStrategicSyntheticTask
      ? []
      : handoffRecords.filter(
          (handoff) => handoff.taskId === task.id || handoff.sessionKey === task.sessionKey,
        );
    const relatedRequests = isStrategicSyntheticTask
      ? []
      : displayRequests.filter(
          (request) =>
            request.taskId === task.id ||
            request.sessionKey === task.sessionKey ||
            request.handoffId === relatedHandoffs[0]?.id,
        );
    const relatedAlerts = isStrategicSyntheticTask
      ? []
      : slaAlerts.filter(
          (alert) => alert.taskId === task.id || alert.sessionKey === task.sessionKey,
        );
    const focusSummary =
      isStrategicSyntheticTask
        ? strategicRequirementOverview
          ? buildStrategicBoardFocusSummary(strategicRequirementOverview)
          : activeWorkItem
            ? buildStrategicWorkItemFocusSummary(activeWorkItem)
            : buildExecutionFocusSummary({
                company: activeCompany,
                targetAgentId: task.ownerAgentId ?? task.agentId,
                targetRoleLabel: "战略主线",
                execution,
                task,
                requests: [],
                handoffs: [],
                takeoverPack: null,
                alerts: [],
              })
        : buildExecutionFocusSummary({
            company: activeCompany,
            targetAgentId: task.ownerAgentId ?? task.agentId,
            targetRoleLabel: "任务",
            execution,
            task,
            requests: relatedRequests,
            handoffs: relatedHandoffs,
            takeoverPack: takeoverPack ?? null,
            alerts: relatedAlerts,
          });

    return (
      <Card
        key={task.id}
        className={`overflow-hidden transition-shadow hover:shadow-lg ${
          isArchived
            ? "border-slate-200 bg-slate-50 opacity-80"
            : isComplete
              ? "border-emerald-200 bg-emerald-50/30"
              : stepSummary.wipCount > 0
                ? "border-indigo-200 bg-white"
                : "border-slate-200 bg-white"
        }`}
      >
        <CardHeader className="pb-3 border-b">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              {options?.orderLabel ? (
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {options.orderLabel}
                </div>
              ) : null}
              <CardTitle
                className={`text-sm font-bold line-clamp-2 leading-relaxed ${isArchived ? "text-slate-600" : "text-slate-900"}`}
              >
                {task.title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] bg-slate-50 gap-1">
                  <Users className="w-3 h-3" />
                  负责人: {ownerLabel}
                </Badge>
                <ExecutionStateBadge compact status={execution} />
                {task.assigneeAgentIds && task.assigneeAgentIds.length > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-slate-50 gap-1">
                    协作 {task.assigneeAgentIds.length}
                  </Badge>
                )}
                {takeoverPack && (
                  <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-800">
                    需人工接管
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] bg-slate-50 gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(task.updatedAt)}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 ml-2">
              <Badge
                variant={isComplete ? "default" : "secondary"}
                className={
                  isComplete
                    ? isArchived
                      ? "bg-slate-400 text-white text-[10px]"
                      : "bg-emerald-600 text-white text-[10px]"
                    : "text-[10px]"
                }
              >
                {isComplete ? "✓ 已完成" : `${doneCount}/${total}`}
              </Badge>
              {!isArchived && <span className="text-[10px] text-slate-400 font-mono">{pct}%</span>}
            </div>
          </div>
          {!isArchived && (
            <>
              <div className="mt-3 text-[11px] font-medium leading-5 text-slate-700">
                {focusSummary.currentWork}
              </div>
              <div className="mt-1 text-[11px] leading-5 text-slate-500">
                下一步：{focusSummary.nextStep}
              </div>
              {focusSummary.blockReason ? (
                <div className="mt-1 text-[11px] leading-5 text-rose-700">
                  当前卡点：{focusSummary.blockReason}
                </div>
              ) : null}
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background:
                      pct === 100
                        ? "linear-gradient(90deg, #22c55e, #16a34a)"
                        : stepSummary.wipCount > 0
                          ? "linear-gradient(90deg, #22c55e, #6366f1)"
                          : "linear-gradient(90deg, #22c55e, #22d3ee)",
                  }}
                />
              </div>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          {!isArchived ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  当前在做
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-900">
                  {focusSummary.currentWork}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  接下来
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-700">
                  {focusSummary.nextStep}
                </div>
                {focusSummary.userAction ? (
                  <div className="mt-2 text-xs leading-5 text-rose-700">{focusSummary.userAction}</div>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  已完成
                </div>
                <div className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                  {completedSteps.length > 0 ? (
                    completedSteps
                      .slice(-3)
                      .map((step, index) => (
                        <div key={`${task.id}:done:${index}`} className="line-through text-slate-500">
                          • {step.text}
                        </div>
                      ))
                  ) : (
                    <div>还没有完成的子任务</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {takeoverPack && !isArchived && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
              <div className="font-semibold">接管建议</div>
              <div className="mt-1">{takeoverPack.recommendedNextAction}</div>
            </div>
          )}

          <details className="rounded-xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-slate-600 [&::-webkit-details-marker]:hidden">
              查看全部子任务（{total}）
            </summary>
            <ul className="divide-y divide-slate-100 border-t border-slate-200">
              {task.steps.map((step: TaskStep, i: number) => {
                const assignee = step.assignee?.replace(/^@/, "") || null;
                return (
                  <li
                    key={i}
                    className={`flex items-center gap-3 px-4 py-2.5 text-xs ${
                      step.status === "done"
                        ? "bg-emerald-50/30"
                        : step.status === "wip"
                          ? "bg-indigo-50/40"
                          : ""
                    }`}
                  >
                    <span className="shrink-0 text-sm">
                      {step.status === "done" ? "✅" : step.status === "wip" ? "🔄" : "⏳"}
                    </span>
                    <span
                      className={`flex-1 leading-relaxed break-words break-all sm:break-normal ${
                        step.status === "done"
                          ? "line-through text-slate-400"
                          : step.status === "wip"
                            ? "text-indigo-800 font-semibold"
                            : "text-slate-600"
                      }`}
                    >
                      {step.text}
                    </span>
                    {assignee && (
                      <Badge
                        variant="outline"
                        className={`text-[9px] shrink-0 px-1.5 ${
                          step.status === "done"
                            ? "bg-slate-50 text-slate-400 border-slate-200"
                            : step.status === "wip"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : "bg-slate-50 text-slate-500"
                        }`}
                      >
                        @{assignee}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>

          <div className="border-t pt-3 flex justify-end">
            {takeoverPack && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 text-amber-700 hover:bg-amber-50"
                onClick={() => navigate(`/chat/${encodeURIComponent(task.sessionKey)}`)}
              >
                查看接管包
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 text-indigo-500 hover:bg-indigo-50"
              onClick={() => {
                if (task.source === "file" && task.sourceAgentId) {
                  navigate(`/chat/${encodeURIComponent(task.sourceAgentId)}`);
                } else {
                  navigate(`/chat/${encodeURIComponent(task.sessionKey)}`);
                }
              }}
            >
              <MessageSquare className="w-3 h-3 mr-1" />
              直达会话
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 lg:p-8 h-full flex flex-col">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-8 h-8 text-indigo-600" />
            任务看板
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {requirementOverview
              ? isStrategicRequirement
                ? `当前默认只看「${requirementDisplayTitle}」这条战略主线，章节接管、超时和历史请求已自动隐藏。`
                : `当前默认只看「${requirementDisplayTitle}」这条主线，历史交接和旧请求已自动隐藏。`
              : "这里只看任务顺序、当前步骤和子任务进度。成员状态和异常监控请去运营大厅。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3 items-center">
          <Button variant="outline" onClick={() => navigate("/ops")}>
            <Play className="w-4 h-4 mr-2" />
            去运营大厅看监控
          </Button>
          {ceo ? (
            <Button variant="outline" onClick={() => navigate(`/chat/${ceo.agentId}`)}>
              <MessageSquare className="w-4 h-4 mr-2" />
              继续和 CEO 对话
            </Button>
          ) : null}
          <div className="flex gap-2 md:gap-4 items-center bg-slate-100 px-3 md:px-4 py-2 rounded-lg border">
            <div className="flex flex-col items-center">
              <span className="text-2xl font-black text-indigo-600">{trackedTasks.length}</span>
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
          {totalSteps > 0 && (
            <div className="flex flex-col items-center px-3">
              <span className="text-lg font-black text-indigo-700">{globalPct}%</span>
              <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all"
                  style={{ width: `${globalPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {requirementOverview ? (
        <Card className="shrink-0 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm">
          <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.4fr,1fr,auto] lg:items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-500">
                本次需求总览
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-950">
                {requirementDisplayTitle}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-700">
                {requirementDisplayCurrentStep}
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                {requirementDisplaySummary}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  当前负责人
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {requirementDisplayOwner}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  当前环节：{requirementDisplayStage}
                </div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  下一步
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-800">
                  {requirementDisplayNext}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {(activeMission?.ownerAgentId ?? requirementOverview.currentOwnerAgentId) ? (
                <Button
                  variant="default"
                  onClick={() =>
                    navigate(
                      `/chat/${encodeURIComponent(
                        activeMission?.ownerAgentId ?? requirementOverview.currentOwnerAgentId!,
                      )}`,
                    )
                  }
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  打开当前负责人
                </Button>
              ) : null}
              {ceo ? (
                <Button variant="outline" onClick={() => navigate(`/chat/${ceo.agentId}`)}>
                  回 CEO 会话
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {requirementOverview || requirementRoomRecords.length > 0 || requirementRoomRoute ? (
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
            {requirementRoomRecords.length > 0 ? (
              requirementRoomRecords.map((room, index) => (
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
                    <div className="mt-2 text-sm leading-6 text-slate-700">
                      {describeRequirementRoomPreview(room)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Button
                      variant="outline"
                      onClick={() => navigate(buildRequirementRoomHrefFromRecord(room))}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      打开房间
                    </Button>
                  </div>
                </div>
              ))
            ) : requirementRoomRoute ? (
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">当前需求还没有固定房间</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">
                    第一次打开后会固化成这条需求的固定群聊，后面从 CEO、看板或大厅点进去都会回到同一个房间。
                  </div>
                </div>
                <Button onClick={() => navigate(requirementRoomRoute)}>
                  <Users className="mr-2 h-4 w-4" />
                  创建并进入房间
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm leading-6 text-slate-600">
                当前需求参与成员不足，暂时不能创建需求团队房间。
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {taskSequence.length > 0 && (
        <Card className="shrink-0 border-slate-200 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {requirementOverview ? "本次需求的任务顺序" : "当前任务顺序"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {taskSequence.map((item, index) => (
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
                  <div className="mt-1 line-clamp-2">
                    {item.focusSummary.currentWork}
                  </div>
                  {item.focusSummary.blockReason ? (
                    <div className="mt-1 text-xs text-rose-700">
                      当前卡点：{item.focusSummary.blockReason}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-slate-500">
                      下一步：{item.focusSummary.nextStep}
                    </div>
                  )}
                </div>
                <div className="flex items-start justify-end">
                  <ExecutionStateBadge compact status={item.execution} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {visibleTakeoverCount > 0 && (
        <div className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-950">人工接管警报</div>
              <div className="mt-1 text-xs text-amber-800">
                当前检测到 {visibleTakeoverCount} 条会话需要人工接管，已生成接管包。
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-200 bg-white text-amber-900 hover:bg-amber-100"
              onClick={() => {
                const firstSessionKey = sessionTakeoverPacks.keys().next().value;
                if (typeof firstSessionKey === "string") {
                  navigate(`/chat/${encodeURIComponent(firstSessionKey)}`);
                }
              }}
            >
              查看接管包
            </Button>
          </div>
        </div>
      )}

      {visibleRequestHealth.active > 0 && (
        <div className="shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-sky-950">
                {requirementOverview ? "当前需求请求闭环" : "请求闭环队列"}
              </div>
              <div className="mt-1 text-xs text-sky-800">
                {requirementOverview
                  ? `当前主线还有 ${visibleRequestHealth.active} 条请求未闭环，其中阻塞 ${visibleRequestHealth.blocked} 条；历史请求已隐藏。`
                  : `当前有 ${visibleRequestHealth.active} 条请求尚未闭环，其中阻塞 ${visibleRequestHealth.blocked} 条。`}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-sky-200 bg-white text-sky-900 hover:bg-sky-100"
              disabled={recoveringCommunication}
              onClick={() => void handleRecoverCommunication()}
            >
              {recoveringCommunication ? "同步中..." : "恢复当前阻塞"}
            </Button>
          </div>
        </div>
      )}

      {visiblePendingHandoffs.length > 0 && (
        <div className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-violet-950">
                {requirementOverview ? "当前需求交接队列" : "交接队列"}
              </div>
              <div className="mt-1 text-xs text-violet-800">
                {requirementOverview
                  ? `当前主线有 ${visiblePendingHandoffs.length} 条待完成交接；过期交接已自动隐藏。`
                  : `当前有 ${visiblePendingHandoffs.length} 条待完成交接，缺失项会阻塞后续执行。`}
              </div>
            </div>
          </div>
          {requirementOverview ? (
            <div className="mt-3 rounded-lg border border-violet-200 bg-white/80 px-3 py-3 text-xs leading-6 text-slate-700">
              交接明细默认已收起，避免旧广播和重复交接卡片继续干扰。主线推进请优先看上面的“本次需求总览”和任务顺序。
            </div>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {visiblePendingHandoffs.slice(0, 4).map((handoff) => (
                <div
                  key={handoff.id}
                  className="rounded-lg border border-violet-200 bg-white/80 px-3 py-2 text-xs text-slate-700"
                >
                  <div className="font-medium text-slate-900">{handoff.title}</div>
                  <div className="mt-1">{handoff.summary}</div>
                  <div className="mt-1 text-[11px] text-violet-700">
                    to: {handoff.toAgentIds.join(", ")}
                  </div>
                  {handoff.missingItems && handoff.missingItems.length > 0 && (
                    <div className="mt-1 text-[11px] text-amber-700">
                      缺失项 {handoff.missingItems.length}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {visibleSlaAlerts.length > 0 && (
        <div className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-rose-950">
                {requirementOverview ? "当前需求超时提醒" : "SLA 升级队列"}
              </div>
              <div className="mt-1 text-xs text-rose-800">
                {requirementOverview
                  ? `当前主线有 ${visibleSlaAlerts.length} 条超时或阻塞提醒；历史超时项已隐藏。`
                  : `当前有 ${visibleSlaAlerts.length} 条任务或交接超过 SLA，建议优先处理这里。`}
              </div>
            </div>
          </div>
          {requirementOverview ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-white/80 px-3 py-3 text-xs leading-6 text-slate-700">
              具体超时条目默认已收起，避免历史噪音抢走注意力。先看“当前负责人 / 下一步”，确实需要排障时再去 CEO 会话或恢复当前阻塞。
            </div>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {visibleSlaAlerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border border-rose-200 bg-white/80 px-3 py-2 text-xs text-slate-700"
                >
                  <div className="font-medium text-slate-900">{alert.title}</div>
                  <div className="mt-1">{alert.summary}</div>
                  <div className="mt-1 text-[11px] text-rose-700">
                    {alert.ageMinutes} 分钟 · {alert.recommendedAction}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {trackedTasks.length > 0 ? (
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
                      {section.items.map((item, index) =>
                        renderTaskCard(item.task, {
                          orderLabel: `${meta.title} · ${String(index + 1).padStart(2, "0")}`,
                        }),
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      {meta.empty}
                    </div>
                  )}
                </section>
              );
            })}

            {activeTasks.length === 0 && archivedGroups.length > 0 && (
              <div className="flex flex-col items-center justify-center py-10 opacity-70">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
                <p className="text-slate-500 font-medium">
                  当前没有进行中的任务，所有工作均已完成。
                </p>
              </div>
            )}

            {/* Archived Tasks Separator / Accordion */}
            {archivedGroups.length > 0 && (
              <div className="border-t border-slate-200/60 pt-6">
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mx-auto px-4 py-2 rounded-full hover:bg-slate-100"
                >
                  <Archive className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {showArchived ? "收起已归档记录" : `展开已归档记录 (${archivedGroups.length})`}
                  </span>
                  {showArchived ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {showArchived && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-6 animate-in fade-in slide-in-from-top-4 duration-300">
                    {archivedGroups.map((t, index) =>
                      renderTaskCard(t, {
                        isArchived: true,
                        orderLabel: `已归档 · ${String(index + 1).padStart(2, "0")}`,
                      }),
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Empty state: no tracked tasks */
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <div className="bg-indigo-50 p-6 rounded-2xl mb-6">
              <ListChecks className="w-16 h-16 text-indigo-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">还没有任何任务追踪记录</h3>
            <p className="text-sm text-slate-500 max-w-md text-center leading-relaxed">
              给 CEO 或管理者下发复合指令后，他们将自动输出结构化任务清单。
              系统会自动解析并在此看板按批次与分组展示。
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="default"
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => {
                  const ceo = activeCompany.employees.find((e) => e.metaRole === "ceo");
                  if (ceo) {
                    navigate(`/chat/${ceo.agentId}`);
                  }
                }}
              >
                <MessageSquare className="w-4 h-4 mr-2" />给 CEO 下达任务
              </Button>
            </div>
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 max-w-lg">
              <p className="text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>提示：</strong>CEO 接收指令后会自动输出"当前任务总览"。
                  任务分派后，下属完成节点会自动回传最新版清单，看板实时同步进度并将已完成项归档。
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* === 辅助：可折叠的 Session 通道监控 === */}
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
        {showSessions && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 max-h-[40vh] overflow-y-auto pb-4">
            {/* Active Sessions */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 flex items-center gap-1">
                <Play className="w-3 h-3" /> 进行中 ({activeSessions.length})
              </h4>
              {activeSessions.length > 0 ? (
                activeSessions.map((sess: GatewaySessionRow & { agentId: string }) => (
                  <div
                    key={sess.key}
                    className="bg-white p-3 rounded-lg border shadow-sm text-xs flex items-center justify-between group hover:shadow-md transition-shadow"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-700 truncate">
                        {getEmpName(sess.agentId)}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <ExecutionStateBadge
                          compact
                          status={
                            sessionStates.get(sess.key) ??
                            resolveExecutionState({ session: sess, now: currentTime })
                          }
                        />
                        {sessionTakeoverPacks.has(sess.key) && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-200 bg-amber-50 text-amber-800"
                          >
                            接管
                          </Badge>
                        )}
                      </div>
                      {sessionMeta.get(sess.key)?.topic && (
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {sessionMeta.get(sess.key)!.topic}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-slate-400">
                        <Clock className="w-3 h-3 inline mr-0.5" />
                        {formatTime(resolveSessionUpdatedAt(sess) || undefined)}
                      </span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-1.5"
                          onClick={() => navigate(`/chat/${encodeURIComponent(sess.key)}`)}
                        >
                          <MessageSquare className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-1.5 text-amber-600"
                          onClick={() => handleNudge(sess.key)}
                        >
                          催
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-1.5 text-red-500"
                          onClick={() => handleDelete(sess.key)}
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
            {/* Archived Sessions */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> 归档 ({archivedSessions.length})
              </h4>
              {archivedSessions.length > 0 ? (
                archivedSessions
                  .slice(0, 10)
                  .map((sess: GatewaySessionRow & { agentId: string }) => (
                    <div
                      key={sess.key}
                      className="bg-white p-3 rounded-lg border shadow-sm text-xs flex items-center justify-between opacity-70 hover:opacity-100 transition-opacity"
                    >
                      <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-600 truncate">
                        {getEmpName(sess.agentId)}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <ExecutionStateBadge
                          compact
                          status={
                            sessionStates.get(sess.key) ??
                            resolveExecutionState({ session: sess, now: currentTime })
                          }
                        />
                        {sessionTakeoverPacks.has(sess.key) && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-200 bg-amber-50 text-amber-800"
                          >
                            接管
                          </Badge>
                        )}
                      </div>
                      {sessionMeta.get(sess.key)?.topic && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            📋 {sessionMeta.get(sess.key)!.topic}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                        {formatTime(resolveSessionUpdatedAt(sess) || undefined)}
                      </span>
                    </div>
                  ))
              ) : (
                <div className="text-[11px] text-slate-400 py-4 text-center">暂无归档</div>
              )}
            </div>
          </div>
        )}
      </div>

      {dialogConfig.type === "nudge" && (
        <ActionFormDialog
          open={dialogConfig.open}
          onOpenChange={(op) => setDialogConfig((prev) => ({ ...prev, open: op }))}
          title="下发催促指令"
          description="指令将强行插入该节点的工作流中，并中断当前长思考。"
          confirmLabel="传达指令"
          busy={dialogSubmitting}
          fields={[
            { name: "nudgeText", label: "补充说明", defaultValue: "请报告当前进度并加快处理" },
          ]}
          onSubmit={onDialogSubmit}
        />
      )}

      {dialogConfig.type === "compact" && (
        <ActionFormDialog
          open={dialogConfig.open}
          onOpenChange={(op) => setDialogConfig((prev) => ({ ...prev, open: op }))}
          title="压缩历史上下文"
          description="系统会将早期的流转对话压缩概括以腾空心智容量，保留近期交互。压缩不可撤回。"
          confirmLabel="确认压缩"
          busy={dialogSubmitting}
          fields={[]}
          onSubmit={onDialogSubmit}
        />
      )}

      {dialogConfig.type === "delete" && (
        <ActionFormDialog
          open={dialogConfig.open}
          onOpenChange={(op) => setDialogConfig((prev) => ({ ...prev, open: op }))}
          title="彻底销毁事项"
          description="确定要彻底剥离并不可逆地销毁这条流转记录吗？在编历史将彻底丢失。"
          confirmLabel="永久销毁"
          busy={dialogSubmitting}
          fields={[]}
          onSubmit={onDialogSubmit}
        />
      )}
    </div>
  );
}
