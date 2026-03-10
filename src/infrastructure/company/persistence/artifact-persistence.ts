import type { ArtifactRecord, ArtifactStatus } from "./types";

const ARTIFACT_LIMIT = 256;
const artifactCache = new Map<string, ArtifactRecord[]>();

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
    (typeof candidate.content === "string" || candidate.content == null) &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

export function sanitizeArtifactRecords(records: ArtifactRecord[]): ArtifactRecord[] {
  const deduped = new Map<string, ArtifactRecord>();
  for (const record of records) {
    if (!isArtifactRecord(record)) {
      continue;
    }
    const previous = deduped.get(record.id);
    if (!previous || record.updatedAt >= previous.updatedAt) {
      deduped.set(record.id, record);
    }
  }
  return [...deduped.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function loadArtifactRecords(companyId: string | null | undefined): ArtifactRecord[] {
  if (!companyId) {
    return [];
  }
  return artifactCache.get(companyId) ?? [];
}

export function persistArtifactRecords(
  companyId: string | null | undefined,
  artifacts: ArtifactRecord[],
) {
  if (!companyId) {
    return;
  }

  const trimmed = sanitizeArtifactRecords(artifacts)
    .slice(0, ARTIFACT_LIMIT);
  artifactCache.set(companyId, trimmed);
}

export function clearArtifactRecords(companyId: string | null | undefined) {
  if (!companyId) {
    return;
  }
  artifactCache.delete(companyId);
}
