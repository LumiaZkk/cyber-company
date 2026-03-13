import { describe, expect, it } from "vitest";
import {
  buildWorkspaceReaderIndex,
  recordWorkspaceFileVisit,
  withWorkspaceSelection,
  type WorkspaceReaderPageSnapshot,
} from "./reader-state";
import type { WorkspaceFileRow } from "./index";

function makeSnapshot(overrides?: Partial<WorkspaceReaderPageSnapshot>): WorkspaceReaderPageSnapshot {
  return {
    lastSelectedAppId: null,
    lastSelectedKnowledgeId: null,
    lastSelectedFileKey: null,
    recentFileKeys: [],
    fileVisits: [],
    ...overrides,
  };
}

function makeFile(overrides?: Partial<WorkspaceFileRow>): WorkspaceFileRow {
  return {
    key: "file-1",
    agentId: "writer",
    agentLabel: "写手",
    role: "小说写手",
    workspace: "产品产物库",
    name: "第一章.md",
    path: "chapters/第一章.md",
    kind: "chapter",
    resourceType: "document",
    tags: ["story.chapter", "company.resource"],
    updatedAtMs: 100,
    ...overrides,
  };
}

describe("workspace reader state", () => {
  it("tracks selection and recent file visits", () => {
    const selected = withWorkspaceSelection(makeSnapshot(), {
      selectedAppId: "app:reader",
      selectedKnowledgeId: "knowledge-1",
    });
    const visited = recordWorkspaceFileVisit(selected, "file-1", 1000);

    expect(visited.lastSelectedAppId).toBe("app:reader");
    expect(visited.lastSelectedKnowledgeId).toBe("knowledge-1");
    expect(visited.lastSelectedFileKey).toBe("file-1");
    expect(visited.recentFileKeys).toEqual(["file-1"]);
    expect(visited.fileVisits[0]).toEqual({
      fileKey: "file-1",
      lastViewedAt: 1000,
      viewCount: 1,
    });
  });

  it("builds reader index from snapshot and readable files", () => {
    const files = [
      makeFile({ key: "chapter-1", updatedAtMs: 100 }),
      makeFile({ key: "canon-1", name: "设定.md", path: "canon/设定.md", kind: "canon", updatedAtMs: 300 }),
      makeFile({ key: "review-1", name: "审校报告.md", path: "review/审校报告.md", kind: "review", updatedAtMs: 200 }),
    ];
    const snapshot = makeSnapshot({
      lastSelectedFileKey: "canon-1",
      recentFileKeys: ["review-1", "canon-1"],
    });

    const index = buildWorkspaceReaderIndex({ files, snapshot });
    expect(index.totalReadableFiles).toBe(3);
    expect(index.lastOpenedFile?.key).toBe("canon-1");
    expect(index.recentFiles.map((file) => file.key)).toEqual(["review-1", "canon-1"]);
    expect(index.latestUpdatedFiles.map((file) => file.key)).toEqual(["canon-1", "review-1", "chapter-1"]);
  });
});
