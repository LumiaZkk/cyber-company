import {
  buildRequirementRoomRecordSignature,
  buildRoomConversationBindingsFromSessions,
  convertRequirementRoomRecordToChatMessages,
  mergeRequirementRoomRecordFromSessions,
  mergeRequirementRoomRecordFromSnapshots,
} from "../delegation/room-routing";
import { gateway, type ChatMessage } from "../gateway";
import { readLiveChatSession } from "./live-session-cache";
import { roundSnapshotToChatMessage } from "../mission/history/round-restore";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import type {
  RequirementRoomRecord,
  RoomConversationBindingRecord,
} from "../../domain/delegation/types";
import type { RoundRecord } from "../../domain/mission/types";
import type { Company } from "../../domain/org/types";

const CHAT_HISTORY_FETCH_LIMIT = 80;
const CHAT_HISTORY_TIMEOUT_MS = 8_000;

function normalizeMessage(raw: ChatMessage): ChatMessage {
  return {
    ...raw,
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function withTimeoutStatus<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: () => T,
): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<{ value: T; timedOut: boolean }>([
      promise.then((value) => ({ value, timedOut: false })),
      new Promise<{ value: T; timedOut: boolean }>((resolve) => {
        timer = setTimeout(() => resolve({ value: fallback(), timedOut: true }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export type ChatSessionInitializationResult = {
  sessionKey: string | null;
  messages: ChatMessage[] | null;
  lateHistoryMessagesPromise?: Promise<ChatMessage[]> | null;
  roomRecord?: RequirementRoomRecord | null;
  roomRecordSignature?: string | null;
  roomBindings?: RoomConversationBindingRecord[];
  isGenerating?: boolean;
  streamText?: string | null;
  activeRunId?: string | null;
  generationStartedAt?: number | null;
};

export async function initializeChatSession(input: {
  activeCompany: Company | null;
  archiveId: string | null;
  activeArchivedRound: RoundRecord | null;
  effectiveGroupSessionKey: string | null;
  effectiveOwnerAgentId: string | null;
  effectiveRequirementRoom: RequirementRoomRecord | null;
  effectiveRequirementRoomSnapshots: RequirementSessionSnapshot[];
  groupTitle: string;
  groupTopicKey?: string | null;
  groupWorkItemId: string | null;
  historyAgentId: string | null;
  isArchiveView: boolean;
  isGroup: boolean;
  persistedWorkItemStartedAt?: number | null;
  providerId: string;
  requirementRoomSessions: Array<{ sessionKey: string; agentId: string }>;
  requirementRoomTargetAgentIds: string[];
  targetAgentId: string | null;
}) : Promise<ChatSessionInitializationResult> {
  let actualKey = input.effectiveGroupSessionKey;
  if (!actualKey) {
    if (!input.targetAgentId) {
      return {
        sessionKey: null,
        messages: null,
      };
    }
    const result = await gateway.resolveSession(input.targetAgentId);
    if (result.ok && result.key) {
      actualKey = result.key;
    }
  }

  if (!actualKey) {
    return {
      sessionKey: null,
      messages: null,
    };
  }

  if (input.isArchiveView && input.archiveId) {
    if (input.activeArchivedRound) {
      return {
        sessionKey: actualKey,
        messages: input.activeArchivedRound.messages
          .map(roundSnapshotToChatMessage)
          .filter((message): message is ChatMessage => Boolean(message)),
        isGenerating: false,
        streamText: null,
      };
    }
    if (input.historyAgentId) {
      const archive = await gateway.getSessionArchive(
        input.historyAgentId,
        input.archiveId,
        200,
      );
      return {
        sessionKey: actualKey,
        messages: archive.messages || [],
        isGenerating: false,
        streamText: null,
      };
    }
  }

  if (!input.isGroup) {
    const historyPromise = gateway.getChatHistory(actualKey, CHAT_HISTORY_FETCH_LIMIT);
    const { value: history, timedOut } = await withTimeoutStatus(
      historyPromise,
      CHAT_HISTORY_TIMEOUT_MS,
      () => ({
        sessionKey: actualKey,
        messages: [] as ChatMessage[],
      }),
    );
    const liveSession = readLiveChatSession(input.activeCompany?.id, actualKey);
    return {
      sessionKey: actualKey,
      messages: history.messages || [],
      lateHistoryMessagesPromise: timedOut
        ? historyPromise
            .then((result) => result.messages || [])
            .catch(() => [] as ChatMessage[])
        : null,
      isGenerating: liveSession?.isGenerating ?? false,
      streamText: liveSession?.streamText ?? null,
      activeRunId: liveSession?.runId ?? null,
      generationStartedAt: liveSession?.startedAt ?? null,
    };
  }

  const existingRoom = input.effectiveRequirementRoom ?? null;
  const roomBaseInput = {
    company: input.activeCompany,
    companyId: input.activeCompany?.id,
    workItemId: input.groupWorkItemId,
    sessionKey: actualKey,
    title: input.groupTitle,
    memberIds: input.requirementRoomTargetAgentIds,
    ownerAgentId:
      existingRoom?.ownerActorId ??
      existingRoom?.ownerAgentId ??
      input.effectiveOwnerAgentId ??
      input.targetAgentId ??
      null,
    topicKey: input.groupTopicKey ?? null,
    startedAt: input.persistedWorkItemStartedAt ?? null,
  } as const;

  if (input.requirementRoomSessions.length > 0) {
    const histories = await Promise.all(
      input.requirementRoomSessions.map(async (roomSession) => {
        try {
          const history = await withTimeout(
            gateway.getChatHistory(
              roomSession.sessionKey,
              CHAT_HISTORY_FETCH_LIMIT,
            ),
            CHAT_HISTORY_TIMEOUT_MS,
            () => ({
              sessionKey: roomSession.sessionKey,
              messages: [] as ChatMessage[],
            }),
          );
          return {
            sessionKey: roomSession.sessionKey,
            agentId: roomSession.agentId,
            messages: (history.messages || []).map(normalizeMessage),
          };
        } catch {
          return {
            sessionKey: roomSession.sessionKey,
            agentId: roomSession.agentId,
            messages: [],
          };
        }
      }),
    );
    let roomRecord = mergeRequirementRoomRecordFromSessions({
      ...roomBaseInput,
      room: existingRoom,
      sessions: histories,
      providerId: input.providerId,
    });
    if (input.effectiveRequirementRoomSnapshots.length > 0) {
      roomRecord = mergeRequirementRoomRecordFromSnapshots({
        ...roomBaseInput,
        room: roomRecord,
        snapshots: input.effectiveRequirementRoomSnapshots,
      });
    }
    return {
      sessionKey: actualKey,
      roomRecord,
      roomRecordSignature: buildRequirementRoomRecordSignature(roomRecord),
      roomBindings: buildRoomConversationBindingsFromSessions({
        roomId: roomRecord.id,
        providerId: input.providerId,
        sessions: histories,
        updatedAt: roomRecord.updatedAt,
      }),
      messages: convertRequirementRoomRecordToChatMessages(roomRecord),
    };
  }

  if (input.effectiveRequirementRoomSnapshots.length > 0) {
    const roomRecord = mergeRequirementRoomRecordFromSnapshots({
      ...roomBaseInput,
      room: existingRoom,
      snapshots: input.effectiveRequirementRoomSnapshots,
    });
    return {
      sessionKey: actualKey,
      roomRecord,
      roomRecordSignature: buildRequirementRoomRecordSignature(roomRecord),
      roomBindings: buildRoomConversationBindingsFromSessions({
        roomId: roomRecord.id,
        providerId: input.providerId,
        sessions: input.effectiveRequirementRoomSnapshots.map((snapshot) => ({
          sessionKey: snapshot.sessionKey,
          agentId: snapshot.agentId,
        })),
        updatedAt: roomRecord.updatedAt,
      }),
      messages: convertRequirementRoomRecordToChatMessages(roomRecord),
    };
  }

  return {
    sessionKey: actualKey,
    messages: existingRoom ? convertRequirementRoomRecordToChatMessages(existingRoom) : null,
  };
}
