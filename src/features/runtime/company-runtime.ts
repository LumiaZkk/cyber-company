import type { ChatMessage, GatewaySessionRow, AgentListEntry, CronJob } from "../backend";
import type { RequirementSessionSnapshot } from "../execution/requirement-overview";

type WorkspaceFilesByAgent = Record<
  string,
  { workspace: string; files: Array<Record<string, unknown>> }
>;

export type CompanyRuntimeSnapshot = {
  companyId: string;
  agents?: AgentListEntry[];
  sessions?: GatewaySessionRow[];
  cronJobs?: CronJob[];
  usageCost?: number | null;
  companySessionSnapshots?: RequirementSessionSnapshot[];
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
