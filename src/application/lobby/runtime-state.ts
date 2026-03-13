import { useEffect, useMemo, useState } from "react";
import type { AgentRuntimeRecord, CanonicalAgentStatusRecord } from "../agent-runtime";
import {
  gateway,
  type AgentListEntry,
  type CronJob,
  type GatewaySessionRow,
} from "../gateway";
import {
  readCompanyRuntimeSnapshot,
  writeCompanyRuntimeSnapshot,
} from "../company/runtime-snapshot";
import { stripTruthInternalMonologue } from "../mission/message-truth";
import { resolveExecutionState, type ResolvedExecutionState } from "../mission/execution-state";
import type { Company } from "../../domain/org/types";
import {
  createRequirementMessageSnapshots,
  REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT,
  type RequirementSessionSnapshot,
} from "../../domain/mission/requirement-snapshot";
import { resolveSessionActorId, resolveSessionTitle, resolveSessionUpdatedAt } from "../../lib/sessions";

function extractEvidenceText(message: { text?: unknown; content?: unknown }): string {
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((block) => {
        if (typeof block === "string") {
          return block;
        }
        if (block && typeof block === "object") {
          const record = block as Record<string, unknown>;
          if (record.type === "text" && typeof record.text === "string") {
            return record.text;
          }
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

export function useLobbyRuntimeState(params: {
  activeCompany: Company | null;
  activeAgentRuntime: AgentRuntimeRecord[];
  activeAgentStatuses: CanonicalAgentStatusRecord[];
  connected: boolean;
  isPageVisible: boolean;
}) {
  const { activeCompany, activeAgentRuntime, activeAgentStatuses, connected, isPageVisible } = params;
  const companyId = activeCompany?.id ?? null;
  const runtimeSnapshot = readCompanyRuntimeSnapshot(companyId);
  const [agentsCache, setAgentsCache] = useState<AgentListEntry[]>(() => runtimeSnapshot?.agents ?? []);
  const [sessionsCache, setSessionsCache] = useState<GatewaySessionRow[]>(() => runtimeSnapshot?.sessions ?? []);
  const [cronCache, setCronCache] = useState<CronJob[]>(() => runtimeSnapshot?.cronJobs ?? []);
  const [sessionExecutionMap, setSessionExecutionMap] = useState<Map<string, ResolvedExecutionState>>(new Map());
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [companySessionSnapshots, setCompanySessionSnapshots] = useState<RequirementSessionSnapshot[]>(
    () => runtimeSnapshot?.companySessionSnapshots ?? [],
  );
  const [usageCost, setUsageCost] = useState<number | null>(() => runtimeSnapshot?.usageCost ?? null);

  useEffect(() => {
    if (!companyId) {
      return;
    }
    const snapshot = readCompanyRuntimeSnapshot(companyId);
    if (!snapshot) {
      return;
    }
    queueMicrotask(() => {
      setAgentsCache(snapshot.agents ?? []);
      setSessionsCache(snapshot.sessions ?? []);
      setCronCache(snapshot.cronJobs ?? []);
      setCompanySessionSnapshots(snapshot.companySessionSnapshots ?? []);
      setUsageCost(snapshot.usageCost ?? null);
    });
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      return;
    }
    writeCompanyRuntimeSnapshot(companyId, {
      agents: agentsCache,
      sessions: sessionsCache,
      cronJobs: cronCache,
      companySessionSnapshots,
      usageCost,
    });
  }, [agentsCache, companyId, companySessionSnapshots, cronCache, sessionsCache, usageCost]);

  useEffect(() => {
    async function fetchData() {
      if (!connected || !isPageVisible) {
        return;
      }
      try {
        const [agentsRes, sessionsRes, cronRes, usageRes] = await Promise.all([
          gateway.listAgents(),
          gateway.listSessions(),
          gateway.listCron().catch(() => ({ jobs: [] })),
          gateway.getUsageCost({ days: 30 }).catch(() => null),
        ]);
        setAgentsCache(agentsRes.agents || []);
        setSessionsCache(sessionsRes.sessions || []);
        setCronCache(cronRes.jobs || []);
        if (usageRes?.totals) {
          setUsageCost(usageRes.totals.totalCost);
        }
      } catch (error) {
        console.error("Failed to fetch lobby data:", error);
      }
    }

    void fetchData();
    const timer = setInterval(() => void fetchData(), 10_000);
    return () => clearInterval(timer);
  }, [connected, isPageVisible]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const companyAgentIds = useMemo(
    () => new Set((activeCompany?.employees ?? []).map((employee) => employee.agentId)),
    [activeCompany],
  );
  const companySessions = useMemo(
    () =>
      sessionsCache
        .map((session) => ({
          ...session,
          agentId: resolveSessionActorId(session),
        }))
        .filter((session): session is GatewaySessionRow & { agentId: string } => {
          return typeof session.agentId === "string" && companyAgentIds.has(session.agentId);
        })
        .sort((left, right) => resolveSessionUpdatedAt(right) - resolveSessionUpdatedAt(left)),
    [companyAgentIds, sessionsCache],
  );

  const sessionsByAgent = useMemo(() => {
    const next = new Map<string, Array<GatewaySessionRow & { agentId: string }>>();
    for (const session of companySessions) {
      const existing = next.get(session.agentId) ?? [];
      existing.push(session);
      next.set(session.agentId, existing);
    }
    return next;
  }, [companySessions]);
  const companySessionsSignature = companySessions
    .map((session) => `${session.key}:${resolveSessionUpdatedAt(session)}`)
    .join("|");
  const agentRuntimeByAgentId = useMemo(
    () => new Map(activeAgentRuntime.map((runtime) => [runtime.agentId, runtime])),
    [activeAgentRuntime],
  );
  const canonicalStatusByAgentId = useMemo(
    () => new Map(activeAgentStatuses.map((status) => [status.agentId, status])),
    [activeAgentStatuses],
  );

  useEffect(() => {
    if (!connected || !isPageVisible || companySessions.length === 0) {
      return;
    }

    let cancelled = false;
    (async () => {
      const next = new Map<string, ResolvedExecutionState>();
      const snapshots: RequirementSessionSnapshot[] = [];
      const targets = companySessions.slice(0, 12);
      await Promise.allSettled(
        targets.map(async (session) => {
          try {
            const history = await gateway.getChatHistory(session.key, 20);
            const evidenceTexts = (history.messages || [])
              .map(extractEvidenceText)
              .filter((text) => text.length > 0);

            next.set(
              session.key,
              resolveExecutionState({
                agentRuntime: agentRuntimeByAgentId.get(session.agentId) ?? null,
                canonicalStatus: canonicalStatusByAgentId.get(session.agentId) ?? null,
                session,
                evidenceTexts,
                now: Date.now(),
              }),
            );
            snapshots.push({
              agentId: session.agentId,
              sessionKey: session.key,
              updatedAt: resolveSessionUpdatedAt(session),
              messages: createRequirementMessageSnapshots(history.messages ?? [], {
                limit: REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT,
                normalizeText: stripTruthInternalMonologue,
              }),
          });
        } catch {
            next.set(
              session.key,
              resolveExecutionState({
                agentRuntime: agentRuntimeByAgentId.get(session.agentId) ?? null,
                canonicalStatus: canonicalStatusByAgentId.get(session.agentId) ?? null,
                session,
                now: Date.now(),
              }),
            );
          }
        }),
      );

      if (!cancelled) {
        setSessionExecutionMap(next);
        if (snapshots.length > 0) {
          setCompanySessionSnapshots((previous) => {
            const activeSessionKeys = new Set(companySessions.map((session) => session.key));
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

    return () => {
      cancelled = true;
    };
  }, [
    agentRuntimeByAgentId,
    canonicalStatusByAgentId,
    connected,
    companySessions,
    companySessionsSignature,
    isPageVisible,
  ]);

  const sessionExecutions = useMemo(() => {
    const next = new Map<string, ResolvedExecutionState>(sessionExecutionMap);
    for (const session of companySessions) {
      if (!next.has(session.key)) {
        next.set(
          session.key,
          resolveExecutionState({
            agentRuntime: agentRuntimeByAgentId.get(session.agentId) ?? null,
            canonicalStatus: canonicalStatusByAgentId.get(session.agentId) ?? null,
            session,
            evidenceTexts: [session.lastMessagePreview, resolveSessionTitle(session)],
            now: currentTime,
          }),
        );
      }
    }
    return next;
  }, [agentRuntimeByAgentId, canonicalStatusByAgentId, companySessions, currentTime, sessionExecutionMap]);

  return {
    agentsCache,
    sessionsCache,
    cronCache,
    currentTime,
    companySessionSnapshots,
    setCompanySessionSnapshots,
    usageCost,
    companySessions,
    sessionsByAgent,
    sessionExecutions,
  };
}
