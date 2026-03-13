import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  agentStatusNeedsIntervention,
  buildCanonicalAgentStatusProjection,
  buildCanonicalAgentStatusHealth,
  mapAgentRuntimeAvailabilityToLegacyStatus,
  type AgentRunRecord,
  type AgentRuntimeAvailability,
  type CanonicalAgentStatusRecord,
  type CanonicalAgentStatusHealthRecord,
  type CoordinationState,
  type InterventionState,
  type AgentRuntimeRecord,
  type AgentSessionRecord,
} from "../agent-runtime";
import type { ProviderProcessRecord } from "../../infrastructure/gateway/runtime/types";
import { backend } from "../gateway";
import { inferDepartmentKind } from "../org/department-autonomy";
import type { WorkItemRecord } from "../../domain/mission/types";
import type { Company, EmployeeRef } from "../../domain/org/types";
import { describeDispatchCheckout } from "../../domain/delegation/dispatch-checkout";
import { useAuthorityRuntimeSyncStore } from "../../infrastructure/authority/runtime-sync-store";
import { useCompanyRuntimeStore } from "../../infrastructure/company/runtime/store";
import { selectRuntimeInspectorState } from "../../infrastructure/company/runtime/selectors";

export type RuntimeAttentionLevel = "healthy" | "watch" | "critical";
export type RuntimeSceneZoneId =
  | "command-deck"
  | "tech-lab"
  | "ops-rail"
  | "people-hub"
  | "studio-floor";

type RuntimeInspectorInput = ReturnType<typeof selectRuntimeInspectorState>;
type RuntimeInspectorWorkItem = RuntimeInspectorInput["activeWorkItems"][number];

export type RuntimeInspectorAgentSurface = {
  agentId: string;
  nickname: string;
  role: string;
  avatarJobId?: string;
  employee: EmployeeRef;
  departmentId: string | null;
  departmentName: string;
  departmentKind: "meta" | "support" | "business";
  statusOrigin: "authority" | "fallback";
  availability: AgentRuntimeAvailability;
  runtimeState: AgentRuntimeAvailability;
  coordinationState: CoordinationState;
  interventionState: InterventionState;
  legacyStatus: "running" | "idle" | "stopped";
  workload: AgentRuntimeRecord["currentWorkload"];
  attention: RuntimeAttentionLevel;
  attentionReason: string;
  reason: string;
  activeSessionCount: number;
  activeRunCount: number;
  lastSeenAt: number | null;
  lastBusyAt: number | null;
  lastIdleAt: number | null;
  latestSignalAt: number | null;
  currentAssignment: string;
  currentObjective: string;
  activityLabel: string;
  sceneZoneId: RuntimeSceneZoneId;
  sceneZoneLabel: string;
  sceneActivityLabel: string;
  runtimeEvidence: AgentRuntimeRecord["runtimeEvidence"];
  sessions: AgentSessionRecord[];
  runs: AgentRunRecord[];
  primaryWorkItem: RuntimeInspectorWorkItem | null;
  openDispatchCount: number;
  blockedDispatchCount: number;
  openSupportRequestCount: number;
  blockedSupportRequestCount: number;
  openEscalationCount: number;
  blockedWorkItemCount: number;
};

export type RuntimeInspectorSceneZone = {
  id: RuntimeSceneZoneId;
  label: string;
  description: string;
  tone: string;
  agents: RuntimeInspectorAgentSurface[];
  busyCount: number;
  attentionCount: number;
  status: RuntimeAttentionLevel;
};

export type RuntimeInspectorTimelineEvent = {
  id: string;
  agentId: string;
  nickname: string;
  title: string;
  summary: string;
  timestamp: number | null;
  tone: "info" | "warning" | "danger" | "success";
};

export type RuntimeInspectorReplayEvent = {
  id: string;
  agentId: string;
  nickname: string;
  title: string;
  summary: string;
  timestamp: number | null;
  tone: "info" | "warning" | "danger" | "success";
  phaseLabel: string;
  modalityLabel: string;
};

export type RuntimeInspectorHistoryEvent = {
  id: string;
  agentId: string | null;
  label: string;
  summary: string;
  timestamp: number | null;
  tone: "info" | "warning" | "danger" | "success";
  sourceLabel: string;
};

export type RuntimeInspectorChainLink = {
  id: string;
  kind: "work_item" | "dispatch" | "support_request" | "escalation";
  kindLabel: string;
  stateLabel: string;
  tone: "info" | "warning" | "danger";
  fromAgentId: string | null;
  fromLabel: string;
  toAgentId: string | null;
  toLabel: string;
  summary: string;
  updatedAt: number;
  focusAgentId: string | null;
};

export type RuntimeInspectorRecommendedAction = {
  id: string;
  label: string;
  summary: string;
  to: string;
  tone: "default" | "warning" | "danger";
  agentId?: string;
};

export type RuntimeInspectorSurface = {
  company: Company;
  agents: RuntimeInspectorAgentSurface[];
  statusHealth: CanonicalAgentStatusHealthRecord;
  statusCoverage: {
    label: string;
    detail: string;
    missingAgentIds: string[];
  };
  sceneZones: RuntimeInspectorSceneZone[];
  focusAgent: RuntimeInspectorAgentSurface | null;
  replay: RuntimeInspectorReplayEvent[];
  historyWindow: RuntimeInspectorHistoryEvent[];
  chainLinks: RuntimeInspectorChainLink[];
  triageQueue: RuntimeInspectorAgentSurface[];
  watchlist: RuntimeInspectorAgentSurface[];
  timeline: RuntimeInspectorTimelineEvent[];
  recommendedActions: RuntimeInspectorRecommendedAction[];
  busyAgents: number;
  degradedAgents: number;
  criticalAgents: number;
  activeRuns: number;
  activeSessions: number;
};

export type RuntimeInspectorLiveProcess = {
  processId: string;
  sessionKey: string | null;
  title: string;
  command: string | null;
  status: ProviderProcessRecord["state"];
  statusLabel: string;
  summary: string;
  tone: "info" | "warning" | "danger" | "success";
  startedAt: number | null;
  updatedAt: number | null;
  endedAt: number | null;
  exitCode: number | null;
};

export type RuntimeInspectorProcessTelemetry = {
  capabilityState: "idle" | "loading" | "ready" | "unsupported" | "error";
  agentId: string | null;
  scope: "focused" | "global";
  lastCheckedAt: number | null;
  error: string | null;
  processes: RuntimeInspectorLiveProcess[];
  runningCount: number;
  totalCount: number;
};

