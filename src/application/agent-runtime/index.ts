import type {
  GatewaySessionRow,
  ProviderRunState,
  ProviderRuntimeEvent,
  ProviderRuntimeStreamKind,
  ProviderSessionState,
  ProviderSessionStatus,
} from "../../infrastructure/gateway/runtime/types";
import type {
  DispatchRecord,
  EscalationRecord,
  HandoffRecord,
  RequestRecord,
  SupportRequestRecord,
} from "../../domain/delegation/types";
import type { WorkItemRecord } from "../../domain/mission/types";
import type { Company } from "../../domain/org/types";
import { resolveSessionActorId, resolveSessionUpdatedAt } from "../../lib/sessions";

export type AgentSessionState =
  | "unknown"
  | "idle"
  | "running"
  | "streaming"
  | "error"
  | "offline";

export type AgentRunState =
  | "accepted"
  | "running"
  | "streaming"
  | "completed"
  | "aborted"
  | "error";

export type AgentRuntimeAvailability =
  | "no_signal"
  | "idle"
  | "busy"
  | "degraded"
  | "offline";

export type AgentWorkloadState = "free" | "busy" | "saturated";

export type AgentSessionSource = "lifecycle" | "session_status" | "sessions_list" | "fallback";

export type AgentRuntimeEvidence = {
  kind: "run" | "session" | "status" | "error";
  summary: string;
  timestamp: number;
};

export type AgentSessionRecord = {
  sessionKey: string;
  agentId: string | null;
  providerId: string;
  sessionState: AgentSessionState;
  lastSeenAt: number | null;
  lastStatusSyncAt: number | null;
  lastMessageAt: number | null;
  abortedLastRun: boolean;
  lastError: string | null;
  lastTerminalRunState?: Extract<AgentRunState, "completed" | "aborted" | "error"> | null;
  lastTerminalSummary?: string | null;
  source: AgentSessionSource;
};

export type AgentRunRecord = {
  runId: string;
  agentId: string | null;
  sessionKey: string;
  providerId: string;
  state: AgentRunState;
  startedAt: number;
  lastEventAt: number;
  endedAt: number | null;
  streamKindsSeen: ProviderRuntimeStreamKind[];
  error: string | null;
};

export type AgentRuntimeRecord = {
  agentId: string;
  providerId: string;
  availability: AgentRuntimeAvailability;
  activeSessionKeys: string[];
  activeRunIds: string[];
  lastSeenAt: number | null;
  lastBusyAt: number | null;
  lastIdleAt: number | null;
  latestTerminalAt?: number | null;
  latestTerminalSummary?: string | null;
  currentWorkload: AgentWorkloadState;
  runtimeEvidence: AgentRuntimeEvidence[];
};

export type CoordinationState =
  | "none"
  | "pending_ack"
  | "executing"
  | "waiting_peer"
  | "waiting_input"
  | "explicit_blocked"
  | "completed";

export type InterventionState =
  | "healthy"
  | "overdue"
  | "escalated"
  | "takeover_required";

export type CanonicalAgentStatusRecord = {
  agentId: string;
  runtimeState: AgentRuntimeAvailability;
  coordinationState: CoordinationState;
  interventionState: InterventionState;
  reason: string;
  currentAssignment: string;
  currentObjective: string;
  latestSignalAt: number | null;
  activeSessionCount: number;
  activeRunCount: number;
  openDispatchCount: number;
  blockedDispatchCount: number;
  openSupportRequestCount: number;
  blockedSupportRequestCount: number;
  openRequestCount: number;
  blockedRequestCount: number;
  openHandoffCount: number;
  blockedHandoffCount: number;
  openEscalationCount: number;
  blockedWorkItemCount: number;
  primaryWorkItemId: string | null;
};

type RuntimeProjectionInput = {
  agentIds?: string[];
  providerId: string;
  sessions: AgentSessionRecord[];
  runs: AgentRunRecord[];
};

function normalizeTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeProviderSessionState(value: unknown): ProviderSessionState {
  switch (value) {
    case "idle":
    case "running":
    case "streaming":
    case "error":
    case "offline":
      return value;
    default:
      return "unknown";
  }
}

function resolveProviderSessionStateCandidate(...values: unknown[]): ProviderSessionState {
  for (const value of values) {
    const normalized = normalizeProviderSessionState(value);
    if (normalized !== "unknown") {
      return normalized;
    }
  }
  return "unknown";
}

function normalizeProviderRunState(value: unknown): ProviderRunState | null {
  switch (value) {
    case "accepted":
    case "running":
    case "streaming":
    case "completed":
    case "aborted":
    case "error":
      return value;
    case "started":
      return "running";
    case "done":
    case "completed_ok":
    case "end":
      return "completed";
    case "failed":
      return "error";
    case "cancelled":
      return "aborted";
    default:
      return null;
  }
}

function normalizeStreamKind(value: unknown): ProviderRuntimeStreamKind | null {
  switch (value) {
    case "lifecycle":
    case "assistant":
    case "tool":
      return value;
    case "job":
      return "lifecycle";
    default:
      return null;
  }
}

function dedupeStreamKinds(kinds: ProviderRuntimeStreamKind[]): ProviderRuntimeStreamKind[] {
  return [...new Set(kinds)];
}

