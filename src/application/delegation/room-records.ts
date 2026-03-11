import type {
  Company,
  RoomConversationBindingRecord,
  RequirementRoomMessage,
  RequirementRoomRecord,
} from "../../domain";
import type { ChatMessage } from "../gateway";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import { dedupeAgentIds, sortRequirementRoomMemberIds } from "../assignment/room-members";
import { buildRoomRecordIdFromWorkItem } from "../mission/work-item";
import {
  annotateRequirementRoomMessage,
  areRequirementRoomRecordsEquivalent,
  buildRequirementRoomRecordSignature,
  convertRequirementRoomRecordToChatMessages,
  createIncomingRequirementRoomMessage,
  extractRequirementRoomText,
  isVisibleRequirementRoomMessage,
  mergeRequirementRoomTranscript,
  normalizeSnapshotChatRole,
} from "./room-transcript";

function normalizeRoomTopicKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function buildRequirementRoomState(input: {
  title: string;
  transcript: RequirementRoomMessage[];
}): Pick<RequirementRoomRecord, "headline" | "status" | "progress" | "lastConclusionAt"> {
  const visibleTranscript = input.transcript.filter((message) => isVisibleRequirementRoomMessage(message));
  const assistantReplies = visibleTranscript.filter((message) => message.role === "assistant");
  const userMessages = visibleTranscript.filter((message) => message.role === "user");
  const latestConclusionAt =
    assistantReplies.reduce((latest, message) => Math.max(latest, message.timestamp), 0) || null;

  if (visibleTranscript.length === 0) {
    return {
      headline: input.title.trim() || "需求团队",
      status: "active",
      progress: "0 条可见消息",
      lastConclusionAt: null,
    };
  }

  if (assistantReplies.length > 0) {
    return {
      headline: input.title.trim() || "需求团队",
      status: "active",
      progress: `${assistantReplies.length} 条结论回传`,
      lastConclusionAt: latestConclusionAt,
    };
  }

  return {
    headline: input.title.trim() || "需求团队",
    status: "active",
    progress: `${userMessages.length} 条房间消息`,
    lastConclusionAt: null,
  };
}

export function buildRequirementRoomRecord(input: {
  companyId?: string;
  workItemId?: string | null;
  sessionKey: string;
  title: string;
  memberIds: string[];
  ownerAgentId?: string | null;
  topicKey?: string | null;
  scope?: RequirementRoomRecord["scope"];
  transcript?: RequirementRoomMessage[];
  createdAt?: number;
  updatedAt?: number;
  lastSourceSyncAt?: number;
  providerId?: string;
}): RequirementRoomRecord {
  const now = input.updatedAt ?? Date.now();
  const workItemId = input.workItemId?.trim() || undefined;
  const roomId = workItemId ? buildRoomRecordIdFromWorkItem(workItemId) : input.sessionKey;
  const memberIds = sortRequirementRoomMemberIds(input.memberIds);
  const transcript = mergeRequirementRoomTranscript(input.transcript ?? []);
  const state = buildRequirementRoomState({
    title: input.title,
    transcript,
  });
  return {
    id: roomId,
    companyId: input.companyId,
    workItemId,
    sessionKey: input.sessionKey,
    title: input.title.trim() || "需求团队",
    headline: state.headline,
    topicKey: normalizeRoomTopicKey(input.topicKey) ?? undefined,
    scope: input.scope ?? "company",
    ownerActorId: input.ownerAgentId ?? null,
    batonActorId: null,
    memberActorIds: memberIds,
    status: state.status,
    progress: state.progress,
    lastConclusionAt: state.lastConclusionAt,
    memberIds,
    ownerAgentId: input.ownerAgentId ?? null,
    transcript,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    lastSourceSyncAt: input.lastSourceSyncAt,
  };
}

