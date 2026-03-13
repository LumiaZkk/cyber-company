import { mkdtempSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  AUTHORITY_SCHEMA_VERSION,
  createAuthorityBackup,
  getLatestAuthorityBackup,
  listAuthorityBackups,
  migrateAuthoritySchemaVersion,
  pruneAuthorityBackups,
  readAuthorityPreflightSnapshot,
  readAuthorityDoctorSnapshot,
  readAuthorityRestorePlan,
  renderAuthorityBackupsReport,
  renderAuthorityRestorePlanReport,
  resolveAuthorityDbPath,
  resolveAuthorityBackupDir,
  restoreAuthorityBackup,
} from "./ops";

const tempDirs: string[] = [];

function makeTempHome() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "authority-ops-"));
  tempDirs.push(dir);
  return dir;
}

function seedAuthorityDb(homeDir: string, options?: { schemaVersion?: number | null }) {
  const dbPath = resolveAuthorityDbPath(homeDir);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, company_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE runtimes (company_id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE event_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, company_id TEXT NOT NULL, kind TEXT NOT NULL, timestamp INTEGER NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE executor_configs (id TEXT PRIMARY KEY, adapter TEXT NOT NULL, config_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
  `);
  db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)").run("activeCompanyId", "company-1");
  if (options?.schemaVersion !== null) {
    db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)").run(
      "schemaVersion",
      String(options?.schemaVersion ?? AUTHORITY_SCHEMA_VERSION),
    );
  }
  db.prepare(
    "INSERT INTO companies (id, name, company_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("company-1", "Company 1", JSON.stringify({ id: "company-1", name: "Company 1" }), 100, 200);
  db.prepare(
    "INSERT INTO runtimes (company_id, snapshot_json, updated_at) VALUES (?, ?, ?)",
  ).run("company-1", JSON.stringify({ companyId: "company-1" }), 300);
  db.prepare(
    "INSERT INTO event_log (event_id, company_id, kind, timestamp, payload_json) VALUES (?, ?, ?, ?, ?)",
  ).run("event-1", "company-1", "runtime_repaired", 400, JSON.stringify({}));
  db.prepare(
    "INSERT INTO executor_configs (id, adapter, config_json, updated_at) VALUES (?, ?, ?, ?)",
  ).run("default", "openclaw-bridge", JSON.stringify({ connectionState: "ready" }), 500);
  db.close();
  return dbPath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("authority ops", () => {
  it("reports blocked when authority db is missing", () => {
    const homeDir = makeTempHome();
    const snapshot = readAuthorityDoctorSnapshot({ homeDir });
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.dbExists).toBe(false);
    expect(snapshot.issues).toContain("Authority SQLite 数据库不存在。");
  });

  it("reports ready for a seeded authority db", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir);
    const snapshot = readAuthorityDoctorSnapshot({ homeDir });
    expect(snapshot.status).toBe("ready");
    expect(snapshot.schemaVersion).toBe(AUTHORITY_SCHEMA_VERSION);
    expect(snapshot.backupCount).toBe(0);
    expect(snapshot.latestBackupAt).toBe(null);
    expect(snapshot.companyCount).toBe(1);
    expect(snapshot.runtimeCount).toBe(1);
    expect(snapshot.eventCount).toBe(1);
    expect(snapshot.activeCompanyId).toBe("company-1");
    expect(snapshot.executorConnectionState).toBe("ready");
  });

  it("degrades doctor when schemaVersion metadata is missing", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir, { schemaVersion: null });
    const snapshot = readAuthorityDoctorSnapshot({ homeDir });
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.schemaVersion).toBe(null);
    expect(snapshot.issues[0]).toContain("schemaVersion");
  });

  it("creates a backup copy for an existing authority db", () => {
    const homeDir = makeTempHome();
    const dbPath = seedAuthorityDb(homeDir);
    const now = new Date(2026, 2, 13, 6, 0, 0).getTime();
    const result = createAuthorityBackup({ homeDir, now });
    expect(result.dbPath).toBe(dbPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(path.basename(result.backupPath)).toContain("authority-20260313-060000.sqlite");
    expect(result.prunedBackupPaths).toEqual([]);
  });

  it("restores a backup and creates a safety backup of the previous db", () => {
    const homeDir = makeTempHome();
    const dbPath = seedAuthorityDb(homeDir);
    const db = new DatabaseSync(dbPath);
    db.prepare("INSERT INTO companies (id, name, company_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("company-2", "Company 2", JSON.stringify({ id: "company-2", name: "Company 2" }), 300, 300);
    db.close();

    const backup = createAuthorityBackup({ homeDir, fileName: "seed.sqlite" });

    const dbMutate = new DatabaseSync(dbPath);
    dbMutate.prepare("DELETE FROM companies WHERE id = ?").run("company-1");
    dbMutate.close();

    const restored = restoreAuthorityBackup({
      homeDir,
      backupPath: backup.backupPath,
      now: new Date(2026, 2, 13, 7, 0, 0).getTime(),
      force: true,
    });
    expect(restored.dbPath).toBe(dbPath);
    expect(restored.safetyBackupPath).toContain(resolveAuthorityBackupDir(homeDir));

    const verifyDb = new DatabaseSync(dbPath);
    const row = verifyDb.prepare("SELECT COUNT(*) as count FROM companies").get() as { count: number };
    verifyDb.close();
    expect(row.count).toBe(2);
  });

  it("reports ready preflight and explains bootstrap when db is missing", () => {
    const homeDir = makeTempHome();
    const snapshot = readAuthorityPreflightSnapshot({ homeDir });
    expect(snapshot.status).toBe("ready");
    expect(snapshot.dbExists).toBe(false);
    expect(snapshot.backupCount).toBe(0);
    expect(snapshot.notes).toContain("Authority SQLite 还不存在，首次启动会自动初始化。");
  });

  it("reports degraded preflight when db exists but no standard backup exists", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir);
    const snapshot = readAuthorityPreflightSnapshot({ homeDir });
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.dbExists).toBe(true);
    expect(snapshot.backupCount).toBe(0);
    expect(snapshot.warnings).toContain(
      "Authority 已有 SQLite，但还没有标准备份。建议先运行 authority:backup。",
    );
  });

  it("warns preflight when schemaVersion metadata is missing", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir, { schemaVersion: null });
    const snapshot = readAuthorityPreflightSnapshot({ homeDir });
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.schemaVersion).toBe(null);
    expect(snapshot.warnings[0]).toContain("authority:migrate");
  });

  it("prunes older standard backups while keeping safety backups", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir);
    createAuthorityBackup({
      homeDir,
      fileName: "authority-20260313-060000.sqlite",
      now: new Date(2026, 2, 13, 6, 0, 0).getTime(),
    });
    createAuthorityBackup({
      homeDir,
      fileName: "authority-20260313-070000.sqlite",
      now: new Date(2026, 2, 13, 7, 0, 0).getTime(),
    });
    createAuthorityBackup({
      homeDir,
      fileName: "authority-20260313-080000.sqlite",
      now: new Date(2026, 2, 13, 8, 0, 0).getTime(),
    });
    const backupDir = resolveAuthorityBackupDir(homeDir);
    const safetyBackupPath = path.join(backupDir, "pre-restore-20260313-081500.sqlite");
    createAuthorityBackup({
      homeDir,
      outputDir: backupDir,
      fileName: path.basename(safetyBackupPath),
      now: new Date(2026, 2, 13, 8, 15, 0).getTime(),
    });

    const pruned = pruneAuthorityBackups({ homeDir, retain: 2 });
    expect(pruned).toHaveLength(1);
    const remaining = listAuthorityBackups({ homeDir });
    expect(remaining.filter((entry) => entry.kind === "backup")).toHaveLength(2);
    expect(remaining.some((entry) => entry.kind === "safety-backup")).toBe(true);
  });

  it("reports backup inventory once backups exist", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir);
    createAuthorityBackup({
      homeDir,
      fileName: "authority-20260313-090000.sqlite",
      now: new Date(2026, 2, 13, 9, 0, 0).getTime(),
    });
    const snapshot = readAuthorityDoctorSnapshot({ homeDir });
    expect(snapshot.backupCount).toBe(1);
    expect(snapshot.latestBackupAt).not.toBe(null);
  });

  it("reports degraded preflight when latest standard backup is stale", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir);
    const staleTimestamp = new Date(2026, 2, 9, 9, 0, 0).getTime();
    const backup = createAuthorityBackup({
      homeDir,
      fileName: "authority-20260309-090000.sqlite",
      now: staleTimestamp,
    });
    const staleDate = new Date(staleTimestamp);
    utimesSync(backup.backupPath, staleDate, staleDate);

    const snapshot = readAuthorityPreflightSnapshot({
      homeDir,
      backupStaleAfterHours: 24,
    });
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.backupCount).toBe(1);
    expect(snapshot.latestBackupAt).not.toBe(null);
    expect(snapshot.warnings[0]).toContain("Authority 最新标准备份已超过 24 小时");
  });

  it("blocks restoring a backup from a newer schema version", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir);
    const backup = createAuthorityBackup({
      homeDir,
      fileName: "authority-20260313-090000.sqlite",
      now: new Date(2026, 2, 13, 9, 0, 0).getTime(),
    });
    const backupDb = new DatabaseSync(backup.backupPath);
    backupDb.prepare("UPDATE metadata SET value = ? WHERE key = ?").run(String(AUTHORITY_SCHEMA_VERSION + 1), "schemaVersion");
    backupDb.close();

    const plan = readAuthorityRestorePlan({
      homeDir,
      backupPath: backup.backupPath,
      force: true,
    });
    expect(plan.status).toBe("blocked");
    expect(plan.issues[0]).toContain("高于当前代码支持的");
  });

  it("backfills missing schemaVersion metadata via migrate command", () => {
    const homeDir = makeTempHome();
    const dbPath = seedAuthorityDb(homeDir, { schemaVersion: null });

    const result = migrateAuthoritySchemaVersion({ homeDir });
    expect(result.status).toBe("ready");
    expect(result.previousSchemaVersion).toBe(null);
    expect(result.currentSchemaVersion).toBe(AUTHORITY_SCHEMA_VERSION);
    expect(result.actions[0]).toContain(`schemaVersion v${AUTHORITY_SCHEMA_VERSION}`);

    const db = new DatabaseSync(dbPath);
    const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get("schemaVersion") as {
      value: string;
    };
    db.close();
    expect(row.value).toBe(String(AUTHORITY_SCHEMA_VERSION));
  });

  it("prefers the latest standard backup over newer safety backups", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir);
    createAuthorityBackup({
      homeDir,
      fileName: "authority-20260313-090000.sqlite",
      now: new Date(2026, 2, 13, 9, 0, 0).getTime(),
    });
    createAuthorityBackup({
      homeDir,
      fileName: "pre-restore-20260313-091500.sqlite",
      now: new Date(2026, 2, 13, 9, 15, 0).getTime(),
    });

    const latest = getLatestAuthorityBackup({ homeDir });
    expect(latest?.fileName).toBe("authority-20260313-090000.sqlite");
    expect(latest?.kind).toBe("backup");
  });

  it("blocks restoring a safety backup unless explicitly allowed", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir);
    const safetyBackup = createAuthorityBackup({
      homeDir,
      fileName: "pre-restore-20260313-091500.sqlite",
      now: new Date(2026, 2, 13, 9, 15, 0).getTime(),
    });

    const plan = readAuthorityRestorePlan({
      homeDir,
      backupPath: safetyBackup.backupPath,
    });
    expect(plan.status).toBe("blocked");
    expect(plan.issues[0]).toContain("--allow-safety-backup");

    expect(() =>
      restoreAuthorityBackup({
        homeDir,
        backupPath: safetyBackup.backupPath,
      }),
    ).toThrow("--allow-safety-backup");
  });

  it("blocks restoring an older backup over a newer db unless forced", () => {
    const homeDir = makeTempHome();
    const dbPath = seedAuthorityDb(homeDir);
    const backup = createAuthorityBackup({
      homeDir,
      fileName: "authority-20260313-090000.sqlite",
      now: new Date(2026, 2, 13, 9, 0, 0).getTime(),
    });
    const backupTime = new Date(2026, 2, 13, 9, 0, 0);
    utimesSync(backup.backupPath, backupTime, backupTime);

    const newerTime = new Date(2026, 2, 13, 10, 0, 0);
    utimesSync(dbPath, newerTime, newerTime);

    const plan = readAuthorityRestorePlan({
      homeDir,
      backupPath: backup.backupPath,
    });
    expect(plan.status).toBe("blocked");
    expect(plan.issues[0]).toContain("--force");

    expect(() =>
      restoreAuthorityBackup({
        homeDir,
        backupPath: backup.backupPath,
      }),
    ).toThrow("--force");
  });

  it("allows a forced restore plan and renders warnings", () => {
    const homeDir = makeTempHome();
    const dbPath = seedAuthorityDb(homeDir);
    const backup = createAuthorityBackup({
      homeDir,
      fileName: "authority-20260313-090000.sqlite",
      now: new Date(2026, 2, 13, 9, 0, 0).getTime(),
    });
    const backupTime = new Date(2026, 2, 13, 9, 0, 0);
    utimesSync(backup.backupPath, backupTime, backupTime);

    const newerTime = new Date(2026, 2, 13, 10, 0, 0);
    utimesSync(dbPath, newerTime, newerTime);

    const plan = readAuthorityRestorePlan({
      homeDir,
      backupPath: backup.backupPath,
      force: true,
    });
    expect(plan.status).toBe("degraded");
    expect(plan.warnings[0]).toContain("会回滚到更早的快照");

    const report = renderAuthorityRestorePlanReport(plan);
    expect(report).toContain("Authority restore plan: degraded");
    expect(report).toContain("Warnings:");
  });

  it("renders backup inventory with kind, time, and size", () => {
    const homeDir = makeTempHome();
    seedAuthorityDb(homeDir);
    createAuthorityBackup({
      homeDir,
      fileName: "authority-20260313-090000.sqlite",
      now: new Date(2026, 2, 13, 9, 0, 0).getTime(),
    });

    const report = renderAuthorityBackupsReport(listAuthorityBackups({ homeDir }));
    expect(report).toContain("Authority backups:");
    expect(report).toContain("authority-20260313-090000.sqlite");
    expect(report).toContain("(backup)");
  });
});
