import type { WorkspaceFileRow } from "./index";

const STORAGE_PREFIX = "cyber-company:workspace-reader";
const MAX_RECENT_FILES = 6;
const MAX_FILE_VISITS = 24;

export type WorkspaceFileVisit = {
  fileKey: string;
  lastViewedAt: number;
  viewCount: number;
};

export type WorkspaceReaderPageSnapshot = {
  lastSelectedAppId: string | null;
  lastSelectedKnowledgeId: string | null;
  lastSelectedFileKey: string | null;
  recentFileKeys: string[];
  fileVisits: WorkspaceFileVisit[];
};

export type WorkspaceReaderIndex = {
  totalReadableFiles: number;
  lastOpenedFile: WorkspaceFileRow | null;
  recentFiles: WorkspaceFileRow[];
  latestUpdatedFiles: WorkspaceFileRow[];
};

function createDefaultSnapshot(): WorkspaceReaderPageSnapshot {
  return {
    lastSelectedAppId: null,
    lastSelectedKnowledgeId: null,
    lastSelectedFileKey: null,
    recentFileKeys: [],
    fileVisits: [],
  };
}

function buildStorageKey(companyId: string) {
  return `${STORAGE_PREFIX}:${companyId}`;
}

function getStorage(): Pick<Storage, "getItem" | "setItem"> {
  if (
    typeof globalThis === "object" &&
    globalThis &&
    "localStorage" in globalThis &&
    typeof globalThis.localStorage?.getItem === "function" &&
    typeof globalThis.localStorage?.setItem === "function"
  ) {
    return globalThis.localStorage;
  }

  return {
    getItem: () => null,
    setItem: () => {},
  };
}

function normalizeSnapshot(value: unknown): WorkspaceReaderPageSnapshot {
  if (!value || typeof value !== "object") {
    return createDefaultSnapshot();
  }
  const record = value as Record<string, unknown>;
  return {
    lastSelectedAppId:
      typeof record.lastSelectedAppId === "string" && record.lastSelectedAppId.trim().length > 0
        ? record.lastSelectedAppId
        : null,
    lastSelectedKnowledgeId:
      typeof record.lastSelectedKnowledgeId === "string" && record.lastSelectedKnowledgeId.trim().length > 0
        ? record.lastSelectedKnowledgeId
        : null,
    lastSelectedFileKey:
      typeof record.lastSelectedFileKey === "string" && record.lastSelectedFileKey.trim().length > 0
        ? record.lastSelectedFileKey
        : null,
    recentFileKeys: Array.isArray(record.recentFileKeys)
      ? record.recentFileKeys.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT_FILES)
      : [],
    fileVisits: Array.isArray(record.fileVisits)
      ? record.fileVisits
          .filter((item): item is WorkspaceFileVisit => Boolean(item && typeof item === "object"))
          .map((item) => ({
            fileKey: typeof item.fileKey === "string" ? item.fileKey : "",
            lastViewedAt: typeof item.lastViewedAt === "number" ? item.lastViewedAt : 0,
            viewCount: typeof item.viewCount === "number" ? item.viewCount : 0,
          }))
          .filter((item) => item.fileKey.length > 0)
          .slice(0, MAX_FILE_VISITS)
      : [],
  };
}

export function loadWorkspaceReaderSnapshot(
  companyId: string | null | undefined,
): WorkspaceReaderPageSnapshot {
  if (!companyId) {
    return createDefaultSnapshot();
  }

  try {
    const raw = getStorage().getItem(buildStorageKey(companyId));
    if (!raw) {
      return createDefaultSnapshot();
    }
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return createDefaultSnapshot();
  }
}

export function saveWorkspaceReaderSnapshot(
  companyId: string | null | undefined,
  snapshot: WorkspaceReaderPageSnapshot,
) {
  if (!companyId) {
    return;
  }
  try {
    getStorage().setItem(buildStorageKey(companyId), JSON.stringify(snapshot));
  } catch {
    // Best-effort UI state only.
  }
}

export function withWorkspaceSelection(
  snapshot: WorkspaceReaderPageSnapshot,
  input: {
    selectedAppId?: string | null;
    selectedKnowledgeId?: string | null;
    selectedFileKey?: string | null;
  },
): WorkspaceReaderPageSnapshot {
  return {
    ...snapshot,
    lastSelectedAppId:
      input.selectedAppId !== undefined ? input.selectedAppId : snapshot.lastSelectedAppId,
    lastSelectedKnowledgeId:
      input.selectedKnowledgeId !== undefined ? input.selectedKnowledgeId : snapshot.lastSelectedKnowledgeId,
    lastSelectedFileKey:
      input.selectedFileKey !== undefined ? input.selectedFileKey : snapshot.lastSelectedFileKey,
  };
}

export function recordWorkspaceFileVisit(
  snapshot: WorkspaceReaderPageSnapshot,
  fileKey: string | null | undefined,
  viewedAt = Date.now(),
): WorkspaceReaderPageSnapshot {
  if (!fileKey) {
    return snapshot;
  }

  const existing = snapshot.fileVisits.find((item) => item.fileKey === fileKey);
  const nextVisit: WorkspaceFileVisit = existing
    ? { fileKey, lastViewedAt: viewedAt, viewCount: existing.viewCount + 1 }
    : { fileKey, lastViewedAt: viewedAt, viewCount: 1 };

  return {
    ...snapshot,
    lastSelectedFileKey: fileKey,
    recentFileKeys: [fileKey, ...snapshot.recentFileKeys.filter((item) => item !== fileKey)].slice(
      0,
      MAX_RECENT_FILES,
    ),
    fileVisits: [nextVisit, ...snapshot.fileVisits.filter((item) => item.fileKey !== fileKey)].slice(
      0,
      MAX_FILE_VISITS,
    ),
  };
}

export function buildWorkspaceReaderIndex(input: {
  files: WorkspaceFileRow[];
  snapshot: WorkspaceReaderPageSnapshot;
}): WorkspaceReaderIndex {
  const fileByKey = new Map(input.files.map((file) => [file.key, file] as const));
  const lastOpenedFile = input.snapshot.lastSelectedFileKey
    ? fileByKey.get(input.snapshot.lastSelectedFileKey) ?? null
    : null;
  const recentFiles = input.snapshot.recentFileKeys
    .map((fileKey) => fileByKey.get(fileKey) ?? null)
    .filter((file): file is WorkspaceFileRow => Boolean(file));
  const latestUpdatedFiles = [...input.files]
    .sort((left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0))
    .slice(0, 3);

  return {
    totalReadableFiles: input.files.length,
    lastOpenedFile,
    recentFiles,
    latestUpdatedFiles,
  };
}
