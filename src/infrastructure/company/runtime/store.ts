import { create } from "zustand";
import type { CompanyRuntimeState } from "./types";
import { loadInitialCompanyState } from "./bootstrap";
import { buildConversationStateActions } from "./conversation-state";
import { buildArtifactActions } from "./artifacts";
import { buildAutonomyActions } from "./autonomy";
import { buildCompanyConfigActions } from "./company-config";
import { buildDispatchActions } from "./dispatches";
import { buildMissionActions } from "./missions";
import { buildRoomActions } from "./rooms";
import { buildRoundActions } from "./rounds";
import { buildRequirementActions } from "./requirements";
import { buildWorkItemActions } from "./work-items";

const initialCompanyState = loadInitialCompanyState();

// DDD migration note:
// This is the legacy product runtime store. New page code should depend on
// application-layer hooks instead of reading or mutating this store directly.
export const useCompanyRuntimeStore = create<CompanyRuntimeState>((set, get) => ({
  config: initialCompanyState.config,
  activeCompany: initialCompanyState.activeCompany,
  authorityBackedState: initialCompanyState.authorityBackedState,
  activeRoomRecords: initialCompanyState.activeRoomRecords,
  activeMissionRecords: initialCompanyState.activeMissionRecords,
  activeConversationStates: initialCompanyState.activeConversationStates,
  activeWorkItems: initialCompanyState.activeWorkItems,
  activeRequirementAggregates: initialCompanyState.activeRequirementAggregates,
  activeRequirementEvidence: initialCompanyState.activeRequirementEvidence,
  primaryRequirementId: initialCompanyState.primaryRequirementId,
  activeRoundRecords: initialCompanyState.activeRoundRecords,
  activeArtifacts: initialCompanyState.activeArtifacts,
  activeDispatches: initialCompanyState.activeDispatches,
  activeRoomBindings: initialCompanyState.activeRoomBindings,
  activeSupportRequests: initialCompanyState.activeSupportRequests,
  activeEscalations: initialCompanyState.activeEscalations,
  activeDecisionTickets: initialCompanyState.activeDecisionTickets,
  activeAgentSessions: initialCompanyState.activeAgentSessions,
  activeAgentRuns: initialCompanyState.activeAgentRuns,
  activeAgentRuntime: initialCompanyState.activeAgentRuntime,
  activeAgentStatuses: initialCompanyState.activeAgentStatuses,
  loading: false,
  error: null,
  bootstrapPhase: initialCompanyState.bootstrapPhase,

  ...buildCompanyConfigActions(set, get),
  ...buildConversationStateActions(set, get),
  ...buildRoomActions(set, get),
  ...buildMissionActions(set, get),
  ...buildWorkItemActions(set, get),
  ...buildRequirementActions(set, get),
  ...buildRoundActions(set, get),
  ...buildArtifactActions(set, get),
  ...buildDispatchActions(set, get),
  ...buildAutonomyActions(set, get),
}));
