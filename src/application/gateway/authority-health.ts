import type { AuthorityHealthSnapshot } from "../../infrastructure/authority/contract";

export type AuthorityUiState = "ready" | "degraded" | "blocked";

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

export function collectAuthorityGuidance(
  health: AuthorityHealthSnapshot,
  limit = 5,
): string[] {
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
