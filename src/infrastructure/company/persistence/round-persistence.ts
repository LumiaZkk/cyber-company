import { parseAgentIdFromSessionKey } from "../../../lib/sessions";
import {
  buildStableStrategicTopicKey,
  buildRoomRecordIdFromWorkItem,
  normalizeProductWorkItemIdentity,
} from "../../../application/mission/work-item";
import {
  buildTruthComparableText,
  isInternalAssistantMonologueText,
  isSyntheticWorkflowPromptText,
  isTruthMirrorNoiseText,
  normalizeTruthText,
} from "../../../application/mission/message-truth";
import type { RoundMessageSnapshot, RoundRecord } from "./types";

const ROUND_LIMIT = 80;
const roundCache = new Map<string, RoundRecord[]>();
function isRoundRecord(value: unknown): value is RoundRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RoundRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.companyId === "string" &&
    typeof candidate.title === "string" &&
    (typeof candidate.preview === "string" || candidate.preview == null) &&
    (typeof candidate.sourceActorId === "string" || candidate.sourceActorId == null) &&
    (typeof candidate.sourceActorLabel === "string" || candidate.sourceActorLabel == null) &&
    (typeof candidate.sourceSessionKey === "string" || candidate.sourceSessionKey == null) &&
    (typeof candidate.sourceConversationId === "string" || candidate.sourceConversationId == null) &&
    typeof candidate.archivedAt === "number" &&
    Array.isArray(candidate.messages) &&
    candidate.messages.every(isRoundMessageSnapshot) &&
    typeof candidate.restorable === "boolean"
  );
}

function isRoundMessageSnapshot(value: unknown): value is RoundMessageSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RoundMessageSnapshot>;
  return (
    (candidate.role === "user" ||
      candidate.role === "assistant" ||
      candidate.role === "system" ||
      candidate.role === "toolResult") &&
    typeof candidate.text === "string" &&
    typeof candidate.timestamp === "number"
  );
}

function normalizeRoundField(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function buildRoundMessageFingerprint(messages: RoundMessageSnapshot[]): string {
  if (messages.length === 0) {
    return "";
  }
  const first = buildTruthComparableText(messages[0]?.text ?? "");
  const last = buildTruthComparableText(messages[messages.length - 1]?.text ?? "");
  return [messages.length, first, last].join("::");
}

function buildRoundSemanticKey(round: RoundRecord): string {
  const scope =
    round.workItemId?.trim() ||
    round.roomId?.trim() ||
    round.sourceActorId?.trim() ||
    round.sourceConversationId?.trim() ||
    round.sourceSessionKey?.trim() ||
    "global";
  const title = normalizeRoundField(round.title);
  const preview = normalizeRoundField(round.preview);
  const reason = round.reason ?? "product";
  const messages = buildRoundMessageFingerprint(round.messages);
  return [scope, title, preview, reason, messages].join("::");
}

function sanitizeRoundMessageSnapshots(messages: RoundMessageSnapshot[]): RoundMessageSnapshot[] {
  const cleaned = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      ...message,
      text: normalizeTruthText(message.text),
    }))
    .filter((message) => {
      if (!message.text) {
        return false;
      }
      if (isTruthMirrorNoiseText(message.text) || isSyntheticWorkflowPromptText(message.text)) {
        return false;
      }
      if (message.role === "assistant" && isInternalAssistantMonologueText(message.text)) {
        return false;
      }
      return true;
    });

  const deduped: RoundMessageSnapshot[] = [];
  for (const message of cleaned) {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      previous.role === message.role &&
      previous.text === message.text &&
      Math.abs(previous.timestamp - message.timestamp) <= 120_000
    ) {
      deduped[deduped.length - 1] = message.timestamp >= previous.timestamp ? message : previous;
      continue;
    }
    deduped.push(message);
  }
  return deduped;
}

export function sanitizeRoundRecords(rounds: RoundRecord[]): RoundRecord[] {
  const dedupedById = new Map<string, RoundRecord>();
  for (const round of rounds) {
    if (!isRoundRecord(round)) {
      continue;
    }
    // Compatibility-only migration: old rounds may still only know the provider
    // conversation/session key. UI no longer depends on this path, but we keep
    // it here so previously archived rounds remain attributable after upgrade.
    const sourceActorId =
      round.sourceActorId
      ?? parseAgentIdFromSessionKey(round.sourceConversationId ?? "")
      ?? parseAgentIdFromSessionKey(round.sourceSessionKey ?? "")
      ?? null;
    const normalizedIdentity = normalizeProductWorkItemIdentity({
      workItemId: round.workItemId,
      title: round.title,
    });
    const stableStrategicTopicKey =
      (normalizedIdentity.topicKey ?? "").startsWith("mission:")
        ? buildStableStrategicTopicKey({
            topicKey: normalizedIdentity.topicKey,
            title: round.title,
          })
        : null;
    const normalizedWorkItemId = stableStrategicTopicKey
      ? `topic:${stableStrategicTopicKey}`
      : normalizedIdentity.workItemId ?? round.workItemId ?? null;
    const normalizedRound: RoundRecord = {
      ...round,
      sourceActorId,
      sourceActorLabel: round.sourceActorLabel ?? sourceActorId ?? null,
      sourceConversationId: round.sourceConversationId ?? round.sourceSessionKey ?? null,
      workItemId: normalizedWorkItemId,
      roomId:
        (normalizedWorkItemId
          ? buildRoomRecordIdFromWorkItem(
              normalizedWorkItemId,
            )
          : round.roomId) ?? null,
      messages: sanitizeRoundMessageSnapshots(round.messages),
    };
    const previous = dedupedById.get(round.id);
    if (!previous || normalizedRound.archivedAt >= previous.archivedAt) {
      dedupedById.set(round.id, normalizedRound);
    }
  }
  const dedupedByMeaning = new Map<string, RoundRecord>();
  for (const round of dedupedById.values()) {
    const semanticKey = buildRoundSemanticKey(round);
    const previous = dedupedByMeaning.get(semanticKey);
    if (!previous || round.archivedAt >= previous.archivedAt) {
      dedupedByMeaning.set(semanticKey, round);
    }
  }
  return [...dedupedByMeaning.values()].sort((left, right) => right.archivedAt - left.archivedAt);
}

export function loadRoundRecords(companyId: string | null | undefined): RoundRecord[] {
  if (!companyId) {
    return [];
  }
  return roundCache.get(companyId) ?? [];
}

export function persistRoundRecords(companyId: string | null | undefined, rounds: RoundRecord[]) {
  if (!companyId) {
    return;
  }

  const trimmed = sanitizeRoundRecords(rounds)
    .slice(0, ROUND_LIMIT);
  roundCache.set(companyId, trimmed);
}

export function clearRoundRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  roundCache.delete(companyId);
}
