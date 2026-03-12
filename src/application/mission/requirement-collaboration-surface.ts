import { formatAgentLabel } from "../governance/focus-summary";
import {
  isParticipantBlockingStatus,
  isParticipantCompletedStatus,
  isParticipantRunningStatus,
} from "./requirement-kind";
import { summarizeRequirementText } from "../../domain/mission/requirement-topic";
import type { RequirementParticipantProgress } from "./requirement-overview-types";
import type { PrimaryRequirementSurface } from "./primary-requirement-surface";
import type { Company } from "../../domain/org/types";
import type {
  HandoffRecord,
  RequestRecord,
} from "../../domain/delegation/types";
import type { WorkStepRecord } from "../../domain/mission/types";

export type RequirementExecutionTaskStatus =
  | "未启动"
  | "已派发"
  | "已接单"
  | "进行中"
  | "已提交待收口"
  | "已完成"
  | "已阻塞";

export type RequirementExecutionPlanTask = {
  id: string;
  index: number;
  title: string;
  ownerActorId: string | null;
  ownerLabel: string;
  status: RequirementExecutionTaskStatus;
  latestUpdateSummary: string;
  updatedAt: number | null;
};

export type RequirementExecutionPlan = {
  requirementId: string;
  tasks: RequirementExecutionPlanTask[];
  totalCount: number;
  doneCount: number;
  inProgressCount: number;
  blockedCount: number;
  progressPct: number;
  closable: boolean;
  closureHint: string;
};

export type RequirementCollaborationParticipant = {
  agentId: string;
  nickname: string;
  role: string;
  statusLabel: string;
  detail: string;
  updatedAt: number;
  isBlocking: boolean;
  isCurrent: boolean;
};

