import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type SqlScalarRow = Record<string, number | string | null | undefined>;

export const AUTHORITY_SCHEMA_VERSION = 1;

export type AuthorityDoctorStatus = "ready" | "degraded" | "blocked";

export type AuthorityDoctorSnapshot = {
  status: AuthorityDoctorStatus;
  dataDir: string;
  dbPath: string;
  dbExists: boolean;
  schemaVersion: number | null;
  dbSizeBytes: number | null;
  backupDir: string;
  backupCount: number;
  latestBackupAt: number | null;
  companyCount: number;
  runtimeCount: number;
  eventCount: number;
  latestRuntimeAt: number | null;
  latestEventAt: number | null;
  activeCompanyId: string | null;
  executorConnectionState: string | null;
  issues: string[];
};

export type AuthorityBackupResult = {
  backupPath: string;
  dbPath: string;
  sizeBytes: number;
  createdAt: number;
  prunedBackupPaths: string[];
};

export type AuthorityMigrateResult = {
  status: AuthorityDoctorStatus;
  dbPath: string;
  previousSchemaVersion: number | null;
  currentSchemaVersion: number | null;
  actions: string[];
  warnings: string[];
  issues: string[];
};

export type AuthorityRestoreResult = {
  restoredFrom: string;
  dbPath: string;
  restoredAt: number;
  sizeBytes: number;
  safetyBackupPath: string | null;
};

export type AuthorityRestorePlanStatus = "ready" | "degraded" | "blocked";

export type AuthorityRestorePlan = {
  status: AuthorityRestorePlanStatus;
  backupPath: string;
  backupFileName: string;
  backupKind: "backup" | "safety-backup";
  backupSchemaVersion: number | null;
  backupCreatedAt: number;
  backupSizeBytes: number;
  dbPath: string;
  dbExists: boolean;
  dbSchemaVersion: number | null;
  dbUpdatedAt: number | null;
  dbSizeBytes: number | null;
  safetyBackupWillBeCreated: boolean;
  warnings: string[];
  issues: string[];
};

export type AuthorityPreflightStatus = "ready" | "degraded" | "blocked";

export type AuthorityPreflightSnapshot = {
  status: AuthorityPreflightStatus;
  dataDir: string;
  dbPath: string;
  backupDir: string;
  dbExists: boolean;
  schemaVersion: number | null;
  backupCount: number;
  latestBackupAt: number | null;
  notes: string[];
  warnings: string[];
  issues: string[];
};

export type AuthorityBackupEntry = {
  path: string;
  fileName: string;
  createdAt: number;
  sizeBytes: number;
  kind: "backup" | "safety-backup";
};

export function resolveAuthorityDataDir(homeDir = os.homedir()) {
  return path.join(homeDir, ".cyber-company", "authority");
}

export function resolveAuthorityDbPath(homeDir = os.homedir()) {
  return path.join(resolveAuthorityDataDir(homeDir), "authority.sqlite");
}

export function resolveAuthorityBackupDir(homeDir = os.homedir()) {
  return path.join(resolveAuthorityDataDir(homeDir), "backups");
}

function tableExists(db: DatabaseSync, tableName: string) {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(tableName) as SqlScalarRow | undefined;
  return typeof row?.name === "string" && row.name === tableName;
}

function readCount(db: DatabaseSync, tableName: string) {
  if (!tableExists(db, tableName)) {
    return 0;
  }
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as SqlScalarRow | undefined;
  return typeof row?.count === "number" ? row.count : 0;
}

function readMax(db: DatabaseSync, tableName: string, columnName: string) {
  if (!tableExists(db, tableName)) {
    return null;
  }
  const row = db.prepare(`SELECT MAX(${columnName}) as value FROM ${tableName}`).get() as
    | SqlScalarRow
    | undefined;
  return typeof row?.value === "number" ? row.value : null;
}

function readMetadataValue(db: DatabaseSync, key: string) {
  if (!tableExists(db, "metadata")) {
    return null;
  }
  const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as SqlScalarRow | undefined;
  return typeof row?.value === "string" && row.value.trim().length > 0 ? row.value.trim() : null;
}

