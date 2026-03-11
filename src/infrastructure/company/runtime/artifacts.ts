import { persistArtifactRecords } from "../persistence/artifact-persistence";
import type { ArtifactRecord, CompanyRuntimeState, RuntimeGet, RuntimeSet } from "./types";
import {
  persistActiveWorkItems,
  reconcileStoredWorkItems,
  syncArtifactLinks,
  syncDispatchLinks,
} from "./work-items";

export function persistActiveArtifacts(
  companyId: string | null | undefined,
  artifacts: ArtifactRecord[],
) {
  persistArtifactRecords(companyId, artifacts);
}

export function buildArtifactActions(
  set: RuntimeSet,
  get: RuntimeGet,
): Pick<CompanyRuntimeState, "upsertArtifactRecord" | "syncArtifactMirrorRecords" | "deleteArtifactRecord"> {
  return {
    upsertArtifactRecord: (artifact) => {
      const { activeCompany, activeArtifacts, activeWorkItems, activeDispatches, activeRoomRecords } = get();
      if (!activeCompany) {
        return;
      }

      const normalized: ArtifactRecord = {
        ...artifact,
        updatedAt: artifact.updatedAt || Date.now(),
        createdAt: artifact.createdAt || Date.now(),
      };
      const next = [...activeArtifacts];
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

      const sortedArtifacts = next.sort((left, right) => right.updatedAt - left.updatedAt);
      const syncedWorkItems = reconcileStoredWorkItems({
        company: activeCompany,
        companyId: activeCompany.id,
        workItems: syncDispatchLinks(
        syncArtifactLinks(activeWorkItems, sortedArtifacts),
        activeDispatches,
        ),
        rooms: activeRoomRecords,
        artifacts: sortedArtifacts,
        dispatches: activeDispatches,
        targetWorkItemIds: [artifact.workItemId],
      });
      set({ activeArtifacts: sortedArtifacts, activeWorkItems: syncedWorkItems });
      persistActiveArtifacts(activeCompany.id, sortedArtifacts);
      persistActiveWorkItems(activeCompany.id, syncedWorkItems);
    },

    syncArtifactMirrorRecords: (artifacts, mirrorPrefix = "workspace:") => {
      const { activeCompany, activeArtifacts, activeWorkItems, activeDispatches, activeRoomRecords } = get();
      if (!activeCompany) {
        return;
      }

      const preserved = activeArtifacts.filter((artifact) => !artifact.id.startsWith(mirrorPrefix));
      const mergedById = new Map<string, ArtifactRecord>();
      for (const artifact of preserved) {
        mergedById.set(artifact.id, artifact);
      }
      const normalizedIncoming = artifacts.map((artifact) => ({
        ...artifact,
        updatedAt: artifact.updatedAt || Date.now(),
        createdAt: artifact.createdAt || Date.now(),
      }));
      for (const artifact of normalizedIncoming) {
        const existing = mergedById.get(artifact.id);
        if (!existing) {
          mergedById.set(artifact.id, artifact);
          continue;
        }
        mergedById.set(artifact.id, {
          ...existing,
          ...artifact,
          summary: artifact.summary ?? existing.summary,
          content: artifact.content ?? existing.content,
        });
      }
      const sortedArtifacts = [...mergedById.values()].sort(
        (left, right) => right.updatedAt - left.updatedAt,
      );
      const syncedWorkItems = reconcileStoredWorkItems({
        company: activeCompany,
        companyId: activeCompany.id,
        workItems: syncDispatchLinks(
        syncArtifactLinks(activeWorkItems, sortedArtifacts),
        activeDispatches,
        ),
        rooms: activeRoomRecords,
        artifacts: sortedArtifacts,
        dispatches: activeDispatches,
        targetWorkItemIds: normalizedIncoming.map((artifact) => artifact.workItemId),
      });
      set({ activeArtifacts: sortedArtifacts, activeWorkItems: syncedWorkItems });
      persistActiveArtifacts(activeCompany.id, sortedArtifacts);
      persistActiveWorkItems(activeCompany.id, syncedWorkItems);
    },

    deleteArtifactRecord: (artifactId) => {
      const { activeCompany, activeArtifacts, activeWorkItems, activeDispatches, activeRoomRecords } = get();
      if (!activeCompany) {
        return;
      }

      const deletedArtifact = activeArtifacts.find((artifact) => artifact.id === artifactId) ?? null;
      const next = activeArtifacts.filter((artifact) => artifact.id !== artifactId);
      const syncedWorkItems = reconcileStoredWorkItems({
        company: activeCompany,
        companyId: activeCompany.id,
        workItems: syncDispatchLinks(syncArtifactLinks(activeWorkItems, next), activeDispatches),
        rooms: activeRoomRecords,
        artifacts: next,
        dispatches: activeDispatches,
        targetWorkItemIds: [deletedArtifact?.workItemId],
      });
      set({ activeArtifacts: next, activeWorkItems: syncedWorkItems });
      persistActiveArtifacts(activeCompany.id, next);
      persistActiveWorkItems(activeCompany.id, syncedWorkItems);
    },
  };
}
