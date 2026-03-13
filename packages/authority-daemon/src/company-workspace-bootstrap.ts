import type { Company } from "../../../src/domain/org/types";
import type { AuthorityCompanyRuntimeSnapshot } from "../../../src/infrastructure/authority/contract";
import { buildRecommendedWorkspaceApps } from "../../../src/application/company/workspace-apps";
import { buildLegacyCompanyWorkspaceBootstrapFixture } from "./legacy-compat/company-workspace-smoke-fixtures";

function buildEmptyRuntime(companyId: string, now: number): AuthorityCompanyRuntimeSnapshot {
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
    activeAgentSessions: [],
    activeAgentRuns: [],
    activeAgentRuntime: [],
    activeAgentStatuses: [],
    activeAgentStatusHealth: {
      source: "authority",
      coverage: "authority_partial",
      coveredAgentCount: 0,
      expectedAgentCount: 0,
      missingAgentIds: [],
      isComplete: false,
      generatedAt: now,
      note: "Authority runtime has not projected canonical agent statuses yet.",
    },
    updatedAt: now,
  };
}

export function buildCompanyWorkspaceBootstrap(company: Company): {
  company: Company;
  runtime: AuthorityCompanyRuntimeSnapshot;
} {
  const legacyFixture = buildLegacyCompanyWorkspaceBootstrapFixture(company);
  if (legacyFixture) {
    return legacyFixture;
  }

  const apps = buildRecommendedWorkspaceApps(company);
  return {
    company: {
      ...company,
      workspaceApps: apps,
    },
    runtime: buildEmptyRuntime(company.id, company.createdAt),
  };
}
