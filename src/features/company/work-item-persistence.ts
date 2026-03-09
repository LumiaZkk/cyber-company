import type { WorkItemRecord, WorkStepRecord, WorkItemStatus } from "./types";
import { isCanonicalProductWorkItemRecord } from "../execution/work-item-signal";
import { isStrategicRequirementTopic } from "../execution/requirement-kind";
import { parseAgentIdFromSessionKey } from "../../lib/sessions";
import {
  applyWorkItemDisplayFields,
  buildRoomRecordIdFromWorkItem,
  buildWorkItemIdentity,
  normalizeStrategicWorkItemId,
} from "../execution/work-item";

const WORK_ITEM_CACHE_PREFIX = "cyber_company_work_items:";
const WORK_ITEM_LIMIT = 64;

function isWorkStepStatus(value: unknown): value is WorkStepRecord["status"] {
  return (
    value === "pending" ||
    value === "active" ||
    value === "done" ||
    value === "blocked" ||
    value === "skipped"
  );
}

function isWorkItemStatus(value: unknown): value is WorkItemStatus {
  return (
    value === "draft" ||
    value === "active" ||
    value === "waiting_review" ||
    value === "waiting_owner" ||
    value === "completed" ||
    value === "blocked" ||
    value === "archived"
  );
}

function isWorkStepRecord(value: unknown): value is WorkStepRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WorkStepRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.assigneeLabel === "string" &&
    isWorkStepStatus(candidate.status) &&
    typeof candidate.updatedAt === "number"
  );
}

function isWorkItemRecord(value: unknown): value is WorkItemRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WorkItemRecord>;
  return (
    typeof candidate.id === "string" &&
    (typeof candidate.workKey === "string" || candidate.workKey == null) &&
    (candidate.kind === "strategic" || candidate.kind === "execution" || candidate.kind === "artifact" || candidate.kind == null) &&
    (typeof candidate.roundId === "string" || candidate.roundId == null) &&
    typeof candidate.companyId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.goal === "string" &&
    (typeof candidate.sourceActorId === "string" || candidate.sourceActorId == null) &&
    (typeof candidate.sourceActorLabel === "string" || candidate.sourceActorLabel == null) &&
    (typeof candidate.sourceSessionKey === "string" || candidate.sourceSessionKey == null) &&
    (typeof candidate.sourceConversationId === "string" || candidate.sourceConversationId == null) &&
    (typeof candidate.providerId === "string" || candidate.providerId == null) &&
    isWorkItemStatus(candidate.status) &&
    (typeof candidate.headline === "string" || candidate.headline == null) &&
    (typeof candidate.displayStage === "string" || candidate.displayStage == null) &&
    (typeof candidate.displaySummary === "string" || candidate.displaySummary == null) &&
    (typeof candidate.displayOwnerLabel === "string" || candidate.displayOwnerLabel == null) &&
    (typeof candidate.displayNextAction === "string" || candidate.displayNextAction == null) &&
    typeof candidate.stageLabel === "string" &&
    typeof candidate.ownerLabel === "string" &&
    typeof candidate.batonLabel === "string" &&
    Array.isArray(candidate.artifactIds) &&
    Array.isArray(candidate.dispatchIds) &&
    Array.isArray(candidate.steps) &&
    candidate.steps.every(isWorkStepRecord) &&
    typeof candidate.startedAt === "number" &&
    typeof candidate.updatedAt === "number" &&
    typeof candidate.summary === "string" &&
    typeof candidate.nextAction === "string"
  );
}

function getWorkItemCacheKey(companyId: string) {
  return `${WORK_ITEM_CACHE_PREFIX}${companyId.trim()}`;
}

function buildStrategicDedupKey(record: WorkItemRecord): string | null {
  if (!record.topicKey || !isStrategicRequirementTopic(record.topicKey)) {
    return null;
  }
  if (record.status === "completed" || record.status === "archived") {
    return null;
  }
  return `${record.companyId}::${record.topicKey}`;
}

function isEphemeralStrategicTopicKey(topicKey: string | null | undefined): boolean {
  const normalized = topicKey?.trim() ?? "";
  if (!normalized.startsWith("mission:")) {
    return false;
  }
  const suffix = normalized.slice("mission:".length);
  return /^[a-z0-9]{5,10}$/i.test(suffix);
}

function isLowSignalStrategicTitle(value: string | null | undefined): boolean {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return true;
  }
  return ["当前规划/任务", "当前任务", "当前需求", "本轮规划/任务", "CEO"].includes(normalized);
}

function isStrategicSourceAnchor(record: WorkItemRecord): boolean {
  if (!record.topicKey || !isStrategicRequirementTopic(record.topicKey)) {
    return false;
  }
  if (record.status === "completed" || record.status === "archived") {
    return false;
  }
  if (!isLowSignalStrategicTitle(record.title)) {
    return true;
  }
  return !isEphemeralStrategicTopicKey(record.topicKey);
}