export function isAgentRunTerminalState(state: AgentRunState): boolean {
  return state === "completed" || state === "aborted" || state === "error";
}

export function isAgentRunActive(state: AgentRunState): boolean {
  return !isAgentRunTerminalState(state);
}

export function mapAgentRuntimeAvailabilityToLegacyStatus(
  availability: AgentRuntimeAvailability,
): "running" | "idle" | "stopped" {
  if (availability === "busy") {
    return "running";
  }
  if (availability === "idle" || availability === "degraded" || availability === "no_signal") {
    return "idle";
  }
  return "stopped";
}

function buildTerminalRunSummary(
  state: Extract<AgentRunState, "completed" | "aborted" | "error">,
  sessionKey: string,
  errorMessage?: string | null,
): string {
  if (state === "completed") {
    return `${sessionKey} 最近一次执行已完成。`;
  }
  if (state === "aborted") {
    return errorMessage?.trim() || `${sessionKey} 最近一次执行被中止。`;
  }
  return errorMessage?.trim() || `${sessionKey} 最近一次执行失败。`;
}

function deriveSessionStateFromStatus(status: ProviderSessionStatus): AgentSessionState {
  if (status.state === "running" || status.state === "streaming") {
    return status.state;
  }
  if (status.state === "error") {
    return "error";
  }
  if (status.state === "offline") {
    return "offline";
  }
  if (status.state === "idle") {
    return "idle";
  }
  return "unknown";
}

export function normalizeProviderSessionStatus(
  providerId: string,
  sessionKey: string,
  raw: unknown,
): ProviderSessionStatus {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      providerId,
      sessionKey,
      agentId: resolveSessionActorId(sessionKey),
      state: "unknown",
      raw,
    };
  }

  const record = raw as Record<string, unknown>;
  const state = resolveProviderSessionStateCandidate(record.state, record.status);

  const normalizedState =
    state !== "unknown"
      ? state
      : record.streaming === true
        ? "streaming"
        : record.running === true || record.busy === true
          ? "running"
          : record.offline === true
            ? "offline"
            : record.error
              ? "error"
              : "unknown";

  return {
    providerId,
    sessionKey,
    agentId:
      normalizeNonEmptyString(record.actorId)
      ?? normalizeNonEmptyString(record.agentId)
      ?? resolveSessionActorId(sessionKey),
    state: normalizedState,
    updatedAt:
      normalizeTimestamp(record.updatedAt)
      ?? normalizeTimestamp(record.lastSeenAt)
      ?? normalizeTimestamp(record.timestamp),
    lastMessageAt:
      normalizeTimestamp(record.lastMessageAt)
      ?? normalizeTimestamp(record.last_message_at),
    runId:
      normalizeNonEmptyString(record.runId)
      ?? normalizeNonEmptyString(record.activeRunId),
    errorMessage:
      normalizeNonEmptyString(record.errorMessage)
      ?? normalizeNonEmptyString(record.error),
    raw,
  };
}

export function normalizeProviderRuntimeEvent(
  providerId: string,
  raw: unknown,
): ProviderRuntimeEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null;
  const nested =
    record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : null;

  const streamKind =
    normalizeStreamKind(record.stream)
    ?? normalizeStreamKind(data?.stream)
    ?? normalizeStreamKind(data?.type)
    ?? normalizeStreamKind(record.type);
  if (!streamKind) {
    return null;
  }

  const runState =
    normalizeProviderRunState(record.state)
    ?? normalizeProviderRunState(data?.state)
    ?? normalizeProviderRunState(nested?.state)
    ?? (streamKind === "assistant" ? "streaming" : null);
  const runId =
    normalizeNonEmptyString(record.runId)
    ?? normalizeNonEmptyString(data?.runId)
    ?? normalizeNonEmptyString(nested?.runId);
  const sessionKey =
    normalizeNonEmptyString(record.sessionKey)
    ?? normalizeNonEmptyString(data?.sessionKey)
    ?? normalizeNonEmptyString(nested?.sessionKey);
  const agentId =
    normalizeNonEmptyString(record.actorId)
    ?? normalizeNonEmptyString(record.agentId)
    ?? normalizeNonEmptyString(data?.actorId)
    ?? normalizeNonEmptyString(data?.agentId)
    ?? normalizeNonEmptyString(nested?.actorId)
    ?? normalizeNonEmptyString(nested?.agentId)
    ?? (sessionKey ? resolveSessionActorId(sessionKey) : null);
  const timestamp =
    normalizeTimestamp(record.timestamp)
    ?? normalizeTimestamp(data?.timestamp)
    ?? normalizeTimestamp(nested?.timestamp)
    ?? Date.now();

  return {
    providerId,
    agentId,
    sessionKey,
    runId,
    streamKind,
    runState,
    timestamp,
    errorMessage:
      normalizeNonEmptyString(record.errorMessage)
      ?? normalizeNonEmptyString(data?.errorMessage)
      ?? normalizeNonEmptyString(nested?.errorMessage)
      ?? normalizeNonEmptyString(record.error)
      ?? normalizeNonEmptyString(data?.error)
      ?? normalizeNonEmptyString(nested?.error),
    toolName:
      normalizeNonEmptyString(record.toolName)
      ?? normalizeNonEmptyString(data?.toolName)
      ?? normalizeNonEmptyString(data?.name),
    raw,
  };
}

