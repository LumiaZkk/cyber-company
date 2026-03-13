import { describe, expect, it } from "vitest";
import type { AuthorityHealthSnapshot } from "../../infrastructure/authority/contract";
import {
  buildAuthorityBannerModel,
  buildAuthorityGuidanceItems,
  collectExecutorReadinessIssues,
  collectAuthorityGuidance,
  collectAuthorityRepairSteps,
  extractAuthorityHealthSnapshot,
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
    executorCapabilities: {
      sessionStatus: "supported",
      processRuntime: "unsupported",
      notes: [],
    },
    executorReadiness: [
      {
        id: "connection",
        label: "执行器连接",
        state: "ready",
        summary: "Authority 已接入 OpenClaw。",
        detail: "ws://localhost:18789",
      },
    ],
    authority: {
      dbPath: "/tmp/authority.sqlite",
      connected: true,
      startedAt: 1_000,
      doctor: {
        status: "ready",
        schemaVersion: 1,
        integrityStatus: "ok",
        integrityMessage: null,
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
        integrityStatus: "ok",
        integrityMessage: null,
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

  it("produces structured guidance for missing backups", () => {
    const base = createHealthSnapshot();
    const health = createHealthSnapshot({
      authority: {
        ...base.authority,
        preflight: {
          ...base.authority.preflight,
          status: "degraded",
          backupCount: 0,
          warnings: ["Authority 已有 SQLite，但还没有标准备份。建议先运行 authority:backup。"],
        },
        doctor: {
          ...base.authority.doctor,
          backupCount: 0,
          latestBackupAt: null,
        },
      },
    });

    const guidance = buildAuthorityGuidanceItems(health);
    expect(guidance[0]).toMatchObject({
      id: "authority-backup-missing",
      state: "degraded",
      title: "还没有标准备份",
      command: "npm run authority:backup",
    });
    expect(collectAuthorityRepairSteps(health)[0]).toContain("npm run authority:backup");
  });

  it("collects executor readiness issues separately from authority storage guidance", () => {
    const base = createHealthSnapshot();
    const health = createHealthSnapshot({
      executorCapabilities: {
        sessionStatus: "unsupported",
        processRuntime: "unsupported",
        notes: ["下游执行器不提供 session_status。"],
      },
      executorReadiness: [
        {
          id: "connection",
          label: "执行器连接",
          state: "ready",
          summary: "Authority 已接入 OpenClaw。",
          detail: "ws://localhost:18789",
        },
        {
          id: "session-status",
          label: "运行态探针",
          state: "degraded",
          summary: "当前执行器不支持 session_status。",
          detail: "Authority 会退回 lifecycle/chat 驱动的降级修复模式。",
        },
        {
          id: "process-runtime",
          label: "进程观测",
          state: "degraded",
          summary: "当前执行器不提供 process runtime 观测。",
          detail: "Runtime Inspector 会隐藏进程级 polling。",
        },
      ],
      authority: {
        ...base.authority,
      },
    });

    const issues = collectExecutorReadinessIssues(health);
    expect(issues).toHaveLength(2);
    expect(issues[0]?.id).toBe("session-status");
  });

  it("recommends migrate plan when schema metadata is missing", () => {
    const base = createHealthSnapshot();
    const health = createHealthSnapshot({
      authority: {
        ...base.authority,
        doctor: {
          ...base.authority.doctor,
          status: "degraded",
          schemaVersion: null,
          issues: ["Authority SQLite 还没有 schemaVersion metadata。建议先运行 authority:migrate。"],
        },
        preflight: {
          ...base.authority.preflight,
          status: "degraded",
          schemaVersion: null,
          warnings: ["Authority SQLite 缺少 schemaVersion metadata。建议先运行 authority:migrate。"],
        },
      },
    });

    const guidance = buildAuthorityGuidanceItems(health);
    expect(guidance.some((item) => item.id === "authority-schema-metadata-missing")).toBe(true);
    expect(collectAuthorityRepairSteps(health).some((step) => step.includes("authority:migrate -- --plan"))).toBe(
      true,
    );
  });

  it("prioritizes restore planning when integrity check fails", () => {
    const base = createHealthSnapshot();
    const health = createHealthSnapshot({
      authority: {
        ...base.authority,
        doctor: {
          ...base.authority.doctor,
          status: "blocked",
          integrityStatus: "failed",
          integrityMessage: "database disk image is malformed",
          issues: ["Authority SQLite integrity_check 失败：database disk image is malformed"],
        },
        preflight: {
          ...base.authority.preflight,
          status: "blocked",
          integrityStatus: "failed",
          integrityMessage: "database disk image is malformed",
          issues: ["Authority SQLite integrity_check 失败：database disk image is malformed"],
        },
      },
    });

    const guidance = buildAuthorityGuidanceItems(health);
    expect(guidance[0]).toMatchObject({
      id: "authority-db-integrity-failed",
      state: "blocked",
      command: "npm run authority:restore -- --latest --plan",
    });
    expect(collectAuthorityRepairSteps(health)[0]).toContain("authority:restore -- --latest --plan");
  });

  it("prefers server-provided guidance over local fallback recomputation", () => {
    const health = createHealthSnapshot({
      authority: {
        ...createHealthSnapshot().authority,
        guidance: [
          {
            id: "authority-server-guidance",
            state: "degraded",
            title: "来自 authority /health 的统一建议",
            summary: "这条建议应直接作为单一真相返回给前台。",
            action: "先按 authority 提示处理，再做下一步判断。",
            command: "npm run authority:doctor",
          },
        ],
        preflight: {
          ...createHealthSnapshot().authority.preflight,
          status: "degraded",
          backupCount: 0,
          warnings: ["Authority 已有 SQLite，但还没有标准备份。建议先运行 authority:backup。"],
        },
      },
    });

    expect(buildAuthorityGuidanceItems(health)[0]).toMatchObject({
      id: "authority-server-guidance",
      command: "npm run authority:doctor",
    });
    expect(collectAuthorityRepairSteps(health)[0]).toContain("npm run authority:doctor");
  });

  it("extracts a valid authority health snapshot from gateway status payloads", () => {
    const health = createHealthSnapshot();

    expect(extractAuthorityHealthSnapshot(health)).toEqual(health);
    expect(extractAuthorityHealthSnapshot({ ok: true })).toBeNull();
    expect(extractAuthorityHealthSnapshot(null)).toBeNull();
  });

  it("builds a startup banner model when authority is degraded", () => {
    const base = createHealthSnapshot();
    const health = createHealthSnapshot({
      authority: {
        ...base.authority,
        preflight: {
          ...base.authority.preflight,
          status: "degraded",
          backupCount: 0,
          warnings: ["Authority 已有 SQLite，但还没有标准备份。建议先运行 authority:backup。"],
        },
        doctor: {
          ...base.authority.doctor,
          backupCount: 0,
          latestBackupAt: null,
        },
      },
    });

    expect(buildAuthorityBannerModel(createHealthSnapshot())).toBeNull();
    expect(buildAuthorityBannerModel(health)).toMatchObject({
      state: "degraded",
      title: "Authority 当前有待处理项：还没有标准备份",
    });
    expect(buildAuthorityBannerModel(health)?.steps[0]).toContain("npm run authority:backup");
  });
});
