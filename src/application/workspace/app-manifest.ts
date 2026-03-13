import type { ArtifactRecord, ArtifactResourceType } from "../../domain/artifact/types";
import type { CompanyWorkspaceApp } from "../../domain/org/types";

type AppManifestWorkspaceFile = {
  artifactId?: string;
  key: string;
  name: string;
  path: string;
  previewText?: string;
  resourceType: ArtifactResourceType;
  tags: string[];
};

export type WorkspaceAppManifestSelector = {
  resourceTypes?: ArtifactResourceType[];
  tags?: string[];
};

export type WorkspaceAppManifestSection = {
  id: string;
  label: string;
  slot: string;
  order: number;
  selectors: WorkspaceAppManifestSelector[];
  emptyState?: string;
};

export type WorkspaceAppManifestResource = {
  id: string;
  slot: string;
  title?: string;
  summary?: string;
  artifactId?: string;
  sourcePath?: string;
  sourceName?: string;
  resourceType?: ArtifactResourceType;
  tags?: string[];
};

export type WorkspaceAppManifestAction = {
  id: string;
  label: string;
  actionType: "workbench_request" | "open_chat" | "refresh_manifest" | "trigger_skill";
  target: string;
  input?: Record<string, unknown>;
};

export type WorkspaceAppManifest = {
  version: 1;
  appId?: string;
  appSlug?: string;
  title?: string;
  sourceLabel?: string;
  draft?: boolean;
  sections: WorkspaceAppManifestSection[];
  resources?: WorkspaceAppManifestResource[];
  actions?: WorkspaceAppManifestAction[];
};

type LegacyReaderManifestResourceKind = "chapter" | "canon" | "review";

type LegacyReaderManifestEntry = {
  id: string;
  kind: LegacyReaderManifestResourceKind;
  title?: string;
  summary?: string;
  artifactId?: string;
  sourcePath?: string;
  sourceName?: string;
};

type LegacyReaderManifest = {
  version: 1;
  title?: string;
  items: LegacyReaderManifestEntry[];
  sourceLabel?: string;
  draft?: boolean;
};

const APP_MANIFEST_FILE_PATTERN = /(?:workspace-|company-)?app-manifest(?:\.[a-z0-9-]+)?\.json$/i;
const READER_MANIFEST_FILE_PATTERN = /(workspace-|novel-)?reader-index\.json$/i;
const MANAGED_WORKSPACE_CONTROL_FILE_NAMES = new Set([
  "company-context.json",
  "department-context.json",
  "collaboration-context.json",
  "operations.md",
  "department-operations.md",
]);

function buildDefaultSections(
  template: CompanyWorkspaceApp["template"],
): WorkspaceAppManifestSection[] {
  switch (template) {
    case "reader":
      return [
        {
          id: "reader-content",
          label: "正文",
          slot: "content",
          order: 0,
          selectors: [{ tags: ["story.chapter"] }],
          emptyState: "当前还没有可阅读的正文。",
        },
        {
          id: "reader-reference",
          label: "设定",
          slot: "reference",
          order: 1,
          selectors: [{ tags: ["story.canon"] }],
          emptyState: "当前还没有可对照的设定文件。",
        },
        {
          id: "reader-reports",
          label: "报告",
          slot: "reports",
          order: 2,
          selectors: [{ tags: ["qa.report"] }],
          emptyState: "当前还没有审校或验收报告。",
        },
      ];
    case "consistency":
      return [
        {
          id: "consistency-truth",
          label: "真相源",
          slot: "truth",
          order: 0,
          selectors: [{ tags: ["story.canon"] }],
        },
        {
          id: "consistency-reports",
          label: "过程报告",
          slot: "reports",
          order: 1,
          selectors: [{ tags: ["qa.report"] }],
        },
        {
          id: "consistency-tools",
          label: "工具脚本",
          slot: "tools",
          order: 2,
          selectors: [{ resourceTypes: ["tool"], tags: ["tech.tool"] }],
        },
      ];
    case "knowledge":
      return [
        {
          id: "knowledge-sources",
          label: "来源文件",
          slot: "sources",
          order: 0,
          selectors: [{ tags: ["company.knowledge"] }, { tags: ["qa.report"] }],
        },
      ];
    case "workbench":
      return [];
    case "review-console":
      return [
        {
          id: "review-console-reports",
          label: "审阅报告",
          slot: "reports",
          order: 0,
          selectors: [{ tags: ["qa.report"] }],
        },
      ];
    case "dashboard":
      return [
        {
          id: "dashboard-state",
          label: "状态数据",
          slot: "state",
          order: 0,
          selectors: [{ resourceTypes: ["state", "dataset"] }],
        },
      ];
    default:
      return [];
  }
}