export function buildAgentSessionRecordsFromSessions(input: {
  existing?: AgentSessionRecord[];
  providerId: string;
  sessions: GatewaySessionRow[];
  now?: number;
}): AgentSessionRecord[] {
  const now = input.now ?? Date.now();
  const bySessionKey = new Map((input.existing ?? []).map((session) => [session.sessionKey, session] as const));

  for (const session of input.sessions) {
    const previous = bySessionKey.get(session.key);
    const updatedAt = resolveSessionUpdatedAt(session) || now;
    const next: AgentSessionRecord = {
      sessionKey: session.key,
      agentId: resolveSessionActorId(session),
      providerId: input.providerId,
      sessionState:
        previous?.sessionState
        ?? (session.abortedLastRun ? "error" : "idle"),
      lastSeenAt: Math.max(previous?.lastSeenAt ?? 0, updatedAt) || null,
      lastStatusSyncAt: previous?.lastStatusSyncAt ?? null,
      lastMessageAt: Math.max(previous?.lastMessageAt ?? 0, updatedAt) || null,
      abortedLastRun: Boolean(session.abortedLastRun ?? previous?.abortedLastRun),
      lastError: previous?.lastError ?? (session.abortedLastRun ? "Gateway 标记最近一次执行为 aborted。" : null),
      lastTerminalRunState:
        previous?.lastTerminalRunState
        ?? (session.abortedLastRun ? "aborted" : null),
      lastTerminalSummary:
        previous?.lastTerminalSummary
        ?? (session.abortedLastRun ? "Gateway 标记最近一次执行为 aborted。" : null),
      source: previous?.source ?? "sessions_list",
    };
    bySessionKey.set(session.key, next);
  }

  return [...bySessionKey.values()].sort(
    (left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0),
  );
}

export function applyProviderSessionStatusToAgentSessions(input: {
  sessions: AgentSessionRecord[];
  status: ProviderSessionStatus;
  now?: number;
}): AgentSessionRecord[] {
  return applyProviderSessionStatusToAgentRuntime({
    sessions: input.sessions,
    runs: [],
    status: input.status,
    now: input.now,
  }).sessions;
}

export function applyProviderSessionStatusToAgentRuntime(input: {
  sessions: AgentSessionRecord[];
  runs: AgentRunRecord[];
  status: ProviderSessionStatus;
  now?: number;
}): {
  sessions: AgentSessionRecord[];
  runs: AgentRunRecord[];
} {
  const now = input.now ?? Date.now();
  const bySessionKey = new Map(input.sessions.map((session) => [session.sessionKey, session] as const));
  const runMap = new Map(input.runs.map((run) => [run.runId, run] as const));
  const previous = bySessionKey.get(input.status.sessionKey);
  const terminalState =
    input.status.state === "error"
      ? ("error" as const)
      : input.status.state === "idle" || input.status.state === "offline"
        ? previous?.abortedLastRun
          ? ("aborted" as const)
          : previous?.lastTerminalRunState ?? null
        : null;
  const terminalSummary =
    terminalState
      ? buildTerminalRunSummary(terminalState, input.status.sessionKey, input.status.errorMessage)
      : previous?.lastTerminalSummary ?? null;
  bySessionKey.set(input.status.sessionKey, {
    sessionKey: input.status.sessionKey,
    agentId: input.status.agentId ?? previous?.agentId ?? resolveSessionActorId(input.status.sessionKey),
    providerId: input.status.providerId,
    sessionState: deriveSessionStateFromStatus(input.status),
    lastSeenAt:
      Math.max(previous?.lastSeenAt ?? 0, input.status.updatedAt ?? now) || null,
    lastStatusSyncAt: now,
    lastMessageAt:
      Math.max(
        previous?.lastMessageAt ?? 0,
        input.status.lastMessageAt ?? input.status.updatedAt ?? 0,
      ) || null,
    abortedLastRun:
      terminalState === "aborted" || input.status.state === "error"
        ? true
        : previous?.abortedLastRun ?? false,
    lastError: input.status.errorMessage ?? previous?.lastError ?? null,
    lastTerminalRunState: terminalState,
    lastTerminalSummary: terminalSummary,
    source: "session_status",
  });

  if (input.status.runId && (input.status.state === "running" || input.status.state === "streaming")) {
    const previousRun = runMap.get(input.status.runId);
    runMap.set(input.status.runId, {
      runId: input.status.runId,
      agentId:
        input.status.agentId
        ?? previousRun?.agentId
        ?? previous?.agentId
        ?? resolveSessionActorId(input.status.sessionKey),
      sessionKey: input.status.sessionKey,
      providerId: input.status.providerId,
      state: input.status.state === "streaming" ? "streaming" : "running",
      startedAt: previousRun?.startedAt ?? input.status.updatedAt ?? now,
      lastEventAt: input.status.updatedAt ?? now,
      endedAt: null,
      streamKindsSeen: dedupeStreamKinds([...(previousRun?.streamKindsSeen ?? []), "lifecycle"]),
      error: previousRun?.error ?? null,
    });
  }

  if (input.status.state !== "running" && input.status.state !== "streaming") {
    for (const [runId, run] of runMap.entries()) {
      if (run.sessionKey === input.status.sessionKey) {
        runMap.delete(runId);
      }
    }
  }

  return {
    sessions: [...bySessionKey.values()].sort(
      (left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0),
    ),
    runs: [...runMap.values()].sort((left, right) => right.lastEventAt - left.lastEventAt),
  };
}

