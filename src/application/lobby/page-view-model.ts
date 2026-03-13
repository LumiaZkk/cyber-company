import { useMemo } from "react";
import { buildLobbyOperationsSurface } from "../governance/lobby-operations-surface";
import { buildCeoControlSurface } from "../governance/ceo-control-surface";
import { useCompanyLobbyViewModel } from "../governance/lobby-view-model";
import type { AgentListEntry, CronJob, GatewaySessionRow } from "../gateway";
import { useGatewayStore } from "../gateway";
import { buildCurrentRequirementState } from "../mission/current-requirement-state";
import { buildLobbyRequirementSurface } from "../mission/lobby-requirement-surface";
import type { ResolvedExecutionState } from "../mission/execution-state";
import { useLobbyRuntimeState } from "./runtime-state";
import type { AgentRuntimeRecord, AgentSessionRecord } from "../agent-runtime";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import type { ArtifactRecord } from "../../domain/artifact/types";
import type {
  DecisionTicketRecord,
  DispatchRecord,
  EscalationRecord,
  RequirementRoomRecord,
  SupportRequestRecord,
} from "../../domain/delegation/types";
import type {
  Company,
  ConversationStateRecord,
  RequirementAggregateRecord,
  WorkItemRecord,
} from "../../domain";

type CompanyGatewaySession = GatewaySessionRow & { agentId: string };

type BuildLobbyPageSurfaceInput = {
  activeCompany: Company;
  activeConversationStates: ConversationStateRecord[];
  activeWorkItems: WorkItemRecord[];
  activeRequirementAggregates: RequirementAggregateRecord[];
  primaryRequirementId: string | null;
  companySessions: CompanyGatewaySession[];
  companySessionSnapshots: RequirementSessionSnapshot[];
  currentTime: number;
  agentsCache: AgentListEntry[];
  cronCache: CronJob[];
  activeAgentSessions: AgentSessionRecord[];
  activeAgentRuntime: AgentRuntimeRecord[];
  activeAgentStatuses: ReturnType<typeof useCompanyLobbyViewModel>["activeAgentStatuses"];
  sessionsByAgent: Map<string, CompanyGatewaySession[]>;
  sessionExecutions: Map<string, ResolvedExecutionState>;
  activeArtifacts: ArtifactRecord[];
  activeDispatches: DispatchRecord[];
  activeRoomRecords: RequirementRoomRecord[];
  activeSupportRequests: SupportRequestRecord[];
  activeEscalations: EscalationRecord[];
  activeDecisionTickets: DecisionTicketRecord[];
};

export function buildLobbyPageSurface(input: BuildLobbyPageSurfaceInput) {
  const ceoEmployee =
    input.activeCompany.employees.find((employee) => employee.metaRole === "ceo") ?? null;

  const requirementState = buildCurrentRequirementState({
    company: input.activeCompany,
    activeConversationStates: input.activeConversationStates,
    activeWorkItems: input.activeWorkItems,
    activeRequirementAggregates: input.activeRequirementAggregates,
    primaryRequirementId: input.primaryRequirementId,
    activeRoomRecords: input.activeRoomRecords,
    companySessions: input.companySessions,
    companySessionSnapshots: input.companySessionSnapshots,
    currentTime: input.currentTime,
    ceoAgentId: ceoEmployee?.agentId ?? null,
  });

  const requirementSurface = buildLobbyRequirementSurface({
    company: input.activeCompany,
    requirementState,
    currentTime: input.currentTime,
  });

  const ceoSurface = buildCeoControlSurface({
    company: requirementSurface.currentWorkItem
      ? input.activeCompany
      : { ...input.activeCompany, tasks: [], handoffs: [], requests: [] },
    activeSupportRequests: input.activeSupportRequests,
    activeEscalations: input.activeEscalations,
    activeDecisionTickets: input.activeDecisionTickets,
  });

  const operationsSurface = buildLobbyOperationsSurface({
    activeCompany: input.activeCompany,
    activeAgentSessions: input.activeAgentSessions,
    activeAgentRuntime: input.activeAgentRuntime,
    activeAgentStatuses: input.activeAgentStatuses,
    agentsCache: input.agentsCache,
    cronCache: input.cronCache,
    currentTime: input.currentTime,
    companySessions: input.companySessions,
    sessionsByAgent: input.sessionsByAgent,
    sessionExecutions: input.sessionExecutions,
    requirementScope: requirementSurface.requirementScope,
    companyTasks: requirementSurface.companyTasks,
    companyHandoffs: requirementSurface.companyHandoffs,
    companyRequests: requirementSurface.companyRequests,
    slaAlerts: requirementSurface.slaAlerts,
    ceoSurface,
    primaryWorkItem: requirementSurface.currentWorkItem,
    isStrategicRequirement: requirementSurface.isStrategicRequirement,
  });

  const primaryWorkItem = requirementSurface.currentWorkItem;
  const showOperationalQueues = !primaryWorkItem;
  const scopedSessions = [...operationsSurface.activeSessions, ...operationsSurface.completedSessions];

  return {
    ceoEmployee,
    ceoSurface,
    operationsSurface,
    primaryWorkItem,
    requirementState,
    requirementSurface,
    scopedSessions,
    showOperationalQueues,
  };
}