export type RequirementCollaborationSurface = {
  goalSummary: string;
  phaseLabel: string;
  collaborationLabel: string;
  activeParticipants: RequirementCollaborationParticipant[];
  activeParticipantsLabel: string;
  currentBlocker: string | null;
  latestConclusionSummary: string | null;
  isSingleOwnerClosure: boolean;
  closureOwnerActorId: string | null;
  closureOwnerLabel: string | null;
  executionPlan: RequirementExecutionPlan;
  headerSummary: {
    phaseLabel: string;
    activeParticipantsLabel: string;
    currentBlocker: string | null;
  };
  overviewSummary: {
    goalSummary: string;
    phaseLabel: string;
    latestConclusionSummary: string | null;
    currentBlocker: string | null;
    closable: boolean;
    closureHint: string;
  };
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildParticipantMap(participants: RequirementParticipantProgress[]) {
  return new Map(participants.map((participant) => [participant.agentId, participant] as const));
}

function isLowSignalGoalSummary(value: string | null | undefined): boolean {
  const normalized = readString(value);
  if (!normalized) {
    return true;
  }
  return /条结论回传|等待\s*CEO\s*收口|当前主线|需求团队派单|待确认启动/.test(normalized);
}

function mapStepStatus(status: WorkStepRecord["status"]): RequirementExecutionTaskStatus {
  switch (status) {
    case "done":
    case "skipped":
      return "已完成";
    case "active":
      return "进行中";
    case "blocked":
      return "已阻塞";
    case "pending":
    default:
      return "未启动";
  }
}

function mapParticipantStatus(statusLabel: string): RequirementExecutionTaskStatus {
  if (isParticipantBlockingStatus(statusLabel)) {
    return "已阻塞";
  }
  if (isParticipantRunningStatus(statusLabel)) {
    return "进行中";
  }
  if (["已接单", "已接单未推进"].includes(statusLabel)) {
    return "已接单";
  }
  if (["待回复", "未回复", "待接手", "已就绪待稿"].includes(statusLabel)) {
    return "已派发";
  }
  if (["已交付待下游", "部分完成", "已回复"].includes(statusLabel)) {
    return "已提交待收口";
  }
  if (isParticipantCompletedStatus(statusLabel)) {
    return "已完成";
  }
  return "未启动";
}

function mapRequestStatus(input: {
  request: RequestRecord;
  participant: RequirementParticipantProgress | null;
}): RequirementExecutionTaskStatus {
  const participantStatus = input.participant?.statusLabel ?? null;
  if (participantStatus) {
    return mapParticipantStatus(participantStatus);
  }

  switch (input.request.status) {
    case "blocked":
      return "已阻塞";
    case "answered":
      return input.request.resolution === "complete" ? "已完成" : "已提交待收口";
    case "acknowledged":
      return "已接单";
    case "pending":
      return "已派发";
    case "superseded":
    default:
      return "未启动";
  }
}

function mapHandoffStatus(status: HandoffRecord["status"]): RequirementExecutionTaskStatus {
  switch (status) {
    case "blocked":
      return "已阻塞";
    case "completed":
      return "已提交待收口";
    case "acknowledged":
      return "已接单";
    case "pending":
    default:
      return "已派发";
  }
}

function summarizeTaskUpdate(candidate: string | null | undefined, fallback: string): string {
  return summarizeRequirementText(readString(candidate) ?? fallback, 72);
}

function pickTaskTitle(input: {
  fallbackTitle: string;
  participant: RequirementParticipantProgress | null;
  ownerLabel: string;
  index: number;
}): string {
  const direct = readString(input.fallbackTitle);
  if (direct) {
    return direct;
  }
  const stage = readString(input.participant?.stage);
  if (stage) {
    return stage;
  }
  return `子任务 ${input.index} · ${input.ownerLabel}`;
}

function buildTasksFromSteps(input: {
  company: Company;
  surface: PrimaryRequirementSurface;
  participantsByAgentId: Map<string, RequirementParticipantProgress>;
}): RequirementExecutionPlanTask[] {
  const steps = input.surface.workItem?.steps ?? [];
  return steps.map((step, index) => {
    const participant =
      (step.assigneeActorId ? input.participantsByAgentId.get(step.assigneeActorId) ?? null : null) ??
      null;
    const ownerLabel =
      readString(step.assigneeLabel) ??
      formatAgentLabel(input.company, step.assigneeActorId) ??
      "未分配";
    const latestUpdateSummary =
      summarizeTaskUpdate(
        participant?.detail ?? step.detail,
        `${ownerLabel} 正在处理这一步。`,
      );
    return {
      id: step.id,
      index: index + 1,
      title: pickTaskTitle({
        fallbackTitle: step.title,
        participant,
        ownerLabel,
        index: index + 1,
      }),
      ownerActorId: step.assigneeActorId ?? null,
      ownerLabel,
      status: participant ? mapParticipantStatus(participant.statusLabel) : mapStepStatus(step.status),
      latestUpdateSummary,
      updatedAt: Math.max(step.updatedAt ?? 0, participant?.updatedAt ?? 0) || null,
    };
  });
}

function buildTasksFromRequests(input: {
  company: Company;
  requests: RequestRecord[];
  participantsByAgentId: Map<string, RequirementParticipantProgress>;
}): RequirementExecutionPlanTask[] {
  return input.requests.map((request, index) => {
    const ownerActorId = request.toAgentIds[0] ?? null;
    const participant = ownerActorId ? input.participantsByAgentId.get(ownerActorId) ?? null : null;
    const ownerLabel = ownerActorId
      ? formatAgentLabel(input.company, ownerActorId)
      : request.toAgentIds.length > 1
        ? request.toAgentIds.map((agentId) => formatAgentLabel(input.company, agentId)).join("、")
        : "待分配";
    const status = mapRequestStatus({ request, participant });
    return {
      id: request.id,
      index: index + 1,
      title: pickTaskTitle({
        fallbackTitle: request.title,
        participant,
        ownerLabel,
        index: index + 1,
      }),
      ownerActorId,
      ownerLabel,
      status,
      latestUpdateSummary: summarizeTaskUpdate(
        participant?.detail ?? request.responseSummary ?? request.summary,
        `${ownerLabel} 正在跟进这项协作。`,
      ),
      updatedAt: Math.max(request.updatedAt, participant?.updatedAt ?? 0) || null,
    };
  });
}

function buildTasksFromHandoffs(input: {
  company: Company;
  handoffs: HandoffRecord[];
  participantsByAgentId: Map<string, RequirementParticipantProgress>;
}): RequirementExecutionPlanTask[] {
  return input.handoffs.map((handoff, index) => {
    const ownerActorId = handoff.toAgentIds[0] ?? null;
    const participant = ownerActorId ? input.participantsByAgentId.get(ownerActorId) ?? null : null;
    const ownerLabel = ownerActorId
      ? formatAgentLabel(input.company, ownerActorId)
      : "待接手";
    return {
      id: handoff.id,
      index: index + 1,
      title: pickTaskTitle({
        fallbackTitle: handoff.title,
        participant,
        ownerLabel,
        index: index + 1,
      }),
      ownerActorId,
      ownerLabel,
      status: participant ? mapParticipantStatus(participant.statusLabel) : mapHandoffStatus(handoff.status),
      latestUpdateSummary: summarizeTaskUpdate(
        participant?.detail ?? handoff.summary,
        `${ownerLabel} 正在承接这项任务。`,
      ),
      updatedAt: Math.max(handoff.updatedAt, participant?.updatedAt ?? 0) || null,
    };
  });
}

function buildTasksFromParticipants(
  participants: RequirementParticipantProgress[],
): RequirementExecutionPlanTask[] {
  return participants.map((participant, index) => ({
    id: `participant:${participant.agentId}`,
    index: index + 1,
    title: pickTaskTitle({
      fallbackTitle: participant.stage,
      participant,
      ownerLabel: participant.nickname,
      index: index + 1,
    }),
    ownerActorId: participant.agentId,
    ownerLabel: participant.nickname,
    status: mapParticipantStatus(participant.statusLabel),
    latestUpdateSummary: summarizeTaskUpdate(
      participant.detail,
      `${participant.nickname} 正在推进自己的协作部分。`,
    ),
    updatedAt: participant.updatedAt,
  }));
}

function dedupeTasks(tasks: RequirementExecutionPlanTask[]): RequirementExecutionPlanTask[] {
  const seen = new Set<string>();
  const result: RequirementExecutionPlanTask[] = [];
  tasks.forEach((task) => {
    if (seen.has(task.id)) {
      return;
    }
    seen.add(task.id);
    result.push(task);
  });
  return result.map((task, index) => ({ ...task, index: index + 1 }));
}

function normalizeTaskKey(value: string): string {
  return value.replace(/\s+/g, "").replace(/[：:]/g, "").trim().toLowerCase();
}

function hasStructuredTaskMarker(title: string | null | undefined): boolean {
  const normalized = readString(title);
  return normalized ? /^【[^】]+】/.test(normalized) : false;
}

function resolveActorIdToken(company: Company, token: string | null | undefined): string | null {
  const normalized = readString(token)?.replace(/^@/, "") ?? null;
  if (!normalized) {
    return null;
  }

  const directMatch =
    company.employees.find(
      (employee) => employee.agentId.toLowerCase() === normalized.toLowerCase(),
    ) ?? null;
  if (directMatch) {
    return directMatch.agentId;
  }

  const nicknameMatch =
    company.employees.find(
      (employee) => employee.nickname.toLowerCase() === normalized.toLowerCase(),
    ) ?? null;
  if (nicknameMatch) {
    return nicknameMatch.agentId;
  }

  const metaRoleMatch =
    company.employees.find(
      (employee) => employee.metaRole?.toLowerCase() === normalized.toLowerCase(),
    ) ?? null;
  if (metaRoleMatch) {
    return metaRoleMatch.agentId;
  }

  return normalized.toLowerCase();
}

function isLegacyStatusText(value: string | null | undefined): boolean {
  const normalized = readString(value);
  return normalized
    ? /(已完成|进行中|已派发|待接单确认|已接单|受阻|阻塞|已开工)/.test(normalized)
    : false;
}

function mapLegacyStatusToken(raw: string | null | undefined): RequirementExecutionTaskStatus {
  const normalized = readString(raw) ?? "";
  if (/已完成/.test(normalized)) {
    return "已完成";
  }
  if (/受阻|阻塞/.test(normalized)) {
    return "已阻塞";
  }
  if (/已接单/.test(normalized)) {
    return "已接单";
  }
  if (/进行中|已开工/.test(normalized)) {
    return "进行中";
  }
  if (/已派发|待接单/.test(normalized)) {
    return "已派发";
  }
  return "未启动";
}

function parseLegacyTranscriptTaskLine(input: {
  company: Company;
  line: string;
  fallbackText: string;
  timestamp: number;
}): RequirementExecutionPlanTask | null {
  const trimmedLine = input.line.trim();
  if (!trimmedLine) {
    return null;
  }

  if (trimmedLine.startsWith("|")) {
    const cells = trimmedLine
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (
      cells.length >= 3 &&
      !cells.every((cell) => /^-+$/.test(cell.replace(/\s+/g, "")))
    ) {
      const taskFirstRow =
        cells.length >= 4 &&
        isLegacyStatusText(cells[2]) &&
        !/^负责人|任务|状态|进展|进展详情|dispatch id$/i.test(cells[0]);
      const ownerFirstRow =
        cells.length >= 3 &&
        isLegacyStatusText(cells[2]) &&
        /^@?[A-Za-z][A-Za-z0-9-]{1,}$/.test(cells[0]) &&
        !/^负责人|任务|状态|进展|进展详情|dispatch id$/i.test(cells[1]);

      if (taskFirstRow || ownerFirstRow) {
        const title = taskFirstRow ? cells[0] : cells[1] ?? "兼容恢复子任务";
        const ownerToken = taskFirstRow ? cells[1] : cells[0] ?? null;
        const statusText = cells[2] ?? null;
        const detail = readString(cells[3]) ?? summarizeRequirementText(input.fallbackText, 72);
        const ownerActorId = resolveActorIdToken(input.company, ownerToken);
        const ownerLabel =
          formatAgentLabel(input.company, ownerActorId) ??
          readString(ownerToken)?.replace(/^@/, "") ??
          "待分配";
        return {
          id: `legacy:${normalizeTaskKey(`${ownerActorId ?? "unknown"}:${title}`)}`,
          index: 0,
          title,
          ownerActorId,
          ownerLabel,
          status: mapLegacyStatusToken(statusText),
          latestUpdateSummary: detail,
          updatedAt: input.timestamp || null,
        };
      }
    }
  }

  const statusPattern =
    "(✅\\s*已完成|🔄\\s*进行中(?:\\s*\\d+%)?|🔄已派发|⏳\\s*已派发|⏳\\s*待接单确认|⏸️\\s*受阻(?:\\s*\\(Blocked\\))?|已完成|进行中(?:\\s*\\d+%)?|已派发|待接单确认|受阻)";
  const tablePattern = new RegExp(
    `^【([^】]+)】(.+?)\\s+(CEO|CTO|COO|HR|[A-Z][A-Z0-9-]{1,})\\s+${statusPattern}(?:\\s+(.+))?$`,
  );
  const mentionPattern = new RegExp(
    `^@([A-Za-z][A-Za-z0-9-]{1,})\\s+(.+?)\\s+${statusPattern}(?:\\s+(.+))?$`,
  );

  const tableMatch = trimmedLine.match(tablePattern);
  const mentionMatch = trimmedLine.match(mentionPattern);
  if (!tableMatch && !mentionMatch) {
    return null;
  }

  const ownerToken = tableMatch?.[3] ?? mentionMatch?.[1] ?? null;
  const ownerActorId = resolveActorIdToken(input.company, ownerToken);
  const ownerLabel =
    formatAgentLabel(input.company, ownerActorId) ??
    readString(ownerToken)?.replace(/^@/, "") ??
    "待分配";
  const title = tableMatch
    ? `【${tableMatch[1]}】${tableMatch[2].trim()}`
    : mentionMatch?.[2]?.trim() ?? "兼容恢复子任务";
  const statusText = tableMatch?.[4] ?? mentionMatch?.[3] ?? null;
  const detail =
    readString(tableMatch?.[5]) ??
    readString(mentionMatch?.[4]) ??
    summarizeRequirementText(input.fallbackText, 72);

  return {
    id: `legacy:${normalizeTaskKey(`${ownerActorId ?? "unknown"}:${title}`)}`,
    index: 0,
    title,
    ownerActorId,
    ownerLabel,
    status: mapLegacyStatusToken(statusText),
    latestUpdateSummary: detail,
    updatedAt: input.timestamp || null,
  };
}

function buildTasksFromRoomTranscript(input: {
  company: Company;
  surface: PrimaryRequirementSurface;
  roomMessages?: Array<{ text?: string; timestamp?: number }>;
}): RequirementExecutionPlanTask[] {
  const fallbackMessages =
    input.roomMessages && input.roomMessages.length > 0
      ? input.roomMessages
      : input.surface.room?.transcript ?? [];
  if (fallbackMessages.length === 0) {
    return [];
  }

  const tasks = new Map<string, RequirementExecutionPlanTask>();

  [...fallbackMessages]
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .forEach((message) => {
      const text = readString(message.text);
      if (!text) {
        return;
      }
      const messageTimestamp = message.timestamp ?? 0;
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .forEach((line) => {
          const parsedTask = parseLegacyTranscriptTaskLine({
            company: input.company,
            line,
            fallbackText: text,
            timestamp: messageTimestamp,
          });
          if (!parsedTask) {
            return;
          }

          const key = normalizeTaskKey(`${parsedTask.ownerActorId ?? "unknown"}:${parsedTask.title}`);
          if (tasks.has(key)) {
            return;
          }
          tasks.set(key, { ...parsedTask, id: `legacy:${key}`, index: tasks.size + 1 });
        });
    });

  const collectedTasks = [...tasks.values()];
  const structuredOwners = new Set(
    collectedTasks
      .filter((task) => hasStructuredTaskMarker(task.title) && task.ownerActorId)
      .map((task) => task.ownerActorId as string),
  );
  const structuredTaskCount = collectedTasks.filter((task) => hasStructuredTaskMarker(task.title)).length;
  if (structuredTaskCount < 2 || structuredOwners.size === 0) {
    return collectedTasks;
  }

  return collectedTasks.filter((task) => {
    if (hasStructuredTaskMarker(task.title)) {
      return true;
    }
    if (!task.ownerActorId) {
      return true;
    }
    return !structuredOwners.has(task.ownerActorId);
  });
}

function buildFallbackParticipantsFromTasks(
  company: Company,
  tasks: RequirementExecutionPlanTask[],
): RequirementCollaborationParticipant[] {
  const byActor = new Map<string, RequirementExecutionPlanTask>();
  tasks.forEach((task) => {
    if (!task.ownerActorId || byActor.has(task.ownerActorId)) {
      return;
    }
    byActor.set(task.ownerActorId, task);
  });
  return [...byActor.entries()].map(([agentId, task]) => {
    const employee = company.employees.find((item) => item.agentId === agentId) ?? null;
    return {
      agentId,
      nickname: task.ownerLabel,
      role: employee?.role ?? "协作成员",
      statusLabel: task.status,
      detail: task.latestUpdateSummary,
      updatedAt: task.updatedAt ?? 0,
      isBlocking: task.status === "已阻塞",
      isCurrent: ["进行中", "已接单"].includes(task.status),
    };
  });
}

function isLowSignalTaskTitle(value: string | null | undefined): boolean {
  const normalized = readString(value);
  if (!normalized) {
    return true;
  }
  return /当前主线|团队回执已到齐|继续推进|待确认启动|需求团队派单|当前任务总览/.test(normalized);
}

function isHighSignalTaskPlan(tasks: RequirementExecutionPlanTask[]): boolean {
  if (tasks.length === 0) {
    return false;
  }
  if (tasks.length >= 2) {
    return tasks.some((task) => !isLowSignalTaskTitle(task.title));
  }
  return !isLowSignalTaskTitle(tasks[0]?.title);
}

function selectExecutionPlanTasks(input: {
  explicitStepTasks: RequirementExecutionPlanTask[];
  explicitRequestTasks: RequirementExecutionPlanTask[];
  explicitHandoffTasks: RequirementExecutionPlanTask[];
  legacyTranscriptTasks: RequirementExecutionPlanTask[];
  participantTasks: RequirementExecutionPlanTask[];
}): RequirementExecutionPlanTask[] {
  const {
    explicitStepTasks,
    explicitRequestTasks,
    explicitHandoffTasks,
    legacyTranscriptTasks,
    participantTasks,
  } = input;

  if (isHighSignalTaskPlan(explicitStepTasks)) {
    if (
      legacyTranscriptTasks.length > explicitStepTasks.length &&
      explicitStepTasks.every((task) => isLowSignalTaskTitle(task.title)) &&
      isHighSignalTaskPlan(legacyTranscriptTasks)
    ) {
      return legacyTranscriptTasks;
    }
    return explicitStepTasks;
  }

  if (isHighSignalTaskPlan(explicitRequestTasks)) {
    if (
      legacyTranscriptTasks.length > explicitRequestTasks.length &&
      explicitRequestTasks.every((task) => isLowSignalTaskTitle(task.title)) &&
      isHighSignalTaskPlan(legacyTranscriptTasks)
    ) {
      return legacyTranscriptTasks;
    }
    return explicitRequestTasks;
  }

  if (isHighSignalTaskPlan(explicitHandoffTasks)) {
    return explicitHandoffTasks;
  }

  if (isHighSignalTaskPlan(legacyTranscriptTasks)) {
    return legacyTranscriptTasks;
  }

  if (explicitStepTasks.length > 0) {
    return explicitStepTasks;
  }
  if (explicitRequestTasks.length > 0) {
    return explicitRequestTasks;
  }
  if (explicitHandoffTasks.length > 0) {
    return explicitHandoffTasks;
  }
  if (legacyTranscriptTasks.length > 0) {
    return legacyTranscriptTasks;
  }
  return participantTasks;
}

function buildExecutionPlan(input: {
  company: Company;
  surface: PrimaryRequirementSurface;
  activeParticipants: RequirementParticipantProgress[];
  roomMessages?: Array<{ text?: string; timestamp?: number }>;
}): RequirementExecutionPlan {
  const requirementId =
    input.surface.aggregateId ?? input.surface.workItemId ?? input.surface.roomId ?? "requirement";
  const participantsByAgentId = buildParticipantMap(input.activeParticipants);
  const explicitStepTasks = buildTasksFromSteps({
    company: input.company,
    surface: input.surface,
    participantsByAgentId,
  });
  const explicitRequestTasks = buildTasksFromRequests({
    company: input.company,
    requests: input.surface.requirementScope?.requests ?? [],
    participantsByAgentId,
  });
  const explicitHandoffTasks = buildTasksFromHandoffs({
    company: input.company,
    handoffs: input.surface.requirementScope?.handoffs ?? [],
    participantsByAgentId,
  });
  const legacyTranscriptTasks = buildTasksFromRoomTranscript({
    company: input.company,
    surface: input.surface,
    roomMessages: input.roomMessages,
  });
  const participantTasks = buildTasksFromParticipants(input.activeParticipants);

  const tasks = dedupeTasks(
    selectExecutionPlanTasks({
      explicitStepTasks,
      explicitRequestTasks,
      explicitHandoffTasks,
      legacyTranscriptTasks,
      participantTasks,
    }),
  );

  const totalCount = tasks.length;
  const doneCount = tasks.filter((task) => ["已完成", "已提交待收口"].includes(task.status)).length;
  const blockedCount = tasks.filter((task) => task.status === "已阻塞").length;
  const inProgressCount = tasks.filter((task) =>
    ["已派发", "已接单", "进行中"].includes(task.status),
  ).length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const closable =
    totalCount > 0 &&
    blockedCount === 0 &&
    !input.surface.openDecisionTicket &&
    tasks.every((task) => ["已完成", "已提交待收口"].includes(task.status));

  let closureHint = "当前还不能关房，需要继续推进子任务。";
  if (input.surface.openDecisionTicket) {
    closureHint = "当前仍有待决策事项，先完成决策再继续收口。";
  } else if (blockedCount > 0) {
    closureHint = `当前有 ${blockedCount} 个阻塞子任务，需要先解阻后再关房。`;
  } else if (totalCount === 0) {
    closureHint = "还没有形成可追踪的执行项，先让 CEO 明确执行计划。";
  } else if (closable) {
    closureHint = `可收口：已完成 ${doneCount}/${totalCount} 个子任务，等待 CEO 最终归档。`;
  } else {
    const remainingCount = Math.max(0, totalCount - doneCount);
    closureHint = `距离关房还差 ${remainingCount} 个子任务收口。`;
  }

  return {
    requirementId,
    tasks,
    totalCount,
    doneCount,
    inProgressCount,
    blockedCount,
    progressPct,
    closable,
    closureHint,
  };
}

function buildCurrentBlocker(input: {
  surface: PrimaryRequirementSurface;
  activeParticipants: RequirementParticipantProgress[];
}): string | null {
  if (input.surface.openDecisionTicket?.requiresHuman) {
    return input.surface.openDecisionTicket.summary;
  }
  if (input.surface.stageGateStatus === "waiting_confirmation") {
    return "等待 CEO 补发结构化选项。";
  }
  const blockingParticipant = input.activeParticipants.find((participant) => participant.isBlocking);
  if (blockingParticipant) {
    return `${blockingParticipant.nickname}：${summarizeRequirementText(blockingParticipant.detail, 64)}`;
  }
  return input.surface.latestBlocker;
}

function isLowSignalConclusionSummary(value: string | null | undefined): boolean {
  const normalized = readString(value);
  if (!normalized) {
    return true;
  }
  return /需求团队派单|已发出，但.*未收到确认|条结论回传|当前主线正在推进|待确认启动/.test(normalized);
}

function buildLatestConclusionSummary(input: {
  surface: PrimaryRequirementSurface;
  activeParticipants: RequirementCollaborationParticipant[];
  executionPlan: RequirementExecutionPlan;
}): string | null {
  if (input.surface.latestReportSummary && !isLowSignalConclusionSummary(input.surface.latestReportSummary)) {
    return summarizeRequirementText(input.surface.latestReportSummary, 96);
  }
  const latestParticipant = [...input.activeParticipants].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )[0];
  if (latestParticipant) {
    return `${latestParticipant.nickname}：${summarizeRequirementText(latestParticipant.detail, 96)}`;
  }
  const latestTask = [...input.executionPlan.tasks].sort(
    (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0),
  )[0];
  if (latestTask) {
    return `${latestTask.title}：${summarizeRequirementText(latestTask.latestUpdateSummary, 96)}`;
  }
  return readString(input.surface.summary);
}

