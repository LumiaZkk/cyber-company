import { useCompanyRuntimeStore } from "./store";
import type { CompanyRuntimeState } from "./types";

export function readCompanyRuntimeState() {
  return useCompanyRuntimeStore.getState();
}

export function selectCompanyShellState(state: CompanyRuntimeState) {
  return {
    config: state.config,
    activeCompany: state.activeCompany,
    loading: state.loading,
    error: state.error,
    bootstrapPhase: state.bootstrapPhase,
  };
}

export function selectMissionBoardState(state: CompanyRuntimeState) {
  return {
    activeCompany: state.activeCompany,
    activeConversationStates: state.activeConversationStates,
    activeDispatches: state.activeDispatches,
    activeRoomRecords: state.activeRoomRecords,
    activeWorkItems: state.activeWorkItems,
    activeRequirementAggregates: state.activeRequirementAggregates,
    activeRequirementEvidence: state.activeRequirementEvidence,
    primaryRequirementId: state.primaryRequirementId,
    activeArtifacts: state.activeArtifacts,
    activeSupportRequests: state.activeSupportRequests,
    activeEscalations: state.activeEscalations,
    activeDecisionTickets: state.activeDecisionTickets,
    activeAgentSessions: state.activeAgentSessions,
    activeAgentRuns: state.activeAgentRuns,
    activeAgentRuntime: state.activeAgentRuntime,
    activeAgentStatuses: state.activeAgentStatuses,
  };
}

export function selectConversationWorkspaceState(state: CompanyRuntimeState) {
  return {
    config: state.config,
    activeCompany: state.activeCompany,
    activeRoomRecords: state.activeRoomRecords,
    activeMissionRecords: state.activeMissionRecords,
    activeConversationStates: state.activeConversationStates,
    activeWorkItems: state.activeWorkItems,
    activeRequirementAggregates: state.activeRequirementAggregates,
    primaryRequirementId: state.primaryRequirementId,
    activeRoundRecords: state.activeRoundRecords,
    activeArtifacts: state.activeArtifacts,
    activeDispatches: state.activeDispatches,
    activeRoomBindings: state.activeRoomBindings,
    activeSupportRequests: state.activeSupportRequests,
    activeEscalations: state.activeEscalations,
    activeDecisionTickets: state.activeDecisionTickets,
    activeAgentSessions: state.activeAgentSessions,
    activeAgentRuns: state.activeAgentRuns,
    activeAgentRuntime: state.activeAgentRuntime,
    activeAgentStatuses: state.activeAgentStatuses,
  };
}

export function selectWorkspaceArtifactsState(state: CompanyRuntimeState) {
  return {
    activeCompany: state.activeCompany,
    activeConversationStates: state.activeConversationStates,
    activeArtifacts: state.activeArtifacts,
    activeWorkItems: state.activeWorkItems,
    activeRequirementAggregates: state.activeRequirementAggregates,
    primaryRequirementId: state.primaryRequirementId,
  };
}

export function selectCeoCockpitState(state: CompanyRuntimeState) {
  return {
    activeCompany: state.activeCompany,
    activeRoomRecords: state.activeRoomRecords,
    activeRoomBindings: state.activeRoomBindings,
    activeWorkItems: state.activeWorkItems,
    activeRequirementAggregates: state.activeRequirementAggregates,
    primaryRequirementId: state.primaryRequirementId,
    activeSupportRequests: state.activeSupportRequests,
    activeEscalations: state.activeEscalations,
    activeDecisionTickets: state.activeDecisionTickets,
    activeAgentSessions: state.activeAgentSessions,
    activeAgentRuntime: state.activeAgentRuntime,
    activeAgentStatuses: state.activeAgentStatuses,
  };
}

export function selectExceptionInboxState(state: CompanyRuntimeState) {
  return {
    activeCompany: state.activeCompany,
    activeConversationStates: state.activeConversationStates,
    activeArtifacts: state.activeArtifacts,
    activeDispatches: state.activeDispatches,
    activeRoomRecords: state.activeRoomRecords,
    activeWorkItems: state.activeWorkItems,
    activeRequirementAggregates: state.activeRequirementAggregates,
    primaryRequirementId: state.primaryRequirementId,
    activeSupportRequests: state.activeSupportRequests,
    activeEscalations: state.activeEscalations,
    activeDecisionTickets: state.activeDecisionTickets,
    activeAgentSessions: state.activeAgentSessions,
    activeAgentRuntime: state.activeAgentRuntime,
    activeAgentStatuses: state.activeAgentStatuses,
  };
}

export function selectOrgState(state: CompanyRuntimeState) {
  return {
    activeCompany: state.activeCompany,
    activeAgentSessions: state.activeAgentSessions,
    activeAgentRuntime: state.activeAgentRuntime,
    activeAgentStatuses: state.activeAgentStatuses,
  };
}

export function selectRuntimeInspectorState(state: CompanyRuntimeState) {
  return {
    activeCompany: state.activeCompany,
    activeWorkItems: state.activeWorkItems,
    activeDispatches: state.activeDispatches,
    activeSupportRequests: state.activeSupportRequests,
    activeEscalations: state.activeEscalations,
    activeAgentSessions: state.activeAgentSessions,
    activeAgentRuns: state.activeAgentRuns,
    activeAgentRuntime: state.activeAgentRuntime,
    activeAgentStatuses: state.activeAgentStatuses,
  };
}
