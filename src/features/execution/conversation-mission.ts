import type {
  ConversationMissionRecord,
  ConversationMissionStepRecord,
} from "../company/types";

type BuildConversationMissionRecordInput = {
  sessionKey: string;
  topicKey?: string | null;
  roomId?: string | null;
  startedAt?: number | null;
  title: string;
  statusLabel: string;
  progressLabel: string;
  ownerAgentId?: string | null;
  ownerLabel: string;
  currentStepLabel: string;
  nextAgentId?: string | null;
  nextLabel: string;
  summary: string;
  guidance: string;
  completed: boolean;
  updatedAt: number;
  planSteps: ConversationMissionStepRecord[];
};

function normalizeMissionId(input: {
  sessionKey: string;
  topicKey?: string | null;
  roomId?: string | null;
  startedAt?: number | null;
}): string {
  if (input.topicKey?.trim() && !input.topicKey.trim().startsWith("chapter:")) {
    return `topic:${input.topicKey.trim()}`;
  }
  const roundSuffix =
    typeof input.startedAt === "number" && Number.isFinite(input.startedAt) && input.startedAt > 0
      ? `@${Math.floor(input.startedAt)}`
      : "";
  if (input.topicKey?.trim()) {
    return `topic:${input.topicKey.trim()}${roundSuffix}`;
  }
  if (input.roomId?.trim()) {
    return `room:${input.roomId.trim()}${roundSuffix}`;
  }
  return `session:${input.sessionKey.trim()}${roundSuffix}`;
}

export function buildConversationMissionRecord(
  input: BuildConversationMissionRecordInput,
): ConversationMissionRecord {
  return {
    id: normalizeMissionId({
      sessionKey: input.sessionKey,
      topicKey: input.topicKey,
      roomId: input.roomId,
      startedAt: input.startedAt,
    }),
    sessionKey: input.sessionKey,
    topicKey: input.topicKey ?? undefined,
    roomId: input.roomId ?? undefined,
    startedAt: input.startedAt ?? undefined,
    title: input.title,
    statusLabel: input.statusLabel,
    progressLabel: input.progressLabel,
    ownerAgentId: input.ownerAgentId ?? null,
    ownerLabel: input.ownerLabel,
    currentStepLabel: input.currentStepLabel,
    nextAgentId: input.nextAgentId ?? null,
    nextLabel: input.nextLabel,
    summary: input.summary,
    guidance: input.guidance,
    completed: input.completed,
    updatedAt: input.updatedAt,
    planSteps: input.planSteps,
  };
}

function missionMatchesTopic(mission: ConversationMissionRecord, topicKey: string | null | undefined): boolean {
  if (!topicKey) {
    return false;
  }
  return mission.topicKey === topicKey;
}

function missionMatchesRound(
  mission: ConversationMissionRecord,
  startedAt: number | null | undefined,
): boolean {
  if (!startedAt || !mission.startedAt) {
    return false;
  }
  return mission.startedAt >= startedAt - 1_000;
}

function scoreMissionMatch(input: {
  mission: ConversationMissionRecord;
  sessionKey?: string | null;
  roomId?: string | null;
  topicKey?: string | null;
  startedAt?: number | null;
}): number {
  const { mission, roomId, sessionKey, topicKey, startedAt } = input;
  let score = 0;
  if (topicKey && missionMatchesTopic(mission, topicKey)) {
    score += 100;
  }
  if (startedAt && missionMatchesRound(mission, startedAt)) {
    score += 60;
  }
  if (roomId && mission.roomId === roomId) {
    score += 40;
  }
  if (sessionKey && mission.sessionKey === sessionKey) {
    score += 20;
  }
  if (!mission.completed) {
    score += 5;
  }
  return score;
}

export function pickConversationMissionRecord(input: {
  missions: ConversationMissionRecord[];
  sessionKey?: string | null;
  roomId?: string | null;
  topicKey?: string | null;
  startedAt?: number | null;
}): ConversationMissionRecord | null {
  const { missions, roomId, sessionKey, topicKey, startedAt } = input;
  if (missions.length === 0) {
    return null;
  }

  const ranked = [...missions]
    .map((mission) => ({
      mission,
      score: scoreMissionMatch({
        mission,
        roomId,
        sessionKey,
        topicKey,
        startedAt,
      }),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return right.mission.updatedAt - left.mission.updatedAt;
    });

  if (ranked.length > 0) {
    return ranked[0]?.mission ?? null;
  }

  return missions[0] ?? null;
}
