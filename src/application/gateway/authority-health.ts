import type {
  AuthorityExecutorReadinessCheck,
  AuthorityHealthGuidanceItem,
  AuthorityHealthSnapshot,
} from "../../infrastructure/authority/contract";
import { buildAuthorityHealthGuidance } from "../../infrastructure/authority/health-guidance";

export type AuthorityUiState = "ready" | "degraded" | "blocked";
export type AuthorityGuidanceItem = AuthorityHealthGuidanceItem;
export type AuthorityBannerModel = {
  state: AuthorityUiState;
  title: string;
  summary: string;
  detail: string | null;
  steps: string[];
};

export function extractAuthorityHealthSnapshot(value: unknown): AuthorityHealthSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<AuthorityHealthSnapshot>;
  if (!candidate.executor || !candidate.executorConfig || !candidate.authority) {
    return null;
  }
  return candidate as AuthorityHealthSnapshot;
}

export function foldAuthorityUiStates(states: AuthorityUiState[]): AuthorityUiState {
  if (states.includes("blocked")) {
    return "blocked";
  }
  if (states.includes("degraded")) {
    return "degraded";
  }
  return "ready";
}

export function resolveAuthorityStorageState(
  health: AuthorityHealthSnapshot,
): AuthorityUiState {
  return foldAuthorityUiStates([
    health.authority.preflight.status,
    health.authority.doctor.status,
  ]);
}

export function resolveAuthorityControlState(
  health: AuthorityHealthSnapshot,
): AuthorityUiState {
  return foldAuthorityUiStates([
    resolveAuthorityStorageState(health),
    health.executor.state,
  ]);
}

export function buildAuthorityGuidanceItems(
  health: AuthorityHealthSnapshot,
  limit = 5,
): AuthorityGuidanceItem[] {
  if (health.authority.guidance?.length) {
    return health.authority.guidance.slice(0, limit);
  }
  return buildAuthorityHealthGuidance(
    {
      doctor: health.authority.doctor,
      preflight: health.authority.preflight,
      executor: health.executor,
    },
    limit,
  );
}

export function collectExecutorReadinessIssues(
  health: AuthorityHealthSnapshot,
  limit = 5,
): AuthorityExecutorReadinessCheck[] {
  return (health.executorReadiness ?? [])
    .filter((check) => check.state !== "ready")
    .slice(0, limit);
}

export function collectAuthorityGuidance(
  health: AuthorityHealthSnapshot,
  limit = 5,
): string[] {
  const structured = buildAuthorityGuidanceItems(health, limit);
  if (structured.length > 0) {
    return structured.map((item) => item.summary);
  }
  const deduped = new Set<string>();
  for (const line of [
    ...health.authority.preflight.issues,
    ...health.authority.preflight.warnings,
    ...health.authority.doctor.issues,
    ...health.authority.preflight.notes,
  ]) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    deduped.add(trimmed);
    if (deduped.size >= limit) {
      break;
    }
  }
  return [...deduped];
}

export function collectAuthorityRepairSteps(
  health: AuthorityHealthSnapshot,
  limit = 5,
): string[] {
  const items = buildAuthorityGuidanceItems(health, limit);
  if (items.length > 0) {
    return items.map((item) =>
      item.command ? `${item.action}（${item.command}）` : item.action,
    );
  }
  return collectAuthorityGuidance(health, limit);
}

export function buildAuthorityBannerModel(
  health: AuthorityHealthSnapshot,
  limit = 2,
): AuthorityBannerModel | null {
  const state = resolveAuthorityControlState(health);
  if (state === "ready") {
    return null;
  }

  const primary = buildAuthorityGuidanceItems(health, 1)[0] ?? null;
  const steps = collectAuthorityRepairSteps(health, limit);
  const detailParts = [
    `${health.authority.dbPath}`,
    `schema v${health.authority.doctor.schemaVersion ?? "?"}`,
    `integrity ${health.authority.doctor.integrityStatus}`,
    `备份 ${health.authority.doctor.backupCount} 份`,
  ];
  if (primary?.command) {
    detailParts.push(`推荐命令 ${primary.command}`);
  } else if (primary?.action) {
    detailParts.push(primary.action);
  }

  return {
    state,
    title: primary
      ? `Authority 当前${state === "blocked" ? "阻断运行" : "有待处理项"}：${primary.title}`
      : `Authority 当前${state === "blocked" ? "阻断运行" : "有待处理项"}`,
    summary:
      primary?.summary ??
      collectAuthorityGuidance(health, 1)[0] ??
      "Authority 当前还有待处理项，建议先完成诊断建议再继续推进。",
    detail: detailParts.join(" · "),
    steps,
  };
}
