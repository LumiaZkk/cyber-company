import type { WorkItemRecord } from "./types";

function buildWorkItemKind(topicKey?: string | null): WorkItemRecord["kind"] {
  if (topicKey?.trim() && /^mission:/i.test(topicKey)) {
    return "strategic";
  }
  if (topicKey?.trim()?.startsWith("artifact:")) {
    return "artifact";
  }
  return "execution";
}

function hashStableText(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

function isEphemeralStrategicTopicKey(topicKey: string | null | undefined): boolean {
  const normalized = topicKey?.trim() ?? "";
  if (!normalized.startsWith("mission:")) {
    return false;
  }
  const suffix = normalized.slice("mission:".length);
  return /^[a-z0-9]{5,10}$/i.test(suffix);
}

function isLowSignalWorkItemTitle(value: string | null | undefined): boolean {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return true;
  }
  return ["当前规划/任务", "当前任务", "当前需求", "本轮规划/任务", "CEO"].includes(normalized);
}

function stripRepeatedRoundSuffix(value: string): string {
  return value.replace(/(?:@\d+)+$/g, "");
}

function unwrapAggregateWrappers(value: string): string {
  let current = stripRepeatedRoundSuffix(value.trim());
  while (current.length > 0) {
    if (/^topic:aggregate:/i.test(current)) {
      current = current.slice("topic:aggregate:".length);
      continue;
    }
    if (/^aggregate:topic:/i.test(current)) {
      current = current.slice("aggregate:".length);
      continue;
    }
    if (/^aggregate:/i.test(current)) {
      current = current.slice("aggregate:".length);
      continue;
    }
    break;
  }
  return current;
}

function normalizeProductTopicKey(topicKey: string | null | undefined): string | null {
  const normalized = topicKey?.trim() ?? "";
  if (!normalized) {
    return null;
  }
  const unwrapped = unwrapAggregateWrappers(normalized);
  const withoutTopicPrefix = /^topic:/i.test(unwrapped)
    ? unwrapped.slice("topic:".length)
    : unwrapped;
  return withoutTopicPrefix.trim() || null;
}

export function buildStableStrategicTopicKey(input: {
  topicKey?: string | null;
  title?: string | null;
}): string | null {
  const normalizedTopicKey = normalizeProductTopicKey(input.topicKey);
  if (normalizedTopicKey && !isEphemeralStrategicTopicKey(normalizedTopicKey)) {
    return normalizedTopicKey;
  }
  const normalizedTitle = input.title?.replace(/\s+/g, " ").trim() ?? "";
  if (normalizedTitle && !isLowSignalWorkItemTitle(normalizedTitle)) {
    return `mission:${hashStableText(normalizedTitle)}`;
  }
  return normalizedTopicKey;
}

export function normalizeProductWorkItemIdentity(input: {
  workItemId?: string | null;
  topicKey?: string | null;
  title?: string | null;
}): {
  workItemId: string | null;
  workKey: string | null;
  topicKey: string | null;
} {
  const normalizedWorkItemId = normalizeStrategicWorkItemId(input.workItemId);
  const normalizedTopicKey = normalizeProductTopicKey(input.topicKey);
  const inferredStrategicTopicKey =
    normalizedTopicKey ??
    (normalizedWorkItemId?.startsWith("topic:")
      ? normalizeProductTopicKey(normalizedWorkItemId)
      : null);
  const kind = buildWorkItemKind(inferredStrategicTopicKey);
  if (kind !== "strategic") {
    const workKey = normalizedTopicKey ? `topic:${normalizedTopicKey}` : normalizedWorkItemId ?? null;
    return {
      workItemId: normalizedWorkItemId ?? null,
      workKey,
      topicKey: normalizedTopicKey,
    };
  }

  const stableTopicKey =
    inferredStrategicTopicKey ??
    buildStableStrategicTopicKey({
      topicKey: null,
      title: input.title,
    });
  const workKey = stableTopicKey ? `topic:${stableTopicKey}` : normalizedWorkItemId ?? null;
  return {
    workItemId: workKey,
    workKey,
    topicKey: stableTopicKey,
  };
}

