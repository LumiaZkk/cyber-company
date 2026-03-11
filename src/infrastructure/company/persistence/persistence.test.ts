import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorityBootstrapSnapshot, AuthorityCompanyRuntimeSnapshot } from "../../authority/contract";
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
import {
  deleteAuthorityCompany,
  getAuthorityBootstrap,
  saveAuthorityConfig as saveAuthorityConfigRequest,
} from "../../../application/gateway/authority-control";

vi.mock("../../../application/gateway/authority-control", () => ({
  getAuthorityBootstrap: vi.fn(),
  saveAuthorityConfig: vi.fn(),
  deleteAuthorityCompany: vi.fn(),
}));

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
    activeSupportRequests: [],
    activeEscalations: [],
    activeDecisionTickets: [],
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
      adapter: "openclaw-bridge",
      state: "ready",
      provider: "openclaw",
      note: "test",
    },
    executorConfig: {
      type: "openclaw",
      openclaw: {
        url: "ws://127.0.0.1:18789",
        tokenConfigured: false,
      },
      connectionState: "ready",
      lastError: null,
      lastConnectedAt: Date.now(),
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
    vi.mocked(getAuthorityBootstrap).mockResolvedValue(createBootstrap(config));

    const loaded = await loadCompanyConfig();

    expect(loaded).toEqual(config);
    expect(peekCachedCompanyConfig()).toEqual(config);
    expect(getPersistedActiveCompanyId()).toBe("company-2");
    expect(getConfigOwnerAgentId()).toBe("new-ceo");
  });

  it("saves config through authority and refreshes the cached active company", async () => {
    const config = createConfig();
    vi.mocked(saveAuthorityConfigRequest).mockResolvedValue(createBootstrap(config));

    const saved = await saveCompanyConfig(config);

    expect(saved).toBe(true);
    expect(saveAuthorityConfigRequest).toHaveBeenCalledWith(config);
    expect(peekCachedCompanyConfig()).toEqual(config);
    expect(getConfigOwnerAgentId()).toBe("new-ceo");
  });

  it("switches the cached active company without touching browser storage", async () => {
    const config = createConfig();
    vi.mocked(getAuthorityBootstrap).mockResolvedValue(createBootstrap(config));
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
    vi.mocked(deleteAuthorityCompany).mockResolvedValue(createBootstrap(nextConfig));

    const result = await deleteCompanyCascade(currentConfig, "company-1");

    expect(deleteAuthorityCompany).toHaveBeenCalledWith("company-1");
    expect(result).toEqual(nextConfig);
    expect(readCachedAuthorityRuntimeSnapshot("company-1")).toBeNull();
    expect(getPersistedActiveCompanyId()).toBe("company-2");
    expect(getConfigOwnerAgentId()).toBe("new-ceo");
  });

  it("returns the current config unchanged when the company is unknown", async () => {
    const currentConfig = createConfig();

    const result = await deleteCompanyCascade(currentConfig, "missing-company");

    expect(result).toBe(currentConfig);
    expect(deleteAuthorityCompany).not.toHaveBeenCalled();
  });
});