export function applyProviderRuntimeEvent(input: {
  sessions: AgentSessionRecord[];
  runs: AgentRunRecord[];
  event: ProviderRuntimeEvent;
}): {
  sessions: AgentSessionRecord[];
  runs: AgentRunRecord[];
} {
  const sessionMap = new Map(input.sessions.map((session) => [session.sessionKey, session] as const));
  const runMap = new Map(input.runs.map((run) => [run.runId, run] as const));
  const event = input.event;
  const sessionKey = event.sessionKey;
  const runId = event.runId;
  const timestamp = event.timestamp;

  if (sessionKey) {
    const previousSession = sessionMap.get(sessionKey);
    const derivedSessionState: AgentSessionState =
      event.runState === "error" || event.runState === "aborted"
        ? "error"
        : event.runState === "completed"
          ? "idle"
          : event.runState === "streaming" || event.streamKind === "assistant"
            ? "streaming"
            : event.runState === "accepted" || event.runState === "running" || event.streamKind === "tool"
              ? "running"
              : previousSession?.sessionState ?? "unknown";
    sessionMap.set(sessionKey, {
      sessionKey,
      agentId: event.agentId ?? previousSession?.agentId ?? resolveSessionActorId(sessionKey),
      providerId: event.providerId,
      sessionState: derivedSessionState,
      lastSeenAt: Math.max(previousSession?.lastSeenAt ?? 0, timestamp) || null,
      lastStatusSyncAt: previousSession?.lastStatusSyncAt ?? null,
      lastMessageAt:
        event.streamKind === "assistant"
          ? Math.max(previousSession?.lastMessageAt ?? 0, timestamp) || null
          : previousSession?.lastMessageAt ?? null,
      abortedLastRun: previousSession?.abortedLastRun ?? event.runState === "aborted",
      lastError:
        event.runState === "error" || event.runState === "aborted"
          ? event.errorMessage ?? previousSession?.lastError ?? null
          : previousSession?.lastError ?? null,
      lastTerminalRunState:
        event.runState === "completed" || event.runState === "aborted" || event.runState === "error"
          ? event.runState
          : previousSession?.lastTerminalRunState ?? null,
      lastTerminalSummary:
        event.runState === "completed" || event.runState === "aborted" || event.runState === "error"
          ? buildTerminalRunSummary(event.runState, sessionKey, event.errorMessage)
          : previousSession?.lastTerminalSummary ?? null,
      source: "lifecycle",
    });
  }

  if (!runId || !sessionKey) {
    return {
      sessions: [...sessionMap.values()],
      runs: [...runMap.values()],
    };
  }

  const previousRun = runMap.get(runId);
  const nextState =
    event.runState
    ?? previousRun?.state
    ?? (event.streamKind === "assistant" ? "streaming" : "running");
  const nextRun: AgentRunRecord = {
    runId,
    agentId: event.agentId ?? previousRun?.agentId ?? resolveSessionActorId(sessionKey),
    sessionKey,
    providerId: event.providerId,
    state: nextState,
    startedAt: previousRun?.startedAt ?? timestamp,
    lastEventAt: timestamp,
    endedAt: isAgentRunTerminalState(nextState) ? timestamp : null,
    streamKindsSeen: dedupeStreamKinds([
      ...(previousRun?.streamKindsSeen ?? []),
      event.streamKind,
    ]),
    error:
      nextState === "error" || nextState === "aborted"
        ? event.errorMessage ?? previousRun?.error ?? null
        : previousRun?.error ?? null,
  };

  if (isAgentRunTerminalState(nextRun.state)) {
    runMap.delete(runId);
  } else {
    runMap.set(runId, nextRun);
  }

  return {
    sessions: [...sessionMap.values()].sort(
      (left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0),
    ),
    runs: [...runMap.values()].sort((left, right) => right.lastEventAt - left.lastEventAt),
  };
}

