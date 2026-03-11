import { access, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildManagedExecutorCompanyWorkspace, buildManagedExecutorWorkspaceRoot, listDesiredManagedExecutorAgents } from "./company-executor-sync";
import { isReservedSystemCompany } from "../../../src/domain/org/system-company";
import type { Company, CyberCompanyConfig } from "../../../src/domain/org/types";
import type { AuthorityCompanyRuntimeSnapshot, AuthorityExecutorStatus } from "../../../src/infrastructure/authority/contract";

const EXECUTOR_AGENT_ABSENCE_TIMEOUT_MS = 15_000;
const EXECUTOR_AGENT_ABSENCE_POLL_MS = 200;

export class StrongCompanyDeleteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "StrongCompanyDeleteError";
  }
}

type StrongDeleteResultBuilder<T> = () => T;

type StrongDeleteCompanyParams<T> = {
  companyId: string;
  currentConfig: CyberCompanyConfig | null;
  executorState: AuthorityExecutorStatus["state"];
  loadRuntime: (companyId: string) => AuthorityCompanyRuntimeSnapshot;
  deleteManagedAgentFromExecutor: (agentId: string) => Promise<void>;
  listExecutorAgentIds: () => Promise<Set<string>>;
  ensureManagedCompanyExecutorProvisioned: (
    company: Company,
    runtime: AuthorityCompanyRuntimeSnapshot,
    reason: string,
  ) => Promise<void>;
  deleteCompanyLocally: (companyId: string) => void;
  clearManagedExecutorAgentsForCompany: (companyId: string) => void;
  restoreLocalCompany: (
    config: CyberCompanyConfig,
    runtime: AuthorityCompanyRuntimeSnapshot,
  ) => void;
  hasCompany: (companyId: string) => boolean;
  cleanupCompanyWorkspace: (companyId: string) => Promise<string>;
  buildResult: StrongDeleteResultBuilder<T>;
  logWarn?: (message: string, error: unknown) => void;
  agentAbsenceTimeoutMs?: number;
  agentAbsencePollMs?: number;
};

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildStandaloneCompanyConfig(company: Company): CyberCompanyConfig {
  return {
    version: 1,
    companies: [company],
    activeCompanyId: company.id,
    preferences: { theme: "classic", locale: "zh-CN" },
  };
}

function resolveUserPath(input: string, homeDir: string = os.homedir()) {
  if (input === "~") {
    return homeDir;
  }
  if (input.startsWith("~/")) {
    return path.join(homeDir, input.slice(2));
  }
  return path.resolve(input);
}

function isPathInsideRoot(rootPath: string, candidatePath: string) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toDeleteError(message: string, error: unknown, status: number) {
  const detail = stringifyError(error);
  return new StrongCompanyDeleteError(`${message}：${detail}`, status);
}

export function resolveManagedExecutorCompanyWorkspaceDir(
  companyId: string,
  homeDir: string = os.homedir(),
) {
  return resolveUserPath(buildManagedExecutorCompanyWorkspace(companyId), homeDir);
}

export async function removeManagedExecutorCompanyWorkspace(params: {
  companyId: string;
  homeDir?: string;
  pathExists?: (pathname: string) => Promise<boolean>;
  removeDir?: (pathname: string) => Promise<void>;
}) {
  const workspaceRoot = resolveUserPath(buildManagedExecutorWorkspaceRoot(), params.homeDir);
  const companyWorkspaceDir = resolveManagedExecutorCompanyWorkspaceDir(params.companyId, params.homeDir);
  if (!isPathInsideRoot(workspaceRoot, companyWorkspaceDir)) {
    throw new Error(`拒绝删除工作区边界之外的路径：${companyWorkspaceDir}`);
  }

  const pathExists =
    params.pathExists ??
    (async (pathname: string) => {
      try {
        await access(pathname);
        return true;
      } catch {
        return false;
      }
    });
  const removeDir =
    params.removeDir ??
    (async (pathname: string) => {
      await rm(pathname, { recursive: true, force: false });
    });

  if (!(await pathExists(companyWorkspaceDir))) {
    return companyWorkspaceDir;
  }

  await removeDir(companyWorkspaceDir);
  return companyWorkspaceDir;
}