function buildDefaultActions(
  template: CompanyWorkspaceApp["template"],
): WorkspaceAppManifestAction[] {
  switch (template) {
    case "reader":
      return [
        {
          id: "trigger-reader-index",
          label: "重建阅读索引",
          actionType: "trigger_skill",
          target: "reader.build-index",
        },
        {
          id: "refresh-reader-manifest",
          label: "刷新 AppManifest",
          actionType: "refresh_manifest",
          target: "reader",
        },
      ];
    case "consistency":
      return [
        {
          id: "trigger-consistency-check",
          label: "执行一致性检查",
          actionType: "trigger_skill",
          target: "consistency.check",
        },
        {
          id: "request-consistency-checker",
          label: "让 CTO 开发一致性工具",
          actionType: "workbench_request",
          target: "consistency-checker",
        },
      ];
    case "review-console":
      return [
        {
          id: "trigger-review-precheck",
          label: "执行发布前检查",
          actionType: "trigger_skill",
          target: "review.precheck",
        },
      ];
    case "workbench":
      return [
        { id: "open-cto-chat", label: "打开 CTO 会话", actionType: "open_chat", target: "cto" },
      ];
    default:
      return [];
  }
}

function buildDefaultManifest(app: Pick<CompanyWorkspaceApp, "id" | "slug" | "title" | "template">) {
  return {
    version: 1,
    appId: app.id,
    appSlug: app.slug,
    title: app.title,
    sections: buildDefaultSections(app.template),
    actions: buildDefaultActions(app.template),
  } satisfies WorkspaceAppManifest;
}

function isManifestArtifactCandidate(input: {
  name?: string | null;
  path?: string | null;
  kind?: string | null;
}) {
  const haystack = `${input.name ?? ""} ${input.path ?? ""}`.trim();
  return (
    input.kind === "app_manifest" ||
    APP_MANIFEST_FILE_PATTERN.test(haystack) ||
    READER_MANIFEST_FILE_PATTERN.test(haystack)
  );
}

function tagsForLegacyKind(kind: LegacyReaderManifestResourceKind) {
  switch (kind) {
    case "chapter":
      return { resourceType: "document" as const, tags: ["story.chapter", "company.resource"] };
    case "canon":
      return { resourceType: "document" as const, tags: ["story.canon", "company.resource"] };
    case "review":
      return { resourceType: "report" as const, tags: ["qa.report", "company.resource"] };
  }
}

function isManagedWorkspaceControlFile(file: Pick<AppManifestWorkspaceFile, "name" | "path">) {
  const normalizedName = file.name.trim().toLowerCase();
  const normalizedPath = file.path.trim().toLowerCase();
  if (MANAGED_WORKSPACE_CONTROL_FILE_NAMES.has(normalizedName)) {
    return true;
  }
  if (MANAGED_WORKSPACE_CONTROL_FILE_NAMES.has(normalizedPath)) {
    return true;
  }
  return normalizedPath.split("/").some((segment) => MANAGED_WORKSPACE_CONTROL_FILE_NAMES.has(segment));
}