export type RuntimeInspectorStatusSource = "authority_complete" | "authority_partial" | "fallback";

function isActiveProcessState(state: ProviderProcessRecord["state"]): boolean {
  return state === "queued" || state === "running";
}

function isUnsupportedProcessRuntimeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unknown method:\s*process\.(list|poll)/i.test(message)
    || /process\.(list|poll)/i.test(message) && /method not found/i.test(message);
}

const PROCESS_POLL_INTERVAL_MS = 6_000;
const MAX_PROCESS_POLLS = 6;

function getProcessTone(state: ProviderProcessRecord["state"]): RuntimeInspectorLiveProcess["tone"] {
  if (state === "error" || state === "aborted") {
    return "danger";
  }
  if (state === "completed") {
    return "success";
  }
  if (state === "queued") {
    return "warning";
  }
  return "info";
}

function getProcessStatusLabel(state: ProviderProcessRecord["state"]): string {
  switch (state) {
    case "queued":
      return "排队中";
    case "running":
      return "运行中";
    case "completed":
      return "已完成";
    case "aborted":
      return "已中止";
    case "error":
      return "失败";
    case "unknown":
    default:
      return "未知";
  }
}

function buildLiveProcessSummary(process: ProviderProcessRecord): string {
  const command = process.command?.trim();
  const summary = process.summary?.trim();
  if (summary && command && summary !== command) {
    return `${summary} · ${command}`;
  }
  if (summary) {
    return summary;
  }
  if (command) {
    return command;
  }
  return process.title;
}

