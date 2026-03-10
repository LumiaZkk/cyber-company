import type { ChatMessage, GatewaySessionRow, AgentListEntry, CronJob } from "../backend";
import type { RequirementSessionSnapshot } from "../execution/requirement-overview";

type WorkspaceFilesByAgent = Record<
  string,
  { workspace: string; files: Array<Record<string, unknown>> }
>;

export type LiveChatSessionState = {
  sessionKey: string;
  agentId?: string | null;
  runId?: string | null;
  streamText?: string | null;
  isGenerating: boolean;
  startedAt: number;
  updatedAt: number;
};

export type CompanyRuntimeSnapshot = {
  companyId: string;
  agents?: AgentListEntry[];
  sessions?: GatewaySessionRow[];
  cronJobs?: CronJob[];
  usageCost?: number | null;
  companySessionSnapshots?: RequirementSessionSnapshot[];
  liveChatSessions?: Record<string, LiveChatSessionState>;
  workspaceFilesByAgent?: WorkspaceFilesByAgent;
  ceoHistoryByActor?: Record<string, ChatMessage[]>;
  updatedAt: number;
};

const companyRuntimeSnapshots = new Map<string, CompanyRuntimeSnapshot>();

function getCompanyRuntimeKey(companyId: string | null | undefined): string | null {
  const normalized = companyId?.trim();
  return normalized ? normalized : null;
}

export function readCompanyRuntimeSnapshot(
  companyId: string | null | undefined,
): CompanyRuntimeSnapshot | null {
  const key = getCompanyRuntimeKey(companyId);
  if (!key) {
    return null;
  }
  return companyRuntimeSnapshots.get(key) ?? null;
}

export function writeCompanyRuntimeSnapshot(
  companyId: string | null | undefined,
  patch: Omit<Partial<CompanyRuntimeSnapshot>, "companyId" | "updatedAt">,
): CompanyRuntimeSnapshot | null {
  const key = getCompanyRuntimeKey(companyId);
  if (!key) {
    return null;
  }
  const current = companyRuntimeSnapshots.get(key);
  const next: CompanyRuntimeSnapshot = {
    companyId: key,
    agents: patch.agents ?? current?.agents,
    sessions: patch.sessions ?? current?.sessions,
    cronJobs: patch.cronJobs ?? current?.cronJobs,
    usageCost: patch.usageCost ?? current?.usageCost ?? null,
    companySessionSnapshots:
      patch.companySessionSnapshots ?? current?.companySessionSnapshots,
    liveChatSessions: patch.liveChatSessions ?? current?.liveChatSessions,
    workspaceFilesByAgent:
      patch.workspaceFilesByAgent ?? current?.workspaceFilesByAgent,
    ceoHistoryByActor: patch.ceoHistoryByActor ?? current?.ceoHistoryByActor,
    updatedAt: Date.now(),
  };
  companyRuntimeSnapshots.set(key, next);
  return next;
}

export function clearCompanyRuntimeSnapshot(companyId: string | null | undefined): void {
  const key = getCompanyRuntimeKey(companyId);
  if (!key) {
    return;
  }
  companyRuntimeSnapshots.delete(key);
}

export function readLiveChatSession(
  companyId: string | null | undefined,
  sessionKey: string | null | undefined,
): LiveChatSessionState | null {
  const normalizedSessionKey = sessionKey?.trim();
  if (!normalizedSessionKey) {
    return null;
  }
  return readCompanyRuntimeSnapshot(companyId)?.liveChatSessions?.[normalizedSessionKey] ?? null;
}

export function upsertLiveChatSession(
  companyId: string | null | undefined,
  sessionKey: string | null | undefined,
  state: LiveChatSessionState,
): CompanyRuntimeSnapshot | null {
  const normalizedSessionKey = sessionKey?.trim();
  if (!normalizedSessionKey) {
    return null;
  }
  const currentSessions = readCompanyRuntimeSnapshot(companyId)?.liveChatSessions ?? {};
  return writeCompanyRuntimeSnapshot(companyId, {
    liveChatSessions: {
      ...currentSessions,
      [normalizedSessionKey]: {
        ...state,
        sessionKey: normalizedSessionKey,
      },
    },
  });
}

export function clearLiveChatSession(
  companyId: string | null | undefined,
  sessionKey: string | null | undefined,
): CompanyRuntimeSnapshot | null {
  const normalizedSessionKey = sessionKey?.trim();
  if (!normalizedSessionKey) {
    return null;
  }
  const currentSessions = readCompanyRuntimeSnapshot(companyId)?.liveChatSessions;
  if (!currentSessions || !(normalizedSessionKey in currentSessions)) {
    return readCompanyRuntimeSnapshot(companyId);
  }
  const nextSessions = { ...currentSessions };
  delete nextSessions[normalizedSessionKey];
  return writeCompanyRuntimeSnapshot(companyId, {
    liveChatSessions: nextSessions,
  });
}
