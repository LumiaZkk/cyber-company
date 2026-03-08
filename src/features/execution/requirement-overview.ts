import type { Company, HandoffRecord, RequestRecord } from "../company/types";
import { getActiveHandoffs } from "../handoffs/active-handoffs";
import { getActiveRequests } from "../requests/request-health";
import {
  inferMissionTopicKey,
  inferRequestTopicKey,
  requestTopicMatchesText,
} from "../requests/topic";
import { formatAgentLabel, formatAgentRole } from "./focus-summary";
import { isSyntheticWorkflowPromptText } from "./message-truth";

export type RequirementParticipantTone =
  | "slate"
  | "blue"
  | "amber"
  | "rose"
  | "emerald"
  | "violet";

export type RequirementParticipantProgress = {
  agentId: string;
  nickname: string;
  role: string;
  stage: string;
  statusLabel: string;
  detail: string;
  updatedAt: number;
  tone: RequirementParticipantTone;
  isBlocking: boolean;
  isCurrent: boolean;
};

export type RequirementExecutionOverview = {
  topicKey: string;
  title: string;
  startedAt: number;
  headline: string;
  summary: string;
  currentOwnerAgentId: string | null;
  currentOwnerLabel: string;
  currentStage: string;
  nextAction: string;
  participants: RequirementParticipantProgress[];
};

export type RequirementArtifactCheck = {
  path: string;
  exists: boolean;
};

export type RequirementMessageInput = {
  role?: unknown;
  text?: unknown;
  content?: unknown;
  timestamp?: unknown;
};

export type RequirementMessageSnapshot = {
  role: string;
  text: string;
  timestamp: number;
};

export type RequirementSessionSnapshot = {
  agentId: string;
  sessionKey: string;
  updatedAt: number;
  messages: RequirementMessageSnapshot[];
  artifactChecks?: RequirementArtifactCheck[];
};

export const REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT = 40;

type BuildRequirementExecutionOverviewInput = {
  company: Company | null | undefined;
  topicHints?: Array<string | null | undefined>;
  preferredTopicKey?: string | null;
  preferredTopicText?: string | null;
  preferredTopicTimestamp?: number | null;
  sessionSnapshots?: RequirementSessionSnapshot[];
  now?: number;
};

type RequirementInstructionCandidate = {
  timestamp: number;
  text: string;
  topicKey: string | null;
  isRestart: boolean;
};

type RequirementAnchor = RequirementInstructionCandidate & {
  windowStart: number;
};

type TrackerStepStatus = "done" | "wip" | "pending";

type TrackedDelegationStep = {
  title: string;
  status: TrackerStepStatus;
  assigneeAgentId: string | null;
  assigneeLabel: string;
};

type TrackedDelegationSeed = {
  title: string;
  topicKey: string;
  startedAt: number;
  userText: string;
  assistantText: string;
  steps: TrackedDelegationStep[];
};

