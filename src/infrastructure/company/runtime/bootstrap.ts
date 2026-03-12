import { readCachedAuthorityConfig, readCachedAuthorityRuntimeSnapshot } from "../../authority/runtime-cache";
import { runtimeStateFromAuthorityRuntimeSnapshot } from "../../authority/runtime-snapshot";
import type {
  ArtifactRecord,
  Company,
  CompanyRuntimeState,
  ConversationMissionRecord,
  RequirementAggregateRecord,
  RequirementEvidenceEvent,
  ConversationStateRecord,
  DispatchRecord,
  RoomConversationBindingRecord,
  RoundRecord,
  WorkItemRecord,
} from "./types";

export type LoadedCompanyProductState = {
  authorityBackedState: boolean;
  loadedRooms: CompanyRuntimeStateBootstrap["activeRoomRecords"];
  loadedMissions: ConversationMissionRecord[];
  loadedConversationStates: ConversationStateRecord[];
  loadedWorkItems: WorkItemRecord[];
  loadedRounds: RoundRecord[];
  loadedArtifacts: ArtifactRecord[];
  loadedDispatches: DispatchRecord[];
  loadedRoomBindings: RoomConversationBindingRecord[];
  loadedSupportRequests: CompanyRuntimeStateBootstrap["activeSupportRequests"];
  loadedEscalations: CompanyRuntimeStateBootstrap["activeEscalations"];
  loadedDecisionTickets: CompanyRuntimeStateBootstrap["activeDecisionTickets"];
  loadedRequirementAggregates: RequirementAggregateRecord[];
  loadedRequirementEvidence: RequirementEvidenceEvent[];
  primaryRequirementId: string | null;
};

type CompanyRuntimeStateBootstrap = ReturnType<typeof createEmptyProductState>;

export function loadProductState(companyId: string): LoadedCompanyProductState {
  const snapshot = readCachedAuthorityRuntimeSnapshot(companyId);
  const state = runtimeStateFromAuthorityRuntimeSnapshot(snapshot);
  return {
    authorityBackedState: state.authorityBackedState,
    loadedRooms: state.activeRoomRecords,
    loadedMissions: state.activeMissionRecords,
    loadedConversationStates: state.activeConversationStates,
    loadedWorkItems: state.activeWorkItems,
    loadedRounds: state.activeRoundRecords,
    loadedArtifacts: state.activeArtifacts,
    loadedDispatches: state.activeDispatches,
    loadedRoomBindings: state.activeRoomBindings,
    loadedSupportRequests: state.activeSupportRequests,
    loadedEscalations: state.activeEscalations,
    loadedDecisionTickets: state.activeDecisionTickets,
    loadedRequirementAggregates: state.activeRequirementAggregates,
    loadedRequirementEvidence: state.activeRequirementEvidence,
    primaryRequirementId: state.primaryRequirementId,
  };
}

export function createEmptyProductState(): Pick<
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
> {
  return {
    authorityBackedState: false,
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
  };
}

export function loadInitialCompanyState() {
  const config = readCachedAuthorityConfig();
  const activeCompany =
    config?.companies.find((company: Company) => company.id === config.activeCompanyId) ?? null;
  const state = activeCompany ? loadProductState(activeCompany.id) : null;

  return {
    config: config ?? null,
    activeCompany,
    authorityBackedState: state?.authorityBackedState ?? Boolean(activeCompany),
    activeRoomRecords: state?.loadedRooms ?? [],
    activeMissionRecords: state?.loadedMissions ?? [],
    activeConversationStates: state?.loadedConversationStates ?? [],
    activeWorkItems: state?.loadedWorkItems ?? [],
    activeRequirementAggregates: state?.loadedRequirementAggregates ?? [],
    activeRequirementEvidence: state?.loadedRequirementEvidence ?? [],
    primaryRequirementId: state?.primaryRequirementId ?? null,
    activeRoundRecords: state?.loadedRounds ?? [],
    activeArtifacts: state?.loadedArtifacts ?? [],
    activeDispatches: state?.loadedDispatches ?? [],
    activeRoomBindings: state?.loadedRoomBindings ?? [],
    activeSupportRequests: state?.loadedSupportRequests ?? [],
    activeEscalations: state?.loadedEscalations ?? [],
    activeDecisionTickets: state?.loadedDecisionTickets ?? [],
    bootstrapPhase: activeCompany ? ("ready" as const) : config ? ("missing" as const) : ("idle" as const),
  };
}
