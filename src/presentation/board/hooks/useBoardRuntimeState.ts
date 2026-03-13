import { useEffect, useRef, useState } from "react";
import type {
  CanonicalAgentStatusRecord,
  AgentRuntimeRecord,
  AgentSessionRecord,
} from "../../../application/agent-runtime";
import { gateway, type ChatMessage, type GatewaySessionRow } from "../../../application/gateway";
import { readPageSnapshot, writePageSnapshot } from "../../../application/company/page-snapshots";
import { stripTruthInternalMonologue } from "../../../application/mission/message-truth";
import { resolveExecutionState, type ResolvedExecutionState } from "../../../application/mission/execution-state";
import { buildManualTakeoverPack, type ManualTakeoverPack } from "../../../application/delegation/takeover-pack";
import { parseTaskBoardMd } from "../../../application/mission/task-board-parser";
import type { Company } from "../../../domain/org/types";
import type { ArtifactRecord } from "../../../domain/artifact/types";
import type { TrackedTask } from "../../../domain/mission/types";
import {
  createRequirementMessageSnapshots,
  REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT,
  type RequirementSessionSnapshot,
} from "../../../domain/mission/requirement-snapshot";
import { isSessionActive, resolveSessionActorId, resolveSessionUpdatedAt } from "../../../lib/sessions";

export type BoardPageSnapshot = {
  sessions: GatewaySessionRow[];
  sessionMetaEntries: Array<[string, { topic: string; msgCount: number }]>;
  sessionStateEntries: Array<[string, ResolvedExecutionState]>;
  sessionTakeoverPackEntries: Array<[string, ManualTakeoverPack]>;
  fileTasks: TrackedTask[];
  companySessionSnapshots: RequirementSessionSnapshot[];
};

function extractText(message: ChatMessage): string {
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((block: unknown) => {
        if (typeof block === "string") {
          return block;
        }
        if (block && typeof block === "object" && !Array.isArray(block)) {
          const record = block as Record<string, unknown>;
          if (record.type === "text" && typeof record.text === "string") {
            return record.text;
          }
        }
        return "";
      })
      .join(" ")
      .trim();
  }
  return "";
}