function inferDraftSlot(file: AppManifestWorkspaceFile): { slot: string; resourceType: ArtifactResourceType; tags: string[] } | null {
  if (isManagedWorkspaceControlFile(file)) {
    return null;
  }

  const haystack = `${file.name} ${file.path} ${file.previewText ?? ""}`.toLowerCase();
  if (/(第?\s*\d+\s*章|chapter|chapters\/|正文|剧情|段落)/i.test(haystack)) {
    return { slot: "content", resourceType: "document", tags: ["story.chapter", "company.resource"] };
  }
  if (
    /(设定|人物|时间线|伏笔|世界观|canon|timeline|character|world|architecture|system-architecture|blueprint|技术架构|技术底座|架构)/i.test(
      haystack,
    )
  ) {
    const tags = new Set<string>(["story.canon", "company.resource"]);
    if (/(时间线|timeline)/i.test(haystack)) {
      tags.add("story.timeline");
    }
    if (/(伏笔|foreshadow)/i.test(haystack)) {
      tags.add("story.foreshadow");
    }
    return { slot: "reference", resourceType: "document", tags: [...tags] };
  }
  if (
    /(审校|review|报告|验收|检查|check|summary|总结|precheck|assessment|guide|plan|playbook|manual|ops|operations|运营|流程|注册|登录|发布)/i.test(
      haystack,
    )
  ) {
    return { slot: "reports", resourceType: "report", tags: ["qa.report", "company.resource"] };
  }
  if (/(^|\/)docs\//i.test(file.path) && /\.(md|mdx|txt)$/i.test(file.path)) {
    return { slot: "reports", resourceType: "report", tags: ["qa.report", "company.resource"] };
  }
  return null;
}

function parseLegacyReaderManifest(
  content: string,
  app: Pick<CompanyWorkspaceApp, "id" | "slug" | "title" | "template">,
  sourceLabel?: string,
): WorkspaceAppManifest | null {
  try {
    const parsed = JSON.parse(content) as Partial<LegacyReaderManifest>;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return null;
    }
    const base = buildDefaultManifest(app);
    return {
      ...base,
      title: typeof parsed.title === "string" ? parsed.title : base.title,
      sourceLabel:
        typeof parsed.sourceLabel === "string" && parsed.sourceLabel.trim().length > 0
          ? parsed.sourceLabel
          : sourceLabel,
      draft: parsed.draft === true || parsed.sourceLabel === "系统草案",
      resources: parsed.items.reduce<WorkspaceAppManifestResource[]>((acc, item, index) => {
        if (!item || typeof item !== "object" || !item.kind) {
          return acc;
        }
        const descriptor = tagsForLegacyKind(item.kind);
        acc.push({
          id: typeof item.id === "string" ? item.id : `reader-resource-${index + 1}`,
          slot:
            item.kind === "chapter"
              ? "content"
              : item.kind === "canon"
                ? "reference"
                : "reports",
          title: item.title,
          summary: item.summary,
          artifactId: item.artifactId,
          sourcePath: item.sourcePath,
          sourceName: item.sourceName,
          resourceType: descriptor.resourceType,
          tags: descriptor.tags,
        });
        return acc;
      }, []),
    };
  } catch {
    return null;
  }
}