function buildStrategicSourceGroupKey(record: WorkItemRecord): string | null {
  if (!record.topicKey || !isStrategicRequirementTopic(record.topicKey)) {
    return null;
  }
  if (record.status === "completed" || record.status === "archived") {
    return null;
  }
  const sourceConversationId = record.sourceConversationId?.trim() || record.sessionKey?.trim() || "";
  if (!sourceConversationId) {
    return null;
  }
  return `${record.companyId}::${sourceConversationId}`;
}

function collapseStrategicSourceDrift(records: WorkItemRecord[]): WorkItemRecord[] {
  const groups = new Map<string, WorkItemRecord[]>();
  const passthrough: WorkItemRecord[] = [];

  for (const record of records) {
    const groupKey = buildStrategicSourceGroupKey(record);
    if (!groupKey) {
      passthrough.push(record);
      continue;
    }
    const group = groups.get(groupKey) ?? [];
    group.push(record);
    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    const anchors = group.filter(isStrategicSourceAnchor);
    if (anchors.length > 0) {
      passthrough.push(...anchors);
      continue;
    }
    const fallback = [...group].sort((left, right) => scoreStrategicCanonicalRecord(right) - scoreStrategicCanonicalRecord(left))[0];
    if (fallback) {
      passthrough.push(fallback);
    }
  }

  return passthrough;
}

function scoreStrategicCanonicalRecord(record: WorkItemRecord): number {
  let score = 0;
  if (record.id.startsWith("topic:")) {
    score += 60;
  }
  if (
    record.title.trim().length > 0 &&
    !["当前规划/任务", "当前任务", "当前需求", "本轮规划/任务", "CEO"].includes(record.title.trim())
  ) {
    score += 30;
  }
  if (record.roomId?.trim()) {
    score += 20;
  }
  if (record.status === "waiting_owner") {
    score += 12;
  } else if (record.status === "waiting_review") {
    score += 8;
  } else if (record.status === "active") {
    score += 4;
  }
  score += Math.floor(record.updatedAt / 1000);
  return score;
}

export function sanitizeWorkItemRecords(records: WorkItemRecord[]): WorkItemRecord[] {
  const deduped = new Map<string, WorkItemRecord>();
  for (const record of records) {
    if (!isWorkItemRecord(record) || !isCanonicalProductWorkItemRecord(record)) {
      continue;
    }

    const normalizedIdentity = buildWorkItemIdentity({
      topicKey: record.topicKey,
      title: record.title,
      fallbackId: normalizeStrategicWorkItemId(record.id) ?? record.id,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
    });
    const normalizedRecord = applyWorkItemDisplayFields({
      ...record,
      ...normalizedIdentity,
      topicKey: normalizedIdentity.topicKey ?? undefined,
      sourceActorId:
        record.sourceActorId ??
        parseAgentIdFromSessionKey(record.sourceConversationId ?? "") ??
        parseAgentIdFromSessionKey(record.sourceSessionKey ?? "") ??
        record.ownerActorId ??
        null,
      roomId:
        record.roomId && record.roomId.trim().length > 0
          ? (record.workKey || record.kind === "strategic")
            ? buildRoomRecordIdFromWorkItem(
                normalizeStrategicWorkItemId(record.id) ?? record.id,
              )
            : record.roomId
          : buildRoomRecordIdFromWorkItem(normalizeStrategicWorkItemId(record.id) ?? record.id),
    });

    const previous = deduped.get(normalizedRecord.id);
    if (!previous || normalizedRecord.updatedAt >= previous.updatedAt) {
      deduped.set(normalizedRecord.id, normalizedRecord);
    }
  }
  const byStrategicKey = new Map<string, WorkItemRecord>();
  const passthrough: WorkItemRecord[] = [];

  for (const record of deduped.values()) {
    const strategicKey = buildStrategicDedupKey(record);
    if (!strategicKey) {
      passthrough.push(record);
      continue;
    }
    const previous = byStrategicKey.get(strategicKey);
    if (!previous || scoreStrategicCanonicalRecord(record) >= scoreStrategicCanonicalRecord(previous)) {
      byStrategicKey.set(strategicKey, record);
    }
  }

  return collapseStrategicSourceDrift([...passthrough, ...byStrategicKey.values()])
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function loadWorkItemRecords(companyId: string | null | undefined): WorkItemRecord[] {
  if (!companyId) {
    return [];
  }

  const raw = localStorage.getItem(getWorkItemCacheKey(companyId));
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return sanitizeWorkItemRecords(parsed.filter(isWorkItemRecord));
  } catch {
    return [];
  }
}

export function persistWorkItemRecords(
  companyId: string | null | undefined,
  records: WorkItemRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = sanitizeWorkItemRecords(records)
    .slice(0, WORK_ITEM_LIMIT);
  localStorage.setItem(getWorkItemCacheKey(companyId), JSON.stringify(trimmed));
}

export function clearWorkItemRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  localStorage.removeItem(getWorkItemCacheKey(companyId));
}
