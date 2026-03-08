import type { HandoffRecord } from "../company/types";
import { inferRequestTopicKey } from "../requests/topic";

function resolveHandoffTimestamp(handoff: HandoffRecord): number {
  return handoff.updatedAt ?? handoff.sourceMessageTs ?? handoff.createdAt;
}

export function inferHandoffTopicKey(handoff: HandoffRecord): string | null {
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

export function getActiveHandoffs(handoffs: HandoffRecord[]): HandoffRecord[] {
  const latestCompletedByTopic = new Map<string, number>();

  handoffs.forEach((handoff) => {
    if (handoff.status !== "completed") {
      return;
    }
    const topic = inferHandoffTopicKey(handoff);
    if (!topic) {
      return;
    }
    const key = `${handoff.sessionKey}:${topic}`;
    const timestamp = resolveHandoffTimestamp(handoff);
    if (timestamp > (latestCompletedByTopic.get(key) ?? 0)) {
      latestCompletedByTopic.set(key, timestamp);
    }
  });

  return handoffs.filter((handoff) => {
    if (handoff.status === "completed") {
      return true;
    }
    const topic = inferHandoffTopicKey(handoff);
    if (!topic) {
      return true;
    }
    const latestCompletedAt = latestCompletedByTopic.get(`${handoff.sessionKey}:${topic}`);
    if (!latestCompletedAt) {
      return true;
    }
    return resolveHandoffTimestamp(handoff) >= latestCompletedAt;
  });
}
