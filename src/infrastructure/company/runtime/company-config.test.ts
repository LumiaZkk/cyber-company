import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Company, CyberCompanyConfig } from "../../../domain/org/types";
import { buildCompanyConfigActions } from "./company-config";
import { createEmptyProductState } from "./bootstrap";
import type { CompanyRuntimeState } from "./types";
import { deleteCompanyCascade } from "../persistence/persistence";

vi.mock("../persistence/persistence", () => ({
  deleteCompanyCascade: vi.fn(),
  saveCompanyConfig: vi.fn(),
}));

vi.mock("../../../application/gateway/authority-control", () => ({
  getAuthorityBootstrap: vi.fn(),
  getAuthorityCompanyRuntime: vi.fn(),
  switchAuthorityCompany: vi.fn(),
}));

vi.mock("../../authority/runtime-cache", () => ({
  hydrateAuthorityBootstrapCache: vi.fn(),
  writeCachedAuthorityConfig: vi.fn(),
  writeCachedAuthorityRuntimeSnapshot: vi.fn(),
}));

vi.mock("../../authority/runtime-snapshot", () => ({
  runtimeStateFromAuthorityBootstrap: vi.fn(),
  runtimeStateFromAuthorityRuntimeSnapshot: vi.fn(() => ({
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
  })),
}));

function createCompany(id: string): Company {
  return {
    id,
    name: id,
    description: "",
    icon: "🏢",
    template: "blank",
    createdAt: 1,
    employees: [
      {
        agentId: `${id}-ceo`,
        nickname: "CEO",
        role: "CEO",
        isMeta: true,
        metaRole: "ceo",
      },
    ],
    quickPrompts: [],
  };
}

function createConfig(): CyberCompanyConfig {
  return {
    version: 1,
    companies: [createCompany("company-1"), createCompany("company-2")],
    activeCompanyId: "company-1",
    preferences: { theme: "classic", locale: "zh-CN" },
  };
}

describe("buildCompanyConfigActions deleteCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces strict authority delete failures without applying a success state", async () => {
    const config = createConfig();
    let state = {
      config,
      activeCompany: config.companies[0] ?? null,
      ...createEmptyProductState(),
      loading: false,
      error: null,
      bootstrapPhase: "ready",
    } as CompanyRuntimeState;

    const set = (partial: Partial<CompanyRuntimeState>) => {
      state = { ...state, ...partial };
    };
    const get = () => state;

    vi.mocked(deleteCompanyCascade).mockRejectedValue(
      new Error("OpenClaw 删除后仍可见的 agent：company-1-ceo"),
    );

    const actions = buildCompanyConfigActions(set, get);

    await expect(actions.deleteCompany("company-1")).rejects.toThrow(
      "OpenClaw 删除后仍可见的 agent：company-1-ceo",
    );

    expect(deleteCompanyCascade).toHaveBeenCalledWith(config, "company-1");
    expect(state.config).toBe(config);
    expect(state.activeCompany).toBe(config.companies[0]);
    expect(state.error).toBe("OpenClaw 删除后仍可见的 agent：company-1-ceo");
    expect(state.loading).toBe(false);
  });
});