export function buildAgentRuntimeProjection(input: RuntimeProjectionInput): AgentRuntimeRecord[] {
  const agentIds = new Set([
    ...(input.agentIds ?? []),
    ...input.sessions.map((session) => session.agentId).filter(Boolean) as string[],
    ...input.runs.map((run) => run.agentId).filter(Boolean) as string[],
  ]);

  return [...agentIds].map((agentId) => {
    const agentSessions = input.sessions.filter((session) => session.agentId === agentId);
    const activeRuns = input.runs.filter(
      (run) => run.agentId === agentId && isAgentRunActive(run.state),
    );
    const busySession = agentSessions.find(
      (session) => session.sessionState === "running" || session.sessionState === "streaming",
    );
    const degradedSession = agentSessions.find(
      (session) => session.sessionState === "error" || session.abortedLastRun,
    );
    const explicitOfflineSessions = agentSessions.filter((session) => session.sessionState === "offline");
    const latestTerminalSession =
      [...agentSessions]
        .filter((session) => Boolean(session.lastTerminalSummary))
        .sort(
          (left, right) =>
            (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0),
        )[0] ?? null;

    let availability: AgentRuntimeAvailability = "no_signal";
    if (activeRuns.length > 0 || busySession) {
      availability = "busy";
    } else if (degradedSession) {
      availability = "degraded";
    } else if (agentSessions.length > 0 && explicitOfflineSessions.length === agentSessions.length) {
      availability = "offline";
    } else if (agentSessions.length > 0) {
      availability = agentSessions.every(
        (session) => session.sessionState === "unknown" || session.sessionState === "offline",
      )
        ? "no_signal"
        : "idle";
    }

    const evidence: AgentRuntimeEvidence[] = [];
    activeRuns.forEach((run) => {
      evidence.push({
        kind: "run",
        summary: `${run.sessionKey} 正在执行 (${run.state})`,
        timestamp: run.lastEventAt,
      });
    });
    if (degradedSession?.lastError) {
      evidence.push({
        kind: "error",
        summary: degradedSession.lastError,
        timestamp: degradedSession.lastSeenAt ?? Date.now(),
      });
    } else if (latestTerminalSession?.lastTerminalSummary) {
      evidence.push({
        kind: "status",
        summary: latestTerminalSession.lastTerminalSummary,
        timestamp: latestTerminalSession.lastSeenAt ?? Date.now(),
      });
    } else if (busySession) {
      evidence.push({
        kind: "session",
        summary: `${busySession.sessionKey} 当前为 ${busySession.sessionState}`,
        timestamp: busySession.lastSeenAt ?? Date.now(),
      });
    } else if (agentSessions[0]) {
      evidence.push({
        kind: "status",
        summary: `${agentSessions[0].sessionKey} 当前为 ${agentSessions[0].sessionState}`,
        timestamp: agentSessions[0].lastSeenAt ?? Date.now(),
      });
    }

    const activeSessionKeys = [
      ...new Set([
        ...activeRuns.map((run) => run.sessionKey),
        ...agentSessions
          .filter((session) => session.sessionState === "running" || session.sessionState === "streaming")
          .map((session) => session.sessionKey),
      ]),
    ];

    return {
      agentId,
      providerId: input.providerId,
      availability,
      activeSessionKeys,
      activeRunIds: activeRuns.map((run) => run.runId),
      lastSeenAt: Math.max(...agentSessions.map((session) => session.lastSeenAt ?? 0), 0) || null,
      lastBusyAt: Math.max(
        ...activeRuns.map((run) => run.lastEventAt),
        ...agentSessions
          .filter((session) => session.sessionState === "running" || session.sessionState === "streaming")
          .map((session) => session.lastSeenAt ?? 0),
        0,
      ) || null,
      lastIdleAt: Math.max(
        ...agentSessions
          .filter((session) => session.sessionState === "idle")
          .map((session) => session.lastSeenAt ?? 0),
        0,
      ) || null,
      latestTerminalAt: latestTerminalSession?.lastSeenAt ?? null,
      latestTerminalSummary: latestTerminalSession?.lastTerminalSummary ?? null,
      currentWorkload:
        activeSessionKeys.length <= 0
          ? "free"
          : activeSessionKeys.length === 1
            ? "busy"
            : "saturated",
      runtimeEvidence: evidence.sort((left, right) => right.timestamp - left.timestamp),
    };
  });
}

const INITIAL_ACK_WINDOW_MS = 5 * 60_000;
const WAITING_WINDOW_MS = 15 * 60_000;

function isCurrentWorkItemForAgent(workItem: WorkItemRecord, agentId: string): boolean {
  return (
    workItem.ownerActorId === agentId ||
    workItem.batonActorId === agentId ||
    workItem.steps.some((step) => step.assigneeActorId === agentId && step.status === "active")
  );
}

function scoreCurrentWorkItemForAgent(workItem: WorkItemRecord, agentId: string): number {
  let score = 0;
  if (workItem.ownerActorId === agentId) {
    score += 40;
  }
  if (workItem.batonActorId === agentId) {
    score += 20;
  }
  if (workItem.steps.some((step) => step.assigneeActorId === agentId && step.status === "active")) {
    score += 30;
  }
  if (workItem.steps.some((step) => step.assigneeActorId === agentId && step.status === "pending")) {
    score += 10;
  }
  if (workItem.status === "blocked") {
    score += 16;
  }
  if (workItem.status === "active") {
    score += 12;
  }
  return score + Math.floor(workItem.updatedAt / 1000);
}

function isOpenDispatchStatus(status: DispatchRecord["status"]): boolean {
  return status === "pending" || status === "sent" || status === "acknowledged";
}

function isOpenSupportStatus(status: SupportRequestRecord["status"]): boolean {
  return status === "open" || status === "acknowledged" || status === "in_progress";
}

function isOpenRequestStatus(status: RequestRecord["status"]): boolean {
  return status === "pending" || status === "acknowledged";
}

function isOpenHandoffStatus(status: HandoffRecord["status"]): boolean {
  return status === "pending" || status === "acknowledged";
}

type WorkScope = {
  workItemId: string | null;
  topicKey: string | null;
  roomId: string | null;
  updatedAt: number;
};