function parseSchemaVersion(value: string | null) {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readSchemaVersion(db: DatabaseSync) {
  return parseSchemaVersion(readMetadataValue(db, "schemaVersion"));
}

function ensureMetadataTable(db: DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
}

function writeMetadataValue(db: DatabaseSync, key: string, value: string) {
  ensureMetadataTable(db);
  db.prepare(
    "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

function readSchemaVersionFromDbPath(dbPath: string) {
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = new DatabaseSync(dbPath);
  try {
    return readSchemaVersion(db);
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function readExecutorConnectionState(db: DatabaseSync) {
  if (!tableExists(db, "executor_configs")) {
    return null;
  }
  const row = db.prepare("SELECT config_json FROM executor_configs WHERE id = ?").get("default") as
    | SqlScalarRow
    | undefined;
  if (typeof row?.config_json !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(row.config_json) as { connectionState?: unknown };
    return typeof parsed.connectionState === "string" ? parsed.connectionState : null;
  } catch {
    return null;
  }
}

function buildTimestampSuffix(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function detectAuthorityBackupKind(filePath: string) {
  return path.basename(filePath).startsWith("pre-restore-") ? "safety-backup" : "backup";
}

function checkpointAuthorityDb(dbPath: string) {
  if (!existsSync(dbPath)) {
    return;
  }
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    db.close();
  }
}

function removeSqliteSidecars(dbPath: string) {
  for (const suffix of ["-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

export function listAuthorityBackups(input?: {
  homeDir?: string;
  backupDir?: string;
}): AuthorityBackupEntry[] {
  const backupDir =
    input?.backupDir ?? (input?.homeDir ? resolveAuthorityBackupDir(input.homeDir) : resolveAuthorityBackupDir());
  if (!existsSync(backupDir)) {
    return [];
  }

  return readdirSync(backupDir)
    .filter((fileName) => fileName.endsWith(".sqlite"))
    .map((fileName) => {
      const filePath = path.join(backupDir, fileName);
      const stat = statSync(filePath);
      const kind = fileName.startsWith("pre-restore-") ? "safety-backup" : "backup";
      return {
        path: filePath,
        fileName,
        createdAt: stat.mtimeMs,
        sizeBytes: stat.size,
        kind,
      } satisfies AuthorityBackupEntry;
    })
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function getLatestAuthorityBackup(input?: {
  homeDir?: string;
  backupDir?: string;
  includeSafetyBackups?: boolean;
}) {
  const backups = listAuthorityBackups(input).filter(
    (entry) => input?.includeSafetyBackups || entry.kind === "backup",
  );
  return backups[0] ?? null;
}

export function pruneAuthorityBackups(input: {
  retain: number;
  homeDir?: string;
  backupDir?: string;
}) {
  if (!Number.isFinite(input.retain) || input.retain < 1) {
    throw new Error("Authority backup retention 必须是大于等于 1 的整数。");
  }

  const backups = listAuthorityBackups(input).filter((entry) => entry.kind === "backup");
  const keep = Math.floor(input.retain);
  const toRemove = backups.slice(keep);
  for (const entry of toRemove) {
    rmSync(entry.path, { force: true });
  }
  return toRemove.map((entry) => entry.path);
}

export function readAuthorityDoctorSnapshot(input?: {
  homeDir?: string;
  dbPath?: string;
}): AuthorityDoctorSnapshot {
  const dataDir = input?.homeDir ? resolveAuthorityDataDir(input.homeDir) : resolveAuthorityDataDir();
  const dbPath = input?.dbPath ?? (input?.homeDir ? resolveAuthorityDbPath(input.homeDir) : resolveAuthorityDbPath());
  const backupDir = input?.homeDir
    ? resolveAuthorityBackupDir(input.homeDir)
    : resolveAuthorityBackupDir();
  const issues: string[] = [];
  const dbExists = existsSync(dbPath);
  if (!dbExists) {
    issues.push("Authority SQLite 数据库不存在。");
    return {
      status: "blocked",
      dataDir,
      dbPath,
      dbExists: false,
      schemaVersion: null,
      dbSizeBytes: null,
      backupDir,
      backupCount: 0,
      latestBackupAt: null,
      companyCount: 0,
      runtimeCount: 0,
      eventCount: 0,
      latestRuntimeAt: null,
      latestEventAt: null,
      activeCompanyId: null,
      executorConnectionState: null,
      issues,
    };
  }

  const dbSizeBytes = statSync(dbPath).size;
  const backups = listAuthorityBackups({ backupDir });
  const db = new DatabaseSync(dbPath);
  try {
    const schemaVersion = readSchemaVersion(db);
    const companyCount = readCount(db, "companies");
    const runtimeCount = readCount(db, "runtimes");
    const eventCount = readCount(db, "event_log");
    const latestRuntimeAt = readMax(db, "runtimes", "updated_at");
    const latestEventAt = readMax(db, "event_log", "timestamp");
    const activeCompanyId = readMetadataValue(db, "activeCompanyId");
    const executorConnectionState = readExecutorConnectionState(db);

    if (companyCount === 0) {
      issues.push("Authority 数据库里还没有公司配置。");
    }
    if (runtimeCount === 0) {
      issues.push("Authority 数据库里还没有 runtime snapshot。");
    }
    if (eventCount === 0) {
      issues.push("Authority event log 还是空的。");
    }
    if (schemaVersion === null) {
      issues.push("Authority SQLite 还没有 schemaVersion metadata。建议先运行 authority:migrate。");
    } else if (schemaVersion > AUTHORITY_SCHEMA_VERSION) {
      issues.push(
        `Authority SQLite schemaVersion ${schemaVersion} 高于当前代码支持的 ${AUTHORITY_SCHEMA_VERSION}。`,
      );
    }
    if (!executorConnectionState || executorConnectionState === "idle") {
      issues.push("Executor 连接还没进入 ready/degraded。");
    }

    const status: AuthorityDoctorStatus =
      companyCount === 0 || runtimeCount === 0
        ? "degraded"
        : issues.length > 0
          ? "degraded"
          : "ready";

    return {
      status,
      dataDir,
      dbPath,
      dbExists,
      schemaVersion,
      dbSizeBytes,
      backupDir,
      backupCount: backups.length,
      latestBackupAt: backups[0]?.createdAt ?? null,
      companyCount,
      runtimeCount,
      eventCount,
      latestRuntimeAt,
      latestEventAt,
      activeCompanyId,
      executorConnectionState,
      issues,
    };
  } finally {
    db.close();
  }
}

export function createAuthorityBackup(input?: {
  homeDir?: string;
  dbPath?: string;
  outputDir?: string;
  fileName?: string;
  now?: number;
  retain?: number;
}): AuthorityBackupResult {
  const dbPath = input?.dbPath ?? (input?.homeDir ? resolveAuthorityDbPath(input.homeDir) : resolveAuthorityDbPath());
  if (!existsSync(dbPath)) {
    throw new Error(`Authority SQLite 数据库不存在: ${dbPath}`);
  }

  const timestamp = input?.now ?? Date.now();
  const outputDir =
    input?.outputDir ?? (input?.homeDir ? resolveAuthorityBackupDir(input.homeDir) : resolveAuthorityBackupDir());
  mkdirSync(outputDir, { recursive: true });
  checkpointAuthorityDb(dbPath);

  const fileName = input?.fileName ?? `authority-${buildTimestampSuffix(timestamp)}.sqlite`;
  const backupPath = path.join(outputDir, fileName);
  copyFileSync(dbPath, backupPath);
  const prunedBackupPaths =
    typeof input?.retain === "number"
      ? pruneAuthorityBackups({ backupDir: outputDir, retain: input.retain })
      : [];

  return {
    backupPath,
    dbPath,
    sizeBytes: statSync(backupPath).size,
    createdAt: timestamp,
    prunedBackupPaths,
  };
}

export function migrateAuthoritySchemaVersion(input?: {
  homeDir?: string;
  dbPath?: string;
}): AuthorityMigrateResult {
  const dbPath = input?.dbPath ?? (input?.homeDir ? resolveAuthorityDbPath(input.homeDir) : resolveAuthorityDbPath());
  const actions: string[] = [];
  const warnings: string[] = [];
  const issues: string[] = [];

  if (!existsSync(dbPath)) {
    return {
      status: "blocked",
      dbPath,
      previousSchemaVersion: null,
      currentSchemaVersion: null,
      actions,
      warnings,
      issues: [`Authority SQLite 数据库不存在: ${dbPath}`],
    };
  }

  const db = new DatabaseSync(dbPath);
  try {
    ensureMetadataTable(db);
    const previousSchemaVersion = readSchemaVersion(db);
    if (previousSchemaVersion !== null && previousSchemaVersion > AUTHORITY_SCHEMA_VERSION) {
      issues.push(
        `Authority SQLite schemaVersion ${previousSchemaVersion} 高于当前代码支持的 ${AUTHORITY_SCHEMA_VERSION}；当前版本不会覆盖它。`,
      );
      return {
        status: "blocked",
        dbPath,
        previousSchemaVersion,
        currentSchemaVersion: previousSchemaVersion,
        actions,
        warnings,
        issues,
      };
    }

    if (previousSchemaVersion === AUTHORITY_SCHEMA_VERSION) {
      actions.push(`schemaVersion 已是 v${AUTHORITY_SCHEMA_VERSION}，无需迁移。`);
    } else {
      writeMetadataValue(db, "schemaVersion", String(AUTHORITY_SCHEMA_VERSION));
      if (previousSchemaVersion === null) {
        actions.push(`已回填 schemaVersion v${AUTHORITY_SCHEMA_VERSION}。`);
      } else {
        warnings.push(
          `当前 authority SQLite 的 schemaVersion 从 v${previousSchemaVersion} 提升到 v${AUTHORITY_SCHEMA_VERSION}。`,
        );
        actions.push(`已更新 schemaVersion 到 v${AUTHORITY_SCHEMA_VERSION}。`);
      }
    }

    const currentSchemaVersion = readSchemaVersion(db);
    if (currentSchemaVersion !== AUTHORITY_SCHEMA_VERSION) {
      issues.push("Authority schemaVersion 回填失败。");
    }

    return {
      status: issues.length > 0 ? "blocked" : warnings.length > 0 ? "degraded" : "ready",
      dbPath,
      previousSchemaVersion,
      currentSchemaVersion,
      actions,
      warnings,
      issues,
    };
  } finally {
    db.close();
  }
}

export function restoreAuthorityBackup(input: {
  backupPath: string;
  homeDir?: string;
  dbPath?: string;
  backupDir?: string;
  now?: number;
  createSafetyBackup?: boolean;
  force?: boolean;
  allowSafetyBackupRestore?: boolean;
}): AuthorityRestoreResult {
  const plan = readAuthorityRestorePlan(input);
  if (plan.status === "blocked") {
    throw new Error(plan.issues[0] ?? "Authority restore plan blocked.");
  }

  const backupPath = path.resolve(input.backupPath);
  const dbPath = plan.dbPath;
  const backupDir =
    input.backupDir ?? (input.homeDir ? resolveAuthorityBackupDir(input.homeDir) : resolveAuthorityBackupDir());
  const restoredAt = input.now ?? Date.now();

  mkdirSync(path.dirname(dbPath), { recursive: true });
  mkdirSync(backupDir, { recursive: true });

  let safetyBackupPath: string | null = null;
  if (input.createSafetyBackup !== false && existsSync(dbPath)) {
    safetyBackupPath = path.join(backupDir, `pre-restore-${buildTimestampSuffix(restoredAt)}.sqlite`);
    checkpointAuthorityDb(dbPath);
    copyFileSync(dbPath, safetyBackupPath);
  }

  copyFileSync(backupPath, dbPath);
  removeSqliteSidecars(dbPath);

  return {
    restoredFrom: backupPath,
    dbPath,
    restoredAt,
    sizeBytes: statSync(dbPath).size,
    safetyBackupPath,
  };
}

export function readAuthorityRestorePlan(input: {
  backupPath: string;
  homeDir?: string;
  dbPath?: string;
  backupDir?: string;
  now?: number;
  createSafetyBackup?: boolean;
  force?: boolean;
  allowSafetyBackupRestore?: boolean;
}): AuthorityRestorePlan {
  const backupPath = path.resolve(input.backupPath);
  const dbPath = input.dbPath ?? (input.homeDir ? resolveAuthorityDbPath(input.homeDir) : resolveAuthorityDbPath());
  const warnings: string[] = [];
  const issues: string[] = [];

  if (!existsSync(backupPath)) {
    return {
      status: "blocked",
        backupPath,
        backupFileName: path.basename(backupPath),
        backupKind: detectAuthorityBackupKind(backupPath),
        backupSchemaVersion: null,
        backupCreatedAt: 0,
        backupSizeBytes: 0,
        dbPath,
        dbExists: existsSync(dbPath),
        dbSchemaVersion: existsSync(dbPath) ? readSchemaVersionFromDbPath(dbPath) : null,
        dbUpdatedAt: existsSync(dbPath) ? statSync(dbPath).mtimeMs : null,
      dbSizeBytes: existsSync(dbPath) ? statSync(dbPath).size : null,
      safetyBackupWillBeCreated: input.createSafetyBackup !== false && existsSync(dbPath),
      warnings,
      issues: [`Authority 备份文件不存在: ${backupPath}`],
    };
  }

  if (backupPath === path.resolve(dbPath)) {
    issues.push("恢复源不能直接指向当前 authority.sqlite；请改用备份文件。");
  }

  const backupStat = statSync(backupPath);
  const backupKind = detectAuthorityBackupKind(backupPath);
  const backupSchemaVersion = readSchemaVersionFromDbPath(backupPath);
  const dbExists = existsSync(dbPath);
  const dbStat = dbExists ? statSync(dbPath) : null;
  const dbSchemaVersion = dbExists ? readSchemaVersionFromDbPath(dbPath) : null;

  if (backupSchemaVersion !== null && backupSchemaVersion > AUTHORITY_SCHEMA_VERSION) {
    issues.push(
      `备份 schemaVersion ${backupSchemaVersion} 高于当前代码支持的 ${AUTHORITY_SCHEMA_VERSION}；当前代码不能安全恢复。`,
    );
  }

  if (backupKind === "safety-backup" && input.allowSafetyBackupRestore !== true) {
    issues.push("这是 pre-restore safety backup，默认不允许直接恢复；请显式传入 --allow-safety-backup。");
  }

  if (
    dbSchemaVersion !== null &&
    backupSchemaVersion !== null &&
    dbSchemaVersion > backupSchemaVersion &&
    input.force !== true
  ) {
    issues.push(
      `当前 authority.sqlite 的 schemaVersion (${dbSchemaVersion}) 高于待恢复备份 (${backupSchemaVersion})；默认阻止 schema 降级恢复，请显式传入 --force。`,
    );
  }

  if (dbExists && dbStat && dbStat.mtimeMs > backupStat.mtimeMs && input.force !== true) {
    issues.push("当前 authority.sqlite 比待恢复备份更新；默认阻止覆盖。确认要回滚时请显式传入 --force。");
  }

  if (backupSchemaVersion === null) {
    warnings.push("备份缺少 schemaVersion，将按 legacy 备份处理。");
  } else if (backupSchemaVersion < AUTHORITY_SCHEMA_VERSION) {
    warnings.push(
      `备份 schemaVersion ${backupSchemaVersion} 低于当前代码 ${AUTHORITY_SCHEMA_VERSION}，恢复后请先启动当前 authority 完成 schema backfill。`,
    );
  }

  if (backupKind === "safety-backup" && input.allowSafetyBackupRestore === true) {
    warnings.push("正在恢复 pre-restore safety backup；请确认这确实是你要回滚的时间点。");
  }

  if (dbExists && dbStat && dbStat.mtimeMs > backupStat.mtimeMs && input.force === true) {
    warnings.push("当前 authority.sqlite 比待恢复备份更新；本次恢复会回滚到更早的快照。");
  }

  return {
    status: issues.length > 0 ? "blocked" : warnings.length > 0 ? "degraded" : "ready",
    backupPath,
    backupFileName: path.basename(backupPath),
    backupKind,
    backupSchemaVersion,
    backupCreatedAt: backupStat.mtimeMs,
    backupSizeBytes: backupStat.size,
    dbPath,
    dbExists,
    dbSchemaVersion,
    dbUpdatedAt: dbStat?.mtimeMs ?? null,
    dbSizeBytes: dbStat?.size ?? null,
    safetyBackupWillBeCreated: input.createSafetyBackup !== false && dbExists,
    warnings,
    issues,
  };
}

export function readAuthorityPreflightSnapshot(input?: {
  homeDir?: string;
  dbPath?: string;
  backupStaleAfterHours?: number;
}): AuthorityPreflightSnapshot {
  const dataDir = input?.homeDir ? resolveAuthorityDataDir(input.homeDir) : resolveAuthorityDataDir();
  const dbPath = input?.dbPath ?? (input?.homeDir ? resolveAuthorityDbPath(input.homeDir) : resolveAuthorityDbPath());
  const backupDir = input?.homeDir
    ? resolveAuthorityBackupDir(input.homeDir)
    : resolveAuthorityBackupDir();
  const notes: string[] = [];
  const warnings: string[] = [];
  const issues: string[] = [];
  const dbExists = existsSync(dbPath);
  const schemaVersion = dbExists ? readSchemaVersionFromDbPath(dbPath) : null;
  const standardBackups = listAuthorityBackups({ backupDir }).filter((entry) => entry.kind === "backup");
  const latestBackupAt = standardBackups[0]?.createdAt ?? null;
  const backupCount = standardBackups.length;
  const backupStaleAfterHours = input?.backupStaleAfterHours ?? 72;
  const backupStaleAfterMs = backupStaleAfterHours * 60 * 60 * 1000;

  try {
    mkdirSync(dataDir, { recursive: true });
  } catch (error) {
    issues.push(`Authority data dir 不可写: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    mkdirSync(backupDir, { recursive: true });
  } catch (error) {
    issues.push(`Authority backup dir 不可写: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (dbExists) {
    notes.push("Authority SQLite 已存在，启动时会直接复用。");
    if (schemaVersion === null) {
      warnings.push("Authority SQLite 缺少 schemaVersion metadata。建议先运行 authority:migrate。");
    } else if (schemaVersion > AUTHORITY_SCHEMA_VERSION) {
      issues.push(
        `Authority SQLite schemaVersion ${schemaVersion} 高于当前代码支持的 ${AUTHORITY_SCHEMA_VERSION}。`,
      );
    } else if (schemaVersion < AUTHORITY_SCHEMA_VERSION) {
      warnings.push(
        `Authority SQLite schemaVersion ${schemaVersion} 低于当前代码 ${AUTHORITY_SCHEMA_VERSION}；建议先运行 authority:migrate。`,
      );
    }
    if (backupCount === 0) {
      warnings.push("Authority 已有 SQLite，但还没有标准备份。建议先运行 authority:backup。");
    } else if (latestBackupAt && Date.now() - latestBackupAt > backupStaleAfterMs) {
      warnings.push(`Authority 最新标准备份已超过 ${backupStaleAfterHours} 小时，建议刷新备份。`);
    }
  } else {
    notes.push("Authority SQLite 还不存在，首次启动会自动初始化。");
  }

  return {
    status: issues.length > 0 ? "blocked" : warnings.length > 0 ? "degraded" : "ready",
    dataDir,
    dbPath,
    backupDir,
    dbExists,
    schemaVersion,
    backupCount,
    latestBackupAt,
    notes,
    warnings,
    issues,
  };
}

export function renderAuthorityDoctorReport(snapshot: AuthorityDoctorSnapshot) {
  const formatTimestamp = (value: number | null) =>
    typeof value === "number" ? new Date(value).toISOString() : "n/a";
  const formatSize = (value: number | null) =>
    typeof value === "number" ? `${(value / 1024).toFixed(1)} KB` : "n/a";

  const lines = [
    `Authority doctor: ${snapshot.status}`,
    `Schema version: ${snapshot.schemaVersion ?? "n/a"}`,
    `DB path: ${snapshot.dbPath}`,
    `DB size: ${formatSize(snapshot.dbSizeBytes)}`,
    `Backup dir: ${snapshot.backupDir}`,
    `Backups: ${snapshot.backupCount}`,
    `Latest backup: ${formatTimestamp(snapshot.latestBackupAt)}`,
    `Companies: ${snapshot.companyCount}`,
    `Runtimes: ${snapshot.runtimeCount}`,
    `Events: ${snapshot.eventCount}`,
    `Active company: ${snapshot.activeCompanyId ?? "n/a"}`,
    `Executor state: ${snapshot.executorConnectionState ?? "n/a"}`,
    `Latest runtime: ${formatTimestamp(snapshot.latestRuntimeAt)}`,
    `Latest event: ${formatTimestamp(snapshot.latestEventAt)}`,
  ];

  if (snapshot.issues.length > 0) {
    lines.push("Issues:");
    lines.push(...snapshot.issues.map((issue) => `- ${issue}`));
  }

  return lines.join("\n");
}

export function renderAuthorityPreflightReport(snapshot: AuthorityPreflightSnapshot) {
  const lines = [
    `Authority preflight: ${snapshot.status}`,
    `Schema version: ${snapshot.schemaVersion ?? "n/a"}`,
    `Data dir: ${snapshot.dataDir}`,
    `DB path: ${snapshot.dbPath}`,
    `Backup dir: ${snapshot.backupDir}`,
    `DB exists: ${snapshot.dbExists ? "yes" : "no"}`,
    `Backups: ${snapshot.backupCount}`,
    `Latest backup: ${typeof snapshot.latestBackupAt === "number" ? new Date(snapshot.latestBackupAt).toISOString() : "n/a"}`,
  ];

  if (snapshot.notes.length > 0) {
    lines.push("Notes:");
    lines.push(...snapshot.notes.map((note) => `- ${note}`));
  }
  if (snapshot.warnings.length > 0) {
    lines.push("Warnings:");
    lines.push(...snapshot.warnings.map((warning) => `- ${warning}`));
  }
  if (snapshot.issues.length > 0) {
    lines.push("Issues:");
    lines.push(...snapshot.issues.map((issue) => `- ${issue}`));
  }

  return lines.join("\n");
}

export function renderAuthorityBackupsReport(entries: AuthorityBackupEntry[]) {
  if (entries.length === 0) {
    return "Authority backups: none";
  }

  const lines = ["Authority backups:"];
  for (const entry of entries) {
    lines.push(
      [
        "-",
        entry.fileName,
        `(${entry.kind})`,
        new Date(entry.createdAt).toISOString(),
        `${(entry.sizeBytes / 1024).toFixed(1)} KB`,
      ].join(" "),
    );
  }
  return lines.join("\n");
}

export function renderAuthorityMigrateReport(result: AuthorityMigrateResult) {
  const lines = [
    `Authority migrate: ${result.status}`,
    `DB path: ${result.dbPath}`,
    `Previous schema: ${result.previousSchemaVersion ?? "n/a"}`,
    `Current schema: ${result.currentSchemaVersion ?? "n/a"}`,
  ];

  if (result.actions.length > 0) {
    lines.push("Actions:");
    lines.push(...result.actions.map((action) => `- ${action}`));
  }
  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    lines.push(...result.warnings.map((warning) => `- ${warning}`));
  }
  if (result.issues.length > 0) {
    lines.push("Issues:");
    lines.push(...result.issues.map((issue) => `- ${issue}`));
  }

  return lines.join("\n");
}

export function renderAuthorityRestorePlanReport(plan: AuthorityRestorePlan) {
  const lines = [
    `Authority restore plan: ${plan.status}`,
    `Backup path: ${plan.backupPath}`,
    `Backup kind: ${plan.backupKind}`,
    `Backup schema: ${plan.backupSchemaVersion ?? "n/a"}`,
    `Backup time: ${new Date(plan.backupCreatedAt).toISOString()}`,
    `Backup size: ${(plan.backupSizeBytes / 1024).toFixed(1)} KB`,
    `DB path: ${plan.dbPath}`,
    `DB exists: ${plan.dbExists ? "yes" : "no"}`,
    `Current DB schema: ${plan.dbSchemaVersion ?? "n/a"}`,
    `Current DB time: ${typeof plan.dbUpdatedAt === "number" ? new Date(plan.dbUpdatedAt).toISOString() : "n/a"}`,
    `Current DB size: ${typeof plan.dbSizeBytes === "number" ? `${(plan.dbSizeBytes / 1024).toFixed(1)} KB` : "n/a"}`,
    `Will create safety backup: ${plan.safetyBackupWillBeCreated ? "yes" : "no"}`,
  ];

  if (plan.warnings.length > 0) {
    lines.push("Warnings:");
    lines.push(...plan.warnings.map((warning) => `- ${warning}`));
  }
  if (plan.issues.length > 0) {
    lines.push("Issues:");
    lines.push(...plan.issues.map((issue) => `- ${issue}`));
  }

  return lines.join("\n");
}