function parseWorkspaceAppManifestContent(
  content: string,
  app: Pick<CompanyWorkspaceApp, "id" | "slug" | "title" | "template">,
  sourceLabel?: string,
): WorkspaceAppManifest | null {
  try {
    const parsed = JSON.parse(content) as Partial<WorkspaceAppManifest>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      return parseLegacyReaderManifest(content, app, sourceLabel);
    }

    const base = buildDefaultManifest(app);
    const sections = parsed.sections.reduce<WorkspaceAppManifestSection[]>((acc, section, index) => {
      if (!section || typeof section !== "object") {
        return acc;
      }
      const candidate = section as Partial<WorkspaceAppManifestSection>;
      if (typeof candidate.id !== "string" || typeof candidate.label !== "string" || typeof candidate.slot !== "string") {
        return acc;
      }
      acc.push({
        id: candidate.id,
        label: candidate.label,
        slot: candidate.slot,
        order: typeof candidate.order === "number" ? candidate.order : index,
        selectors: Array.isArray(candidate.selectors)
          ? candidate.selectors.filter(Boolean).map((selector) => ({
              resourceTypes: Array.isArray(selector?.resourceTypes)
                ? selector.resourceTypes.filter((item): item is ArtifactResourceType => typeof item === "string")
                : undefined,
              tags: Array.isArray(selector?.tags)
                ? selector.tags.filter((item): item is string => typeof item === "string")
                : undefined,
            }))
          : [],
        emptyState: typeof candidate.emptyState === "string" ? candidate.emptyState : undefined,
      });
      return acc;
    }, []);

    if (sections.length === 0) {
      return parseLegacyReaderManifest(content, app, sourceLabel);
    }

    const resources = Array.isArray(parsed.resources)
      ? parsed.resources.reduce<WorkspaceAppManifestResource[]>((acc, resource, index) => {
          if (!resource || typeof resource !== "object") {
            return acc;
          }
          const candidate = resource as Partial<WorkspaceAppManifestResource>;
          if (typeof candidate.slot !== "string") {
            return acc;
          }
          acc.push({
            id: typeof candidate.id === "string" ? candidate.id : `manifest-resource-${index + 1}`,
            slot: candidate.slot,
            title: typeof candidate.title === "string" ? candidate.title : undefined,
            summary: typeof candidate.summary === "string" ? candidate.summary : undefined,
            artifactId: typeof candidate.artifactId === "string" ? candidate.artifactId : undefined,
            sourcePath: typeof candidate.sourcePath === "string" ? candidate.sourcePath : undefined,
            sourceName: typeof candidate.sourceName === "string" ? candidate.sourceName : undefined,
            resourceType: typeof candidate.resourceType === "string" ? candidate.resourceType : undefined,
            tags: Array.isArray(candidate.tags)
              ? candidate.tags.filter((item): item is string => typeof item === "string")
              : undefined,
          });
          return acc;
        }, [])
      : [];

    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.reduce<WorkspaceAppManifestAction[]>((acc, action) => {
          if (!action || typeof action !== "object") {
            return acc;
          }
          const candidate = action as Partial<WorkspaceAppManifestAction>;
          if (
            typeof candidate.id !== "string" ||
            typeof candidate.label !== "string" ||
            typeof candidate.actionType !== "string" ||
            typeof candidate.target !== "string"
          ) {
            return acc;
          }
          acc.push({
            id: candidate.id,
            label: candidate.label,
            actionType: candidate.actionType,
            target: candidate.target,
            input: candidate.input && typeof candidate.input === "object" ? candidate.input : undefined,
          });
          return acc;
        }, [])
      : [];

    return {
      ...base,
      title: typeof parsed.title === "string" ? parsed.title : base.title,
      appId: typeof parsed.appId === "string" ? parsed.appId : base.appId,
      appSlug: typeof parsed.appSlug === "string" ? parsed.appSlug : base.appSlug,
      sourceLabel:
        typeof parsed.sourceLabel === "string" && parsed.sourceLabel.trim().length > 0
          ? parsed.sourceLabel
          : sourceLabel,
      draft: parsed.draft === true || parsed.sourceLabel === "系统草案",
      sections,
      resources: resources.length > 0 ? resources : undefined,
      actions: actions.length > 0 ? actions : base.actions,
    };
  } catch {
    return parseLegacyReaderManifest(content, app, sourceLabel);
  }
}

function matchesManifestResource(
  file: Pick<AppManifestWorkspaceFile, "artifactId" | "path" | "name">,
  resource: WorkspaceAppManifestResource,
) {
  if (resource.artifactId && file.artifactId === resource.artifactId) {
    return true;
  }
  if (resource.sourcePath && file.path === resource.sourcePath) {
    return true;
  }
  if (resource.sourceName && file.name === resource.sourceName) {
    return true;
  }
  return false;
}

function fileMatchesSelector(file: Pick<AppManifestWorkspaceFile, "resourceType" | "tags">, selector: WorkspaceAppManifestSelector) {
  const resourceTypeMatch =
    !selector.resourceTypes || selector.resourceTypes.length === 0
      ? true
      : selector.resourceTypes.includes(file.resourceType);
  const tagMatch =
    !selector.tags || selector.tags.length === 0
      ? true
      : selector.tags.some((tag) => file.tags.includes(tag));
  return resourceTypeMatch && tagMatch;
}