function buildWorkScope(workItem: WorkItemRecord | null): WorkScope | null {
  if (!workItem) {
    return null;
  }
  return {
    workItemId: workItem.id,
    topicKey: workItem.topicKey ?? null,
    roomId: workItem.roomId ?? null,
    updatedAt: workItem.updatedAt,
  };
}

function matchesRequestScope(request: RequestRecord, scope: WorkScope | null): boolean {
  if (!scope) {
    return true;
  }
  if (request.status === "answered") {
    return (
      request.taskId === scope.workItemId ||
      request.topicKey === scope.topicKey ||
      request.updatedAt >= scope.updatedAt
    );
  }
  return (
    request.updatedAt >= scope.updatedAt
  );
}

function matchesDispatchScope(dispatch: DispatchRecord, scope: WorkScope | null): boolean {
  if (!scope) {
    return true;
  }
  return dispatch.updatedAt >= scope.updatedAt;
}

function matchesHandoffScope(handoff: HandoffRecord, scope: WorkScope | null): boolean {
  if (!scope) {
    return true;
  }
  if (handoff.status === "completed") {
    return (
      handoff.taskId === scope.workItemId ||
      handoff.sessionKey === scope.roomId ||
      handoff.updatedAt >= scope.updatedAt
    );
  }
  return (
    handoff.updatedAt >= scope.updatedAt
  );
}

function matchesEscalationScope(escalation: EscalationRecord, scope: WorkScope | null): boolean {
  if (!scope) {
    return false;
  }
  return (
    escalation.workItemId === scope.workItemId ||
    escalation.sourceId === scope.workItemId ||
    escalation.roomId === scope.roomId
  );
}

function ageMs(updatedAt: number | null | undefined, now: number): number {
  return Math.max(0, now - (updatedAt ?? now));
}

function latestTimestamp(values: Array<number | null | undefined>): number | null {
  const max = Math.max(...values.map((value) => value ?? 0), 0);
  return max > 0 ? max : null;
}

export function agentStatusNeedsIntervention(status: CanonicalAgentStatusRecord): boolean {
  return (
    status.coordinationState === "explicit_blocked" ||
    status.interventionState === "overdue" ||
    status.interventionState === "escalated" ||
    status.interventionState === "takeover_required"
  );
}

