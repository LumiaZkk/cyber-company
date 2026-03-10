import type { CompanyRuntimeState } from "../company/runtime/types";
import type { AuthorityBootstrapSnapshot, AuthorityCompanyRuntimeSnapshot } from "./contract";

export function runtimeStateFromAuthorityRuntimeSnapshot(
  runtime: AuthorityCompanyRuntimeSnapshot | null,
): Pick<
  CompanyRuntimeState,
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
> {
  return {
    activeRoomRecords: runtime?.activeRoomRecords ?? [],
    activeMissionRecords: runtime?.activeMissionRecords ?? [],
    activeConversationStates: runtime?.activeConversationStates ?? [],
    activeWorkItems: runtime?.activeWorkItems ?? [],
    activeRequirementAggregates: runtime?.activeRequirementAggregates ?? [],
    activeRequirementEvidence: runtime?.activeRequirementEvidence ?? [],
    primaryRequirementId: runtime?.primaryRequirementId ?? null,
    activeRoundRecords: runtime?.activeRoundRecords ?? [],
    activeArtifacts: runtime?.activeArtifacts ?? [],
    activeDispatches: runtime?.activeDispatches ?? [],
    activeRoomBindings: runtime?.activeRoomBindings ?? [],
  };
}

export function runtimeStateFromAuthorityBootstrap(
  snapshot: AuthorityBootstrapSnapshot,
): Pick<
  CompanyRuntimeState,
  | "config"
  | "activeCompany"
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
> {
  return {
    config: snapshot.config,
    activeCompany: snapshot.activeCompany,
    ...runtimeStateFromAuthorityRuntimeSnapshot(snapshot.runtime),
  };
}
