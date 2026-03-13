import { describe, expect, it } from "vitest";
import type { ArtifactRecord } from "../../domain/artifact/types";
import type { WorkspaceFileRow } from "./index";
import {
  applyWorkspaceReaderManifest,
  buildWorkspaceReaderManifestDraft,
  isWorkspaceReaderManifestDraft,
  resolveWorkspaceReaderManifest,
} from "./reader-manifest";

function makeArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "artifact:reader-index",
    title: "workspace-reader-index.json",
    kind: "reader_index",
    status: "ready",
    createdAt: 1,
    updatedAt: 2,
    content: JSON.stringify({
      version: 1,
      title: "NovelCraft 阅读索引",
      items: [
        {
          id: "chapter-1",
          kind: "chapter",
          title: "第一章 开局",
          summary: "主角与世界观第一视角落地。",
          sourcePath: "novelcraft/output/ch01.md",
        },
      ],
    }),
    ...overrides,
  };
}

function makeFile(overrides: Partial<WorkspaceFileRow> = {}): WorkspaceFileRow {
  return {
    key: "co-cto:novelcraft/output/ch01.md",
    artifactId: "artifact:chapter-1",
    agentId: "co-cto",
    agentLabel: "CTO",
    role: "Chief Technology Officer",
    workspace: "产品产物库",
    name: "novelcraft/output/ch01.md",
    path: "novelcraft/output/ch01.md",
    kind: "tooling",
    resourceType: "tool",
    tags: ["tech.tool"],
    updatedAtMs: 10,
    ...overrides,
  };
}

describe("reader manifest", () => {
  it("resolves reader manifest from artifact content", () => {
    const manifest = resolveWorkspaceReaderManifest({
      artifacts: [makeArtifact()],
      files: [],
    });

    expect(manifest?.title).toBe("NovelCraft 阅读索引");
    expect(manifest?.items).toHaveLength(1);
    expect(manifest?.items[0]?.kind).toBe("chapter");
  });

  it("applies reader manifest to upgrade readable file kinds and labels", () => {
    const files = [makeFile()];
    const manifest = resolveWorkspaceReaderManifest({
      artifacts: [makeArtifact()],
      files,
    });

    const resolved = applyWorkspaceReaderManifest(files, manifest);
    expect(resolved[0]?.kind).toBe("chapter");
    expect(resolved[0]?.name).toBe("第一章 开局");
    expect(resolved[0]?.previewText).toBe("主角与世界观第一视角落地。");
  });

  it("builds a reader manifest draft from current workspace files", () => {
    const draft = buildWorkspaceReaderManifestDraft({
      title: "小说公司阅读索引草案",
      sourceLabel: "系统草案",
      files: [
        makeFile({
          name: "chapters/第01章 开局.md",
          path: "chapters/第01章 开局.md",
          previewText: "章节正文草稿",
        }),
        makeFile({
          key: "co-cto:docs/人物设定.md",
          name: "docs/人物设定.md",
          path: "docs/人物设定.md",
          previewText: "角色关系与能力边界",
        }),
        makeFile({
          key: "co-cto:reports/发布预检报告.md",
          name: "reports/发布预检报告.md",
          path: "reports/发布预检报告.md",
          previewText: "平台发布前检查结果",
        }),
        makeFile({
          key: "co-cto:workspace-reader-index.json",
          name: "workspace-reader-index.json",
          path: "workspace-reader-index.json",
          previewText: "{}",
        }),
      ],
    });

    expect(draft?.title).toBe("小说公司阅读索引草案");
    expect(draft?.sourceLabel).toBe("系统草案");
    expect(draft?.draft).toBe(true);
    expect(draft?.items).toHaveLength(3);
    expect(draft?.items.map((item) => item.kind)).toEqual(["chapter", "canon", "review"]);
    expect(draft?.items.map((item) => item.sourceName)).toEqual([
      "chapters/第01章 开局.md",
      "docs/人物设定.md",
      "reports/发布预检报告.md",
    ]);
  });

  it("returns null when no eligible files can seed a reader draft", () => {
    const draft = buildWorkspaceReaderManifestDraft({
      files: [
        makeFile({
          name: "scripts/build-index.py",
          path: "scripts/build-index.py",
          previewText: "utility script",
        }),
      ],
    });

    expect(draft).toBeNull();
  });

  it("skips authority-managed control files when generating a reader draft", () => {
    const draft = buildWorkspaceReaderManifestDraft({
      files: [
        makeFile({
          key: "co-cto:OPERATIONS.md",
          name: "OPERATIONS.md",
          path: "OPERATIONS.md",
          previewText: "系统自动生成的运营说明",
        }),
        makeFile({
          key: "co-cto:department-context.json",
          name: "department-context.json",
          path: "department-context.json",
          previewText: "{\"role\":\"cto\"}",
        }),
        makeFile({
          key: "co-cto:docs/人物设定.md",
          name: "docs/人物设定.md",
          path: "docs/人物设定.md",
          previewText: "角色关系与能力边界",
        }),
      ],
    });

    expect(draft?.items).toHaveLength(1);
    expect(draft?.items[0]?.sourceName).toBe("docs/人物设定.md");
    expect(draft?.items[0]?.kind).toBe("canon");
  });

  it("recognizes architecture and docs plans from real workspace-style names", () => {
    const draft = buildWorkspaceReaderManifestDraft({
      files: [
        makeFile({
          key: "co-cto:ai-novel-system-architecture.md",
          name: "ai-novel-system-architecture.md",
          path: "ai-novel-system-architecture.md",
          previewText: "NovelCraft 技术底座与系统蓝图",
        }),
        makeFile({
          key: "co-coo:docs/AI_Novel_Creation_System_Operations_Plan.md",
          name: "docs/AI_Novel_Creation_System_Operations_Plan.md",
          path: "docs/AI_Novel_Creation_System_Operations_Plan.md",
          previewText: "全自动 AI 小说创作系统运营方案",
        }),
        makeFile({
          key: "co-coo:docs/Tomato_Platform_Login_Assessment.md",
          name: "docs/Tomato_Platform_Login_Assessment.md",
          path: "docs/Tomato_Platform_Login_Assessment.md",
          previewText: "番茄平台登录方式评估报告",
        }),
      ],
    });

    expect(draft?.items.map((item) => item.kind)).toEqual(["canon", "review", "review"]);
  });

  it("preserves draft status from manifest content for UI state", () => {
    const manifest = resolveWorkspaceReaderManifest({
      artifacts: [
        makeArtifact({
          content: JSON.stringify({
            version: 1,
            title: "NovelCraft 阅读索引草案",
            draft: true,
            sourceLabel: "系统草案",
            items: [
              {
                id: "canon-1",
                kind: "canon",
                sourcePath: "ai-novel-system-architecture.md",
              },
            ],
          }),
        }),
      ],
      files: [],
    });

    expect(manifest?.sourceLabel).toBe("系统草案");
    expect(isWorkspaceReaderManifestDraft(manifest)).toBe(true);
  });
});
