import { useEffect, useRef } from "react";
import { authorityClient } from "../../infrastructure/authority/client";
import { writeCachedAuthorityRuntimeSnapshot } from "../../infrastructure/authority/runtime-cache";
import { useCompanyRuntimeStore } from "../../infrastructure/company/runtime/store";
import type { AuthorityCompanyRuntimeSnapshot } from "../../infrastructure/authority/contract";

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
    updatedAt: Date.now(),
  };
}

export function CompanyAuthoritySyncHost() {
  const lastSignatureRef = useRef<string | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const flush = () => {
      flushTimerRef.current = null;
      if (inFlightRef.current) {
        return;
      }
      const snapshot = buildSnapshot();
      if (!snapshot) {
        return;
      }
      const signature = JSON.stringify(snapshot);
      if (signature === lastSignatureRef.current) {
        return;
      }
      inFlightRef.current = true;
      void authorityClient
        .syncRuntime(snapshot.companyId, { snapshot })
        .then((saved) => {
          writeCachedAuthorityRuntimeSnapshot(saved);
          lastSignatureRef.current = JSON.stringify(saved);
        })
        .catch((error) => {
          console.warn("Failed to sync runtime snapshot to authority", error);
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const unsubscribe = useCompanyRuntimeStore.subscribe((state) => {
      if (!state.activeCompany) {
        return;
      }
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(flush, 250);
    });

    flush();

    return () => {
      unsubscribe();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  return null;
}
