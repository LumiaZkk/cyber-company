import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Company, CyberCompanyConfig } from "../../../domain/org/types";
import { buildCompanyConfigActions } from "./company-config";
import { createEmptyProductState } from "./bootstrap";
import type { CompanyRuntimeState } from "./types";
import { deleteCompanyCascade, saveCompanyConfig } from "../persistence/persistence";

vi.mock("../persistence/persistence", () => ({
  deleteCompanyCascade: vi.fn(),
  saveCompanyConfig: vi.fn(),
}));

vi.mock("../../../application/gateway/authority-control", () => ({
  getAuthorityBootstrap: vi.fn(),
  getAuthorityCompanyRuntime: vi.fn(),
  retryAuthorityCompanyProvisioning: vi.fn(),
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
    state = { ...state, ...actions };
    state = { ...state, ...actions };

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

describe("buildCompanyConfigActions platform middle office records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists skill definitions, skill runs, capability requests, capability issues, and audit events into the active company", async () => {
    const config = createConfig();
    let state = {
      config,
      activeCompany: config.companies[0] ?? null,
      ...createEmptyProductState(),
      loading: false,
      error: null,
      bootstrapPhase: "ready",
    } as CompanyRuntimeState;

    const updateCompany = vi.fn(async (partial: Partial<Company>) => {
      if (!state.activeCompany || !state.config) {
        return;
      }
      const nextCompany = { ...state.activeCompany, ...partial };
      const nextCompanies = state.config.companies.map((company) =>
        company.id === nextCompany.id ? nextCompany : company,
      );
      const nextConfig: CyberCompanyConfig = {
        ...state.config,
        companies: nextCompanies,
      };
      state = {
        ...state,
        activeCompany: nextCompany,
        config: nextConfig,
      };
      await saveCompanyConfig(nextConfig);
    });

    const set = (partial: Partial<CompanyRuntimeState>) => {
      state = { ...state, ...partial };
    };
    const get = () => state;

    state = { ...state, updateCompany } as CompanyRuntimeState;

    const actions = buildCompanyConfigActions(set, get);
    state = { ...state, ...actions };

    await actions.upsertSkillDefinition({
      id: "reader.build-index",
      title: "重建阅读索引",
      summary: "把正文、设定和报告整理成阅读器可消费资源。",
      ownerAgentId: "company-1-ceo",
      status: "draft",
      entryPath: "scripts/build-reader-index.ts",
      allowedTriggers: ["app_action"],
      writesResourceTypes: ["document", "report"],
      createdAt: 10,
      updatedAt: 10,
    });
    await actions.upsertCapabilityRequest({
      id: "request-1",
      type: "app",
      summary: "需要一个小说阅读器",
      status: "open",
      createdAt: 20,
      updatedAt: 20,
    });
    await actions.upsertSkillRun({
      id: "run-1",
      skillId: "reader.build-index",
      appId: "reader-app",
      triggerType: "app_action",
      triggerActionId: "trigger-reader-index",
      triggerLabel: "NovelCraft 阅读器",
      requestedByActorId: "company-1-ceo",
      requestedByLabel: "CEO",
      status: "succeeded",
      outputArtifactIds: ["skill-receipt:1"],
      outputResourceTypes: ["state"],
      startedAt: 25,
      completedAt: 26,
      updatedAt: 26,
    });
    await actions.upsertCapabilityIssue({
      id: "issue-1",
      type: "unavailable",
      summary: "阅读器当前无法打开",
      status: "open",
      createdAt: 30,
      updatedAt: 30,
    });
    await actions.upsertCapabilityAuditEvent({
      id: "audit-1",
      kind: "skill",
      entityId: "reader.build-index",
      action: "created",
      summary: "重建阅读索引 已登记为能力草稿",
      actorLabel: "CTO",
      skillId: "reader.build-index",
      createdAt: 31,
      updatedAt: 31,
    });

    expect(state.activeCompany?.skillDefinitions).toHaveLength(1);
    expect(state.activeCompany?.skillDefinitions?.[0]?.id).toBe("reader.build-index");
    expect(state.activeCompany?.skillRuns).toHaveLength(1);
    expect(state.activeCompany?.skillRuns?.[0]?.triggerLabel).toContain("阅读器");
    expect(state.activeCompany?.capabilityRequests).toHaveLength(1);
    expect(state.activeCompany?.capabilityRequests?.[0]?.summary).toContain("小说阅读器");
    expect(state.activeCompany?.capabilityIssues).toHaveLength(1);
    expect(state.activeCompany?.capabilityIssues?.[0]?.summary).toContain("无法打开");
    expect(state.activeCompany?.capabilityAuditEvents).toHaveLength(1);
    expect(state.activeCompany?.capabilityAuditEvents?.[0]?.summary).toContain("能力草稿");
    expect(vi.mocked(saveCompanyConfig)).toHaveBeenCalled();
  });
});
