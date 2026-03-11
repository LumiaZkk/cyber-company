import { describe, expect, it, vi } from "vitest";
import type { Company, CyberCompanyConfig } from "../../../src/domain/org/types";
import type { AuthorityCompanyRuntimeSnapshot } from "../../../src/infrastructure/authority/contract";
import {
  deleteCompanyStrongConsistency,
  removeManagedExecutorCompanyWorkspace,
  resolveManagedExecutorCompanyWorkspaceDir,
  waitForExecutorAgentsAbsent,
} from "./company-delete";

function createCompany(id = "company-1"): Company {
  return {
    id,
    name: "测试公司",
    description: "desc",
    icon: "🏢",
    template: "blank",
    createdAt: 1,
    employees: [
      { agentId: `${id}-ceo`, nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo" },
      { agentId: `${id}-hr`, nickname: "HR", role: "HR", isMeta: true, metaRole: "hr" },
    ],
    quickPrompts: [],
  };
}

function createConfig(company: Company = createCompany()): CyberCompanyConfig {
  return {
    version: 1,
    companies: [company],
    activeCompanyId: company.id,
    preferences: { theme: "classic", locale: "zh-CN" },
  };
}

function createRuntime(companyId: string): AuthorityCompanyRuntimeSnapshot {
  return {
    companyId,
    activeRoomRecords: [],
    activeMissionRecords: [],
    activeConversationStates: [],
    activeWorkItems: [],
    activeRequirementAggregates: [],
    activeRequirementEvidence: [],
    primaryRequirementId: null,
    activeRoundRecords: [],
    activeArtifacts: [],
    activeDispatches: [],
    activeRoomBindings: [],
    activeSupportRequests: [],
    activeEscalations: [],
    activeDecisionTickets: [],
    updatedAt: 1,
  };
}

function createDeleteDeps(config: CyberCompanyConfig) {
  const companyId = config.activeCompanyId;
  const runtime = createRuntime(companyId);
  const deleteManagedAgentFromExecutor = vi.fn(async () => {});
  const listExecutorAgentIds = vi.fn(async () => new Set<string>());
  const ensureManagedCompanyExecutorProvisioned = vi.fn(async () => {});
  const deleteCompanyLocally = vi.fn(() => {});
  const clearManagedExecutorAgentsForCompany = vi.fn(() => {});
  const restoreLocalCompany = vi.fn(() => {});
  const cleanupCompanyWorkspace = vi.fn(async () => resolveManagedExecutorCompanyWorkspaceDir(companyId));
  const hasCompany = vi.fn(() => false);
  const buildResult = vi.fn(() => ({ ok: true }));
  const logWarn = vi.fn();

  return {
    companyId,
    runtime,
    deleteManagedAgentFromExecutor,
    listExecutorAgentIds,
    ensureManagedCompanyExecutorProvisioned,
    deleteCompanyLocally,
    clearManagedExecutorAgentsForCompany,
    restoreLocalCompany,
    cleanupCompanyWorkspace,
    hasCompany,
    buildResult,
    logWarn,
    params: {
      companyId,
      currentConfig: config,
      executorState: "ready" as const,
      loadRuntime: () => runtime,
      deleteManagedAgentFromExecutor,
      listExecutorAgentIds,
      ensureManagedCompanyExecutorProvisioned,
      deleteCompanyLocally,
      clearManagedExecutorAgentsForCompany,
      restoreLocalCompany,
      hasCompany,
      cleanupCompanyWorkspace,
      buildResult,
      logWarn,
      agentAbsenceTimeoutMs: 20,
      agentAbsencePollMs: 1,
    },
  };
}

describe("company-delete", () => {
  it("rejects deletion when OpenClaw is not ready", async () => {
    const config = createConfig();
    const deps = createDeleteDeps(config);

    await expect(
      deleteCompanyStrongConsistency({
        ...deps.params,
        executorState: "degraded",
      }),
    ).rejects.toMatchObject({
      message: "OpenClaw 未就绪，未执行本地删除。",
      status: 503,
    });

    expect(deps.deleteManagedAgentFromExecutor).not.toHaveBeenCalled();
    expect(deps.deleteCompanyLocally).not.toHaveBeenCalled();
  });

  it("rolls back remote agents when a managed agent delete fails", async () => {
    const config = createConfig();
    const deps = createDeleteDeps(config);
    deps.deleteManagedAgentFromExecutor.mockRejectedValueOnce(new Error("boom"));

    await expect(deleteCompanyStrongConsistency(deps.params)).rejects.toMatchObject({
      message: expect.stringContaining(`OpenClaw 删除 agent ${config.activeCompanyId}-ceo 失败`),
      status: 502,
    });

    expect(deps.ensureManagedCompanyExecutorProvisioned).toHaveBeenCalledWith(
      config.companies[0],
      deps.runtime,
      "company.delete.rollback",
    );
    expect(deps.deleteCompanyLocally).not.toHaveBeenCalled();
  });

  it("rolls back when deleted agents remain visible in OpenClaw", async () => {
    const config = createConfig();
    const deps = createDeleteDeps(config);
    deps.listExecutorAgentIds.mockResolvedValue(new Set([`${config.activeCompanyId}-hr`]));

    await expect(deleteCompanyStrongConsistency(deps.params)).rejects.toMatchObject({
      message: expect.stringContaining(`OpenClaw 删除后仍可见的 agent：${config.activeCompanyId}-hr`),
      status: 502,
    });

    expect(deps.ensureManagedCompanyExecutorProvisioned).toHaveBeenCalledTimes(1);
    expect(deps.deleteCompanyLocally).not.toHaveBeenCalled();
  });

  it("restores local state and reprovisions agents if post-delete verification fails", async () => {
    const config = createConfig();
    const deps = createDeleteDeps(config);
    deps.hasCompany.mockReturnValue(true);

    await expect(deleteCompanyStrongConsistency(deps.params)).rejects.toMatchObject({
      message: expect.stringContaining("删除后校验失败"),
      status: 502,
    });

    expect(deps.deleteCompanyLocally).toHaveBeenCalledWith(config.activeCompanyId);
    expect(deps.restoreLocalCompany).toHaveBeenCalledWith(config, deps.runtime);
    expect(deps.ensureManagedCompanyExecutorProvisioned).toHaveBeenCalledTimes(1);
  });

  it("deletes agents, clears the company workspace root, and commits local delete on success", async () => {
    const config = createConfig();
    const deps = createDeleteDeps(config);

    await expect(deleteCompanyStrongConsistency(deps.params)).resolves.toEqual({ ok: true });

    expect(deps.deleteManagedAgentFromExecutor).toHaveBeenNthCalledWith(1, `${config.activeCompanyId}-ceo`);
    expect(deps.deleteManagedAgentFromExecutor).toHaveBeenNthCalledWith(2, `${config.activeCompanyId}-hr`);
    expect(deps.cleanupCompanyWorkspace).toHaveBeenNthCalledWith(1, config.activeCompanyId);
    expect(deps.cleanupCompanyWorkspace).toHaveBeenNthCalledWith(2, config.activeCompanyId);
    expect(deps.deleteCompanyLocally).toHaveBeenCalledWith(config.activeCompanyId);
    expect(deps.clearManagedExecutorAgentsForCompany).toHaveBeenCalledWith(config.activeCompanyId);
    expect(deps.buildResult).toHaveBeenCalledTimes(1);
  });

  it("recursively removes the managed company workspace root", async () => {
    const removeDir = vi.fn(async () => {});
    const pathExists = vi.fn(async () => true);

    const removedPath = await removeManagedExecutorCompanyWorkspace({
      companyId: "company-1",
      homeDir: "/Users/test",
      pathExists,
      removeDir,
    });

    expect(removedPath).toBe("/Users/test/.openclaw/workspaces/cyber-company/company-1");
    expect(removeDir).toHaveBeenCalledWith("/Users/test/.openclaw/workspaces/cyber-company/company-1");
  });

  it("waits until executor agents are absent", async () => {
    const listExecutorAgentIds = vi
      .fn(async () => new Set<string>())
      .mockResolvedValueOnce(new Set(["company-1-ceo", "company-1-hr"]))
      .mockResolvedValueOnce(new Set(["company-1-hr"]))
      .mockResolvedValueOnce(new Set<string>());

    const remaining = await waitForExecutorAgentsAbsent({
      agentIds: ["company-1-ceo", "company-1-hr"],
      listExecutorAgentIds,
      timeoutMs: 200,
      pollMs: 1,
    });

    expect([...remaining]).toEqual([]);
  });
});
