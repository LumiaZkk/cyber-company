import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyAuthorityRuntimeCommandError } from "./runtime-command";
import { useAuthorityRuntimeSyncStore } from "./runtime-sync-store";

describe("applyAuthorityRuntimeCommandError", () => {
  beforeEach(() => {
    useAuthorityRuntimeSyncStore.setState({
      compatibilityPathEnabled: true,
      commandRoutes: [],
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
    });
    vi.restoreAllMocks();
  });

  it("logs the first command error but suppresses repeated identical warnings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const set = vi.fn();
    const error = new Error("Authority 服务不可达");

    applyAuthorityRuntimeCommandError({
      error,
      set,
      fallbackMessage: "Failed to sync artifact mirrors through authority",
    });
    applyAuthorityRuntimeCommandError({
      error,
      set,
      fallbackMessage: "Failed to sync artifact mirrors through authority",
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(2);
    expect(useAuthorityRuntimeSyncStore.getState().lastErrorOperation).toBe("command");
    expect(useAuthorityRuntimeSyncStore.getState().lastError).toBe("Authority 服务不可达");
  });
});