export function buildWorkspaceAppManifestDraft(input: {
  app: Pick<CompanyWorkspaceApp, "id" | "slug" | "title" | "template">;
  files: AppManifestWorkspaceFile[];
  title?: string;
  sourceLabel?: string;
}): WorkspaceAppManifest | null {
  if (input.app.template !== "reader") {
    return buildDefaultManifest(input.app);
  }

  const base = buildDefaultManifest(input.app);
  const resources = input.files.reduce<WorkspaceAppManifestResource[]>((acc, file, index) => {
    if (isManifestArtifactCandidate({ name: file.name, path: file.path })) {
      return acc;
    }
    const descriptor = inferDraftSlot(file);
    if (!descriptor) {
      return acc;
    }
    acc.push({
      id: `draft-resource-${index + 1}`,
      slot: descriptor.slot,
      title: file.name,
      summary: file.previewText,
      artifactId: file.artifactId,
      sourcePath: file.path,
      sourceName: file.name,
      resourceType: descriptor.resourceType,
      tags: descriptor.tags,
    });
    return acc;
  }, []);

  if (resources.length === 0) {
    return null;
  }

  return {
    ...base,
    title: input.title ?? `${input.app.title} AppManifest 草案`,
    sourceLabel: input.sourceLabel ?? "系统草案",
    draft: true,
    resources,
  };
}

export function resolveWorkspaceAppManifest(input: {
  app: Pick<CompanyWorkspaceApp, "id" | "slug" | "title" | "template" | "manifestArtifactId">;
  artifacts: ArtifactRecord[];
  files: AppManifestWorkspaceFile[];
}): WorkspaceAppManifest {
  const directArtifact =
    input.app.manifestArtifactId
      ? input.artifacts.find((artifact) => artifact.id === input.app.manifestArtifactId) ?? null
      : null;
  if (directArtifact) {
    const manifest = parseWorkspaceAppManifestContent(
      directArtifact.content ?? "",
      input.app,
      directArtifact.sourceName ?? directArtifact.title,
    );
    if (manifest) {
      return manifest;
    }
  }

  const artifactCandidates = input.artifacts
    .filter((artifact) =>
      isManifestArtifactCandidate({
        name: artifact.sourceName ?? artifact.title,
        path: artifact.sourcePath ?? artifact.sourceUrl,
        kind: artifact.kind,
      }),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);
  for (const artifact of artifactCandidates) {
    const manifest = parseWorkspaceAppManifestContent(
      artifact.content ?? "",
      input.app,
      artifact.sourceName ?? artifact.title,
    );
    if (manifest) {
      return manifest;
    }
  }

  const fileCandidates = input.files
    .filter((file) => isManifestArtifactCandidate({ name: file.name, path: file.path }))
    .sort((left, right) => right.path.localeCompare(left.path));
  for (const file of fileCandidates) {
    const manifest = parseWorkspaceAppManifestContent(file.previewText ?? "", input.app, file.name);
    if (manifest) {
      return manifest;
    }
  }

  return buildDefaultManifest(input.app);
}

export function applyWorkspaceAppManifest<T extends AppManifestWorkspaceFile>(
  files: T[],
  manifest: WorkspaceAppManifest,
): T[] {
  return files.map((file) => {
    const resource = manifest.resources?.find((candidate) => matchesManifestResource(file, candidate));
    if (!resource) {
      return file;
    }
    const nextTags = new Set([...(file.tags ?? []), ...(resource.tags ?? [])]);
    return {
      ...file,
      name: resource.title ?? file.name,
      previewText: resource.summary ?? file.previewText,
      resourceType: resource.resourceType ?? file.resourceType,
      tags: [...nextTags],
    };
  });
}

export function isWorkspaceAppManifestDraft(manifest: WorkspaceAppManifest | null | undefined) {
  return Boolean(manifest?.draft || manifest?.sourceLabel === "系统草案");
}

export function getWorkspaceAppFilesForSection<T extends AppManifestWorkspaceFile>(
  files: T[],
  manifest: WorkspaceAppManifest,
  slot: string,
): T[] {
  const section = manifest.sections.find((candidate) => candidate.slot === slot);
  if (!section) {
    return [];
  }
  const seen = new Set<string>();
  return files
    .filter((file) => section.selectors.some((selector) => fileMatchesSelector(file, selector)))
    .filter((file) => {
      if (seen.has(file.key)) {
        return false;
      }
      seen.add(file.key);
      return true;
    });
}
