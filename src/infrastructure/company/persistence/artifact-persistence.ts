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
    typeof candidate.revision === "number" &&
    typeof candidate.title === "string" &&
    typeof candidate.kind === "string" &&
    isArtifactStatus(candidate.status) &&
    (typeof candidate.content === "string" || candidate.content == null) &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

export function normalizeArtifactRecord(record: ArtifactRecord): ArtifactRecord {
  const revision = record.revision;
  return {
    ...record,
    revision: typeof revision === "number" && Number.isFinite(revision) && revision > 0
      ? Math.floor(revision)
      : 1,
  };
}

export function sanitizeArtifactRecords(records: ArtifactRecord[]): ArtifactRecord[] {
  const deduped = new Map<string, ArtifactRecord>();
  for (const record of records) {
    const normalized = normalizeArtifactRecord(record);
    if (!isArtifactRecord(normalized)) {
      continue;
    }
    const previous = deduped.get(normalized.id);
    const normalizedRevision = normalized.revision ?? 1;
    const previousRevision = previous?.revision ?? 1;
    if (
      !previous ||
      normalizedRevision > previousRevision ||
      (normalizedRevision === previousRevision && normalized.updatedAt >= previous.updatedAt)
    ) {
      deduped.set(normalized.id, normalized);
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
