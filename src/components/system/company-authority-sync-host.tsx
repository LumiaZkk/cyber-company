import { useEffect, useRef } from "react";
import { gateway, useGatewayStore } from "../../application/gateway";
import {
  getAuthorityCompanyRuntime,
  syncAuthorityCompanyRuntime,
} from "../../application/gateway/authority-control";
import type { AuthorityCompanyRuntimeSnapshot } from "../../infrastructure/authority/contract";
import { applyAuthorityRuntimeSnapshotToStore } from "../../infrastructure/authority/runtime-command";
import {
  buildAuthorityRuntimeSignature,
  getLastAppliedAuthorityRuntimeSignature,
  recordAuthorityRuntimeSyncError,
} from "../../infrastructure/authority/runtime-sync-store";
import { useCompanyRuntimeStore } from "../../infrastructure/company/runtime/store";

function buildSnapshot(): AuthorityCompanyRuntimeSnapshot | null {
  const state = useCompanyRuntimeStore.getState();
  const companyId = state.activeCompany?.id ?? null;
  if (!companyId) {
    return null;
  }
  return {
    companyId,
    activeRoomRecords: state.activeRoomRecords,
    activeMissionRecords: state.activeMissionRecords,
    activeConversationStates: state.activeConversationStates,
    activeWorkItems: state.activeWorkItems,
    activeRequirementAggregates: state.activeRequirementAggregates,
    activeRequirementEvidence: state.activeRequirementEvidence,
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
    updatedAt: Date.now(),
  };
}

export function CompanyAuthoritySyncHost() {
  const connected = useGatewayStore((state) => state.connected);
  const flushTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const pullInFlightRef = useRef(false);

  useEffect(() => {
    if (!connected) {
      return;
    }

    const flush = () => {
      flushTimerRef.current = null;
      if (inFlightRef.current) {
        return;
      }
      const snapshot = buildSnapshot();
      if (!snapshot) {
        return;
      }
      const signature = buildAuthorityRuntimeSignature(snapshot);
      if (signature === getLastAppliedAuthorityRuntimeSignature()) {
        return;
      }
      inFlightRef.current = true;
      void syncAuthorityCompanyRuntime(snapshot)
        .then((saved) => {
          applyAuthorityRuntimeSnapshotToStore({
            operation: "push",
            snapshot: saved,
            set: useCompanyRuntimeStore.setState,
            get: useCompanyRuntimeStore.getState,
          });
        })
        .catch((error) => {
          console.warn("Failed to sync runtime snapshot to authority", error);
          recordAuthorityRuntimeSyncError("push", error);
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const refreshRemoteRuntime = () => {
      if (pullInFlightRef.current) {
        return;
      }
      const activeCompany = useCompanyRuntimeStore.getState().activeCompany;
      if (!activeCompany) {
        return;
      }
      pullInFlightRef.current = true;
      void getAuthorityCompanyRuntime(activeCompany.id)
        .then((snapshot) => {
          applyAuthorityRuntimeSnapshotToStore({
            operation: "pull",
            snapshot,
            set: useCompanyRuntimeStore.setState,
            get: useCompanyRuntimeStore.getState,
          });
        })
        .catch((error) => {
          console.warn("Failed to refresh runtime snapshot from authority", error);
          recordAuthorityRuntimeSyncError("pull", error);
        })
        .finally(() => {
          pullInFlightRef.current = false;
        });
    };

    const unsubscribeStore = useCompanyRuntimeStore.subscribe((state) => {
      if (!state.activeCompany) {
        return;
      }
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(flush, 250);
    });

    const unsubscribeAuthority = gateway.subscribe("*", (raw) => {
      if (!raw || typeof raw !== "object") {
        return;
      }
      const event = raw as { event?: unknown; payload?: { companyId?: unknown } };
      const eventName = typeof event.event === "string" ? event.event : null;
      const activeCompany = useCompanyRuntimeStore.getState().activeCompany;
      if (!eventName || !activeCompany) {
        return;
      }
      const targetCompanyId =
        typeof event.payload?.companyId === "string" ? event.payload.companyId : activeCompany.id;
      if (targetCompanyId !== activeCompany.id) {
        return;
      }
      if (eventName === "bootstrap.updated") {
        void useCompanyRuntimeStore.getState().loadConfig();
        return;
      }
      if (
        eventName === "company.updated" ||
        eventName === "requirement.updated" ||
        eventName === "room.updated" ||
        eventName === "dispatch.updated" ||
        eventName === "artifact.updated" ||
        eventName === "decision.updated" ||
        eventName === "agent.runtime.updated"
      ) {
        refreshRemoteRuntime();
      }
    });

    flush();

    return () => {
      unsubscribeStore();
      unsubscribeAuthority();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, [connected]);

  return null;
}
