import { create } from "zustand";
import type { AuthorityCompanyRuntimeSnapshot } from "./contract";

export type AuthorityRuntimeSyncOperation = "push" | "pull" | "command";
export type AuthorityRuntimeSyncMode = "compatibility_snapshot" | "command_preferred";

type AuthorityRuntimeSyncState = {
  compatibilityPathEnabled: boolean;
  commandRoutes: string[];
  mode: AuthorityRuntimeSyncMode;
  lastSnapshotUpdatedAt: number | null;
  lastAppliedSignature: string | null;
  lastAppliedSource: AuthorityRuntimeSyncOperation | null;
  lastAppliedAt: number | null;
  lastPushAt: number | null;
  lastPullAt: number | null;
  lastCommandAt: number | null;
  pushCount: number;
  pullCount: number;
  commandCount: number;
  lastError: string | null;
  lastErrorAt: number | null;
  lastErrorOperation: AuthorityRuntimeSyncOperation | null;
};

const DEFAULT_COMMAND_ROUTES = [
  "requirement.transition",
  "requirement.promote",
  "room.append",
  "room.delete",
  "room-bindings.upsert",
  "dispatch.create",
  "dispatch.delete",
  "artifact.upsert",
  "artifact.sync-mirror",
  "artifact.delete",
];

export function buildAuthorityRuntimeSignature(snapshot: AuthorityCompanyRuntimeSnapshot) {
  return JSON.stringify({
    ...snapshot,
    updatedAt: 0,
  });
}

export const useAuthorityRuntimeSyncStore = create<AuthorityRuntimeSyncState>(() => ({
  compatibilityPathEnabled: true,
  commandRoutes: DEFAULT_COMMAND_ROUTES,
  mode: "compatibility_snapshot",
  lastSnapshotUpdatedAt: null,
  lastAppliedSignature: null,
  lastAppliedSource: null,
  lastAppliedAt: null,
  lastPushAt: null,
  lastPullAt: null,
  lastCommandAt: null,
  pushCount: 0,
  pullCount: 0,
  commandCount: 0,
  lastError: null,
  lastErrorAt: null,
  lastErrorOperation: null,
}));

export function getLastAppliedAuthorityRuntimeSignature() {
  return useAuthorityRuntimeSyncStore.getState().lastAppliedSignature;
}

export function isAuthorityRuntimeSnapshotStale(snapshot: AuthorityCompanyRuntimeSnapshot) {
  const lastSnapshotUpdatedAt = useAuthorityRuntimeSyncStore.getState().lastSnapshotUpdatedAt;
  return typeof lastSnapshotUpdatedAt === "number" && snapshot.updatedAt < lastSnapshotUpdatedAt;
}

export function recordAuthorityRuntimeSyncSuccess(input: {
  operation: AuthorityRuntimeSyncOperation;
  snapshot: AuthorityCompanyRuntimeSnapshot;
  route?: string;
}) {
  const timestamp = Date.now();
  const signature = buildAuthorityRuntimeSignature(input.snapshot);
  useAuthorityRuntimeSyncStore.setState((state) => {
    const nextCommandRoutes =
      input.route && !state.commandRoutes.includes(input.route)
        ? [...state.commandRoutes, input.route]
        : state.commandRoutes;
    return {
      ...state,
      commandRoutes: nextCommandRoutes,
      mode: input.operation === "command" || state.commandCount > 0 ? "command_preferred" : state.mode,
      lastSnapshotUpdatedAt: input.snapshot.updatedAt,
      lastAppliedSignature: signature,
      lastAppliedSource: input.operation,
      lastAppliedAt: timestamp,
      lastPushAt: input.operation === "push" ? timestamp : state.lastPushAt,
      lastPullAt: input.operation === "pull" ? timestamp : state.lastPullAt,
      lastCommandAt: input.operation === "command" ? timestamp : state.lastCommandAt,
      pushCount: input.operation === "push" ? state.pushCount + 1 : state.pushCount,
      pullCount: input.operation === "pull" ? state.pullCount + 1 : state.pullCount,
      commandCount: input.operation === "command" ? state.commandCount + 1 : state.commandCount,
      lastError: null,
      lastErrorAt: state.lastErrorAt,
      lastErrorOperation: state.lastErrorOperation,
    };
  });
}

export function recordAuthorityRuntimeSyncError(
  operation: AuthorityRuntimeSyncOperation,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  useAuthorityRuntimeSyncStore.setState((state) => ({
    ...state,
    lastError: message,
    lastErrorAt: Date.now(),
    lastErrorOperation: operation,
  }));
}
