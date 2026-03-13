import {
  createAuthorityBackup,
  getLatestAuthorityBackup,
  listAuthorityBackups,
  migrateAuthoritySchemaVersion,
  readAuthorityRestorePlan,
  readAuthorityPreflightSnapshot,
  readAuthorityDoctorSnapshot,
  renderAuthorityBackupsReport,
  renderAuthorityMigrateReport,
  renderAuthorityPreflightReport,
  renderAuthorityDoctorReport,
  renderAuthorityRestorePlanReport,
  restoreAuthorityBackup,
} from "./ops";

function readFlag(name: string, args: string[]) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}

function readNumberFlag(name: string, args: string[]) {
  const value = readFlag(name, args);
  if (value === null) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} 必须是整数。`);
  }
  return parsed;
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (command === "doctor") {
    const snapshot = readAuthorityDoctorSnapshot();
    console.log(renderAuthorityDoctorReport(snapshot));
    process.exitCode = snapshot.status === "blocked" ? 1 : 0;
    return;
  }

  if (command === "backup") {
    const outputDir = readFlag("--out", args) ?? undefined;
    const fileName = readFlag("--file", args) ?? undefined;
    const retain = readNumberFlag("--retain", args) ?? undefined;
    const result = createAuthorityBackup({ outputDir, fileName, retain });
    console.log(`Authority backup created: ${result.backupPath}`);
    console.log(`Size: ${result.sizeBytes} bytes`);
    if (result.prunedBackupPaths.length > 0) {
      console.log(`Pruned backups: ${result.prunedBackupPaths.length}`);
    }
    return;
  }

  if (command === "backups") {
    console.log(renderAuthorityBackupsReport(listAuthorityBackups()));
    return;
  }

  if (command === "migrate") {
    const result = migrateAuthoritySchemaVersion();
    console.log(renderAuthorityMigrateReport(result));
    process.exitCode = result.status === "blocked" ? 1 : 0;
    return;
  }

  if (command === "restore") {
    const from = readFlag("--from", args);
    const useLatest = args.includes("--latest");
    const allowSafetyBackupRestore = args.includes("--allow-safety-backup");
    const force = args.includes("--force");
    const planOnly = args.includes("--plan");
    if ((from ? 1 : 0) + (useLatest ? 1 : 0) !== 1) {
      console.error(
        "Usage: tsx packages/authority-daemon/src/ops-cli.ts restore --from BACKUP.sqlite | --latest [--plan] [--force] [--allow-safety-backup]",
      );
      process.exitCode = 1;
      return;
    }
    const backupPath = from ?? getLatestAuthorityBackup()?.path;
    if (!backupPath) {
      console.error("Authority 备份目录里还没有可恢复的标准备份。");
      process.exitCode = 1;
      return;
    }
    const plan = readAuthorityRestorePlan({
      backupPath,
      force,
      allowSafetyBackupRestore,
    });
    if (planOnly) {
      console.log(renderAuthorityRestorePlanReport(plan));
      process.exitCode = plan.status === "blocked" ? 1 : 0;
      return;
    }
    const result = restoreAuthorityBackup({
      backupPath,
      force,
      allowSafetyBackupRestore,
    });
    console.log(`Authority restored from: ${result.restoredFrom}`);
    console.log(`DB path: ${result.dbPath}`);
    if (result.safetyBackupPath) {
      console.log(`Safety backup: ${result.safetyBackupPath}`);
    }
    return;
  }

  if (command === "preflight") {
    const snapshot = readAuthorityPreflightSnapshot();
    console.log(renderAuthorityPreflightReport(snapshot));
    process.exitCode = snapshot.status === "blocked" ? 1 : 0;
    return;
  }

  console.error(
    "Usage: tsx packages/authority-daemon/src/ops-cli.ts <doctor|backup|backups|migrate|restore|preflight> [--out DIR] [--file NAME] [--retain N] [--from BACKUP.sqlite|--latest] [--plan] [--force] [--allow-safety-backup]",
  );
  process.exitCode = 1;
}

void main();
