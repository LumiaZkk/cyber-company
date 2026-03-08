import type { ArtifactRecord, ArtifactStatus } from "./types";

const ARTIFACT_CACHE_PREFIX = "cyber_company_artifacts:";
const ARTIFACT_LIMIT = 256;

function isArtifactStatus(value: unknown): value is ArtifactStatus {
  return value === "draft" || value === "ready" || value === "superseded" || value === "archived";
}

function isArtifactRecord(value: unknown): value is ArtifactRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArtifactRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.kind === "string" &&
    isArtifactStatus(candidate.status) &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

function getArtifactCacheKey(companyId: string) {
  return `${ARTIFACT_CACHE_PREFIX}${companyId.trim()}`;
}

export function loadArtifactRecords(companyId: string | null | undefined): ArtifactRecord[] {
  if (!companyId) {
    return [];
  }

  const raw = localStorage.getItem(getArtifactCacheKey(companyId));
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isArtifactRecord).sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export function persistArtifactRecords(
  companyId: string | null | undefined,
  artifacts: ArtifactRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = [...artifacts]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, ARTIFACT_LIMIT);
  localStorage.setItem(getArtifactCacheKey(companyId), JSON.stringify(trimmed));
}

export function clearArtifactRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  localStorage.removeItem(getArtifactCacheKey(companyId));
}