export function useLobbyPageViewModel(input: { isPageVisible: boolean }) {
  const lobbyViewModel = useCompanyLobbyViewModel();
  const connected = useGatewayStore((state) => state.connected);
  const runtimeState = useLobbyRuntimeState({
    activeCompany: lobbyViewModel.activeCompany,
    activeAgentRuntime: lobbyViewModel.activeAgentRuntime,
    activeAgentStatuses: lobbyViewModel.activeAgentStatuses,
    connected,
    isPageVisible: input.isPageVisible,
  });

  const pageSurface = useMemo(() => {
    if (!lobbyViewModel.activeCompany) {
      return null;
    }
    return buildLobbyPageSurface({
      activeCompany: lobbyViewModel.activeCompany,
      activeConversationStates: lobbyViewModel.activeConversationStates,
      activeArtifacts: lobbyViewModel.activeArtifacts,
      activeDispatches: lobbyViewModel.activeDispatches,
      activeRoomRecords: lobbyViewModel.activeRoomRecords,
      activeSupportRequests: lobbyViewModel.activeSupportRequests,
      activeEscalations: lobbyViewModel.activeEscalations,
      activeDecisionTickets: lobbyViewModel.activeDecisionTickets,
      activeAgentSessions: lobbyViewModel.activeAgentSessions,
      activeWorkItems: lobbyViewModel.activeWorkItems,
      activeRequirementAggregates: lobbyViewModel.activeRequirementAggregates,
      primaryRequirementId: lobbyViewModel.primaryRequirementId,
      activeAgentRuntime: lobbyViewModel.activeAgentRuntime,
      activeAgentStatuses: lobbyViewModel.activeAgentStatuses,
      agentsCache: runtimeState.agentsCache,
      companySessions: runtimeState.companySessions,
      companySessionSnapshots: runtimeState.companySessionSnapshots,
      cronCache: runtimeState.cronCache,
      currentTime: runtimeState.currentTime,
      sessionExecutions: runtimeState.sessionExecutions,
      sessionsByAgent: runtimeState.sessionsByAgent,
    });
  }, [
    lobbyViewModel.activeArtifacts,
    lobbyViewModel.activeCompany,
    lobbyViewModel.activeConversationStates,
    lobbyViewModel.activeDispatches,
    lobbyViewModel.activeRoomRecords,
    lobbyViewModel.activeSupportRequests,
    lobbyViewModel.activeEscalations,
    lobbyViewModel.activeDecisionTickets,
    lobbyViewModel.activeAgentSessions,
    lobbyViewModel.activeWorkItems,
    lobbyViewModel.activeRequirementAggregates,
    lobbyViewModel.primaryRequirementId,
    lobbyViewModel.activeAgentRuntime,
    lobbyViewModel.activeAgentStatuses,
    runtimeState.agentsCache,
    runtimeState.companySessionSnapshots,
    runtimeState.companySessions,
    runtimeState.cronCache,
    runtimeState.currentTime,
    runtimeState.sessionExecutions,
    runtimeState.sessionsByAgent,
  ]);

  return {
    ...lobbyViewModel,
    connected,
    ...runtimeState,
    pageSurface,
  };
}
