import { describe, expect, it } from "vitest";
import type { AuthorityHealthSnapshot } from "../../infrastructure/authority/contract";
import {
  collectAuthorityGuidance,
  resolveAuthorityControlState,
  resolveAuthorityStorageState,
} from "./authority-health";

function createHealthSnapshot(
  overrides: Partial<AuthorityHealthSnapshot> = {},
): AuthorityHealthSnapshot {
  return {
    ok: true,
    executor: {
      adapter: "openclaw-bridge",
      state: "ready",
      provider: "openclaw",
      note: "Authority 已接入 OpenClaw。",
    },
    executorConfig: {
      type: "openclaw",
      openclaw: {
        url: "ws://localhost:18789",
        tokenConfigured: true,
      },
      connectionState: "ready",
      lastError: null,
      lastConnectedAt: 2_000,
    },
    authority: {
      dbPath: "/tmp/authority.sqlite",
      connected: true,
      startedAt: 1_000,
      doctor: {
        status: "ready",
        schemaVersion: 1,
        backupDir: "/tmp/backups",
        backupCount: 2,
        latestBackupAt: 3_000,
        companyCount: 1,
        runtimeCount: 1,
        eventCount: 12,
        latestRuntimeAt: 2_500,
        latestEventAt: 2_700,
        activeCompanyId: "company-1",
        issues: [],
      },
      preflight: {
        status: "ready",
        dataDir: "/tmp/authority",
        backupDir: "/tmp/backups",
        dbExists: true,
        schemaVersion: 1,
        backupCount: 2,
        latestBackupAt: 3_000,
        notes: ["Authority SQLite 已存在，启动时会直接复用。"],
        warnings: [],
        issues: [],
      },
    },
    ...overrides,
  };
}

describe("authority health helpers", () => {
  it("treats healthy doctor and preflight as ready", () => {
    const health = createHealthSnapshot();

    expect(resolveAuthorityStorageState(health)).toBe("ready");
    expect(resolveAuthorityControlState(health)).toBe("ready");
    expect(collectAuthorityGuidance(health)).toEqual([
      "Authority SQLite 已存在，启动时会直接复用。",
    ]);
  });

  it("degrades when doctor reports repairable issues", () => {
    const health = createHealthSnapshot({
      authority: {
        ...createHealthSnapshot().authority,
        doctor: {
          ...createHealthSnapshot().authority.doctor,
          status: "degraded",
          issues: ["Authority 数据库里还没有 runtime snapshot。"],
        },
      },
    });

    expect(resolveAuthorityStorageState(health)).toBe("degraded");
    expect(resolveAuthorityControlState(health)).toBe("degraded");
    expect(collectAuthorityGuidance(health)).toContain(
      "Authority 数据库里还没有 runtime snapshot。",
    );
  });

  it("blocks when preflight is blocked even if doctor can still read the db", () => {
    const health = createHealthSnapshot({
      authority: {
        ...createHealthSnapshot().authority,
        preflight: {
          ...createHealthSnapshot().authority.preflight,
          status: "blocked",
          issues: ["Authority backup dir 不可写。"],
        },
      },
      executor: {
        ...createHealthSnapshot().executor,
        state: "degraded",
      },
    });

    expect(resolveAuthorityStorageState(health)).toBe("blocked");
    expect(resolveAuthorityControlState(health)).toBe("blocked");
    expect(collectAuthorityGuidance(health)[0]).toBe("Authority backup dir 不可写。");
  });

  it("degrades when preflight warns that backups are missing", () => {
    const base = createHealthSnapshot();
    const health = createHealthSnapshot({
      authority: {
        ...base.authority,
        preflight: {
          ...base.authority.preflight,
          status: "degraded",
          warnings: ["Authority 已有 SQLite，但还没有标准备份。建议先运行 authority:backup。"],
        },
      },
    });

    expect(resolveAuthorityStorageState(health)).toBe("degraded");
    expect(resolveAuthorityControlState(health)).toBe("degraded");
    expect(collectAuthorityGuidance(health)[0]).toBe(
      "Authority 已有 SQLite，但还没有标准备份。建议先运行 authority:backup。",
    );
  });
});