function normalizeLiveProcesses(processes: ProviderProcessRecord[]): RuntimeInspectorLiveProcess[] {
  const byId = new Map<string, RuntimeInspectorLiveProcess>();
  for (const process of processes) {
    const existing = byId.get(process.processId);
    const candidate: RuntimeInspectorLiveProcess = {
      processId: process.processId,
      sessionKey: process.sessionKey ?? null,
      title: process.title,
      command: process.command ?? null,
      status: process.state,
      statusLabel: getProcessStatusLabel(process.state),
      summary: buildLiveProcessSummary(process),
      tone: getProcessTone(process.state),
      startedAt: process.startedAt ?? null,
      updatedAt: process.updatedAt ?? process.startedAt ?? null,
      endedAt: process.endedAt ?? null,
      exitCode: process.exitCode ?? null,
    };
    if (!existing || (candidate.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      byId.set(process.processId, candidate);
    }
  }
  return [...byId.values()].sort((left, right) => {
    const activeDelta = Number(isActiveProcessState(right.status)) - Number(isActiveProcessState(left.status));
    if (activeDelta !== 0) {
      return activeDelta;
    }
    return (right.updatedAt ?? right.startedAt ?? 0) - (left.updatedAt ?? left.startedAt ?? 0);
  });
}

function resolveSceneZone(employee: EmployeeRef, departmentKind: "meta" | "support" | "business"): RuntimeSceneZoneId {
  if (employee.metaRole === "ceo") {
    return "command-deck";
  }
  if (employee.metaRole === "cto" || /cto|技术|研发|工程|开发|架构/i.test(employee.role)) {
    return "tech-lab";
  }
  if (employee.metaRole === "coo" || /运营|交付|流程|项目|排期/i.test(employee.role)) {
    return "ops-rail";
  }
  if (employee.metaRole === "hr" || /hr|招聘|人事|组织|人才/i.test(employee.role)) {
    return "people-hub";
  }
  if (departmentKind === "support") {
    return "ops-rail";
  }
  return "studio-floor";
}

function resolveSceneZoneLabel(zoneId: RuntimeSceneZoneId): string {
  switch (zoneId) {
    case "command-deck":
      return "Command Deck";
    case "tech-lab":
      return "Tech Lab";
    case "ops-rail":
      return "Ops Rail";
    case "people-hub":
      return "People Hub";
    case "studio-floor":
    default:
      return "Studio Floor";
  }
}

function resolveSceneZoneDescription(zoneId: RuntimeSceneZoneId): string {
  switch (zoneId) {
    case "command-deck":
      return "CEO 与管理层做目标收敛、调度和拍板。";
    case "tech-lab":
      return "技术、工具和系统类任务在这里点亮。";
    case "ops-rail":
      return "协作编排、交接、发布和恢复动作在这里运转。";
    case "people-hub":
      return "组织、招聘、编制和岗位配置在这里推进。";
    case "studio-floor":
    default:
      return "业务执行、创作和交付主线在这里持续推进。";
  }
}

function resolveSceneZoneTone(zoneId: RuntimeSceneZoneId): string {
  switch (zoneId) {
    case "command-deck":
      return "from-amber-50 via-white to-orange-50";
    case "tech-lab":
      return "from-cyan-50 via-white to-indigo-50";
    case "ops-rail":
      return "from-emerald-50 via-white to-teal-50";
    case "people-hub":
      return "from-rose-50 via-white to-fuchsia-50";
    case "studio-floor":
    default:
      return "from-sky-50 via-white to-violet-50";
  }
}

function resolveActivityLabel(input: {
  employee: EmployeeRef;
  runtimeState: AgentRuntimeAvailability;
  coordinationState: CoordinationState;
  interventionState: InterventionState;
}): string {
  if (input.interventionState === "takeover_required") {
    return "接管中";
  }
  if (input.coordinationState === "explicit_blocked") {
    return "排障中";
  }
  if (
    input.coordinationState === "executing" &&
    (input.runtimeState === "idle" || input.runtimeState === "no_signal" || input.runtimeState === "degraded")
  ) {
    return "恢复执行中";
  }
  if (input.runtimeState === "offline") {
    return "离线";
  }
  if (input.runtimeState === "no_signal") {
    return "无信号";
  }
  if (input.runtimeState === "degraded") {
    return "恢复中";
  }
  if (input.coordinationState === "waiting_input") {
    return "待输入";
  }
  if (input.coordinationState === "waiting_peer") {
    return input.interventionState === "overdue" || input.interventionState === "escalated"
      ? "待催办"
      : "待协作";
  }
  if (input.coordinationState === "pending_ack") {
    return "待确认";
  }
  if (input.coordinationState === "completed") {
    return "已收口";
  }
  if (input.runtimeState === "busy") {
    if (input.employee.metaRole === "ceo") {
      return "调度中";
    }
    if (input.employee.metaRole === "cto" || /技术|工程|开发|研发|架构/i.test(input.employee.role)) {
      return "构建中";
    }
    if (input.employee.metaRole === "hr" || /招聘|人事|组织/i.test(input.employee.role)) {
      return "招募中";
    }
    if (input.employee.metaRole === "coo" || /运营|交付|排期|流程/i.test(input.employee.role)) {
      return "编排中";
    }
    if (/写|编辑|设计|内容|市场|产品/i.test(input.employee.role)) {
      return "创作中";
    }
    return "执行中";
  }
  return "待命中";
}

function resolveSceneActivityLabel(input: {
  activityLabel: string;
  runtimeState: AgentRuntimeAvailability;
  currentAssignment: string;
}): string {
  if (
    (input.runtimeState === "busy" || input.activityLabel === "恢复执行中") &&
    input.currentAssignment.trim().length > 0
  ) {
    return input.currentAssignment;
  }
  return input.activityLabel;
}

function resolveAttentionFromCanonical(status: CanonicalAgentStatusRecord): RuntimeAttentionLevel {
  if (
    status.interventionState === "takeover_required" ||
    status.interventionState === "escalated" ||
    status.coordinationState === "explicit_blocked"
  ) {
    return "critical";
  }
  if (
    status.interventionState === "overdue" ||
    status.coordinationState === "waiting_peer" ||
    status.coordinationState === "waiting_input" ||
    status.coordinationState === "pending_ack"
  ) {
    return "watch";
  }
  return "healthy";
}

function resolveAttentionReasonFromCanonical(status: CanonicalAgentStatusRecord): string {
  if (status.interventionState === "takeover_required") {
    return "当前链路已要求人工接管，需要优先处理。";
  }
  if (status.interventionState === "escalated") {
    return "当前链路已升级处理，需要优先恢复。";
  }
  if (status.interventionState === "overdue") {
    return "当前链路等待时间已超过阈值，需要持续跟进。";
  }
  if (status.coordinationState === "explicit_blocked") {
    return "当前链路存在明确阻塞，需要优先恢复。";
  }
  if (status.coordinationState === "waiting_input") {
    return "当前主线在等待输入或 review。";
  }
  if (status.coordinationState === "waiting_peer" || status.coordinationState === "pending_ack") {
    return "当前链路仍在等待协作方继续推进。";
  }
  return status.reason;
}

function describeStatusCoverage(
  health: CanonicalAgentStatusHealthRecord,
  company: Company,
): RuntimeInspectorSurface["statusCoverage"] {
  const missingLabels = health.missingAgentIds
    .map((agentId) => company.employees.find((employee) => employee.agentId === agentId)?.nickname ?? agentId)
    .slice(0, 4);
  if (health.coverage === "authority_complete") {
    return {
      label: "Authority 完整覆盖",
      detail: `已覆盖 ${health.coveredAgentCount}/${health.expectedAgentCount} 名成员。`,
      missingAgentIds: [],
    };
  }
  if (health.coverage === "authority_partial") {
    return {
      label: "Authority 局部覆盖",
      detail:
        missingLabels.length > 0
          ? `当前仅覆盖 ${health.coveredAgentCount}/${health.expectedAgentCount} 名成员，缺失 ${missingLabels.join("、")}。`
          : `当前仅覆盖 ${health.coveredAgentCount}/${health.expectedAgentCount} 名成员。`,
      missingAgentIds: health.missingAgentIds,
    };
  }
  return {
    label: "Fallback 重算",
    detail:
      health.note ??
      `当前没有可用的 Authority canonical 状态，页面正在对 ${health.expectedAgentCount} 名成员执行本地兼容重算。`,
    missingAgentIds: health.missingAgentIds,
  };
}

function rankAgentForFocus(agent: RuntimeInspectorAgentSurface): number {
  const attentionRank = { critical: 0, watch: 1, healthy: 2 } as const;
  const coordinationRank = {
    explicit_blocked: 0,
    waiting_input: 1,
    waiting_peer: 2,
    pending_ack: 3,
    executing: 4,
    completed: 5,
    none: 6,
  } as const;
  const runtimeRank = { busy: 0, degraded: 1, idle: 2, no_signal: 3, offline: 4 } as const;
  return (
    attentionRank[agent.attention] * 10_000 +
    coordinationRank[agent.coordinationState] * 1_000 +
    runtimeRank[agent.runtimeState] * 100 -
    Math.min(agent.latestSignalAt ?? 0, 99)
  );
}

function buildTimelineEvent(agent: RuntimeInspectorAgentSurface): RuntimeInspectorTimelineEvent {
  if (agent.interventionState === "takeover_required") {
    return {
      id: `${agent.agentId}:takeover`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title: `${agent.nickname} 需要人工接管`,
      summary: agent.reason,
      timestamp: agent.latestSignalAt,
      tone: "danger",
    };
  }
  if (agent.coordinationState === "explicit_blocked" || agent.interventionState === "escalated") {
    return {
      id: `${agent.agentId}:blocked`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title: `${agent.nickname} 当前链路阻塞`,
      summary: agent.reason,
      timestamp: agent.latestSignalAt,
      tone: "danger",
    };
  }
  if (agent.interventionState === "overdue" || agent.coordinationState === "waiting_input" || agent.coordinationState === "waiting_peer") {
    return {
      id: `${agent.agentId}:waiting`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title: `${agent.nickname} 正在等待协作继续`,
      summary: agent.reason,
      timestamp: agent.latestSignalAt,
      tone: "warning",
    };
  }
  if (agent.coordinationState === "completed") {
    return {
      id: `${agent.agentId}:completed`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title: `${agent.nickname} 最近完成一段协作`,
      summary: agent.reason,
      timestamp: agent.latestSignalAt,
      tone: "success",
    };
  }
  if (agent.coordinationState === "executing") {
    return {
      id: `${agent.agentId}:executing`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title: `${agent.nickname} 正在执行`,
      summary: agent.reason,
      timestamp: agent.latestSignalAt,
      tone: "info",
    };
  }
  return {
    id: `${agent.agentId}:status`,
    agentId: agent.agentId,
    nickname: agent.nickname,
    title: `${agent.nickname} 当前待命`,
    summary: agent.reason,
    timestamp: agent.latestSignalAt,
    tone: agent.runtimeState === "no_signal" || agent.runtimeState === "offline" ? "warning" : "info",
  };
}

function buildReplayEvent(agent: RuntimeInspectorAgentSurface): RuntimeInspectorReplayEvent | null {
  const activeRun = agent.runs[0] ?? null;
  const recoveredExecutionContext =
    agent.sessions
      .map((session) => session.executionContext ?? null)
      .filter((context): context is NonNullable<typeof agent.sessions[number]["executionContext"]> => Boolean(context))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
  const latestTerminalSession =
    agent.sessions.find((session) => session.lastTerminalRunState && session.lastTerminalSummary) ?? null;
  const recentEvidence = agent.runtimeEvidence[0] ?? null;

  if (activeRun) {
    const hasTool = activeRun.streamKindsSeen.includes("tool");
    const hasAssistant = activeRun.streamKindsSeen.includes("assistant");
    return {
      id: `${agent.agentId}:replay:run:${activeRun.runId}`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title: hasTool
        ? `${agent.nickname} 正在跑 ${activeRun.toolNamesSeen[0] ?? "工具链"}`
        : hasAssistant
          ? `${agent.nickname} 正在产出回复`
          : `${agent.nickname} 正在执行 run`,
      summary: agent.currentAssignment,
      timestamp: activeRun.lastEventAt,
      tone: "info",
      phaseLabel: activeRun.state === "streaming" ? "流式执行" : "执行中",
      modalityLabel: hasTool ? "Tool" : hasAssistant ? "Model" : "Run",
    };
  }

  if (recoveredExecutionContext?.checkoutState === "claimed") {
    return {
      id: `${agent.agentId}:replay:recovered:${recoveredExecutionContext.dispatchId}`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title: `${agent.nickname} 已恢复执行上下文`,
      summary: recoveredExecutionContext.objective,
      timestamp: recoveredExecutionContext.updatedAt,
      tone: agent.runtimeState === "degraded" ? "warning" : "info",
      phaseLabel: "恢复执行",
      modalityLabel: "Session",
    };
  }

  if (latestTerminalSession?.lastTerminalSummary) {
    const terminalState = latestTerminalSession.lastTerminalRunState;
    return {
      id: `${agent.agentId}:replay:terminal:${latestTerminalSession.sessionKey}`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title:
        terminalState === "completed"
          ? `${agent.nickname} 最近完成一次交付`
          : terminalState === "aborted"
            ? `${agent.nickname} 最近一次执行被中止`
            : `${agent.nickname} 最近一次执行失败`,
      summary: latestTerminalSession.lastTerminalSummary,
      timestamp: latestTerminalSession.lastSeenAt,
      tone:
        terminalState === "completed"
          ? "success"
          : terminalState === "aborted"
            ? "warning"
            : "danger",
      phaseLabel:
        terminalState === "completed"
          ? "完成"
          : terminalState === "aborted"
            ? "中止"
            : "失败",
      modalityLabel: "Terminal",
    };
  }

  if (recoveredExecutionContext) {
    const isBlocked = recoveredExecutionContext.releaseReason === "blocked";
    const isAnswered = recoveredExecutionContext.releaseReason === "answered";
    return {
      id: `${agent.agentId}:replay:context:${recoveredExecutionContext.dispatchId}`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title:
        isBlocked
          ? `${agent.nickname} 保留了一次阻塞交回记录`
          : isAnswered
            ? `${agent.nickname} 保留了一次交付收口记录`
            : `${agent.nickname} 保留了最近一次执行记录`,
      summary: recoveredExecutionContext.objective,
      timestamp: recoveredExecutionContext.updatedAt,
      tone: isBlocked ? "danger" : isAnswered ? "success" : "info",
      phaseLabel: isBlocked ? "恢复阻塞" : isAnswered ? "恢复记录" : "恢复上下文",
      modalityLabel: "Session",
    };
  }

  if (agent.coordinationState === "completed") {
    return {
      id: `${agent.agentId}:replay:completed`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title: `${agent.nickname} 当前链路已收口`,
      summary: agent.reason,
      timestamp: agent.latestSignalAt,
      tone: "success",
      phaseLabel: "收口",
      modalityLabel: "Flow",
    };
  }

  if (agent.coordinationState === "explicit_blocked" || agent.interventionState === "takeover_required") {
    return {
      id: `${agent.agentId}:replay:blocked`,
      agentId: agent.agentId,
      nickname: agent.nickname,
      title: `${agent.nickname} 进入恢复路径`,
      summary: recentEvidence?.summary ?? agent.reason,
      timestamp: agent.latestSignalAt,
      tone: "danger",
      phaseLabel: agent.interventionState === "takeover_required" ? "接管" : "阻塞",
      modalityLabel: recentEvidence?.kind === "error" ? "Error" : "Flow",
    };
  }

  return null;
}

function buildHistoryWindow(input: {
  replay: RuntimeInspectorReplayEvent[];
  chainLinks: RuntimeInspectorChainLink[];
  timeline: RuntimeInspectorTimelineEvent[];
}): RuntimeInspectorHistoryEvent[] {
  const events: RuntimeInspectorHistoryEvent[] = [
    ...input.replay.map((item) => ({
      id: `history:${item.id}`,
      agentId: item.agentId,
      label: item.title,
      summary: item.summary,
      timestamp: item.timestamp,
      tone: item.tone,
      sourceLabel: `Replay · ${item.modalityLabel}`,
    })),
    ...input.chainLinks.map((item) => ({
      id: `history:${item.id}`,
      agentId: item.focusAgentId,
      label: `${item.fromLabel} -> ${item.toLabel}`,
      summary: item.summary,
      timestamp: item.updatedAt,
      tone: item.tone,
      sourceLabel: `${item.kindLabel} · ${item.stateLabel}`,
    })),
    ...input.timeline.map((item) => ({
      id: `history:${item.id}`,
      agentId: item.agentId,
      label: item.title,
      summary: item.summary,
      timestamp: item.timestamp,
      tone: item.tone,
      sourceLabel: "Signal",
    })),
  ];

  return events
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .slice(0, 10);
}

function buildRecommendedActions(input: {
  focusAgent: RuntimeInspectorAgentSurface | null;
  agents: RuntimeInspectorAgentSurface[];
}): RuntimeInspectorRecommendedAction[] {
  const actions: RuntimeInspectorRecommendedAction[] = [];
  const focus = input.focusAgent;
  if (focus) {
    actions.push({
      id: `${focus.agentId}:chat`,
      label: `打开 ${focus.nickname} 会话`,
      summary: focus.coordinationState === "waiting_input" || focus.coordinationState === "waiting_peer"
        ? "先在会话里推进这条等待中的协作链。"
        : "直接查看这名成员的当前执行上下文。",
      to: `/chat/${encodeURIComponent(focus.agentId)}`,
      tone:
        focus.interventionState === "takeover_required" || focus.coordinationState === "explicit_blocked"
          ? "danger"
          : focus.interventionState === "overdue" || focus.interventionState === "escalated"
            ? "warning"
            : "default",
      agentId: focus.agentId,
    });
    actions.push({
      id: `${focus.agentId}:detail`,
      label: `查看 ${focus.nickname} 详情`,
      summary: "核对该成员的 session、run、证据和当前挂载任务。",
      to: `/employees/${encodeURIComponent(focus.agentId)}`,
      tone: "default",
      agentId: focus.agentId,
    });
  }
  const interventionAgent = input.agents.find(
    (agent) => agent.interventionState !== "healthy" || agent.coordinationState === "explicit_blocked",
  );
  if (interventionAgent) {
    actions.push({
      id: "board",
      label: "打开工作看板",
      summary: `结合 ${interventionAgent.nickname} 当前链路，确认 work item、dispatch 和升级状态。`,
      to: "/board",
      tone: interventionAgent.attention === "critical" ? "danger" : "warning",
      agentId: interventionAgent.agentId,
    });
  }
  if (actions.length === 0) {
    actions.push({
      id: "ops",
      label: "查看运营大厅",
      summary: "当前没有明显瓶颈，可从运营视角继续观察整体负载。",
      to: "/ops",
      tone: "default",
    });
  }
  return actions.slice(0, 3);
}

function resolveActorLabel(
  actorId: string | null | undefined,
  employeeByActorId: Map<string, EmployeeRef>,
): string {
  if (!actorId) {
    return "系统";
  }
  return employeeByActorId.get(actorId)?.nickname ?? actorId;
}

function resolveDepartmentLabel(
  departmentId: string | null | undefined,
  company: Company,
): string {
  if (!departmentId) {
    return "相关团队";
  }
  return company.departments?.find((department) => department.id === departmentId)?.name ?? departmentId;
}

function buildRuntimeChainLinks(input: {
  company: Company;
  activeWorkItems: WorkItemRecord[];
  activeDispatches: RuntimeInspectorInput["activeDispatches"];
  activeSupportRequests: RuntimeInspectorInput["activeSupportRequests"];
  activeEscalations: RuntimeInspectorInput["activeEscalations"];
}): RuntimeInspectorChainLink[] {
  const employeeByActorId = new Map(
    input.company.employees.map((employee) => [employee.agentId, employee] as const),
  );
  const workItemsById = new Map(
    input.activeWorkItems.map((workItem) => [workItem.id, workItem] as const),
  );
  const supportRequestsById = new Map(
    input.activeSupportRequests.map((request) => [request.id, request] as const),
  );
  const links: RuntimeInspectorChainLink[] = [];

  const pushLink = (link: RuntimeInspectorChainLink) => {
    links.push(link);
  };

  [...input.activeWorkItems]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .forEach((workItem) => {
      if (
        (workItem.status === "waiting_owner" ||
          workItem.status === "waiting_review" ||
          workItem.stageGateStatus === "waiting_confirmation") &&
        workItem.ownerActorId &&
        workItem.batonActorId &&
        workItem.ownerActorId !== workItem.batonActorId
      ) {
        pushLink({
          id: `work:${workItem.id}:awaiting`,
          kind: "work_item",
          kindLabel: "Work",
          stateLabel:
            workItem.stageGateStatus === "waiting_confirmation" || workItem.status === "waiting_review"
              ? "待确认"
              : "待输入",
          tone: "warning",
          fromAgentId: workItem.ownerActorId,
          fromLabel: resolveActorLabel(workItem.ownerActorId, employeeByActorId),
          toAgentId: workItem.batonActorId,
          toLabel: resolveActorLabel(workItem.batonActorId, employeeByActorId),
          summary: workItem.displayNextAction || workItem.nextAction || workItem.title,
          updatedAt: workItem.updatedAt,
          focusAgentId: workItem.ownerActorId,
        });
      }

      const activeStep = workItem.steps.find(
        (step) =>
          step.status === "active" &&
          step.assigneeActorId &&
          step.assigneeActorId !== workItem.ownerActorId,
      );
      if (activeStep?.assigneeActorId) {
        pushLink({
          id: `work:${workItem.id}:step:${activeStep.id}`,
          kind: "work_item",
          kindLabel: "Work",
          stateLabel: "执行中",
          tone: "info",
          fromAgentId: workItem.ownerActorId ?? workItem.batonActorId ?? null,
          fromLabel: resolveActorLabel(workItem.ownerActorId ?? workItem.batonActorId, employeeByActorId),
          toAgentId: activeStep.assigneeActorId,
          toLabel: resolveActorLabel(activeStep.assigneeActorId, employeeByActorId),
          summary: activeStep.title || workItem.title,
          updatedAt: activeStep.updatedAt,
          focusAgentId: activeStep.assigneeActorId,
        });
      }

      if (workItem.status === "blocked") {
        pushLink({
          id: `work:${workItem.id}:blocked`,
          kind: "work_item",
          kindLabel: "Work",
          stateLabel: "阻塞",
          tone: "danger",
          fromAgentId: workItem.ownerActorId ?? null,
          fromLabel: resolveActorLabel(workItem.ownerActorId, employeeByActorId),
          toAgentId: workItem.batonActorId ?? null,
          toLabel: resolveActorLabel(workItem.batonActorId, employeeByActorId),
          summary: workItem.nextAction || workItem.displaySummary || workItem.title,
          updatedAt: workItem.updatedAt,
          focusAgentId: workItem.ownerActorId ?? workItem.batonActorId ?? null,
        });
      }
    });

  [...input.activeDispatches]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .forEach((dispatch) => {
      if (dispatch.status === "answered" || dispatch.status === "superseded") {
        return;
      }
      const checkout = describeDispatchCheckout({
        dispatch,
        resolveActorLabel: (actorId) => resolveActorLabel(actorId, employeeByActorId),
      });
      dispatch.targetActorIds.forEach((targetActorId) => {
        pushLink({
          id: `dispatch:${dispatch.id}:${targetActorId}`,
          kind: "dispatch",
          kindLabel: "Dispatch",
          stateLabel: checkout.stateLabel,
          tone: checkout.tone === "danger" ? "danger" : checkout.tone === "warning" ? "warning" : "info",
          fromAgentId: dispatch.fromActorId ?? null,
          fromLabel: resolveActorLabel(dispatch.fromActorId, employeeByActorId),
          toAgentId: targetActorId,
          toLabel: resolveActorLabel(targetActorId, employeeByActorId),
          summary: checkout.detail,
          updatedAt: dispatch.updatedAt,
          focusAgentId: targetActorId,
        });
      });
    });

  [...input.activeSupportRequests]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .forEach((request) => {
      if (request.status === "fulfilled" || request.status === "cancelled") {
        return;
      }
      pushLink({
        id: `support:${request.id}`,
        kind: "support_request",
        kindLabel: "Support",
        stateLabel:
          request.status === "blocked"
            ? "支援阻塞"
            : request.status === "in_progress"
              ? "支援中"
              : "待支援",
        tone:
          request.status === "blocked"
            ? "danger"
            : request.status === "in_progress"
              ? "info"
              : "warning",
        fromAgentId: request.requestedByActorId,
        fromLabel: resolveActorLabel(request.requestedByActorId, employeeByActorId),
        toAgentId: request.ownerActorId ?? null,
        toLabel:
          request.ownerActorId != null
            ? resolveActorLabel(request.ownerActorId, employeeByActorId)
            : `${resolveDepartmentLabel(request.targetDepartmentId, input.company)} 团队`,
        summary: request.detail || request.summary,
        updatedAt: request.updatedAt,
        focusAgentId: request.ownerActorId ?? request.requestedByActorId,
      });
    });

  [...input.activeEscalations]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .forEach((escalation) => {
      if (escalation.status !== "open" && escalation.status !== "acknowledged") {
        return;
      }
      const sourceSupportRequest = supportRequestsById.get(escalation.sourceId);
      const sourceWorkItem = workItemsById.get(escalation.sourceId) ?? (
        escalation.workItemId ? workItemsById.get(escalation.workItemId) : undefined
      );
      const sourceActorId =
        sourceSupportRequest?.ownerActorId ??
        sourceSupportRequest?.requestedByActorId ??
        sourceWorkItem?.ownerActorId ??
        sourceWorkItem?.batonActorId ??
        null;
      pushLink({
        id: `escalation:${escalation.id}`,
        kind: "escalation",
        kindLabel: "Escalation",
        stateLabel: escalation.status === "acknowledged" ? "处理中" : "已升级",
        tone: "danger",
        fromAgentId: sourceActorId,
        fromLabel: resolveActorLabel(sourceActorId, employeeByActorId),
        toAgentId: escalation.targetActorId,
        toLabel: resolveActorLabel(escalation.targetActorId, employeeByActorId),
        summary: escalation.reason,
        updatedAt: escalation.updatedAt,
        focusAgentId: escalation.targetActorId,
      });
    });

  const toneRank = { danger: 0, warning: 1, info: 2 } as const;
  return links
    .sort((left, right) => {
      if (toneRank[left.tone] !== toneRank[right.tone]) {
        return toneRank[left.tone] - toneRank[right.tone];
      }
      return right.updatedAt - left.updatedAt;
    })
    .slice(0, 8);
}

export function buildRuntimeInspectorSurface(input: RuntimeInspectorInput): RuntimeInspectorSurface | null {
  if (!input.activeCompany) {
    return null;
  }

  const company = input.activeCompany;
  const fallbackStatuses = buildCanonicalAgentStatusProjection({
    company,
    activeWorkItems: input.activeWorkItems,
    activeDispatches: input.activeDispatches,
    activeSupportRequests: input.activeSupportRequests,
    activeEscalations: input.activeEscalations,
    activeAgentRuntime: input.activeAgentRuntime,
    activeAgentSessions: input.activeAgentSessions,
  });
  const authorityHealth =
    input.activeAgentStatuses.length > 0
      ? input.activeAgentStatusHealth ??
        buildCanonicalAgentStatusHealth({
          company,
          statuses: input.activeAgentStatuses,
          source: "authority",
          generatedAt: Date.now(),
          note: null,
        })
      : null;
  const fallbackHealth = buildCanonicalAgentStatusHealth({
    company,
    statuses: fallbackStatuses,
    source: "fallback",
    generatedAt: Date.now(),
    note: authorityHealth?.coverage === "authority_partial"
      ? `Authority 仅覆盖 ${authorityHealth.coveredAgentCount}/${authorityHealth.expectedAgentCount} 名成员，缺失成员已局部回退到前端兼容推导。`
      : "Authority 当前没有可用的 canonical agent statuses。",
  });
  const statusHealth =
    authorityHealth?.coverage === "authority_complete"
      ? authorityHealth
      : authorityHealth?.coverage === "authority_partial"
        ? authorityHealth
        : fallbackHealth;
  const canonicalByAgentId = new Map(
    fallbackStatuses.map((status) => [status.agentId, status] as const),
  );
  const statusOriginByAgentId = new Map<string, "authority" | "fallback">(
    fallbackStatuses.map((status) => [status.agentId, "fallback"] as const),
  );
  input.activeAgentStatuses.forEach((status) => {
    canonicalByAgentId.set(status.agentId, status);
    statusOriginByAgentId.set(status.agentId, "authority");
  });
  const runtimeByAgentId = new Map(
    input.activeAgentRuntime.map((runtime) => [runtime.agentId, runtime] as const),
  );
  const sessionsByAgentId = new Map<string, AgentSessionRecord[]>();
  const runsByAgentId = new Map<string, AgentRunRecord[]>();

  input.activeAgentSessions.forEach((session) => {
    if (!session.agentId) {
      return;
    }
    const group = sessionsByAgentId.get(session.agentId) ?? [];
    group.push(session);
    sessionsByAgentId.set(session.agentId, group);
  });

  input.activeAgentRuns.forEach((run) => {
    if (!run.agentId) {
      return;
    }
    const group = runsByAgentId.get(run.agentId) ?? [];
    group.push(run);
    runsByAgentId.set(run.agentId, group);
  });

  const agents = company.employees
    .map((employee) => {
      const runtime = runtimeByAgentId.get(employee.agentId) ?? {
        agentId: employee.agentId,
        providerId: "openclaw",
        availability: "no_signal" as const,
        activeSessionKeys: [],
        activeRunIds: [],
        lastSeenAt: null,
        lastBusyAt: null,
        lastIdleAt: null,
        latestTerminalAt: null,
        latestTerminalSummary: null,
        currentWorkload: "free" as const,
        runtimeEvidence: [],
      };
      const canonical = canonicalByAgentId.get(employee.agentId) ?? {
        agentId: employee.agentId,
        runtimeState: runtime.availability,
        coordinationState: "none" as const,
        interventionState: "healthy" as const,
        reason: runtime.availability === "offline" ? "Provider 明确报告当前节点不可达。" : "当前没有观察到可信 runtime 信号。",
        currentAssignment: "当前没有显式挂载的任务",
        currentObjective: "当前没有新的协作目标。",
        latestSignalAt: null,
        activeSessionCount: runtime.activeSessionKeys.length,
        activeRunCount: runtime.activeRunIds.length,
        openDispatchCount: 0,
        blockedDispatchCount: 0,
        openSupportRequestCount: 0,
        blockedSupportRequestCount: 0,
        openRequestCount: 0,
        blockedRequestCount: 0,
        openHandoffCount: 0,
        blockedHandoffCount: 0,
        openEscalationCount: 0,
        blockedWorkItemCount: 0,
        primaryWorkItemId: null,
      };
      const sessions = [...(sessionsByAgentId.get(employee.agentId) ?? [])].sort(
        (left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0),
      );
      const runs = [...(runsByAgentId.get(employee.agentId) ?? [])].sort(
        (left, right) => right.lastEventAt - left.lastEventAt,
      );
      const department = company.departments?.find((entry) => entry.id === employee.departmentId) ?? null;
      const departmentKind = inferDepartmentKind(company, department);
      const primaryWorkItem =
        input.activeWorkItems.find((item) => item.id === canonical.primaryWorkItemId) ?? null;
      const attention = resolveAttentionFromCanonical(canonical);
      const activityLabel = resolveActivityLabel({
        employee,
        runtimeState: canonical.runtimeState,
        coordinationState: canonical.coordinationState,
        interventionState: canonical.interventionState,
      });
      const sceneZoneId = resolveSceneZone(employee, departmentKind);

      return {
        agentId: employee.agentId,
        nickname: employee.nickname,
        role: employee.role,
        avatarJobId: employee.avatarJobId,
        employee,
        departmentId: employee.departmentId ?? null,
        departmentName: department?.name ?? "未分配部门",
        departmentKind,
        statusOrigin: statusOriginByAgentId.get(employee.agentId) ?? "fallback",
        availability: canonical.runtimeState,
        runtimeState: canonical.runtimeState,
        coordinationState: canonical.coordinationState,
        interventionState: canonical.interventionState,
        legacyStatus: mapAgentRuntimeAvailabilityToLegacyStatus(canonical.runtimeState),
        workload: runtime.currentWorkload,
        attention,
        attentionReason: resolveAttentionReasonFromCanonical(canonical),
        reason: canonical.reason,
        activeSessionCount: canonical.activeSessionCount,
        activeRunCount: canonical.activeRunCount,
        lastSeenAt: runtime.lastSeenAt,
        lastBusyAt: runtime.lastBusyAt,
        lastIdleAt: runtime.lastIdleAt,
        latestSignalAt: canonical.latestSignalAt,
        currentAssignment: canonical.currentAssignment,
        currentObjective: canonical.currentObjective,
        activityLabel,
        sceneZoneId,
        sceneZoneLabel: resolveSceneZoneLabel(sceneZoneId),
        sceneActivityLabel: resolveSceneActivityLabel({
          activityLabel,
          runtimeState: canonical.runtimeState,
          currentAssignment: canonical.currentAssignment,
        }),
        runtimeEvidence: runtime.runtimeEvidence,
        sessions,
        runs,
        primaryWorkItem,
        openDispatchCount: canonical.openDispatchCount,
        blockedDispatchCount: canonical.blockedDispatchCount,
        openSupportRequestCount: canonical.openSupportRequestCount,
        blockedSupportRequestCount: canonical.blockedSupportRequestCount,
        openEscalationCount: canonical.openEscalationCount,
        blockedWorkItemCount: canonical.blockedWorkItemCount,
      } satisfies RuntimeInspectorAgentSurface;
    })
    .sort((left, right) => {
      const rankDelta = rankAgentForFocus(left) - rankAgentForFocus(right);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return (right.latestSignalAt ?? 0) - (left.latestSignalAt ?? 0);
    });

  const zoneOrder: RuntimeSceneZoneId[] = [
    "command-deck",
    "tech-lab",
    "ops-rail",
    "people-hub",
    "studio-floor",
  ];
  const sceneZones = zoneOrder.map((zoneId) => {
    const zoneAgents = agents.filter((agent) => agent.sceneZoneId === zoneId);
    return {
      id: zoneId,
      label: resolveSceneZoneLabel(zoneId),
      description: resolveSceneZoneDescription(zoneId),
      tone: resolveSceneZoneTone(zoneId),
      agents: zoneAgents,
      busyCount: zoneAgents.filter((agent) => agent.availability === "busy").length,
      attentionCount: zoneAgents.filter((agent) => agent.attention !== "healthy").length,
      status:
        zoneAgents.some((agent) => agent.attention === "critical")
          ? "critical"
          : zoneAgents.some((agent) => agent.attention === "watch")
            ? "watch"
            : "healthy",
    } satisfies RuntimeInspectorSceneZone;
  });

  const focusAgent = agents[0] ?? null;
  const replay = agents
    .map((agent) => buildReplayEvent(agent))
    .filter((event): event is RuntimeInspectorReplayEvent => Boolean(event))
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .slice(0, 8);
  const chainLinks = buildRuntimeChainLinks({
    company,
    activeWorkItems: input.activeWorkItems,
    activeDispatches: input.activeDispatches,
    activeSupportRequests: input.activeSupportRequests,
    activeEscalations: input.activeEscalations,
  });
  const triageQueue = agents
    .filter((agent) =>
      agent.attention !== "healthy" ||
      agent.coordinationState !== "none" ||
      agent.runtimeState === "busy",
    )
    .slice(0, 6);
  const watchlist = agents.filter((agent) => agent.attention !== "healthy").slice(0, 5);
  const timeline = agents
    .filter((agent) => agent.latestSignalAt != null || agent.coordinationState !== "none")
    .map((agent) => buildTimelineEvent(agent))
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .slice(0, 8);
  const historyWindow = buildHistoryWindow({
    replay,
    chainLinks,
    timeline,
  });
  const recommendedActions = buildRecommendedActions({
    focusAgent,
    agents,
  });

  return {
    company,
    agents,
    statusHealth,
    statusCoverage: describeStatusCoverage(statusHealth, company),
    sceneZones,
    focusAgent,
    replay,
    historyWindow,
    chainLinks,
    triageQueue,
    watchlist,
    timeline,
    recommendedActions,
    busyAgents: agents.filter((agent) => agent.availability === "busy").length,
    degradedAgents: agents.filter((agent) => agent.availability === "degraded").length,
    criticalAgents: agents.filter((agent) => agentStatusNeedsIntervention(canonicalByAgentId.get(agent.agentId) ?? {
      agentId: agent.agentId,
      runtimeState: agent.runtimeState,
      coordinationState: agent.coordinationState,
      interventionState: agent.interventionState,
      reason: agent.reason,
      currentAssignment: agent.currentAssignment,
      currentObjective: agent.currentObjective,
      latestSignalAt: agent.latestSignalAt,
      activeSessionCount: agent.activeSessionCount,
      activeRunCount: agent.activeRunCount,
      openDispatchCount: agent.openDispatchCount,
      blockedDispatchCount: agent.blockedDispatchCount,
      openSupportRequestCount: agent.openSupportRequestCount,
      blockedSupportRequestCount: agent.blockedSupportRequestCount,
      openRequestCount: 0,
      blockedRequestCount: 0,
      openHandoffCount: 0,
      blockedHandoffCount: 0,
      openEscalationCount: agent.openEscalationCount,
      blockedWorkItemCount: agent.blockedWorkItemCount,
      primaryWorkItemId: agent.primaryWorkItem?.id ?? null,
    })).length,
    activeRuns: input.activeAgentRuns.length,
    activeSessions: new Set(
      input.activeAgentRuntime.flatMap((runtime) => runtime.activeSessionKeys),
    ).size,
  };
}

export function useRuntimeInspectorQuery() {
  return useCompanyRuntimeStore(useShallow(selectRuntimeInspectorState));
}

export function useRuntimeInspectorViewModel() {
  const runtimeState = useRuntimeInspectorQuery();
  const authoritySync = useAuthorityRuntimeSyncStore(
    useShallow((state) => ({
      lastAppliedSource: state.lastAppliedSource,
      lastPullAt: state.lastPullAt,
      lastPushAt: state.lastPushAt,
      lastError: state.lastError,
      lastErrorAt: state.lastErrorAt,
    })),
  );
  const surface = useMemo(() => buildRuntimeInspectorSurface(runtimeState), [runtimeState]);
  const statusSource: RuntimeInspectorStatusSource =
    surface?.statusHealth.coverage ?? "fallback";
  return {
    ...runtimeState,
    surface,
    statusSource,
    authoritySync,
  };
}

export function useRuntimeInspectorProcessTelemetry(
  agent: RuntimeInspectorAgentSurface | null,
): RuntimeInspectorProcessTelemetry {
  return useRuntimeInspectorProcessTelemetrySource({
    scope: "focused",
    agentId: agent?.agentId ?? null,
    sessionKeys: [...new Set((agent?.sessions ?? []).map((session) => session.sessionKey).filter(Boolean))],
  });
}

export function useRuntimeInspectorGlobalProcessTelemetry(): RuntimeInspectorProcessTelemetry {
  return useRuntimeInspectorProcessTelemetrySource({
    scope: "global",
    agentId: null,
    sessionKeys: null,
  });
}

function useRuntimeInspectorProcessTelemetrySource(input: {
  scope: "focused" | "global";
  agentId: string | null;
  sessionKeys: string[] | null;
}): RuntimeInspectorProcessTelemetry {
  const sessionKeySignature = input.sessionKeys?.join("|") ?? "__global__";
  const [telemetry, setTelemetry] = useState<RuntimeInspectorProcessTelemetry>({
    capabilityState: "idle",
    agentId: input.agentId,
    scope: input.scope,
    lastCheckedAt: null,
    error: null,
    processes: [],
    runningCount: 0,
    totalCount: 0,
  });

  useEffect(() => {
    const sessionKeys = input.sessionKeys ? [...new Set(input.sessionKeys)] : [];
    if (!backend.capabilities.processRuntime || !backend.listProcesses || !backend.pollProcess) {
      setTelemetry({
        capabilityState: "unsupported",
        agentId: input.agentId,
        scope: input.scope,
        lastCheckedAt: Date.now(),
        error: "当前 provider 未开放 process runtime。",
        processes: [],
        runningCount: 0,
        totalCount: 0,
      });
      return;
    }

    if (input.scope === "focused" && (!input.agentId || sessionKeys.length === 0)) {
      setTelemetry({
        capabilityState: "idle",
        agentId: input.agentId,
        scope: input.scope,
        lastCheckedAt: null,
        error: null,
        processes: [],
        runningCount: 0,
        totalCount: 0,
      });
      return;
    }

    let cancelled = false;
    let processRuntimeUnsupported = false;

    const refresh = async (initial = false) => {
      if (processRuntimeUnsupported) {
        return;
      }
      if (initial) {
        setTelemetry((previous: RuntimeInspectorProcessTelemetry) => ({
          ...previous,
          capabilityState: "loading",
          agentId: input.agentId,
          scope: input.scope,
          error: null,
        }));
      }

      try {
        const flattened =
          input.scope === "global"
            ? ((await backend.listProcesses()) ?? [])
            : (
                await Promise.all(
                  sessionKeys.map(async (sessionKey) => {
                    const processes = await backend.listProcesses(sessionKey);
                    return Array.isArray(processes) ? processes : [];
                  }),
                )
              ).flat();
        const activeProcessIds = normalizeLiveProcesses(flattened)
          .filter((process) => isActiveProcessState(process.status))
          .slice(0, MAX_PROCESS_POLLS)
          .map((process) => process.processId);
        const polled = await Promise.all(
          activeProcessIds.map(async (processId) => {
            try {
              return await backend.pollProcess(processId);
            } catch (error) {
              if (isUnsupportedProcessRuntimeError(error)) {
                throw error;
              }
              return null;
            }
          }),
        );
        if (cancelled) {
          return;
        }
        const normalized = normalizeLiveProcesses([
          ...flattened,
          ...polled.filter((process: ProviderProcessRecord | null): process is ProviderProcessRecord => Boolean(process)),
        ]);
        setTelemetry({
          capabilityState: "ready",
          agentId: input.agentId,
          scope: input.scope,
          lastCheckedAt: Date.now(),
          error: null,
          processes: normalized,
          runningCount: normalized.filter((process) => isActiveProcessState(process.status)).length,
          totalCount: normalized.length,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isUnsupportedProcessRuntimeError(error)) {
          processRuntimeUnsupported = true;
          setTelemetry({
            capabilityState: "unsupported",
            agentId: input.agentId,
            scope: input.scope,
            lastCheckedAt: Date.now(),
            error: error instanceof Error ? error.message : String(error),
            processes: [],
            runningCount: 0,
            totalCount: 0,
          });
          return;
        }
        setTelemetry({
          capabilityState: "error",
          agentId: input.agentId,
          scope: input.scope,
          lastCheckedAt: Date.now(),
          error: error instanceof Error ? error.message : String(error),
          processes: [],
          runningCount: 0,
          totalCount: 0,
        });
      }
    };

    void refresh(true);
    const intervalId = window.setInterval(() => {
      void refresh(false);
    }, PROCESS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [input.agentId, input.scope, sessionKeySignature]);

  return telemetry;
}
