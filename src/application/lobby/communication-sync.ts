import { useCallback, useEffect, useRef, useState } from "react";
import { syncDelegationClosedLoopState } from "../delegation/closed-loop";
import { gateway } from "../gateway";
import { appendOperatorActionAuditEvent } from "../governance/operator-action-audit";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import type { Company } from "../../domain/org/types";
import type { ArtifactRecord } from "../../domain/artifact/types";
import type { DispatchRecord } from "../../domain/delegation/types";
import { resolveSessionActorId } from "../../lib/sessions";

function extractChatSyncSessionKey(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = payload as { sessionKey?: unknown; state?: unknown };
  if (typeof candidate.sessionKey !== "string") {
    return null;
  }
  if (
    candidate.state !== "final" &&
    candidate.state !== "error" &&
    candidate.state !== "aborted"
  ) {
    return null;
  }
  return candidate.sessionKey;
}

export function useLobbyCommunicationSyncState(params: {
  activeCompany: Company;
  surface?: "lobby";
  companySessionSnapshots: RequirementSessionSnapshot[];
  setCompanySessionSnapshots: (snapshots: RequirementSessionSnapshot[]) => void;
  activeArtifacts: ArtifactRecord[];
  activeDispatches: DispatchRecord[];
  replaceDispatchRecords: (dispatches: DispatchRecord[]) => void;
  updateCompany: (patch: Partial<Company>) => Promise<unknown> | void;
  connected: boolean;
  isPageVisible: boolean;
}) {
  const {
    activeCompany,
    companySessionSnapshots,
    setCompanySessionSnapshots,
    activeArtifacts,
    activeDispatches,
    replaceDispatchRecords,
    updateCompany,
    connected,
    isPageVisible,
  } = params;
  const [recoveringCommunication, setRecoveringCommunication] = useState(false);
  const companyId = activeCompany.id;
  const latestParamsRef = useRef({
    activeCompany,
    companySessionSnapshots,
    activeArtifacts,
    activeDispatches,
    replaceDispatchRecords,
    setCompanySessionSnapshots,
    updateCompany,
  });
  const recoveryInFlightRef = useRef(false);
  latestParamsRef.current = {
    activeCompany,
    companySessionSnapshots,
    activeArtifacts,
    activeDispatches,
    replaceDispatchRecords,
    setCompanySessionSnapshots,
    updateCompany,
  };

  const recoverCommunication = useCallback(
    async (options?: { silent?: boolean; force?: boolean }) => {
      if (recoveryInFlightRef.current) {
        return null;
      }
      recoveryInFlightRef.current = true;
      setRecoveringCommunication(true);
      try {
        const current = latestParamsRef.current;
        const { companyPatch, dispatches, sessionSnapshots, summary } =
          await syncDelegationClosedLoopState({
            company: current.activeCompany,
            previousSnapshots: current.companySessionSnapshots,
            activeArtifacts: current.activeArtifacts,
            activeDispatches: current.activeDispatches,
            force: options?.force,
          });
        current.setCompanySessionSnapshots(sessionSnapshots);
        current.replaceDispatchRecords(dispatches);
        await current.updateCompany(companyPatch);
        if (!options?.silent) {
          void appendOperatorActionAuditEvent({
            companyId: current.activeCompany.id,
            action: "communication_recovery",
            surface: params.surface ?? "lobby",
            outcome: "succeeded",
            force: options?.force,
            requestsAdded: summary.requestsAdded,
            requestsUpdated: summary.requestsUpdated,
            tasksRecovered: summary.tasksRecovered,
            handoffsRecovered: summary.handoffsRecovered,
          });
        }
        return summary;
      } catch (error) {
        if (!options?.silent) {
          void appendOperatorActionAuditEvent({
            companyId: latestParamsRef.current.activeCompany.id,
            action: "communication_recovery",
            surface: params.surface ?? "lobby",
            outcome: "failed",
            force: options?.force,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      } finally {
        recoveryInFlightRef.current = false;
        setRecoveringCommunication(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!connected || !isPageVisible) {
      return;
    }
    void recoverCommunication({
      silent: true,
      force: latestParamsRef.current.companySessionSnapshots.length === 0,
    }).catch(() => undefined);
  }, [companyId, connected, isPageVisible, recoverCommunication]);

  useEffect(() => {
    if (!connected || !isPageVisible) {
      return;
    }
    const companyAgentIds = new Set(activeCompany.employees.map((employee) => employee.agentId));
    let timerId: number | null = null;
    const unsubscribe = gateway.subscribe("chat", (payload) => {
      const sessionKey = extractChatSyncSessionKey(payload);
      const actorId = resolveSessionActorId(sessionKey);
      if (!actorId || !companyAgentIds.has(actorId)) {
        return;
      }
      if (timerId !== null) {
        return;
      }
      timerId = window.setTimeout(() => {
        timerId = null;
        void recoverCommunication({ silent: true }).catch(() => undefined);
      }, 400);
    });
    return () => {
      unsubscribe();
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [activeCompany.employees, connected, recoverCommunication, isPageVisible]);

  return {
    recoveringCommunication,
    recoverCommunication,
  };
}
