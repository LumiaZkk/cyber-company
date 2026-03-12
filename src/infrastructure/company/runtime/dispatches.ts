import {
  deleteAuthorityDispatch,
  upsertAuthorityDispatch,
} from "../../../application/gateway/authority-control";
import {
  applyAuthorityRuntimeCommandError,
  applyAuthorityRuntimeSnapshotToStore,
} from "../../authority/runtime-command";
import { persistDispatchRecords } from "../persistence/dispatch-persistence";
import type { CompanyRuntimeState, DispatchRecord, RuntimeGet, RuntimeSet } from "./types";
import {
  persistActiveWorkItems,
  reconcileStoredWorkItems,
  syncArtifactLinks,
  syncDispatchLinks,
} from "./work-items";

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

      const normalized: DispatchRecord = {
        ...dispatch,
        createdAt: dispatch.createdAt || Date.now(),
        updatedAt: dispatch.updatedAt || Date.now(),
      };
      const next = [...activeDispatches];
      const index = next.findIndex((item) => item.id === normalized.id);
      if (index >= 0) {
        const existing = next[index];
        if (normalized.updatedAt <= existing.updatedAt) {
          return;
        }
        next[index] = { ...existing, ...normalized };
      } else {
        next.push(normalized);
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
