export interface GatewaySessionRow {
  key: string;
  actorId?: string | null;
  kind?: "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  updatedAt?: number | null;
  sessionId?: string;
  abortedLastRun?: boolean;
}

export interface GatewaySessionArchiveRow {
  id: string;
  fileName: string;
  reason: "reset" | "deleted" | "bak";
  archivedAt: number;
  title?: string;
  preview?: string;
}

export interface SessionsListResult {
  ts: number;
  path: string;
  count: number;
  sessions: GatewaySessionRow[];
}

export interface SessionsArchivesListResult {
  ts: number;
  agentId: string;
  archives: GatewaySessionArchiveRow[];
}

export interface SessionsArchivesGetResult {
  ok: true;
  agentId: string;
  archive: GatewaySessionArchiveRow;
  messages: ChatMessage[];
}

export interface SessionsArchivesRestoreResult {
  ok: true;
  key: string;
  restoredFrom: string;
  archivedCurrent: string[];
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "toolResult";
  content?: unknown;
  text?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: ChatMessage;
  errorMessage?: string;
};

export type ChatSendAck = {
  runId: string;
  status: "started" | "in_flight";
};

type SessionsListParams = {
  limit?: number;
  activeMinutes?: number;
  includeGlobal?: boolean;
  includeUnknown?: boolean;
  includeDerivedTitles?: boolean;
  includeLastMessage?: boolean;
  label?: string;
  spawnedBy?: string;
  agentId?: string;
  search?: string;
};

type GatewaySessionRequester = {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
};

function parseSessionActorId(sessionKey: string): string | null {
  if (!sessionKey.startsWith("agent:")) {
    return null;
  }

  const parts = sessionKey.split(":");
  if (parts.length < 3) {
    return null;
  }

  const actorId = parts[1]?.trim();
  return actorId && actorId.length > 0 ? actorId : null;
}

export function buildSessionMethods(gateway: GatewaySessionRequester) {
  return {
    async listSessions(opts?: SessionsListParams): Promise<SessionsListResult> {
      const result = await gateway.request<SessionsListResult>("sessions.list", opts ?? {});
      return {
        ...result,
        sessions: (result.sessions ?? []).map((session) => ({
          ...session,
          actorId:
            typeof session.actorId === "string" && session.actorId.trim().length > 0
              ? session.actorId
              : parseSessionActorId(session.key),
        })),
      };
    },

    async resetSession(
      sessionKey: string,
      reason?: "new" | "reset",
    ): Promise<{ ok: true; key: string }> {
      return gateway.request("sessions.reset", {
        key: sessionKey,
        ...(reason ? { reason } : {}),
      });
    },

    async deleteSession(sessionKey: string): Promise<{ ok: boolean; deleted: boolean }> {
      return gateway.request("sessions.delete", { key: sessionKey });
    },

    async listSessionArchives(
      agentId: string,
      limit?: number,
    ): Promise<SessionsArchivesListResult> {
      return gateway.request("sessions.archives.list", {
        agentId,
        ...(typeof limit === "number" ? { limit } : {}),
      });
    },

    async getSessionArchive(
      agentId: string,
      archiveId: string,
      limit?: number,
    ): Promise<SessionsArchivesGetResult> {
      const result = await gateway.request<{
        ok: true;
        agentId: string;
        archive: GatewaySessionArchiveRow;
        messages?: ChatMessage[];
      }>("sessions.archives.get", {
        agentId,
        archiveId,
        ...(typeof limit === "number" ? { limit } : {}),
      });
      return {
        ok: true,
        agentId: result.agentId,
        archive: result.archive,
        messages: Array.isArray(result.messages) ? result.messages : [],
      };
    },

    async deleteSessionArchive(
      agentId: string,
      archiveId: string,
    ): Promise<{ ok: boolean; removed: boolean }> {
      return gateway.request("sessions.archives.delete", {
        agentId,
        archiveId,
      });
    },

    async restoreSessionArchive(
      agentId: string,
      archiveId: string,
      key: string,
    ): Promise<SessionsArchivesRestoreResult> {
      return gateway.request("sessions.archives.restore", {
        agentId,
        archiveId,
        key,
      });
    },

    async compactSession(
      sessionKey: string,
      maxLines: number = 400,
    ): Promise<{ ok: boolean; compacted: boolean }> {
      return gateway.request("sessions.compact", { key: sessionKey, maxLines });
    },

    async resolveSession(agentId: string): Promise<{ ok: boolean; key: string; error?: string }> {
      const defaultKey = `agent:${agentId}:main`;
      return { ok: true, key: defaultKey };
    },

    async getChatHistory(
      sessionKey: string,
      limit?: number,
    ): Promise<{
      sessionKey?: string;
      sessionId?: string;
      messages: ChatMessage[];
      thinkingLevel?: string;
    }> {
      const result = await gateway.request<{
        sessionKey?: string;
        sessionId?: string;
        messages?: ChatMessage[];
        thinkingLevel?: string;
      }>("chat.history", { sessionKey, limit });

      return {
        sessionKey: result.sessionKey,
        sessionId: result.sessionId,
        messages: Array.isArray(result.messages) ? result.messages : [],
        thinkingLevel: result.thinkingLevel,
      };
    },

    async sendChatMessage(
      sessionKey: string,
      message: string,
      opts?: {
        timeoutMs?: number;
        attachments?: Array<{ type: string; mimeType: string; content: string }>;
      },
    ) {
      return gateway.request<ChatSendAck>("chat.send", {
        sessionKey,
        message,
        deliver: false,
        ...(opts?.attachments ? { attachments: opts.attachments } : {}),
        ...(typeof opts?.timeoutMs === "number" ? { timeoutMs: opts.timeoutMs } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
    },

    async abortChatRunsForSessionKeyWithPartials(
      sessionKey: string,
      runId?: string,
    ): Promise<{ ok: boolean; aborted: number; runIds: string[] }> {
      return gateway.request("chat.abort", {
        sessionKey,
        ...(runId ? { runId } : {}),
      }) as Promise<{ ok: boolean; aborted: number; runIds: string[] }>;
    },
  };
}