export function buildRequirementCollaborationSurface(input: {
  company: Company | null;
  surface: PrimaryRequirementSurface | null;
  roomMessages?: Array<{ text?: string; timestamp?: number }>;
}): RequirementCollaborationSurface | null {
  if (!input.company || !input.surface) {
    return null;
  }

  const explicitParticipants = (input.surface.requirementOverview?.participants ?? [])
    .filter((participant) => participant.agentId !== input.company?.employees.find((employee) => employee.metaRole === "ceo")?.agentId)
    .map((participant) => ({
      agentId: participant.agentId,
      nickname: participant.nickname,
      role: participant.role,
      statusLabel: participant.statusLabel,
      detail: participant.detail,
      updatedAt: participant.updatedAt,
      isBlocking: participant.isBlocking,
      isCurrent: participant.isCurrent,
    }));
  const compatibilityTasks = buildTasksFromRoomTranscript({
    company: input.company,
    surface: input.surface,
    roomMessages: input.roomMessages,
  });
  const activeParticipants =
    explicitParticipants.length > 0
      ? explicitParticipants
      : buildFallbackParticipantsFromTasks(input.company, compatibilityTasks);
  const activeParticipantsLabel =
    activeParticipants.length > 0
      ? activeParticipants.map((participant) => participant.nickname).join("、")
      : "等待协作成员接入";
  const executionPlan = buildExecutionPlan({
    company: input.company,
    surface: input.surface,
    activeParticipants: input.surface.requirementOverview?.participants ?? [],
    roomMessages: input.roomMessages,
  });
  const currentBlocker = buildCurrentBlocker({
    surface: input.surface,
    activeParticipants: input.surface.requirementOverview?.participants ?? [],
  });
  const latestConclusionSummary = buildLatestConclusionSummary({
    surface: input.surface,
    activeParticipants,
    executionPlan,
  });

  const nonCompletedParticipants = activeParticipants.filter(
    (participant) => !isParticipantCompletedStatus(participant.statusLabel),
  );
  const currentParticipant =
    activeParticipants.find((participant) => participant.isCurrent) ??
    (nonCompletedParticipants.length === 1 ? nonCompletedParticipants[0] ?? null : null);
  const completedOthers =
    currentParticipant &&
    activeParticipants
      .filter((participant) => participant.agentId !== currentParticipant.agentId)
      .every((participant) => isParticipantCompletedStatus(participant.statusLabel));
  const isSingleOwnerClosure = Boolean(
    currentParticipant &&
      completedOthers &&
      !input.surface.openDecisionTicket &&
      input.surface.stageGateStatus !== "waiting_confirmation",
  );
  const closureOwnerActorId = isSingleOwnerClosure ? currentParticipant?.agentId ?? null : null;
  const closureOwnerLabel = isSingleOwnerClosure ? currentParticipant?.nickname ?? null : null;

  return {
    goalSummary: isLowSignalGoalSummary(input.surface.summary)
      ? input.surface.title
      : input.surface.summary,
    phaseLabel: input.surface.currentStep,
    collaborationLabel: isSingleOwnerClosure ? "单点收口" : "多人并行",
    activeParticipants,
    activeParticipantsLabel,
    currentBlocker,
    latestConclusionSummary,
    isSingleOwnerClosure,
    closureOwnerActorId,
    closureOwnerLabel,
    executionPlan,
    headerSummary: {
      phaseLabel: input.surface.currentStep,
      activeParticipantsLabel,
      currentBlocker,
    },
    overviewSummary: {
      goalSummary: isLowSignalGoalSummary(input.surface.summary)
        ? input.surface.title
        : input.surface.summary,
      phaseLabel: input.surface.currentStep,
      latestConclusionSummary,
      currentBlocker,
      closable: executionPlan.closable,
      closureHint: executionPlan.closureHint,
    },
  };
}
