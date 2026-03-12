import { useCompanyRuntimeCommands } from "../../infrastructure/company/runtime/commands";
import {
  readCompanyRuntimeState,
  selectConversationWorkspaceState,
  selectMissionBoardState,
} from "../../infrastructure/company/runtime/selectors";
import { useCompanyRuntimeStore } from "../../infrastructure/company/runtime/store";
import { useShallow } from "zustand/react/shallow";

export function useMissionBoardQuery() {
  return useCompanyRuntimeStore(useShallow(selectMissionBoardState));
}

export function useMissionBoardApp() {
  const {
    replaceDispatchRecords,
    upsertTask,
    updateCompany,
    applyRequirementTransition,
    upsertWorkItemRecord,
    upsertDecisionTicketRecord,
    ensureRequirementRoomForAggregate,
  } = useCompanyRuntimeCommands();
  return {
    replaceDispatchRecords,
    upsertTask,
    updateCompany,
    applyRequirementTransition,
    upsertWorkItemRecord,
    upsertDecisionTicketRecord,
    ensureRequirementRoomForAggregate,
  };
}

export function useConversationWorkspaceQuery() {
  return useCompanyRuntimeStore(useShallow(selectConversationWorkspaceState));
}

export function useConversationWorkspaceChatPageQuery() {
  return useCompanyRuntimeStore(
    useShallow((state) => ({
      config: state.config,
      activeCompany: state.activeCompany,
      authorityBackedState: state.authorityBackedState,
      activeRoomRecords: state.activeRoomRecords,
      activeMissionRecords: state.activeMissionRecords,
      activeConversationStates: state.activeConversationStates,
      activeWorkItems: state.activeWorkItems,
      activeRequirementAggregates: state.activeRequirementAggregates,
      activeRequirementEvidence: state.activeRequirementEvidence,
      primaryRequirementId: state.primaryRequirementId,
      activeRoundRecords: state.activeRoundRecords,
      activeDispatches: state.activeDispatches,
      activeRoomBindings: state.activeRoomBindings,
      activeDecisionTickets: state.activeDecisionTickets,
    })),
  );
}

export function useConversationArtifacts() {
  return useCompanyRuntimeStore((state) => state.activeArtifacts);
}

export function useConversationDispatches() {
  return useCompanyRuntimeStore((state) => state.activeDispatches);
}

export function useConversationWorkspaceApp() {
  const {
    updateCompany,
    upsertTask,
    upsertHandoff,
    upsertRequest,
    upsertRoomRecord,
    upsertRoundRecord,
    deleteRoundRecord,
    appendRoomMessages,
    ensureRequirementRoomForAggregate,
    upsertRoomConversationBindings,
    upsertMissionRecord,
    setConversationCurrentWorkKey,
    setConversationDraftRequirement,
    clearConversationState,
    upsertWorkItemRecord,
    upsertDecisionTicketRecord,
    upsertDispatchRecord,
    replaceDispatchRecords,
    switchCompany,
  } = useCompanyRuntimeCommands();
  return {
    updateCompany,
    upsertTask,
    upsertHandoff,
    upsertRequest,
    upsertRoomRecord,
    upsertRoundRecord,
    deleteRoundRecord,
    appendRoomMessages,
    ensureRequirementRoomForAggregate,
    upsertRoomConversationBindings,
    upsertMissionRecord,
    setConversationCurrentWorkKey,
    setConversationDraftRequirement,
    clearConversationState,
    upsertWorkItemRecord,
    upsertDecisionTicketRecord,
    upsertDispatchRecord,
    replaceDispatchRecords,
    switchCompany,
  };
}

export function readConversationWorkspaceState() {
  return selectConversationWorkspaceState(readCompanyRuntimeState());
}

export {
  getRequirementStatusToneClass,
  resolveRequirementProductStatus,
  type RequirementProductStatus,
  type RequirementProductStatusId,
  type RequirementProductStatusTone,
} from "./requirement-product-status";
