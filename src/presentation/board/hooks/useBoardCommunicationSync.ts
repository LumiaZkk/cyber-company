import { useCallback, useEffect, useRef, useState } from "react";
import { syncDelegationClosedLoopState } from "../../../application/delegation/closed-loop";
import { gateway } from "../../../application/gateway";
import { appendOperatorActionAuditEvent } from "../../../application/governance/operator-action-audit";
import type { RequirementSessionSnapshot } from "../../../domain/mission/requirement-snapshot";
import type { ArtifactRecord } from "../../../domain/artifact/types";
import type { DispatchRecord } from "../../../domain/delegation/types";
import type { Company } from "../../../domain/org/types";
import { toast } from "../../../components/system/toast-store";
import { resolveSessionActorId } from "../../../lib/sessions";

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

export function useBoardCommunicationSync(input: {
  activeCompany: Company;
  surface: "board" | "requirement_center";
  companySessionSnapshots: RequirementSessionSnapshot[];
  setCompanySessionSnapshots: (snapshots: RequirementSessionSnapshot[]) => void;
  activeArtifacts: ArtifactRecord[];
  activeDispatches: DispatchRecord[];
  replaceDispatchRecords: (dispatches: DispatchRecord[]) => void;
  updateCompany: (patch: Partial<Company>) => Promise<unknown>;
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
  } = input;
  const [recoveringCommunication, setRecoveringCommunication] = useState(false);
  const companyId = activeCompany.id;
  const latestInputRef = useRef({
    activeCompany,
    companySessionSnapshots,
    activeArtifacts,
    activeDispatches,
    replaceDispatchRecords,
    setCompanySessionSnapshots,
    updateCompany,
  });
  const recoveryInFlightRef = useRef(false);
  latestInputRef.current = {
    activeCompany,
    companySessionSnapshots,
    activeArtifacts,
    activeDispatches,
    replaceDispatchRecords,
    setCompanySessionSnapshots,
    updateCompany,
  };

  const handleRecoverCommunication = useCallback(
    async (options?: { silent?: boolean; force?: boolean }) => {
      if (recoveryInFlightRef.current) {
        return;
      }
      recoveryInFlightRef.current = true;
      setRecoveringCommunication(true);
      try {
        const current = latestInputRef.current;
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
            surface: input.surface,
            outcome: "succeeded",
            force: options?.force,
            requestsAdded: summary.requestsAdded,
            requestsUpdated: summary.requestsUpdated,
            tasksRecovered: summary.tasksRecovered,
            handoffsRecovered: summary.handoffsRecovered,
          });
        }
        if (!options?.silent) {
          toast.success(
            "请求闭环已同步",
            `新增 ${summary.requestsAdded}，更新 ${summary.requestsUpdated}，恢复任务 ${summary.tasksRecovered}，恢复交接 ${summary.handoffsRecovered}。`,
          );
        }
      } catch (error) {
        if (!options?.silent) {
          void appendOperatorActionAuditEvent({
            companyId: latestInputRef.current.activeCompany.id,
            action: "communication_recovery",
            surface: input.surface,
            outcome: "failed",
            force: options?.force,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        if (!options?.silent) {
          toast.error("恢复失败", error instanceof Error ? error.message : String(error));
        }
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
    void handleRecoverCommunication({
      silent: true,
      force: latestInputRef.current.companySessionSnapshots.length === 0,
    });
  }, [companyId, connected, handleRecoverCommunication, isPageVisible]);

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
        void handleRecoverCommunication({ silent: true });
      }, 400);
    });
    return () => {
      unsubscribe();
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [activeCompany.employees, connected, handleRecoverCommunication, isPageVisible]);

  return {
    recoveringCommunication,
    handleRecoverCommunication,
  };
}