export function buildRequirementRoomRecordFromSessions(input: {
  company: Company | null | undefined;
  companyId?: string;
  workItemId?: string | null;
  sessionKey: string;
  title: string;
  memberIds: string[];
  ownerAgentId?: string | null;
  topicKey?: string | null;
  scope?: RequirementRoomRecord["scope"];
  seedTranscript?: RequirementRoomMessage[];
  sessions: Array<{ sessionKey: string; agentId: string; messages: ChatMessage[] }>;
  providerId?: string;
}): RequirementRoomRecord {
  const transcript = mergeRequirementRoomTranscript([
    ...(input.seedTranscript ?? []),
    ...input.sessions.flatMap((session) =>
      session.messages
        .map((message) =>
          createIncomingRequirementRoomMessage({
            company: input.company,
            message,
            sessionKey: session.sessionKey,
            agentId: session.agentId,
            roomId: input.workItemId?.trim()
              ? buildRoomRecordIdFromWorkItem(input.workItemId.trim())
              : input.sessionKey,
            ownerAgentId: input.ownerAgentId,
          }),
        )
        .filter((message): message is RequirementRoomMessage => Boolean(message)),
    ),
  ]);

  const latestTimestamp = transcript.reduce((latest, message) => Math.max(latest, message.timestamp), 0);
  const effectiveUpdatedAt = latestTimestamp || Date.now();

  return buildRequirementRoomRecord({
    companyId: input.companyId ?? input.company?.id,
    workItemId: input.workItemId,
    sessionKey: input.sessionKey,
    title: input.title,
    memberIds: input.memberIds,
    ownerAgentId: input.ownerAgentId,
    topicKey: input.topicKey,
    scope: input.scope,
    transcript,
    updatedAt: effectiveUpdatedAt,
    lastSourceSyncAt: latestTimestamp || undefined,
    providerId: input.providerId,
  });
}

export function buildRequirementRoomRecordFromSnapshots(input: {
  company: Company | null | undefined;
  companyId?: string;
  workItemId?: string | null;
  sessionKey: string;
  title: string;
  memberIds: string[];
  ownerAgentId?: string | null;
  topicKey?: string | null;
  scope?: RequirementRoomRecord["scope"];
  startedAt?: number | null;
  seedTranscript?: RequirementRoomMessage[];
  snapshots: RequirementSessionSnapshot[];
}): RequirementRoomRecord {
  const transcript = mergeRequirementRoomTranscript([
    ...(input.seedTranscript ?? []),
    ...input.snapshots.flatMap((snapshot) =>
      snapshot.messages
        .filter((message) => {
          if (typeof input.startedAt === "number" && input.startedAt > 0) {
            return message.timestamp >= input.startedAt - 60_000;
          }
          return true;
        })
        .map((message) =>
          createIncomingRequirementRoomMessage({
            company: input.company,
            message: {
              role: normalizeSnapshotChatRole(message.role),
              text: message.text,
              content: [{ type: "text", text: message.text }],
              timestamp: message.timestamp,
            } satisfies ChatMessage,
            sessionKey: snapshot.sessionKey,
            agentId: snapshot.agentId,
            roomId: input.workItemId?.trim()
              ? buildRoomRecordIdFromWorkItem(input.workItemId.trim())
              : input.sessionKey,
            ownerAgentId: input.ownerAgentId,
          }),
        )
        .filter((message): message is RequirementRoomMessage => Boolean(message)),
    ),
  ]);

  const latestTimestamp = Math.max(
    ...input.snapshots.map((snapshot) => snapshot.updatedAt),
    ...transcript.map((message) => message.timestamp),
    0,
  );

  return buildRequirementRoomRecord({
    companyId: input.companyId ?? input.company?.id,
    workItemId: input.workItemId,
    sessionKey: input.sessionKey,
    title: input.title,
    memberIds: input.memberIds,
    ownerAgentId: input.ownerAgentId,
    topicKey: input.topicKey,
    scope: input.scope,
    transcript,
    updatedAt: latestTimestamp || Date.now(),
    lastSourceSyncAt: latestTimestamp || undefined,
  });
}

