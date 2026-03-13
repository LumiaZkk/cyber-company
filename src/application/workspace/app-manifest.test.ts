import { describe, expect, it } from "vitest";
import type { ArtifactRecord } from "../../domain/artifact/types";
import type { CompanyWorkspaceApp } from "../../domain/org/types";
import type { WorkspaceFileRow } from "./index";
import {
  applyWorkspaceAppManifest,
  buildWorkspaceAppManifestDraft,
  getWorkspaceAppFilesForSection,
  resolveWorkspaceAppManifest,
} from "./app-manifest";

function makeReaderApp(overrides: Partial<CompanyWorkspaceApp> = {}): CompanyWorkspaceApp {
  return {
    id: "app:reader",
    slug: "reader",
    title: "公司阅读器",
    description: "阅读器",
    icon: "📖",
    kind: "custom",
    status: "ready",
    surface: "template",
    template: "reader",
    ...overrides,
  };
}

function makeFile(overrides: Partial<WorkspaceFileRow> = {}): WorkspaceFileRow {
  return {
    key: "file-1",
    artifactId: "artifact:chapter-1",
    agentId: "writer",
    agentLabel: "写手",
    role: "小说写手",
    workspace: "产品产物库",
    name: "chapters/第一章.md",
    path: "chapters/第一章.md",
    kind: "chapter",
    resourceType: "document",
    tags: ["story.chapter", "company.resource"],
    previewText: "第一章正文",
    updatedAtMs: 100,
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "artifact:manifest",
    title: "workspace-app-manifest.reader.json",
    kind: "app_manifest",
    status: "draft",
    createdAt: 1,
    updatedAt: 2,
    content: JSON.stringify({
      version: 1,
      title: "NovelCraft 阅读器",
      sections: [
        {
          id: "reader-content",
          label: "正文",
          slot: "content",
          order: 0,
          selectors: [{ tags: ["story.chapter"] }],
        },
      ],
      resources: [
        {
          id: "chapter-1",
          slot: "content",
          title: "第一章 开局",
          summary: "修订后的章节摘要",
          sourcePath: "chapters/第一章.md",
          resourceType: "document",
          tags: ["story.chapter", "company.resource"],
        },
      ],
      actions: [
        {
          id: "trigger-reader-index",
          label: "重建阅读索引",
          actionType: "trigger_skill",
          target: "reader.build-index",
        },
      ],
    }),
    ...overrides,
  };
}

describe("workspace app manifest", () => {
  it("migrates legacy reader-index artifacts into generic app manifests", () => {
    const manifest = resolveWorkspaceAppManifest({
      app: makeReaderApp(),
      artifacts: [
        makeArtifact({
          kind: "reader_index",
          title: "workspace-reader-index.json",
          content: JSON.stringify({
            version: 1,
            title: "Legacy Reader",
            draft: true,
            items: [
              {
                id: "chapter-1",
                kind: "chapter",
                sourcePath: "chapters/第一章.md",
              },
            ],
          }),
        }),
      ],
      files: [],
    });

    expect(manifest.title).toBe("Legacy Reader");
    expect(manifest.draft).toBe(true);
    expect(manifest.resources).toHaveLength(1);
    expect(manifest.resources?.[0]?.slot).toBe("content");
    expect(manifest.resources?.[0]?.tags).toContain("story.chapter");
  });

  it("builds reader manifest drafts from current workspace files", () => {
    const manifest = buildWorkspaceAppManifestDraft({
      app: makeReaderApp(),
      title: "小说阅读器 AppManifest 草案",
      sourceLabel: "系统草案",
      files: [
        makeFile(),
        makeFile({
          key: "canon-1",
          artifactId: "artifact:canon-1",
          name: "docs/人物设定.md",
          path: "docs/人物设定.md",
          kind: "canon",
          previewText: "设定说明",
          tags: ["story.canon", "company.resource"],
        }),
        makeFile({
          key: "review-1",
          artifactId: "artifact:review-1",
          name: "reports/审校报告.md",
          path: "reports/审校报告.md",
          kind: "review",
          resourceType: "report",
          previewText: "审校结果",
          tags: ["qa.report", "company.resource"],
        }),
      ],
    });

    expect(manifest?.draft).toBe(true);
    expect(manifest?.resources).toHaveLength(3);
    expect(manifest?.actions?.map((action) => action.id)).toContain("trigger-reader-index");
  });

  it("applies manifest resource overrides and selects files by section", () => {
    const files = [
      makeFile(),
      makeFile({
        key: "review-1",
        artifactId: "artifact:review-1",
        name: "reports/审校报告.md",
        path: "reports/审校报告.md",
        kind: "review",
        resourceType: "report",
        tags: ["qa.report", "company.resource"],
      }),
    ];
    const manifest = resolveWorkspaceAppManifest({
      app: makeReaderApp(),
      artifacts: [makeArtifact()],
      files,
    });

    const resolved = applyWorkspaceAppManifest(files, manifest);
    expect(resolved[0]?.name).toBe("第一章 开局");
    expect(resolved[0]?.previewText).toBe("修订后的章节摘要");
    expect(getWorkspaceAppFilesForSection(resolved, manifest, "content").map((file) => file.key)).toEqual(["file-1"]);
  });
});
