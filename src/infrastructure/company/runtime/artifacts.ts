import {
  deleteAuthorityArtifact,
  syncAuthorityArtifactMirrors,
  upsertAuthorityArtifact,
} from "../../../application/gateway/authority-control";
import {
  applyAuthorityRuntimeCommandError,
  applyAuthorityRuntimeSnapshotToStore,
} from "../../authority/runtime-command";
import { normalizeArtifactRecord, persistArtifactRecords } from "../persistence/artifact-persistence";
import type { ArtifactRecord, CompanyRuntimeState, RuntimeGet, RuntimeSet } from "./types";
import {
  persistActiveWorkItems,
  reconcileStoredWorkItems,
  syncArtifactLinks,
  syncDispatchLinks,
} from "./work-items";

function artifactMaterialChanged(existing: ArtifactRecord, next: ArtifactRecord): boolean {
  return (
    existing.workItemId !== next.workItemId ||
    existing.title !== next.title ||
    existing.kind !== next.kind ||
    existing.status !== next.status ||
    (existing.ownerActorId ?? null) !== (next.ownerActorId ?? null) ||
    (existing.providerId ?? null) !== (next.providerId ?? null) ||
    (existing.sourceActorId ?? null) !== (next.sourceActorId ?? null) ||
    (existing.sourceName ?? null) !== (next.sourceName ?? null) ||
    (existing.sourcePath ?? null) !== (next.sourcePath ?? null) ||
    (existing.sourceUrl ?? null) !== (next.sourceUrl ?? null) ||
    (existing.summary ?? null) !== (next.summary ?? null) ||
    (existing.content ?? null) !== (next.content ?? null) ||
    (existing.resourceType ?? null) !== (next.resourceType ?? null) ||
    JSON.stringify(existing.resourceTags ?? []) !== JSON.stringify(next.resourceTags ?? [])
  );
}

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
      const {
        activeCompany,
        authorityBackedState,
        activeArtifacts,
        activeWorkItems,
        activeDispatches,
        activeRoomRecords,
      } = get();
      if (!activeCompany) {
        return;
      }

      const normalized = normalizeArtifactRecord({
        ...artifact,
        updatedAt: artifact.updatedAt || Date.now(),
        createdAt: artifact.createdAt || Date.now(),
      });
      const next = [...activeArtifacts];
      const index = next.findIndex((item) => item.id === normalized.id);
      if (index >= 0) {
        const existing = next[index];
        const candidate = normalizeArtifactRecord({ ...existing, ...normalized });
        const existingRevision = existing.revision ?? 1;
        const normalizedRevision = normalized.revision ?? 1;
        const candidateRevision = artifactMaterialChanged(existing, candidate)
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
        void upsertAuthorityArtifact({
          companyId: activeCompany.id,
          artifact: normalized,
        })
          .then((snapshot) => {
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "artifact.upsert",
              set,
              get,
            });
          })
          .catch((error) => {
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to upsert artifact through authority",
            });
          });
        return;
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
      const {
        activeCompany,
        authorityBackedState,
        activeArtifacts,
        activeWorkItems,
        activeDispatches,
        activeRoomRecords,
      } = get();
      if (!activeCompany) {
        return;
      }

      if (authorityBackedState) {
        void syncAuthorityArtifactMirrors({
          companyId: activeCompany.id,
          artifacts,
          mirrorPrefix,
        })
          .then((snapshot) => {
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "artifact.sync-mirror",
              set,
              get,
            });
          })
          .catch((error) => {
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to sync artifact mirrors through authority",
            });
          });
        return;
      }

      const preserved = activeArtifacts.filter((artifact) => !artifact.id.startsWith(mirrorPrefix));
      const mergedById = new Map<string, ArtifactRecord>();
      for (const artifact of preserved) {
        mergedById.set(artifact.id, artifact);
      }
      const normalizedIncoming = artifacts.map((artifact) =>
        normalizeArtifactRecord({
          ...artifact,
          updatedAt: artifact.updatedAt || Date.now(),
          createdAt: artifact.createdAt || Date.now(),
        }),
      );
      for (const artifact of normalizedIncoming) {
        const existing = mergedById.get(artifact.id);
        if (!existing) {
          mergedById.set(artifact.id, artifact);
          continue;
        }
        const candidate = normalizeArtifactRecord({
          ...existing,
          ...artifact,
          summary: artifact.summary ?? existing.summary,
          content: artifact.content ?? existing.content,
        });
        const existingRevision = existing.revision ?? 1;
        const artifactRevision = artifact.revision ?? 1;
        mergedById.set(artifact.id, {
          ...candidate,
          revision: artifactMaterialChanged(existing, candidate)
            ? Math.max(existingRevision, artifactRevision) + 1
            : Math.max(existingRevision, artifactRevision),
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
      const {
        activeCompany,
        authorityBackedState,
        activeArtifacts,
        activeWorkItems,
        activeDispatches,
        activeRoomRecords,
      } = get();
      if (!activeCompany) {
        return;
      }

      const deletedArtifact = activeArtifacts.find((artifact) => artifact.id === artifactId) ?? null;
      if (authorityBackedState) {
        void deleteAuthorityArtifact({
          companyId: activeCompany.id,
          artifactId,
        })
          .then((snapshot) => {
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "artifact.delete",
              set,
              get,
            });
          })
          .catch((error) => {
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to delete artifact through authority",
            });
          });
        return;
      }
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