export function mergeRequirementRoomRecordFromSessions(input: {
  company: Company | null | undefined;
  room: RequirementRoomRecord | null | undefined;
  companyId?: string;
  workItemId?: string | null;
  sessionKey: string;
  title: string;
  memberIds: string[];
  ownerAgentId?: string | null;
  topicKey?: string | null;
  scope?: RequirementRoomRecord["scope"];
  sessions: Array<{ sessionKey: string; agentId: string; messages: ChatMessage[] }>;
  providerId?: string;
}): RequirementRoomRecord {
  const existingRoom = input.room ?? null;
  const syncFloor = Math.max(0, (existingRoom?.lastSourceSyncAt ?? 0) - 5_000);
  const incomingMessages = input.sessions.flatMap((session) =>
    session.messages
      .filter((message) => {
        const timestamp = typeof message.timestamp === "number" ? message.timestamp : 0;
        return timestamp <= 0 || timestamp >= syncFloor;
      })
      .map((message) =>
        createIncomingRequirementRoomMessage({
          company: input.company,
          message,
          sessionKey: session.sessionKey,
          agentId: session.agentId,
          roomId:
            existingRoom?.workItemId ?? input.workItemId
              ? buildRoomRecordIdFromWorkItem((existingRoom?.workItemId ?? input.workItemId)!.trim())
              : input.sessionKey,
          ownerAgentId: existingRoom?.ownerAgentId ?? input.ownerAgentId,
        }),
      )
      .filter((message): message is RequirementRoomMessage => Boolean(message)),
  );
  const transcript = mergeRequirementRoomTranscript([
    ...(existingRoom?.transcript ?? []),
    ...incomingMessages,
  ]);
  const latestSourceTimestamp = incomingMessages.reduce(
    (latest, message) => Math.max(latest, message.timestamp),
    existingRoom?.lastSourceSyncAt ?? 0,
  );
  const updatedAt = transcript.reduce(
    (latest, message) => Math.max(latest, message.timestamp),
    existingRoom?.updatedAt ?? Date.now(),
  );

  return buildRequirementRoomRecord({
    companyId: input.companyId ?? input.company?.id ?? existingRoom?.companyId,
    workItemId: existingRoom?.workItemId ?? input.workItemId,
    sessionKey: input.sessionKey,
    title: existingRoom?.title ?? input.title,
    memberIds: dedupeAgentIds([...(existingRoom?.memberIds ?? []), ...input.memberIds]),
    ownerAgentId: existingRoom?.ownerAgentId ?? input.ownerAgentId,
    topicKey: existingRoom?.topicKey ?? input.topicKey,
    scope: existingRoom?.scope ?? input.scope,
    transcript,
    createdAt: existingRoom?.createdAt,
    updatedAt,
    lastSourceSyncAt: latestSourceTimestamp || existingRoom?.lastSourceSyncAt,
    providerId: input.providerId,
  });
}

