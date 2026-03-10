import type { CyberCompanyConfig } from "../../domain/org/types";
import type { AuthorityBootstrapSnapshot, AuthorityCompanyRuntimeSnapshot } from "./contract";

const runtimeSnapshots = new Map<string, AuthorityCompanyRuntimeSnapshot>();
let cachedConfig: CyberCompanyConfig | null = null;
let cachedActiveCompanyId: string | null = null;

function normalizeCompanyId(companyId: string | null | undefined) {
  const normalized = companyId?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function hydrateAuthorityBootstrapCache(snapshot: AuthorityBootstrapSnapshot) {
  cachedConfig = snapshot.config;
  cachedActiveCompanyId = snapshot.activeCompany?.id ?? snapshot.config?.activeCompanyId ?? null;
  runtimeSnapshots.clear();
  if (snapshot.runtime) {
    runtimeSnapshots.set(snapshot.runtime.companyId, snapshot.runtime);
  }
}

export function readCachedAuthorityConfig() {
  return cachedConfig;
}

export function readCachedAuthorityActiveCompanyId() {
  return cachedActiveCompanyId;
}

export function writeCachedAuthorityConfig(config: CyberCompanyConfig | null) {
  cachedConfig = config;
  cachedActiveCompanyId = config?.activeCompanyId ?? null;
}

export function writeCachedAuthorityRuntimeSnapshot(snapshot: AuthorityCompanyRuntimeSnapshot | null) {
  if (!snapshot) {
    return;
  }
  runtimeSnapshots.set(snapshot.companyId, snapshot);
}

export function readCachedAuthorityRuntimeSnapshot(companyId: string | null | undefined) {
  const key = normalizeCompanyId(companyId);
  if (!key) {
    return null;
  }
  return runtimeSnapshots.get(key) ?? null;
}

export function clearCachedAuthorityRuntimeSnapshot(companyId: string | null | undefined) {
  const key = normalizeCompanyId(companyId);
  if (!key) {
    return;
  }
  runtimeSnapshots.delete(key);
}

export function clearCachedAuthorityBootstrap() {
  cachedConfig = null;
  cachedActiveCompanyId = null;
  runtimeSnapshots.clear();
}
