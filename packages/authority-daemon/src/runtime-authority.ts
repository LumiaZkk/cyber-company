import type {
  AgentRunRecord,
  AgentSessionRecord,
} from "../../../src/application/agent-runtime";
import { reconcileAgentSessionExecutionContext } from "../../../src/application/agent-runtime";
import { mergeDispatchRecords, projectDelegationFromEvents, type CompanyEvent } from "../../../src/domain/delegation/events";
import type { DispatchRecord } from "../../../src/domain/delegation/types";
import type { Company } from "../../../src/domain/org/types";

export type SessionStatusCapabilityState = "unknown" | "supported" | "unsupported";

export function isUnsupportedSessionStatusError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unknown method:\s*session_status/i.test(message) || /session_status/i.test(message) && /method not found/i.test(message);
}

export function resolveSessionStatusCapabilityState(input: {
  current: SessionStatusCapabilityState;
  outcome: "success" | "error";
  error?: unknown;
}): SessionStatusCapabilityState {
  if (input.current === "unsupported") {
    return "unsupported";
  }
  if (input.outcome === "success") {
    return "supported";
  }
  return isUnsupportedSessionStatusError(input.error) ? "unsupported" : input.current;
}

export function reconcileDispatchesFromCompanyEvents(input: {
  company: Company | null;
  events: CompanyEvent[];
  existingDispatches: DispatchRecord[];
}): DispatchRecord[] {
  if (!input.company) {
    return input.existingDispatches;
  }
  const projected = projectDelegationFromEvents({
    company: input.company,
    events: input.events,
    existingDispatches: input.existingDispatches,
  });
  return mergeDispatchRecords(input.existingDispatches, projected.dispatches);
}

export function repairAgentSessionsFromDispatches(input: {
  sessions: AgentSessionRecord[];
  runs: AgentRunRecord[];
  dispatches: DispatchRecord[];
}): AgentSessionRecord[] {
  const activeSessionKeys = new Set(input.runs.map((run) => run.sessionKey));
  const latestAnsweredAtBySessionKey = new Map<string, number>();

  for (const dispatch of input.dispatches) {
    if (dispatch.status !== "answered") {
      continue;
    }
    for (const targetActorId of dispatch.targetActorIds) {
      const sessionKey = `agent:${targetActorId}:main`;
      const current = latestAnsweredAtBySessionKey.get(sessionKey) ?? 0;
      latestAnsweredAtBySessionKey.set(sessionKey, Math.max(current, dispatch.updatedAt));
    }
  }

  const repairedSessions = [...input.sessions]
    .map((session) => {
      const answeredAt = latestAnsweredAtBySessionKey.get(session.sessionKey);
      if (!answeredAt || activeSessionKeys.has(session.sessionKey)) {
        return session;
      }
      if (session.sessionState !== "error" && !session.abortedLastRun) {
        return session;
      }
      return {
        ...session,
        sessionState: "idle" as const,
        lastSeenAt: Math.max(session.lastSeenAt ?? 0, answeredAt) || null,
        lastMessageAt: Math.max(session.lastMessageAt ?? 0, answeredAt) || null,
        abortedLastRun: false,
        lastError: null,
        lastTerminalRunState: "completed" as const,
        lastTerminalSummary: `${session.sessionKey} 已通过 company_report 完成交付。`,
        source: session.source === "lifecycle" ? "fallback" : session.source,
      } satisfies AgentSessionRecord;
    })
    .sort((left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0));

  return reconcileAgentSessionExecutionContext({
    sessions: repairedSessions,
    dispatches: input.dispatches,
  });
}
