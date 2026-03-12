import {
  deleteAuthorityDispatch,
  upsertAuthorityDispatch,
} from "../../../application/gateway/authority-control";
import {
  applyAuthorityRuntimeCommandError,
  applyAuthorityRuntimeSnapshotToStore,
} from "../../authority/runtime-command";
import { normalizeDispatchRecord, persistDispatchRecords } from "../persistence/dispatch-persistence";
import type { CompanyRuntimeState, DispatchRecord, RuntimeGet, RuntimeSet } from "./types";
import {
  persistActiveWorkItems,
  reconcileStoredWorkItems,
  syncArtifactLinks,
  syncDispatchLinks,
} from "./work-items";

function dispatchMaterialChanged(existing: DispatchRecord, next: DispatchRecord): boolean {
  return (
    existing.workItemId !== next.workItemId ||
    (existing.roomId ?? null) !== (next.roomId ?? null) ||
    existing.title !== next.title ||
    existing.summary !== next.summary ||
    (existing.fromActorId ?? null) !== (next.fromActorId ?? null) ||
    existing.targetActorIds.join("|") !== next.targetActorIds.join("|") ||
    existing.status !== next.status ||
    (existing.deliveryState ?? null) !== (next.deliveryState ?? null) ||
    (existing.sourceMessageId ?? null) !== (next.sourceMessageId ?? null) ||
    (existing.responseMessageId ?? null) !== (next.responseMessageId ?? null) ||
    (existing.providerRunId ?? null) !== (next.providerRunId ?? null) ||
    (existing.topicKey ?? null) !== (next.topicKey ?? null) ||
    (existing.latestEventId ?? null) !== (next.latestEventId ?? null) ||
    (existing.consumedAt ?? null) !== (next.consumedAt ?? null) ||
    (existing.consumerSessionKey ?? null) !== (next.consumerSessionKey ?? null) ||
    (existing.syncSource ?? null) !== (next.syncSource ?? null)
  );
}

export function persistActiveDispatches(
  companyId: string | null | undefined,
  dispatches: DispatchRecord[],
) {
  persistDispatchRecords(companyId, dispatches);
}

export function buildDispatchActions(
  set: RuntimeSet,
  get: RuntimeGet,
): Pick<CompanyRuntimeState, "upsertDispatchRecord" | "replaceDispatchRecords" | "deleteDispatchRecord"> {
  return {
    upsertDispatchRecord: (dispatch) => {
      const {
        activeCompany,
        authorityBackedState,
        activeDispatches,
        activeWorkItems,
        activeArtifacts,
        activeRoomRecords,
      } = get();
      if (!activeCompany) {
        return;
      }

      const normalized = normalizeDispatchRecord({
        ...dispatch,
        createdAt: dispatch.createdAt || Date.now(),
        updatedAt: dispatch.updatedAt || Date.now(),
      });
      const next = [...activeDispatches];
      const index = next.findIndex((item) => item.id === normalized.id);
      if (index >= 0) {
        const existing = next[index];
        const candidate = normalizeDispatchRecord({ ...existing, ...normalized });
        const existingRevision = existing.revision ?? 1;
        const normalizedRevision = normalized.revision ?? 1;
        const candidateRevision = dispatchMaterialChanged(existing, candidate)
          ? Math.max(existingRevision, normalizedRevision) + 1
          : Math.max(existingRevision, normalizedRevision);
        if (
          candidateRevision < existingRevision ||
          (candidateRevision === existingRevision && normalized.updatedAt <= existing.updatedAt)
        ) {
          return;
        }
        next[index] = {
          ...candidate,
          revision: candidateRevision,
        };
      } else {
        next.push({ ...normalized, revision: normalized.revision || 1 });
      }

      if (authorityBackedState) {
        void upsertAuthorityDispatch({
          companyId: activeCompany.id,
          dispatch: normalized,
        })
          .then((snapshot) => {
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "dispatch.create",
              set,
              get,
            });
          })
          .catch((error) => {
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to upsert dispatch through authority",
            });
          });
        return;
      }

      const sortedDispatches = next.sort((left, right) => right.updatedAt - left.updatedAt);
      const syncedWorkItems = reconcileStoredWorkItems({
        company: activeCompany,
        companyId: activeCompany.id,
        workItems: syncArtifactLinks(
        syncDispatchLinks(activeWorkItems, sortedDispatches),
        activeArtifacts,
        ),
        rooms: activeRoomRecords,
        artifacts: activeArtifacts,
        dispatches: sortedDispatches,
        targetWorkItemIds: [dispatch.workItemId],
        targetRoomIds: [dispatch.roomId],
        targetTopicKeys: [dispatch.topicKey],
      });
      set({ activeDispatches: sortedDispatches, activeWorkItems: syncedWorkItems });
      persistActiveDispatches(activeCompany.id, sortedDispatches);
      persistActiveWorkItems(activeCompany.id, syncedWorkItems);
    },

    replaceDispatchRecords: (dispatches) => {
      const { activeCompany, activeWorkItems, activeArtifacts, activeRoomRecords } = get();
      if (!activeCompany) {
        return;
      }

      const sortedDispatches = [...dispatches].sort((left, right) => right.updatedAt - left.updatedAt);
      const syncedWorkItems = reconcileStoredWorkItems({
        company: activeCompany,
        companyId: activeCompany.id,
        workItems: syncArtifactLinks(syncDispatchLinks(activeWorkItems, sortedDispatches), activeArtifacts),
        rooms: activeRoomRecords,
        artifacts: activeArtifacts,
        dispatches: sortedDispatches,
      });
      set({ activeDispatches: sortedDispatches, activeWorkItems: syncedWorkItems });
      persistActiveDispatches(activeCompany.id, sortedDispatches);
      persistActiveWorkItems(activeCompany.id, syncedWorkItems);
    },

    deleteDispatchRecord: (dispatchId) => {
      const {
        activeCompany,
        authorityBackedState,
        activeDispatches,
        activeWorkItems,
        activeArtifacts,
        activeRoomRecords,
      } = get();
      if (!activeCompany) {
        return;
      }

      const deletedDispatch = activeDispatches.find((dispatch) => dispatch.id === dispatchId) ?? null;
      if (authorityBackedState) {
        void deleteAuthorityDispatch({
          companyId: activeCompany.id,
          dispatchId,
        })
          .then((snapshot) => {
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "dispatch.delete",
              set,
              get,
            });
          })
          .catch((error) => {
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to delete dispatch through authority",
            });
          });
        return;
      }
      const next = activeDispatches.filter((dispatch) => dispatch.id !== dispatchId);
      const syncedWorkItems = reconcileStoredWorkItems({
        company: activeCompany,
        companyId: activeCompany.id,
        workItems: syncArtifactLinks(syncDispatchLinks(activeWorkItems, next), activeArtifacts),
        rooms: activeRoomRecords,
        artifacts: activeArtifacts,
        dispatches: next,
        targetWorkItemIds: [deletedDispatch?.workItemId],
        targetRoomIds: [deletedDispatch?.roomId],
        targetTopicKeys: [deletedDispatch?.topicKey],
      });
      set({ activeDispatches: next, activeWorkItems: syncedWorkItems });
      persistActiveDispatches(activeCompany.id, next);
      persistActiveWorkItems(activeCompany.id, syncedWorkItems);
    },
  };
}