export function mergeRequirementRoomRecordFromSnapshots(input: {
  company: Company | null | undefined;
  room: RequirementRoomRecord | null | undefined;
  companyId?: string;
  workItemId?: string | null;
  sessionKey: string;
  title: string;
  memberIds: string[];
  ownerAgentId?: string | null;
  topicKey?: string | null;
  scope?: RequirementRoomRecord["scope"];
  startedAt?: number | null;
  snapshots: RequirementSessionSnapshot[];
}): RequirementRoomRecord {
  const existingRoom = input.room ?? null;
  const syncFloor = Math.max(0, (existingRoom?.lastSourceSyncAt ?? 0) - 5_000);
  const incomingMessages = input.snapshots.flatMap((snapshot) =>
    snapshot.messages
      .filter((message) => {
        if (typeof input.startedAt === "number" && input.startedAt > 0 && message.timestamp < input.startedAt - 60_000) {
          return false;
        }
        return message.timestamp <= 0 || message.timestamp >= syncFloor;
      })
      .map((message) =>
        createIncomingRequirementRoomMessage({
          company: input.company,
          message: {
            role: normalizeSnapshotChatRole(message.role),
            text: message.text,
            content: [{ type: "text", text: message.text }],
            timestamp: message.timestamp,
          } satisfies ChatMessage,
          sessionKey: snapshot.sessionKey,
          agentId: snapshot.agentId,
          roomId:
            existingRoom?.workItemId ?? input.workItemId
              ? buildRoomRecordIdFromWorkItem((existingRoom?.workItemId ?? input.workItemId)!.trim())
              : input.sessionKey,
          ownerAgentId: existingRoom?.ownerAgentId ?? input.ownerAgentId,
        }),
      )
      .filter((message): message is RequirementRoomMessage => Boolean(message)),
  );
  const transcript = mergeRequirementRoomTranscript([
    ...(existingRoom?.transcript ?? []),
    ...incomingMessages,
  ]);
  const latestSourceTimestamp = Math.max(
    existingRoom?.lastSourceSyncAt ?? 0,
    ...input.snapshots.map((snapshot) => snapshot.updatedAt),
    ...incomingMessages.map((message) => message.timestamp),
  );
  const updatedAt = Math.max(
    existingRoom?.updatedAt ?? Date.now(),
    ...transcript.map((message) => message.timestamp),
    latestSourceTimestamp,
  );

  return buildRequirementRoomRecord({
    companyId: input.companyId ?? input.company?.id ?? existingRoom?.companyId,
    workItemId: existingRoom?.workItemId ?? input.workItemId,
    sessionKey: input.sessionKey,
    title: existingRoom?.title ?? input.title,
    memberIds: dedupeAgentIds([...(existingRoom?.memberIds ?? []), ...input.memberIds]),
    ownerAgentId: existingRoom?.ownerAgentId ?? input.ownerAgentId,
    topicKey: existingRoom?.topicKey ?? input.topicKey,
    scope: existingRoom?.scope ?? input.scope,
    transcript,
    createdAt: existingRoom?.createdAt,
    updatedAt,
    lastSourceSyncAt: latestSourceTimestamp || existingRoom?.lastSourceSyncAt,
  });
}

export function buildRoomConversationBindingsFromSessions(input: {
  roomId: string;
  providerId?: string | null;
  sessions: Array<{ sessionKey: string; agentId: string }>;
  updatedAt?: number;
}): RoomConversationBindingRecord[] {
  const providerId = input.providerId ?? "unknown";
  const updatedAt = input.updatedAt ?? Date.now();
  return input.sessions.map((session) => ({
    roomId: input.roomId,
    providerId,
    conversationId: session.sessionKey,
    actorId: session.agentId,
    nativeRoom: session.sessionKey.includes(":group:"),
    updatedAt,
  }));
}

export function appendRequirementRoomMessages(input: {
  room: RequirementRoomRecord;
  messages: RequirementRoomMessage[];
  meta?: Partial<Omit<RequirementRoomRecord, "id" | "sessionKey" | "transcript" | "createdAt">>;
}): RequirementRoomRecord {
  const latestTimestamp = input.messages.reduce(
    (latest, message) => Math.max(latest, message.timestamp),
    input.room.updatedAt,
  );

  return {
    ...input.room,
    ...input.meta,
    memberIds: sortRequirementRoomMemberIds([...(input.room.memberIds ?? []), ...(input.meta?.memberIds ?? [])]),
    topicKey: normalizeRoomTopicKey(input.meta?.topicKey) ?? input.room.topicKey,
    transcript: mergeRequirementRoomTranscript([...input.room.transcript, ...input.messages]),
    updatedAt: latestTimestamp,
    lastSourceSyncAt: input.meta?.lastSourceSyncAt ?? input.room.lastSourceSyncAt,
  };
}

export {
  annotateRequirementRoomMessage,
  areRequirementRoomRecordsEquivalent,
  buildRequirementRoomRecordSignature,
  convertRequirementRoomRecordToChatMessages,
  extractRequirementRoomText,
};
