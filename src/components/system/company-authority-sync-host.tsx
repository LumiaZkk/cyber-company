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
  useAuthorityRuntimeSyncStore,
} from "../../infrastructure/authority/runtime-sync-store";
import { readCachedAuthorityRuntimeSnapshot } from "../../infrastructure/authority/runtime-cache";
import { buildAuthorityCompatibilityRuntimeSnapshot } from "../../infrastructure/authority/runtime-compatibility-snapshot";
import { useCompanyRuntimeStore } from "../../infrastructure/company/runtime/store";

function buildSnapshot(): AuthorityCompanyRuntimeSnapshot | null {
  const state = useCompanyRuntimeStore.getState();
  const companyId = state.activeCompany?.id ?? null;
  if (!companyId) {
    return null;
  }
  const snapshot: AuthorityCompanyRuntimeSnapshot = {
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
    activeAgentStatusHealth: state.activeAgentStatusHealth,
    updatedAt: Date.now(),
  };
  if (!state.authorityBackedState) {
    return snapshot;
  }
  return buildAuthorityCompatibilityRuntimeSnapshot({
    localRuntime: snapshot,
    authorityRuntime: readCachedAuthorityRuntimeSnapshot(companyId),
  });
}

export function CompanyAuthoritySyncHost() {
  const connected = useGatewayStore((state) => state.connected);
  const flushTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const pullInFlightRef = useRef(false);
  const authorityHydratedRef = useRef(false);
  const lastSyncWarningRef = useRef<{
    push: string | null;
    pull: string | null;
  }>({
    push: null,
    pull: null,
  });

  useEffect(() => {
    if (!connected) {
      return;
    }

    const flush = () => {
      flushTimerRef.current = null;
      if (inFlightRef.current) {
        return;
      }
      if (!useAuthorityRuntimeSyncStore.getState().compatibilityPathEnabled) {
        return;
      }
      const snapshot = buildSnapshot();
      if (!snapshot) {
        return;
      }
      if (
        !authorityHydratedRef.current &&
        ((snapshot.activeAgentStatuses?.length ?? 0) === 0 ||
          snapshot.activeAgentStatusHealth?.coverage === "fallback")
      ) {
        return;
      }
      const signature = buildAuthorityRuntimeSignature(snapshot);
      if (signature === getLastAppliedAuthorityRuntimeSignature()) {
        return;
      }
      inFlightRef.current = true;
      void syncAuthorityCompanyRuntime(snapshot)
        .then((saved) => {
          lastSyncWarningRef.current.push = null;
          applyAuthorityRuntimeSnapshotToStore({
            operation: "push",
            snapshot: saved,
            set: useCompanyRuntimeStore.setState,
            get: useCompanyRuntimeStore.getState,
          });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (lastSyncWarningRef.current.push !== message) {
            console.warn("Failed to sync runtime snapshot to authority", error);
            lastSyncWarningRef.current.push = message;
          }
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
          lastSyncWarningRef.current.pull = null;
          const applied = applyAuthorityRuntimeSnapshotToStore({
            operation: "pull",
            snapshot,
            set: useCompanyRuntimeStore.setState,
            get: useCompanyRuntimeStore.getState,
          });
          if (applied) {
            authorityHydratedRef.current = true;
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (lastSyncWarningRef.current.pull !== message) {
            console.warn("Failed to refresh runtime snapshot from authority", error);
            lastSyncWarningRef.current.pull = message;
          }
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
      if (
        !authorityHydratedRef.current &&
        state.activeAgentStatuses.length > 0 &&
        state.activeAgentStatusHealth.coverage !== "fallback"
      ) {
        authorityHydratedRef.current = true;
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
        eventName === "conversation.updated" ||
        eventName === "requirement.updated" ||
        eventName === "room.updated" ||
        eventName === "round.updated" ||
        eventName === "dispatch.updated" ||
        eventName === "artifact.updated" ||
        eventName === "decision.updated" ||
        eventName === "agent.runtime.updated"
      ) {
        refreshRemoteRuntime();
      }
    });

    refreshRemoteRuntime();

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
