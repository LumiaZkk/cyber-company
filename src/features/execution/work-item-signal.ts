import type { WorkItemRecord } from "../company/types";
import type { RequirementExecutionOverview } from "./requirement-overview";
import { getRequirementTopicKind, isArtifactRequirementTopic, isStrategicRequirementTopic } from "./requirement-kind";
import {
  buildStableStrategicTopicKey,
  isRoomBackedWorkItem,
  matchesWorkItemSourceActor,
} from "./work-item";

const LOW_SIGNAL_TITLES = new Set(["当前需求", "当前战略任务", "当前任务", "本次需求"]);

function normalizeSignalText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function isJsonLikeFragment(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/^[{\[]/.test(trimmed) || /^[}\]]$/.test(trimmed)) {
    return true;
  }
  if (/^"[^"]+"\s*:/.test(trimmed)) {
    return true;
  }
  if (/^"count"\s*:/.test(trimmed) || /^"[^"]+",?$/.test(trimmed)) {
    return true;
  }
  if (/^[\[{].*[\]}]$/.test(trimmed) && !/[\u4e00-\u9fa5A-Za-z]{2,}/.test(trimmed)) {
    return true;
  }
  return false;
}

function looksLikeMetadataNoise(value: string): boolean {
  const normalized = normalizeSignalText(value);
  if (!normalized) {
    return true;
  }
  if (isJsonLikeFragment(normalized)) {
    return true;
  }
  if (/^系统执行|^系统回执|^SESSIONS_[A-Z_]+/.test(normalized)) {
    return true;
  }
  if (/^恢复中$|^正在恢复当前需求$/.test(normalized)) {
    return true;
  }
  return false;
}

function isLowSignalTitle(title: string): boolean {
  const normalized = normalizeSignalText(title);
  if (!normalized) {
    return true;
  }
  if (LOW_SIGNAL_TITLES.has(normalized)) {
    return true;
  }
  return isJsonLikeFragment(normalized);
}

function hasHighSignalNarrative(value: string): boolean {
  const normalized = normalizeSignalText(value);
  if (!normalized || looksLikeMetadataNoise(normalized)) {
    return false;
  }
  if (normalized.length >= 18) {
    return true;
  }
  return /CEO|CTO|COO|写手|审校|主编|章节|方案|阅读|一致性|发布|阶段|下一步/.test(normalized);
}

function countMatches(value: string | null | undefined, patterns: RegExp[]): number {
  const normalized = normalizeSignalText(value);
  if (!normalized) {
    return 0;
  }
  return patterns.reduce((count, pattern) => count + Number(pattern.test(normalized)), 0);
}

function normalizeTopicKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function hasRootSwitchCue(value: string | null | undefined): boolean {
  const normalized = normalizeSignalText(value);
  if (!normalized) {
    return false;
  }
  return [
    /从头开始/u,
    /重新搭建/u,
    /新立项/u,
    /重新规划/u,
    /旧任务.*作废/u,
    /全部作废/u,
    /先别管旧任务/u,
    /搭建.*团队/u,
    /启动.*专项/u,
    /全新方案/u,
  ].some((pattern) => pattern.test(normalized));
}

const STRATEGIC_PATTERNS = [
  /技术方案/,
  /阅读系统/,
  /一致性/,
  /治理/,
  /风险清单/,
  /验收打分表/,
  /交付老板/,
  /流程/,
  /老板/,
  /COO/,
  /CTO/,
  /CEO 立即执行/,
];

const EXECUTION_PATTERNS = [
  /章节/,
  /正文/,
  /写手/,
  /审校/,
  /主编/,
  /终审/,
  /发布/,
  /交稿/,
  /稿件/,
  /chapter/i,
];

function hasTopicKindMismatch(input: {
  topicKey: string | null | undefined;
  title: string | null | undefined;
  stage: string | null | undefined;
  summary: string | null | undefined;
  nextAction: string | null | undefined;
}): boolean {
  const topicKind = getRequirementTopicKind(input.topicKey);
  if (topicKind === "unknown") {
    return false;
  }

  const strategicScore =
    countMatches(input.title, STRATEGIC_PATTERNS) +
    countMatches(input.stage, STRATEGIC_PATTERNS) +
    countMatches(input.summary, STRATEGIC_PATTERNS) +
    countMatches(input.nextAction, STRATEGIC_PATTERNS);
  const executionScore =
    countMatches(input.title, EXECUTION_PATTERNS) +
    countMatches(input.stage, EXECUTION_PATTERNS) +
    countMatches(input.summary, EXECUTION_PATTERNS) +
    countMatches(input.nextAction, EXECUTION_PATTERNS);

  if (topicKind === "chapter") {
    return strategicScore >= 2 && strategicScore > executionScore;
  }
  if (topicKind === "mission") {
    return executionScore >= 3 && executionScore > strategicScore + 1;
  }
  return false;
}

