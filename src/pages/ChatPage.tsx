import * as Dialog from "@radix-ui/react-dialog";
import { Send, UploadCloud, Trash2, Sparkles, RefreshCcw, Paperclip, ChevronDown, Users, X, History } from "lucide-react";
import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { HrDepartmentPlanCard } from "../components/chat/HrDepartmentPlanCard";
import { ExecutionStateBadge } from "../components/execution-state-badge";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  buildCeoControlSurface,
} from "../features/ceo/control-surface";
import { useCompanyStore } from "../features/company/store";
import type {
  ArtifactRecord,
  Company,
  ConversationMissionStepRecord,
  DispatchRecord,
  RequirementRoomRecord,
  RoundMessageSnapshot,
  RoundRecord,
  WorkItemRecord,
  TaskStep,
  TaskStepStatus,
  TrackedTask,
} from "../features/company/types";
import {
  buildConversationMissionRecord,
  pickConversationMissionRecord,
} from "../features/execution/conversation-mission";
import {
  buildRoundRecord,
  buildRoomRecordIdFromWorkItem,
  pickWorkItemRecord,
} from "../features/execution/work-item";
import { reconcileWorkItemRecord } from "../features/execution/work-item-reconciler";
import {
  buildExecutionFocusSummary,
  formatAgentLabel,
  formatAgentRole,
} from "../features/execution/focus-summary";
import {
  buildRequirementExecutionOverview,
  createRequirementMessageSnapshots,
  REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT,
  type RequirementArtifactCheck,
  type RequirementExecutionOverview,
  type RequirementParticipantProgress,
  type RequirementSessionSnapshot,
} from "../features/execution/requirement-overview";
import {
  areRequirementRoomChatMessagesEqual,
  buildRoomConversationBindingsFromSessions,
  buildRequirementRoomRecord,
  buildRequirementRoomRoute,
  buildRequirementRoomSessions,
  convertRequirementRoomRecordToChatMessages,
  createIncomingRequirementRoomMessage,
  createOutgoingRequirementRoomMessage,
  mergeRequirementRoomRecordFromSessions,
  searchRequirementRoomMentionCandidates,
  type RequirementRoomMentionCandidate,
  resolveRequirementRoomMentionTargets,
} from "../features/execution/requirement-room";
import { buildRequirementTeamView } from "../features/execution/requirement-team";
import {
  isParticipantCompletedStatus,
  isParticipantRunningStatus,
  isParticipantWaitingStatus,
  isStrategicRequirementTopic,
} from "../features/execution/requirement-kind";
import {
  isSyntheticWorkflowPromptText,
  normalizeTruthText,
  stripTruthControlMetadata,
  stripTruthTaskTracker,
} from "../features/execution/message-truth";
import { resolveExecutionState } from "../features/execution/state";
import { buildManualTakeoverPack } from "../features/execution/takeover-pack";
import { buildHandoffRecords } from "../features/handoffs/handoff-object";
import {
  buildOrgAdvisorSnapshot,
} from "../features/org/org-advisor";
import { buildRequestRecords } from "../features/requests/request-object";
import { reconcileCompanyCommunication } from "../features/requests/reconcile";
import { summarizeRequestHealth } from "../features/requests/request-health";
import { inferMissionTopicKey, inferRequestTopicKey } from "../features/requests/topic";
import { evaluateSlaAlerts } from "../features/sla/escalation-rules";
import { buildTaskObjectSnapshot } from "../features/tasks/task-object";
import {
  gateway,
  resolveCompanyActorConversation,
  sendTurnToCompanyActor,
  type ChatEventPayload,
  type ChatMessage,
  type GatewaySessionArchiveRow,
  type GatewaySessionRow,
} from "../features/backend";
import { useGatewayStore } from "../features/gateway/store";
import { toast } from "../features/ui/toast-store";
import { AgentOps } from "../lib/agent-ops";
import { parseHrDepartmentPlan } from "../lib/hr-dept-plan";
import { parseAgentIdFromSessionKey, resolveSessionTitle, resolveSessionUpdatedAt } from "../lib/sessions";
import { usePageVisibility } from "../lib/use-page-visibility";
import { cn, formatTime, getAvatarUrl } from "../lib/utils";

type ChatBlock = {
  type?: string;
  text?: string;
  name?: string;
  tool_use_id?: string;
  thinking?: string;
  source?: unknown;
};

function createChatMentionRegex() {
  return /@([\p{L}\p{N}_-]+)/gu;
}

function createComposerMentionBoundaryRegex() {
  return /(?:^|[\s,，。！？!?:：;；、()（）[\]{}"'“”‘’<>《》\-])@([\p{L}\p{N}_-]*)$/u;
}

const CHAT_HISTORY_FETCH_LIMIT = 80;
const CHAT_UI_MESSAGE_LIMIT = 120;

function workItemToConversationMission(
  workItem: WorkItemRecord,
): {
  title: string;
  statusLabel: string;
  progressLabel: string;
  ownerLabel: string;
  currentStepLabel: string;
  nextLabel: string;
  summary: string;
  guidance: string;
  planSteps: ConversationMissionStepRecord[];
} {
  const completedCount = workItem.steps.filter((step) => step.status === "done").length;
  return {
    title: workItem.title,
    statusLabel:
      workItem.status === "waiting_review"
        ? "待你确认"
        : workItem.status === "waiting_owner"
          ? "待负责人收口"
          : workItem.status === "completed"
            ? "已完成"
            : workItem.status === "blocked"
              ? "阻塞"
              : "进行中",
    progressLabel:
      workItem.steps.length > 0 ? `${completedCount}/${workItem.steps.length}` : "进行中",
    ownerLabel: workItem.ownerLabel,
    currentStepLabel: workItem.stageLabel,
    nextLabel: workItem.batonLabel,
    summary: workItem.summary,
    guidance: workItem.nextAction,
    planSteps: workItem.steps.map((step) => ({
      id: step.id,
      title: step.title,
      assigneeLabel: step.assigneeLabel,
      assigneeAgentId: step.assigneeActorId ?? null,
      status: step.status === "done" ? "done" : step.status === "active" ? "wip" : "pending",
      statusLabel:
        step.status === "done" ? "已完成" : step.status === "active" ? "进行中" : "待处理",
      detail: step.detail ?? step.completionCriteria ?? null,
      isCurrent: step.status === "active",
      isNext: step.status === "pending",
    })),
  };
}

function limitChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-CHAT_UI_MESSAGE_LIMIT);
}

function normalizeMessage(raw: ChatMessage): ChatMessage {
  return {
    ...raw,
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
  };
}

function hasRichMarkdownSyntax(text: string): boolean {
  return (
    /```/.test(text) ||
    /`[^`\n]+`/.test(text) ||
    /^\s{0,3}#{1,6}\s/m.test(text) ||
    /^\s*(?:[-*+]|\d+\.)\s/m.test(text) ||
    /^\s*>/m.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text) ||
    /^\s*\|.+\|\s*$/m.test(text)
  );
}

function extractTextFromMessage(message: ChatMessage | undefined): string | null {
  if (!message) {
    return null;
  }

  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text;
  }

  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return null;
  }

  const textBlocks = message.content
    .map((block) => (typeof block === "object" && block ? (block as ChatBlock) : null))
    .filter((block): block is ChatBlock => {
      if (!block) {
        return false;
      }
      return block.type === "text" && typeof block.text === "string";
    })
    .map((block) => block.text?.trim() ?? "")
    .filter((text) => text.length > 0);

  return textBlocks.length > 0 ? textBlocks.join("\n") : null;
}

type TaskItem = {
  status: "done" | "wip" | "pending";
  text: string;
};

type HistoryRoundItem = {
  id: string;
  title: string;
  preview?: string | null;
  archivedAt: number;
  restorable: boolean;
  source: "product" | "provider";
  providerArchiveId?: string | null;
  fileName?: string;
  reason?: string;
  round?: RoundRecord | null;
};

function uniqueTaskList(tasks: TrackedTask[]): TrackedTask[] {
  const byId = new Map<string, TrackedTask>();
  tasks.forEach((task) => {
    byId.set(task.id, task);
  });
  return [...byId.values()];
}

function uniqueHandoffList(
  handoffs: import("../features/company/types").HandoffRecord[],
): import("../features/company/types").HandoffRecord[] {
  const byId = new Map<string, import("../features/company/types").HandoffRecord>();
  handoffs.forEach((handoff) => {
    byId.set(handoff.id, handoff);
  });
  return [...byId.values()];
}

function resolveArchiveHistoryNotice(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/unknown method:\s*sessions\.archives\.(list|get|delete|restore)/i.test(message)) {
    return "当前 Gateway 版本还不支持归档轮次。升级 Gateway 后，/new 之前的旧轮次会出现在这里。";
  }
  if (message.trim().length > 0) {
    return `归档轮次暂时不可用：${message}`;
  }
  return "归档轮次暂时不可用。";
}

function compactRoundText(text: string, limit: number = 320): string {
  const normalized = normalizeTruthText(stripTruthControlMetadata(text)).replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  const head = normalized.slice(0, Math.floor(limit * 0.7)).trimEnd();
  const tail = normalized.slice(-Math.floor(limit * 0.2)).trimStart();
  return `${head} … ${tail}`;
}

function createRoundMessageSnapshots(messages: ChatMessage[], limit: number = 24): RoundMessageSnapshot[] {
  return messages
    .filter((message) => !isToolActivityMessage(message) && !isToolResultMessage(message))
    .map((message) => {
      const text = extractTextFromMessage(message);
      if (!text) {
        return null;
      }
      return {
        role: message.role,
        text: compactRoundText(text, 480),
        timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
      } satisfies RoundMessageSnapshot;
    })
    .filter((message): message is RoundMessageSnapshot => Boolean(message))
    .slice(-limit);
}

function buildRoundPreview(messages: RoundMessageSnapshot[]): string | null {
  const latest = [...messages].reverse().find((message) => message.text.trim().length > 0);
  return latest ? compactRoundText(latest.text, 140) : null;
}

function roundSnapshotToChatMessage(message: RoundMessageSnapshot): ChatMessage {
  return {
    role: message.role,
    text: message.text,
    content: message.text,
    timestamp: message.timestamp,
  };
}

