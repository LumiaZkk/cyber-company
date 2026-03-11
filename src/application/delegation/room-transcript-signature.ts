import type { ChatMessage } from "../gateway";
import type { RequirementRoomMessage, RequirementRoomRecord } from "../../domain";
import { dedupeAgentIds } from "../assignment/room-members";

function buildRoomMessageSignature(message: RequirementRoomMessage): string {
  return [
    message.role,
    message.sourceSessionKey ?? "",
    message.senderAgentId ?? "",
    message.timestamp,
    message.text,
    JSON.stringify(message.content ?? null),
    [...(message.audienceAgentIds ?? [])].sort().join(","),
  ].join("|");
}

function buildRoomTranscriptSignature(transcript: RequirementRoomMessage[]): string {
  return transcript.map((message) => buildRoomMessageSignature(message)).join("\n");
}

function buildRoomMembersSignature(room: RequirementRoomRecord): string {
  return [...room.memberIds].sort().join(",");
}

export function buildRequirementRoomRecordSignature(
  room: RequirementRoomRecord | null | undefined,
): string | null {
  if (!room) {
    return null;
  }
  return [
    room.id,
    room.title,
    room.headline ?? "",
    room.topicKey ?? "",
    room.scope ?? "company",
    room.ownerAgentId ?? "",
    room.sessionKey,
    buildRoomMembersSignature(room),
    room.status,
    room.progress ?? "",
    room.lastConclusionAt ?? "",
    buildRoomTranscriptSignature(room.transcript),
  ].join("::");
}

export function areRequirementRoomRecordsEquivalent(
  left: RequirementRoomRecord | null | undefined,
  right: RequirementRoomRecord | null | undefined,
): boolean {
  return buildRequirementRoomRecordSignature(left) === buildRequirementRoomRecordSignature(right);
}

function normalizeRoomAudienceIds(value: unknown): string[] {
  return Array.isArray(value)
    ? dedupeAgentIds(value.map((agentId) => String(agentId ?? "")))
    : [];
}

function roomAudienceIdsEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeRoomAudienceIds(left);
  const normalizedRight = normalizeRoomAudienceIds(right);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((agentId, index) => agentId === normalizedRight[index]);
}

export function areRequirementRoomChatMessagesEqual(
  left: ChatMessage[],
  right: ChatMessage[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const candidate = right[index];
    if (!candidate) {
      return false;
    }
    return (
      message.role === candidate.role &&
      message.roomAgentId === candidate.roomAgentId &&
      message.roomSessionKey === candidate.roomSessionKey &&
      message.timestamp === candidate.timestamp &&
      message.text === candidate.text &&
      JSON.stringify(message.content ?? null) === JSON.stringify(candidate.content ?? null) &&
      roomAudienceIdsEqual(message.roomAudienceAgentIds, candidate.roomAudienceAgentIds)
    );
  });
}