export function isReliableRequirementOverview(
  overview: RequirementExecutionOverview | null | undefined,
): overview is RequirementExecutionOverview {
  if (!overview?.topicKey) {
    return false;
  }
  if (!overview.currentOwnerAgentId && !normalizeSignalText(overview.currentOwnerLabel)) {
    return false;
  }
  if (looksLikeMetadataNoise(overview.headline) || looksLikeMetadataNoise(overview.currentStage)) {
    return false;
  }
  const titleOk = !isLowSignalTitle(overview.title);
  const summaryOk = hasHighSignalNarrative(overview.summary);
  const actionOk = hasHighSignalNarrative(overview.nextAction);
  const hasBrokenParticipantStage = overview.participants.some((participant) => {
    if (participant.isCurrent) {
      return false;
    }
    const stage = normalizeSignalText(participant.stage).replace(/^\d+\.\s*/, "");
    return looksLikeMetadataNoise(stage) || isJsonLikeFragment(stage);
  });
  if (hasBrokenParticipantStage) {
    return false;
  }
  if (!titleOk && !summaryOk && !actionOk) {
    return false;
  }
  if (
    hasTopicKindMismatch({
      topicKey: overview.topicKey,
      title: overview.title,
      stage: overview.currentStage || overview.headline,
      summary: overview.summary,
      nextAction: overview.nextAction,
    })
  ) {
    return false;
  }
  return true;
}

export function isReliableWorkItemRecord(
  workItem: WorkItemRecord | null | undefined,
): workItem is WorkItemRecord {
  if (!workItem?.id) {
    return false;
  }
  if (!workItem.topicKey) {
    return false;
  }
  if (!normalizeSignalText(workItem.ownerLabel) || !normalizeSignalText(workItem.stageLabel)) {
    return false;
  }
  if (isLowSignalTitle(workItem.title)) {
    return false;
  }
  if (looksLikeMetadataNoise(workItem.stageLabel) || looksLikeMetadataNoise(workItem.summary)) {
    return false;
  }
  if (!hasHighSignalNarrative(workItem.nextAction) && !hasHighSignalNarrative(workItem.summary)) {
    return false;
  }
  if (
    hasTopicKindMismatch({
      topicKey: workItem.topicKey,
      title: workItem.title,
      stage: workItem.stageLabel,
      summary: workItem.summary,
      nextAction: workItem.nextAction,
    })
  ) {
    return false;
  }
  return true;
}

export function isCanonicalProductWorkItemRecord(
  workItem: WorkItemRecord | null | undefined,
  sourceActorId?: string | null,
): workItem is WorkItemRecord {
  if (!isReliableWorkItemRecord(workItem)) {
    return false;
  }
  if (isArtifactRequirementTopic(workItem.topicKey)) {
    return false;
  }
  if (isRoomBackedWorkItem(workItem)) {
    return true;
  }
  return sourceActorId ? matchesWorkItemSourceActor(workItem, sourceActorId) : true;
}

export function shouldReplaceLockedStrategicWorkItem(input: {
  lockedWorkItem: WorkItemRecord | null | undefined;
  latestHintText?: string | null;
  latestHintTopicKey?: string | null;
  overview?: RequirementExecutionOverview | null;
}): boolean {
  const lockedWorkItem = input.lockedWorkItem;
  if (!lockedWorkItem || !isStrategicRequirementTopic(lockedWorkItem.topicKey)) {
    return false;
  }

  const lockedTopicKey = normalizeTopicKey(lockedWorkItem.topicKey);
  const overview = input.overview;
  if (overview && isReliableRequirementOverview(overview)) {
    const overviewTopicKey = normalizeTopicKey(overview.topicKey);
    if (overviewTopicKey && lockedTopicKey && overviewTopicKey !== lockedTopicKey) {
      return true;
    }
  }

  const hintedStrategicTopicKey = normalizeTopicKey(
    buildStableStrategicTopicKey({
      topicKey: input.latestHintTopicKey,
      title: input.latestHintText,
    }),
  );
  if (
    hintedStrategicTopicKey &&
    lockedTopicKey &&
    hintedStrategicTopicKey !== lockedTopicKey &&
    hasRootSwitchCue(input.latestHintText)
  ) {
    return true;
  }

  return false;
}

export function shouldPreferReliableStrategicOverview(input: {
  stableWorkItem: WorkItemRecord | null | undefined;
  latestHintText?: string | null;
  latestHintTopicKey?: string | null;
  overview?: RequirementExecutionOverview | null;
}): boolean {
  const stableWorkItem = input.stableWorkItem;
  const overview = input.overview;
  if (!stableWorkItem || !overview || !isReliableRequirementOverview(overview)) {
    return false;
  }
  if (!isStrategicRequirementTopic(overview.topicKey)) {
    return false;
  }

  if (stableWorkItem.kind === "strategic") {
    return shouldReplaceLockedStrategicWorkItem({
      lockedWorkItem: stableWorkItem,
      latestHintText: input.latestHintText,
      latestHintTopicKey: input.latestHintTopicKey,
      overview,
    });
  }

  const stableTopicKind = getRequirementTopicKind(stableWorkItem.topicKey);
  if (stableTopicKind === "chapter" || stableWorkItem.kind === "execution") {
    return true;
  }

  return false;
}