function buildProductRoundRestorePrompt(round: RoundRecord, actorLabel: string): string {
  const transcript = round.messages
    .slice(-8)
    .map((message) => {
      const speaker =
        message.role === "user"
          ? "用户"
          : message.role === "assistant"
            ? actorLabel
            : "系统";
      return `- ${speaker}: ${message.text}`;
    })
    .join("\n");

  return [
    `请恢复上一轮已归档会话的上下文，并从这里继续推进。`,
    round.title ? `轮次标题：${round.title}` : null,
    round.preview ? `上一轮摘要：${round.preview}` : null,
    transcript ? `最近对话摘录：\n${transcript}` : null,
    `请先简短确认你已经接住这轮上下文，然后继续当前工作。`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildHistoryRoundItems(input: {
  productRounds: RoundRecord[];
  providerRounds: GatewaySessionArchiveRow[];
}): HistoryRoundItem[] {
  const productItems = input.productRounds.map((round) => ({
    id: round.id,
    title: round.title,
    preview: round.preview ?? null,
    archivedAt: round.archivedAt,
    restorable: round.restorable,
    source: "product" as const,
    providerArchiveId: round.providerArchiveId ?? null,
    reason: round.reason ?? undefined,
    round,
  }));

  const coveredProviderIds = new Set(
    productItems.map((item) => item.providerArchiveId).filter((value): value is string => Boolean(value)),
  );
  const providerItems = input.providerRounds
    .filter((archive) => !coveredProviderIds.has(archive.id))
    .map((archive) => ({
      id: archive.id,
      title: archive.title || archive.fileName,
      preview: archive.preview ?? null,
      archivedAt: archive.archivedAt,
      restorable: true,
      source: "provider" as const,
      providerArchiveId: archive.id,
      fileName: archive.fileName,
      reason: archive.reason,
      round: null,
    }));

  return [...productItems, ...providerItems].sort((left, right) => right.archivedAt - left.archivedAt);
}

function matchesProductRoundToActor(round: RoundRecord, actorId: string | null | undefined): boolean {
  if (!actorId) {
    return false;
  }
  if (round.sourceActorId === actorId) {
    return true;
  }
  return parseAgentIdFromSessionKey(round.sourceSessionKey ?? "") === actorId;
}

function extractTaskTracker(text: string): TaskItem[] | null {
  // Look for a task tracker section in the text
  const sectionMatch = text.match(/##\s*📋\s*任务追踪[\s\S]*?(?=\n##\s|$)/i);
  if (!sectionMatch) {
    return null;
  }

  const section = sectionMatch[0];
  const items: TaskItem[] = [];
  const lineRegex = /^\s*-\s*\[([ x/])\]\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(section)) !== null) {
    const marker = match[1];
    const text = match[2].trim();
    let status: TaskItem["status"] = "pending";
    if (marker === "x") {
      status = "done";
    } else if (marker === "/") {
      status = "wip";
    }
    items.push({ status, text });
  }

  return items.length > 0 ? items : null;
}

function resolveTaskTitle(text: string, fallback: string): string {
  const beforeTracker = text.split(/##\s*📋\s*任务追踪/i)[0]?.trim();
  if (beforeTracker) {
    const firstLine = beforeTracker
      .split("\n")
      .find((l) => l.trim().length > 0)
      ?.trim();
    if (firstLine && firstLine.length > 2 && firstLine.length < 80) {
      return firstLine
        .replace(/^#+\s*/, "")
        .replace(/[*_`]/g, "")
        .trim();
    }
  }
  return fallback.length > 30 ? fallback.slice(0, 30) + "..." : fallback;
}

function TaskTrackerPanel({ items }: { items: TaskItem[] }) {
  const done = items.filter((i) => i.status === "done").length;
  const wip = items.filter((i) => i.status === "wip").length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="my-3 rounded-xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/80 to-white shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-indigo-100/60 flex items-center justify-between">
        <span className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
          📋 任务追踪
        </span>
        <span className="text-xs text-indigo-600 font-mono bg-indigo-100/60 px-2 py-0.5 rounded-full">
          {done}/{total} 完成 ({pct}%)
        </span>
      </div>
      <div className="px-4 pt-1 pb-1">
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background:
                pct === 100
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : wip > 0
                    ? "linear-gradient(90deg, #22c55e, #6366f1)"
                    : "linear-gradient(90deg, #22c55e, #22d3ee)",
            }}
          />
        </div>
      </div>
      <ul className="px-4 py-2 space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className={`flex items-start gap-2 text-sm leading-relaxed ${
              item.status === "done"
                ? "text-emerald-700"
                : item.status === "wip"
                  ? "text-indigo-700"
                  : "text-slate-500"
            }`}
          >
            <span className="shrink-0 mt-0.5 text-base">
              {item.status === "done" ? "✅" : item.status === "wip" ? "🔄" : "⏳"}
            </span>
            <span className={item.status === "done" ? "line-through opacity-70" : ""}>
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskTrackerHint() {
  return null;
}

function formatRequirementGroupSummary(
  participants: RequirementParticipantProgress[],
  emptyText: string,
): string {
  if (participants.length === 0) {
    return emptyText;
  }

  return participants
    .slice(0, 3)
    .map((participant) => `${participant.nickname} · ${participant.stage}`)
    .join("；");
}

function formatWatchElapsed(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return remainSeconds > 0 ? `${minutes} 分 ${remainSeconds} 秒` : `${minutes} 分钟`;
}

type FocusActionButton = {
  id: string;
  label: string;
  description: string;
  kind: "message" | "navigate" | "recover" | "copy";
  tone: "primary" | "secondary" | "ghost";
  targetAgentId?: string;
  followupTargetAgentId?: string;
  followupTargetLabel?: string;
  preferResolvedSession?: boolean;
  href?: string;
  message?: string;
};

type FocusProgressTone = "slate" | "emerald" | "amber" | "rose" | "indigo";

type FocusProgressEvent = {
  id: string;
  timestamp: number;
  actorLabel: string;
  title: string;
  summary: string;
  detail?: string;
  tone: FocusProgressTone;
  source: "session" | "local";
  category: "receipt" | "status";
  actorAgentId?: string;
};

type CollaborationLifecycleEntry = {
  id: string;
  timestamp: number;
  title: string;
  summary: string;
  detail?: string;
  actorLabel: string;
  actorAgentId?: string;
  tone: FocusProgressTone;
  kind: "action" | "feedback" | "state";
  isCurrent?: boolean;
};

type StageGateSnapshot = {
  sourceTimestamp: number;
  status: "needs_plan" | "waiting_confirmation" | "confirmed";
  statusLabel: string;
  title: string;
  stageConclusion: string;
  stageSummary: string;
  risks: string | null;
  nextStagePlan: string[];
  waitForConfirmation: boolean;
  confirmMessage: string;
  launchMessage: string;
};

type FocusActionWatch = {
  id: string;
  sessionKey: string;
  actionLabel: string;
  targetLabel: string;
  targetAgentId?: string;
  kind: "owner" | "handoff";
  startedAt: number;
  lastSeenTimestamp: number;
  hasReminder?: boolean;
};

type ChatAttachment = { mimeType: string; dataUrl: string };

const ChatSummaryPanelBody = lazy(() => import("../components/chat/chat-summary-panel-body.runtime"));
const ChatMarkdownContent = lazy(() => import("../components/chat/chat-markdown-content.runtime"));

type ChatComposerProps = {
  sessionIdentityKey: string;
  placeholder: string;
  sending: boolean;
  uploadingFile: boolean;
  attachments: ChatAttachment[];
  broadcastMode?: boolean;
  mentionCandidates?: RequirementRoomMentionCandidate[];
  prefill?: { id: number; text: string } | null;
  showBroadcastToggle?: boolean;
  onBroadcastModeChange?: (value: boolean) => void;
  onRemoveAttachment: (index: number) => void;
  onPickFile: () => void;
  onPasteImage: (file: File) => void;
  onSend: (draft: string) => Promise<boolean>;
};

const ChatComposer = memo(function ChatComposer({
  sessionIdentityKey,
  placeholder,
  sending,
  uploadingFile,
  attachments,
  broadcastMode = false,
  mentionCandidates = [],
  prefill,
  showBroadcastToggle = false,
  onBroadcastModeChange,
  onRemoveAttachment,
  onPickFile,
  onPasteImage,
  onSend,
}: ChatComposerProps) {
  const [draft, setDraft] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionSelectionIndex, setMentionSelectionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = (target: HTMLTextAreaElement) => {
    target.style.height = "auto";
    target.style.height = Math.min(target.scrollHeight, 200) + "px";
  };

  const resetDraft = () => {
    setDraft("");
    setMentionQuery(null);
    setMentionStart(null);
    setMentionSelectionIndex(0);
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  };

  const filteredMentionCandidates = useMemo(() => {
    if (mentionQuery === null || mentionCandidates.length === 0) {
      return [];
    }

    const normalizedQuery = (mentionQuery ?? "").trim().toLowerCase();
    return mentionCandidates
      .filter((candidate) => {
        if (!normalizedQuery) {
          return true;
        }
        return [candidate.label, candidate.role, candidate.agentId].some((value) =>
          value.trim().toLowerCase().includes(normalizedQuery),
        );
      })
      .slice(0, 6);
  }, [mentionCandidates, mentionQuery]);

  const shortcutMentionCandidates = useMemo(
    () => mentionCandidates.slice(0, 4),
    [mentionCandidates],
  );

  const closeMentionPicker = () => {
    setMentionQuery(null);
    setMentionStart(null);
    setMentionSelectionIndex(0);
  };

  const updateMentionState = (value: string, cursor: number | null) => {
    if (!mentionCandidates.length) {
      closeMentionPicker();
      return;
    }

    const caret = typeof cursor === "number" ? cursor : value.length;
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(createComposerMentionBoundaryRegex());
    if (!match || match.index == null) {
      closeMentionPicker();
      return;
    }

    const query = match[1] ?? "";
    const startIndex = match.index + match[0].lastIndexOf("@");
    setMentionQuery(query);
    setMentionStart(startIndex);
    setMentionSelectionIndex(0);
  };

  const commitMentionCandidate = (candidate: RequirementRoomMentionCandidate) => {
    if (!textareaRef.current) {
      return;
    }

    const target = textareaRef.current;
    const cursorEnd = target.selectionEnd ?? draft.length;
    const start = mentionStart ?? Math.max(0, cursorEnd - (mentionQuery?.length ?? 0) - 1);
    const inserted = `@${candidate.label} `;
    const nextDraft = `${draft.slice(0, start)}${inserted}${draft.slice(cursorEnd)}`;
    setDraft(nextDraft);
    closeMentionPicker();
    requestAnimationFrame(() => {
      if (!textareaRef.current) {
        return;
      }
      const nextCursor = start + inserted.length;
      textareaRef.current.focus();
      textareaRef.current.selectionStart = nextCursor;
      textareaRef.current.selectionEnd = nextCursor;
      resizeTextarea(textareaRef.current);
    });
  };

  useEffect(() => {
    resetDraft();
  }, [sessionIdentityKey]);

  useEffect(() => {
    if (!prefill?.text) {
      return;
    }
    setDraft((previous) => {
      const next = previous.trim() ? `${previous}\n\n${prefill.text}` : prefill.text;
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          resizeTextarea(textareaRef.current);
        }
      });
      return next;
    });
  }, [prefill?.id]);

  const handleSubmit = async () => {
    const ok = await onSend(draft);
    if (ok) {
      resetDraft();
    }
  };

  return (
    <>
      {attachments.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 py-2 mb-2 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50">
          {attachments.map((att, idx) => (
            <div
              key={`${att.mimeType}:${idx}`}
              className="group relative h-16 w-16 overflow-hidden rounded-md border border-slate-200 shadow-sm"
            >
              <img src={att.dataUrl} alt="preview" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemoveAttachment(idx)}
                className="absolute top-0.5 right-0.5 rounded-full bg-black/50 p-0.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                title="Remove attachment"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {shortcutMentionCandidates.length > 0 && mentionQuery === null ? (
        <div className="mx-auto mb-2 flex max-w-4xl flex-wrap items-center gap-2 px-1">
          <span className="text-[11px] text-slate-500">快速 @ 团队成员</span>
          {shortcutMentionCandidates.map((candidate) => (
            <button
              key={`shortcut:${candidate.agentId}`}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
              onMouseDown={(event) => {
                event.preventDefault();
                commitMentionCandidate(candidate);
              }}
            >
              <span>@{candidate.label}</span>
              <span className="text-[10px] text-indigo-500">{candidate.role}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-w-4xl mx-auto relative flex items-end gap-2 rounded-xl border bg-slate-50 p-1 shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-indigo-500">
        {showBroadcastToggle ? (
          <Button
            type="button"
            size="sm"
            variant={broadcastMode ? "default" : "ghost"}
            className={cn(
              "mb-1.5 ml-1 h-8 shrink-0 rounded-lg px-2 text-xs",
              broadcastMode
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
            )}
            onClick={() => onBroadcastModeChange?.(!broadcastMode)}
            title={broadcastMode ? "当前会群发给所有成员" : "默认只发给当前 baton / 负责人"}
          >
            {broadcastMode ? "群发中" : "单派"}
          </Button>
        ) : null}
        <textarea
          ref={textareaRef}
          className="w-full resize-none border-0 bg-transparent p-3 text-sm focus:ring-0 focus:outline-none max-h-48 min-h-[44px]"
          placeholder={placeholder}
          rows={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            resizeTextarea(e.target);
            updateMentionState(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (filteredMentionCandidates.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionSelectionIndex((previous) =>
                  previous >= filteredMentionCandidates.length - 1 ? 0 : previous + 1,
                );
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionSelectionIndex((previous) =>
                  previous <= 0 ? filteredMentionCandidates.length - 1 : previous - 1,
                );
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                const nextCandidate =
                  filteredMentionCandidates[
                    Math.min(mentionSelectionIndex, filteredMentionCandidates.length - 1)
                  ];
                if (nextCandidate) {
                  commitMentionCandidate(nextCandidate);
                }
                return;
              }
              if (e.key === "Escape") {
                closeMentionPicker();
                return;
              }
            }
            if (e.key !== "Enter") {
              return;
            }
            if (e.nativeEvent.isComposing) {
              return;
            }
            if (e.metaKey || e.ctrlKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          onClick={(event) => updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart)}
          onKeyUp={(event) => updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart)}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) {
              return;
            }
            for (const item of items) {
              if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                  e.preventDefault();
                  onPasteImage(file);
                  return;
                }
              }
            }
          }}
        />
        <div className="mb-0.5 mr-1 flex shrink-0 gap-1.5 border-r border-slate-200 px-1 pb-1.5 pr-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100"
            disabled={uploadingFile}
            onClick={onPickFile}
            title="附送参考文件至工作区"
          >
            {uploadingFile ? (
              <RefreshCcw className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
        </div>
        <Button
          size="icon"
          className="mb-1.5 mr-1.5 h-9 w-9 shrink-0 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          disabled={sending || (!draft.trim() && attachments.length === 0)}
          onClick={() => void handleSubmit()}
          title="发送 (Cmd/Ctrl+Enter)"
        >
          <Send className="h-4 w-4" />
        </Button>
        {filteredMentionCandidates.length > 0 ? (
          <div className="absolute inset-x-3 bottom-[calc(100%+0.5rem)] z-20 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="mb-1 px-2 text-[11px] text-slate-500">选择要 @ 的成员</div>
            <div className="space-y-1">
              {filteredMentionCandidates.map((candidate, index) => (
                <button
                  key={candidate.agentId}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors",
                    index === mentionSelectionIndex ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commitMentionCandidate(candidate);
                  }}
                >
                  <div>
                    <div className="text-sm font-medium">{candidate.label}</div>
                    <div className="text-[11px] text-slate-500">{candidate.role}</div>
                  </div>
                  <div className="text-[11px] text-slate-400">@{candidate.agentId}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
});

type SenderIdentity = {
  name: string;
  avatarSeed: string | undefined;
  isOutgoing: boolean;
  isRelayed: boolean;
  badgeLabel?: string;
  badgeTone?: "slate" | "indigo" | "amber";
  metaLabel?: string;
};

type ChatDisplayItem =
  | {
      kind: "message";
      id: string;
      message: ChatMessage;
    }
  | {
      kind: "tool";
      id: string;
      title: string;
      detail: string;
      tone: "slate" | "sky";
      count: number;
    };

function parseChatEventPayload(payload: unknown): ChatEventPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Partial<ChatEventPayload>;
  if (typeof candidate.sessionKey !== "string" || typeof candidate.state !== "string") {
    return null;
  }

  if (
    candidate.state !== "delta" &&
    candidate.state !== "final" &&
    candidate.state !== "aborted" &&
    candidate.state !== "error"
  ) {
    return null;
  }

  return {
    runId: typeof candidate.runId === "string" ? candidate.runId : "",
    sessionKey: candidate.sessionKey,
    state: candidate.state,
    seq: typeof candidate.seq === "number" ? candidate.seq : 0,
    message: candidate.message,
    errorMessage: typeof candidate.errorMessage === "string" ? candidate.errorMessage : undefined,
  };
}

function extractNameFromMessage(text: string): string | null {
  const clean = text.trim();
  // 1. 匹配标准前缀形式: "agent:", "**agent**:", "[agent]:", "agent 说："等
  let match = clean.match(/^(?:\*\*|\[)?([^:*\]]+)(?:\*\*|\])?[:：]\s*/);
  if (match) {
    const name = match[1].replace(/说$/, "").trim();
    if (name) {
      return name;
    }
  }

  // 2. 匹配中文【】标题形式: "【HR 优化 - 执行确认】" 取 "HR" 或 "HR 优化"
  match = clean.match(/^【([^\]]+)】/);
  if (match) {
    // 往往前排就是名字或者名字+动作，直接取连字号前的部分
    const titlePart = match[1].split(/[ -_]/)[0].trim();
    if (titlePart) {
      return titlePart;
    }
  }

  return null;
}

function normalizeAssigneeToken(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

function resolveAgentIdFromToken(
  employees: Array<{ agentId: string; nickname: string; role: string }>,
  token: string | undefined,
): string | null {
  const normalized = normalizeAssigneeToken(token ?? "");
  if (!normalized) {
    return null;
  }

  const exact = employees.find((employee) => {
    const nickname = employee.nickname.trim().toLowerCase();
    const role = employee.role.trim().toLowerCase();
    const agentId = employee.agentId.trim().toLowerCase();
    return agentId === normalized || nickname === normalized || role === normalized;
  });
  if (exact) {
    return exact.agentId;
  }

  const fuzzy = employees.find((employee) => {
    const nickname = employee.nickname.trim().toLowerCase();
    const role = employee.role.trim().toLowerCase();
    return nickname.includes(normalized) || normalized.includes(nickname) || role.includes(normalized);
  });
  return fuzzy?.agentId ?? null;
}

function resolveStepAssigneeAgentId(
  step: TaskStep | undefined,
  employees: Array<{ agentId: string; nickname: string; role: string }>,
): string | null {
  if (!step) {
    return null;
  }

  const direct = resolveAgentIdFromToken(employees, step.assignee);
  if (direct) {
    return direct;
  }

  const mentions = step.text.match(createChatMentionRegex()) ?? [];
  for (const mention of mentions) {
    const resolved = resolveAgentIdFromToken(employees, mention);
    if (resolved) {
      return resolved;
    }
  }

  for (const employee of employees) {
    const tokens = [employee.nickname, employee.role, employee.agentId].filter(Boolean);
    if (
      employee.agentId.startsWith("co-") &&
      /CEO|HR|CTO|COO/i.test(step.text)
    ) {
      if (
        (employee.agentId === "co-ceo" && /CEO/i.test(step.text)) ||
        (employee.agentId === "co-hr" && /HR/i.test(step.text)) ||
        (employee.agentId === "co-cto" && /CTO/i.test(step.text)) ||
        (employee.agentId === "co-coo" && /COO/i.test(step.text))
      ) {
        return employee.agentId;
      }
    }

    if (tokens.some((token) => step.text.includes(token))) {
      return employee.agentId;
    }
  }

  return null;
}

function summarizeStepLabel(step: TaskStep | undefined): string | null {
  if (!step) {
    return null;
  }

  const cleaned = step.text
    .replace(/^\s*[-*]?\s*\[[ x/]\]\s*/i, "")
    .replace(/[\u2192→].*$/, "")
    .replace(createChatMentionRegex(), "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function dedupeFocusActions(actions: FocusActionButton[]): FocusActionButton[] {
  const byId = new Map<string, FocusActionButton>();
  actions.forEach((action) => {
    byId.set(action.id, action);
  });
  return [...byId.values()];
}

function isParticipantStepDone(statusLabel: string): boolean {
  return ["已确认", "已冻结待命", "已回复", "已交接", "已交付待下游"].includes(statusLabel);
}

function isParticipantStepInProgress(statusLabel: string): boolean {
  return ["已开工", "已开工未交付", "已阻塞", "待回复", "未回复", "待接手", "部分完成"].includes(statusLabel);
}

function participantMatchesRole(
  participant: RequirementParticipantProgress | null | undefined,
  pattern: RegExp,
): boolean {
  if (!participant) {
    return false;
  }
  return pattern.test(`${participant.nickname} ${participant.role} ${participant.stage}`);
}

function isCoordinatorWaitingStatus(statusLabel: string): boolean {
  return ["已冻结待命", "待接手", "待回复", "已接单", "已接单未推进"].includes(statusLabel);
}

type StrategicDirectParticipantView = {
  participant: RequirementParticipantProgress;
  headline: string;
  ownerAgentId: string;
  ownerLabel: string;
  stage: string;
  statusLabel: string;
  summary: string;
  actionHint: string;
  nextAgentId: string | null;
  nextLabel: string;
  tone: FocusProgressTone;
};

function toFocusTone(
  tone: RequirementParticipantProgress["tone"],
): FocusProgressTone {
  if (tone === "rose") {
    return "rose";
  }
  if (tone === "amber") {
    return "amber";
  }
  if (tone === "emerald") {
    return "emerald";
  }
  if (tone === "blue" || tone === "violet") {
    return "indigo";
  }
  return "slate";
}

function buildStrategicDirectParticipantView(input: {
  company: Company | null | undefined;
  overview: RequirementExecutionOverview | null;
  targetAgentId: string | null | undefined;
  isCeoSession: boolean;
}): StrategicDirectParticipantView | null {
  const { company, isCeoSession, overview, targetAgentId } = input;
  if (!company || !overview || !targetAgentId || isCeoSession || !isStrategicRequirementTopic(overview.topicKey)) {
    return null;
  }

  const participant = overview.participants.find((item) => item.agentId === targetAgentId) ?? null;
  if (!participant) {
    return null;
  }

  const ownerAgentId = participant.agentId;
  const ownerLabel = participant.nickname;
  const globalOwnerAgentId =
    overview.currentOwnerAgentId && overview.currentOwnerAgentId !== participant.agentId
      ? overview.currentOwnerAgentId
      : null;
  const globalOwnerLabel =
    globalOwnerAgentId && company
      ? formatAgentLabel(company, globalOwnerAgentId)
      : overview.currentOwnerLabel || "负责人";

  if (participant.isBlocking) {
    return {
      participant,
      headline: `${participant.nickname} 这一步卡住了`,
      ownerAgentId,
      ownerLabel,
      stage: participant.stage,
      statusLabel: participant.statusLabel,
      summary: participant.detail,
      actionHint: `先在这里把这一步补齐；完成后明确回传给 ${globalOwnerLabel}。`,
      nextAgentId: ownerAgentId,
      nextLabel: ownerLabel,
      tone: "rose",
    };
  }

  if (isParticipantCompletedStatus(participant.statusLabel)) {
    return {
      participant,
      headline: `${participant.nickname} 这一步已回传`,
      ownerAgentId,
      ownerLabel,
      stage: participant.stage,
      statusLabel: participant.statusLabel,
      summary: participant.detail,
      actionHint:
        globalOwnerAgentId && globalOwnerLabel !== participant.nickname
          ? `这一步已经完成并回传给 ${globalOwnerLabel}，现在去看负责人收口。`
          : "这一步已经完成，可以继续做总结、补充或进入下一棒。",
      nextAgentId: globalOwnerAgentId,
      nextLabel: globalOwnerAgentId ? `${globalOwnerLabel} 收口` : "等待负责人收口",
      tone: "emerald",
    };
  }

  if (isParticipantWaitingStatus(participant.statusLabel)) {
    return {
      participant,
      headline: `${participant.nickname} 正在等待接棒`,
      ownerAgentId,
      ownerLabel,
      stage: participant.stage,
      statusLabel: participant.statusLabel,
      summary: participant.detail,
      actionHint: `先确认这一步有没有真正接住；如果已经完成，明确回传给 ${globalOwnerLabel}。`,
      nextAgentId: ownerAgentId,
      nextLabel: ownerLabel,
      tone: "amber",
    };
  }

  if (isParticipantRunningStatus(participant.statusLabel) || participant.isCurrent) {
    return {
      participant,
      headline: `${participant.nickname} 正在处理这一步`,
      ownerAgentId,
      ownerLabel,
      stage: participant.stage,
      statusLabel: participant.statusLabel,
      summary: participant.detail,
      actionHint: `继续在这里完成 ${participant.stage}，完成后明确回传给 ${globalOwnerLabel}。`,
      nextAgentId: ownerAgentId,
      nextLabel: ownerLabel,
      tone: toFocusTone(participant.tone),
    };
  }

  return {
    participant,
    headline: `${participant.nickname} 负责这一环`,
    ownerAgentId,
    ownerLabel,
    stage: participant.stage,
    statusLabel: participant.statusLabel,
    summary: participant.detail || overview.summary,
    actionHint: globalOwnerAgentId
      ? `这条主线由 ${globalOwnerLabel} 收口；如果你在这里补充结论，记得回传给负责人。`
      : "继续在这里补充结论和下一步判断。",
    nextAgentId: globalOwnerAgentId,
    nextLabel: globalOwnerAgentId ? `${globalOwnerLabel} 收口` : ownerLabel,
    tone: toFocusTone(participant.tone),
  };
}

function buildGroupChatRoute(input: {
  company: Company;
  memberIds: string[];
  topic: string;
  topicKey?: string | null;
  workItemId?: string | null;
  preferredInitiatorAgentId?: string | null;
  existingRooms?: RequirementRoomRecord[] | null;
}): string | null {
  return buildRequirementRoomRoute(input);
}

function stripChatControlMetadata(text: string): string {
  return stripTruthControlMetadata(text);
}

function stripTaskTrackerSection(text: string): string {
  return stripTruthTaskTracker(text);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncateText(text: string, maxLength: number): string {
  const compact = collapseWhitespace(text);
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function sanitizeConversationText(text: string): string {
  return normalizeTruthText(text);
}

function isEphemeralConversationText(text: string): boolean {
  return /^请只回复(?:这一句|一句)/.test(text) || /^(收到测试回执|回执分类测试)-/.test(text);
}

function isSubstantiveConversationText(text: string): boolean {
  const cleaned = sanitizeConversationText(text);
  if (
    !cleaned ||
    cleaned === "ANNOUNCE_SKIP" ||
    isEphemeralConversationText(cleaned) ||
    isSyntheticWorkflowPromptText(cleaned)
  ) {
    return false;
  }
  return cleaned.length >= 30 || /[。！？\n【】]/.test(text);
}

function extractArtifactPathsFromMessages(messages: ChatMessage[]): string[] {
  const pathPattern = /\/Users\/[^\s`"]+?\.md\b/g;
  const paths = new Set<string>();

  for (const message of messages) {
    const text = extractTextFromMessage(message);
    if (!text) {
      continue;
    }
    for (const match of text.matchAll(pathPattern)) {
      if (match[0]) {
        paths.add(match[0]);
      }
    }
  }

  return [...paths];
}

function parseAgentFileReference(
  absolutePath: string,
): { agentId: string; name: string } | null {
  const match = absolutePath.match(/\/\.openclaw\/workspaces\/---([^/]+)\/(.+)$/);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    agentId: match[1],
    name: match[2],
  };
}

function findArtifactMirrorRecord(
  absolutePath: string,
  artifacts: ArtifactRecord[],
): ArtifactRecord | null {
  const normalizedPath = absolutePath.trim();
  if (!normalizedPath) {
    return null;
  }
  return (
    artifacts.find((artifact) => artifact.sourcePath === normalizedPath)
    ?? artifacts.find((artifact) => artifact.sourceUrl === normalizedPath)
    ?? artifacts.find((artifact) =>
      artifact.sourcePath ? normalizedPath.endsWith(artifact.sourcePath) : false,
    )
    ?? null
  );
}

function normalizeChatBlockType(type?: string): string {
  if (!type) {
    return "";
  }
  if (type === "toolCall") {
    return "tool_call";
  }
  if (type === "toolResult") {
    return "tool_result";
  }
  return type
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function resolveDispatchReplyUpdates(input: {
  dispatches: DispatchRecord[];
  workItemId?: string | null;
  roomId?: string | null;
  actorId: string;
  responseMessageId: string;
  timestamp: number;
}): DispatchRecord[] {
  const candidates = input.dispatches
    .filter((dispatch) => {
      if (!dispatch.targetActorIds.includes(input.actorId)) {
        return false;
      }
      if (dispatch.status !== "pending" && dispatch.status !== "sent" && dispatch.status !== "acknowledged") {
        return false;
      }
      if (input.workItemId && dispatch.workItemId !== input.workItemId) {
        return false;
      }
      if (input.roomId && dispatch.roomId && dispatch.roomId !== input.roomId) {
        return false;
      }
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);

  if (candidates.length === 0) {
    return [];
  }

  return candidates.map((dispatch, index) => ({
    ...dispatch,
    status: index === 0 ? "answered" : "superseded",
    responseMessageId: index === 0 ? input.responseMessageId : dispatch.responseMessageId,
    updatedAt: Math.max(dispatch.updatedAt, input.timestamp),
  }));
}

function getChatBlocks(content: unknown): ChatBlock[] {
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .map((block) => (typeof block === "object" && block ? (block as ChatBlock) : null))
    .filter((block): block is ChatBlock => Boolean(block));
}

function getRenderableMessageContent(content: unknown): unknown {
  if (!Array.isArray(content)) {
    return content;
  }
  const filtered = getChatBlocks(content).filter((block) => {
    const blockType = normalizeChatBlockType(block.type);
    return blockType === "text" || blockType === "image";
  });
  return filtered.length > 0 ? filtered : null;
}

function extractToolCallNames(content: unknown): string[] {
  const names = getChatBlocks(content)
    .filter((block) => normalizeChatBlockType(block.type) === "tool_call")
    .map((block) => block.name?.trim())
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)];
}

function extractThinkingPreview(content: unknown): string | null {
  const thinkingBlock = getChatBlocks(content).find(
    (block) => normalizeChatBlockType(block.type) === "thinking" && typeof block.thinking === "string",
  );
  return thinkingBlock?.thinking?.trim() ?? null;
}

function isToolActivityMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") {
    return false;
  }
  if (extractTextFromMessage(message)) {
    return false;
  }
  const blocks = getChatBlocks(message.content);
  return blocks.some((block) => {
    const type = normalizeChatBlockType(block.type);
    return type === "tool_call" || type === "thinking";
  });
}

function extractToolResultText(message: ChatMessage): string | null {
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return message.content.trim();
  }
  const text = extractTextFromMessage(message);
  return text?.trim() ?? null;
}

function isToolResultMessage(message: ChatMessage): boolean {
  if (message.role === "toolResult") {
    return true;
  }
  if (message.role !== "assistant") {
    return false;
  }
  if (extractTextFromMessage(message)) {
    return false;
  }
  return getChatBlocks(message.content).some(
    (block) => normalizeChatBlockType(block.type) === "tool_result",
  );
}

function describeToolName(rawName: string | null): string {
  switch (rawName) {
    case "sessions_send":
      return "发送协作指令";
    case "exec":
      return "执行命令";
    case "read":
      return "读取文件";
    case "write":
      return "写入文件";
    case "browser":
      return "浏览器操作";
    case "memory_search":
      return "查询记忆";
    default:
      return rawName ?? "系统工具";
  }
}

function summarizeToolResultText(text: string): string {
  const trimmed = stripChatControlMetadata(text).trim();
  if (!trimmed || trimmed === "(no output)") {
    return "执行完成，无额外输出。";
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown> | unknown[];
    if (Array.isArray(parsed)) {
      return parsed.length === 0 ? "已返回结果，当前为空。" : `已返回 ${parsed.length} 条结果。`;
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (record.status === "accepted") {
        const delivery = record.delivery;
        if (
          delivery &&
          typeof delivery === "object" &&
          (delivery as Record<string, unknown>).status === "pending"
        ) {
          return "请求已发出，正在等待后续处理。";
        }
        return "请求已受理。";
      }
      if (record.status === "completed") {
        return "执行完成。";
      }
      if (typeof record.error === "string") {
        return `执行失败：${record.error}`;
      }
      if (Array.isArray(record.results)) {
        return record.results.length === 0 ? "检索完成，当前没有结果。" : `检索完成，返回 ${record.results.length} 条结果。`;
      }
      if (typeof record.message === "string") {
        return truncateText(record.message, 140);
      }
      if (typeof record.runId === "string") {
        return "请求已发出，正在等待后续回传。";
      }
    }
  } catch {
    // Fall back to plain text summary below.
  }

  if (/^---\s*\n|^#\s|^##\s/m.test(trimmed) || (trimmed.includes("\n") && trimmed.length > 120)) {
    return "已返回较长结果，正文已省略，可在需要时再展开查看。";
  }

  return truncateText(trimmed, 140);
}

function buildToolActivitySummary(message: ChatMessage): { title: string; detail: string } {
  const toolNames = extractToolCallNames(message.content).map((name) => describeToolName(name));
  const thinkingPreview = extractThinkingPreview(message.content);
  if (toolNames.length > 0) {
    return {
      title: `系统执行 · ${toolNames.join(" / ")}`,
      detail: thinkingPreview
        ? truncateText(thinkingPreview, 120)
        : "系统正在处理这一步，稍后会把结果回传到会话里。",
    };
  }
  return {
    title: "系统执行",
    detail: thinkingPreview
      ? truncateText(thinkingPreview, 120)
      : "系统正在整理下一步动作。",
  };
}

function buildToolResultSummary(message: ChatMessage): { title: string; detail: string } {
  const rawToolName =
    typeof message.toolName === "string" && message.toolName.trim().length > 0
      ? message.toolName.trim()
      : null;
  const toolName = describeToolName(rawToolName);
  return {
    title: `系统回执 · ${toolName}`,
    detail: summarizeToolResultText(extractToolResultText(message) ?? ""),
  };
}

function buildChatDisplayItems(
  messages: ChatMessage[],
  options?: {
    hideToolItems?: boolean;
  },
): ChatDisplayItem[] {
  const items: ChatDisplayItem[] = [];

  messages.forEach((message, index) => {
    if (message.role === "system") {
      return;
    }

    const rawText = extractTextFromMessage(message);
    if (rawText && isSyntheticWorkflowPromptText(rawText)) {
      return;
    }

    if (isToolActivityMessage(message) || isToolResultMessage(message)) {
      if (options?.hideToolItems) {
        return;
      }
      const summary = isToolActivityMessage(message)
        ? buildToolActivitySummary(message)
        : buildToolResultSummary(message);
      const tone: "slate" | "sky" = isToolActivityMessage(message) ? "slate" : "sky";
      const lastItem = items[items.length - 1];
      if (
        lastItem &&
        lastItem.kind === "tool" &&
        lastItem.title === summary.title &&
        lastItem.detail === summary.detail &&
        lastItem.tone === tone
      ) {
        lastItem.count += 1;
        return;
      }

      items.push({
        kind: "tool",
        id: `tool-${index}`,
        title: summary.title,
        detail: summary.detail,
        tone,
        count: 1,
      });
      return;
    }

    items.push({
      kind: "message",
      id: `message-${index}`,
      message,
    });
  });

  return items;
}

function extractBracketSection(text: string, label: string): string | null {
  const match = text.match(new RegExp(`【${label}】([\\s\\S]*?)(?=\\n\\s*【|$)`));
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function summarizeProgressText(text: string): { title: string; summary: string; detail?: string } | null {
  const cleaned = stripTaskTrackerSection(stripChatControlMetadata(text));
  if (!cleaned || cleaned === "ANNOUNCE_SKIP") {
    return null;
  }

  const currentStatus = extractBracketSection(cleaned, "当前状态");
  const nextStep = extractBracketSection(cleaned, "下一步进展");
  if (currentStatus) {
    return {
      title: "状态已更新",
      summary: truncateText(currentStatus, 140),
      detail: nextStep ? truncateText(nextStep, 180) : undefined,
    };
  }

  const line1 = cleaned.match(/^1\.\s*(.+)$/m)?.[1]?.trim();
  const line2 = cleaned.match(/^2\.\s*(.+)$/m)?.[1]?.trim();
  const line3 = cleaned.match(/^3\.\s*(.+)$/m)?.[1]?.trim();
  const line4 = cleaned.match(/^4\.\s*(.+)$/m)?.[1]?.trim();

  if (line1 === "是" && line2 === "是") {
    return {
      title: "已收到明确结果",
      summary: "终审已通过，并已准予继续下一步。",
      detail: line3 ? truncateText(line3, 180) : undefined,
    };
  }

  if (line1 === "否" || /未进入审核|未成功|失败/.test(cleaned)) {
    return {
      title: "已收到失败回传",
      summary: truncateText(`发布未成功${line3 ? `，${line3}` : ""}`, 140),
      detail: line4 ? truncateText(line4, 180) : undefined,
    };
  }

  if (/待命/.test(cleaned) && /不执行发布/.test(cleaned)) {
    return {
      title: "收到待命回复",
      summary: "对方仍按旧口径待命，尚未切换到最新指令。",
    };
  }

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("```"));
  if (lines.length === 0) {
    return null;
  }

  return {
    title: "收到新进展",
    summary: truncateText(lines[0], 140),
    detail: lines[1] ? truncateText(lines[1], 180) : undefined,
  };
}

function parseChecklistLines(text: string | null): string[] {
  if (!text) {
    return [];
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[0-9]+[.)、]\s*/, "").replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);
  return [...new Set(lines)];
}

function isStageConfirmationMessage(text: string): boolean {
  return /(确认|同意|按这个计划|进入下一阶段|开始下一阶段|可以开始|继续下一阶段)/i.test(text);
}

function parseStageGateSnapshot(text: string, timestamp: number, title: string): StageGateSnapshot | null {
  const stageConclusion = extractBracketSection(text, "本阶段结论");
  const stageSummary = extractBracketSection(text, "阶段总结");
  const nextStagePlan = parseChecklistLines(extractBracketSection(text, "下一阶段计划"));
  const risks = extractBracketSection(text, "风险与问题");
  const waitForConfirmation = /^(是|需要|等待)$/i.test(
    (extractBracketSection(text, "等待你确认") ?? "").trim(),
  );

  if (!stageConclusion && !stageSummary && nextStagePlan.length === 0) {
    return null;
  }

  return {
    sourceTimestamp: timestamp,
    status: waitForConfirmation ? "waiting_confirmation" : "confirmed",
    statusLabel: waitForConfirmation ? "待你确认" : "已确认待启动",
    title,
    stageConclusion: stageConclusion ?? "已收到阶段反馈",
    stageSummary: stageSummary ?? "CEO 已经给出阶段反馈，可以继续确认下一阶段。",
    risks: risks ?? null,
    nextStagePlan,
    waitForConfirmation,
    confirmMessage:
      "我已经确认，按你给出的下一阶段计划现在就开始执行。请不要停留在计划阶段，立即启动，并只回复我：1. 已启动哪一步 2. 当前负责人是谁 3. 下一次回传会给我什么结果。",
    launchMessage:
      "你已经收到我的确认，请不要再停留在计划阶段，立即按已确认的下一阶段计划启动执行。请只回复我：1. 现在已启动哪一步 2. 当前负责人是谁 3. 下一次回传会给我什么结果。",
  };
}

function resolveProgressTone(text: string): FocusProgressTone {
  if (/未成功|失败|阻塞|错误|未进入审核|不执行/.test(text)) {
    return "rose";
  }
  if (/待命|等待|待回复|未切换|待处理/.test(text)) {
    return "amber";
  }
  if (/已发送|已下发|正在|执行|处理中|同步中/.test(text)) {
    return "indigo";
  }
  if (/已完成|已通过|已收到|成功|已同步|已复制/.test(text)) {
    return "emerald";
  }
  return "slate";
}

function formatLifecycleEventTitle(event: FocusProgressEvent): string {
  if (event.source === "local") {
    return event.title.replace(/^已发送：/, "").replace(/^已同步：/, "");
  }
  return event.title.replace(/^目标会话新进展：/, "");
}

function formatLifecycleEventSummary(event: FocusProgressEvent): string {
  const combined = [event.summary, event.detail].filter((value): value is string => Boolean(value)).join(" ");
  return truncateText(combined || event.summary, 220);
}

function buildSessionProgressEvents(input: {
  messages: ChatMessage[];
  company: Company | null | undefined;
  ownerLabel: string;
  includeOwnerAssistantEvents?: boolean;
}): FocusProgressEvent[] {
  const events = input.messages
    .map((message, index) => {
      if (message.role === "toolResult" || isToolActivityMessage(message) || isToolResultMessage(message)) {
        return null;
      }

      if (message.role === "assistant" && input.includeOwnerAssistantEvents === false) {
        return null;
      }

      const text = extractTextFromMessage(message);
      if (!text) {
        return null;
      }

      const summary = summarizeProgressText(text);
      if (!summary) {
        return null;
      }

      const provenance =
        typeof message.provenance === "object" && message.provenance
          ? (message.provenance as Record<string, unknown>)
          : null;
      const sourceSessionKey =
        provenance && typeof provenance.sourceSessionKey === "string"
          ? provenance.sourceSessionKey
          : null;
      const sourceAgentId = parseAgentIdFromSessionKey(sourceSessionKey ?? "");
      const actorLabel =
        message.role === "assistant"
          ? input.ownerLabel
          : sourceAgentId
            ? formatAgentLabel(input.company, sourceAgentId)
            : extractNameFromMessage(text) ?? "最新回传";
      const tone = resolveProgressTone(`${summary.summary} ${summary.detail ?? ""}`);

      const event: FocusProgressEvent = {
        id: `session:${message.timestamp ?? index}:${summary.title}:${actorLabel}`,
        timestamp: message.timestamp ?? Date.now(),
        actorLabel,
        actorAgentId: sourceAgentId ?? undefined,
        title: summary.title,
        summary: summary.summary,
        detail: summary.detail,
        tone,
        source: "session" as const,
        category: "status" as const,
      };
      return event;
    })
    .filter((event): event is FocusProgressEvent => event !== null);

  const deduped = new Map<string, FocusProgressEvent>();
  for (const event of events) {
    const key = `${event.actorLabel}:${event.title}:${event.summary}`;
    if (!deduped.has(key)) {
      deduped.set(key, event);
    }
  }
  return [...deduped.values()]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 4);
}

