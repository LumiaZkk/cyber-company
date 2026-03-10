import { useCallback, useEffect, useState } from "react";
import { syncDelegationClosedLoopState } from "../../../application/delegation/closed-loop";
import { gateway } from "../../../application/gateway";
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

  const handleRecoverCommunication = useCallback(
    async (options?: { silent?: boolean; force?: boolean }) => {
      setRecoveringCommunication(true);
      try {
        const { companyPatch, dispatches, sessionSnapshots, summary } =
          await syncDelegationClosedLoopState({
            company: activeCompany,
            previousSnapshots: companySessionSnapshots,
            activeArtifacts,
            activeDispatches,
            force: options?.force,
          });
        setCompanySessionSnapshots(sessionSnapshots);
        replaceDispatchRecords(dispatches);
        await updateCompany(companyPatch);
        if (!options?.silent) {
          toast.success(
            "请求闭环已同步",
            `新增 ${summary.requestsAdded}，更新 ${summary.requestsUpdated}，恢复任务 ${summary.tasksRecovered}，恢复交接 ${summary.handoffsRecovered}。`,
          );
        }
      } catch (error) {
        if (!options?.silent) {
          toast.error("恢复失败", error instanceof Error ? error.message : String(error));
        }
      } finally {
        setRecoveringCommunication(false);
      }
    },
    [
      activeArtifacts,
      activeCompany,
      activeDispatches,
      companySessionSnapshots,
      replaceDispatchRecords,
      setCompanySessionSnapshots,
      updateCompany,
    ],
  );

  useEffect(() => {
    if (!connected || !isPageVisible) {
      return;
    }
    void handleRecoverCommunication({
      silent: true,
      force: companySessionSnapshots.length === 0,
    });
  }, [companySessionSnapshots.length, connected, handleRecoverCommunication, isPageVisible]);

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
