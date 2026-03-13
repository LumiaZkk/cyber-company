import type { CompanyRuntimeState } from "../company/runtime/types";
import type { AuthorityCompanyRuntimeSnapshot } from "./contract";
import { writeCachedAuthorityRuntimeSnapshot } from "./runtime-cache";
import { buildAuthorityRuntimeStatePatch } from "./runtime-state-patch";
import {
  isAuthorityRuntimeSnapshotStale,
  recordAuthorityRuntimeSyncError,
  recordAuthorityRuntimeSyncSuccess,
  useAuthorityRuntimeSyncStore,
  type AuthorityRuntimeSyncOperation,
} from "./runtime-sync-store";

export function applyAuthorityRuntimeSnapshotToStore(input: {
  operation: AuthorityRuntimeSyncOperation;
  snapshot: AuthorityCompanyRuntimeSnapshot;
  route?: string;
  set: (partial: Partial<CompanyRuntimeState>) => void;
  get: () => CompanyRuntimeState;
}) {
  if (isAuthorityRuntimeSnapshotStale(input.snapshot)) {
    return false;
  }
  writeCachedAuthorityRuntimeSnapshot(input.snapshot);
  recordAuthorityRuntimeSyncSuccess({
    operation: input.operation,
    snapshot: input.snapshot,
    route: input.route,
  });
  input.set(
    buildAuthorityRuntimeStatePatch({
      snapshot: input.snapshot,
      activeCompany: input.get().activeCompany,
    }),
  );
  return true;
}

export function applyAuthorityRuntimeCommandError(input: {
  error: unknown;
  set: (partial: Partial<CompanyRuntimeState>) => void;
  fallbackMessage: string;
}) {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const runtimeSyncState = useAuthorityRuntimeSyncStore.getState();
  if (
    runtimeSyncState.lastErrorOperation !== "command"
    || runtimeSyncState.lastError !== message
  ) {
    console.warn(input.fallbackMessage, input.error);
  }
  recordAuthorityRuntimeSyncError("command", input.error);
  input.set({ error: message });
}