export async function waitForExecutorAgentsAbsent(params: {
  agentIds: string[];
  listExecutorAgentIds: () => Promise<Set<string>>;
  timeoutMs?: number;
  pollMs?: number;
}) {
  const remaining = new Set(params.agentIds);
  if (remaining.size === 0) {
    return remaining;
  }

  const timeoutMs = params.timeoutMs ?? EXECUTOR_AGENT_ABSENCE_TIMEOUT_MS;
  const pollMs = params.pollMs ?? EXECUTOR_AGENT_ABSENCE_POLL_MS;
  const deadline = Date.now() + timeoutMs;

  while (remaining.size > 0 && Date.now() < deadline) {
    try {
      const existingAgentIds = await params.listExecutorAgentIds();
      for (const agentId of [...remaining]) {
        if (!existingAgentIds.has(agentId)) {
          remaining.delete(agentId);
        }
      }
      if (remaining.size === 0) {
        return remaining;
      }
    } catch {
      // Keep polling so transient list failures do not report false success.
    }
    await delay(pollMs);
  }

  try {
    const existingAgentIds = await params.listExecutorAgentIds();
    for (const agentId of [...remaining]) {
      if (!existingAgentIds.has(agentId)) {
        remaining.delete(agentId);
      }
    }
  } catch {
    // Preserve remaining ids so the caller treats the delete as unverified.
  }

  return remaining;
}

export async function deleteCompanyStrongConsistency<T>(
  params: StrongDeleteCompanyParams<T>,
): Promise<T> {
  const currentConfig = params.currentConfig;
  const company =
    currentConfig?.companies.find((entry) => entry.id === params.companyId) ?? null;

  if (!company || !currentConfig) {
    return params.buildResult();
  }
  if (isReservedSystemCompany(company)) {
    throw new StrongCompanyDeleteError("系统默认公司不可删除。", 400);
  }
  if (params.executorState !== "ready") {
    throw new StrongCompanyDeleteError("OpenClaw 未就绪，未执行本地删除。", 503);
  }

  const runtime = params.loadRuntime(company.id);
  const targetAgentIds = listDesiredManagedExecutorAgents(
    buildStandaloneCompanyConfig(company),
  ).map((target) => target.agentId);

  const rollbackExecutor = async (reason: string, error: unknown) => {
    try {
      await params.ensureManagedCompanyExecutorProvisioned(
        company,
        runtime,
        "company.delete.rollback",
      );
    } catch (rollbackError) {
      params.logWarn?.(
        `Failed to roll back OpenClaw agents for company ${company.id} after delete failure.`,
        rollbackError,
      );
    }
    throw toDeleteError(reason, error, 502);
  };

  const rollbackLocalAndExecutor = async (reason: string, error: unknown) => {
    try {
      params.restoreLocalCompany(currentConfig, runtime);
    } catch (restoreError) {
      params.logWarn?.(
        `Failed to restore Authority company ${company.id} after delete failure.`,
        restoreError,
      );
    }
    await rollbackExecutor(reason, error);
  };

  for (const agentId of targetAgentIds) {
    try {
      await params.deleteManagedAgentFromExecutor(agentId);
    } catch (error) {
      await rollbackExecutor(`OpenClaw 删除 agent ${agentId} 失败`, error);
    }
  }

  const remainingAgentIds = await waitForExecutorAgentsAbsent({
    agentIds: targetAgentIds,
    listExecutorAgentIds: params.listExecutorAgentIds,
    timeoutMs: params.agentAbsenceTimeoutMs,
    pollMs: params.agentAbsencePollMs,
  });
  if (remainingAgentIds.size > 0) {
    await rollbackExecutor(
      `OpenClaw 删除后仍可见的 agent：${[...remainingAgentIds].join(", ")}`,
      new Error("delete verification failed"),
    );
  }

  try {
    await params.cleanupCompanyWorkspace(company.id);
  } catch (error) {
    await rollbackExecutor(`无法清理公司工作区 ${company.id}`, error);
  }

  try {
    params.deleteCompanyLocally(company.id);
    params.clearManagedExecutorAgentsForCompany(company.id);
  } catch (error) {
    await rollbackLocalAndExecutor("Authority 删除公司数据失败", error);
  }

  try {
    if (params.hasCompany(company.id)) {
      throw new Error(`Authority 仍保留公司 ${company.id}`);
    }
    await params.cleanupCompanyWorkspace(company.id);
  } catch (error) {
    await rollbackLocalAndExecutor("删除后校验失败", error);
  }

  return params.buildResult();
}
