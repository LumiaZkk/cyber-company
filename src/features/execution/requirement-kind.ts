import type { RequirementParticipantProgress } from "./requirement-overview";

export type RequirementTopicKind = "chapter" | "artifact" | "mission" | "unknown";

export function getRequirementTopicKind(topicKey: string | null | undefined): RequirementTopicKind {
  if (!topicKey) {
    return "unknown";
  }
  if (topicKey.startsWith("chapter:")) {
    return "chapter";
  }
  if (topicKey.startsWith("artifact:")) {
    return "artifact";
  }
  if (topicKey.startsWith("mission:")) {
    return "mission";
  }
  return "unknown";
}

export function isChapterRequirementTopic(topicKey: string | null | undefined): boolean {
  return getRequirementTopicKind(topicKey) === "chapter";
}

export function isArtifactRequirementTopic(topicKey: string | null | undefined): boolean {
  return getRequirementTopicKind(topicKey) === "artifact";
}

export function isStrategicRequirementTopic(topicKey: string | null | undefined): boolean {
  return getRequirementTopicKind(topicKey) === "mission";
}

export function isExecutionRequirementTopic(topicKey: string | null | undefined): boolean {
  const kind = getRequirementTopicKind(topicKey);
  return kind === "chapter" || kind === "artifact";
}

export function isParticipantCompletedStatus(statusLabel: string): boolean {
  return ["已确认", "已交付待下游", "已回复", "已冻结待命", "已交接"].includes(statusLabel);
}

export function isParticipantWaitingStatus(statusLabel: string): boolean {
  return ["待接手", "已就绪待稿", "待回复", "未回复", "已接单", "已接单未推进"].includes(statusLabel);
}

export function isParticipantRunningStatus(statusLabel: string): boolean {
  return ["已开工", "已开工未交付", "部分完成"].includes(statusLabel);
}

export function isParticipantBlockingStatus(statusLabel: string): boolean {
  return ["已阻塞", "交接阻塞", "未回复", "已开工未交付", "已接单未推进"].includes(statusLabel);
}

export function mapRequirementParticipantToExecutionState(
  participant: RequirementParticipantProgress,
): "idle" | "running" | "waiting_peer" | "blocked_timeout" | "completed" {
  if (isParticipantBlockingStatus(participant.statusLabel)) {
    return "blocked_timeout";
  }
  if (isParticipantWaitingStatus(participant.statusLabel)) {
    return "waiting_peer";
  }
  if (isParticipantRunningStatus(participant.statusLabel)) {
    return "running";
  }
  if (isParticipantCompletedStatus(participant.statusLabel)) {
    return "completed";
  }
  return "idle";
}
