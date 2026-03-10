import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorityBootstrapSnapshot, AuthorityCompanyRuntimeSnapshot } from "../../authority/contract";
import { authorityClient } from "../../authority/client";
import {
  readCachedAuthorityRuntimeSnapshot,
  writeCachedAuthorityRuntimeSnapshot,
} from "../../authority/runtime-cache";
import type { Company, CyberCompanyConfig } from "../../../domain/org/types";
import {
  clearConfigCache,
  deleteCompanyCascade,
  getConfigOwnerAgentId,
  getPersistedActiveCompanyId,
  loadCompanyConfig,
  peekCachedCompanyConfig,
  saveCompanyConfig,
  setPersistedActiveCompanyId,
} from "./persistence";

function createCompany(
  id: string,
  name: string,
  employeeAgentIds: Array<{ agentId: string; metaRole?: "ceo" | "hr" | "cto" | "coo"; isMeta?: boolean }>,
): Company {
  return {
    id,
    name,
    description: "",
    icon: "🏢",
    template: "blank",
    employees: employeeAgentIds.map((employee, index) => ({
      agentId: employee.agentId,
      nickname: employee.metaRole?.toUpperCase() ?? `员工${index + 1}`,
      role: employee.metaRole ?? "员工",
      isMeta: employee.isMeta ?? Boolean(employee.metaRole),
      metaRole: employee.metaRole,
    })),
    quickPrompts: [],
    createdAt: id === "company-1" ? 1 : 2,
  };
}

function createConfig(): CyberCompanyConfig {
  return {
    version: 1,
    activeCompanyId: "company-2",
    preferences: { theme: "classic", locale: "zh-CN" },
    companies: [
      createCompany("company-1", "旧公司", [
        { agentId: "old-ceo", metaRole: "ceo" },
        { agentId: "old-hr", metaRole: "hr" },
      ]),
      createCompany("company-2", "新公司", [{ agentId: "new-ceo", metaRole: "ceo" }]),
    ],
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
    updatedAt: Date.now(),
  };
}

function createBootstrap(config: CyberCompanyConfig | null): AuthorityBootstrapSnapshot {
  const activeCompany =
    config?.companies.find((company) => company.id === config.activeCompanyId) ??
    config?.companies[0] ??
    null;
  return {
    config,
    activeCompany,
    runtime: activeCompany ? createRuntime(activeCompany.id) : null,
    executor: {
      adapter: "single-executor-local",
      state: "ready",
      provider: "none",
      note: "test",
    },
    authority: {
      url: "http://127.0.0.1:18790",
      dbPath: "/tmp/test.sqlite",
      connected: true,
    },
  };
}

describe("company persistence", () => {
  beforeEach(() => {
    clearConfigCache();
    vi.restoreAllMocks();
  });

  it("loads config from authority and hydrates the cached CEO owner", async () => {
    const config = createConfig();
    vi.spyOn(authorityClient, "bootstrap").mockResolvedValue(createBootstrap(config));

    const loaded = await loadCompanyConfig();

    expect(loaded).toEqual(config);
    expect(peekCachedCompanyConfig()).toEqual(config);
    expect(getPersistedActiveCompanyId()).toBe("company-2");
    expect(getConfigOwnerAgentId()).toBe("new-ceo");
  });

  it("saves config through authority and refreshes the cached active company", async () => {
    const config = createConfig();
    const updateConfig = vi
      .spyOn(authorityClient, "updateConfig")
      .mockResolvedValue(createBootstrap(config));

    const saved = await saveCompanyConfig(config);

    expect(saved).toBe(true);
    expect(updateConfig).toHaveBeenCalledWith(config);
    expect(peekCachedCompanyConfig()).toEqual(config);
    expect(getConfigOwnerAgentId()).toBe("new-ceo");
  });

  it("switches the cached active company without touching browser storage", async () => {
    const config = createConfig();
    vi.spyOn(authorityClient, "bootstrap").mockResolvedValue(createBootstrap(config));
    await loadCompanyConfig();

    setPersistedActiveCompanyId("company-1");

    expect(peekCachedCompanyConfig()).toMatchObject({ activeCompanyId: "company-1" });
    expect(getPersistedActiveCompanyId()).toBe("company-1");
    expect(getConfigOwnerAgentId()).toBe("old-ceo");
  });

  it("deletes company data through authority, clears its runtime cache, and reloads bootstrap", async () => {
    const currentConfig = createConfig();
    const nextConfig: CyberCompanyConfig = {
      ...currentConfig,
      companies: [currentConfig.companies[1]!],
    };
    writeCachedAuthorityRuntimeSnapshot(createRuntime("company-1"));
    const deleteCompany = vi.spyOn(authorityClient, "deleteCompany").mockResolvedValue({ ok: true });
    vi.spyOn(authorityClient, "bootstrap").mockResolvedValue(createBootstrap(nextConfig));

    const result = await deleteCompanyCascade(currentConfig, "company-1");

    expect(deleteCompany).toHaveBeenCalledWith("company-1");
    expect(result).toEqual(nextConfig);
    expect(readCachedAuthorityRuntimeSnapshot("company-1")).toBeNull();
    expect(getPersistedActiveCompanyId()).toBe("company-2");
    expect(getConfigOwnerAgentId()).toBe("new-ceo");
  });

  it("returns the current config unchanged when the company is unknown", async () => {
    const currentConfig = createConfig();
    const deleteCompany = vi.spyOn(authorityClient, "deleteCompany");

    const result = await deleteCompanyCascade(currentConfig, "missing-company");

    expect(result).toBe(currentConfig);
    expect(deleteCompany).not.toHaveBeenCalled();
  });
});