function inferHandoffTopic(handoff: HandoffRecord): string | null {
  return (
    inferRequestTopicKey([
      handoff.title,
      handoff.summary,
      ...(handoff.checklist ?? []),
      ...(handoff.missingItems ?? []),
      ...(handoff.artifactPaths ?? []),
    ]) ?? null
  );
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function extractTopicHints(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
    .map((value) => inferRequestTopicKey([value]) ?? value)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function resolveTopicKey(
  requests: RequestRecord[],
  handoffs: HandoffRecord[],
  hints: string[],
): string | null {
  const explicitTopic = hints.find((hint) => hint.startsWith("chapter:") || hint.startsWith("artifact:"));
  if (explicitTopic) {
    return explicitTopic;
  }

  const latestRequest = [...requests]
    .filter((request) => Boolean(request.topicKey))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (latestRequest?.topicKey) {
    return latestRequest.topicKey;
  }

  const latestHandoff = [...handoffs]
    .map((handoff) => ({ handoff, topicKey: inferHandoffTopic(handoff) }))
    .filter((item): item is { handoff: HandoffRecord; topicKey: string } => Boolean(item.topicKey))
    .sort((left, right) => right.handoff.updatedAt - left.handoff.updatedAt)[0];
  return latestHandoff?.topicKey ?? null;
}

function normalizeLookupValue(value: string): string {
  return value.replace(/[@`*_：:（）()\-\s]/g, "").trim().toLowerCase();
}

function resolveTrackerAssignee(
  company: Company,
  rawLabel: string,
  fallbackText?: string,
): { agentId: string | null; label: string } {
  const cleanedLabel = rawLabel.replace(/^@/, "").trim();
  const normalized = normalizeLookupValue(cleanedLabel);
  const normalizedFallback = normalizeLookupValue(fallbackText ?? "");
  const candidates = company.employees.map((employee) => ({
    employee,
    values: [
      employee.agentId,
      employee.nickname,
      employee.role,
      employee.metaRole ?? "",
      `${employee.nickname}${employee.role}`,
    ].map(normalizeLookupValue),
  }));

  const exact = candidates.find((candidate) =>
    candidate.values.some((value) => value.length > 0 && value === normalized),
  );
  if (exact) {
    return {
      agentId: exact.employee.agentId,
      label: formatAgentLabel(company, exact.employee.agentId),
    };
  }

  const includes = candidates.find((candidate) =>
    candidate.values.some(
      (value) =>
        value.length > 0 &&
        (value.includes(normalized) ||
          normalized.includes(value) ||
          (normalizedFallback.length > 0 &&
            (normalizedFallback.includes(value) || value.includes(normalizedFallback)))),
    ),
  );
  if (includes) {
    return {
      agentId: includes.employee.agentId,
      label: formatAgentLabel(company, includes.employee.agentId),
    };
  }

  return { agentId: null, label: cleanedLabel || "未分配" };
}

function extractTrackerSteps(company: Company, text: string): TrackedDelegationStep[] {
  const sectionMatch = text.match(/##\s*📋\s*任务追踪[\s\S]*?(?=\n\s*(?:【|##)\s*|$)/i);
  if (!sectionMatch) {
    return [];
  }

  const steps: TrackedDelegationStep[] = [];
  // CEO often emits tracker lines as `[/] 1. ...` without a leading bullet. Treat
  // both `- [/] ...` and `[/] ...` as the same structured tracker step format.
  const lineRegex = /^\s*(?:-\s*)?\[([ x/])\]\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(sectionMatch[0])) !== null) {
    const marker = match[1];
    const rawText = match[2]?.trim() ?? "";
    if (!rawText) {
      continue;
    }

    const status: TrackerStepStatus = marker === "x" ? "done" : marker === "/" ? "wip" : "pending";
    const assigneeMatch = rawText.match(/[→>-]\s*@?([^\n]+)$/);
    const fallbackAssignee =
      !assigneeMatch && /\bCEO\b/i.test(rawText)
        ? "CEO"
        : !assigneeMatch && /\bCTO\b/i.test(rawText)
          ? "CTO"
          : !assigneeMatch && /\bCOO\b/i.test(rawText)
            ? "COO"
            : "";
    const rawAssignee = assigneeMatch?.[1]?.trim() ?? fallbackAssignee;
    const resolved = rawAssignee
      ? resolveTrackerAssignee(company, rawAssignee, rawText)
      : { agentId: null, label: "未分配" };

    steps.push({
      title: rawText.replace(/\s*[→>-]\s*@?[^\n]+$/, "").trim(),
      status,
      assigneeAgentId: resolved.agentId,
      assigneeLabel: resolved.label,
    });
  }

  return steps;
}

function isRestartInstruction(text: string): boolean {
  return /重写|从头开始|从头处理|重开|重新完成|重启/i.test(text);
}

function isStrategicInstruction(text: string): boolean {
  return /方案|系统|工具|实现|规划|优先级|业务流程|技术架构|阅读/i.test(text);
}

function collectInstructionCandidates(
  snapshots: RequirementSessionSnapshot[],
  hints: string[],
): RequirementInstructionCandidate[] {
  return snapshots.flatMap((snapshot) =>
    snapshot.messages
      .filter((message) => message.role === "user")
      .map((message) => ({
        timestamp: message.timestamp,
        text: message.text,
        topicKey:
          inferRequestTopicKey([message.text]) ??
          (isStrategicInstruction(message.text) ? inferMissionTopicKey([message.text]) ?? null : null),
        isRestart: isRestartInstruction(message.text),
      }))
      .filter((candidate) => {
        if (isSyntheticWorkflowPromptText(candidate.text)) {
          return false;
        }
        if (candidate.topicKey) {
          return true;
        }
        return hints.some((hint) => hint.length > 0 && candidate.text.includes(hint));
      }),
  );
}

function resolveTopicKeyFromSnapshots(
  snapshots: RequirementSessionSnapshot[],
  hints: string[],
): string | null {
  const latest = collectInstructionCandidates(snapshots, hints)
    .filter((item): item is RequirementInstructionCandidate & { topicKey: string } => Boolean(item.topicKey))
    .sort((left, right) => {
      if (left.isRestart !== right.isRestart) {
        return Number(right.isRestart) - Number(left.isRestart);
      }
      return right.timestamp - left.timestamp;
    })[0];

  return latest?.topicKey ?? null;
}

function resolveRequirementAnchor(
  snapshots: RequirementSessionSnapshot[],
  topicKey: string,
  hints: string[],
): RequirementAnchor | null {
  const candidates = collectInstructionCandidates(snapshots, hints)
    .filter((candidate) => {
      if (requestTopicMatchesText(topicKey, candidate.text)) {
        return true;
      }
      return candidate.topicKey === topicKey;
    })
    .sort((left, right) => {
      if (left.isRestart !== right.isRestart) {
        return Number(right.isRestart) - Number(left.isRestart);
      }
      return right.timestamp - left.timestamp;
    });

  const latest = candidates[0];
  if (!latest) {
    return null;
  }

  if (!latest.isRestart) {
    return {
      ...latest,
      windowStart: latest.timestamp,
    };
  }

  // A restart is usually broadcast to several agents in a short burst. Keep the
  // whole burst, otherwise the latest freeze/ack message can hide the actual
  // working owner (for example the writer) from the overview.
  const restartBurst = candidates.filter(
    (candidate) =>
      candidate.isRestart &&
      latest.timestamp - candidate.timestamp <= 2 * 60_000,
  );

  return {
    ...latest,
    windowStart: Math.min(...restartBurst.map((candidate) => candidate.timestamp)),
  };
}

function findLatestTrackedDelegationSeed(
  company: Company,
  snapshots: RequirementSessionSnapshot[],
  options?: {
    preferredTopicKey?: string | null;
    preferredTopicText?: string | null;
    preferredTopicTimestamp?: number | null;
  },
): TrackedDelegationSeed | null {
  const ceo = company.employees.find((employee) => employee.metaRole === "ceo");
  if (!ceo) {
    return null;
  }

  const ceoSnapshot = snapshots.find((snapshot) => snapshot.agentId === ceo.agentId);
  if (!ceoSnapshot || ceoSnapshot.messages.length === 0) {
    return null;
  }

  for (let index = ceoSnapshot.messages.length - 1; index >= 0; index -= 1) {
    const assistantMessage = ceoSnapshot.messages[index];
    if (
      assistantMessage.role !== "assistant" ||
      !assistantMessage.text.includes("## 📋 任务追踪")
    ) {
      continue;
    }

    const steps = extractTrackerSteps(company, assistantMessage.text);
    if (steps.length === 0) {
      continue;
    }

    const latestUser = [...ceoSnapshot.messages.slice(0, index)]
      .reverse()
      .find(
        (message) =>
          message.role === "user" &&
          message.text.trim().length > 12 &&
          !isSyntheticWorkflowPromptText(message.text) &&
          !inferRequestTopicKey([message.text]) &&
          isStrategicInstruction(message.text),
      );
    const fallbackTopicKey =
      options?.preferredTopicKey && options.preferredTopicKey.startsWith("mission:")
        ? options.preferredTopicKey
        : null;
    const fallbackTopicText = options?.preferredTopicText?.trim() || null;
    if (!latestUser && !fallbackTopicKey) {
      continue;
    }

    return {
      title: deriveStrategicRequirementTitle([
        latestUser?.text ?? fallbackTopicText,
        assistantMessage.text,
        ...steps.map((step) => step.title),
      ]),
      topicKey:
        fallbackTopicKey ??
        inferMissionTopicKey([latestUser?.text ?? fallbackTopicText]) ??
        `mission:${assistantMessage.timestamp}`,
      startedAt: latestUser?.timestamp ?? options?.preferredTopicTimestamp ?? assistantMessage.timestamp,
      userText: latestUser?.text ?? fallbackTopicText ?? assistantMessage.text,
      assistantText: assistantMessage.text,
      steps,
    };
  }

  return null;
}

function buildTrackedDelegationParticipant(
  company: Company,
  snapshot: RequirementSessionSnapshot | undefined,
  step: TrackedDelegationStep,
  afterTimestamp: number,
  now: number,
): RequirementParticipantProgress {
  const agentId = step.assigneeAgentId ?? `unknown:${step.assigneeLabel}`;
  const nickname = step.assigneeAgentId ? formatAgentLabel(company, step.assigneeAgentId) : step.assigneeLabel;
  const role = step.assigneeAgentId ? formatAgentRole(company, step.assigneeAgentId) ?? "当前节点" : "当前节点";
  const reply = snapshot ? findLatestReplyAfter(snapshot, afterTimestamp) : null;

  if (!reply) {
    const stale = now - afterTimestamp >= 15 * 60_000;
    return {
      agentId,
      nickname,
      role,
      stage: step.title,
      statusLabel: stale ? "未回复" : "待回复",
      detail: stale ? `${formatElapsedMinutes(afterTimestamp, now)} 仍未回传这一步。` : "这一步已派发，正在等待回传。",
      updatedAt: afterTimestamp,
      tone: stale ? "rose" : "amber",
      isBlocking: stale,
      isCurrent: false,
    };
  }

  const replyText = reply.text.trim();
  const looksLikeStrategicReply =
    /极简结论|核心问题|优先级|最小闭环|分期建议|技术架构|规则层|状态机|模板系统|校验器|渲染协议|验收机制|建议|方案|Phase/i.test(
      replyText,
    ) || replyText.length >= 180;
  if (looksLikeStrategicReply) {
    return {
      agentId,
      nickname,
      role,
      stage: step.title,
      statusLabel: "已回复",
      detail: summarizeText(replyText, 160),
      updatedAt: reply.timestamp,
      tone: "emerald",
      isBlocking: false,
      isCurrent: false,
    };
  }

  if (/失败|阻塞|无法|没法|超时|缺失/i.test(replyText)) {
    return {
      agentId,
      nickname,
      role,
      stage: step.title,
      statusLabel: "已阻塞",
      detail: summarizeText(replyText, 160),
      updatedAt: reply.timestamp,
      tone: "rose",
      isBlocking: true,
      isCurrent: false,
    };
  }

  return {
    agentId,
    nickname,
    role,
    stage: step.title,
    statusLabel: "已回复",
    detail: summarizeText(replyText, 160),
    updatedAt: reply.timestamp,
    tone: "emerald",
    isBlocking: false,
    isCurrent: false,
  };
}

function buildTrackedDelegationOverview(
  company: Company,
  snapshots: RequirementSessionSnapshot[],
  now: number,
  options?: {
    preferredTopicKey?: string | null;
    preferredTopicText?: string | null;
    preferredTopicTimestamp?: number | null;
  },
): RequirementExecutionOverview | null {
  const seed = findLatestTrackedDelegationSeed(company, snapshots, options);
  if (!seed) {
    return null;
  }

  const ceo = company.employees.find((employee) => employee.metaRole === "ceo");
  if (!ceo) {
    return null;
  }

  const participantMap = new Map<string, RequirementParticipantProgress>();
  for (const step of seed.steps) {
    if (!step.assigneeAgentId || step.assigneeAgentId === ceo.agentId) {
      continue;
    }
    const snapshot = snapshots.find((item) => item.agentId === step.assigneeAgentId);
    participantMap.set(
      step.assigneeAgentId,
      buildTrackedDelegationParticipant(company, snapshot, step, seed.startedAt, now),
    );
  }

  const participants = orderParticipants(company, [...participantMap.values()]);
  const pendingParticipants = participants.filter((participant) => participant.statusLabel !== "已回复");
  const repliedLabels = participants
    .filter((participant) => participant.statusLabel === "已回复")
    .map((participant) => participant.nickname);
  const pendingLabels = pendingParticipants.map((participant) => participant.nickname);
  const ceoLabel = formatAgentLabel(company, ceo.agentId);

  const ceoParticipant: RequirementParticipantProgress = {
    agentId: ceo.agentId,
    nickname: ceoLabel,
    role: formatAgentRole(company, ceo.agentId) ?? "CEO",
    stage:
      pendingParticipants.length > 0
        ? `等待 ${pendingLabels.join("、")} 回传`
        : "整合团队方案并交付老板",
    statusLabel: pendingParticipants.length > 0 ? "待收口" : "待整合",
    detail:
      pendingParticipants.length > 0
        ? repliedLabels.length > 0
          ? `${repliedLabels.join("、")} 已回传，当前仍在等 ${pendingLabels.join("、")}。`
          : `当前已派发给 ${pendingLabels.join("、")}，等待他们回传。`
        : repliedLabels.length > 0
          ? `${repliedLabels.join("、")} 已回传，等待 CEO 整理成最终执行方案。`
          : "团队分工已生成，等待 CEO 继续推进。",
    updatedAt: Math.max(seed.startedAt, ...participants.map((participant) => participant.updatedAt)),
    tone: pendingParticipants.length > 0 ? "amber" : "blue",
    // CEO 收口属于当前工作节点，不应被上层误判成阻塞或需接管。
    isBlocking: false,
    isCurrent: true,
  };

  return {
    topicKey: seed.topicKey,
    title: seed.title,
    startedAt: seed.startedAt,
    headline: pendingParticipants.length > 0 ? "CEO 正在收集团队回传" : "当前卡点在 CEO",
    summary: ceoParticipant.detail,
    currentOwnerAgentId: ceo.agentId,
    currentOwnerLabel: ceoLabel,
    currentStage: ceoParticipant.stage,
    nextAction:
      pendingParticipants.length > 0
        ? `优先催 ${pendingLabels.join("、")} 回传结果，然后让 CEO 汇总。`
        : "现在让 CEO 整合团队方案，给出最终优先级和执行提案。",
    participants: [ceoParticipant, ...participants],
  };
}

function matchesRequestTopic(request: RequestRecord, topicKey: string): boolean {
  return request.topicKey === topicKey;
}

function matchesHandoffTopic(handoff: HandoffRecord, topicKey: string): boolean {
  return inferHandoffTopic(handoff) === topicKey;
}

function pickLatestRequest(requests: RequestRecord[], agentId: string): RequestRecord | null {
  return (
    [...requests]
      .filter((request) => request.toAgentIds.includes(agentId))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
  );
}

function pickLatestHandoff(handoffs: HandoffRecord[], agentId: string): HandoffRecord | null {
  return (
    [...handoffs]
      .filter((handoff) => handoff.toAgentIds.includes(agentId))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
  );
}

const MAX_REQUIREMENT_MESSAGE_TEXT = 2_000;
const REQUIREMENT_MESSAGE_HEAD = 1_200;
const REQUIREMENT_MESSAGE_TAIL = 700;

function extractText(message: RequirementMessageInput): string {
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text.trim();
  }

  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return message.content.trim();
  }

  if (!Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }
      if (block && typeof block === "object") {
        const record = block as Record<string, unknown>;
        if (record.type === "text" && typeof record.text === "string") {
          return record.text;
        }
      }
      return "";
    })
    .join("\n")
    .trim();
}

function compactRequirementMessageText(text: string): string {
  const trimmed = text.trim().replace(/\n{3,}/g, "\n\n");
  if (trimmed.length <= MAX_REQUIREMENT_MESSAGE_TEXT) {
    return trimmed;
  }

  // Requirement overview only needs enough head/tail context to recover baton,
  // delivery state, and artifact paths. Keep that context and drop the rest.
  const head = trimmed.slice(0, REQUIREMENT_MESSAGE_HEAD).trimEnd();
  const tail = trimmed.slice(-REQUIREMENT_MESSAGE_TAIL).trimStart();
  return `${head}\n\n[...已折叠过长内容...]\n\n${tail}`;
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function createRequirementMessageSnapshots(
  messages: RequirementMessageInput[],
  options?: {
    limit?: number;
  },
): RequirementMessageSnapshot[] {
  const limit = Math.max(1, options?.limit ?? REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT);
  return messages
    .map((message, index) => ({
      role: typeof message.role === "string" ? message.role : "unknown",
      text: compactRequirementMessageText(extractText(message)),
      timestamp: normalizeTimestamp(message.timestamp, index + 1),
    }))
    .filter((message) => message.text.length > 0)
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-limit);
}

function formatElapsedMinutes(updatedAt: number, now: number): string {
  const diffMinutes = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (diffMinutes <= 0) {
    return "刚刚";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes > 0 ? `${hours} 小时 ${minutes} 分钟前` : `${hours} 小时前`;
}

function countChecklistConfirmations(text: string): number {
  return [...text.matchAll(/是否[^:\n]{0,48}[:：]\s*(?:\*\*)?(?:是|否)/gi)].length;
}

function summarizeText(text: string, maxLength = 120): string {
  const compact = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function deriveStrategicRequirementTitle(texts: Array<string | null | undefined>): string {
  const corpus = texts
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  if (!corpus) {
    return "当前战略任务";
  }

  const hasConsistency = /一致性|约束驱动|规则层|校验器|validator|rules\.yaml/i.test(corpus);
  const hasReader = /阅读系统|阅读预览|审阅|审稿|内部阅读|阅读页/i.test(corpus);
  const hasExecution = /开工任务单|执行方案|立项|MVP|里程碑|验收/i.test(corpus);

  if (hasConsistency && hasReader) {
    return hasExecution ? "一致性底座与内部审阅系统执行方案" : "一致性底座与内部审阅系统";
  }
  if (hasConsistency) {
    return hasExecution ? "一致性技术方案与执行方案" : "一致性技术方案";
  }
  if (hasReader) {
    return hasExecution ? "小说阅读系统执行方案" : "小说阅读系统方案";
  }

  const titled = texts
    .map((value) => extractTitleFromInstruction(value ?? ""))
    .find((value) => typeof value === "string" && value.trim().length > 0);
  if (titled) {
    return titled;
  }

  return summarizeText(corpus, 28);
}

function extractTitleFromInstruction(text: string): string | null {
  const match = text.match(/【([^】]+)】/);
  if (!match?.[1]) {
    return null;
  }
  return match[1]
    .split("｜")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .join(" · ");
}

function extractArtifactPath(text: string): string | null {
  return text.match(/\/Users\/[^\s`"]+?\.md\b/)?.[0] ?? null;
}

function findArtifactCheck(
  snapshot: RequirementSessionSnapshot,
  path: string | null,
): RequirementArtifactCheck | null {
  if (!path) {
    return null;
  }
  return snapshot.artifactChecks?.find((check) => check.path === path) ?? null;
}

function findLatestRelevantInstruction(
  snapshot: RequirementSessionSnapshot,
  topicKey: string,
  hints: string[],
  minTimestamp = 0,
): RequirementMessageSnapshot | null {
  return (
    [...snapshot.messages]
      .reverse()
      .find((message) => {
        if (message.role !== "user") {
          return false;
        }
        if (message.timestamp < minTimestamp) {
          return false;
        }
        if (isSyntheticWorkflowPromptText(message.text)) {
          return false;
        }
        if (requestTopicMatchesText(topicKey, message.text)) {
          return true;
        }
        return hints.some((hint) => hint.length > 0 && message.text.includes(hint));
      }) ?? null
  );
}

function findLatestReplyAfter(
  snapshot: RequirementSessionSnapshot,
  afterTimestamp: number,
): RequirementMessageSnapshot | null {
  return (
    [...snapshot.messages]
      .reverse()
      .find((message) => {
        if (message.role !== "assistant" || message.timestamp < afterTimestamp) {
          return false;
        }
        const compact = message.text.trim();
        if (compact === "ANNOUNCE_SKIP" || compact === "NO_REPLY") {
          return false;
        }
        return true;
      }) ?? null
  );
}

function buildOverviewTitle(topicKey: string, hints: string[]): string {
  if (topicKey.startsWith("chapter:")) {
    const chapterId = topicKey.slice("chapter:".length);
    if (hints.some((hint) => /重写|从头|重开|重新完成/i.test(hint))) {
      return `重新完成第 ${chapterId} 章`;
    }
    return `第 ${chapterId} 章执行`;
  }

  if (topicKey.startsWith("mission:")) {
    return deriveStrategicRequirementTitle(hints);
  }

  const plainHint = hints.find(
    (hint) =>
      !hint.startsWith("chapter:") &&
      !hint.startsWith("artifact:") &&
      !hint.startsWith("mission:"),
  );
  return plainHint ? summarizeText(plainHint, 24) : "当前需求";
}

function snapshotsMentionRestart(snapshots: RequirementSessionSnapshot[]): boolean {
  return snapshots.some((snapshot) =>
    snapshot.messages.some(
      (message) =>
        message.role === "user" &&
        !isSyntheticWorkflowPromptText(message.text) &&
        isRestartInstruction(message.text),
    ),
  );
}

function orderParticipants(
  company: Company,
  participants: RequirementParticipantProgress[],
): RequirementParticipantProgress[] {
  const employeeOrder = new Map(company.employees.map((employee, index) => [employee.agentId, index]));
  return [...participants].sort((left, right) => {
    const leftIndex = employeeOrder.get(left.agentId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = employeeOrder.get(right.agentId) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return right.updatedAt - left.updatedAt;
  });
}

function summarizeRoleAction(
  role: string,
  statusLabel: string,
  instructionText: string,
  topicKey: string,
): string {
  const isChapterTopic = topicKey.startsWith("chapter:");
  if (isChapterTopic && /主笔|写手/i.test(role)) {
    if (statusLabel === "已交付待下游") {
      return "新版纯正文已交付";
    }
    return "写手重写纯正文";
  }
  if (isChapterTopic && /审校/i.test(role)) {
    return statusLabel === "已就绪待稿" ? "等待新版初稿" : "审校检查纯正文";
  }
  if (isChapterTopic && /主编|质量总监|终审/i.test(role)) {
    return "旧稿作废与终审口径重置";
  }
  if (isChapterTopic && /CTO|技术/i.test(role)) {
    return "发布冻结待命";
  }

  const title = extractTitleFromInstruction(instructionText);
  if (title) {
    return title.replace(/^[^｜]+\｜/, "").trim() || title;
  }

  return "当前步骤";
}

function resolveSnapshotParticipant(
  company: Company,
  snapshot: RequirementSessionSnapshot,
  topicKey: string,
  hints: string[],
  now: number,
  anchorTimestamp = 0,
): RequirementParticipantProgress | null {
  const employee = company.employees.find((item) => item.agentId === snapshot.agentId);
  if (!employee || employee.metaRole === "ceo") {
    return null;
  }

  const instruction = findLatestRelevantInstruction(snapshot, topicKey, hints, anchorTimestamp);
  if (!instruction) {
    return null;
  }
  const reply = findLatestReplyAfter(snapshot, instruction.timestamp);

  const nickname = formatAgentLabel(company, snapshot.agentId);
  const role = formatAgentRole(company, snapshot.agentId) ?? "当前节点";
  const updatedAt = reply?.timestamp ?? instruction.timestamp;

  if (!reply) {
    const stale = now - instruction.timestamp >= 15 * 60_000;
    return {
      agentId: snapshot.agentId,
      nickname,
      role,
      stage: summarizeRoleAction(role, stale ? "未回复" : "待回复", instruction.text, topicKey),
      statusLabel: stale ? "未回复" : "待回复",
      detail: stale
        ? `${formatElapsedMinutes(instruction.timestamp, now)} 仍未确认这一步。`
        : "这一步已发出，正在等待确认。",
      updatedAt,
      tone: stale ? "rose" : "amber",
      isBlocking: stale,
      isCurrent: false,
    };
  }

  const replyText = reply.text;
  const artifactPath = extractArtifactPath(replyText);
  const artifactCheck = findArtifactCheck(snapshot, artifactPath);
  const hasChecklistConfirmation = countChecklistConfirmations(replyText) >= 2;
  const isChapterTopic = topicKey.startsWith("chapter:");

  if (/失败|未成功|阻塞|超时|无法|没法|缺失/i.test(replyText)) {
    return {
      agentId: snapshot.agentId,
      nickname,
      role,
      stage: summarizeRoleAction(role, "已阻塞", instruction.text, topicKey),
      statusLabel: "已阻塞",
      detail: summarizeText(replyText, 160),
      updatedAt,
      tone: "rose",
      isBlocking: true,
      isCurrent: false,
    };
  }

  if (isChapterTopic && /等待新稿|等待新版|等待新指令|待命/i.test(replyText)) {
    const frozen = /冻结|发布/.test(replyText);
    return {
      agentId: snapshot.agentId,
      nickname,
      role,
      stage: summarizeRoleAction(
        role,
        frozen ? "已冻结待命" : "已就绪待稿",
        instruction.text,
        topicKey,
      ),
      statusLabel: frozen ? "已冻结待命" : "已就绪待稿",
      detail: frozen
        ? "旧链路已冻结，当前只等待新的终审通过指令。"
        : summarizeText(replyText, 140),
      updatedAt,
      tone: "emerald",
      isBlocking: false,
      isCurrent: false,
    };
  }

  if (
    /已开始|立即执行|开始写作|预计交稿时间|新稿文件路径|30 分钟内|开始处理/i.test(replyText)
  ) {
    const stale = now - reply.timestamp >= 10 * 60_000;
    const fileName = artifactPath?.split("/").pop() ?? null;
    const artifactDetail =
      artifactPath && artifactCheck?.exists === false
        ? `已经承诺交付 ${fileName ?? "新稿"}，但系统还没看到这个文件，当前仍没有新的正文交付。`
        : artifactPath && artifactCheck?.exists === true
          ? `新稿 ${fileName ?? "文件"} 已存在，等待下一棒接手。`
          : null;

    const statusLabel =
      artifactCheck?.exists === true
        ? "已交付待下游"
        : stale
          ? "已开工未交付"
          : "已开工";
    return {
      agentId: snapshot.agentId,
      nickname,
      role,
      stage: summarizeRoleAction(role, statusLabel, instruction.text, topicKey),
      statusLabel,
      detail:
        artifactDetail ??
        (stale
          ? `${summarizeText(replyText, 120)}；但 ${formatElapsedMinutes(reply.timestamp, now)} 还没看到新的交付结果。`
          : summarizeText(replyText, 140)),
      updatedAt,
      tone: artifactCheck?.exists === true ? "emerald" : stale ? "amber" : "blue",
      isBlocking: artifactCheck?.exists !== true && stale,
      isCurrent: false,
    };
  }

  if (
    /纯正文已交付|已交付|交稿完成|审校报告|审校完成|终审复核完成|终审完成|可归档|可进入发布流程|准予发布|待主编终审|待终审|待发布|技术方案|实现方案|阅读系统|建议方案|方案如下|已整理方案|已输出方案|阶段总结/i.test(
      replyText,
    )
  ) {
    const statusLabel = /纯正文已交付|已交付|交稿完成|待主编终审|待终审/i.test(replyText)
      ? "已交付待下游"
      : "已确认";
    return {
      agentId: snapshot.agentId,
      nickname,
      role,
      stage: summarizeRoleAction(role, statusLabel, instruction.text, topicKey),
      statusLabel,
      detail: summarizeText(replyText, 160),
      updatedAt,
      tone: "emerald",
      isBlocking: false,
      isCurrent: false,
    };
  }

  if (((isChapterTopic && /作废|就位|检查重点|纯正文|已明确|标准/i.test(replyText)) || hasChecklistConfirmation)) {
    const frozen = /冻结/i.test(replyText);
    return {
      agentId: snapshot.agentId,
      nickname,
      role,
      stage: summarizeRoleAction(role, frozen ? "已冻结待命" : "已确认", instruction.text, topicKey),
      statusLabel: frozen ? "已冻结待命" : "已确认",
      detail: summarizeText(replyText, 140),
      updatedAt,
      tone: "emerald",
      isBlocking: false,
      isCurrent: false,
    };
  }

  return {
    agentId: snapshot.agentId,
    nickname,
    role,
    stage: summarizeRoleAction(role, "已回复", instruction.text, topicKey),
    statusLabel: "已回复",
    detail: summarizeText(replyText, 140),
    updatedAt,
    tone: "violet",
    isBlocking: false,
    isCurrent: false,
  };
}

function resolveAnsweredStatus(
  request: RequestRecord,
): Pick<RequirementParticipantProgress, "statusLabel" | "detail" | "tone" | "isBlocking"> {
  const text = `${request.title}\n${request.responseSummary ?? request.summary}`;
  if (/冻结|旧稿不得再尝试发布|等待新指令|待命/i.test(text)) {
    return {
      statusLabel: "已冻结待命",
      detail: request.responseSummary ?? "旧链路已冻结，正在等待新的发布指令。",
      tone: "emerald",
      isBlocking: false,
    };
  }
  if (/作废|就位|检查重点|已明确|标准/i.test(text)) {
    return {
      statusLabel: "已确认",
      detail: request.responseSummary ?? "这一步已经明确回复，可以继续往下走。",
      tone: "emerald",
      isBlocking: false,
    };
  }
  if (request.resolution === "partial") {
    return {
      statusLabel: "部分完成",
      detail: request.responseSummary ?? request.summary,
      tone: "amber",
      isBlocking: true,
    };
  }
  return {
    statusLabel: "已回复",
    detail: request.responseSummary ?? request.summary,
    tone: "emerald",
    isBlocking: false,
  };
}

function resolveAcknowledgedStatus(
  request: RequestRecord,
  now: number,
): Pick<RequirementParticipantProgress, "statusLabel" | "detail" | "tone" | "isBlocking"> {
  const text = `${request.title}\n${request.responseSummary ?? request.summary}`;
  const elapsed = formatElapsedMinutes(request.updatedAt, now);
  const looksLikeStarted = /已开始|开始|立即执行|重写|写作|处理中|交稿时间|文件路径/i.test(text);

  if (looksLikeStarted) {
    const stale = now - request.updatedAt >= 20 * 60_000;
    return {
      statusLabel: stale ? "已开工未交付" : "已开工",
      detail: stale
        ? `${request.responseSummary ?? "已确认开始处理"}，但 ${elapsed} 仍未看到新的交付结果。`
        : request.responseSummary ?? "已确认开始处理，正在产出结果。",
      tone: stale ? "amber" : "blue",
      isBlocking: stale,
    };
  }

  const stale = now - request.updatedAt >= 20 * 60_000;
  return {
    statusLabel: stale ? "已接单未推进" : "已接单",
    detail: stale
      ? `${request.responseSummary ?? "已确认收到任务"}，但 ${elapsed} 没有新的推进。`
      : request.responseSummary ?? "已确认收到任务，等待进一步处理。",
    tone: stale ? "amber" : "violet",
    isBlocking: stale,
  };
}

function resolvePendingStatus(
  request: RequestRecord,
  now: number,
): Pick<RequirementParticipantProgress, "statusLabel" | "detail" | "tone" | "isBlocking"> {
  const stale = now - request.updatedAt >= 15 * 60_000;
  return {
    statusLabel: stale ? "未回复" : "待回复",
    detail: stale
      ? `${request.title} 已发出，但 ${formatElapsedMinutes(request.updatedAt, now)} 仍未收到确认。`
      : `${request.title} 已发出，正在等待确认。`,
    tone: stale ? "rose" : "amber",
    isBlocking: stale,
  };
}

function resolveBlockedStatus(
  request: RequestRecord,
): Pick<RequirementParticipantProgress, "statusLabel" | "detail" | "tone" | "isBlocking"> {
  return {
    statusLabel: "已阻塞",
    detail: request.responseSummary ?? request.summary,
    tone: "rose",
    isBlocking: true,
  };
}

function buildRequestParticipantProgress(
  company: Company,
  agentId: string,
  request: RequestRecord | null,
  handoff: HandoffRecord | null,
  now: number,
): RequirementParticipantProgress {
  const nickname = formatAgentLabel(company, agentId);
  const role = formatAgentRole(company, agentId) ?? "当前节点";
  const requestTimestamp = request?.updatedAt ?? 0;
  const handoffTimestamp = handoff?.updatedAt ?? 0;
  const updatedAt = Math.max(requestTimestamp, handoffTimestamp);
  const stage = request?.title ?? handoff?.title ?? "当前步骤";

  let statusLabel = "未接入";
  let detail = request?.summary ?? handoff?.summary ?? "当前还没有新的执行记录。";
  let tone: RequirementParticipantTone = "slate";
  let isBlocking = false;

  if (request?.status === "blocked") {
    ({ statusLabel, detail, tone, isBlocking } = resolveBlockedStatus(request));
  } else if (request?.status === "pending") {
    ({ statusLabel, detail, tone, isBlocking } = resolvePendingStatus(request, now));
  } else if (request?.status === "acknowledged") {
    ({ statusLabel, detail, tone, isBlocking } = resolveAcknowledgedStatus(request, now));
  } else if (request?.status === "answered") {
    ({ statusLabel, detail, tone, isBlocking } = resolveAnsweredStatus(request));
  } else if (handoff) {
    if (handoff.status === "blocked") {
      statusLabel = "交接阻塞";
      detail = handoff.missingItems?.[0] ?? handoff.summary;
      tone = "rose";
      isBlocking = true;
    } else if (handoff.status === "acknowledged") {
      statusLabel = "已接手";
      detail = handoff.summary;
      tone = "violet";
    } else if (handoff.status === "pending") {
      statusLabel = "待接手";
      detail = handoff.summary;
      tone = "amber";
    } else {
      statusLabel = "已交接";
      detail = handoff.summary;
      tone = "emerald";
    }
  }

  return {
    agentId,
    nickname,
    role,
    stage,
    statusLabel,
    detail,
    updatedAt,
    tone,
    isBlocking,
    isCurrent: false,
  };
}

function pickCurrentParticipant(
  participants: RequirementParticipantProgress[],
): RequirementParticipantProgress | null {
  const statusPriority = new Map<string, number>([
    ["已阻塞", 0],
    ["交接阻塞", 0],
    ["未回复", 1],
    ["待回复", 1],
    ["已开工未交付", 2],
    ["已接单未推进", 2],
    ["已开工", 3],
    ["已接单", 3],
    ["已交付待下游", 4],
    ["部分完成", 5],
    ["待接手", 6],
    ["已就绪待稿", 7],
    ["已确认", 8],
    ["已冻结待命", 9],
    ["已回复", 9],
    ["已交接", 9],
  ]);

  return (
    [...participants].sort((left, right) => {
      const leftPriority = statusPriority.get(left.statusLabel) ?? 99;
      const rightPriority = statusPriority.get(right.statusLabel) ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return right.updatedAt - left.updatedAt;
    })[0] ?? null
  );
}

function participantMatchesRole(
  participant: RequirementParticipantProgress,
  pattern: RegExp,
): boolean {
  return pattern.test(`${participant.role} ${participant.nickname}`);
}

function isParticipantCompletedLike(statusLabel: string): boolean {
  return ["已确认", "已交付待下游", "已回复", "已冻结待命", "已交接"].includes(statusLabel);
}

function buildDispatchCoordinatorOverview(input: {
  company: Company;
  topicKey: string;
  title: string;
  startedAt: number;
  participants: RequirementParticipantProgress[];
}): RequirementExecutionOverview | null {
  const { company, topicKey, title, startedAt, participants } = input;
  const ceo = company.employees.find((employee) => employee.metaRole === "ceo");
  if (!ceo) {
    return null;
  }

  const techParticipant =
    participants.find((participant) => participantMatchesRole(participant, /CTO|技术/i)) ?? null;
  if (!techParticipant || techParticipant.statusLabel !== "已冻结待命") {
    return null;
  }

  const coreParticipants = participants.filter((participant) =>
    participantMatchesRole(participant, /主笔|写手|审校|主编|质量总监|终审/i),
  );
  if (coreParticipants.length < 2 || !coreParticipants.every((participant) => isParticipantCompletedLike(participant.statusLabel))) {
    return null;
  }

  const ceoLabel = formatAgentLabel(company, ceo.agentId);
  const ceoRole = formatAgentRole(company, ceo.agentId) ?? "CEO";
  const syntheticCurrent: RequirementParticipantProgress = {
    agentId: ceo.agentId,
    nickname: ceoLabel,
    role: ceoRole,
    stage: "向 CTO 下发新版发布指令",
    statusLabel: "待派发",
    detail: "写手、审校、主编都已经完成本轮，当前只差 CEO 把新版终审通过结果正式转给 CTO。",
    updatedAt: Math.max(...participants.map((participant) => participant.updatedAt)),
    tone: "amber",
    isBlocking: true,
    isCurrent: true,
  };

  return {
    topicKey,
    title,
    startedAt,
    headline: "当前卡点在 CEO",
    summary: syntheticCurrent.detail,
    currentOwnerAgentId: ceo.agentId,
    currentOwnerLabel: ceoLabel,
    currentStage: syntheticCurrent.stage,
    nextAction: "现在通知 CTO 立即发布新版第 2 章，并要求他回传是否成功、发布链接和审核状态。",
    participants: [
      syntheticCurrent,
      ...participants.map((participant) => ({
        ...participant,
        isCurrent: false,
      })),
    ],
  };
}

function buildLiveOverview(
  company: Company,
  topicKey: string,
  hints: string[],
  snapshots: RequirementSessionSnapshot[],
  now: number,
): RequirementExecutionOverview | null {
  const anchor = resolveRequirementAnchor(snapshots, topicKey, hints);
  const participants = orderParticipants(
    company,
    snapshots
      .map((snapshot) =>
        resolveSnapshotParticipant(company, snapshot, topicKey, hints, now, anchor?.windowStart ?? 0),
      )
      .filter((participant): participant is RequirementParticipantProgress => Boolean(participant)),
  );

  if (participants.length === 0) {
    return null;
  }

  const current = pickCurrentParticipant(participants);
  if (!current) {
    return null;
  }

  const title =
    topicKey.startsWith("chapter:") && (anchor?.isRestart || snapshotsMentionRestart(snapshots))
      ? `重新完成第 ${topicKey.slice("chapter:".length)} 章`
      : buildOverviewTitle(topicKey, hints);
  const startedAt =
    anchor?.windowStart ??
    participants.reduce(
      (earliest, participant) => Math.min(earliest, participant.updatedAt),
      Number.MAX_SAFE_INTEGER,
    );
  const normalizedParticipants = participants.map((participant) => ({
    ...participant,
    isCurrent: participant.agentId === current.agentId,
  }));

  const dispatchOverview = buildDispatchCoordinatorOverview({
    company,
    topicKey,
    title,
    startedAt: Number.isFinite(startedAt) ? startedAt : now,
    participants: normalizedParticipants,
  });
  if (dispatchOverview) {
    return dispatchOverview;
  }

  let headline = `${current.nickname} 正在处理`;
  let nextAction = `打开 ${current.nickname} 会话继续跟进。`;

  if (current.isBlocking) {
    headline = `${current.nickname} 这一步卡住了`;
    nextAction = `优先打开 ${current.nickname} 会话，把这一步补齐。`;
  } else if (current.statusLabel === "已开工未交付") {
    headline = `${current.nickname} 还没交新稿`;
    nextAction = `优先打开 ${current.nickname} 会话，确认纯正文新稿是否已经落盘。`;
  } else if (current.statusLabel === "已开工") {
    headline = `${current.nickname} 正在处理`;
    nextAction = `先等 ${current.nickname} 交稿；如果久没有结果，再去会话里催。`;
  } else if (current.statusLabel === "未回复" || current.statusLabel === "待回复") {
    headline = `正在等 ${current.nickname} 回复`;
    nextAction = `优先催 ${current.nickname} 先确认是否接单。`;
  } else if (current.statusLabel === "已交付待下游") {
    headline = `${current.nickname} 已交付，下一棒要接住`;
    nextAction = "现在该去追下游环节，不要再盯上一棒。";
  } else if (current.statusLabel === "已冻结待命") {
    headline = `${current.nickname} 已待命`;
    nextAction = "这一步不用再追，继续盯当前真正的执行节点。";
  }

  return {
    topicKey,
    title,
    startedAt: Number.isFinite(startedAt) ? startedAt : now,
    headline,
    summary: current.detail,
    currentOwnerAgentId: current.agentId,
    currentOwnerLabel: current.nickname,
    currentStage: current.stage,
    nextAction,
    participants: normalizedParticipants,
  };
}

export function buildRequirementExecutionOverview(
  input: BuildRequirementExecutionOverviewInput,
): RequirementExecutionOverview | null {
  const { company, now = Date.now() } = input;
  if (!company) {
    return null;
  }

  const activeRequests = uniqueById(getActiveRequests(company.requests ?? []));
  const activeHandoffs = uniqueById(getActiveHandoffs(company.handoffs ?? []));
  const hints = extractTopicHints(input.topicHints ?? []);
  const trackedDelegationOverview =
    input.sessionSnapshots && input.sessionSnapshots.length > 0
        ? buildTrackedDelegationOverview(company, input.sessionSnapshots, now, {
          preferredTopicKey: input.preferredTopicKey ?? null,
          preferredTopicText: input.preferredTopicText ?? null,
          preferredTopicTimestamp: input.preferredTopicTimestamp ?? null,
        })
      : null;
  if (trackedDelegationOverview) {
    return trackedDelegationOverview;
  }
  const preferredTopicKey = input.preferredTopicKey ?? null;
  const explicitHintTopic = hints.find((hint) => hint.startsWith("chapter:") || hint.startsWith("artifact:")) ?? null;
  const snapshotTopic =
    input.sessionSnapshots && input.sessionSnapshots.length > 0
      ? resolveTopicKeyFromSnapshots(input.sessionSnapshots, hints)
      : null;
  const topicKey =
    preferredTopicKey ??
    snapshotTopic ??
    explicitHintTopic ??
    resolveTopicKey(activeRequests, activeHandoffs, hints);
  if (!topicKey) {
    return null;
  }

  const liveOverview =
    input.sessionSnapshots && input.sessionSnapshots.length > 0
      ? buildLiveOverview(company, topicKey, hints, input.sessionSnapshots, now)
      : null;
  if (liveOverview) {
    return liveOverview;
  }

  const requests = activeRequests
    .filter((request) => matchesRequestTopic(request, topicKey))
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const handoffs = activeHandoffs
    .filter((handoff) => matchesHandoffTopic(handoff, topicKey))
    .sort((left, right) => right.updatedAt - left.updatedAt);

  if (requests.length === 0 && handoffs.length === 0) {
    return null;
  }

  const participantIds = [
    ...requests.flatMap((request) => request.toAgentIds),
    ...handoffs.flatMap((handoff) => handoff.toAgentIds),
  ].filter((agentId, index, array) => array.indexOf(agentId) === index);

  const participants = orderParticipants(
    company,
    participantIds.map((agentId) =>
      buildRequestParticipantProgress(
        company,
        agentId,
        pickLatestRequest(requests, agentId),
        pickLatestHandoff(handoffs, agentId),
        now,
      ),
    ),
  );

  const current = pickCurrentParticipant(participants);
  if (!current) {
    return null;
  }

  const currentParticipants = participants.map((participant) => ({
    ...participant,
    isCurrent: participant.agentId === current.agentId,
  }));

  let headline = `${current.nickname} 正在处理`;
  let summary = current.detail;
  let nextAction = `打开 ${current.nickname} 会话继续跟进。`;
  const startedAt = [...requests, ...handoffs].reduce(
    (earliest, item) => Math.min(earliest, item.updatedAt),
    Number.MAX_SAFE_INTEGER,
  );

  if (current.isBlocking) {
    headline = `${current.nickname} 这一步卡住了`;
    nextAction = `优先打开 ${current.nickname} 会话，把这一步补齐。`;
  } else if (current.statusLabel === "已开工未交付") {
    headline = `${current.nickname} 还没交付结果`;
    nextAction = `优先找 ${current.nickname} 确认交稿和文件路径。`;
  } else if (current.statusLabel === "未回复" || current.statusLabel === "待回复") {
    headline = `正在等 ${current.nickname} 回复`;
    nextAction = `优先催 ${current.nickname} 先确认是否接单。`;
  } else if (current.statusLabel === "已冻结待命") {
    headline = `${current.nickname} 已待命`;
    nextAction = "这一步不用再追，继续盯当前真正的执行节点。";
  }

  return {
    topicKey,
    title: buildOverviewTitle(topicKey, hints),
    startedAt: Number.isFinite(startedAt) ? startedAt : now,
    headline,
    summary,
    currentOwnerAgentId: current.agentId,
    currentOwnerLabel: current.nickname,
    currentStage: current.stage,
    nextAction,
    participants: currentParticipants,
  };
}
