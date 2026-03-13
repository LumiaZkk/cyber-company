import type { ArtifactRecord } from "../../domain/artifact/types";
import {
  applyWorkspaceAppManifest,
  buildWorkspaceAppManifestDraft,
  isWorkspaceAppManifestDraft,
  resolveWorkspaceAppManifest,
  type WorkspaceAppManifest,
  type WorkspaceAppManifestResource,
} from "./app-manifest";
import type { WorkspaceFileRow } from "./index";

export type WorkspaceReaderManifestResourceKind = "chapter" | "canon" | "review";

export type WorkspaceReaderManifestEntry = {
  id: string;
  kind: WorkspaceReaderManifestResourceKind;
  title?: string;
  summary?: string;
  artifactId?: string;
  sourcePath?: string;
  sourceName?: string;
};

export type WorkspaceReaderManifest = {
  version: 1;
  title?: string;
  items: WorkspaceReaderManifestEntry[];
  sourceLabel?: string;
  draft?: boolean;
};

function readerKindToSlot(kind: WorkspaceReaderManifestResourceKind): string {
  switch (kind) {
    case "chapter":
      return "content";
    case "canon":
      return "reference";
    case "review":
      return "reports";
  }
}

function resourceToReaderKind(resource: WorkspaceAppManifestResource): WorkspaceReaderManifestResourceKind | null {
  switch (resource.slot) {
    case "content":
      return "chapter";
    case "reference":
      return "canon";
    case "reports":
      return "review";
    default:
      return null;
  }
}

function toReaderManifest(manifest: WorkspaceAppManifest): WorkspaceReaderManifest {
  return {
    version: 1,
    title: manifest.title,
    sourceLabel: manifest.sourceLabel,
    draft: manifest.draft,
    items: (manifest.resources ?? []).reduce<WorkspaceReaderManifestEntry[]>((acc, resource) => {
      const kind = resourceToReaderKind(resource);
      if (!kind) {
        return acc;
      }
      acc.push({
        id: resource.id,
        kind,
        title: resource.title,
        summary: resource.summary,
        artifactId: resource.artifactId,
        sourcePath: resource.sourcePath,
        sourceName: resource.sourceName,
      });
      return acc;
    }, []),
  };
}

function toReaderAppManifest(manifest: WorkspaceReaderManifest): WorkspaceAppManifest {
  return {
    version: 1,
    title: manifest.title,
    sourceLabel: manifest.sourceLabel,
    draft: manifest.draft,
    sections: [
      {
        id: "reader-content",
        label: "正文",
        slot: "content",
        order: 0,
        selectors: [{ tags: ["story.chapter"] }],
      },
      {
        id: "reader-reference",
        label: "设定",
        slot: "reference",
        order: 1,
        selectors: [{ tags: ["story.canon"] }],
      },
      {
        id: "reader-reports",
        label: "报告",
        slot: "reports",
        order: 2,
        selectors: [{ tags: ["qa.report"] }],
      },
    ],
    resources: manifest.items.map((item) => ({
      id: item.id,
      slot: readerKindToSlot(item.kind),
      title: item.title,
      summary: item.summary,
      artifactId: item.artifactId,
      sourcePath: item.sourcePath,
      sourceName: item.sourceName,
      resourceType: item.kind === "review" ? "report" : "document",
      tags:
        item.kind === "chapter"
          ? ["story.chapter", "company.resource"]
          : item.kind === "canon"
            ? ["story.canon", "company.resource"]
            : ["qa.report", "company.resource"],
    })),
  };
}

export function isWorkspaceReaderManifestDraft(manifest: WorkspaceReaderManifest | null | undefined) {
  return isWorkspaceAppManifestDraft(manifest ? toReaderAppManifest(manifest) : null);
}

export function buildWorkspaceReaderManifestDraft(input: {
  files: WorkspaceFileRow[];
  title?: string;
  sourceLabel?: string;
}): WorkspaceReaderManifest | null {
  const manifest = buildWorkspaceAppManifestDraft({
    app: {
      id: "app:reader",
      slug: "reader",
      title: input.title ?? "公司阅读器",
      template: "reader",
    },
    files: input.files,
    title: input.title,
    sourceLabel: input.sourceLabel,
  });
  if (!manifest) {
    return null;
  }
  return toReaderManifest(manifest);
}

export function resolveWorkspaceReaderManifest(input: {
  artifacts: ArtifactRecord[];
  files: WorkspaceFileRow[];
}): WorkspaceReaderManifest | null {
  const manifest = resolveWorkspaceAppManifest({
    app: {
      id: "app:reader",
      slug: "reader",
      title: "公司阅读器",
      template: "reader",
      manifestArtifactId: null,
    },
    artifacts: input.artifacts,
    files: input.files,
  });
  return manifest.resources && manifest.resources.length > 0 ? toReaderManifest(manifest) : null;
}

export function applyWorkspaceReaderManifest(
  files: WorkspaceFileRow[],
  manifest: WorkspaceReaderManifest | null,
): WorkspaceFileRow[] {
  if (!manifest) {
    return files;
  }
  return applyWorkspaceAppManifest(files, toReaderAppManifest(manifest)).map((file) => {
    const item = manifest.items.find((candidate) => {
      if (candidate.artifactId && file.artifactId === candidate.artifactId) {
        return true;
      }
      if (candidate.sourcePath && file.path === candidate.sourcePath) {
        return true;
      }
      if (candidate.sourceName && file.name === candidate.sourceName) {
        return true;
      }
      return false;
    });
    if (!item) {
      return file;
    }
    return {
      ...file,
      kind: item.kind,
    };
  });
}