export function ChatPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const activeCompany = useCompanyStore((state) => state.activeCompany);
  const activeRoomRecords = useCompanyStore((state) => state.activeRoomRecords);
  const activeMissionRecords = useCompanyStore((state) => state.activeMissionRecords);
  const activeWorkItems = useCompanyStore((state) => state.activeWorkItems);
  const activeRoundRecords = useCompanyStore((state) => state.activeRoundRecords);
  const activeArtifacts = useCompanyStore((state) => state.activeArtifacts);
  const activeDispatches = useCompanyStore((state) => state.activeDispatches);
  const activeRoomBindings = useCompanyStore((state) => state.activeRoomBindings);
  const updateCompany = useCompanyStore((state) => state.updateCompany);
  const upsertHandoff = useCompanyStore((state) => state.upsertHandoff);
  const upsertRequest = useCompanyStore((state) => state.upsertRequest);
  const upsertRoomRecord = useCompanyStore((state) => state.upsertRoomRecord);
  const upsertRoundRecord = useCompanyStore((state) => state.upsertRoundRecord);
  const deleteRoundRecord = useCompanyStore((state) => state.deleteRoundRecord);
  const appendRoomMessages = useCompanyStore((state) => state.appendRoomMessages);
  const upsertRoomConversationBindings = useCompanyStore((state) => state.upsertRoomConversationBindings);
  const upsertMissionRecord = useCompanyStore((state) => state.upsertMissionRecord);
  const upsertWorkItemRecord = useCompanyStore((state) => state.upsertWorkItemRecord);
  const upsertDispatchRecord = useCompanyStore((state) => state.upsertDispatchRecord);
  const providerId = useGatewayStore((state) => state.providerId);
  const connected = useGatewayStore((state) => state.connected);
  const providerCapabilities = useGatewayStore((state) => state.capabilities);
  const providerManifest = useGatewayStore((state) => state.manifest);
  const isPageVisible = usePageVisibility();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [recentAgentSessions, setRecentAgentSessions] = useState<GatewaySessionRow[]>([]);
  const [recentArchivedRounds, setRecentArchivedRounds] = useState<GatewaySessionArchiveRow[]>([]);
  const [archiveHistoryNotice, setArchiveHistoryNotice] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshNonce, setHistoryRefreshNonce] = useState(0);
  const [deletingHistorySessionKey, setDeletingHistorySessionKey] = useState<string | null>(null);
  const [deletingArchiveId, setDeletingArchiveId] = useState<string | null>(null);
  const [restoringArchiveId, setRestoringArchiveId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [runningFocusActionId, setRunningFocusActionId] = useState<string | null>(null);
  const [recoveringCommunication, setRecoveringCommunication] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isTechnicalSummaryOpen, setIsTechnicalSummaryOpen] = useState(false);
  const [summaryPanelView, setSummaryPanelView] = useState<"owner" | "team" | "debug">("owner");
  const [companySessionSnapshots, setCompanySessionSnapshots] = useState<RequirementSessionSnapshot[]>([]);
  const [hasBootstrappedCompanySync, setHasBootstrappedCompanySync] = useState(false);
  const [localProgressEvents, setLocalProgressEvents] = useState<FocusProgressEvent[]>([]);
  const [actionWatches, setActionWatches] = useState<FocusActionWatch[]>([]);
  const [roomBroadcastMode, setRoomBroadcastMode] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const streamTextRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const companySessionSnapshotsRef = useRef<RequirementSessionSnapshot[]>([]);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const forceScrollOnNextUpdateRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const userScrollLockRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const lockedScrollTopRef = useRef<number | null>(null);
  const [composerPrefill, setComposerPrefill] = useState<{ id: number; text: string } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<{ mimeType: string; dataUrl: string }[]>([]);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const endRef = useRef<HTMLDivElement>(null);

  const updateStreamText = (value: string | null) => {
    streamTextRef.current = value;
    setStreamText(value);
  };

  const isNearBottom = useCallback((element: HTMLElement | null): boolean => {
    if (!element) {
      return true;
    }
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    return distanceToBottom <= 120;
  }, []);

  const markScrollIntent = useCallback((mode: "preserve" | "follow" = "preserve") => {
    if (mode === "follow") {
      userScrollLockRef.current = false;
      shouldAutoScrollRef.current = true;
      forceScrollOnNextUpdateRef.current = true;
      lockedScrollTopRef.current = null;
      return;
    }

    shouldAutoScrollRef.current = isNearBottom(scrollContainerRef.current);
    forceScrollOnNextUpdateRef.current = false;
  }, [isNearBottom]);

  const setProgrammaticScrollLock = useCallback((locked: boolean) => {
    programmaticScrollRef.current = locked;
    if (locked) {
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    }
  }, []);

  useEffect(() => {
    companySessionSnapshotsRef.current = companySessionSnapshots;
  }, [companySessionSnapshots]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    // A company switch should not reuse the previous company's requirement cache.
    setHasBootstrappedCompanySync(false);
    setCompanySessionSnapshots([]);
    companySessionSnapshotsRef.current = [];
  }, [activeCompany?.id]);

  useEffect(() => {
    const routeState = location.state as { prefillText?: string; prefillId?: number } | null;
    const prefillText = routeState?.prefillText?.trim();
    if (!prefillText) {
      return;
    }

    setComposerPrefill({
      id: routeState?.prefillId ?? Date.now(),
      text: prefillText,
    });

    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    });
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const isRoomRoute = agentId?.startsWith("room:") ?? false;
  const routeRoomId = isRoomRoute ? agentId?.slice("room:".length).trim() || null : null;
  // If the URL parameter contains a colon, it's likely a full provider conversation key.
  // Room routes use product room ids instead and should not leak provider keys into routing.
  const isDirectKey = !isRoomRoute && agentId?.includes(":");
  const targetSessionKey = isDirectKey ? agentId?.split("?")[0] ?? null : null;
  const directRouteAgentId = isDirectKey ? parseAgentIdFromSessionKey(targetSessionKey ?? "") : null;

  // Derive title/avatar for group chat vs 1v1
  const isGroup = Boolean(isRoomRoute || (isDirectKey && agentId?.includes(":group:")));
  const targetAgentId = isRoomRoute ? null : isDirectKey ? (isGroup ? null : directRouteAgentId) : agentId;
  const historyAgentId = targetAgentId ?? directRouteAgentId;
  const groupTopic = isGroup && !isRoomRoute ? agentId?.split(":group:")[1] ?? null : null;
  // If we are in a group, parse the member agents from the '?m=' query param injected by the lobby
  const searchParams = new URLSearchParams(location.search);
  const groupMembersCsv = searchParams.get("m") ?? agentId?.split("?m=")[1] ?? null;
  const groupMembers = groupMembersCsv ? [...new Set(groupMembersCsv.split(",").filter(Boolean))] : [];
  const routeGroupTopicKey = isGroup ? searchParams.get("tk")?.trim().toLowerCase() || null : null;
  const routeWorkItemId = isGroup ? searchParams.get("wi")?.trim() || null : null;
  const routeRoomSessionKey = isGroup ? searchParams.get("sk")?.trim() || null : null;
  const archiveId = !isGroup ? searchParams.get("archive")?.trim() || null : null;
  const isArchiveView = Boolean(archiveId && historyAgentId);
  const supportsSessionHistory = providerCapabilities.sessionHistory;
  const supportsSessionArchives = providerCapabilities.sessionArchives;
  const supportsSessionArchiveRestore = providerCapabilities.sessionArchiveRestore;
  const rawGroupTitle =
    searchParams.get("title")?.trim() ||
    (groupTopic
      ? groupTopic
          .replace(/-[a-z0-9]{6}$/i, "")
          .replace(/-/g, " ")
          .trim()
      : null) ||
    "需求团队";
  const activeRequirementRoom = useMemo(
    () =>
      isGroup
        ? activeRoomRecords.find(
            (room) =>
              (routeRoomId && room.id === routeRoomId) ||
              (targetSessionKey && room.sessionKey === targetSessionKey) ||
              (routeWorkItemId && room.workItemId === routeWorkItemId),
          ) ??
          null
        : null,
    [activeRoomRecords, isGroup, routeRoomId, routeWorkItemId, targetSessionKey],
  );
  const effectiveGroupSessionKey =
    activeRequirementRoom?.sessionKey ?? routeRoomSessionKey ?? targetSessionKey;
  const groupTitle = activeRequirementRoom?.title ?? rawGroupTitle;
  const groupTopicKey = activeRequirementRoom?.topicKey ?? routeGroupTopicKey;
  const groupWorkItemId = activeRequirementRoom?.workItemId ?? routeWorkItemId;
  const productArchivedRounds = useMemo(
    () =>
      !isGroup && historyAgentId
        ? activeRoundRecords
            .filter((round) => matchesProductRoundToActor(round, historyAgentId))
            .sort((left, right) => right.archivedAt - left.archivedAt)
        : [],
    [activeRoundRecords, historyAgentId, isGroup],
  );
  const activeArchivedRound = useMemo(
    () =>
      archiveId ? productArchivedRounds.find((round) => round.id === archiveId) ?? null : null,
    [archiveId, productArchivedRounds],
  );
  const historyRoundItems = useMemo(
    () =>
      buildHistoryRoundItems({
        productRounds: productArchivedRounds,
        providerRounds: recentArchivedRounds,
      }).slice(0, 16),
    [productArchivedRounds, recentArchivedRounds],
  );
  const requirementRoomTargetAgentIds = useMemo(
    () =>
      [...new Set((activeRequirementRoom?.memberIds?.length ? activeRequirementRoom.memberIds : groupMembers).filter(Boolean))],
    [activeRequirementRoom?.memberIds, groupMembers],
  );
  const requirementRoomSessions = useMemo(
    () =>
      isGroup
        ? buildRequirementRoomSessions({
            company: activeCompany,
            room: activeRequirementRoom,
            bindings: activeRequirementRoom
              ? activeRoomBindings.filter((binding) => binding.roomId === activeRequirementRoom.id)
              : [],
            targetSessionKey: effectiveGroupSessionKey,
            memberIds: requirementRoomTargetAgentIds,
          })
        : [],
    [
      activeCompany,
      activeRequirementRoom,
      activeRoomBindings,
      effectiveGroupSessionKey,
      isGroup,
      requirementRoomTargetAgentIds,
    ],
  );
  const requirementRoomSessionKeys = useMemo(
    () => new Set(requirementRoomSessions.map((session) => session.sessionKey)),
    [requirementRoomSessions],
  );
  const requirementRoomMentionCandidates = useMemo(
    () =>
      searchRequirementRoomMentionCandidates({
        company: activeCompany,
        memberIds: requirementRoomTargetAgentIds,
        query: "",
      }),
    [activeCompany, requirementRoomTargetAgentIds],
  );

  const emp = activeCompany?.employees.find((e) => e.agentId === targetAgentId);
  const isCeoSession = emp?.metaRole === "ceo";
  const isFreshConversation = Boolean(
    isCeoSession &&
      !isGroup &&
      !isArchiveView &&
      sessionKey &&
      !loading &&
      messages.length === 0 &&
      !isGenerating &&
      !streamText,
  );
  const isRequirementBootstrapPending = Boolean(
    isCeoSession &&
      !isGroup &&
      !isArchiveView &&
      activeCompany &&
      connected &&
      !hasBootstrappedCompanySync &&
      messages.length === 0 &&
      !isFreshConversation,
  );

  useEffect(() => {
    if (!isGroup) {
      return;
    }
    const nextMessages = convertRequirementRoomRecordToChatMessages(activeRequirementRoom);
    setMessages((previous) =>
      areRequirementRoomChatMessagesEqual(previous, nextMessages) ? previous : nextMessages,
    );
  }, [activeRequirementRoom, isGroup]);

  useEffect(() => {
    setRoomBroadcastMode(false);
  }, [agentId, sessionKey]);

  useEffect(() => {
    if (!connected || isGroup || !historyAgentId) {
      setRecentAgentSessions([]);
      setRecentArchivedRounds([]);
      setArchiveHistoryNotice(null);
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    const loaders: Promise<void>[] = [];

    if (supportsSessionHistory) {
      loaders.push(
        gateway
          .listSessions({ limit: 80, includeGlobal: false })
          .then((sessionResult) => {
            if (cancelled) {
              return;
            }
            const sessions = (sessionResult.sessions ?? [])
              .filter((session) => parseAgentIdFromSessionKey(session.key) === historyAgentId)
              .sort((left, right) => resolveSessionUpdatedAt(right) - resolveSessionUpdatedAt(left))
              .slice(0, 16);
            setRecentAgentSessions(sessions);
          })
          .catch((error) => {
            if (!cancelled) {
              console.error("Failed to load recent sessions", error);
              setRecentAgentSessions([]);
            }
          }),
      );
    } else {
      setRecentAgentSessions([]);
    }

    if (supportsSessionArchives) {
      loaders.push(
        gateway
          .listSessionArchives(historyAgentId, 24)
          .then((archiveResult) => {
            if (cancelled) {
              return;
            }
            setRecentArchivedRounds((archiveResult.archives ?? []).slice(0, 12));
            setArchiveHistoryNotice(null);
          })
          .catch((error) => {
            if (!cancelled) {
              console.error("Failed to load archived rounds", error);
              setRecentArchivedRounds([]);
              setArchiveHistoryNotice(resolveArchiveHistoryNotice(error));
            }
          }),
      );
    } else {
      setRecentArchivedRounds([]);
      setArchiveHistoryNotice("当前后端暂不支持归档轮次。");
    }

    Promise.allSettled(loaders).finally(() => {
      if (!cancelled) {
        setHistoryLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    connected,
    historyAgentId,
    historyRefreshNonce,
    isGroup,
    sessionKey,
    supportsSessionArchives,
    supportsSessionHistory,
  ]);
  // For group chat, we match anyone in the company (or an initiator if we can parse it, but for simplicity we rely on the session).

  const latestTracker = useMemo(
    () =>
      [...messages]
        .reverse()
        .map((message) => {
          const text = extractTextFromMessage(message);
          return text ? extractTaskTracker(text) : null;
        })
        .find((tracker): tracker is TaskItem[] => Array.isArray(tracker) && tracker.length > 0),
    [messages],
  );

  const latestTaskSteps: TaskStep[] | undefined = useMemo(
    () =>
      latestTracker?.map((item) => ({
        text: item.text,
        status: item.status,
      })),
    [latestTracker],
  );

  const latestMessageTimestamp = useMemo(
    () =>
      messages.reduce((latest, message) => {
        const timestamp = typeof message.timestamp === "number" ? message.timestamp : 0;
        return Math.max(latest, timestamp);
      }, 0),
    [messages],
  );
  const previewTimestamp = latestMessageTimestamp || 1;

  const sessionExecution = useMemo(
    () =>
      resolveExecutionState({
        evidenceTexts: [
          ...messages
            .slice(-8)
            .map((message) => extractTextFromMessage(message))
            .filter((text): text is string => Boolean(text)),
          streamText,
        ],
        taskSteps: latestTaskSteps,
        isGenerating,
        fallbackState: sessionKey ? "idle" : "unknown",
      }),
    [isGenerating, latestTaskSteps, messages, sessionKey, streamText],
  );
  const takeoverPack = useMemo(
    () =>
      sessionKey && sessionExecution.state === "manual_takeover_required"
        ? buildManualTakeoverPack({
            messages,
            sessionKey,
            ownerLabel: isGroup ? `需求团队: ${groupTitle}` : emp?.nickname || agentId || "未知成员",
            fallbackTitle: isGroup ? `需求团队: ${groupTitle}` : emp?.nickname || "人工接管任务",
          })
        : null,
    [agentId, emp?.nickname, groupTitle, isGroup, messages, sessionExecution.state, sessionKey],
  );
  // These previews feed both the UI and store-sync effects, so they must stay stable across renders.
  const structuredTaskPreview = useMemo(
    () =>
      latestTaskSteps && sessionKey && activeCompany
        ? buildTaskObjectSnapshot({
            task: {
              id: sessionKey.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40),
              title: isGroup ? `需求团队: ${groupTitle}` : emp?.nickname || "任务摘要",
              sessionKey,
              agentId: targetAgentId || sessionKey,
              steps: latestTaskSteps,
              createdAt: previewTimestamp,
              updatedAt: previewTimestamp,
            },
            company: activeCompany,
            execution: sessionExecution,
            takeoverPack,
            now: previewTimestamp,
          })
        : null,
    [
      activeCompany,
      emp?.nickname,
      groupTitle,
      isGroup,
      latestTaskSteps,
      previewTimestamp,
      sessionExecution,
      sessionKey,
      takeoverPack,
      targetAgentId,
    ],
  );
  const nextOpenTaskStep = structuredTaskPreview?.steps.find((step) => step.status !== "done") ?? null;
  const nextOpenTaskStepLabel = summarizeStepLabel(nextOpenTaskStep ?? undefined);
  const nextOpenTaskStepAgentId =
    activeCompany && nextOpenTaskStep
      ? resolveStepAssigneeAgentId(nextOpenTaskStep, activeCompany.employees)
      : null;
  const handoffPreview = useMemo(
    () =>
      activeCompany && sessionKey
        ? buildHandoffRecords({
            sessionKey,
            messages: messages.slice(-12),
            company: activeCompany,
            currentAgentId: targetAgentId,
            relatedTask: structuredTaskPreview ?? null,
          })
        : [],
    [activeCompany, messages, sessionKey, structuredTaskPreview, targetAgentId],
  );
  const requestPreview = useMemo(
    () =>
      sessionKey && handoffPreview.length > 0
        ? buildRequestRecords({
            sessionKey,
            handoffs: handoffPreview,
            messages: messages.slice(-16),
            relatedTask: structuredTaskPreview ?? null,
          })
        : [],
    [handoffPreview, messages, sessionKey, structuredTaskPreview],
  );
  const requestHealth = useMemo(() => summarizeRequestHealth(requestPreview), [requestPreview]);
  const ceoSurface = useMemo(
    () => (activeCompany && emp?.metaRole === "ceo" ? buildCeoControlSurface(activeCompany) : null),
    [activeCompany, emp?.metaRole],
  );
  const orgAdvisor = useMemo(
    () => (activeCompany && emp?.metaRole === "ceo" ? buildOrgAdvisorSnapshot(activeCompany) : null),
    [activeCompany, emp?.metaRole],
  );
  const relatedSlaAlerts = useMemo(
    () =>
      activeCompany && sessionKey
        ? evaluateSlaAlerts({
            ...activeCompany,
            tasks: uniqueTaskList([
              ...(activeCompany.tasks ?? []),
              ...(structuredTaskPreview ? [structuredTaskPreview] : []),
            ]),
            handoffs: uniqueHandoffList([...(activeCompany.handoffs ?? []), ...handoffPreview]),
          }).filter((alert) => alert.sessionKey === sessionKey)
        : [],
    [activeCompany, handoffPreview, sessionKey, structuredTaskPreview],
  );
  const localSlaFallbackAlerts = useMemo(
    () =>
      sessionKey && relatedSlaAlerts.length === 0
        ? [
            ...(sessionExecution.state === "manual_takeover_required"
              ? [
                  {
                    id: `${sessionKey}:local-takeover`,
                    title: "当前会话已进入人工接管 SLA",
                    summary: sessionExecution.summary,
                    detail: "建议立刻复制接管包并由人工继续执行。",
                  },
                ]
              : []),
            ...handoffPreview
              .filter((handoff) => (handoff.missingItems?.length ?? 0) > 0)
              .slice(0, 2)
              .map((handoff) => ({
                id: `${handoff.id}:local-handoff`,
                title: `交接缺失项: ${handoff.title}`,
                summary: handoff.summary,
                detail: `缺失 ${handoff.missingItems?.length ?? 0} 项，建议优先补齐。`,
              })),
          ]
        : [],
    [handoffPreview, relatedSlaAlerts.length, sessionExecution.state, sessionExecution.summary, sessionKey],
  );
  const summaryAlertCount = relatedSlaAlerts.length + localSlaFallbackAlerts.length;
  const focusSummary = useMemo(
    () =>
      buildExecutionFocusSummary({
        company: activeCompany,
        targetAgentId,
        targetRoleLabel: isGroup ? "多人协作会话" : emp?.role ?? "会话",
        execution: sessionExecution,
        task: structuredTaskPreview ?? null,
        requests: requestPreview,
        handoffs: handoffPreview,
        takeoverPack,
        ceoSurface: ceoSurface ?? undefined,
        alerts: [...relatedSlaAlerts, ...localSlaFallbackAlerts],
      }),
    [
      activeCompany,
      ceoSurface,
      emp?.role,
      handoffPreview,
      isGroup,
      localSlaFallbackAlerts,
      relatedSlaAlerts,
      requestPreview,
      sessionExecution,
      structuredTaskPreview,
      takeoverPack,
      targetAgentId,
    ],
  );
  const currentConversationRequirementHint = useMemo(() => {
    if (isGroup) {
      return null;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "user") {
        continue;
      }
      const text = extractTextFromMessage(message);
      if (!text || !isSubstantiveConversationText(text)) {
        continue;
      }
      return {
        text,
        topicKey: inferRequestTopicKey([text]) ?? inferMissionTopicKey([text]),
        timestamp: typeof message.timestamp === "number" ? message.timestamp : null,
      };
    }

    return null;
  }, [isGroup, messages]);
  const requirementOverview = useMemo(
    () =>
      activeCompany && !isRequirementBootstrapPending && !isFreshConversation
        ? buildRequirementExecutionOverview({
            company: activeCompany,
            preferredTopicKey: currentConversationRequirementHint?.topicKey ?? null,
            preferredTopicText: currentConversationRequirementHint?.text ?? null,
            preferredTopicTimestamp: currentConversationRequirementHint?.timestamp ?? null,
            topicHints: [
              currentConversationRequirementHint?.text,
              ...requestPreview.map((request) => request.topicKey ?? request.title ?? request.summary),
              ...handoffPreview.map((handoff) => `${handoff.title}\n${handoff.summary}`),
              structuredTaskPreview?.title,
            ],
            sessionSnapshots: companySessionSnapshots,
            now: currentTime,
          })
        : null,
    [
      activeCompany,
      companySessionSnapshots,
      currentTime,
      currentConversationRequirementHint?.text,
      currentConversationRequirementHint?.timestamp,
      currentConversationRequirementHint?.topicKey,
      handoffPreview,
      isGroup,
      isFreshConversation,
      isRequirementBootstrapPending,
      requestPreview,
      structuredTaskPreview?.title,
    ],
  );
  const requirementProgressGroups = useMemo(() => {
    if (!requirementOverview || !(isSummaryOpen && summaryPanelView === "owner")) {
      return null;
    }

    const working = requirementOverview.participants.filter((participant) =>
      ["已开工", "已开工未交付", "已阻塞", "待回复", "未回复"].includes(participant.statusLabel),
    );
    const waiting = requirementOverview.participants.filter((participant) =>
      ["已就绪待稿", "待接手", "已交付待下游", "部分完成"].includes(participant.statusLabel),
    );
    const completed = requirementOverview.participants.filter((participant) =>
      ["已确认", "已冻结待命", "已回复", "已交接"].includes(participant.statusLabel),
    );

    return { working, waiting, completed };
  }, [isSummaryOpen, requirementOverview, summaryPanelView]);
  const latestDirectTurnSummary = useMemo(() => {
    if (isGroup) {
      return null;
    }

    let latestUserIndex = -1;
    let latestUserText: string | null = null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "user") {
        continue;
      }
      const text = extractTextFromMessage(message);
      if (!text || !isSubstantiveConversationText(text)) {
        continue;
      }
      latestUserIndex = index;
      latestUserText = text;
      break;
    }

    if (latestUserIndex < 0 || !latestUserText) {
      return null;
    }

    for (let index = messages.length - 1; index > latestUserIndex; index -= 1) {
      const message = messages[index];
      if (message?.role !== "assistant") {
        continue;
      }
      const text = extractTextFromMessage(message);
      if (!text || !isSubstantiveConversationText(text)) {
        continue;
      }
      return {
        state: "answered" as const,
        questionText: sanitizeConversationText(latestUserText),
        questionPreview: truncateText(sanitizeConversationText(latestUserText), 96),
        replyText: sanitizeConversationText(text),
        replyPreview: truncateText(sanitizeConversationText(text), 180),
        replyIndex: index,
        repliedAt: typeof message.timestamp === "number" ? message.timestamp : null,
      };
    }

    return {
      state: "waiting" as const,
      questionText: sanitizeConversationText(latestUserText),
      questionPreview: truncateText(sanitizeConversationText(latestUserText), 96),
      replyText: null,
      replyPreview: null,
      replyIndex: null,
      repliedAt: null,
    };
  }, [isGroup, messages]);
  const taskPlanOverview = useMemo(() => {
    const supportsStructuredTaskPlan =
      !requirementOverview?.topicKey || requirementOverview.topicKey.startsWith("chapter:");
    if (!structuredTaskPreview || !activeCompany || !supportsStructuredTaskPlan) {
      return null;
    }

    const participantByAgentId = new Map(
      (requirementOverview?.participants ?? []).map((participant) => [participant.agentId, participant] as const),
    );

    const steps = structuredTaskPreview.steps.map((step, index) => {
      const assigneeAgentId = resolveStepAssigneeAgentId(step, activeCompany.employees);
      const assigneeLabel = assigneeAgentId
        ? formatAgentLabel(activeCompany, assigneeAgentId)
        : step.assignee?.replace(/^@/, "") || "待分配";
      const title = summarizeStepLabel(step) ?? step.text;
      const participant = assigneeAgentId ? participantByAgentId.get(assigneeAgentId) ?? null : null;
      const inferredStatus: TaskStepStatus =
        step.status === "done" || (participant && isParticipantStepDone(participant.statusLabel))
          ? "done"
          : step.status === "wip" || (participant && isParticipantStepInProgress(participant.statusLabel))
            ? "wip"
            : "pending";
      const statusLabel =
        inferredStatus === "done" ? "已完成" : inferredStatus === "wip" ? "处理中" : "待处理";
      return {
        id: `${structuredTaskPreview.id}:plan:${index}`,
        title,
        assigneeAgentId,
        assigneeLabel,
        status: inferredStatus,
        statusLabel,
        detail: participant?.detail ?? null,
      };
    });

    const doneCount = steps.filter((step) => step.status === "done").length;
    const currentStep = steps.find((step) => step.status !== "done") ?? null;
    const nextStep = currentStep
      ? steps[steps.findIndex((step) => step.id === currentStep.id) + 1] ?? null
      : null;

    return {
      totalCount: steps.length,
      doneCount,
      currentStep,
      nextStep,
      steps,
    };
  }, [activeCompany, requirementOverview?.participants, requirementOverview?.topicKey, structuredTaskPreview]);
  const shouldComputeTeamPanelDetails = isSummaryOpen && summaryPanelView === "team";
  const teamPanelRoomTranscript = shouldComputeTeamPanelDetails ? activeRequirementRoom?.transcript : undefined;
  const teamPanelSnapshots = shouldComputeTeamPanelDetails ? companySessionSnapshots : undefined;
  const requirementTeam = useMemo(
    () =>
      buildRequirementTeamView({
        company: activeCompany,
        overview: requirementOverview,
        plan: taskPlanOverview,
        roomTranscript: teamPanelRoomTranscript,
        sessionSnapshots: teamPanelSnapshots,
        includeTimeline: shouldComputeTeamPanelDetails,
        includeArtifacts: shouldComputeTeamPanelDetails,
      }),
    [
      activeCompany,
      requirementOverview,
      shouldComputeTeamPanelDetails,
      taskPlanOverview,
      teamPanelRoomTranscript,
      teamPanelSnapshots,
    ],
  );
  const latestStageGate = useMemo(() => {
    if (!isCeoSession) {
      return null;
    }

    const requirementTitle = requirementOverview?.title ?? structuredTaskPreview?.title ?? "当前需求";
    const normalizedMessages = [...messages]
      .map((message) => ({
        role: message.role,
        text: extractTextFromMessage(message) ?? "",
        timestamp: typeof message.timestamp === "number" ? message.timestamp : 0,
      }))
      .filter((message) => message.text.length > 0)
      .sort((left, right) => right.timestamp - left.timestamp);

    const gateMessage = normalizedMessages.find(
      (message) =>
        message.role === "assistant" &&
        Boolean(parseStageGateSnapshot(message.text, message.timestamp, requirementTitle)),
    );
    if (!gateMessage) {
      return null;
    }

    const parsed = parseStageGateSnapshot(gateMessage.text, gateMessage.timestamp, requirementTitle);
    if (!parsed) {
      return null;
    }

    const confirmationMessage =
      normalizedMessages.find(
        (message) =>
          message.role === "user" &&
          message.timestamp > parsed.sourceTimestamp &&
          isStageConfirmationMessage(message.text),
      ) ?? null;

    if (!confirmationMessage) {
      return parsed;
    }

    const stageGateConsumed = normalizedMessages.some(
      (message) =>
        message.role === "assistant" &&
        message.timestamp > confirmationMessage.timestamp &&
        message.text.trim().length > 0 &&
        !parseStageGateSnapshot(message.text, message.timestamp, requirementTitle),
    );

    if (stageGateConsumed) {
      return null;
    }

    return {
      ...parsed,
      status: "confirmed" as const,
      statusLabel: "已确认待启动",
    };
  }, [isCeoSession, messages, requirementOverview?.title, structuredTaskPreview?.title]);
  const isChapterExecutionRequirement = Boolean(requirementOverview?.topicKey?.startsWith("chapter:"));
  const shouldAdvanceToNextPhase = Boolean(
    isChapterExecutionRequirement &&
      !isRequirementBootstrapPending &&
      taskPlanOverview &&
      taskPlanOverview.currentStep &&
      taskPlanOverview.currentStep.assigneeAgentId === targetAgentId &&
      /CEO/i.test(taskPlanOverview.currentStep.title) &&
      taskPlanOverview.doneCount >= Math.max(1, taskPlanOverview.totalCount - 1),
  );
  const requirementWriterParticipant =
    requirementOverview?.participants.find((participant) => participantMatchesRole(participant, /主笔|写手/i)) ?? null;
  const requirementReviewParticipant =
    requirementOverview?.participants.find((participant) => participantMatchesRole(participant, /审校/i)) ?? null;
  const requirementEditorParticipant =
    requirementOverview?.participants.find((participant) => participantMatchesRole(participant, /主编|质量总监|终审/i)) ??
    null;
  const requirementCompanyTechEmployee =
    activeCompany?.employees.find((employee) => employee.metaRole === "cto") ?? null;
  const requirementTechParticipant =
    (requirementCompanyTechEmployee
      ? requirementOverview?.participants.find(
          (participant) => participant.agentId === requirementCompanyTechEmployee.agentId,
        )
      : requirementOverview?.participants.find((participant) => participantMatchesRole(participant, /CTO|技术/i))) ??
    null;
  const hasRestartRewriteChainCompleted = Boolean(
    requirementWriterParticipant &&
      requirementReviewParticipant &&
      requirementEditorParticipant &&
      isParticipantStepDone(requirementWriterParticipant.statusLabel) &&
      isParticipantStepDone(requirementReviewParticipant.statusLabel) &&
      isParticipantStepDone(requirementEditorParticipant.statusLabel),
  );
  const shouldDirectToTechDispatch = Boolean(
    isChapterExecutionRequirement &&
      requirementOverview?.currentOwnerAgentId === targetAgentId &&
      hasRestartRewriteChainCompleted &&
      requirementTechParticipant &&
      isCoordinatorWaitingStatus(requirementTechParticipant.statusLabel),
  );
  const overviewShowsDispatch = Boolean(
    isChapterExecutionRequirement &&
      requirementOverview?.currentOwnerAgentId === targetAgentId &&
      /CTO/i.test(requirementOverview?.currentStage ?? "") &&
      /发布/i.test(requirementOverview?.currentStage ?? ""),
  );
  const shouldDispatchPublish = Boolean(
    overviewShowsDispatch ||
      ((shouldAdvanceToNextPhase || shouldDirectToTechDispatch) &&
      hasRestartRewriteChainCompleted &&
      requirementTechParticipant &&
      isCoordinatorWaitingStatus(requirementTechParticipant.statusLabel)),
  );
  const publishDispatchTargetAgentId =
    requirementCompanyTechEmployee?.agentId ?? requirementTechParticipant?.agentId ?? "co-cto";
  const publishDispatchTargetLabel =
    requirementCompanyTechEmployee
      ? formatAgentLabel(activeCompany, requirementCompanyTechEmployee.agentId)
      : requirementTechParticipant?.nickname ?? "CTO";
  const requirementLifecycleSections = useMemo(() => {
    if (!requirementOverview || !requirementProgressGroups || !(isSummaryOpen && summaryPanelView === "owner")) {
      return null;
    }

    const current = requirementOverview.participants.find((participant) => participant.isCurrent) ?? null;
    const workingOthers = requirementProgressGroups.working.filter((participant) => !participant.isCurrent);
    const waiting = requirementProgressGroups.waiting.filter((participant) => !participant.isCurrent);
    const completed = requirementProgressGroups.completed.filter((participant) => !participant.isCurrent);

    return [
      current
        ? {
            id: "current",
            title: "当前处理",
            summary: "现在就盯这一步，它决定任务有没有继续往下走。",
            items: [current],
          }
        : null,
      workingOthers.length > 0
        ? {
            id: "working",
            title: "正在推进",
            summary: "这些节点已经在做事，但还没形成下一跳结果。",
            items: workingOthers,
          }
        : null,
      waiting.length > 0
        ? {
            id: "waiting",
            title: "等待接棒",
            summary: "这些节点还在等上一棒、等确认，或者还没真正接住任务。",
            items: waiting,
          }
        : null,
      completed.length > 0
        ? {
            id: "completed",
            title: "已完成本轮",
            summary: "这些节点本轮已经完成确认、交付或冻结，不用继续盯。",
            items: completed,
          }
        : null,
    ].filter((section): section is NonNullable<typeof section> => Boolean(section));
  }, [isSummaryOpen, requirementOverview, requirementProgressGroups, summaryPanelView]);
  const hasTechnicalSummary =
    Boolean(takeoverPack) ||
    Boolean(structuredTaskPreview) ||
    Boolean(ceoSurface) ||
    handoffPreview.length > 0 ||
    requestPreview.length > 0 ||
    summaryAlertCount > 0;
  const hasContextSummary = !isFreshConversation && (Boolean(sessionKey) || hasTechnicalSummary);

  const appendLocalProgressEvent = (event: Omit<FocusProgressEvent, "source">) => {
    setLocalProgressEvents((previous) =>
      [
        {
          ...event,
          source: "local" as const,
        },
        ...previous,
      ]
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, 6),
    );
  };
  const syncCompanyCommunication = useCallback(
    async (options?: { force?: boolean }) => {
      if (!activeCompany) {
        setCompanySessionSnapshots([]);
        return null;
      }

      const sessionResult = await gateway.listSessions();
      const companyAgentIds = new Set(activeCompany.employees.map((employee) => employee.agentId));
      const companySessions = sessionResult.sessions
        .filter((session) => {
        const sessionAgentId = parseAgentIdFromSessionKey(session.key);
        return sessionAgentId ? companyAgentIds.has(sessionAgentId) : false;
        })
        .sort((left, right) => resolveSessionUpdatedAt(right) - resolveSessionUpdatedAt(left));
      const activeSessionKeys = new Set(companySessions.map((session) => session.key));
      const snapshotBySessionKey = new Map(
        companySessionSnapshotsRef.current.map((snapshot) => [snapshot.sessionKey, snapshot] as const),
      );
      const sessionsToCheck =
        companySessions.length > 0
          ? companySessions
              .filter((session) => {
                if (options?.force) {
                  return true;
                }
                const knownSnapshot = snapshotBySessionKey.get(session.key);
                return !knownSnapshot || resolveSessionUpdatedAt(session) > knownSnapshot.updatedAt;
              })
              .slice(0, options?.force ? 12 : 8)
          : sessionKey
            ? [{ key: sessionKey, updatedAt: Date.now() }]
            : [];

      if (sessionsToCheck.length === 0) {
        return {
          requestsAdded: 0,
          requestsUpdated: 0,
          requestsSuperseded: 0,
          handoffsRecovered: 0,
          tasksRecovered: 0,
        };
      }

      const discovered = (
        await Promise.all(
          sessionsToCheck.map(async (session) => {
            const history = await gateway.getChatHistory(session.key, 20);
            const sessionAgentId = parseAgentIdFromSessionKey(session.key);
            const normalizedMessages = (history.messages ?? []).map(normalizeMessage);
            const snapshotMessages = createRequirementMessageSnapshots(normalizedMessages, {
              limit: REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT,
            });
            const relatedTask = (activeCompany.tasks ?? []).find((task) => task.sessionKey === session.key);
            const discoveredHandoffs = buildHandoffRecords({
              sessionKey: session.key,
              messages: normalizedMessages,
              company: activeCompany,
              currentAgentId: sessionAgentId,
              relatedTask,
            });
            const discoveredRequests = buildRequestRecords({
              sessionKey: session.key,
              messages: normalizedMessages,
              handoffs: discoveredHandoffs,
              relatedTask,
            });

            const artifactChecks: RequirementArtifactCheck[] = (
              await Promise.all(
                extractArtifactPathsFromMessages(normalizedMessages)
                  .slice(-2)
                  .map(async (absolutePath) => {
                    const mirroredArtifact = findArtifactMirrorRecord(absolutePath, activeArtifacts);
                    if (mirroredArtifact) {
                      return {
                        path: absolutePath,
                        exists: mirroredArtifact.status !== "archived",
                      } satisfies RequirementArtifactCheck;
                    }

                    const parsed = parseAgentFileReference(absolutePath);
                    if (!parsed || !providerCapabilities.agentFiles) {
                      return null;
                    }
                    try {
                      const result = await gateway.getAgentFile(parsed.agentId, parsed.name);
                      return {
                        path: absolutePath,
                        exists: !result.file.missing,
                      } satisfies RequirementArtifactCheck;
                    } catch {
                      return {
                        path: absolutePath,
                        exists: false,
                      } satisfies RequirementArtifactCheck;
                    }
                  }),
              )
            ).filter((item): item is RequirementArtifactCheck => Boolean(item));

            return {
              handoffs: discoveredHandoffs,
              requests: discoveredRequests,
              snapshot:
                sessionAgentId && companyAgentIds.has(sessionAgentId)
                  ? ({
                      agentId: sessionAgentId,
                      sessionKey: session.key,
                      updatedAt:
                        normalizedMessages.reduce((latest, message) => {
                          const timestamp = typeof message.timestamp === "number" ? message.timestamp : 0;
                          return Math.max(latest, timestamp);
                        }, session.updatedAt ?? 0) || Date.now(),
                      messages: snapshotMessages,
                      artifactChecks,
                    } satisfies RequirementSessionSnapshot)
                  : null,
            };
          }),
        )
      ).flatMap((item) => [item]);

      const nextSnapshots: RequirementSessionSnapshot[] = discovered.flatMap((item) =>
        item.snapshot ? [item.snapshot] : [],
      );
      setCompanySessionSnapshots((previous) => {
        const merged = new Map(previous.map((snapshot) => [snapshot.sessionKey, snapshot] as const));
        nextSnapshots.forEach((snapshot) => {
          const current = merged.get(snapshot.sessionKey);
          if (!current || snapshot.updatedAt >= current.updatedAt) {
            merged.set(snapshot.sessionKey, snapshot);
          }
        });
        return [...merged.values()]
          .filter((snapshot) => activeSessionKeys.has(snapshot.sessionKey))
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .slice(0, 12);
      });

      const mergedHandoffs = uniqueHandoffList([
        ...(activeCompany.handoffs ?? []),
        ...discovered.flatMap((item) => item.handoffs),
      ]);
      const discoveredRequests = discovered.flatMap((item) => item.requests);
      const { companyPatch, summary } = reconcileCompanyCommunication(
        {
          ...activeCompany,
          handoffs: mergedHandoffs,
        },
        discoveredRequests,
        Date.now(),
      );
      const hasChanges =
        summary.requestsAdded > 0 ||
        summary.requestsUpdated > 0 ||
        summary.requestsSuperseded > 0 ||
        summary.handoffsRecovered > 0 ||
        summary.tasksRecovered > 0 ||
        mergedHandoffs.length !== (activeCompany.handoffs ?? []).length;

      if (hasChanges) {
        await updateCompany({
          ...companyPatch,
          handoffs: companyPatch.handoffs ?? mergedHandoffs,
        });
      }

      return summary;
    },
    [activeArtifacts, activeCompany, providerCapabilities.agentFiles, sessionKey, updateCompany],
  );

  const sessionProgressEvents = useMemo(
    () =>
      buildSessionProgressEvents({
        messages,
        company: activeCompany,
        ownerLabel: focusSummary.ownerLabel,
        // 1v1 会话里的正常 assistant 回复应该留在正文中，而不是塞进“最近回执”。
        includeOwnerAssistantEvents: isGroup,
      }),
    [activeCompany, focusSummary.ownerLabel, isGroup, messages],
  );
  const progressSignalEvents = useMemo(() => {
    const merged = [...localProgressEvents, ...sessionProgressEvents].sort(
      (left, right) => right.timestamp - left.timestamp,
    );
    const deduped = new Map<string, FocusProgressEvent>();
    for (const event of merged) {
      const key = `${event.title}:${event.summary}:${event.actorLabel}`;
      if (!deduped.has(key)) {
        deduped.set(key, event);
      }
    }
    return [...deduped.values()].slice(0, 5);
  }, [localProgressEvents, sessionProgressEvents]);
  const recentProgressEvents = useMemo(
    () => progressSignalEvents.filter((event) => event.category === "receipt").slice(0, 5),
    [progressSignalEvents],
  );
  const latestProgressEvent = recentProgressEvents[0] ?? progressSignalEvents[0] ?? null;
  const latestBlockingProgressEvent =
    progressSignalEvents.find((event) => event.tone === "rose" && event.actorAgentId) ?? null;
  const collaborationTimeline = useMemo(() => {
    if (!activeCompany || !structuredTaskPreview) {
      return [];
    }

    return structuredTaskPreview.steps.slice(0, 5).map((step, index) => {
      const assigneeAgentId = resolveStepAssigneeAgentId(step, activeCompany.employees);
      const assigneeLabel = assigneeAgentId
        ? formatAgentLabel(activeCompany, assigneeAgentId)
        : step.assignee?.replace(/^@/, "") || "待分配";
      const latestAgentProgress = assigneeAgentId
        ? progressSignalEvents.find((event) => event.actorAgentId === assigneeAgentId)
        : null;
      const relatedRequest = assigneeAgentId
        ? requestPreview.find((request) => request.toAgentIds.includes(assigneeAgentId))
        : null;
      const relatedHandoff = assigneeAgentId
        ? handoffPreview.find((handoff) => handoff.toAgentIds.includes(assigneeAgentId))
        : null;

      const feedback =
        latestAgentProgress?.summary ||
        relatedRequest?.responseSummary ||
        relatedHandoff?.summary ||
        null;

      const statusLabel =
        step.status === "done"
          ? "已完成"
          : latestAgentProgress?.tone === "rose"
            ? "执行失败"
            : step.status === "wip"
              ? "执行中"
              : index === 0 || structuredTaskPreview.steps[index - 1]?.status === "done"
                ? "待处理"
                : "等待前一步";

      const tone: FocusProgressTone =
        step.status === "done"
          ? "emerald"
          : latestAgentProgress?.tone === "rose"
            ? "rose"
            : step.status === "wip"
              ? "indigo"
              : "amber";

      return {
        id: `${structuredTaskPreview.id}:${index}`,
        title: summarizeStepLabel(step) ?? step.text,
        assigneeAgentId,
        assigneeLabel,
        statusLabel,
        tone,
        feedback,
        isCurrent: step.status !== "done" && !structuredTaskPreview.steps.slice(0, index).some((item) => item.status !== "done"),
      };
    });
  }, [activeCompany, handoffPreview, progressSignalEvents, requestPreview, structuredTaskPreview]);
  const currentTimelineItem =
    collaborationTimeline.find((item) => item.isCurrent) ??
    collaborationTimeline.find((item) => item.statusLabel !== "已完成") ??
    collaborationTimeline[0] ??
    null;

  const focusActions = useMemo(() => {
    const actions: FocusActionButton[] = [];
    const primaryRequest = requestPreview
      .slice()
      .sort((left, right) => {
        const priority = {
          blocked: 0,
          pending: 1,
          acknowledged: 2,
          answered: 3,
          superseded: 4,
        } as const;
        const byPriority = priority[left.status] - priority[right.status];
        if (byPriority !== 0) {
          return byPriority;
        }
        return right.updatedAt - left.updatedAt;
      })[0];

    if (activeCompany && latestBlockingProgressEvent?.actorAgentId) {
      const blockerLabel = formatAgentLabel(activeCompany, latestBlockingProgressEvent.actorAgentId);
      actions.push({
        id: `unstick:${latestBlockingProgressEvent.actorAgentId}:${latestBlockingProgressEvent.timestamp}`,
        label: `追 ${blockerLabel} 继续排查`,
        description: `${blockerLabel} 刚回传了失败/阻塞结果，直接让他继续排查并给出下一步。`,
        kind: "message",
        tone: "primary",
        targetAgentId: latestBlockingProgressEvent.actorAgentId,
        message: `你刚才回传的执行结果仍未完成。请不要只汇报状态，直接继续排查并只回复：1. 当前阻塞点 2. 你准备怎么处理 3. 如果需要我介入，请明确指出我要做什么。最近回传：${latestBlockingProgressEvent.summary}${latestBlockingProgressEvent.detail ? `；补充：${latestBlockingProgressEvent.detail}` : ""}`,
      });
      actions.push({
        id: `open-blocker:${latestBlockingProgressEvent.actorAgentId}`,
        label: `打开 ${blockerLabel} 会话`,
        description: `直接进入 ${blockerLabel} 会话，查看失败细节并继续处理。`,
        kind: "navigate",
        tone: "secondary",
        href: `/chat/${encodeURIComponent(latestBlockingProgressEvent.actorAgentId)}`,
      });
    }

    if (takeoverPack) {
      actions.push({
        id: "copy-takeover-pack",
        label: "复制接管包",
        description: "这条链路已经无法自动闭环，先把完整接管信息复制出来继续处理。",
        kind: "copy",
        tone: "primary",
      });
    }

    if (activeCompany && nextOpenTaskStep && nextOpenTaskStepLabel && nextOpenTaskStepAgentId) {
      const assigneeLabel = formatAgentLabel(activeCompany, nextOpenTaskStepAgentId);
      const sameAsCurrentSession = nextOpenTaskStepAgentId === targetAgentId;
      const actionContext = [
        `当前步骤：${nextOpenTaskStepLabel}`,
        focusSummary.currentWork,
        focusSummary.blockReason ? `当前卡点：${focusSummary.blockReason}` : null,
        `下一步：${focusSummary.nextStep}`,
      ]
        .filter((value): value is string => Boolean(value))
        .join("；");
      actions.push({
        id: `nudge-step:${nextOpenTaskStepAgentId}:${nextOpenTaskStepLabel}`,
        label: sameAsCurrentSession
          ? `让 ${assigneeLabel} 继续 ${nextOpenTaskStepLabel}`
          : `催 ${assigneeLabel} 处理${nextOpenTaskStepLabel}`,
        description: sameAsCurrentSession
          ? `会直接让 ${assigneeLabel} 根据当前状态继续执行，而不是停在汇报。`
          : `会直接向 ${assigneeLabel} 发送当前步骤的催办指令。`,
        kind: "message",
        tone: "primary",
        targetAgentId: nextOpenTaskStepAgentId,
        message: `请立即处理「${nextOpenTaskStepLabel}」。${actionContext}。完成后请明确回复“已完成”并附结果摘要；如果仍阻塞，请直接说明原因。`,
      });
      if (!sameAsCurrentSession) {
        actions.push({
          id: `open-step:${nextOpenTaskStepAgentId}`,
          label: `打开 ${assigneeLabel} 会话`,
          description: `直接进入 ${assigneeLabel} 的会话，查看细节或手动补充指令。`,
          kind: "navigate",
          tone: "secondary",
          href: `/chat/${encodeURIComponent(nextOpenTaskStepAgentId)}`,
        });
      }
    } else if (activeCompany && primaryRequest) {
      const requestResponderId =
        primaryRequest.status === "answered"
          ? primaryRequest.fromAgentId ?? structuredTaskPreview?.ownerAgentId ?? null
          : primaryRequest.toAgentIds[0] ?? null;

      if (requestResponderId) {
        const targetLabel = formatAgentLabel(activeCompany, requestResponderId);
        const requestTitle =
          /^(紧急|当前任务|任务|问题|同步|继续)$/u.test(primaryRequest.title.trim())
            ? primaryRequest.responseSummary || primaryRequest.summary || primaryRequest.title
            : primaryRequest.title;
        const requestContext = [
          `当前请求：${requestTitle}`,
          focusSummary.currentWork,
          primaryRequest.responseSummary ? `最近结果：${primaryRequest.responseSummary}` : null,
          focusSummary.blockReason ? `当前卡点：${focusSummary.blockReason}` : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join("；");
        actions.push({
          id: `nudge-request:${requestResponderId}:${primaryRequest.id}`,
          label:
            primaryRequest.status === "answered"
              ? `催 ${targetLabel} 接住结果`
              : `催 ${targetLabel} 回复`,
          description:
            primaryRequest.status === "answered"
              ? `对方已经给出结果，现在要提醒 ${targetLabel} 接住结果并继续推进。`
              : `当前链路在等 ${targetLabel} 的明确回复。`,
          kind: "message",
          tone: "primary",
          targetAgentId: requestResponderId,
          message:
            primaryRequest.status === "answered"
              ? `最新结果已经回传，请你现在直接继续推进。${requestContext}。请不要只汇报状态，直接说明你现在要做什么并继续执行。`
              : `请优先回复「${requestTitle}」。${requestContext}。请直接给出结果摘要；如果仍阻塞，请明确说明原因。`,
        });
        actions.push({
          id: `open-request:${requestResponderId}`,
          label: `打开 ${targetLabel} 会话`,
          description: `直接进入 ${targetLabel} 的会话，人工确认这条链路到底卡在哪。`,
          kind: "navigate",
          tone: "secondary",
          href: `/chat/${encodeURIComponent(requestResponderId)}`,
        });
      }
    }

    if (!takeoverPack && sessionKey && targetSessionKey === null) {
      actions.push({
        id: `continue-current:${targetAgentId ?? sessionKey}`,
        label: `让 ${focusSummary.ownerLabel} 继续推进`,
        description: "如果你不想切会话，可以直接让当前负责人根据现状继续执行，而不是继续汇报。",
        kind: "message",
        tone: "ghost",
        targetAgentId: targetAgentId ?? undefined,
        message: `请不要停留在状态汇报，直接继续推进当前链路。当前情况：${focusSummary.currentWork}。当前卡点：${focusSummary.blockReason ?? "暂无明确阻塞"}。下一步：${focusSummary.nextStep}。请执行后给出结果。`,
      });
    }

    if (activeCompany && (summaryAlertCount > 0 || handoffPreview.length > 0 || requestPreview.length > 0)) {
      actions.push({
        id: "recover-communication",
        label: "同步当前阻塞",
        description: "重新扫描公司会话，把已经回复但还没回写到主链的结果同步回来。",
        kind: "recover",
        tone: "secondary",
      });
    }

    return dedupeFocusActions(actions).slice(0, 4);
  }, [
    activeCompany,
    focusSummary.blockReason,
    focusSummary.currentWork,
    focusSummary.nextStep,
    focusSummary.ownerLabel,
    handoffPreview.length,
    nextOpenTaskStep,
    nextOpenTaskStepAgentId,
    nextOpenTaskStepLabel,
    requestPreview,
    sessionKey,
    structuredTaskPreview?.ownerAgentId,
    summaryAlertCount,
    takeoverPack,
    targetAgentId,
    targetSessionKey,
    latestBlockingProgressEvent,
  ]);

  const collaborationLifecycle = useMemo<CollaborationLifecycleEntry[]>(() => {
    const lifecycleSourceEvents = recentProgressEvents.length > 0 ? recentProgressEvents : progressSignalEvents;
    const progressEntries = lifecycleSourceEvents
      .slice()
      .reverse()
      .map((event, index, array) => ({
        id: event.id,
        timestamp: event.timestamp,
        title: formatLifecycleEventTitle(event),
        summary: formatLifecycleEventSummary(event),
        detail: event.detail,
        actorLabel: event.actorLabel,
        actorAgentId: event.actorAgentId,
        tone: event.tone,
        kind: event.source === "local" ? ("action" as const) : ("feedback" as const),
        isCurrent: index === array.length - 1,
      }));

    if (progressEntries.length > 0) {
      return progressEntries.slice(-5);
    }

    if (!currentTimelineItem) {
      return [];
    }

    return [
      {
        id: `${currentTimelineItem.id}:state`,
        timestamp: previewTimestamp,
        title: currentTimelineItem.title,
        summary: currentTimelineItem.feedback ?? "当前步骤还没完整闭环，需要继续追这一步。",
        actorLabel: currentTimelineItem.assigneeLabel,
        actorAgentId: currentTimelineItem.assigneeAgentId ?? undefined,
        tone: currentTimelineItem.tone,
        kind: "state" as const,
        isCurrent: true,
      },
    ];
  }, [currentTimelineItem, previewTimestamp, progressSignalEvents, recentProgressEvents]);

  const genericBlockerAction =
    focusActions.find((action) => action.kind === "navigate" && action.targetAgentId) ??
    focusActions.find((action) => action.kind === "navigate") ??
    null;
  const genericNudgingAction =
    focusActions.find((action) => action.kind === "message" && action.targetAgentId) ??
    focusActions.find((action) => action.kind === "recover") ??
    focusActions[0] ??
    null;

  const workbenchTone: FocusProgressTone =
    latestBlockingProgressEvent?.tone ??
    currentTimelineItem?.tone ??
    (focusSummary.userAction ? "rose" : sessionExecution.actionable ? "amber" : "slate");
  const workbenchOwnerAgentId =
    latestBlockingProgressEvent?.actorAgentId ??
    currentTimelineItem?.assigneeAgentId ??
    genericBlockerAction?.targetAgentId ??
    genericNudgingAction?.targetAgentId ??
    null;
  const workbenchOwnerLabel =
    workbenchOwnerAgentId && activeCompany
      ? formatAgentLabel(activeCompany, workbenchOwnerAgentId)
      : currentTimelineItem?.assigneeLabel ?? focusSummary.ownerLabel;
  const workbenchStage = currentTimelineItem?.title ?? focusSummary.currentWork;
  const workbenchStatusLabel =
    latestBlockingProgressEvent
      ? "已阻塞"
      : currentTimelineItem?.statusLabel ?? focusSummary.headline;
  const workbenchHeadline =
    latestBlockingProgressEvent && workbenchOwnerLabel
      ? `当前卡点在 ${workbenchOwnerLabel}`
      : currentTimelineItem?.assigneeLabel
        ? `当前流转到 ${currentTimelineItem.assigneeLabel}`
        : focusSummary.headline;
  const workbenchSummary =
    latestBlockingProgressEvent?.summary ??
    focusSummary.blockReason ??
    latestProgressEvent?.summary ??
    focusSummary.currentWork;
  const workbenchActionHint =
    genericBlockerAction?.description ??
    genericNudgingAction?.description ??
    focusSummary.userAction ??
    focusSummary.nextStep;
  const workbenchOpenAction =
    genericBlockerAction ??
    (workbenchOwnerAgentId && workbenchOwnerAgentId !== targetAgentId
      ? {
          id: `open-workbench:${workbenchOwnerAgentId}`,
          label: `打开 ${workbenchOwnerLabel} 会话`,
          description: `直接进入 ${workbenchOwnerLabel} 的会话继续处理当前卡点。`,
          kind: "navigate" as const,
          tone: "secondary" as const,
          targetAgentId: workbenchOwnerAgentId,
          href: `/chat/${encodeURIComponent(workbenchOwnerAgentId)}`,
        }
      : null);
  const requirementCurrentParticipant =
    requirementOverview?.participants.find((participant) => participant.isCurrent) ?? null;
  const strategicDirectParticipantView = useMemo(
    () =>
      buildStrategicDirectParticipantView({
        company: activeCompany,
        overview: requirementOverview,
        targetAgentId,
        isCeoSession,
      }),
    [activeCompany, isCeoSession, requirementOverview, targetAgentId],
  );
  const displayHeadline = isRequirementBootstrapPending
    ? "正在恢复当前需求"
    : isFreshConversation
    ? "新的 CEO 对话已开始"
    : strategicDirectParticipantView?.headline
      ? strategicDirectParticipantView.headline
    : requirementOverview?.headline ?? workbenchHeadline;
  const displayOwnerLabel = isRequirementBootstrapPending
    ? "系统"
    : isFreshConversation
    ? emp?.nickname ?? "CEO"
    : strategicDirectParticipantView?.ownerLabel
      ? strategicDirectParticipantView.ownerLabel
    : requirementOverview?.currentOwnerLabel ?? workbenchOwnerLabel;
  const displayStage = isRequirementBootstrapPending
    ? "正在同步公司会话"
    : isFreshConversation
    ? "等待你的新指令"
    : strategicDirectParticipantView?.stage
      ? strategicDirectParticipantView.stage
    : requirementOverview?.currentStage ?? workbenchStage;
  const displaySummary = isRequirementBootstrapPending
    ? "刷新后会先从公司范围的最新会话重建当前主线，避免先闪回旧章节再跳到新章节。"
    : isFreshConversation
    ? "这是一段新的空白对话，不会自动恢复旧任务。直接告诉 CEO 你现在的新需求即可。"
    : strategicDirectParticipantView?.summary
      ? strategicDirectParticipantView.summary
    : requirementOverview?.summary ?? workbenchSummary;
  const displayActionHint = isRequirementBootstrapPending
    ? "稍等片刻；如果长时间没有恢复，再手动点“同步当前阻塞”。"
    : isFreshConversation
    ? "直接提这次的新需求；如果你是想继续旧任务，再去工作看板或运营大厅查看当前主线。"
    : strategicDirectParticipantView?.actionHint
      ? strategicDirectParticipantView.actionHint
    : requirementOverview?.nextAction ?? workbenchActionHint;
  const displayStatusLabel = isRequirementBootstrapPending
    ? "恢复中"
    : isFreshConversation
    ? "新会话"
    : strategicDirectParticipantView?.statusLabel
      ? strategicDirectParticipantView.statusLabel
    : requirementCurrentParticipant?.statusLabel ?? workbenchStatusLabel;
  const displayTone: FocusProgressTone = isRequirementBootstrapPending
    ? "slate"
    : isFreshConversation
    ? "slate"
    : strategicDirectParticipantView?.tone
      ? strategicDirectParticipantView.tone
    : requirementCurrentParticipant?.tone === "rose"
      ? "rose"
      : requirementCurrentParticipant?.tone === "amber"
        ? "amber"
        : requirementCurrentParticipant?.tone === "emerald"
          ? "emerald"
          : requirementCurrentParticipant?.tone === "blue" ||
                requirementCurrentParticipant?.tone === "violet"
            ? "indigo"
            : workbenchTone;
  const requirementRoomSummary = useMemo(() => {
    if (!isGroup) {
      return null;
    }

    const roomMessages = (
      activeRequirementRoom
        ? convertRequirementRoomRecordToChatMessages(activeRequirementRoom)
        : messages
    ).filter((message) => message.role === "user" || message.role === "assistant");
    const latestDispatch = [...roomMessages].reverse().find(
      (message) =>
        message.role === "user" &&
        Array.isArray(message.roomAudienceAgentIds) &&
        message.roomAudienceAgentIds.length > 0,
    ) ?? null;
    const latestDispatchAt = typeof latestDispatch?.timestamp === "number" ? latestDispatch.timestamp : 0;
    const dispatchTargets =
      latestDispatch && Array.isArray(latestDispatch.roomAudienceAgentIds)
        ? latestDispatch.roomAudienceAgentIds
        : requirementRoomTargetAgentIds;
    const dispatchTargetLabels = dispatchTargets
      .map((agentId) => activeCompany?.employees.find((employee) => employee.agentId === agentId)?.nickname ?? agentId)
      .filter(Boolean);
    const repliesAfterDispatch = roomMessages.filter((message) => {
      if (message.role !== "assistant") {
        return false;
      }
      const timestamp = typeof message.timestamp === "number" ? message.timestamp : 0;
      return latestDispatchAt > 0 ? timestamp >= latestDispatchAt : true;
    });
    const respondedAgentIds = [...new Set(
      repliesAfterDispatch
        .map((message) =>
          typeof message.roomAgentId === "string" && message.roomAgentId.length > 0
            ? message.roomAgentId
            : null,
        )
        .filter((agentId): agentId is string => Boolean(agentId)),
    )];
    const pendingAgentIds = dispatchTargets.filter((agentId) => !respondedAgentIds.includes(agentId));
    const pendingLabels = pendingAgentIds
      .map((agentId) => activeCompany?.employees.find((employee) => employee.agentId === agentId)?.nickname ?? agentId)
      .filter(Boolean);
    const latestReply = repliesAfterDispatch[repliesAfterDispatch.length - 1] ?? null;
    const latestReplyText = extractTextFromMessage(latestReply ?? undefined);
    const latestReplySummary = latestReplyText ? summarizeProgressText(latestReplyText) : null;
    const latestReplyAgentId =
      latestReply && typeof latestReply.roomAgentId === "string" ? latestReply.roomAgentId : null;
    const latestReplyLabel =
      latestReplyAgentId && activeCompany
        ? formatAgentLabel(activeCompany, latestReplyAgentId)
        : "团队成员";
    const respondedLabels = respondedAgentIds
      .map((agentId) => activeCompany?.employees.find((employee) => employee.agentId === agentId)?.nickname ?? agentId)
      .filter(Boolean);
    const roomOwnerAgentId =
      activeRequirementRoom?.ownerActorId ??
      activeRequirementRoom?.ownerAgentId ??
      parseAgentIdFromSessionKey(effectiveGroupSessionKey ?? "") ??
      activeCompany?.employees.find((employee) => employee.metaRole === "ceo")?.agentId ??
      targetAgentId ??
      null;
    const roomOwnerLabel =
      roomOwnerAgentId && activeCompany
        ? formatAgentLabel(activeCompany, roomOwnerAgentId)
        : "负责人";
    const roomOwnerOpenAction =
      roomOwnerAgentId
        ? {
            id: `open-room-owner:${roomOwnerAgentId}`,
            label: `打开 ${roomOwnerLabel} 会话`,
            description: `直接进入 ${roomOwnerLabel} 的 1v1 会话继续收口当前团队结果。`,
            kind: "navigate" as const,
            tone: "secondary" as const,
            targetAgentId: roomOwnerAgentId,
            href: `/chat/${encodeURIComponent(roomOwnerAgentId)}`,
          }
        : null;

    if (!latestDispatch) {
      return {
        headline: "房间已建立，等待第一条指令",
        statusLabel: "待派发",
        tone: "slate" as const,
        ownerAgentId: null,
        ownerLabel: "负责人待定",
        stage: "需求团队房间",
        summary: "这个房间还没有派发新的团队指令。你可以直接在这里 @成员名 发起协作。",
        actionHint: "输入 @成员名 可以定向派发；不写 @ 默认发给当前 baton，必要时再切到群发。",
        topSummaryItems: [
          {
            id: "members",
            label: "房间成员",
            value: `${requirementRoomSessions.length} 人`,
          },
        ],
        primaryAction: null,
        openAction: null,
      };
    }

    if (pendingLabels.length > 0) {
      const primaryPendingAgentId = pendingAgentIds[0] ?? null;
      return {
        headline: `等待 ${pendingLabels.join("、")} 回复`,
        statusLabel: "等待回执",
        tone: "amber" as const,
        ownerAgentId: primaryPendingAgentId,
        ownerLabel: pendingLabels[0] ?? "待回复成员",
        stage: "房间派发已发出",
        summary: `最近一条房间指令已经发给 ${dispatchTargetLabels.join("、")}，当前还在等待 ${pendingLabels.join("、")} 回应。`,
        actionHint: "现在先等房间成员回执；如果长时间没回，再继续 @ 对应成员催办。",
        topSummaryItems: [
          {
            id: "dispatch",
            label: "最近派发",
            value: dispatchTargetLabels.join("、"),
          },
          {
            id: "waiting",
            label: "当前等待",
            value: pendingLabels.join("、"),
          },
        ],
        openAction:
          primaryPendingAgentId && primaryPendingAgentId !== targetAgentId
            ? {
                id: `open-room-pending:${primaryPendingAgentId}`,
                label: `打开 ${(activeCompany && formatAgentLabel(activeCompany, primaryPendingAgentId)) || pendingLabels[0]} 会话`,
                description: "直接进入当前等待成员的 1v1 会话确认有没有卡住。",
                kind: "navigate" as const,
                tone: "secondary" as const,
                targetAgentId: primaryPendingAgentId,
                href: `/chat/${encodeURIComponent(primaryPendingAgentId)}`,
            }
            : null,
        primaryAction: null,
      };
    }

    const closureSummary =
      latestReplySummary?.summary ??
      (latestReplyText ? truncateText(latestReplyText, 160) : "团队成员已经给出新的结论反馈。");
    const closurePrimaryAction =
      roomOwnerAgentId
        ? {
            id: `sync-room-owner:${roomOwnerAgentId}:${latestDispatchAt}`,
            label: `同步给 ${roomOwnerLabel}`,
            description: `把本轮团队回执直接同步给 ${roomOwnerLabel}，由负责人判断下一棒。`,
            kind: "message" as const,
            tone: "primary" as const,
            targetAgentId: roomOwnerAgentId,
            preferResolvedSession: true,
            message: `需求团队房间《${groupTitle}》本轮已经收到回执。最近派发：${dispatchTargetLabels.join("、")}。已回复：${respondedLabels.join("、")}。最新反馈来自 ${latestReplyLabel}：${closureSummary}。请你现在先不要直接跳到执行下一阶段，而是先给我阶段反馈和下一阶段计划，并严格按这个格式回复：\n【本阶段结论】已完成 / 未完成\n【阶段总结】一句话总结本阶段结果、当前判断和你建议的方向\n【风险与问题】列出我还需要关注的风险，没有就写“无”\n【下一阶段计划】\n1. 下一阶段目标\n2. 负责人和关键步骤\n3. 你预计下一次回传给我的结果\n【等待你确认】是`,
          }
        : null;

    return {
      headline: `团队已回复，等待 ${roomOwnerLabel} 收口`,
      statusLabel: "待负责人收口",
      tone: "amber" as const,
      ownerAgentId: roomOwnerAgentId,
      ownerLabel: roomOwnerLabel,
      stage: "团队回执已到齐",
      summary: `${respondedLabels.join("、")} 已经给出反馈。${closureSummary}`,
      actionHint: `现在不要继续盯成员状态，先让 ${roomOwnerLabel} 汇总判断并推进下一棒。`,
      topSummaryItems: [
        {
          id: "dispatch",
          label: "最近派发",
          value: dispatchTargetLabels.join("、"),
        },
        {
          id: "replied",
          label: "已回复",
          value: respondedLabels.join("、"),
        },
        {
          id: "owner",
          label: "待收口",
          value: roomOwnerLabel,
        },
      ],
      primaryAction: closurePrimaryAction,
      openAction: roomOwnerOpenAction,
    };
  }, [
    activeCompany,
    activeRequirementRoom,
    groupTitle,
    isGroup,
    messages,
    requirementRoomSessions,
    requirementRoomTargetAgentIds,
    targetAgentId,
    targetSessionKey,
  ]);
  const displayOpenAction = isGroup
    ? requirementRoomSummary?.openAction ?? null
    : strategicDirectParticipantView?.nextAgentId && strategicDirectParticipantView.nextAgentId !== targetAgentId
      ? {
          id: `open-strategic-owner:${strategicDirectParticipantView.nextAgentId}`,
          label: `打开 ${
            activeCompany
              ? formatAgentLabel(activeCompany, strategicDirectParticipantView.nextAgentId)
              : strategicDirectParticipantView.nextLabel
          } 会话`,
          description: `直接进入 ${strategicDirectParticipantView.nextLabel} 的会话继续收口当前战略需求。`,
          kind: "navigate" as const,
          tone: "secondary" as const,
          targetAgentId: strategicDirectParticipantView.nextAgentId,
          href: `/chat/${encodeURIComponent(strategicDirectParticipantView.nextAgentId)}`,
        }
    : requirementOverview?.currentOwnerAgentId
      ? requirementOverview.currentOwnerAgentId !== targetAgentId
        ? {
            id: `open-requirement:${requirementOverview.currentOwnerAgentId}`,
            label: `打开 ${requirementOverview.currentOwnerLabel} 会话`,
            description: `直接进入 ${requirementOverview.currentOwnerLabel} 的会话继续处理当前主线。`,
            kind: "navigate" as const,
            tone: "secondary" as const,
            targetAgentId: requirementOverview.currentOwnerAgentId,
            href: `/chat/${encodeURIComponent(requirementOverview.currentOwnerAgentId)}`,
          }
        : null
      : workbenchOpenAction;
  const shouldUseTaskPlanPrimaryView = Boolean(
    isChapterExecutionRequirement &&
      taskPlanOverview?.currentStep &&
      requirementCurrentParticipant &&
      requirementProgressGroups &&
      requirementProgressGroups.working.length === 0 &&
      ["已确认", "已交付待下游", "已回复", "已冻结待命"].includes(requirementCurrentParticipant.statusLabel),
  );
  const effectiveOwnerAgentId =
    isGroup
      ? requirementRoomSummary?.ownerAgentId ?? null
      : strategicDirectParticipantView?.ownerAgentId
        ? strategicDirectParticipantView.ownerAgentId
      : shouldUseTaskPlanPrimaryView && taskPlanOverview?.currentStep?.assigneeAgentId
      ? taskPlanOverview.currentStep.assigneeAgentId
      : requirementOverview?.currentOwnerAgentId ?? workbenchOwnerAgentId;
  const effectiveOwnerLabel =
    isGroup
      ? requirementRoomSummary?.ownerLabel ?? "负责人待定"
      : shouldUseTaskPlanPrimaryView && taskPlanOverview?.currentStep
      ? taskPlanOverview.currentStep.assigneeLabel
      : displayOwnerLabel;
  const effectiveStage =
    isGroup
      ? requirementRoomSummary?.stage ?? "需求团队房间"
      : latestStageGate
      ? "等待阶段确认"
      : shouldDispatchPublish
      ? "向 CTO 下发新版发布指令"
      : shouldUseTaskPlanPrimaryView && taskPlanOverview?.currentStep
      ? taskPlanOverview.currentStep.title
      : displayStage;
  const effectiveStatusLabel =
    isGroup
      ? requirementRoomSummary?.statusLabel ?? "待派发"
      : latestStageGate
      ? latestStageGate.statusLabel
      : shouldDispatchPublish
      ? "待派发"
      : shouldAdvanceToNextPhase
        ? "待推进"
        : shouldUseTaskPlanPrimaryView
          ? "待处理"
          : displayStatusLabel;
  const effectiveSummary =
    isGroup
      ? requirementRoomSummary?.summary ?? `当前团队房间：${groupTitle}`
      : latestStageGate
      ? latestStageGate.stageSummary
      : shouldDispatchPublish
      ? "写手、审校、主编都已经完成本轮，当前只差 CEO 把新版终审通过结果正式转给 CTO。"
      : shouldAdvanceToNextPhase
      ? "重开准备动作已经完成，当前不该继续盯写手或冻结节点，应该由 CEO 发起新版审校 -> 终审 -> 发布链。"
      : shouldUseTaskPlanPrimaryView && taskPlanOverview?.currentStep
      ? `${taskPlanOverview.currentStep.assigneeLabel} 还没接住「${taskPlanOverview.currentStep.title}」这一步。`
      : displaySummary;
  const effectiveActionHint =
    isGroup
      ? requirementRoomSummary?.actionHint ?? "输入 @成员名 可以定向派发；不写 @ 默认发给当前 baton，必要时再切到群发。"
      : latestStageGate
      ? latestStageGate.status === "waiting_confirmation"
        ? "先和 CEO 讨论这份阶段总结和下一阶段计划；确认之后再正式进入下一阶段。"
        : "你已经确认过 plan。现在先等 CEO 按已确认计划启动；只有长时间没有新回执时，再补发提醒。"
      : shouldDispatchPublish
      ? "现在通知 CTO 立即发布新版第 2 章，并要求他回传是否成功、发布链接和审核状态。"
      : shouldAdvanceToNextPhase
      ? "现在该由 CEO 继续推进：先把 ch02_clean.md 发给审校，再转主编终审，最后再让 CTO 发布。"
      : shouldUseTaskPlanPrimaryView && taskPlanOverview?.currentStep
      ? `先打开 ${taskPlanOverview.currentStep.assigneeLabel} 会话，推进「${taskPlanOverview.currentStep.title}」。`
      : displayActionHint;
  const effectiveHeadline =
    isGroup
      ? requirementRoomSummary?.headline ?? `需求团队: ${groupTitle}`
      : isRequirementBootstrapPending
      ? "正在恢复当前需求"
      : isFreshConversation
      ? "等待你的新指令"
      : latestStageGate
      ? latestStageGate.status === "waiting_confirmation"
        ? "等待你确认下一阶段"
        : "计划已确认，等待 CEO 启动"
      : shouldDispatchPublish
      ? "当前卡点在 CEO"
      : shouldAdvanceToNextPhase
      ? "当前应由 CEO 发起下一阶段"
      : shouldUseTaskPlanPrimaryView && taskPlanOverview?.currentStep
      ? `当前流转到 ${taskPlanOverview.currentStep.assigneeLabel}`
      : displayHeadline;
  const effectiveTone: FocusProgressTone =
    isGroup
      ? requirementRoomSummary?.tone ?? "slate"
      : isFreshConversation
      ? "slate"
      : latestStageGate
      ? latestStageGate.status === "waiting_confirmation"
        ? "amber"
        : "indigo"
      : shouldAdvanceToNextPhase || shouldUseTaskPlanPrimaryView ? "amber" : displayTone;
  const publishDispatchOpenAction =
    (shouldDispatchPublish || shouldDirectToTechDispatch) &&
    publishDispatchTargetAgentId !== targetAgentId
      ? {
          id: `open-dispatch:${publishDispatchTargetAgentId}`,
          label: `打开 ${publishDispatchTargetLabel} 会话`,
          description: `直接进入 ${publishDispatchTargetLabel} 的会话，确认新版发布有没有真正开始执行。`,
          kind: "navigate" as const,
          tone: "secondary" as const,
          targetAgentId: publishDispatchTargetAgentId,
          href: `/chat/${encodeURIComponent(publishDispatchTargetAgentId)}`,
        }
      : null;
  const effectiveOpenAction =
    isRequirementBootstrapPending || isFreshConversation
      ? null
      : publishDispatchOpenAction ??
    (shouldUseTaskPlanPrimaryView && effectiveOwnerAgentId && effectiveOwnerAgentId !== targetAgentId
      ? {
          id: `open-effective:${effectiveOwnerAgentId}`,
          label: `打开 ${effectiveOwnerLabel} 会话`,
          description: `直接进入 ${effectiveOwnerLabel} 的会话继续处理当前待办。`,
          kind: "navigate" as const,
          tone: "secondary" as const,
          targetAgentId: effectiveOwnerAgentId,
          href: `/chat/${encodeURIComponent(effectiveOwnerAgentId)}`,
        }
      : displayOpenAction);
  const stagePlanningAction =
    isCeoSession &&
    !isGroup &&
    !latestStageGate &&
    (shouldAdvanceToNextPhase || shouldDispatchPublish || shouldDirectToTechDispatch)
      ? {
          id: `stage-plan:${taskPlanOverview?.currentStep?.id ?? requirementOverview?.topicKey ?? "current"}`,
          label: "让 CEO 给阶段反馈和计划",
          description: "先让 CEO 总结本阶段结果并给出下一阶段 plan，等你确认后再正式启动。",
          kind: "message" as const,
          tone: "primary" as const,
          targetAgentId: targetAgentId ?? undefined,
          message: `先不要直接进入下一阶段。请你基于当前结果，先给我阶段反馈和下一阶段计划，并严格按这个格式回复：\n【本阶段结论】已完成 / 未完成\n【阶段总结】一句话总结本阶段产出、结果和当前判断\n【风险与问题】列出仍需我关注的风险，没有就写“无”\n【下一阶段计划】\n1. 下一阶段的目标\n2. 负责人和关键步骤\n3. 你预计下一次回传给我的结果\n【等待你确认】是`,
        }
      : null;
  const stageConfirmAction =
    isCeoSession && !isGroup && latestStageGate?.status === "waiting_confirmation"
      ? {
          id: `stage-confirm:${latestStageGate.sourceTimestamp}`,
          label: "确认进入下一阶段",
          description: "把你的确认明确发给 CEO，让他按当前计划正式启动下一阶段。",
          kind: "message" as const,
          tone: "primary" as const,
          targetAgentId: targetAgentId ?? undefined,
          message: latestStageGate.confirmMessage,
        }
      : null;
  const hasCurrentOwnerWatch = actionWatches.some(
    (watch) => watch.kind === "owner" && watch.sessionKey === (sessionKey ?? targetSessionKey ?? ""),
  );
  const stageLaunchReminderAction =
    isCeoSession &&
    !isGroup &&
    latestStageGate?.status === "confirmed" &&
    !hasCurrentOwnerWatch
      ? {
          id: `stage-launch:${latestStageGate.sourceTimestamp}`,
          label: "催 CEO 启动当前阶段",
          description: "只有 CEO 在收到确认后还没真正启动时，才需要补这一步提醒。",
          kind: "message" as const,
          tone: "secondary" as const,
          targetAgentId: targetAgentId ?? undefined,
          message: latestStageGate.launchMessage,
        }
      : null;
  const advancePhaseAction =
    shouldAdvanceToNextPhase
      ? {
          id: `advance-phase:${taskPlanOverview?.currentStep?.id ?? "current"}`,
          label: shouldDispatchPublish ? "让 CEO 通知 CTO 发布" : "让 CEO 发起下一阶段",
          description: shouldDispatchPublish
            ? "写手、审校、主编都已经完成，这一步只差 CEO 把终审通过结果转给 CTO。"
            : "重开准备已完成，直接进入新版审校 -> 终审 -> 发布，不再停在状态汇报。",
          kind: "message" as const,
          tone: "primary" as const,
          targetAgentId: targetAgentId ?? undefined,
          followupTargetAgentId: shouldDispatchPublish ? publishDispatchTargetAgentId : undefined,
          followupTargetLabel: shouldDispatchPublish ? publishDispatchTargetLabel : undefined,
          message: shouldDispatchPublish
            ? "写手、审校、主编都已经完成新版流程。现在不要再汇总现状，直接把“新版终审通过、准予发布”的结果转给 CTO，要求他立刻发布，并只回复我：1. 是否已下发给 CTO 2. CTO 是否接单 3. 下一次回传会给我什么结果。"
            : "重开准备动作已经完成。现在不要再总结现状，直接进入下一阶段并按这个顺序执行：1. 立即把 ch02_clean.md 发给审校，要求只检查纯正文和非正文污染 2. 审校完成后立刻转主编终审 3. 终审通过后再通知 CTO 发布。先执行第 1 步，并明确回我：是否已发出新版审校指令、发给了谁、下一步等待谁。",
        }
      : null;
  const requirementNudgingAction =
    !shouldUseTaskPlanPrimaryView && requirementOverview?.currentOwnerAgentId && activeCompany
      ? {
          id: `requirement-nudge:${requirementOverview.currentOwnerAgentId}:${requirementOverview.topicKey}`,
          label: `催 ${requirementOverview.currentOwnerLabel} 继续处理`,
          description: requirementOverview.nextAction,
          kind: "message" as const,
          tone: "primary" as const,
          targetAgentId: requirementOverview.currentOwnerAgentId,
          message: `现在主线卡在你这里。当前需求：${requirementOverview.title}。当前判断：${requirementOverview.summary}。请不要只汇报状态，直接继续处理，并明确回复：1. 你已经完成了什么 2. 还差什么 3. 下一次回传时给我什么结果。`,
        }
      : null;
  const nudgingAction =
    isGroup || isFreshConversation
      ? null
      : stageConfirmAction ??
        stagePlanningAction ??
        stageLaunchReminderAction ??
        advancePhaseAction ??
        requirementNudgingAction ??
        genericNudgingAction ??
        null;
  const summaryRecoveryAction = focusActions.find((action) => action.kind === "recover") ?? null;
  const detailActions = useMemo(() => {
    if (isFreshConversation) {
      return [];
    }
    const primaryDetailAction = isGroup ? requirementRoomSummary?.primaryAction ?? effectiveOpenAction : effectiveOpenAction;
    const curated = [
      primaryDetailAction,
      effectiveOpenAction && effectiveOpenAction.id !== primaryDetailAction?.id ? effectiveOpenAction : null,
      nudgingAction && nudgingAction.id !== effectiveOpenAction?.id ? nudgingAction : null,
      summaryRecoveryAction,
    ].filter((action): action is FocusActionButton => Boolean(action));

    if (shouldAdvanceToNextPhase || requirementOverview) {
      return dedupeFocusActions(curated).slice(0, 3);
    }

    return dedupeFocusActions([...curated, ...focusActions]).slice(0, 4);
  }, [
    effectiveOpenAction,
    focusActions,
    isFreshConversation,
    isGroup,
    latestStageGate,
    nudgingAction,
    requirementRoomSummary,
    requirementOverview,
    shouldAdvanceToNextPhase,
    summaryRecoveryAction,
  ]);
  const displayRequirementLifecycleSections = useMemo(() => {
    if (!(isSummaryOpen && summaryPanelView === "owner")) {
      return null;
    }
    if (!requirementLifecycleSections) {
      return null;
    }

    if (!shouldDispatchPublish) {
      return requirementLifecycleSections;
    }

    const coordinatorItem: RequirementParticipantProgress = {
      agentId: targetAgentId ?? "co-ceo",
      nickname: effectiveOwnerLabel,
      role:
        (effectiveOwnerAgentId && activeCompany
          ? formatAgentRole(activeCompany, effectiveOwnerAgentId)
          : null) ?? focusSummary.ownerRole,
      stage: effectiveStage,
      statusLabel: effectiveStatusLabel,
      detail: effectiveSummary,
      updatedAt: Date.now(),
      tone: "amber",
      isBlocking: true,
      isCurrent: true,
    };

    const completedParticipants = requirementOverview?.participants.filter(
      (participant) => participant.agentId !== requirementTechParticipant?.agentId,
    ) ?? [];

    return [
      {
        id: "current",
        title: "当前处理",
        summary: "下游结果已经齐了，现在不是继续盯旧步骤，而是 CEO 要把最新结果正式派到下一棒。",
        items: [coordinatorItem],
      },
      requirementTechParticipant
        ? {
            id: "waiting",
            title: "等待接棒",
            summary: "这一步已经准备好，只差收到新版发布指令就能继续。",
            items: [
              {
                ...requirementTechParticipant,
                detail: "CTO 已冻结待命。只要收到 CEO 的新版发布指令，就应立即执行发布并回传结果。",
                isCurrent: false,
              },
            ],
          }
        : null,
      completedParticipants.length > 0
        ? {
            id: "completed",
            title: "已完成本轮",
            summary: "这些节点本轮已经完成，不用再继续追。",
            items: completedParticipants.map((participant) => ({
              ...participant,
              isCurrent: false,
            })),
          }
        : null,
    ].filter((section): section is NonNullable<typeof section> => Boolean(section));
  }, [
    activeCompany,
    effectiveOwnerAgentId,
    effectiveOwnerLabel,
    effectiveStage,
    effectiveStatusLabel,
    effectiveSummary,
    focusSummary.ownerRole,
    requirementLifecycleSections,
    requirementOverview?.participants,
    isSummaryOpen,
    summaryPanelView,
    shouldDirectToTechDispatch,
    requirementTechParticipant,
    shouldDispatchPublish,
    targetAgentId,
  ]);
  const displayRequirementProgressGroups = useMemo(() => {
    if (!(isSummaryOpen && summaryPanelView === "owner")) {
      return null;
    }
    if (!requirementProgressGroups) {
      return null;
    }

    if (!shouldDispatchPublish) {
      return requirementProgressGroups;
    }

    return {
      working: [],
      waiting: requirementTechParticipant
        ? [
            {
              ...requirementTechParticipant,
              detail: "CTO 已冻结待命，只差收到 CEO 的新版发布指令。",
            },
          ]
        : [],
      completed:
        requirementOverview?.participants.filter(
          (participant) => participant.agentId !== requirementTechParticipant?.agentId,
        ) ?? [],
    };
  }, [
    isSummaryOpen,
    requirementOverview?.participants,
    requirementProgressGroups,
    requirementTechParticipant,
    shouldDispatchPublish,
    summaryPanelView,
  ]);
  const headerStatusBadgeClass = cn(
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
  );
  const displayPlanCurrentStep =
    isRequirementBootstrapPending
      ? null
      : shouldDispatchPublish && taskPlanOverview?.currentStep
      ? {
          ...taskPlanOverview.currentStep,
          title: "通知 CTO 发布新版",
          assigneeLabel: effectiveOwnerLabel,
          assigneeAgentId: effectiveOwnerAgentId,
        }
      : taskPlanOverview?.currentStep ?? null;
  const visibleDispatchTargetAgentId =
    activeCompany &&
    isChapterExecutionRequirement &&
    /当前卡点在 CEO|当前应由 CEO 发起下一阶段/i.test(effectiveHeadline) &&
    /CTO|技术/i.test(`${effectiveStage} ${effectiveSummary} ${effectiveActionHint}`)
      ? activeCompany.employees.find((employee) => employee.metaRole === "cto")?.agentId ?? "co-cto"
      : null;
  const visibleDispatchTargetLabel =
    visibleDispatchTargetAgentId && activeCompany
      ? formatAgentLabel(activeCompany, visibleDispatchTargetAgentId)
      : visibleDispatchTargetAgentId === "co-cto"
        ? "CTO"
        : null;
  // When the live requirement has already converged to "CEO dispatches CTO",
  // keep every surface aligned to that baton instead of falling back to a stale
  // tracker-derived next step.
  const canonicalNextBatonAgentId =
    shouldDispatchPublish
      ? publishDispatchTargetAgentId
      : strategicDirectParticipantView?.nextAgentId
        ? strategicDirectParticipantView.nextAgentId
      : visibleDispatchTargetAgentId ??
        taskPlanOverview?.nextStep?.assigneeAgentId ??
        requirementTeam?.members.find((member) => member.isNext)?.agentId ??
        null;
  const canonicalNextBatonLabel =
    shouldDispatchPublish
      ? publishDispatchTargetLabel
      : strategicDirectParticipantView?.nextLabel
        ? strategicDirectParticipantView.nextLabel
      : visibleDispatchTargetLabel ??
        taskPlanOverview?.nextStep?.assigneeLabel ??
        requirementTeam?.nextBatonLabel ??
        "待确认";
  const displayPlanNextStep =
    isRequirementBootstrapPending
      ? null
      : canonicalNextBatonAgentId &&
    (shouldDispatchPublish || visibleDispatchTargetAgentId === canonicalNextBatonAgentId)
      ? {
          id: shouldDispatchPublish ? "synthetic:cto-publish" : "synthetic:cto-dispatch-fallback",
          title: "执行发布并回传结果",
          assigneeLabel: canonicalNextBatonLabel,
          assigneeAgentId: canonicalNextBatonAgentId,
          status: "pending" as const,
          statusLabel: "待接手",
          detail: shouldDispatchPublish
            ? "收到新版发布指令后，立即执行发布并回传链接/审核状态。"
            : "当前负责人已经收敛到发布口径，下一棒应该交给 CTO 执行并回传结果。",
        }
      : taskPlanOverview?.nextStep ?? null;
  const nextBatonOpenAction =
    canonicalNextBatonAgentId && canonicalNextBatonAgentId !== targetAgentId
      ? {
          id: `open-next:${canonicalNextBatonAgentId}`,
          label: `打开 ${canonicalNextBatonLabel} 会话`,
          description: `直接进入 ${canonicalNextBatonLabel} 的会话，确认下一棒有没有真正接住。`,
          kind: "navigate" as const,
          tone: "secondary" as const,
          targetAgentId: canonicalNextBatonAgentId,
          href: `/chat/${encodeURIComponent(canonicalNextBatonAgentId)}`,
        }
      : null;
  const primaryOpenAction =
    isRequirementBootstrapPending || isFreshConversation
      ? null
      : isGroup
      ? requirementRoomSummary?.primaryAction ?? displayOpenAction
      : latestStageGate?.status === "confirmed"
      ? null
      : stageConfirmAction
      ? stageConfirmAction
      : canonicalNextBatonAgentId && nextBatonOpenAction
      ? nextBatonOpenAction
      : effectiveOwnerAgentId === targetAgentId && nextBatonOpenAction
        ? nextBatonOpenAction
        : effectiveOpenAction;
  const displayNextBatonLabel = isGroup
    ? requirementRoomSummary?.ownerLabel ?? "待确认"
    : canonicalNextBatonLabel;
  const displayNextBatonAgentId = isGroup
    ? requirementRoomSummary?.ownerAgentId ?? null
    : canonicalNextBatonAgentId;
  const missionIsCompleted = Boolean(
    !isGroup &&
      !isRequirementBootstrapPending &&
      !isFreshConversation &&
      taskPlanOverview &&
      taskPlanOverview.totalCount > 0 &&
      taskPlanOverview.doneCount >= taskPlanOverview.totalCount &&
      !latestStageGate &&
      !shouldAdvanceToNextPhase &&
      !shouldDispatchPublish &&
      !shouldDirectToTechDispatch,
  );
  const missionPlanSteps = useMemo(() => {
    if (taskPlanOverview?.steps.length) {
      return taskPlanOverview.steps.map((step) => {
        const isCurrentStep = displayPlanCurrentStep?.id === step.id;
        const displayStep = isCurrentStep && displayPlanCurrentStep ? { ...step, ...displayPlanCurrentStep } : step;
        return {
          ...displayStep,
          isCurrent: isCurrentStep,
          isNext: displayPlanNextStep?.id === step.id,
        };
      });
    }

    if (latestStageGate?.nextStagePlan.length) {
      return latestStageGate.nextStagePlan.map((item, index) => ({
        id: `stage-plan:${latestStageGate.sourceTimestamp}:${index}`,
        title: item,
        assigneeLabel: index === 0 ? effectiveOwnerLabel : displayNextBatonLabel,
        assigneeAgentId: index === 0 ? effectiveOwnerAgentId : displayNextBatonAgentId,
        status: "pending" as const,
        statusLabel: index === 0 ? "待你确认" : "待启动",
        detail:
          index === 0
            ? "这一步先等你确认；确认后 CEO 会正式启动。"
            : "等负责人确认并启动后，这一步会进入执行。",
        isCurrent: index === 0,
        isNext: index === 1,
      }));
    }

    if (requirementOverview) {
      return [
        {
          id: `mission-current:${requirementOverview.topicKey}`,
          title: effectiveStage,
          assigneeLabel: effectiveOwnerLabel,
          assigneeAgentId: effectiveOwnerAgentId,
          status:
            effectiveStatusLabel === "已完成" || effectiveStatusLabel === "已确认" ? ("done" as const) : ("wip" as const),
          statusLabel: effectiveStatusLabel,
          detail: effectiveSummary,
          isCurrent: true,
          isNext: false,
        },
        ...(displayNextBatonAgentId &&
        displayNextBatonLabel &&
        displayNextBatonAgentId !== effectiveOwnerAgentId &&
        displayNextBatonLabel !== effectiveOwnerLabel
          ? [
              {
                id: `mission-next:${displayNextBatonAgentId}`,
                title: "接手下一棒",
                assigneeLabel: displayNextBatonLabel,
                assigneeAgentId: displayNextBatonAgentId,
                status: "pending" as const,
                statusLabel: "待接手",
                detail: "上一棒完成后，这里会成为新的执行负责人。",
                isCurrent: false,
                isNext: true,
              },
            ]
          : []),
      ];
    }

    return [];
  }, [
    displayNextBatonAgentId,
    displayNextBatonLabel,
    displayPlanCurrentStep,
    displayPlanNextStep,
    effectiveOwnerAgentId,
    effectiveOwnerLabel,
    effectiveStage,
    effectiveStatusLabel,
    effectiveSummary,
    latestStageGate,
    requirementOverview,
    taskPlanOverview,
    strategicDirectParticipantView,
  ]);
  const conversationMission = useMemo(() => {
    if (isFreshConversation) {
      return {
        title: "新的规划/任务",
        statusLabel: "待创建",
        progressLabel: "0/0",
        ownerLabel: emp?.nickname ?? "CEO",
        currentStepLabel: "等待你提出这轮新需求",
        nextLabel: "CEO 先梳理需求并给出 plan",
        summary: "这是一段新的空白对话。你现在对 CEO 说的目标，会被收成这一轮唯一的规划/任务。",
        guidance: "先把目标、约束、预期结果说清楚；CEO 会先整理成 plan，再由你确认进入执行。",
        planSteps: [] as Array<{
          id: string;
          title: string;
          assigneeLabel: string;
          assigneeAgentId: string | null | undefined;
          status: "done" | "wip" | "pending";
          statusLabel: string;
          detail: string | null | undefined;
          isCurrent: boolean;
          isNext: boolean;
        }>,
      };
    }

    if (isRequirementBootstrapPending) {
      return {
        title: "正在恢复当前规划/任务",
        statusLabel: "恢复中",
        progressLabel: "--",
        ownerLabel: "系统",
        currentStepLabel: "从公司会话恢复当前主线",
        nextLabel: "恢复完成后回到最新任务",
        summary: "刷新后会先重建当前规划/任务，避免先看到历史章节再跳回当前章节。",
        guidance: "这段时间先不要判断当前负责人；恢复完成后，再看本轮规划/任务。",
        planSteps: [] as Array<{
          id: string;
          title: string;
          assigneeLabel: string;
          assigneeAgentId: string | null | undefined;
          status: "done" | "wip" | "pending";
          statusLabel: string;
          detail: string | null | undefined;
          isCurrent: boolean;
          isNext: boolean;
        }>,
      };
    }

    if (!isGroup && !requirementOverview && !taskPlanOverview && !latestStageGate) {
      return null;
    }

    return {
      title: requirementOverview?.title ?? latestStageGate?.title ?? structuredTaskPreview?.title ?? "当前规划/任务",
      statusLabel: missionIsCompleted
        ? "已完成"
        : latestStageGate?.status === "waiting_confirmation"
          ? "待你确认"
          : effectiveStatusLabel,
      progressLabel: taskPlanOverview
        ? `${taskPlanOverview.doneCount}/${taskPlanOverview.totalCount}`
        : latestStageGate
          ? `${latestStageGate.nextStagePlan.length} 项待确认`
          : requirementTeam?.progressLabel ?? "进行中",
      ownerLabel: effectiveOwnerLabel,
      currentStepLabel: displayPlanCurrentStep
        ? `${displayPlanCurrentStep.assigneeLabel} · ${displayPlanCurrentStep.title}`
        : effectiveStage,
      nextLabel: missionIsCompleted
        ? "可以复盘，或开启下一轮"
        : displayPlanNextStep
          ? `${displayPlanNextStep.assigneeLabel} · ${displayPlanNextStep.title}`
          : displayNextBatonLabel,
      summary: missionIsCompleted
        ? "这轮规划/任务已经完成。现在可以让 CEO 做阶段总结、复盘，或者直接开启下一轮。"
        : latestStageGate?.status === "waiting_confirmation"
          ? `${latestStageGate.stageSummary} 你确认后，CEO 会按这份 plan 正式进入下一阶段。`
          : effectiveSummary,
      guidance: missionIsCompleted
        ? "如果你还想继续围绕这一轮复盘或补问题，可以继续聊天；如果要开始新目标，直接开启下一轮。"
        : "继续跟 CEO 聊，就是在调整这份规划/任务。CEO 会继续更新 plan、负责人、下一棒和当前判断。",
      planSteps: missionPlanSteps,
    };
  }, [
    displayNextBatonLabel,
    displayPlanCurrentStep,
    displayPlanNextStep,
    effectiveOwnerLabel,
    effectiveStage,
    effectiveStatusLabel,
    effectiveSummary,
    emp?.nickname,
    isFreshConversation,
    isGroup,
    isRequirementBootstrapPending,
    latestStageGate,
    missionIsCompleted,
    missionPlanSteps,
    requirementOverview,
    requirementTeam?.progressLabel,
    structuredTaskPreview?.title,
    taskPlanOverview,
  ]);
  const persistedConversationMission = useMemo(
    () =>
      pickConversationMissionRecord({
        missions: activeMissionRecords,
        sessionKey,
        roomId: isGroup ? sessionKey : null,
        topicKey: requirementOverview?.topicKey ?? groupTopicKey ?? null,
        startedAt: requirementOverview?.startedAt ?? activeRequirementRoom?.createdAt ?? null,
      }),
    [
      activeMissionRecords,
      activeRequirementRoom?.createdAt,
      groupTopicKey,
      isGroup,
      requirementOverview?.startedAt,
      requirementOverview?.topicKey,
      sessionKey,
    ],
  );
  const persistedWorkItem = useMemo(
    () =>
      pickWorkItemRecord({
        items: activeWorkItems,
        sessionKey,
        roomId: (isGroup ? groupWorkItemId ? buildRoomRecordIdFromWorkItem(groupWorkItemId) : sessionKey : null) ?? null,
        topicKey: requirementOverview?.topicKey ?? groupTopicKey ?? null,
        startedAt: requirementOverview?.startedAt ?? activeRequirementRoom?.createdAt ?? null,
      }),
    [
      activeMissionRecords,
      activeRequirementRoom?.createdAt,
      activeWorkItems,
      groupTopicKey,
      groupWorkItemId,
      isGroup,
      requirementOverview?.startedAt,
      requirementOverview?.topicKey,
      sessionKey,
    ],
  );
  const linkedRequirementRoom = useMemo(() => {
    const workItemId = persistedWorkItem?.id ?? groupWorkItemId ?? null;
    if (!workItemId) {
      return null;
    }
    return (
      activeRoomRecords.find(
        (room) =>
          room.workItemId === workItemId || room.id === buildRoomRecordIdFromWorkItem(workItemId),
      ) ?? null
    );
  }, [activeRoomRecords, groupWorkItemId, persistedWorkItem?.id]);
  const activeConversationMission =
    conversationMission ??
    (persistedWorkItem ? workItemToConversationMission(persistedWorkItem) : null) ??
    (requirementOverview || latestStageGate || isRequirementBootstrapPending || isFreshConversation
      ? null
      : persistedConversationMission);
  const shouldPersistConversationTruth = isGroup || isCeoSession;
  const conversationMissionUpdatedAt = useMemo(() => {
    if (latestMessageTimestamp > 0) {
      return latestMessageTimestamp;
    }
    if (activeRequirementRoom?.updatedAt) {
      return activeRequirementRoom.updatedAt;
    }
    if (requirementOverview?.startedAt) {
      return requirementOverview.startedAt;
    }
    if (persistedWorkItem?.updatedAt) {
      return persistedWorkItem.updatedAt;
    }
    return persistedConversationMission?.updatedAt ?? 0;
  }, [
    activeRequirementRoom?.updatedAt,
    latestMessageTimestamp,
    persistedWorkItem?.updatedAt,
    persistedConversationMission?.updatedAt,
    requirementOverview?.startedAt,
  ]);
  const conversationMissionRecord = useMemo(() => {
    if (
      !conversationMission ||
      !sessionKey ||
      isArchiveView ||
      isFreshConversation ||
      isRequirementBootstrapPending ||
      conversationMissionUpdatedAt <= 0 ||
      (isGroup && (activeRequirementRoom?.transcript.length ?? 0) === 0)
    ) {
      return null;
    }

    return buildConversationMissionRecord({
      sessionKey,
      topicKey: requirementOverview?.topicKey ?? groupTopicKey ?? null,
      roomId: isGroup ? sessionKey : null,
      startedAt: requirementOverview?.startedAt ?? activeRequirementRoom?.createdAt ?? latestMessageTimestamp,
      title: conversationMission.title,
      statusLabel: conversationMission.statusLabel,
      progressLabel: conversationMission.progressLabel,
      ownerAgentId: effectiveOwnerAgentId,
      ownerLabel: conversationMission.ownerLabel,
      currentStepLabel: conversationMission.currentStepLabel,
      nextAgentId: displayNextBatonAgentId,
      nextLabel: conversationMission.nextLabel,
      summary: conversationMission.summary,
      guidance: conversationMission.guidance,
      completed: missionIsCompleted,
      updatedAt: conversationMissionUpdatedAt,
      planSteps: conversationMission.planSteps as ConversationMissionStepRecord[],
    });
  }, [
    activeRequirementRoom?.transcript.length,
    conversationMissionUpdatedAt,
    conversationMission,
    displayNextBatonAgentId,
    effectiveOwnerAgentId,
    isArchiveView,
    isFreshConversation,
    isGroup,
    isRequirementBootstrapPending,
    missionIsCompleted,
    groupTopicKey,
    requirementOverview?.topicKey,
    sessionKey,
  ]);
  useEffect(() => {
    if (!shouldPersistConversationTruth || !conversationMissionRecord) {
      return;
    }
    upsertMissionRecord(conversationMissionRecord);
  }, [conversationMissionRecord, shouldPersistConversationTruth, upsertMissionRecord]);
  useEffect(() => {
    if (!shouldPersistConversationTruth || !activeCompany || !conversationMissionRecord) {
      return;
    }
    const workItemRecord = reconcileWorkItemRecord({
      companyId: activeCompany.id,
      existingWorkItem: persistedWorkItem,
      mission: conversationMissionRecord,
      overview: requirementOverview,
      room: activeRequirementRoom ?? linkedRequirementRoom,
      artifacts: activeArtifacts,
      dispatches: activeDispatches,
      fallbackSessionKey: sessionKey,
      fallbackRoomId:
        (isGroup
          ? groupWorkItemId
            ? buildRoomRecordIdFromWorkItem(groupWorkItemId)
            : sessionKey
          : null) ?? null,
    });
    if (workItemRecord) {
      upsertWorkItemRecord(workItemRecord);
    }
  }, [
    activeArtifacts,
    activeCompany,
    activeRequirementRoom,
    activeDispatches,
    conversationMissionRecord,
    groupWorkItemId,
    isGroup,
    linkedRequirementRoom,
    persistedWorkItem,
    requirementOverview,
    sessionKey,
    shouldPersistConversationTruth,
    upsertWorkItemRecord,
  ]);
  useEffect(() => {
    if (
      !activeCompany ||
      !requirementTeam ||
      requirementTeam.memberIds.length < 2 ||
      isFreshConversation ||
      isRequirementBootstrapPending
    ) {
      return;
    }

    const workItemId = conversationMissionRecord?.id ?? persistedWorkItem?.id ?? groupWorkItemId ?? null;
    if (!workItemId) {
      return;
    }

    const roomId = buildRoomRecordIdFromWorkItem(workItemId);
    const existingRoom =
      activeRoomRecords.find((room) => room.id === roomId || room.workItemId === workItemId) ?? null;
    if (
      existingRoom &&
      existingRoom.workItemId === workItemId &&
      existingRoom.title === requirementTeam.title &&
      existingRoom.topicKey === requirementTeam.topicKey &&
      existingRoom.memberIds.length >= requirementTeam.memberIds.length
    ) {
      return;
    }

    upsertRoomRecord(
      buildRequirementRoomRecord({
        companyId: activeCompany.id,
        workItemId,
        sessionKey: existingRoom?.sessionKey ?? `room:${roomId}`,
        title: requirementTeam.title,
        memberIds: requirementTeam.memberIds,
        ownerAgentId:
          requirementTeam.ownerAgentId ??
          persistedWorkItem?.ownerActorId ??
          effectiveOwnerAgentId ??
          targetAgentId ??
          null,
        topicKey: requirementTeam.topicKey,
        transcript: existingRoom?.transcript ?? [],
        createdAt: existingRoom?.createdAt ?? persistedWorkItem?.startedAt ?? Date.now(),
        updatedAt: existingRoom?.updatedAt ?? Date.now(),
      }),
    );
  }, [
    activeCompany,
    activeRoomRecords,
    conversationMissionRecord?.id,
    effectiveOwnerAgentId,
    groupWorkItemId,
    isFreshConversation,
    isRequirementBootstrapPending,
    persistedWorkItem?.id,
    persistedWorkItem?.ownerActorId,
    persistedWorkItem?.startedAt,
    requirementTeam,
    targetAgentId,
    upsertRoomRecord,
  ]);
  const showRequirementTeamEntry = Boolean(
    requirementTeam && !isGroup && !isRequirementBootstrapPending && !isFreshConversation,
  );
  const teamGroupRoute = useMemo(() => {
    if (!activeCompany || !requirementTeam || requirementTeam.memberIds.length < 2) {
      return null;
    }

    return buildGroupChatRoute({
      company: activeCompany,
      memberIds: requirementTeam.memberIds,
      topic: requirementTeam.title,
      topicKey: requirementTeam.topicKey,
      workItemId: conversationMissionRecord?.id ?? persistedWorkItem?.id ?? groupWorkItemId ?? null,
      preferredInitiatorAgentId: targetAgentId,
      existingRooms: activeRoomRecords,
    });
  }, [activeCompany, activeRoomRecords, conversationMissionRecord?.id, groupWorkItemId, persistedWorkItem?.id, requirementTeam, targetAgentId]);
  const canShowSessionHistory =
    !isGroup &&
    Boolean(
      sessionKey ||
        recentAgentSessions.length > 0 ||
        historyRoundItems.length > 0 ||
        archiveHistoryNotice,
    );
  const archiveSectionNotice =
    historyRoundItems.length > 0 && archiveHistoryNotice
      ? `当前已显示产品侧归档轮次。${archiveHistoryNotice}`
      : archiveHistoryNotice;

  const buildTeamAdjustmentAction = useCallback(
    (member: { agentId: string; label: string; stage: string; detail: string }) =>
      ({
        id: `team-adjust:${member.agentId}:${requirementTeam?.topicKey ?? "current"}`,
        label: member.agentId === effectiveOwnerAgentId ? `让 ${member.label} 继续负责` : `让 ${member.label} 调整处理`,
        description: `直接让 ${member.label} 接住当前 baton，并把结果回传给负责人。`,
        kind: "message" as const,
        tone: "secondary" as const,
        targetAgentId: member.agentId,
        message:
          member.agentId === effectiveOwnerAgentId
            ? `当前需求：${requirementTeam?.title ?? effectiveHeadline}。你仍是负责人。当前判断：${effectiveSummary}。请不要只汇报现状，直接继续推进，并明确回复：1. 你现在推动哪一步 2. 下一棒是谁 3. 你下一次会回传什么结果。`
            : `当前需求：${requirementTeam?.title ?? effectiveHeadline}。负责人：${effectiveOwnerLabel}。你当前负责的环节：${member.stage}。当前判断：${member.detail || effectiveSummary}。请根据当前情况直接调整并推进，完成后明确回传给负责人：1. 你已完成什么 2. 还差什么 3. 是否需要其他成员配合。`,
      }) satisfies FocusActionButton,
    [effectiveHeadline, effectiveOwnerAgentId, effectiveOwnerLabel, effectiveSummary, requirementTeam?.title, requirementTeam?.topicKey],
  );

  const handleCopyTakeoverPack = async () => {
    if (!takeoverPack) {
      return;
    }

    try {
      await navigator.clipboard.writeText(takeoverPack.operatorNote);
      appendLocalProgressEvent({
        id: `copy-takeover:${Date.now()}`,
        timestamp: Date.now(),
        actorLabel: "系统",
        title: "已复制接管包",
        summary: "接管信息已经复制到剪贴板，可以直接转给人工继续处理。",
        tone: "amber",
        category: "status",
      });
      setIsSummaryOpen(true);
      toast.success("接管包已复制", "可以直接贴给人工执行者继续处理。");
    } catch (error) {
      appendLocalProgressEvent({
        id: `copy-takeover-failed:${Date.now()}`,
        timestamp: Date.now(),
        actorLabel: "系统",
        title: "复制接管包失败",
        summary: error instanceof Error ? error.message : String(error),
        tone: "rose",
        category: "status",
      });
      toast.error("复制失败", error instanceof Error ? error.message : String(error));
    }
  };

  const handleRecoverCommunication = async () => {
    if (!activeCompany) {
      return;
    }

    setRecoveringCommunication(true);
    try {
      const summary = await syncCompanyCommunication();
      if (!summary) {
        return;
      }
      appendLocalProgressEvent({
        id: `recover:${Date.now()}`,
        timestamp: Date.now(),
        actorLabel: "系统",
        title: "已同步当前阻塞",
        summary: `新增 ${summary.requestsAdded} 条请求，更新 ${summary.requestsUpdated} 条，恢复任务 ${summary.tasksRecovered} 条，恢复交接 ${summary.handoffsRecovered} 条。`,
        tone: "emerald",
        category: "status",
      });
      setIsSummaryOpen(true);
      toast.success(
        "当前阻塞已同步",
        `新增 ${summary.requestsAdded}，更新 ${summary.requestsUpdated}，恢复任务 ${summary.tasksRecovered}，恢复交接 ${summary.handoffsRecovered}。`,
      );
    } catch (error) {
      appendLocalProgressEvent({
        id: `recover-failed:${Date.now()}`,
        timestamp: Date.now(),
        actorLabel: "系统",
        title: "同步当前阻塞失败",
        summary: error instanceof Error ? error.message : String(error),
        tone: "rose",
        category: "status",
      });
      toast.error("同步失败", error instanceof Error ? error.message : String(error));
    } finally {
      setRecoveringCommunication(false);
    }
  };

  const shouldRunCompanySync = Boolean(activeCompany && connected && isPageVisible && !isArchiveView);
  const companySyncIntervalMs =
    isGroup || isSummaryOpen || actionWatches.length > 0
      ? 15_000
      : isCeoSession
        ? 30_000
        : 45_000;

  useEffect(() => {
    if (!shouldRunCompanySync) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        if (!cancelled) {
          await syncCompanyCommunication({
            force: companySessionSnapshotsRef.current.length === 0,
          });
        }
      } catch (error) {
        console.error("background company sync failed", error);
      } finally {
        if (!cancelled) {
          setHasBootstrappedCompanySync(true);
        }
      }
    };

    void run();
    const timer = window.setInterval(() => {
      void run();
    }, companySyncIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [companySyncIntervalMs, shouldRunCompanySync, syncCompanyCommunication]);

  const handleFocusAction = async (action: FocusActionButton) => {
    if (action.kind === "navigate" && action.href) {
      navigate(action.href);
      return;
    }

    if (action.kind === "copy") {
      await handleCopyTakeoverPack();
      return;
    }

    if (action.kind === "recover") {
      await handleRecoverCommunication();
      return;
    }

    if (!action.message) {
      return;
    }

    setRunningFocusActionId(action.id);
    setIsSummaryOpen(true);
    try {
      const actionStartedAt = Date.now();
      const actionWorkItemId =
        conversationMissionRecord?.id ?? persistedWorkItem?.id ?? groupWorkItemId ?? null;
      const runtimeTargetAgentId = action.targetAgentId ?? targetAgentId ?? null;
      let resolvedKey = sessionKey;
      let providerRunId: string | undefined;

      if (runtimeTargetAgentId && activeCompany) {
        const ack = await sendTurnToCompanyActor({
          backend: gateway,
          manifest: providerManifest,
          company: activeCompany,
          actorId: runtimeTargetAgentId,
          message: action.message,
          timeoutMs: 300_000,
        });
        resolvedKey = ack.providerConversationRef.conversationId;
        providerRunId = ack.runId;
      } else if (sessionKey) {
        const ack = await gateway.sendChatMessage(sessionKey, action.message, { timeoutMs: 300_000 });
        resolvedKey = sessionKey;
        providerRunId = ack.runId;
      }

      if (!resolvedKey || !providerRunId) {
        throw new Error("未找到可发送的目标会话");
      }
      if (actionWorkItemId && runtimeTargetAgentId) {
        upsertDispatchRecord({
          id: `dispatch:${actionWorkItemId}:${providerRunId}`,
          workItemId: actionWorkItemId,
          roomId: null,
          title: action.label,
          summary: action.description,
          fromActorId: targetAgentId ?? null,
          targetActorIds: [runtimeTargetAgentId],
          status: "sent",
          providerRunId,
          topicKey: conversationMissionRecord?.topicKey ?? persistedWorkItem?.topicKey ?? groupTopicKey ?? undefined,
          createdAt: actionStartedAt,
          updatedAt: actionStartedAt,
        });
      }
      const targetLabel =
        runtimeTargetAgentId && activeCompany
          ? formatAgentLabel(activeCompany, runtimeTargetAgentId)
          : focusSummary.ownerLabel;
      const followupTargetLabel =
        action.followupTargetLabel ??
        (action.followupTargetAgentId && activeCompany
          ? formatAgentLabel(activeCompany, action.followupTargetAgentId)
          : null);
      appendLocalProgressEvent({
        id: `focus:${providerRunId}`,
        timestamp: actionStartedAt,
        actorLabel: "系统",
        actorAgentId: runtimeTargetAgentId ?? undefined,
        title: `已发送：${action.label}`,
        summary:
          followupTargetLabel && followupTargetLabel !== targetLabel
            ? `已向 ${targetLabel} 发出操作，系统会继续盯 ${targetLabel} 和 ${followupTargetLabel} 的回传。`
            : `已向 ${targetLabel} 发出操作，当前等待回传。`,
        detail: action.description,
        tone: "indigo",
        category: "receipt",
      });
      const isSameSessionOwnerAction =
        !isGroup &&
        Boolean(runtimeTargetAgentId) &&
        runtimeTargetAgentId === targetAgentId;
      const nextWatches: FocusActionWatch[] = isSameSessionOwnerAction
        ? []
        : [
            {
              id: `${providerRunId}:owner`,
              sessionKey: resolvedKey,
              actionLabel: action.label,
              targetLabel,
              targetAgentId: runtimeTargetAgentId ?? undefined,
              kind: "owner",
              startedAt: actionStartedAt,
              lastSeenTimestamp: actionStartedAt,
              hasReminder: false,
            },
          ];
      if (
        action.followupTargetAgentId &&
        action.followupTargetAgentId !== action.targetAgentId
      ) {
        try {
          const followupConversation = await resolveCompanyActorConversation({
            backend: gateway,
            manifest: providerManifest,
            company: activeCompany,
            actorId: action.followupTargetAgentId,
            kind: "direct",
          });
          if (followupConversation.conversationRef.conversationId) {
            nextWatches.push({
              id: `${providerRunId}:handoff:${action.followupTargetAgentId}`,
              sessionKey: followupConversation.conversationRef.conversationId,
              actionLabel: action.label,
              targetLabel: followupTargetLabel ?? action.followupTargetAgentId,
              targetAgentId: action.followupTargetAgentId,
              kind: "handoff",
              startedAt: actionStartedAt,
              lastSeenTimestamp: actionStartedAt,
              hasReminder: false,
            });
          }
        } catch (error) {
          console.error("Failed to resolve follow-up watch session", error);
        }
      }
      setActionWatches((previous) =>
        [...nextWatches, ...previous.filter((watch) => !nextWatches.some((item) => item.id === watch.id))].slice(0, 6),
      );
      toast.success("操作已发送", action.description);
    } catch (error) {
      appendLocalProgressEvent({
        id: `focus-failed:${action.id}:${Date.now()}`,
        timestamp: Date.now(),
        actorLabel: "系统",
        actorAgentId: action.targetAgentId,
        title: `发送失败：${action.label}`,
        summary: error instanceof Error ? error.message : String(error),
        tone: "rose",
        category: "receipt",
      });
      toast.error("操作失败", error instanceof Error ? error.message : String(error));
    } finally {
      setRunningFocusActionId(null);
    }
  };

  useEffect(() => {
    if (!activeCompany || !sessionKey || isArchiveView || handoffPreview.length === 0) {
      return;
    }

    handoffPreview.forEach((handoff) => {
      upsertHandoff(handoff).catch(console.error);
    });
  }, [activeCompany, handoffPreview, isArchiveView, sessionKey, upsertHandoff]);

  useEffect(() => {
    if (!activeCompany || !sessionKey || isArchiveView || requestPreview.length === 0) {
      return;
    }

    requestPreview.forEach((request) => {
      upsertRequest(request).catch(console.error);
    });
  }, [activeCompany, isArchiveView, requestPreview, sessionKey, upsertRequest]);

  useEffect(() => {
    setLocalProgressEvents([]);
    setActionWatches([]);
    setIsSummaryOpen(false);
    setIsTechnicalSummaryOpen(false);
    setSummaryPanelView("owner");
  }, [sessionKey]);

  useEffect(() => {
    if (summaryPanelView === "debug") {
      setIsTechnicalSummaryOpen(true);
    }
  }, [summaryPanelView]);

  const openSummaryPanel = (view: "owner" | "team" | "debug" = "owner") => {
    setSummaryPanelView(view);
    setIsSummaryOpen(true);
    if (view !== "debug") {
      setIsTechnicalSummaryOpen(false);
    }
  };

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    forceScrollOnNextUpdateRef.current = true;
    programmaticScrollRef.current = false;
    userScrollLockRef.current = false;
    lastScrollTopRef.current = 0;
    lockedScrollTopRef.current = null;
  }, [agentId]);

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
  }, [actionWatches, connected, isPageVisible, syncCompanyCommunication]);

  useEffect(() => {
    async function initChat() {
      if (!agentId || !connected) {
        return;
      }
      try {
        let actualKey = effectiveGroupSessionKey;
        if (!actualKey) {
          const res = await gateway.resolveSession(targetAgentId!);
          if (res.ok && res.key) {
            actualKey = res.key;
          }
        }

          if (actualKey) {
            setSessionKey(actualKey);
          if (isArchiveView && archiveId) {
            if (activeArchivedRound) {
              setMessages((previous) => {
                const nextMessages = limitChatMessages(
                  activeArchivedRound.messages.map(roundSnapshotToChatMessage).map(normalizeMessage),
                );
                return areRequirementRoomChatMessagesEqual(previous, nextMessages) ? previous : nextMessages;
              });
              setIsGenerating(false);
              updateStreamText(null);
            } else if (historyAgentId) {
              const archive = await gateway.getSessionArchive(historyAgentId, archiveId, 200);
              setMessages((previous) => {
                const nextMessages = limitChatMessages((archive.messages || []).map(normalizeMessage));
                return areRequirementRoomChatMessagesEqual(previous, nextMessages) ? previous : nextMessages;
              });
              setIsGenerating(false);
              updateStreamText(null);
            }
          } else if (isGroup) {
            const existingRoom = activeRequirementRoom?.sessionKey === actualKey ? activeRequirementRoom : null;
            if (existingRoom) {
              const nextMessages = convertRequirementRoomRecordToChatMessages(existingRoom);
              setMessages((previous) =>
                areRequirementRoomChatMessagesEqual(previous, nextMessages) ? previous : nextMessages,
              );
            }
            if (
              (!existingRoom || existingRoom.transcript.length === 0) &&
              requirementRoomSessions.length > 0
            ) {
              const histories = await Promise.all(
                requirementRoomSessions.map(async (roomSession) => {
                  try {
                    const history = await gateway.getChatHistory(roomSession.sessionKey, CHAT_HISTORY_FETCH_LIMIT);
                    return {
                      sessionKey: roomSession.sessionKey,
                      agentId: roomSession.agentId,
                      messages: (history.messages || []).map(normalizeMessage),
                    };
                  } catch {
                    return {
                      sessionKey: roomSession.sessionKey,
                      agentId: roomSession.agentId,
                      messages: [],
                    };
                  }
                }),
              );
              const roomRecord = mergeRequirementRoomRecordFromSessions({
                company: activeCompany,
                room: existingRoom,
                companyId: activeCompany?.id,
                workItemId: groupWorkItemId,
                sessionKey: actualKey,
                title: groupTitle,
                memberIds: requirementRoomTargetAgentIds,
                ownerAgentId: parseAgentIdFromSessionKey(actualKey),
                topicKey: groupTopicKey ?? null,
                sessions: histories,
                providerId,
              });
              upsertRoomRecord(roomRecord);
              upsertRoomConversationBindings(
                buildRoomConversationBindingsFromSessions({
                  roomId: roomRecord.id,
                  providerId,
                  sessions: histories,
                  updatedAt: roomRecord.updatedAt,
                }),
              );
              const nextMessages = convertRequirementRoomRecordToChatMessages(roomRecord);
              setMessages((previous) =>
                areRequirementRoomChatMessagesEqual(previous, nextMessages) ? previous : nextMessages,
              );
            }
          } else {
            const hist = await gateway.getChatHistory(actualKey, CHAT_HISTORY_FETCH_LIMIT);
            setMessages((previous) => {
              const nextMessages = limitChatMessages((hist.messages || []).map(normalizeMessage));
              return areRequirementRoomChatMessagesEqual(previous, nextMessages) ? previous : nextMessages;
            });
          }
        }
      } catch (err) {
        console.error("Failed to init chat:", err);
      } finally {
        setLoading(false);
      }
    }
    initChat();
  }, [
    activeCompany,
    agentId,
    archiveId,
    activeArchivedRound,
    connected,
    groupTopicKey,
    groupTitle,
    historyAgentId,
    isArchiveView,
    isGroup,
    providerId,
    requirementRoomSessions,
    requirementRoomTargetAgentIds,
    targetAgentId,
    effectiveGroupSessionKey,
    upsertRoomRecord,
    upsertRoomConversationBindings,
  ]);

  useEffect(() => {
    if (!sessionKey || isArchiveView) {
      return;
    }

    // Listen for new chat broadcasts (both final and partial streaming)
    const unsubscribe = gateway.subscribe("chat", (rawPayload) => {
      const payload = parseChatEventPayload(rawPayload);
      const payloadMatchesSession = isGroup
        ? requirementRoomSessionKeys.has(payload?.sessionKey ?? "")
        : payload?.sessionKey === sessionKey;
      if (!payload || !payloadMatchesSession) {
        return;
      }

      if (payload.state === "delta") {
        if (isGroup) {
          return;
        }
        const deltaText = extractTextFromMessage(payload.message);
        if (deltaText && deltaText.length >= (streamTextRef.current?.length ?? 0)) {
          activeRunIdRef.current = payload.runId || null;
          updateStreamText(deltaText);
        }
        return;
      }

      if (payload.state === "final") {
        const incoming = payload.message ? normalizeMessage(payload.message) : null;
        if (isGroup) {
          const agentKey = parseAgentIdFromSessionKey(payload.sessionKey);
          const roomMessage =
            incoming && agentKey
              ? createIncomingRequirementRoomMessage({
                  company: activeCompany,
                  message: incoming,
                  sessionKey: payload.sessionKey,
                  agentId: agentKey,
                  roomId:
                    activeRequirementRoom?.id ??
                    (groupWorkItemId ? buildRoomRecordIdFromWorkItem(groupWorkItemId) : sessionKey ?? undefined),
                  ownerAgentId:
                    activeRequirementRoom?.ownerAgentId ?? parseAgentIdFromSessionKey(sessionKey),
                })
              : null;
          if (roomMessage && sessionKey && agentKey) {
            const roomId =
              activeRequirementRoom?.id ??
              (groupWorkItemId ? buildRoomRecordIdFromWorkItem(groupWorkItemId) : sessionKey);
            upsertRoomConversationBindings([
              {
                roomId,
                providerId,
                conversationId: payload.sessionKey,
                actorId: agentKey,
                nativeRoom: payload.sessionKey.includes(":group:"),
                updatedAt: roomMessage.timestamp,
              },
            ]);
            const dispatchUpdates = resolveDispatchReplyUpdates({
              dispatches: activeDispatches,
              workItemId: groupWorkItemId ?? persistedWorkItem?.id ?? conversationMissionRecord?.id ?? null,
              roomId,
              actorId: agentKey,
              responseMessageId: roomMessage.id,
              timestamp: roomMessage.timestamp,
            });
            dispatchUpdates.forEach((dispatch) => upsertDispatchRecord(dispatch));
            appendRoomMessages(
              roomId,
              [roomMessage],
              {
                sessionKey,
                companyId: activeCompany?.id,
                workItemId: groupWorkItemId ?? persistedWorkItem?.id ?? conversationMissionRecord?.id ?? undefined,
                title: activeRequirementRoom?.title ?? groupTitle,
                memberActorIds: activeRequirementRoom?.memberActorIds ?? requirementRoomTargetAgentIds,
                memberIds: activeRequirementRoom?.memberIds ?? requirementRoomTargetAgentIds,
                ownerActorId:
                  activeRequirementRoom?.ownerActorId ??
                  activeRequirementRoom?.ownerAgentId ??
                  parseAgentIdFromSessionKey(sessionKey),
                ownerAgentId:
                  activeRequirementRoom?.ownerAgentId ?? parseAgentIdFromSessionKey(sessionKey),
                topicKey: groupTopicKey ?? undefined,
              },
            );
          }
          activeRunIdRef.current = null;
          updateStreamText(null);
          setIsGenerating(false);
          return;
        }
        setMessages((prev: ChatMessage[]) => {
          if (incoming) {
            // filter out previous stream artifacts or partial matches (basic dedup)
            const base = prev.filter(
              (m) => !(m.role === incoming.role && m.timestamp === incoming.timestamp),
            );
            const newArr = [...base, incoming];
            return limitChatMessages(newArr) as ChatMessage[];
          }

          if (streamTextRef.current?.trim()) {
            return limitChatMessages([
              ...prev,
              {
                role: "assistant" as const,
                content: [{ type: "text", text: streamTextRef.current }],
                timestamp: Date.now(),
              },
            ]) as ChatMessage[];
          }

          return prev;
        });
        activeRunIdRef.current = null;
        updateStreamText(null);
        setIsGenerating(false);

        // === System-level Task Tracker sync ===
        const finalText = incoming ? extractTextFromMessage(incoming) : streamTextRef.current;
        if (finalText && sessionKey) {
          const trackerItems = extractTaskTracker(finalText);
          if (trackerItems && trackerItems.length > 0) {
            const steps: TaskStep[] = trackerItems.map((item) => {
              const assigneeMatch = item.text.match(/[\u2192→]\s*@(.+?)(?:\s|$)/);
              return {
                text: item.text,
                status: item.status,
                assignee: assigneeMatch?.[1]?.trim(),
              };
            });
            const task: TrackedTask = {
              id: sessionKey.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40),
              title: resolveTaskTitle(finalText, sessionKey),
              sessionKey,
              agentId: agentId || "",
              steps,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            const store = useCompanyStore.getState();
            const company = store.activeCompany;
            const structuredTask = company
              ? buildTaskObjectSnapshot({
                  task,
                  company,
                  execution: resolveExecutionState({
                    evidenceTexts: [finalText],
                    taskSteps: steps,
                    fallbackState: "running",
                  }),
                  now: Date.now(),
                })
              : task;
            store.upsertTask(structuredTask).catch(console.error);
          }
        }
        return;
      }

      if (payload.state === "aborted") {
        if (isGroup) {
          activeRunIdRef.current = null;
          updateStreamText(null);
          setIsGenerating(false);
          return;
        }
        if (payload.runId && activeRunIdRef.current && payload.runId !== activeRunIdRef.current) {
          return;
        }

        setMessages((prev) => {
          if (streamTextRef.current?.trim()) {
            return limitChatMessages([
              ...prev,
              {
                role: "assistant",
                content: [{ type: "text", text: `${streamTextRef.current}\n\n[已中止]` }],
                timestamp: Date.now(),
              },
            ]);
          }
          return prev;
        });
        activeRunIdRef.current = null;
        updateStreamText(null);
        setIsGenerating(false);
        return;
      }

      if (payload.state === "error") {
        if (isGroup) {
          activeRunIdRef.current = null;
          updateStreamText(null);
          setIsGenerating(false);
          toast.error("团队房间消息失败", payload.errorMessage ?? "请重试或改为直接联系成员。");
          return;
        }
        setMessages((prev) => [
          ...limitChatMessages(prev),
          {
            role: "system" as const,
            content: payload.errorMessage
              ? `[Error] ${payload.errorMessage}`
              : "[Error] chat error",
            timestamp: Date.now(),
          },
        ].slice(-CHAT_UI_MESSAGE_LIMIT));
        activeRunIdRef.current = null;
        updateStreamText(null);
        setIsGenerating(false);
      }
    });

    return () => unsubscribe();
  }, [
    activeCompany,
    activeDispatches,
    activeRequirementRoom?.id,
    activeRequirementRoom?.memberIds,
    activeRequirementRoom?.ownerActorId,
    activeRequirementRoom?.ownerAgentId,
    activeRequirementRoom?.title,
    appendRoomMessages,
    conversationMissionRecord?.id,
    groupTitle,
    groupTopicKey,
    groupWorkItemId,
    isArchiveView,
    isGroup,
    persistedWorkItem?.id,
    providerId,
    requirementRoomSessionKeys,
    requirementRoomTargetAgentIds,
    sessionKey,
    upsertRoomConversationBindings,
    upsertDispatchRecord,
  ]);

  useEffect(() => {
    if (userScrollLockRef.current && scrollContainerRef.current) {
      const lockedTop = lockedScrollTopRef.current;
      if (typeof lockedTop === "number" && Math.abs(scrollContainerRef.current.scrollTop - lockedTop) > 2) {
        setProgrammaticScrollLock(true);
        scrollContainerRef.current.scrollTop = lockedTop;
      }
      return;
    }

    if (forceScrollOnNextUpdateRef.current || (shouldAutoScrollRef.current && !userScrollLockRef.current)) {
      setProgrammaticScrollLock(true);
      endRef.current?.scrollIntoView({ behavior: "auto" });
      forceScrollOnNextUpdateRef.current = false;
      shouldAutoScrollRef.current = true;
    }
  }, [messages, setProgrammaticScrollLock, streamText]);

  const handleSend = async (draft: string): Promise<boolean> => {
    const text = draft.trim();
    const hasAttachments = attachments.length > 0;
    if (isArchiveView) {
      toast.warning("归档轮次只读", "请先返回当前会话，再继续和负责人对话。");
      return false;
    }
    if ((!text && !hasAttachments) || !sessionKey || sending) {
      return false;
    }
    if (text === "/new" && !hasAttachments) {
      if (isGroup) {
        toast.info("需求团队房间暂不支持 /new", "请在 CEO 或成员 1v1 会话里开启新会话。");
        return false;
      }
      return await handleClearSession("new");
    }

    const currentAttachments = [...attachments];
    setAttachments([]);
    setSending(true);
    setIsGenerating(true);
    markScrollIntent("follow");
    activeRunIdRef.current = null;
    updateStreamText(null);

    const apiAttachments = hasAttachments
      ? currentAttachments.map((att) => ({
          type: "image",
          mimeType: att.mimeType,
          content: att.dataUrl.split(",")[1] || "", // Remove 'data:image/jpeg;base64,' prefix
        }))
      : undefined;

    try {
      let roomAudienceAgentIds: string[] | undefined;
      if (isGroup) {
        const mentionedTargets = resolveRequirementRoomMentionTargets({
          text,
          company: activeCompany,
          memberIds: requirementRoomTargetAgentIds,
        });
        const defaultRoomTargetAgentId =
          displayNextBatonAgentId ??
          activeRequirementRoom?.ownerActorId ??
          activeRequirementRoom?.ownerAgentId ??
          requirementTeam?.ownerAgentId ??
          requirementRoomTargetAgentIds[0] ??
          null;
        const targetAgentIds = roomBroadcastMode
          ? requirementRoomTargetAgentIds
          : mentionedTargets.length > 0
            ? mentionedTargets
            : defaultRoomTargetAgentId
              ? [defaultRoomTargetAgentId]
              : [];

        if (targetAgentIds.length === 0) {
          toast.warning("没有匹配到团队成员", "请用 @agentId、@昵称 或 @角色 指向团队成员。");
          setIsGenerating(false);
          return false;
        }

        roomAudienceAgentIds = [...new Set(targetAgentIds)];
        const dispatchStartedAt = Date.now();
        const results = await Promise.allSettled(
          roomAudienceAgentIds.map((agentId) =>
            sendTurnToCompanyActor({
              backend: gateway,
              manifest: providerManifest,
              company: activeCompany,
              actorId: agentId,
              message: text,
              kind: "direct",
              timeoutMs: 300_000,
              attachments: apiAttachments,
              targetActorIds: roomAudienceAgentIds,
            }),
          ),
        );
        if (!results.some((result) => result.status === "fulfilled")) {
          throw new Error("团队成员都没有接住这条指令");
        }
        const fulfilledDispatches = results
          .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof sendTurnToCompanyActor>>> => result.status === "fulfilled")
          .map((result) => result.value);
        const roomId =
          activeRequirementRoom?.id ??
          (groupWorkItemId ? buildRoomRecordIdFromWorkItem(groupWorkItemId) : sessionKey);
        const workItemId = groupWorkItemId ?? persistedWorkItem?.id ?? conversationMissionRecord?.id ?? null;
        upsertRoomConversationBindings(
          fulfilledDispatches.map((dispatch) => ({
            roomId: roomId ?? sessionKey ?? "room:unknown",
            ...dispatch.providerConversationRef,
            updatedAt: dispatchStartedAt,
          })),
        );
        const dispatchId = workItemId ? `dispatch:${workItemId}:${dispatchStartedAt}` : null;
        if (dispatchId && workItemId) {
          upsertDispatchRecord({
            id: dispatchId,
            workItemId,
            roomId: roomId ?? null,
            title: roomBroadcastMode
              ? `${groupTitle} · 群发派单`
              : `需求团队派单 · ${roomAudienceAgentIds
                  .map((agentId) => activeCompany?.employees.find((employee) => employee.agentId === agentId)?.nickname ?? agentId)
                  .join("、")}`,
            summary: text,
            fromActorId: targetAgentId ?? activeRequirementRoom?.ownerActorId ?? null,
            targetActorIds: roomAudienceAgentIds,
            status: "sent",
            providerRunId: fulfilledDispatches[0]?.runId,
            topicKey: groupTopicKey ?? conversationMissionRecord?.topicKey ?? persistedWorkItem?.topicKey ?? undefined,
            createdAt: dispatchStartedAt,
            updatedAt: dispatchStartedAt,
          });
        }
        appendRoomMessages(
          roomId ?? sessionKey ?? "room:unknown",
          [
            createOutgoingRequirementRoomMessage({
              roomId: roomId ?? undefined,
              sessionKey: activeRequirementRoom?.sessionKey ?? sessionKey ?? `room:${roomId ?? "unknown"}`,
              text,
              audienceAgentIds: roomAudienceAgentIds,
            }),
          ],
          {
            sessionKey: activeRequirementRoom?.sessionKey ?? sessionKey ?? `room:${roomId ?? "unknown"}`,
            companyId: activeCompany?.id,
            workItemId: workItemId ?? undefined,
            title: activeRequirementRoom?.title ?? groupTitle,
            memberActorIds: activeRequirementRoom?.memberActorIds ?? requirementRoomTargetAgentIds,
            memberIds: activeRequirementRoom?.memberIds ?? requirementRoomTargetAgentIds,
            ownerActorId:
              activeRequirementRoom?.ownerActorId ??
              activeRequirementRoom?.ownerAgentId ??
              parseAgentIdFromSessionKey(sessionKey),
            ownerAgentId:
              activeRequirementRoom?.ownerAgentId ?? parseAgentIdFromSessionKey(sessionKey),
            topicKey: groupTopicKey ?? undefined,
          },
        );
        setRoomBroadcastMode(false);
      } else {
        const ack = await gateway.sendChatMessage(sessionKey, text, {
          timeoutMs: 300_000,
          attachments: apiAttachments,
        });
        activeRunIdRef.current = ack?.runId || null;
      }

      // Build optimistic content display block
      const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
      if (text) {
        contentBlocks.push({ type: "text", text });
      }
      if (hasAttachments) {
        currentAttachments.forEach((att) => {
          contentBlocks.push({
            type: "image",
            source: { type: "base64", media_type: att.mimeType, data: att.dataUrl },
          });
        });
      }

      // Optimistic append
      if (!isGroup) {
        setMessages((prev: ChatMessage[]) => {
          const newArr: ChatMessage[] = [
            ...prev,
            {
              role: "user" as const,
              content: contentBlocks,
              timestamp: Date.now(),
              ...(roomAudienceAgentIds ? { roomAudienceAgentIds } : {}),
            },
          ];
          return newArr.slice(-20) as ChatMessage[];
        });
      }
    } catch (err: unknown) {
      console.error("Failed to send message", err);
      const errMsg = err instanceof Error ? err.message : "无法即时联络目标成员";
      toast.error("指令发送失败", errMsg);
      setIsGenerating(false);
      return false;
    } finally {
      setSending(false);
    }
    return true;
  };

  const handleClearSession = async (reason: "new" | "reset" = "reset") => {
    if (!sessionKey) {
      return false;
    }
    try {
      const archivedMessages = createRoundMessageSnapshots(messages);
      const archivedWorkItemId =
        conversationMissionRecord?.id ?? persistedWorkItem?.id ?? groupWorkItemId ?? null;
      const archivedRoomId =
        (isGroup
          ? activeRequirementRoom?.id ??
            (groupWorkItemId ? buildRoomRecordIdFromWorkItem(groupWorkItemId) : sessionKey)
          : null) ?? null;
      const archivedTitle =
        activeConversationMission?.title ||
        persistedWorkItem?.title ||
        activeRequirementRoom?.title ||
        `${emp?.nickname ?? "当前负责人"} 对话`;
      const archivedPreview = buildRoundPreview(archivedMessages);
      const nextRound =
        activeCompany && !isArchiveView && archivedMessages.length > 0
          ? buildRoundRecord({
              companyId: activeCompany.id,
              title: archivedTitle,
              preview: archivedPreview,
              reason,
              workItemId: archivedWorkItemId,
              roomId: archivedRoomId,
              sourceActorId:
                historyAgentId ??
                conversationMissionRecord?.ownerAgentId ??
                persistedWorkItem?.ownerActorId ??
                emp?.agentId ??
                null,
              sourceActorLabel:
                emp?.nickname ??
                conversationMissionRecord?.ownerLabel ??
                persistedWorkItem?.ownerLabel ??
                activeRequirementRoom?.ownerAgentId ??
                null,
              sourceSessionKey: sessionKey,
              sourceConversationId: sessionKey,
              providerId,
              messages: archivedMessages,
              restorable: true,
            })
          : null;

      await AgentOps.resetSession(sessionKey, reason);
      if (nextRound) {
        upsertRoundRecord(nextRound);
      }
      if (isArchiveView) {
        const nextSearchParams = new URLSearchParams(location.search);
        nextSearchParams.delete("archive");
        const nextSearch = nextSearchParams.toString();
        navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true });
      }
      setMessages([]); // Immediately clear UI
      setLocalProgressEvents([]);
      setActionWatches([]);
      setIsSummaryOpen(false);
      setIsTechnicalSummaryOpen(false);
      setIsGenerating(false);
      updateStreamText(null);
      setHistoryRefreshNonce((value) => value + 1);
      return true;
    } catch (err) {
      console.error("Failed to reset session:", err);
      return false;
    }
  };

  const navigateToCurrentConversation = useCallback(() => {
    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.delete("archive");
    const nextSearch = nextSearchParams.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);
  }, [location.pathname, location.search, navigate]);

  const navigateToArchivedRound = useCallback(
    (nextArchiveId: string) => {
      const nextSearchParams = new URLSearchParams(location.search);
      nextSearchParams.set("archive", nextArchiveId);
      navigate(`${location.pathname}?${nextSearchParams.toString()}`);
    },
    [location.pathname, location.search, navigate],
  );

  const handleDeleteRecentSession = async (historySessionKey: string) => {
    if (!historySessionKey || historySessionKey === sessionKey || deletingHistorySessionKey) {
      return;
    }
    setDeletingHistorySessionKey(historySessionKey);
    try {
      const result = await gateway.deleteSession(historySessionKey);
      if (result.ok && result.deleted) {
        setRecentAgentSessions((previous) => previous.filter((session) => session.key !== historySessionKey));
        setHistoryRefreshNonce((value) => value + 1);
        toast.success("历史会话已删除", "它不会再出现在历史会话下拉里。");
      } else {
        toast.warning("删除未生效", "这个会话可能已经不存在，稍后刷新再看。");
      }
    } catch (error) {
      console.error("Failed to delete recent session", error);
      toast.error("删除历史会话失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setDeletingHistorySessionKey(null);
    }
  };

  const handleDeleteArchivedRound = async (historyArchiveId: string) => {
    if (!historyArchiveId || deletingArchiveId) {
      return;
    }
    setDeletingArchiveId(historyArchiveId);
    try {
      const localRound = productArchivedRounds.find((round) => round.id === historyArchiveId) ?? null;
      if (localRound) {
        deleteRoundRecord(historyArchiveId);
        setHistoryRefreshNonce((value) => value + 1);
        if (archiveId === historyArchiveId) {
          navigateToCurrentConversation();
        }
        toast.success("归档轮次已删除", "它不会再出现在归档历史里。");
      } else if (historyAgentId) {
        const result = await gateway.deleteSessionArchive(historyAgentId, historyArchiveId);
        if (result.ok && result.removed) {
          setRecentArchivedRounds((previous) =>
            previous.filter((archive) => archive.id !== historyArchiveId),
          );
          setHistoryRefreshNonce((value) => value + 1);
          if (archiveId === historyArchiveId) {
            navigateToCurrentConversation();
          }
          toast.success("归档轮次已删除", "它不会再出现在归档历史里。");
        } else {
          toast.warning("删除未生效", "这个归档轮次可能已经不存在，稍后刷新再看。");
        }
      } else {
        toast.warning("删除未生效", "当前无法定位这条归档轮次。");
      }
    } catch (error) {
      console.error("Failed to delete archived round", error);
      toast.error("删除归档轮次失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setDeletingArchiveId(null);
    }
  };

  const handleRestoreArchivedRound = async (historyArchiveId: string) => {
    if (!historyArchiveId || !sessionKey || restoringArchiveId) {
      return;
    }
    setRestoringArchiveId(historyArchiveId);
    try {
      const localRound = productArchivedRounds.find((round) => round.id === historyArchiveId) ?? null;
      if (localRound) {
        if (localRound.providerArchiveId && supportsSessionArchiveRestore && historyAgentId) {
          const result = await gateway.restoreSessionArchive(
            historyAgentId,
            localRound.providerArchiveId,
            sessionKey,
          );
          if (result.ok) {
            setLoading(true);
            setMessages([]);
            setLocalProgressEvents([]);
            setActionWatches([]);
            setIsSummaryOpen(false);
            setIsTechnicalSummaryOpen(false);
            setIsGenerating(false);
            updateStreamText(null);
            setHistoryRefreshNonce((value) => value + 1);
            navigateToCurrentConversation();
            toast.success("归档已恢复为当前会话", "你可以继续在这条会话上接着聊。");
          }
        } else {
          await AgentOps.resetSession(sessionKey, "reset");
          await gateway.sendChatMessage(
            sessionKey,
            buildProductRoundRestorePrompt(
              localRound,
              emp?.nickname ?? localRound.sourceActorLabel ?? "当前负责人",
            ),
            { timeoutMs: 300_000 },
          );
          setLoading(true);
          setMessages([]);
          setLocalProgressEvents([]);
          setActionWatches([]);
          setIsSummaryOpen(false);
          setIsTechnicalSummaryOpen(false);
          setIsGenerating(true);
          updateStreamText(null);
          setHistoryRefreshNonce((value) => value + 1);
          navigateToCurrentConversation();
          toast.success("产品归档已恢复到当前会话", "系统已把这轮摘要重新发给负责人继续接住。");
        }
      } else if (historyAgentId) {
        const result = await gateway.restoreSessionArchive(historyAgentId, historyArchiveId, sessionKey);
        if (result.ok) {
          setLoading(true);
          setMessages([]);
          setLocalProgressEvents([]);
          setActionWatches([]);
          setIsSummaryOpen(false);
          setIsTechnicalSummaryOpen(false);
          setIsGenerating(false);
          updateStreamText(null);
          setHistoryRefreshNonce((value) => value + 1);
          navigateToCurrentConversation();
          toast.success("归档已恢复为当前会话", "你可以继续在这条会话上接着聊。");
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试";
      if (/unknown method:\s*sessions\.archives\.restore/i.test(message)) {
        toast.warning(
          "当前 Gateway 版本还不支持归档恢复",
          "升级 Gateway 后，就可以把旧轮次直接恢复成当前会话。",
        );
      } else {
        console.error("Failed to restore archived round", error);
        toast.error("恢复归档轮次失败", message);
      }
    } finally {
      setRestoringArchiveId(null);
    }
  };

  const renderContent = (
    content: unknown,
    isDarkBg: boolean = false,
    opts?: { hideTaskTrackerPanel?: boolean; hideToolActivityBlocks?: boolean },
  ) => {
    const proseClass = isDarkBg
      ? "prose prose-sm max-w-none w-full break-words prose-invert prose-p:leading-relaxed prose-pre:bg-black/20 prose-pre:border prose-pre:border-white/10"
      : "prose prose-sm max-w-none w-full break-words prose-p:leading-relaxed prose-pre:bg-slate-50 prose-pre:text-slate-800 prose-code:text-slate-800 prose-pre:border prose-pre:border-slate-200";
    const plainTextClass = isDarkBg
      ? "w-full whitespace-pre-wrap break-words text-sm leading-7 text-white/95"
      : "w-full whitespace-pre-wrap break-words text-sm leading-7 text-slate-800";

    const formatPossibleJson = (text: string) => {
      const t = text.trim();
      if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
        try {
          JSON.parse(t);
          return "```json\n" + t + "\n```";
        } catch {
          return text;
        }
      }
      return text;
    };

    const normalizeRenderableText = (text: string) =>
      stripChatControlMetadata(text)
        .replace(/\bANNOUNCE_SKIP\b/g, "")
        .trim();

    const renderRichOrPlainText = (text: string) => {
      if (!hasRichMarkdownSyntax(text)) {
        return <div className={plainTextClass}>{text}</div>;
      }

      return (
        <Suspense fallback={<div className={plainTextClass}>{text}</div>}>
          <ChatMarkdownContent text={text} proseClassName={proseClass} />
        </Suspense>
      );
    };

    if (typeof content === "string") {
      const normalizedContent = normalizeRenderableText(content);
      const tracker = extractTaskTracker(normalizedContent);
      // If the dedicated tracker panel is hidden, keep the original prose intact in the
      // chat bubble; otherwise the reply can look empty even though the assistant answered.
      const cleanText =
        tracker && !opts?.hideTaskTrackerPanel
          ? stripTaskTrackerSection(normalizedContent)
          : normalizedContent;

      const hrPlan = parseHrDepartmentPlan(cleanText);
      const textWithoutHrPlan = hrPlan
        ? cleanText.replace(/```json\s*[\s\S]*?\s*```/i, "").trim()
        : cleanText;

      const finalText = formatPossibleJson(textWithoutHrPlan);

      return (
        <div className="w-full">
          {hrPlan && <HrDepartmentPlanCard plan={hrPlan} />}
          {finalText && renderRichOrPlainText(finalText)}
          {tracker ? opts?.hideTaskTrackerPanel ? <TaskTrackerHint /> : <TaskTrackerPanel items={tracker} /> : null}
        </div>
      );
    }
    if (Array.isArray(content)) {
      return (
        <div className="space-y-2 w-full max-w-full">
          {content.map((block, idx) => {
            const normalizedBlock =
              typeof block === "object" && block ? (block as ChatBlock) : null;
            const blockType = normalizeChatBlockType(normalizedBlock?.type);
            if (blockType === "text" && normalizedBlock?.text) {
              const normalizedText = normalizeRenderableText(normalizedBlock.text);
              const tracker = extractTaskTracker(normalizedText);
              // Reuse the same tracker-stripper used by summaries so prose survives when
              // a tracker is followed by bracket sections like `【当前状态】`.
              const cleanText =
                tracker && !opts?.hideTaskTrackerPanel
                  ? stripTaskTrackerSection(normalizedText)
                  : normalizedText;

              const hrPlan = parseHrDepartmentPlan(cleanText);
              const textWithoutHrPlan = hrPlan
                ? cleanText.replace(/```json\s*[\s\S]*?\s*```/i, "").trim()
                : cleanText;

              const finalText = formatPossibleJson(textWithoutHrPlan);
              return (
                <div key={idx} className="w-full">
                  {hrPlan && <HrDepartmentPlanCard plan={hrPlan} />}
                  {finalText && renderRichOrPlainText(finalText)}
                  {tracker ? opts?.hideTaskTrackerPanel ? <TaskTrackerHint /> : <TaskTrackerPanel items={tracker} /> : null}
                </div>
              );
            }
            if (blockType === "tool_use" || blockType === "tool_call") {
              if (opts?.hideToolActivityBlocks !== false) {
                return null;
              }
              const toolName = describeToolName(normalizedBlock?.name?.trim() ?? null);
              const friendlyText =
                activeRunIdRef.current && streamText?.includes("search")
                  ? "系统正在检索所需信息。"
                  : activeRunIdRef.current && streamText?.includes("write")
                    ? "系统正在整理并写入产物。"
                    : activeRunIdRef.current && streamText?.includes("read")
                      ? "系统正在读取上下文和资料。"
                      : activeRunIdRef.current &&
                          (streamText?.includes("run") || streamText?.includes("terminal"))
                        ? "系统正在执行当前步骤。"
                        : "系统正在处理这一步。";
              return (
                <div
                  key={idx}
                  className="my-2 flex items-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50 p-2.5 text-xs font-medium text-slate-600 shadow-sm"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                    <RefreshCcw className="h-3 w-3 animate-spin text-slate-400" />
                  </span>
                  {friendlyText}
                  <span className="ml-auto rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                    {toolName}
                  </span>
                </div>
              );
            }
            if (blockType === "tool_result") {
              if (opts?.hideToolActivityBlocks !== false) {
                return null;
              }
              const resultText =
                typeof normalizedBlock?.text === "string"
                  ? summarizeToolResultText(normalizedBlock.text)
                  : "执行完成，结果已回传。";
              return (
                <div
                  key={idx}
                  className="my-1 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-[11px] text-emerald-800"
                >
                  <span className="font-semibold">系统回执</span>
                  <div className="mt-1 leading-5">{resultText}</div>
                </div>
              );
            }
            // 屏蔽对位置结构的丑陋打印，改为静默忽略不认识的块或打印为小字
            return null;
          })}
        </div>
      );
    }
    return null;
  };

  const displayItems = useMemo(
    () => buildChatDisplayItems(messages, { hideToolItems: true }),
    [messages],
  );

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">
        正在建立会话连接...
      </div>
    );
  }

  if (!agentId || (!emp && !isGroup)) {
    return <div className="p-8 text-center">未找到这个成员会话或对应的群聊</div>;
  }

  // 检测所有 @mentions 并解析为员工
  const extractMentionedAgents = (text: string) => {
    if (!activeCompany) {
      return [];
    }
    const mentions = text.matchAll(createChatMentionRegex());
    const found: import("../features/company/types").EmployeeRef[] = [];
    const seen = new Set<string>();
    for (const m of mentions) {
      const token = (m[1] ?? "").trim();
      if (!token) {
        continue;
      }
      const normalizedToken = token.toLowerCase();
      if (seen.has(normalizedToken)) {
        continue;
      }
      seen.add(normalizedToken);
      const matched =
        activeCompany.employees.find((employee) => {
          const values = [employee.agentId, employee.nickname, employee.role]
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean);
          return values.some(
            (value) =>
              value === normalizedToken ||
              value.includes(normalizedToken) ||
              normalizedToken.includes(value),
          );
        }) ?? null;
      if (matched) {
        found.push(matched);
      }
    }
    return found;
  };

  const getSenderIdentity = (msg: ChatMessage): SenderIdentity => {
    const rawText = extractTextFromMessage(msg);
    const provenance =
      typeof msg.provenance === "object" && msg.provenance
        ? (msg.provenance as Record<string, unknown>)
        : null;
    const sourceSessionKey =
      provenance && typeof provenance.sourceSessionKey === "string"
        ? provenance.sourceSessionKey
        : null;
    const sourceTool =
      provenance && typeof provenance.sourceTool === "string" ? provenance.sourceTool : null;
    const sourceAgentId = parseAgentIdFromSessionKey(sourceSessionKey ?? "");
    const sourcedEmployee =
      sourceAgentId && activeCompany
        ? activeCompany.employees.find((employee) => employee.agentId === sourceAgentId) ?? null
        : null;

    const roomAgentId =
      typeof msg.roomAgentId === "string" && msg.roomAgentId.length > 0
        ? msg.roomAgentId
        : sourceAgentId;
    const roomEmployee =
      roomAgentId && activeCompany
        ? activeCompany.employees.find((employee) => employee.agentId === roomAgentId) ?? null
        : null;
    const roomSessionAgentId =
      typeof msg.roomSessionKey === "string" ? parseAgentIdFromSessionKey(msg.roomSessionKey) : null;
    const roomSessionEmployee =
      roomSessionAgentId && activeCompany
        ? activeCompany.employees.find((employee) => employee.agentId === roomSessionAgentId) ?? null
        : null;

    if (msg.role === "assistant" && isGroup && roomEmployee) {
      return {
        name: roomEmployee.nickname,
        avatarSeed: roomEmployee.agentId,
        isOutgoing: false,
        isRelayed: false,
        badgeLabel: roomEmployee.agentId === effectiveOwnerAgentId ? "当前负责人" : "团队成员",
        badgeTone: roomEmployee.agentId === effectiveOwnerAgentId ? "amber" : "indigo",
        metaLabel: roomEmployee.role,
      };
    }

    if (msg.role === "assistant") {
      return {
        name: isGroup ? "需求团队成员" : emp?.nickname || "Agent",
        avatarSeed: isGroup ? groupTopic || "group" : emp?.agentId,
        isOutgoing: false,
        isRelayed: false,
        metaLabel: isGroup ? "需求团队房间" : emp?.role,
      };
    }

    if (msg.role === "toolResult") {
      return {
        name: "系统",
        avatarSeed: "system",
        isOutgoing: false,
        isRelayed: false,
        badgeLabel: "工具回执",
        badgeTone: "indigo",
        metaLabel:
          typeof msg.toolName === "string" && msg.toolName.trim().length > 0
            ? describeToolName(msg.toolName.trim())
            : "系统回执",
      };
    }

    if (sourcedEmployee) {
      return {
        name: sourcedEmployee.nickname,
        avatarSeed: sourcedEmployee.agentId,
        isOutgoing: false,
        isRelayed: true,
        badgeLabel: sourceTool === "sessions_send" ? "协作回传" : "跨会话消息",
        badgeTone: "indigo",
        metaLabel: sourcedEmployee.role,
      };
    }

    if (isGroup && msg.role === "user" && roomSessionEmployee) {
      return {
        name: roomSessionEmployee.nickname,
        avatarSeed: roomSessionEmployee.agentId,
        isOutgoing: false,
        isRelayed: true,
        badgeLabel: "成员同步",
        badgeTone: "indigo",
        metaLabel: roomSessionEmployee.role,
      };
    }

    const extractedName = rawText ? extractNameFromMessage(rawText) : null;
    if (extractedName && msg.role === "user") {
      return {
        name: extractedName.length > 10 ? "外部消息" : extractedName,
        avatarSeed: extractedName,
        isOutgoing: false,
        isRelayed: true,
        badgeLabel: isGroup ? "团队转述" : "代传消息",
        badgeTone: "amber",
        metaLabel: isGroup ? "来自需求团队房间" : "来源未完全确认",
      };
    }

    if (msg.role !== "user") {
      return {
        name: "系统",
        avatarSeed: "system",
        isOutgoing: false,
        isRelayed: false,
        badgeLabel: "系统消息",
        badgeTone: "indigo",
      };
    }

    return {
      name: "我",
      avatarSeed: "me",
      isOutgoing: true,
      isRelayed: false,
      metaLabel:
        isGroup && Array.isArray(msg.roomAudienceAgentIds) && msg.roomAudienceAgentIds.length > 0
          ? (() => {
              const labels = msg.roomAudienceAgentIds
                .map((agentId) => activeCompany?.employees.find((employee) => employee.agentId === agentId)?.nickname)
                .filter((label): label is string => Boolean(label));
              if (labels.length === 0) {
                return "已发送到团队房间";
              }
              if (labels.length >= requirementRoomSessions.length && requirementRoomSessions.length > 0) {
                return "已发送给全体成员";
              }
              return `已发送给 ${labels.slice(0, 3).join("、")}${labels.length > 3 ? ` +${labels.length - 3}` : ""}`;
            })()
          : undefined,
    };
  };

  const processTextFileUpload = async (file: File) => {
    if (!file) {
      return;
    }
    if (file.size > 1024 * 1024 * 5) {
      toast.error("文件过大，请上传 5MB 以内的纯文本参考文件。");
      return;
    }
    setUploadingFile(true);
    try {
      const textContent = await file.text();
      let uploadCount = 0;
      if (isGroup) {
        // 分发到所有参会 Agent 的工作区中
        for (const memberId of groupMembers) {
          await gateway.setAgentFile(memberId, file.name, textContent);
          uploadCount++;
        }
      } else if (emp?.agentId) {
        await gateway.setAgentFile(emp.agentId, file.name, textContent);
        uploadCount = 1;
      }

      if (uploadCount > 0) {
        toast.success(`文件 ${file.name} 已同步到 ${uploadCount} 个成员工作区。`);
        setComposerPrefill({
          id: Date.now(),
          text: `请参考我刚刚传到工作区里的 ${file.name} 文件`,
        });
      }
    } catch (e) {
      console.error(e);
      toast.error(`上传失败: ${String(e)}`);
    } finally {
      setUploadingFile(false);
    }
  };

  const processImageFile = (file: File) => {
    if (file.size > 1024 * 1024 * 5) {
      toast.error("图片过大，请上传 5MB 以内的图片。");
      return;
    }
    setUploadingFile(true);
    const reader = new FileReader();
    reader.addEventListener("load", (e) => {
      const b64 = e.target?.result;
      if (typeof b64 === "string") {
        setAttachments((prev) => [
          ...prev,
          {
            mimeType: file.type,
            dataUrl: b64,
          },
        ]);
      }
      setUploadingFile(false);
    });
    reader.addEventListener("error", () => {
      toast.error("图片读取失败");
      setUploadingFile(false);
    });
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (file.type.startsWith("image/")) {
        processImageFile(file);
      } else {
        processTextFileUpload(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith("image/")) {
        processImageFile(file);
      } else {
        processTextFileUpload(file);
      }
    }
    // reset
    e.target.value = "";
  };

  const progressGroupSummary = displayRequirementProgressGroups
    ? {
        working: formatRequirementGroupSummary(displayRequirementProgressGroups.working, "当前没有人在执行。"),
        waiting: formatRequirementGroupSummary(displayRequirementProgressGroups.waiting, "当前没有等待接棒的节点。"),
        completed: formatRequirementGroupSummary(displayRequirementProgressGroups.completed, "当前还没有完成节点。"),
      }
    : null;

  const latestProgressDisplay = latestProgressEvent
    ? {
        id: latestProgressEvent.id,
        timestamp: latestProgressEvent.timestamp,
        actorLabel: latestProgressEvent.actorLabel,
        title: formatLifecycleEventTitle(latestProgressEvent),
        summary: formatLifecycleEventSummary(latestProgressEvent),
        detail: latestProgressEvent.detail,
        tone: latestProgressEvent.tone,
      }
    : null;

  const actionWatchCards = actionWatches.slice(0, 3).map((watch) => ({
    id: watch.id,
    title: watch.kind === "handoff" ? `等待 ${watch.targetLabel} 接棒` : `等待 ${watch.targetLabel} 回执`,
    description:
      watch.kind === "handoff"
        ? "上一棒已经发出，当前在等下一棒真正接住任务并回传。"
        : "负责人动作已经发出，当前在等新的明确反馈。",
    elapsedLabel: `已等待 ${formatWatchElapsed(watch.startedAt)}`,
  }));

  const teamMemberCards = requirementTeam
    ? requirementTeam.members.map((member) => {
        const adjustAction = buildTeamAdjustmentAction(member);
        return {
          ...member,
          adjustAction,
          isAdjustLoading: runningFocusActionId === adjustAction.id,
        };
      })
    : [];

  return (
    <div
      className="flex flex-col h-full bg-slate-50/50 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 拖拽上传遮罩 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-indigo-500/10 backdrop-blur-[2px] border-4 border-dashed border-indigo-400 rounded-xl m-2 flex flex-col items-center justify-center transition-all pointer-events-none">
          <UploadCloud className="w-16 h-16 text-indigo-500 mb-4 animate-bounce" />
          <h3 className="text-2xl font-bold text-indigo-600 mb-2">松手以投送文件</h3>
          <p className="text-indigo-500/80">
            文件将被推送至 {isGroup ? "全体参会成员" : emp?.nickname} 的工作区
          </p>
        </div>
      )}
      {/* Header */}
      <header className="flex h-16 items-center flex-none border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Avatar className="h-10 w-10 border border-slate-200 shadow-sm bg-slate-50 rounded-lg">
            <AvatarImage
              src={
                isGroup
                  ? `https://api.dicebear.com/7.x/shapes/svg?seed=${groupTopic}`
                  : getAvatarUrl(emp?.agentId, emp?.avatarJobId)
              }
              className="object-cover"
            />
            <AvatarFallback className="bg-slate-100 text-slate-500 font-mono text-xs rounded-lg">
              {isGroup ? "GRP" : emp?.nickname.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
            <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-900">
                {isGroup ? `需求团队: ${groupTitle}` : emp?.nickname}
              </span>
              {isArchiveView ? (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                  已归档
                </span>
              ) : requirementOverview || isRequirementBootstrapPending ? (
                <span className={headerStatusBadgeClass}>{effectiveStatusLabel}</span>
              ) : (
                <ExecutionStateBadge compact status={sessionExecution} />
              )}
            </div>
            <span className="text-[10px] text-slate-500">
              {isArchiveView ? "归档轮次（只读）" : isGroup ? "需求团队房间" : emp?.role}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 px-2 py-1.5 rounded-md border border-slate-100">
            {sessionKey ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)] animate-pulse"></div>
                <span className="select-none">会话已连接</span>
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                <span className="select-none">准备中...</span>
              </>
            )}
          </div>
          {!isGroup && (historyLoading || canShowSessionHistory) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                  title="查看并切换历史会话"
                >
                  <History className="h-3.5 w-3.5" />
                  历史会话
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 z-50 bg-white">
                <DropdownMenuLabel>当前 agent 的历史记录</DropdownMenuLabel>
                {isArchiveView ? (
                  <DropdownMenuItem
                    onClick={navigateToCurrentConversation}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>返回当前会话</span>
                    <span className="text-[11px] text-slate-400">live</span>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onClick={() => void handleClearSession("new")}
                  disabled={!sessionKey || sending || isGenerating}
                  className="flex items-center justify-between gap-3"
                >
                  <span>开启新会话</span>
                  <span className="text-[11px] text-slate-400">/new</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {historyLoading ? (
                  <DropdownMenuItem disabled>正在加载历史会话...</DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuLabel className="text-[11px] text-slate-400">当前会话</DropdownMenuLabel>
                    {!supportsSessionHistory ? (
                      <DropdownMenuItem disabled className="whitespace-normal text-[11px] leading-5 text-slate-500">
                        当前后端暂不支持历史会话列表。
                      </DropdownMenuItem>
                    ) : recentAgentSessions.length === 0 ? (
                      <DropdownMenuItem disabled>暂无当前会话</DropdownMenuItem>
                    ) : (
                      recentAgentSessions.map((session) => {
                        const isCurrentLiveSession = session.key === sessionKey && !isArchiveView;
                        return (
                          <div
                            key={session.key}
                            className={cn(
                              "flex items-start gap-2 rounded-md px-2 py-2",
                              isCurrentLiveSession ? "bg-slate-50" : "hover:bg-slate-50",
                            )}
                          >
                            <button
                              type="button"
                              disabled={isCurrentLiveSession}
                              onClick={() => navigate(`/chat/${encodeURIComponent(session.key)}`)}
                              className="min-w-0 flex-1 text-left disabled:cursor-default"
                            >
                              <div className="flex w-full items-center justify-between gap-2">
                                <span className="line-clamp-1 text-sm font-medium text-slate-800">
                                  {resolveSessionTitle(session)}
                                </span>
                                {isCurrentLiveSession ? (
                                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700">
                                    当前
                                  </span>
                                ) : null}
                              </div>
                              <div className="line-clamp-1 w-full text-[11px] text-slate-500">
                                最后活跃于 {formatTime(resolveSessionUpdatedAt(session) || undefined)}
                              </div>
                            </button>
                            {!isCurrentLiveSession ? (
                              <button
                                type="button"
                                disabled={deletingHistorySessionKey === session.key}
                                onClick={() => void handleDeleteRecentSession(session.key)}
                                className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                title="删除这条历史会话"
                              >
                                {deletingHistorySessionKey === session.key ? (
                                  <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[11px] text-slate-400">归档轮次</DropdownMenuLabel>
                    {historyRoundItems.length === 0 && !supportsSessionArchives ? (
                      <DropdownMenuItem disabled className="whitespace-normal text-[11px] leading-5 text-slate-500">
                        当前后端暂不支持归档轮次。
                      </DropdownMenuItem>
                    ) : archiveSectionNotice ? (
                      <DropdownMenuItem disabled className="whitespace-normal text-[11px] leading-5 text-amber-700">
                        {archiveSectionNotice}
                      </DropdownMenuItem>
                    ) : historyRoundItems.length === 0 ? (
                      <DropdownMenuItem disabled>暂无归档轮次</DropdownMenuItem>
                    ) : (
                      historyRoundItems.map((archive) => {
                        const isCurrentArchive = archive.id === archiveId;
                        const canRestoreArchive =
                          Boolean(sessionKey) &&
                          (archive.source === "product" || supportsSessionArchiveRestore);
                        return (
                          <div
                            key={archive.id}
                            className={cn(
                              "flex items-start gap-2 rounded-md px-2 py-2",
                              isCurrentArchive ? "bg-slate-50" : "hover:bg-slate-50",
                            )}
                          >
                            <button
                              type="button"
                              disabled={isCurrentArchive}
                              onClick={() => navigateToArchivedRound(archive.id)}
                              className="min-w-0 flex-1 text-left disabled:cursor-default"
                            >
                              <div className="flex w-full items-center justify-between gap-2">
                                <span className="line-clamp-1 text-sm font-medium text-slate-800">
                                  {archive.title || archive.fileName}
                                </span>
                                <div className="flex items-center gap-1">
                                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700">
                                    {archive.source === "product" ? "产品归档" : "后端归档"}
                                  </span>
                                  {isCurrentArchive ? (
                                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700">
                                      查看中
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="line-clamp-1 w-full text-[11px] text-slate-500">
                                归档于 {formatTime(archive.archivedAt)}
                                {archive.preview ? ` · ${archive.preview}` : ""}
                              </div>
                            </button>
                            <button
                              type="button"
                              disabled={!canRestoreArchive || restoringArchiveId === archive.id}
                              onClick={() => void handleRestoreArchivedRound(archive.id)}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                              title="把这条归档恢复成当前会话"
                            >
                              {restoringArchiveId === archive.id ? "恢复中" : "恢复"}
                            </button>
                            <button
                              type="button"
                              disabled={deletingArchiveId === archive.id}
                              onClick={() => void handleDeleteArchivedRound(archive.id)}
                              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              title="删除这条归档轮次"
                            >
                              {deletingArchiveId === archive.id ? (
                                <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {sessionKey && (
            <button
              onClick={() => void handleClearSession()}
              disabled={sending || isGenerating}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
              title="一键清理对话记忆"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {isGenerating && (
            <button
              onClick={() => AgentOps.stopTask(sessionKey!, activeRunIdRef.current ?? undefined)}
              className="ml-2 hover:bg-slate-200/50 p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
              title="强行中止所有下级进程"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {isArchiveView ? (
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-col gap-1 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <span className="font-semibold text-slate-900">正在查看归档轮次。</span>
              <span className="ml-2 text-slate-600">
                这里只读显示你之前跟 {emp?.nickname ?? "当前 agent"} 的旧记录，不会覆盖当前 live 会话。
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void handleRestoreArchivedRound(archiveId!)}
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
                onClick={navigateToCurrentConversation}
              >
                返回当前会话
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!isArchiveView ? (
        <>
      <Dialog.Root
        open={isSummaryOpen}
        onOpenChange={(open) => {
          setIsSummaryOpen(open);
          if (!open) {
            setIsTechnicalSummaryOpen(false);
          }
        }}
      >
	      <div className="border-b border-slate-200 bg-white/80 shadow-sm">
        <div className="px-6 py-2.5">
	          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-2.5">
	            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
	              <div className="min-w-0 flex-1">
	                <div className="flex flex-wrap items-center gap-2">
                  {activeConversationMission || requirementOverview || isRequirementBootstrapPending ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {isGroup ? "房间状态" : isRequirementBootstrapPending ? "恢复中" : "本轮规划/任务"}
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
	                </div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">
                    <span className="font-medium text-slate-700">当前负责人：</span>
                    {effectiveOwnerLabel}
                    {" · "}
                    <span className="font-medium text-slate-700">当前待办：</span>
                    {effectiveStage}
                    {" · "}
                    <span className="font-medium text-slate-700">下一棒：</span>
                    {displayNextBatonLabel}
	                </div>
		              </div>
		              <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {missionIsCompleted ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      onClick={() => void handleClearSession()}
                      disabled={sending || isGenerating}
                    >
                      开启下一轮规划/任务
                      </Button>
                    ) : null}
		                {primaryOpenAction ? (
		                  <Button
		                    type="button"
		                    size="sm"
		                    variant={primaryOpenAction.kind === "message" ? "default" : "outline"}
		                    className={
		                      primaryOpenAction.kind === "message"
		                        ? "bg-slate-900 text-white hover:bg-slate-800"
		                        : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
		                    }
		                    onClick={() => void handleFocusAction(primaryOpenAction)}
		                  >
		                    {primaryOpenAction.label}
		                  </Button>
		                ) : null}
		                {showRequirementTeamEntry ? (
		                  <Button
		                    type="button"
		                    size="sm"
		                    variant="outline"
		                    className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
	                    onClick={() => {
                        if (teamGroupRoute) {
                          navigate(teamGroupRoute);
                          return;
                        }
                        openSummaryPanel("team");
                      }}
	                  >
		                    <Users className="mr-2 h-3.5 w-3.5" />
		                    {teamGroupRoute ? "打开需求团队房间" : "查看需求团队"}
		                  </Button>
		                ) : null}
	                {hasContextSummary ? (
	                  <button
	                    type="button"
	                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50"
	                    onClick={() => openSummaryPanel("owner")}
	                  >
	                    <ChevronDown className="h-3.5 w-3.5" />
	                    {isSummaryOpen ? "规划/任务面板已开" : "查看规划/任务面板"}
	                  </button>
	                ) : null}
		              </div>
		            </div>
		          </div>
		        </div>
	      </div>
	        {hasContextSummary && isSummaryOpen ? (
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/20 backdrop-blur-[1px]" />
            <Dialog.Content className="fixed inset-y-0 right-0 z-[81] w-full max-w-[min(100vw,42rem)] border-l border-slate-200 bg-white shadow-2xl focus:outline-none">
              <div className="flex h-full flex-col">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Dialog.Title className="text-base font-semibold text-slate-900">规划/任务面板</Dialog.Title>
                      <Dialog.Description className="mt-1 text-sm leading-6 text-slate-500">
                        聊天流和规划/任务流分开看。这里集中看本轮 plan、进度、当前卡点和下一步。
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
                      <span className="text-sm font-semibold text-slate-900">
                        {summaryPanelView === "team" ? "需求团队房间" : summaryPanelView === "debug" ? "调试信息" : effectiveHeadline}
                      </span>
                      {summaryPanelView !== "debug" ? <span className={headerStatusBadgeClass}>{effectiveStatusLabel}</span> : null}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-600">
                      {summaryPanelView === "team"
                        ? `负责人：${effectiveOwnerLabel} · 当前 baton：${requirementTeam?.batonLabel ?? effectiveOwnerLabel} · 下一棒：${displayNextBatonLabel}`
                        : summaryPanelView === "debug"
                          ? "这里只保留系统对象、闭环、交接和异常数据。"
                          : `当前负责人：${effectiveOwnerLabel} · 当前环节：${effectiveStage}`}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      {summaryPanelView === "team"
                        ? "这里按群聊式时间线展示团队成员的结论性发言、交付物和 baton，不展示工具噪音。"
                        : summaryPanelView === "debug"
                          ? "普通使用时可以不看；只有在排障、查闭环或核对内部对象时再打开。"
                          : effectiveActionHint}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSummaryPanelView("owner")}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        summaryPanelView === "owner"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      负责人视角
                    </button>
                    {requirementTeam ? (
                      <button
                        type="button"
                        onClick={() => setSummaryPanelView("team")}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          summaryPanelView === "team"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        需求团队
                      </button>
                    ) : null}
                    {hasTechnicalSummary ? (
                      <button
                        type="button"
                        onClick={() => setSummaryPanelView("debug")}
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
                      activeConversationMission={activeConversationMission}
                      latestStageGate={latestStageGate}
                      isRequirementBootstrapPending={isRequirementBootstrapPending}
                      progressGroupSummary={progressGroupSummary}
                      latestProgressDisplay={latestProgressDisplay}
                      missionIsCompleted={missionIsCompleted}
                      sending={sending}
                      isGenerating={isGenerating}
                      recentProgressEvents={recentProgressEvents}
                      actionWatchCards={actionWatchCards}
                      lifecycleSections={displayRequirementLifecycleSections ?? []}
                      collaborationLifecycle={collaborationLifecycle}
                      detailActions={detailActions}
                      runningFocusActionId={runningFocusActionId}
                      recoveringCommunication={recoveringCommunication}
                      requirementTeam={requirementTeam}
                      teamMemberCards={teamMemberCards}
                      displayNextBatonLabel={displayNextBatonLabel}
                      displayNextBatonAgentId={displayNextBatonAgentId}
                      targetAgentId={targetAgentId ?? null}
                      teamGroupRoute={teamGroupRoute}
                      primaryOpenAction={primaryOpenAction}
                      summaryRecoveryAction={summaryRecoveryAction}
                      hasTechnicalSummary={hasTechnicalSummary}
                      isTechnicalSummaryOpen={isTechnicalSummaryOpen}
                      takeoverPack={
                        takeoverPack
                          ? {
                              failureSummary: takeoverPack.failureSummary,
                              recommendedNextAction: takeoverPack.recommendedNextAction,
                            }
                          : null
                      }
                      structuredTaskPreview={
                        structuredTaskPreview
                          ? {
                              summary: structuredTaskPreview.summary ?? effectiveSummary,
                              state: structuredTaskPreview.state ?? null,
                            }
                          : null
                      }
                      hasRequirementOverview={Boolean(requirementOverview)}
                      headerStatusBadgeClass={headerStatusBadgeClass}
                      effectiveStatusLabel={effectiveStatusLabel}
                      effectiveSummary={effectiveSummary}
                      requestPreview={requestPreview}
                      requestHealth={requestHealth}
                      ceoSurface={ceoSurface}
                      orgAdvisorSummary={orgAdvisor?.summary ?? null}
                      handoffPreview={handoffPreview}
                      summaryAlertCount={summaryAlertCount}
                      relatedSlaAlertCount={relatedSlaAlerts.length}
                      localSlaFallbackAlertCount={localSlaFallbackAlerts.length}
                      onClearSession={() => void handleClearSession()}
                      onRunAction={(action) => void handleFocusAction(action)}
                      onNavigateToChat={(agentId) => navigate(`/chat/${encodeURIComponent(agentId)}`)}
                      onNavigateToTeamGroup={() => {
                        if (teamGroupRoute) {
                          navigate(teamGroupRoute);
                        }
                      }}
                      onToggleTechnicalSummary={() => setIsTechnicalSummaryOpen((open) => !open)}
                      onCopyTakeoverPack={handleCopyTakeoverPack}
                    />
                  </Suspense>
                </div>
              </div>
	            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </Dialog.Root>

      {!isGroup && latestDirectTurnSummary?.state === "waiting" ? (
        <div className="border-b border-amber-200 bg-amber-50/80 px-4 py-2 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl flex-col gap-1 text-sm text-amber-950 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <span className="font-semibold">{emp?.nickname ?? "负责人"} 还没有给出明确回复。</span>
              <span className="ml-2 text-amber-800/90">
                当前这轮问题：{latestDirectTurnSummary.questionPreview}
              </span>
            </div>
            <div className="shrink-0 text-[11px] text-amber-700">继续看正文即可；一旦回复出现，会直接显示在聊天流里。</div>
          </div>
        </div>
      ) : null}
        </>
      ) : null}

      {/* Messages */}
      <main
        ref={scrollContainerRef}
        onWheelCapture={(event) => {
          if (event.deltaY < -2) {
            userScrollLockRef.current = true;
            shouldAutoScrollRef.current = false;
            forceScrollOnNextUpdateRef.current = false;
            lockedScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? null;
          }
        }}
        onScroll={(event) => {
          const currentTop = event.currentTarget.scrollTop;
          if (programmaticScrollRef.current) {
            lastScrollTopRef.current = currentTop;
            return;
          }
          const nearBottom = isNearBottom(event.currentTarget);
          const movingUp = currentTop < lastScrollTopRef.current - 4;
          const leftAutoFollowZone = !nearBottom && shouldAutoScrollRef.current;

          if (movingUp || leftAutoFollowZone) {
            userScrollLockRef.current = true;
            shouldAutoScrollRef.current = false;
            forceScrollOnNextUpdateRef.current = false;
            lockedScrollTopRef.current = currentTop;
          } else if (nearBottom) {
            userScrollLockRef.current = false;
            shouldAutoScrollRef.current = true;
            lockedScrollTopRef.current = null;
          } else if (userScrollLockRef.current) {
            lockedScrollTopRef.current = currentTop;
          }

          lastScrollTopRef.current = currentTop;
        }}
        className="flex-1 overflow-y-auto p-3 md:p-6 space-y-6"
      >
        {displayItems.map((item) => {
          if (item.kind === "tool") {
            return (
              <div key={item.id} className="flex justify-center">
                <div
                  className={cn(
                    "w-full max-w-3xl rounded-2xl px-4 py-3 text-sm shadow-sm",
                    item.tone === "sky"
                      ? "border border-sky-200 bg-sky-50/90 text-sky-900"
                      : "border border-slate-200 bg-slate-50/90 text-slate-700",
                  )}
                >
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]",
                      item.tone === "sky" ? "text-sky-700" : "text-slate-500",
                    )}
                  >
                    <span>{item.title}</span>
                    {item.count > 1 ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px]",
                          item.tone === "sky" ? "bg-white/80 text-sky-700" : "bg-white/80 text-slate-500",
                        )}
                      >
                        x{item.count}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm leading-6">{item.detail}</div>
                </div>
              </div>
            );
          }

          const msg = item.message;
          const sender = getSenderIdentity(msg);
          const renderableContent = getRenderableMessageContent(msg.content);
          const bubbleContent = renderableContent ?? msg.content;

          return (
            <div
              key={item.id}
              className={`flex ${sender.isOutgoing ? "justify-end" : "justify-start"} group max-w-full`}
            >
              <div
                className={`flex gap-3 max-w-full lg:max-w-[95%] xl:max-w-[90%] ${sender.isOutgoing ? "flex-row-reverse" : "flex-row"}`}
              >
                {sender.isOutgoing ? (
                  <Avatar className="h-6 w-6 mt-1 border border-slate-200 bg-slate-100 rounded-md shrink-0">
                    <AvatarImage
                      src={getAvatarUrl(undefined, undefined, sender.avatarSeed)}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-zinc-800 text-zinc-500 rounded-md text-[10px] font-mono">
                      {sender.name.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Avatar className="w-8 h-8 shrink-0 border bg-white mt-1">
                    <AvatarImage src={`https://api.dicebear.com/7.x/bottts/svg?seed=${sender.avatarSeed}`} />
                  </Avatar>
                )}
                <div
                  className={`flex flex-col ${sender.isOutgoing ? "items-end" : "items-start"} min-w-0`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground select-none">
                      {sender.name} · {formatTime(msg.timestamp || undefined)}
                    </span>
                    {sender.metaLabel ? (
                      <span className="text-[10px] text-slate-400">{sender.metaLabel}</span>
                    ) : null}
                    {sender.badgeLabel ? (
                      <span
                        className={cn(
                          "text-[9px] font-medium px-1 py-0.5 rounded border",
                          sender.badgeTone === "amber"
                            ? "bg-amber-50 text-amber-700 border-amber-100"
                            : "bg-indigo-50 text-indigo-500 border-indigo-100",
                        )}
                      >
                        {sender.badgeLabel}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm shadow-sm max-w-full overflow-x-auto ${
                      sender.isOutgoing
                        ? "bg-indigo-600 text-white rounded-tr-sm"
                        : sender.isRelayed
                          ? "bg-slate-50 border border-slate-200/60 text-slate-800 rounded-tl-sm shadow-inner"
                          : msg.role === "assistant" && msg.text?.includes("## 📋 任务追踪")
                            ? "bg-indigo-600 text-white rounded-tl-sm shadow-indigo-500/20"
                            : "bg-white border text-slate-900 rounded-tl-sm"
                    }`}
                  >
                    {renderContent(
                      bubbleContent,
                      sender.isOutgoing ||
                        (msg.role === "assistant" && !!msg.text?.includes("## 📋 任务追踪")),
                      {
                        hideTaskTrackerPanel: isCeoSession && msg.role === "assistant",
                        hideToolActivityBlocks: true,
                      },
                    )}
                    {msg.role === "assistant" && (
                      <>
                        {(() => {
                          const txt = extractTextFromMessage(msg);
                          if (!txt) {
                            return null;
                          }
                          const mentions = extractMentionedAgents(txt);
                          if (mentions.length === 0) {
                            return null;
                          }
                          return (
                            <div className="mt-4 pt-3 border-t border-slate-200/60 space-y-2">
                              <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-2">
                                <span>🚀 检测到任务分派</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(!isCeoSession ? mentions : mentions.slice(0, 1)).map((m) => (
                                  <button
                                    key={m.agentId}
                                    onClick={() => navigate(`/chat/${m.agentId}`)}
                                    className="flex items-center gap-1.5 bg-white border border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50 px-2 py-1.5 rounded-lg shadow-sm transition-all group/btn"
                                  >
                                    <Avatar className="w-5 h-5 shrink-0 border border-indigo-100">
                                      <AvatarImage
                                        src={`https://api.dicebear.com/7.x/bottts/svg?seed=${m.agentId}`}
                                      />
                                    </Avatar>
                                    <span className="text-xs font-medium text-indigo-700">
                                      {m.nickname}
                                    </span>
                                    <span className="text-[10px] text-indigo-400 group-hover/btn:text-indigo-600 ml-1">
                                      → 直达
                                    </span>
                                  </button>
                                ))}
                                {activeCompany && mentions.length >= 2 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const groupRoute = buildGroupChatRoute({
                                        company: activeCompany,
                                        memberIds: mentions.map((member) => member.agentId),
                                        topic: resolveTaskTitle(txt, "任务小组"),
                                        topicKey:
                                          currentConversationRequirementHint?.topicKey ??
                                          requirementOverview?.topicKey ??
                                          inferRequestTopicKey([txt]) ??
                                          inferMissionTopicKey([txt]),
                                        workItemId:
                                          conversationMissionRecord?.id ??
                                          persistedWorkItem?.id ??
                                          groupWorkItemId ??
                                          null,
                                        preferredInitiatorAgentId: targetAgentId,
                                        existingRooms: activeRoomRecords,
                                      });
                                      if (groupRoute) {
                                        navigate(groupRoute);
                                      }
                                    }}
                                    className="flex items-center gap-1.5 bg-white border border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50 px-2 py-1.5 rounded-lg shadow-sm transition-all group/btn"
                                  >
                                    <Users className="w-4 h-4 text-emerald-600" />
                                    <span className="text-xs font-medium text-emerald-700">打开需求团队房间</span>
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {displayItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-3 opacity-50">
            <Sparkles className="w-10 h-10" />
            <p className="text-sm">作为老板，请下达您的第一项指示</p>
          </div>
        )}
        {streamText && (
          <div className="flex justify-start group max-w-full">
            <div className="flex gap-3 max-w-full lg:max-w-[95%] xl:max-w-[90%] flex-row">
              <Avatar className="w-8 h-8 shrink-0 border bg-white mt-1">
                <AvatarImage
                  src={`https://api.dicebear.com/7.x/bottts/svg?seed=${isGroup ? groupTopic : emp?.agentId}`}
                />
              </Avatar>
              <div className="flex flex-col items-start min-w-0">
                <span className="text-xs text-muted-foreground mb-1 select-none">
                  {isGroup ? "需求团队成员" : emp?.nickname} · 正在思考…
                </span>
                <div className="rounded-2xl px-4 py-3 text-sm shadow-sm bg-white border text-slate-900 rounded-tl-sm">
                  {renderContent([{ type: "text", text: streamText }])}
                </div>
              </div>
            </div>
          </div>
        )}
        {isGenerating && !streamText && (
          <div className="flex justify-start group max-w-full">
            <div className="flex gap-3 max-w-full lg:max-w-[95%] xl:max-w-[90%] flex-row">
              <Avatar className="w-8 h-8 shrink-0 border bg-white mt-1">
                <AvatarImage
                  src={`https://api.dicebear.com/7.x/bottts/svg?seed=${isGroup ? groupTopic : emp?.agentId}`}
                />
              </Avatar>
              <div className="flex flex-col items-start min-w-0">
                <span className="text-xs text-muted-foreground mb-1 select-none">
                  {isGroup ? "需求团队成员" : emp?.nickname} · 思考中...
                </span>
                <div className="rounded-2xl px-4 py-3 text-sm shadow-sm bg-white border text-slate-900 rounded-tl-sm flex items-center gap-2">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </main>

      {/* Input */}
      {!isArchiveView ? (
      <footer className="shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4 bg-white border-t relative">
        {isGenerating && (
          <div className="absolute -top-10 left-4 bg-white/90 backdrop-blur pb-1 px-4 py-2 border border-slate-200/60 shadow-sm rounded-t-xl rounded-r-xl text-xs -translate-y-2 z-20 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            <span>正在生成中...</span>
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          accept=".txt,.md,.json,.js,.ts,.csv,.yaml,.yml,.log,image/*"
        />
        <ChatComposer
          sessionIdentityKey={sessionKey ?? agentId ?? "unknown-session"}
          placeholder={
            isGroup
              ? "在需求团队房间里交流；输入 @成员名 定向派发，不写 @ 默认发给当前 baton / 负责人，切换“群发中”才会发给所有成员 (Enter 换行，Cmd/Ctrl+Enter 发送)..."
              : `向 ${emp?.nickname} 发送工作指令 (/new 新会话，Enter 换行，Cmd/Ctrl+Enter 发送)...`
          }
          sending={sending}
          uploadingFile={uploadingFile}
          attachments={attachments}
          broadcastMode={roomBroadcastMode}
          mentionCandidates={isGroup ? requirementRoomMentionCandidates : undefined}
          prefill={composerPrefill}
          showBroadcastToggle={isGroup}
          onBroadcastModeChange={setRoomBroadcastMode}
          onRemoveAttachment={(index) => setAttachments((arr) => arr.filter((_, i) => i !== index))}
          onPickFile={() => fileInputRef.current?.click()}
          onPasteImage={processImageFile}
          onSend={handleSend}
        />
      </footer>
      ) : null}
    </div>
  );
}