export function useBoardRuntimeState(params: {
  activeCompany: Company;
  activeAgentSessions: AgentSessionRecord[];
  activeAgentRuntime: AgentRuntimeRecord[];
  activeAgentStatuses: CanonicalAgentStatusRecord[];
  activeArtifacts: ArtifactRecord[];
  connected: boolean;
  isPageVisible: boolean;
  supportsAgentFiles: boolean;
}) {
  const {
    activeCompany,
    activeAgentSessions,
    activeAgentRuntime,
    activeAgentStatuses,
    activeArtifacts,
    connected,
    isPageVisible,
    supportsAgentFiles,
  } = params;
  const boardSnapshotKey = activeCompany ? `board:${activeCompany.id}` : "board:none";
  const initialBoardSnapshot = readPageSnapshot<BoardPageSnapshot>(boardSnapshotKey);
  const [sessions, setSessions] = useState<GatewaySessionRow[]>(() => initialBoardSnapshot?.sessions ?? []);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [sessionMeta, setSessionMeta] = useState<Map<string, { topic: string; msgCount: number }>>(
    () => new Map(initialBoardSnapshot?.sessionMetaEntries ?? []),
  );
  const [sessionStates, setSessionStates] = useState<Map<string, ResolvedExecutionState>>(
    () => new Map(initialBoardSnapshot?.sessionStateEntries ?? []),
  );
  const [sessionTakeoverPacks, setSessionTakeoverPacks] = useState<Map<string, ManualTakeoverPack>>(
    () => new Map(initialBoardSnapshot?.sessionTakeoverPackEntries ?? []),
  );
  const [fileTasks, setFileTasks] = useState<TrackedTask[]>(() => initialBoardSnapshot?.fileTasks ?? []);
  const [companySessionSnapshots, setCompanySessionSnapshots] = useState<RequirementSessionSnapshot[]>(
    () => initialBoardSnapshot?.companySessionSnapshots ?? [],
  );
  const fetchedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const snapshot = readPageSnapshot<BoardPageSnapshot>(boardSnapshotKey);
    if (!snapshot) {
      return;
    }
    queueMicrotask(() => {
      setSessions(snapshot.sessions);
      setSessionMeta(new Map(snapshot.sessionMetaEntries));
      setSessionStates(new Map(snapshot.sessionStateEntries));
      setSessionTakeoverPacks(new Map(snapshot.sessionTakeoverPackEntries));
      setFileTasks(snapshot.fileTasks);
      setCompanySessionSnapshots(snapshot.companySessionSnapshots);
    });
  }, [boardSnapshotKey]);

  useEffect(() => {
    writePageSnapshot<BoardPageSnapshot>(boardSnapshotKey, {
      sessions,
      sessionMetaEntries: [...sessionMeta.entries()],
      sessionStateEntries: [...sessionStates.entries()],
      sessionTakeoverPackEntries: [...sessionTakeoverPacks.entries()],
      fileTasks,
      companySessionSnapshots,
    });
  }, [
    boardSnapshotKey,
    companySessionSnapshots,
    fileTasks,
    sessionMeta,
    sessionStates,
    sessionTakeoverPacks,
    sessions,
  ]);

  useEffect(() => {
    async function loadBoard() {
      if (!connected || !isPageVisible) {
        return;
      }
      try {
        const res = await gateway.listSessions();
        setSessions(res.sessions || []);
      } catch (error) {
        console.error("Failed to load sessions:", error);
      }

      if (supportsAgentFiles) {
        const ceo = activeCompany.employees.find((employee) => employee.metaRole === "ceo");
        if (ceo) {
          try {
            const fileResult = await gateway.getAgentFile(ceo.agentId, "TASK-BOARD.md");
            if (fileResult?.file?.content) {
              setFileTasks(parseTaskBoardMd(fileResult.file.content, ceo.agentId));
            }
          } catch {
            // TASK-BOARD.md is optional.
          }
        }
        return;
      }

      const mirroredTaskBoard = activeArtifacts.find((artifact) => {
        const sourceName = artifact.sourceName?.trim().toLowerCase();
        const title = artifact.title.trim().toLowerCase();
        return sourceName === "task-board.md" || title === "task-board.md";
      });
      if (mirroredTaskBoard?.content) {
        const ceo = activeCompany.employees.find((employee) => employee.metaRole === "ceo");
        setFileTasks(parseTaskBoardMd(mirroredTaskBoard.content, ceo?.agentId ?? "co-ceo"));
      } else {
        setFileTasks([]);
      }
    }

    void loadBoard();
    const timer = setInterval(() => void loadBoard(), 15_000);
    return () => clearInterval(timer);
  }, [activeArtifacts, activeCompany, connected, isPageVisible, supportsAgentFiles]);

  const companyAgentIds = new Set(activeCompany.employees.map((employee) => employee.agentId));
  const companySessions = [
    ...sessions
      .map((session) => ({ ...session, agentId: resolveSessionActorId(session) }))
      .filter((session): session is GatewaySessionRow & { agentId: string } => {
        return typeof session.agentId === "string" && companyAgentIds.has(session.agentId);
      }),
  ].sort((left, right) => resolveSessionUpdatedAt(right) - resolveSessionUpdatedAt(left));
  const agentRuntimeByAgentId = new Map(
    activeAgentRuntime.map((runtime) => [runtime.agentId, runtime] as const),
  );
  const agentStatusByAgentId = new Map(
    activeAgentStatuses.map((status) => [status.agentId, status] as const),
  );
  const sessionRuntimeByKey = new Map(
    activeAgentSessions.map((session) => [session.sessionKey, session] as const),
  );

  useEffect(() => {
    if (!isPageVisible || sessions.length === 0) {
      return;
    }
    const keysToFetch = sessions.map((session) => session.key).filter((key) => !fetchedKeysRef.current.has(key));
    if (keysToFetch.length === 0) {
      return;
    }

    const controller = new AbortController();
    (async () => {
      const entries: Array<[string, { topic: string; msgCount: number }]> = [];
      const snapshots: RequirementSessionSnapshot[] = [];
      const batch = keysToFetch.slice(0, 15);
      const promises = batch.map(async (key) => {
        const session = sessions.find((item) => item.key === key);
        const sessionActorId = session ? resolveSessionActorId(session) : null;
        try {
          const history = await gateway.getChatHistory(key, 20);
          const messages = history.messages || [];
          const firstHuman = messages.find((message) => message.role === "user");
          const topic = firstHuman ? extractText(firstHuman) : "";
          const truncatedTopic = topic.length > 120 ? `${topic.slice(0, 120)}...` : topic;
          const evidenceTexts = messages.map(extractText).filter((text): text is string => text.length > 0);
          const execution = resolveExecutionState({
            agentRuntime: sessionActorId ? agentRuntimeByAgentId.get(sessionActorId) ?? null : null,
            canonicalStatus: sessionActorId ? agentStatusByAgentId.get(sessionActorId) ?? null : null,
            session,
            evidenceTexts,
            now: Date.now(),
          });
          entries.push([key, { topic: truncatedTopic || "(未检测到任务指令)", msgCount: messages.length }]);
          if (sessionActorId) {
            snapshots.push({
              agentId: sessionActorId,
              sessionKey: key,
              updatedAt: session ? resolveSessionUpdatedAt(session) : Date.now(),
              messages: createRequirementMessageSnapshots(messages, {
                limit: REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT,
                normalizeText: stripTruthInternalMonologue,
              }),
            });
          }
          setSessionStates((previous) => {
            const next = new Map(previous);
            next.set(key, execution);
            return next;
          });
          if (execution.state === "manual_takeover_required") {
            const ownerLabel =
              activeCompany.employees.find((employee) => employee.agentId === sessionActorId)?.nickname ??
              sessionActorId ??
              "未知节点";
            const pack = buildManualTakeoverPack({
              messages,
              sessionKey: key,
              ownerLabel,
              fallbackTitle: truncatedTopic || ownerLabel,
            });
            if (pack) {
              setSessionTakeoverPacks((previous) => {
                const next = new Map(previous);
                next.set(key, pack);
                return next;
              });
            }
          }
          fetchedKeysRef.current.add(key);
        } catch {
          entries.push([key, { topic: "(加载失败)", msgCount: 0 }]);
          setSessionStates((previous) => {
            const next = new Map(previous);
            next.set(
              key,
              resolveExecutionState({
                agentRuntime: sessionActorId ? agentRuntimeByAgentId.get(sessionActorId) ?? null : null,
                canonicalStatus: sessionActorId ? agentStatusByAgentId.get(sessionActorId) ?? null : null,
                session,
                fallbackState: "unknown",
              }),
            );
            return next;
          });
          fetchedKeysRef.current.add(key);
        }
      });
      await Promise.allSettled(promises);
      if (!controller.signal.aborted) {
        setSessionMeta((previous) => {
          const next = new Map(previous);
          for (const [key, value] of entries) {
            next.set(key, value);
          }
          return next;
        });
        if (snapshots.length > 0) {
          setCompanySessionSnapshots((previous) => {
            const activeSessionKeys = new Set(sessions.map((session) => session.key));
            const bySessionKey = new Map(previous.map((snapshot) => [snapshot.sessionKey, snapshot]));
            snapshots.forEach((snapshot) => {
              bySessionKey.set(snapshot.sessionKey, snapshot);
            });
            return [...bySessionKey.values()]
              .filter((snapshot) => activeSessionKeys.has(snapshot.sessionKey))
              .sort((left, right) => right.updatedAt - left.updatedAt)
              .slice(0, 12);
          });
        }
      }
    })();
    return () => controller.abort();
  }, [activeCompany.employees, agentRuntimeByAgentId, agentStatusByAgentId, isPageVisible, sessions]);

  useEffect(() => {
    const activeKeys = new Set(sessions.map((session) => session.key));
    fetchedKeysRef.current = new Set([...fetchedKeysRef.current].filter((key) => activeKeys.has(key)));
    queueMicrotask(() => {
      setSessionMeta((previous) => {
        const next = new Map([...previous.entries()].filter(([key]) => activeKeys.has(key)));
        return next.size === previous.size ? previous : next;
      });
      setSessionStates((previous) => {
        const next = new Map([...previous.entries()].filter(([key]) => activeKeys.has(key)));
        return next.size === previous.size ? previous : next;
      });
      setSessionTakeoverPacks((previous) => {
        const next = new Map([...previous.entries()].filter(([key]) => activeKeys.has(key)));
        return next.size === previous.size ? previous : next;
      });
      setCompanySessionSnapshots((previous) => {
        const next = previous.filter((snapshot) => activeKeys.has(snapshot.sessionKey));
        return next.length === previous.length ? previous : next;
      });
    });
  }, [sessions]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const resolvedSessionStates = new Map(sessionStates);
  companySessions.forEach((session) => {
    if (!resolvedSessionStates.has(session.key)) {
      resolvedSessionStates.set(
        session.key,
        resolveExecutionState({
          agentRuntime: agentRuntimeByAgentId.get(session.agentId) ?? null,
          canonicalStatus: agentStatusByAgentId.get(session.agentId) ?? null,
          session,
          evidenceTexts: [session.lastMessagePreview, session.derivedTitle],
          now: currentTime,
        }),
      );
    }
  });

  const activeSessions = companySessions.filter((session) => {
    const runtime = sessionRuntimeByKey.get(session.key);
    const canonicalStatus = agentStatusByAgentId.get(session.agentId) ?? null;
    if (runtime) {
      return runtime.sessionState === "running" || runtime.sessionState === "streaming";
    }
    if (canonicalStatus?.coordinationState === "executing" || canonicalStatus?.runtimeState === "busy") {
      return true;
    }
    return isSessionActive(session, currentTime);
  });
  const archivedSessions = companySessions.filter(
    (session) => !activeSessions.some((candidate) => candidate.key === session.key),
  );

  return {
    setSessions,
    setCompanySessionSnapshots,
    sessions,
    currentTime,
    sessionMeta,
    sessionStates: resolvedSessionStates,
    sessionTakeoverPacks,
    fileTasks,
    companySessionSnapshots,
    companySessions,
    activeSessions,
    archivedSessions,
  };
}