export function buildWorkItemIdentity(input: {
  topicKey?: string | null;
  title?: string | null;
  fallbackId: string;
  startedAt?: number | null;
  updatedAt?: number | null;
}) {
  const kind = buildWorkItemKind(input.topicKey);
  const stableTopicKey =
    kind === "strategic"
      ? buildStableStrategicTopicKey({
          topicKey: input.topicKey,
          title: input.title,
        })
      : input.topicKey?.trim() || null;
  const workKey = stableTopicKey ? `topic:${stableTopicKey}` : input.fallbackId;
  const id = kind === "strategic" ? workKey : input.fallbackId;
  const roundAnchor =
    (typeof input.startedAt === "number" && input.startedAt > 0 ? input.startedAt : null) ??
    (typeof input.updatedAt === "number" && input.updatedAt > 0 ? input.updatedAt : null) ??
    Date.now();
  return {
    id,
    kind,
    workKey,
    topicKey: stableTopicKey,
    roundId: `${workKey}@${Math.floor(roundAnchor)}`,
  };
}

export function normalizeStrategicWorkItemId(
  workItemId: string | null | undefined,
): string | null {
  const normalized = workItemId?.trim();
  if (!normalized) {
    return null;
  }
  const unwrapped = unwrapAggregateWrappers(normalized);
  if (/^topic:mission:/i.test(unwrapped)) {
    return unwrapped;
  }
  if (/^mission:/i.test(unwrapped)) {
    return `topic:${unwrapped}`;
  }
  const match = normalized.match(/^topic:([^@]+)@\d+$/);
  if (!match) {
    return normalized;
  }
  const topicKey = match[1] ?? "";
  return /^mission:/i.test(topicKey) ? `topic:${topicKey}` : normalized;
}

export function normalizeStrategicRoundId(
  roundId: string | null | undefined,
): string | null {
  const normalized = roundId?.trim();
  if (!normalized) {
    return null;
  }
  const workItemId = normalizeStrategicWorkItemId(normalized);
  if (!workItemId) {
    return null;
  }
  if (workItemId === normalized) {
    return normalized;
  }
  const timestampMatches = [...normalized.matchAll(/@(\d+)/g)];
  const lastTimestamp = timestampMatches[timestampMatches.length - 1]?.[1] ?? null;
  return lastTimestamp ? `${workItemId}@${lastTimestamp}` : workItemId;
}

export function deriveWorkKeyFromWorkItemId(
  workItemId: string | null | undefined,
): string | null {
  return normalizeStrategicWorkItemId(workItemId);
}

export function resolveStableWorkItemTitle(input: {
  existingTitle?: string | null;
  candidateTitle: string;
  kind: WorkItemRecord["kind"];
}): string {
  const existingTitle = input.existingTitle?.trim() ?? "";
  const candidateTitle = input.candidateTitle.trim();
  if (input.kind !== "strategic") {
    return candidateTitle;
  }
  if (!existingTitle) {
    return candidateTitle;
  }
  if (isLowSignalWorkItemTitle(existingTitle)) {
    return candidateTitle;
  }
  if (existingTitle === candidateTitle) {
    return existingTitle;
  }

  const existingSignalsChapterExecution =
    /第\s*\d+\s*章|章节|终审|发布|审校|交稿|正文|写手|主编/i.test(existingTitle);
  const candidateSignalsStrategicProgram =
    /从头开始搭建\s*AI\s*小说创作团队|从头开始搭建小说创作团队|创作团队|组织架构|招聘JD|兼任方案|世界观架构师|伏笔管理员|去AI味专员|质量提升专项|工具能力建设|流程优化|内部审阅系统|一致性底座|阅读系统|执行方案/i.test(
      candidateTitle,
    );
  if (existingSignalsChapterExecution && candidateSignalsStrategicProgram) {
    return candidateTitle;
  }

  const candidateSignalsTeamBootstrap =
    /从头开始搭建\s*AI\s*小说创作团队|从头开始搭建小说创作团队|创作团队|组织架构|招聘JD|兼任方案|世界观架构师|伏笔管理员|去AI味专员|质量提升专项|质量提升/i.test(
      candidateTitle,
    );
  const existingSignalsTeamBootstrap =
    /从头开始搭建\s*AI\s*小说创作团队|从头开始搭建小说创作团队|创作团队|组织架构|招聘JD|兼任方案|世界观架构师|伏笔管理员|去AI味专员|质量提升专项|质量提升/i.test(
      existingTitle,
    );
  if (candidateSignalsTeamBootstrap && !existingSignalsTeamBootstrap) {
    return candidateTitle;
  }

  const candidateSignalsExecutionLayer = /执行方案|内部审阅系统|阅读系统|一致性底座|MVP/i.test(candidateTitle);
  const existingSignalsExecutionLayer = /执行方案|内部审阅系统|阅读系统|一致性底座|MVP/i.test(existingTitle);
  if (candidateSignalsExecutionLayer && !existingSignalsExecutionLayer) {
    return candidateTitle;
  }

  return existingTitle;
}
