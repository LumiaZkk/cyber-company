import type {
  ArtifactRecord,
  ConversationStateRecord,
  ConversationMissionRecord,
  ConversationMissionStepRecord,
  DispatchRecord,
  RequirementRoomRecord,
  RoundMessageSnapshot,
  RoundRecord,
  WorkItemRecord,
  WorkStepRecord,
} from "../company/types";
import { sanitizeRoundPreview, sanitizeRoundTitle } from "../company/round-history";
import type { RequirementExecutionOverview } from "./requirement-overview";
import { isParticipantCompletedStatus, isStrategicRequirementTopic } from "./requirement-kind";
import { parseAgentIdFromSessionKey } from "../../lib/sessions";

function buildWorkItemKind(topicKey?: string | null): WorkItemRecord["kind"] {
  if (topicKey?.trim() && isStrategicRequirementTopic(topicKey)) {
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

export function buildStableStrategicTopicKey(input: {
  topicKey?: string | null;
  title?: string | null;
}): string | null {
  const normalizedTopicKey = input.topicKey?.trim() || null;
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
  const normalizedTopicKey = input.topicKey?.trim() || null;
  const inferredStrategicTopicKey =
    normalizedTopicKey ??
    (normalizedWorkItemId?.startsWith("topic:")
      ? normalizedWorkItemId.slice("topic:".length)
      : null);
  const kind = buildWorkItemKind(inferredStrategicTopicKey);
  if (kind !== "strategic") {
    const workKey =
      normalizedTopicKey ? `topic:${normalizedTopicKey}` : normalizedWorkItemId ?? null;
    return {
      workItemId: normalizedWorkItemId ?? null,
      workKey,
      topicKey: normalizedTopicKey,
    };
  }

  const stableTopicKey = buildStableStrategicTopicKey({
    topicKey: inferredStrategicTopicKey,
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
  const match = normalized.match(/^topic:([^@]+)@\d+$/);
  if (!match) {
    return normalized;
  }
  const topicKey = match[1] ?? "";
  return isStrategicRequirementTopic(topicKey) ? `topic:${topicKey}` : normalized;
}

export function deriveWorkKeyFromWorkItemId(
  workItemId: string | null | undefined,
): string | null {
  return normalizeStrategicWorkItemId(workItemId);
}

function resolveWorkItemSourceActorId(input: {
  sourceActorId?: string | null;
  legacySourceSessionKey?: string | null;
  ownerActorId?: string | null;
}): string | null {
  return (
    input.sourceActorId?.trim() ||
    // Compatibility-only migration from legacy mission/session inputs.
    parseAgentIdFromSessionKey(input.legacySourceSessionKey ?? "") ||
    input.ownerActorId?.trim() ||
    null
  );
}

function resolveWorkItemSourceActorLabel(input: {
  sourceActorLabel?: string | null;
  ownerLabel?: string | null;
}): string | null {
  return input.sourceActorLabel?.trim() || input.ownerLabel?.trim() || null;
}

function isLowSignalWorkItemTitle(value: string | null | undefined): boolean {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return true;
  }
  return ["当前规划/任务", "当前任务", "当前需求", "本轮规划/任务", "CEO"].includes(normalized);
}

function buildWorkItemDisplayFields(input: {
  title: string;
  stageLabel: string;
  summary: string;
  ownerLabel: string;
  nextAction: string;
  status: WorkItemRecord["status"];
}): Pick<
  WorkItemRecord,
  "headline" | "displayStage" | "displaySummary" | "displayOwnerLabel" | "displayNextAction"
> {
  return {
    headline: input.title,
    displayStage: input.stageLabel || (input.status === "completed" ? "已完成" : "进行中"),
    displaySummary: input.summary || input.nextAction || input.stageLabel || input.title,
    displayOwnerLabel: input.ownerLabel || "当前负责人",
    displayNextAction: input.nextAction || input.stageLabel || "继续推进当前工作项。",
  };
}

type WorkItemDisplayBackfillInput = Omit<
  WorkItemRecord,
  "headline" | "displayStage" | "displaySummary" | "displayOwnerLabel" | "displayNextAction"
> &
  Partial<
    Pick<
      WorkItemRecord,
      "headline" | "displayStage" | "displaySummary" | "displayOwnerLabel" | "displayNextAction"
    >
  >;

export function applyWorkItemDisplayFields(
  workItem: WorkItemDisplayBackfillInput,
): WorkItemRecord {
  return {
    ...workItem,
    ...buildWorkItemDisplayFields({
      title: workItem.title,
      stageLabel: workItem.stageLabel,
      summary: workItem.summary || workItem.goal,
      ownerLabel: workItem.ownerLabel,
      nextAction: workItem.nextAction,
      status: workItem.status,
    }),
  };
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

  const candidateSignalsExecutionLayer =
    /执行方案|内部审阅系统|阅读系统|一致性底座|MVP/i.test(candidateTitle);
  const existingSignalsExecutionLayer =
    /执行方案|内部审阅系统|阅读系统|一致性底座|MVP/i.test(existingTitle);

  if (candidateSignalsExecutionLayer && !existingSignalsExecutionLayer) {
    return candidateTitle;
  }

  return existingTitle;
}

function normalizeWorkItemStatus(
  mission: ConversationMissionRecord,
): WorkItemRecord["status"] {
  if (mission.completed) {
    return "completed";
  }

  const normalized = mission.statusLabel.trim().toLowerCase();
  if (normalized.includes("确认")) {
    return "waiting_review";
  }
  if (normalized.includes("收口") || normalized.includes("汇总")) {
    return "waiting_owner";
  }
  if (normalized.includes("阻塞") || normalized.includes("卡")) {
    return "blocked";
  }
  return "active";
}

function toWorkStepRecord(step: ConversationMissionStepRecord): WorkStepRecord {
  return {
    id: step.id,
    title: step.title,
    assigneeActorId: step.assigneeAgentId ?? null,
    assigneeLabel: step.assigneeLabel,
    status:
      step.status === "done" ? "done" : step.status === "wip" ? "active" : "pending",
    completionCriteria: step.detail ?? null,
    detail: step.detail ?? null,
    updatedAt: Date.now(),
  };
}

export function buildWorkItemRecordFromMission(input: {
  companyId: string;
  mission: ConversationMissionRecord;
  room?: RequirementRoomRecord | null;
}): WorkItemRecord {
  const { companyId, mission, room } = input;
  const steps = mission.planSteps.map(toWorkStepRecord);
  const batonActorId = mission.nextAgentId ?? mission.ownerAgentId ?? null;
  const batonLabel = mission.nextLabel || mission.ownerLabel;
  const completedAt = mission.completed ? mission.updatedAt : null;
  const identity = buildWorkItemIdentity({
    topicKey: mission.topicKey,
    title: mission.title,
    fallbackId: mission.id,
    startedAt: mission.startedAt ?? null,
    updatedAt: mission.updatedAt,
  });
  return applyWorkItemDisplayFields({
    id: identity.id,
    workKey: identity.workKey,
    kind: identity.kind,
    roundId: identity.roundId,
    companyId,
    sessionKey: mission.sessionKey,
    topicKey: identity.topicKey ?? mission.topicKey,
    sourceActorId: resolveWorkItemSourceActorId({
      legacySourceSessionKey: mission.sessionKey,
      ownerActorId: mission.ownerAgentId,
    }),
    sourceActorLabel: resolveWorkItemSourceActorLabel({
      ownerLabel: mission.ownerLabel,
    }),
    sourceSessionKey: mission.sessionKey,
    sourceConversationId: mission.sessionKey,
    providerId: null,
    title: mission.title,
    goal: mission.summary,
    status: normalizeWorkItemStatus(mission),
    stageLabel: mission.currentStepLabel,
    ownerActorId: mission.ownerAgentId ?? null,
    ownerLabel: mission.ownerLabel,
    batonActorId,
    batonLabel,
    roomId: room?.id ?? mission.roomId ?? null,
    artifactIds: [],
    dispatchIds: [],
    startedAt: mission.startedAt ?? mission.updatedAt,
    updatedAt: mission.updatedAt,
    completedAt,
    summary: mission.summary,
    nextAction: mission.guidance || mission.nextLabel,
    steps,
    sourceMissionId: mission.id,
  });
}

function normalizeWorkItemStatusFromOverview(
  overview: RequirementExecutionOverview,
): WorkItemRecord["status"] {
  const combined = `${overview.headline} ${overview.currentStage} ${overview.summary}`.toLowerCase();
  if (
    overview.participants.length > 0 &&
    overview.participants.every((participant) =>
      isParticipantCompletedStatus(participant.statusLabel),
    )
  ) {
    return "completed";
  }
  if (combined.includes("阻塞") || combined.includes("卡住")) {
    return "blocked";
  }
  if (combined.includes("整合") || combined.includes("收口") || combined.includes("交付老板")) {
    return "waiting_owner";
  }
  if (combined.includes("确认") || combined.includes("审阅")) {
    return "waiting_review";
  }
  return "active";
}

export function buildWorkItemRecordFromRequirementOverview(input: {
  companyId: string;
  overview: RequirementExecutionOverview;
  roomId?: string | null;
  ownerSessionKey?: string | null;
}): WorkItemRecord {
  const { companyId, overview, roomId, ownerSessionKey } = input;
  const identity = buildWorkItemIdentity({
    topicKey: overview.topicKey,
    title: overview.title,
    fallbackId: `topic:${overview.topicKey}@${overview.startedAt}`,
    startedAt: overview.startedAt,
  });
  return applyWorkItemDisplayFields({
    id: identity.id,
    workKey: identity.workKey,
    kind: identity.kind,
    roundId: identity.roundId,
    companyId,
    sessionKey: ownerSessionKey ?? undefined,
    topicKey: identity.topicKey ?? overview.topicKey,
    sourceActorId: resolveWorkItemSourceActorId({
      legacySourceSessionKey: ownerSessionKey,
      ownerActorId: overview.currentOwnerAgentId,
    }),
    sourceActorLabel: resolveWorkItemSourceActorLabel({
      ownerLabel: overview.currentOwnerLabel,
    }),
    sourceSessionKey: ownerSessionKey ?? null,
    sourceConversationId: ownerSessionKey ?? null,
    providerId: null,
    title: overview.title,
    goal: overview.summary,
    status: normalizeWorkItemStatusFromOverview(overview),
    stageLabel: overview.currentStage,
    ownerActorId: overview.currentOwnerAgentId ?? null,
    ownerLabel: overview.currentOwnerLabel || "当前负责人",
    batonActorId: overview.currentOwnerAgentId ?? null,
    batonLabel: overview.currentOwnerLabel || "当前负责人",
    roomId: roomId ?? null,
    artifactIds: [],
    dispatchIds: [],
    startedAt: overview.startedAt,
    updatedAt: Math.max(
      overview.startedAt,
      ...overview.participants.map((participant) => participant.updatedAt),
    ),
    completedAt:
      overview.participants.length > 0 &&
      overview.participants.every((participant) =>
        isParticipantCompletedStatus(participant.statusLabel),
      )
        ? Math.max(...overview.participants.map((participant) => participant.updatedAt))
        : null,
    summary: overview.summary,
    nextAction: overview.nextAction,
    steps: overview.participants.map((participant) => ({
      id: `${overview.topicKey}:${participant.agentId}`,
      title: participant.stage,
      assigneeActorId: participant.agentId,
      assigneeLabel: participant.nickname,
      status:
        isParticipantCompletedStatus(participant.statusLabel)
          ? "done"
          : participant.isCurrent
            ? "active"
            : participant.isBlocking
              ? "blocked"
              : "pending",
      completionCriteria: participant.detail,
      detail: participant.detail,
      updatedAt: participant.updatedAt,
    })),
  });
}

function matchesWorkItemTopic(item: WorkItemRecord, topicKey: string | null | undefined): boolean {
  return Boolean(topicKey) && item.topicKey === topicKey;
}

function matchesWorkItemRound(item: WorkItemRecord, startedAt: number | null | undefined): boolean {
  if (!startedAt || !item.startedAt) {
    return false;
  }
  return item.startedAt >= startedAt - 1_000;
}

function scoreWorkItemMatch(input: {
  item: WorkItemRecord;
  sessionKey?: string | null;
  roomId?: string | null;
  topicKey?: string | null;
  startedAt?: number | null;
}): number {
  const { item, roomId, sessionKey, topicKey, startedAt } = input;
  let score = 0;
  if (matchesWorkItemTopic(item, topicKey)) {
    score += 100;
  }
  if (matchesWorkItemRound(item, startedAt)) {
    score += 60;
  }
  if (roomId && item.roomId === roomId) {
    score += 40;
  }
  if (sessionKey && item.sourceConversationId === sessionKey) {
    score += 30;
  }
  if (sessionKey && item.sessionKey === sessionKey) {
    score += 20;
  }
  if (item.status !== "completed" && item.status !== "archived") {
    score += 5;
  }
  return score;
}

export function matchesWorkItemSourceActor(
  item: WorkItemRecord,
  actorId: string | null | undefined,
): boolean {
  if (!actorId) {
    return false;
  }
  if (item.sourceActorId === actorId) {
    return true;
  }
  if (item.ownerActorId === actorId && !item.sourceActorId) {
    return true;
  }
  return false;
}

export function pickWorkItemRecord(input: {
  items: WorkItemRecord[];
  sessionKey?: string | null;
  roomId?: string | null;
  topicKey?: string | null;
  startedAt?: number | null;
}): WorkItemRecord | null {
  const { items, roomId, sessionKey, topicKey, startedAt } = input;
  if (items.length === 0) {
    return null;
  }

  const ranked = [...items]
    .map((item) => ({
      item,
      score: scoreWorkItemMatch({
        item,
        roomId,
        sessionKey,
        topicKey,
        startedAt,
      }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return right.item.updatedAt - left.item.updatedAt;
    });

  if (ranked.length > 0) {
    return ranked[0]?.item ?? null;
  }
  return null;
}

export function pickConversationScopedWorkItem(input: {
  items: WorkItemRecord[];
  conversationStates: ConversationStateRecord[];
  actorId?: string | null;
}): WorkItemRecord | null {
  const { items, conversationStates, actorId } = input;
  if (items.length === 0 || conversationStates.length === 0) {
    return null;
  }

  const itemsById = new Map(items.map((item) => [item.id, item] as const));
  const itemsByWorkKey = new Map(items.map((item) => [item.workKey, item] as const));
  const sortedStates = [...conversationStates].sort((left, right) => right.updatedAt - left.updatedAt);

  for (const state of sortedStates) {
    const matched =
      (state.currentWorkItemId ? itemsById.get(state.currentWorkItemId) : null) ??
      (state.currentWorkKey ? itemsByWorkKey.get(state.currentWorkKey) : null) ??
      null;
    if (!matched) {
      continue;
    }
    if (
      actorId &&
      !matchesWorkItemSourceActor(matched, actorId) &&
      matched.ownerActorId !== actorId &&
      matched.batonActorId !== actorId
    ) {
      continue;
    }
    if (matched.status === "completed" || matched.status === "archived") {
      continue;
    }
    return matched;
  }

  return null;
}

export function buildRoomRecordIdFromWorkItem(workItemId: string): string {
  return `workitem:${normalizeStrategicWorkItemId(workItemId) ?? workItemId}`;
}

export function isRoomBackedWorkItem(item: WorkItemRecord): boolean {
  return typeof item.roomId === "string" && item.roomId.trim().length > 0;
}

export function buildRoundRecord(input: {
  companyId: string;
  title: string;
  preview?: string | null;
  reason?: RoundRecord["reason"];
  workItemId?: string | null;
  roomId?: string | null;
  sourceActorId?: string | null;
  sourceActorLabel?: string | null;
  sourceSessionKey?: string | null;
  sourceConversationId?: string | null;
  providerArchiveId?: string | null;
  providerId?: string | null;
  messages?: RoundMessageSnapshot[];
  archivedAt?: number;
  restorable?: boolean;
}): RoundRecord {
  const archivedAt = input.archivedAt ?? Date.now();
  const normalizedTitle = sanitizeRoundTitle(input.title) || "已归档轮次";
  const normalizedPreview = sanitizeRoundPreview(input.preview);
  const roundIdentity =
    input.workItemId ??
    input.roomId ??
    input.sourceActorId ??
    input.sourceConversationId ??
    input.sourceSessionKey ??
    normalizedTitle;
  return {
    id: `${roundIdentity}@${Math.floor(archivedAt)}`,
    companyId: input.companyId,
    workItemId: input.workItemId ?? null,
    roomId: input.roomId ?? null,
    title: normalizedTitle,
    preview: normalizedPreview,
    reason: input.reason ?? "product",
    sourceActorId: input.sourceActorId ?? null,
    sourceActorLabel: input.sourceActorLabel ?? null,
    sourceSessionKey: input.sourceSessionKey ?? null,
    sourceConversationId: input.sourceConversationId ?? input.sourceSessionKey ?? null,
    providerArchiveId: input.providerArchiveId ?? null,
    providerId: input.providerId ?? null,
    messages: input.messages ?? [],
    archivedAt,
    restorable: input.restorable ?? true,
  };
}

export function touchWorkItemArtifacts(
  workItem: WorkItemRecord,
  artifacts: ArtifactRecord[],
): WorkItemRecord {
  return applyWorkItemDisplayFields({
    ...workItem,
    artifactIds: [...new Set(artifacts.map((artifact) => artifact.id))],
    updatedAt: Math.max(workItem.updatedAt, ...artifacts.map((artifact) => artifact.updatedAt)),
  });
}

export function touchWorkItemDispatches(
  workItem: WorkItemRecord,
  dispatches: DispatchRecord[],
): WorkItemRecord {
  return applyWorkItemDisplayFields({
    ...workItem,
    dispatchIds: [...new Set(dispatches.map((dispatch) => dispatch.id))],
    updatedAt: Math.max(workItem.updatedAt, ...dispatches.map((dispatch) => dispatch.updatedAt)),
  });
}

function isDispatchOpenStatus(status: DispatchRecord["status"]): boolean {
  return status === "pending" || status === "sent" || status === "acknowledged";
}

function isDispatchDoneStatus(status: DispatchRecord["status"]): boolean {
  return status === "answered" || status === "superseded";
}

export function pickLatestRelevantDispatch(
  dispatches: DispatchRecord[],
): DispatchRecord | null {
  if (dispatches.length === 0) {
    return null;
  }
  const ranked = [...dispatches].sort((left, right) => right.updatedAt - left.updatedAt);
  return (
    ranked.find((dispatch) => isDispatchOpenStatus(dispatch.status))
    ?? ranked.find((dispatch) => dispatch.status === "blocked")
    ?? ranked.find((dispatch) => isDispatchDoneStatus(dispatch.status))
    ?? ranked[0]
    ?? null
  );
}

function pickLatestDispatchByStatus(
  dispatches: DispatchRecord[],
  predicate: (status: DispatchRecord["status"]) => boolean,
): DispatchRecord | null {
  return (
    [...dispatches]
      .filter((dispatch) => predicate(dispatch.status))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
  );
}

export function deriveWorkItemFlowFromDispatches(
  workItem: WorkItemRecord,
  dispatches: DispatchRecord[],
): Pick<
  WorkItemRecord,
  "status" | "batonActorId" | "batonLabel" | "nextAction" | "summary" | "updatedAt"
> | null {
  const latestOpenDispatch = pickLatestDispatchByStatus(dispatches, isDispatchOpenStatus);
  const latestBlockedDispatch = pickLatestDispatchByStatus(
    dispatches,
    (status) => status === "blocked",
  );
  const latestAnsweredDispatch = pickLatestDispatchByStatus(dispatches, isDispatchDoneStatus);
  const latestDispatch =
    latestBlockedDispatch &&
    (!latestOpenDispatch || latestBlockedDispatch.updatedAt >= latestOpenDispatch.updatedAt) &&
    (!latestAnsweredDispatch || latestBlockedDispatch.updatedAt >= latestAnsweredDispatch.updatedAt)
      ? latestBlockedDispatch
      : latestAnsweredDispatch &&
          (!latestOpenDispatch || latestAnsweredDispatch.updatedAt > latestOpenDispatch.updatedAt)
        ? latestAnsweredDispatch
        : latestOpenDispatch ?? latestAnsweredDispatch ?? latestBlockedDispatch;
  if (!latestDispatch) {
    return null;
  }

  const primaryTarget = latestDispatch.targetActorIds[0] ?? null;
  const targetLabel =
    latestDispatch.targetActorIds.length > 0
      ? latestDispatch.targetActorIds.join("、")
      : workItem.batonLabel || workItem.ownerLabel;

  if (latestDispatch.status === "blocked") {
    return {
      status: "blocked",
      batonActorId: primaryTarget,
      batonLabel: targetLabel,
      nextAction: latestDispatch.summary || latestDispatch.title || workItem.nextAction,
      summary: latestDispatch.summary || workItem.summary,
      updatedAt: Math.max(workItem.updatedAt, latestDispatch.updatedAt),
    };
  }

  if (isDispatchOpenStatus(latestDispatch.status)) {
    return {
      status: workItem.status === "draft" ? "active" : workItem.status,
      batonActorId: primaryTarget,
      batonLabel: targetLabel,
      nextAction: latestDispatch.summary || latestDispatch.title || workItem.nextAction,
      summary:
        latestDispatch.status === "acknowledged"
          ? `${targetLabel} 已接单，等待回复。`
          : `${targetLabel} 正在处理当前派单。`,
      updatedAt: Math.max(workItem.updatedAt, latestDispatch.updatedAt),
    };
  }

  if (latestDispatch.status === "answered") {
    return {
      status: workItem.completedAt ? "completed" : "waiting_owner",
      batonActorId: workItem.ownerActorId ?? null,
      batonLabel: workItem.ownerLabel || "负责人",
      nextAction: "负责人收口并决定下一步。",
      summary: `${targetLabel} 已回传结果，等待负责人收口。`,
      updatedAt: Math.max(workItem.updatedAt, latestDispatch.updatedAt),
    };
  }

  return {
    status: workItem.status,
    batonActorId: workItem.batonActorId ?? primaryTarget,
    batonLabel: workItem.batonLabel || targetLabel,
    nextAction: workItem.nextAction,
    summary: workItem.summary,
    updatedAt: Math.max(workItem.updatedAt, latestDispatch.updatedAt),
  };
}