export function buildCanonicalAgentStatusProjection(input: {
  company: Company;
  activeWorkItems: WorkItemRecord[];
  activeDispatches: DispatchRecord[];
  activeSupportRequests: SupportRequestRecord[];
  activeEscalations: EscalationRecord[];
  activeAgentRuntime: AgentRuntimeRecord[];
  activeAgentSessions?: AgentSessionRecord[];
  now?: number;
}): CanonicalAgentStatusRecord[] {
  const now = input.now ?? Date.now();
  const runtimeByAgentId = new Map(input.activeAgentRuntime.map((runtime) => [runtime.agentId, runtime] as const));
  const companyPrimaryWorkItem = [...input.activeWorkItems].sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
  const companyPrimaryScope = buildWorkScope(companyPrimaryWorkItem);
  const sessionsByAgentId = new Map<string, AgentSessionRecord[]>();
  for (const session of input.activeAgentSessions ?? []) {
    if (!session.agentId) {
      continue;
    }
    const existing = sessionsByAgentId.get(session.agentId) ?? [];
    existing.push(session);
    sessionsByAgentId.set(session.agentId, existing);
  }

  return input.company.employees.map((employee) => {
    const runtime = runtimeByAgentId.get(employee.agentId) ?? null;
    const runtimeState = runtime?.availability ?? "no_signal";
    const agentSessions = [...(sessionsByAgentId.get(employee.agentId) ?? [])].sort(
      (left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0),
    );
    const relevantWorkItems = [...input.activeWorkItems]
      .filter((workItem) => isCurrentWorkItemForAgent(workItem, employee.agentId))
      .sort(
        (left, right) =>
          scoreCurrentWorkItemForAgent(right, employee.agentId) - scoreCurrentWorkItemForAgent(left, employee.agentId),
      );
    const primaryWorkItem = relevantWorkItems[0] ?? null;
    const effectiveScope = buildWorkScope(primaryWorkItem) ?? companyPrimaryScope;
    const agentDispatches = input.activeDispatches.filter(
      (dispatch) =>
        dispatch.targetActorIds.includes(employee.agentId) &&
        matchesDispatchScope(dispatch, effectiveScope),
    );
    const openDispatchCount = agentDispatches.filter((dispatch) => isOpenDispatchStatus(dispatch.status)).length;
    const blockedDispatches = agentDispatches.filter((dispatch) => dispatch.status === "blocked");
    const blockedDispatchCount = blockedDispatches.length;
    const ownedSupportRequests = input.activeSupportRequests.filter(
      (request) => request.ownerActorId === employee.agentId,
    );
    const openSupportRequests = ownedSupportRequests.filter((request) => isOpenSupportStatus(request.status));
    const openSupportRequestCount = openSupportRequests.length;
    const blockedSupportRequests = ownedSupportRequests.filter((request) => request.status === "blocked");
    const blockedSupportRequestCount = blockedSupportRequests.length;
    const relatedRequests = (input.company.requests ?? []).filter(
      (request) =>
        request.toAgentIds.includes(employee.agentId) &&
        matchesRequestScope(request, effectiveScope),
    );
    const openRequests = relatedRequests.filter((request) => isOpenRequestStatus(request.status));
    const blockedRequests = relatedRequests.filter((request) => request.status === "blocked");
    const relatedHandoffs = (input.company.handoffs ?? []).filter(
      (handoff) =>
        matchesHandoffScope(handoff, effectiveScope) &&
        (
          handoff.toAgentIds.includes(employee.agentId) ||
          (handoff.fromAgentId === employee.agentId && handoff.status === "blocked")
        ),
    );
    const openHandoffs = relatedHandoffs.filter((handoff) => isOpenHandoffStatus(handoff.status));
    const blockedHandoffs = relatedHandoffs.filter((handoff) => handoff.status === "blocked");
    const openEscalations = input.activeEscalations.filter(
      (escalation) =>
        escalation.targetActorId === employee.agentId &&
        matchesEscalationScope(escalation, effectiveScope) &&
        (escalation.status === "open" || escalation.status === "acknowledged"),
    );
    const openEscalationCount = openEscalations.length;
    const blockedWorkItemCount = relevantWorkItems.filter((workItem) => workItem.status === "blocked").length;
    const latestSignalAt = latestTimestamp([
      runtime?.lastSeenAt,
      runtime?.lastBusyAt,
      runtime?.lastIdleAt,
      runtime?.latestTerminalAt,
      primaryWorkItem?.updatedAt,
      agentDispatches[0]?.updatedAt,
      ownedSupportRequests[0]?.updatedAt,
      relatedRequests[0]?.updatedAt,
      relatedHandoffs[0]?.updatedAt,
      agentSessions[0]?.lastSeenAt,
    ]);

    const hasTakeoverRequired =
      (input.company.tasks ?? []).some(
        (task) =>
          (task.ownerAgentId === employee.agentId ||
            task.agentId === employee.agentId ||
            task.assigneeAgentIds?.includes(employee.agentId)) &&
          task.state === "manual_takeover_required",
      ) ||
      relatedRequests.some((request) => request.resolution === "manual_takeover");

    const hasExplicitBlocked =
      runtimeState === "degraded" ||
      blockedDispatchCount > 0 ||
      blockedSupportRequestCount > 0 ||
      blockedRequests.length > 0 ||
      blockedHandoffs.length > 0 ||
      blockedWorkItemCount > 0;

    const hasWaitingInput =
      primaryWorkItem?.ownerActorId === employee.agentId &&
      (primaryWorkItem.status === "waiting_owner" || primaryWorkItem.status === "waiting_review");

    const pendingAckRecords = [
      ...agentDispatches.filter(
        (dispatch) => (dispatch.status === "pending" || dispatch.status === "sent") && ageMs(dispatch.updatedAt, now) < INITIAL_ACK_WINDOW_MS,
      ),
      ...openRequests.filter(
        (request) => request.status === "pending" && ageMs(request.updatedAt, now) < INITIAL_ACK_WINDOW_MS,
      ),
      ...openHandoffs.filter(
        (handoff) => handoff.status === "pending" && ageMs(handoff.updatedAt, now) < INITIAL_ACK_WINDOW_MS,
      ),
    ];

    const waitingPeerRecords = [
      ...agentDispatches.filter(
        (dispatch) =>
          isOpenDispatchStatus(dispatch.status) &&
          !(dispatch.status === "pending" || dispatch.status === "sent"
            ? ageMs(dispatch.updatedAt, now) < INITIAL_ACK_WINDOW_MS
            : false),
      ),
      ...openRequests.filter(
        (request) =>
          request.status === "acknowledged" ||
          (request.status === "pending" && ageMs(request.updatedAt, now) >= INITIAL_ACK_WINDOW_MS),
      ),
      ...openHandoffs.filter(
        (handoff) =>
          handoff.status === "acknowledged" ||
          (handoff.status === "pending" && ageMs(handoff.updatedAt, now) >= INITIAL_ACK_WINDOW_MS),
      ),
      ...openSupportRequests.filter((request) => request.status !== "fulfilled" && request.status !== "cancelled"),
    ];

    const completedSignals = [
      primaryWorkItem?.status === "completed" ? primaryWorkItem.updatedAt : null,
      ...relatedRequests
        .filter((request) => request.status === "answered")
        .map((request) => request.updatedAt),
      ...relatedHandoffs
        .filter((handoff) => handoff.status === "completed")
        .map((handoff) => handoff.updatedAt),
    ];

    let coordinationState: CoordinationState = "none";
    if (hasExplicitBlocked || hasTakeoverRequired) {
      coordinationState = "explicit_blocked";
    } else if (runtimeState === "busy") {
      coordinationState = "executing";
    } else if (hasWaitingInput) {
      coordinationState = "waiting_input";
    } else if (waitingPeerRecords.length > 0) {
      coordinationState = "waiting_peer";
    } else if (pendingAckRecords.length > 0) {
      coordinationState = "pending_ack";
    } else if (completedSignals.some((value) => Boolean(value))) {
      coordinationState = "completed";
    }

    const waitingPeerAge = Math.max(
      ...waitingPeerRecords.map((record) => ageMs(record.updatedAt, now)),
      0,
    );
    const waitingInputAge = hasWaitingInput ? ageMs(primaryWorkItem?.updatedAt, now) : 0;
    const hasOverdueWaiting =
      (coordinationState === "waiting_peer" && waitingPeerAge >= WAITING_WINDOW_MS) ||
      (coordinationState === "waiting_input" && waitingInputAge >= WAITING_WINDOW_MS) ||
      openSupportRequests.some(
        (request) => typeof request.slaDueAt === "number" && request.slaDueAt > 0 && request.slaDueAt < now,
      );

    let interventionState: InterventionState = "healthy";
    if (hasTakeoverRequired) {
      interventionState = "takeover_required";
    } else if (openEscalationCount > 0) {
      interventionState = "escalated";
    } else if (hasOverdueWaiting) {
      interventionState = "overdue";
    }

    const currentAssignment =
      primaryWorkItem?.title ??
      agentDispatches[0]?.title ??
      openSupportRequests[0]?.summary ??
      relatedRequests[0]?.title ??
      relatedHandoffs[0]?.title ??
      "当前没有显式挂载的任务";

    const currentObjective =
      primaryWorkItem?.displayNextAction ??
      primaryWorkItem?.nextAction ??
      primaryWorkItem?.displayStage ??
      openSupportRequests[0]?.detail ??
      relatedRequests[0]?.responseSummary ??
      relatedRequests[0]?.summary ??
      relatedHandoffs[0]?.summary ??
      "当前没有新的协作目标。";

    let reason = "当前没有显式挂载任务，也没有新的运行信号。";
    if (interventionState === "takeover_required") {
      reason = "当前链路已要求人工接管或手动执行。";
    } else if (coordinationState === "explicit_blocked") {
      reason =
        runtime?.latestTerminalSummary ??
        blockedSupportRequests[0]?.detail ??
        blockedRequests[0]?.responseDetails ??
        blockedHandoffs[0]?.missingItems?.[0] ??
        blockedDispatches[0]?.summary ??
        primaryWorkItem?.nextAction ??
        "当前链路存在明确阻塞，需要优先恢复。";
    } else if (coordinationState === "executing") {
      reason =
        runtime?.activeRunIds.length
          ? `${runtime.activeRunIds.length} 条活跃 run 仍在执行，等待交付。`
          : "runtime 仍在持续执行，等待当前链路回传结果。";
    } else if (coordinationState === "waiting_input") {
      reason =
        primaryWorkItem?.status === "waiting_review"
          ? "当前主线在等待 review/验收确认。"
          : "当前主线在等待 owner 或上游输入。";
    } else if (coordinationState === "waiting_peer") {
      reason =
        interventionState === "escalated"
          ? "当前链路已长时间等待同事，且已升级处理。"
          : interventionState === "overdue"
            ? "当前没有活跃 run，且等待同事已超过 SLA。"
            : "已转交同事，正在等待继续推进。";
    } else if (coordinationState === "pending_ack") {
      reason = "派单已发出，仍在等待首次确认。";
    } else if (coordinationState === "completed") {
      reason = "最近一次协作链已完成并闭环。";
    } else if (runtimeState === "offline") {
      reason = "Provider 明确报告当前节点不可达。";
    } else if (runtimeState === "no_signal") {
      reason = "当前没有观察到可信 runtime 信号。";
    } else if (runtimeState === "idle") {
      reason = "当前没有活跃 run，可继续派单或观察。";
    }

    return {
      agentId: employee.agentId,
      runtimeState,
      coordinationState,
      interventionState,
      reason,
      currentAssignment,
      currentObjective,
      latestSignalAt,
      activeSessionCount: runtime?.activeSessionKeys.length ?? 0,
      activeRunCount: runtime?.activeRunIds.length ?? 0,
      openDispatchCount,
      blockedDispatchCount,
      openSupportRequestCount,
      blockedSupportRequestCount,
      openRequestCount: openRequests.length,
      blockedRequestCount: blockedRequests.length,
      openHandoffCount: openHandoffs.length,
      blockedHandoffCount: blockedHandoffs.length,
      openEscalationCount,
      blockedWorkItemCount,
      primaryWorkItemId: primaryWorkItem?.id ?? null,
    } satisfies CanonicalAgentStatusRecord;
  }).sort((left, right) => {
    const interventionRank = {
      takeover_required: 0,
      escalated: 1,
      overdue: 2,
      healthy: 3,
    } as const;
    if (interventionRank[left.interventionState] !== interventionRank[right.interventionState]) {
      return interventionRank[left.interventionState] - interventionRank[right.interventionState];
    }
    const coordinationRank = {
      explicit_blocked: 0,
      waiting_input: 1,
      waiting_peer: 2,
      pending_ack: 3,
      executing: 4,
      none: 5,
      completed: 6,
    } as const;
    if (coordinationRank[left.coordinationState] !== coordinationRank[right.coordinationState]) {
      return coordinationRank[left.coordinationState] - coordinationRank[right.coordinationState];
    }
    return (right.latestSignalAt ?? 0) - (left.latestSignalAt ?? 0);
  });
}
