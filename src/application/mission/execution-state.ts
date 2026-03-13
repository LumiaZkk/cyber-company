import type { TaskStep } from "../../domain";
import type { GatewaySessionRow } from "../gateway";
import type { AgentRuntimeRecord, CanonicalAgentStatusRecord } from "../agent-runtime";
import { isSessionActive } from "../../lib/sessions";

export type ExecutionState =
  | "idle"
  | "running"
  | "waiting_input"
  | "waiting_peer"
  | "blocked_timeout"
  | "blocked_tool_failure"
  | "manual_takeover_required"
  | "completed"
  | "unknown";

export type ExecutionEvidence = {
  kind:
    | "manual_takeover"
    | "timeout"
    | "tool_failure"
    | "waiting_input"
    | "waiting_peer"
    | "completion"
    | "session_activity";
  text: string;
};

export type ResolvedExecutionState = {
  state: ExecutionState;
  label: string;
  summary: string;
  actionable: boolean;
  tone: "slate" | "blue" | "amber" | "orange" | "red" | "emerald" | "violet";
  evidence: ExecutionEvidence[];
};

type ResolveExecutionStateInput = {
  session?: GatewaySessionRow | null;
  agentRuntime?: AgentRuntimeRecord | null;
  canonicalStatus?: CanonicalAgentStatusRecord | null;
  evidenceTexts?: Array<string | null | undefined>;
  taskSteps?: TaskStep[];
  now?: number;
  isGenerating?: boolean;
  fallbackState?: ExecutionState;
};

const STATE_META: Record<
  ExecutionState,
  Pick<ResolvedExecutionState, "label" | "summary" | "actionable" | "tone">
> = {
  idle: {
    label: "空闲待命",
    summary: "最近没有检测到新的执行阻塞。",
    actionable: false,
    tone: "slate",
  },
  running: {
    label: "执行中",
    summary: "节点正在处理当前链路。",
    actionable: false,
    tone: "blue",
  },
  waiting_input: {
    label: "等待输入",
    summary: "当前链路需要用户补充材料或确认。",
    actionable: true,
    tone: "amber",
  },
  waiting_peer: {
    label: "等待同事",
    summary: "当前链路已转交，正在等待其他节点响应。",
    actionable: false,
    tone: "violet",
  },
  blocked_timeout: {
    label: "超时阻塞",
    summary: "最近检测到超时、失联或连续未响应。",
    actionable: true,
    tone: "red",
  },
  blocked_tool_failure: {
    label: "工具阻塞",
    summary: "最近检测到浏览器、命令或工具执行失败。",
    actionable: true,
    tone: "orange",
  },
  manual_takeover_required: {
    label: "需要接管",
    summary: "当前链路已要求人工介入或手动执行。",
    actionable: true,
    tone: "red",
  },
  completed: {
    label: "已完成",
    summary: "当前链路最近一次交付已经完成。",
    actionable: false,
    tone: "emerald",
  },
  unknown: {
    label: "状态未知",
    summary: "当前还没有足够的信号判断执行状态。",
    actionable: false,
    tone: "slate",
  },
};

