import { isSupportRequestActive } from "../../domain/delegation/support-request";
import type { CompanyRuntimeState } from "../company/runtime/types";
import type { AuthorityCompanyRuntimeSnapshot } from "./contract";
import { runtimeStateFromAuthorityRuntimeSnapshot } from "./runtime-snapshot";

export function buildAuthorityRuntimeStatePatch(input: {
  snapshot: AuthorityCompanyRuntimeSnapshot;
  activeCompany: CompanyRuntimeState["activeCompany"];
}): Pick<
  CompanyRuntimeState,
  | "authorityBackedState"
  | "activeRoomRecords"
  | "activeMissionRecords"
  | "activeConversationStates"
  | "activeWorkItems"
  | "activeRequirementAggregates"
  | "activeRequirementEvidence"
  | "primaryRequirementId"
  | "activeRoundRecords"
  | "activeArtifacts"
  | "activeDispatches"
  | "activeRoomBindings"
  | "activeSupportRequests"
  | "activeEscalations"
  | "activeDecisionTickets"
  | "activeAgentSessions"
  | "activeAgentRuns"
  | "activeAgentRuntime"
  | "activeAgentStatuses"
  | "activeCompany"
> {
  const runtimePatch = runtimeStateFromAuthorityRuntimeSnapshot(input.snapshot);
  return {
    ...runtimePatch,
    activeCompany: input.activeCompany
      ? {
          ...input.activeCompany,
          supportRequests: input.snapshot.activeSupportRequests.filter(isSupportRequestActive),
          escalations: input.snapshot.activeEscalations.filter(
            (item) => item.status === "open" || item.status === "acknowledged",
          ),
          decisionTickets: input.snapshot.activeDecisionTickets.filter(
            (item) => item.status === "open" || item.status === "pending_human",
          ),
        }
      : input.activeCompany,
  };
}