const PATTERNS = {
  manualTakeover: [
    /人工接管/i,
    /手动接管/i,
    /manual takeover/i,
    /需要人工/i,
    /请(?:你|用户).{0,8}(?:执行|处理|发布|接管)/i,
    /请手动(?:执行|处理|发布)/i,
    /用户手动/i,
  ],
  timeout: [
    /\btimeout\b/i,
    /超时/i,
    /失联/i,
    /无响应/i,
    /未回复/i,
    /未收到回复/i,
    /no response/i,
  ],
  toolFailure: [
    /tab not found/i,
    /\btool (?:error|failed|failure)\b/i,
    /\bcommand failed\b/i,
    /\bnot found\b/i,
    /浏览器.*失败/i,
    /工具.*失败/i,
    /调用.*工具.*失败/i,
    /执行失败/i,
  ],
  waitingInput: [
    /等待用户/i,
    /需要你/i,
    /请(?:提供|确认|选择|上传|补充|输入)/i,
    /请先/i,
    /需用户/i,
  ],
  waitingPeer: [
    /等待.*(?:回复|确认|处理|完成|审批)/i,
    /待.*(?:处理|回复|确认)/i,
    /待命/i,
    /已转交/i,
    /已下达指令/i,
    /等待.*(?:CEO|HR|CTO|COO|主编|写手|审校)/i,
  ],
  completion: [
    /已完成/i,
    /完成交付/i,
    /任务完成/i,
    /全部完成/i,
    /交付完成/i,
    /发布成功/i,
    /处理完毕/i,
    /\bdone\b/i,
    /\bcompleted\b/i,
  ],
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fallbackEvidenceText(kind: ExecutionEvidence["kind"]): string {
  switch (kind) {
    case "manual_takeover":
      return "当前链路已要求人工介入或手动执行。";
    case "timeout":
      return "最近检测到超时、失联或连续未响应。";
    case "tool_failure":
      return "最近检测到浏览器、命令或工具执行失败。";
    case "waiting_input":
      return "当前链路需要用户补充材料或确认。";
    case "waiting_peer":
      return "当前链路已转交，正在等待其他节点响应。";
    case "completion":
      return "当前链路最近一次交付已经完成。";
    case "session_activity":
      return "最近两分钟内仍有会话活动。";
  }
}

function looksLikeStructuredPayload(text: string): boolean {
  const normalized = text.trim();
  return (
    normalized.startsWith("{") ||
    normalized.startsWith("[") ||
    normalized.includes('"sessionKey"') ||
    normalized.includes('"messages"') ||
    normalized.includes('"role"') ||
    normalized.includes('"content"') ||
    normalized.includes('"type"')
  );
}

function sanitizeEvidenceText(evidence: ExecutionEvidence): string {
  const normalized = evidence.text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallbackEvidenceText(evidence.kind);
  }

  if (looksLikeStructuredPayload(normalized)) {
    return fallbackEvidenceText(evidence.kind);
  }

  const firstMeaningfulLine =
    normalized
      .split(/(?<=[。.!?])\s+|\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? normalized;

  if (firstMeaningfulLine.length > 140) {
    return `${firstMeaningfulLine.slice(0, 137)}...`;
  }

  return firstMeaningfulLine;
}

function collectEvidenceTexts(params: ResolveExecutionStateInput): string[] {
  const sessionTexts = [
    params.session?.lastMessagePreview,
    params.session?.derivedTitle,
    params.session?.displayName,
    params.session?.label,
  ];

  return [...sessionTexts, ...(params.evidenceTexts ?? [])]
    .map((text) => normalizeText(text))
    .filter((text): text is string => Boolean(text));
}

function findPatternMatches(
  texts: string[],
  patterns: RegExp[],
  kind: ExecutionEvidence["kind"],
): ExecutionEvidence[] {
  return texts.filter((text) => patterns.some((pattern) => pattern.test(text))).map((text) => ({
    kind,
    text,
  }));
}

function resolveFallbackState(params: ResolveExecutionStateInput): ExecutionState {
  if (params.canonicalStatus) {
    if (params.canonicalStatus.interventionState === "takeover_required") {
      return "manual_takeover_required";
    }
    if (params.canonicalStatus.coordinationState === "explicit_blocked") {
      return params.canonicalStatus.reason.includes("工具") ? "blocked_tool_failure" : "blocked_timeout";
    }
    if (params.canonicalStatus.coordinationState === "waiting_input") {
      return "waiting_input";
    }
    if (
      params.canonicalStatus.coordinationState === "waiting_peer" ||
      params.canonicalStatus.coordinationState === "pending_ack"
    ) {
      return "waiting_peer";
    }
    if (params.canonicalStatus.coordinationState === "executing") {
      return "running";
    }
    if (params.canonicalStatus.coordinationState === "completed") {
      return "completed";
    }
    if (params.canonicalStatus.runtimeState === "busy") {
      return "running";
    }
    if (params.canonicalStatus.runtimeState === "idle") {
      return "idle";
    }
    if (params.canonicalStatus.runtimeState === "degraded") {
      return "blocked_timeout";
    }
    if (params.canonicalStatus.runtimeState === "no_signal" || params.canonicalStatus.runtimeState === "offline") {
      return "unknown";
    }
  }

  if (params.fallbackState) {
    return params.fallbackState;
  }

  if (params.isGenerating) {
    return "running";
  }

  if (params.agentRuntime?.availability === "busy") {
    return "running";
  }

  if (params.agentRuntime?.availability === "idle") {
    return "idle";
  }

  if (params.session && typeof params.now === "number" && isSessionActive(params.session, params.now)) {
    return "running";
  }

  if (params.taskSteps && params.taskSteps.length > 0) {
    const total = params.taskSteps.length;
    const done = params.taskSteps.filter((step) => step.status === "done").length;
    const wip = params.taskSteps.some((step) => step.status === "wip");
    if (done === total) {
      return "completed";
    }
    if (wip) {
      return "running";
    }
  }

  if (params.session) {
    return "idle";
  }

  return "unknown";
}

export function resolveExecutionState(
  params: ResolveExecutionStateInput,
): ResolvedExecutionState {
  const texts = collectEvidenceTexts(params);
  const evidence: ExecutionEvidence[] = [];

  if (params.session?.abortedLastRun) {
    evidence.push({
      kind: "timeout",
      text: "Gateway 标记最近一次执行为 aborted。",
    });
  }

  if (params.agentRuntime?.availability === "busy") {
    evidence.push({
      kind: "session_activity",
      text: "Agent runtime 显示该节点仍在执行中。",
    });
  } else if (params.agentRuntime?.availability === "degraded") {
    evidence.push({
      kind: "timeout",
      text: "Agent runtime 当前处于 degraded，需要继续观察或人工介入。",
    });
  }
  if (params.canonicalStatus?.reason) {
    evidence.push({
      kind:
        params.canonicalStatus.interventionState === "takeover_required"
          ? "manual_takeover"
          : params.canonicalStatus.coordinationState === "explicit_blocked"
            ? "timeout"
            : params.canonicalStatus.coordinationState === "waiting_input"
              ? "waiting_input"
              : params.canonicalStatus.coordinationState === "waiting_peer" ||
                  params.canonicalStatus.coordinationState === "pending_ack"
                ? "waiting_peer"
                : params.canonicalStatus.coordinationState === "completed"
                  ? "completion"
                  : "session_activity",
      text: params.canonicalStatus.reason,
    });
  }

  evidence.push(...findPatternMatches(texts, PATTERNS.manualTakeover, "manual_takeover"));
  evidence.push(...findPatternMatches(texts, PATTERNS.timeout, "timeout"));
  evidence.push(...findPatternMatches(texts, PATTERNS.toolFailure, "tool_failure"));
  evidence.push(...findPatternMatches(texts, PATTERNS.waitingInput, "waiting_input"));
  evidence.push(...findPatternMatches(texts, PATTERNS.waitingPeer, "waiting_peer"));
  evidence.push(...findPatternMatches(texts, PATTERNS.completion, "completion"));

  const taskSteps = params.taskSteps ?? [];
  const allStepsDone = taskSteps.length > 0 && taskSteps.every((step) => step.status === "done");
  const hasWipStep = taskSteps.some((step) => step.status === "wip");

  let state: ExecutionState;
  if (params.canonicalStatus) {
    state = resolveFallbackState(params);
  } else if (evidence.some((item) => item.kind === "manual_takeover")) {
    state = "manual_takeover_required";
  } else if (evidence.some((item) => item.kind === "tool_failure")) {
    state = "blocked_tool_failure";
  } else if (evidence.some((item) => item.kind === "timeout")) {
    state = "blocked_timeout";
  } else if (evidence.some((item) => item.kind === "waiting_input")) {
    state = "waiting_input";
  } else if (evidence.some((item) => item.kind === "waiting_peer")) {
    state = "waiting_peer";
  } else if (allStepsDone || evidence.some((item) => item.kind === "completion")) {
    state = "completed";
  } else if (
    params.agentRuntime?.availability === "busy" ||
    params.isGenerating ||
    hasWipStep ||
    (params.session && typeof params.now === "number" && isSessionActive(params.session, params.now))
  ) {
    state = "running";
    evidence.push({
      kind: "session_activity",
      text: "最近两分钟内仍有会话活动。",
    });
  } else {
    state = resolveFallbackState(params);
  }

  const meta = STATE_META[state];
  const sanitizedEvidence = evidence
    .map((item) => ({
      ...item,
      text: sanitizeEvidenceText(item),
    }))
    .filter((item, index, list) => {
      return item.text.length > 0 && list.findIndex((candidate) => candidate.text === item.text) === index;
    });
  const primaryEvidence = sanitizedEvidence[0]?.text;

  return {
    state,
    label: meta.label,
    actionable: meta.actionable,
    tone: meta.tone,
    summary: primaryEvidence ? primaryEvidence : meta.summary,
    evidence: sanitizedEvidence,
  };
}

export function isBlockedExecutionState(state: ExecutionState): boolean {
  return (
    state === "blocked_timeout" ||
    state === "blocked_tool_failure" ||
    state === "manual_takeover_required"
  );
}

export function isWaitingExecutionState(state: ExecutionState): boolean {
  return state === "waiting_input" || state === "waiting_peer";
}
