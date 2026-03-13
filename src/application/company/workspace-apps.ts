import type {
  Company,
  CompanyWorkspaceApp,
  CompanyWorkspaceAppImplementation,
  CompanyWorkspaceAppRuntimeContract,
  CompanyWorkspaceAppStatus,
  CompanyWorkspaceAppSurface,
  CompanyWorkspaceAppTemplate,
  CompanyWorkspaceAppVisibility,
  CompanyWorkspaceAppShareScope,
} from "../../domain/org/types";
import type { ArtifactResourceType } from "../../domain/artifact/types";

export type WorkspaceResourceKind = "chapter" | "canon" | "review" | "knowledge" | "tooling" | "other";
export type WorkspaceResourceType = ArtifactResourceType;
export type WorkspaceResourceDescriptor = {
  kind: WorkspaceResourceKind;
  resourceType: WorkspaceResourceType;
  tags: string[];
};

type WorkspaceAnchor = {
  id: string;
  label: string;
  matcher: RegExp;
};

const DEFAULT_EMBEDDED_PERMISSIONS: NonNullable<CompanyWorkspaceApp["embeddedPermissions"]> = {
  resources: "manifest-scoped",
  appState: "readwrite",
  companyWrites: "none",
  actions: "whitelisted",
};

const CONSISTENCY_ANCHORS: WorkspaceAnchor[] = [
  { id: "canon", label: "共享设定库", matcher: /共享设定|设定库|canon|world|设定/i },
  { id: "timeline", label: "时间线", matcher: /时间线|timeline/i },
  { id: "foreshadow", label: "伏笔追踪", matcher: /伏笔|foreshadow/i },
  { id: "handoff", label: "章节交接", matcher: /交接|handoff|清单/i },
];

type WorkspaceAppSeed = Pick<
  CompanyWorkspaceApp,
  "slug" | "title" | "description" | "summary" | "icon" | "kind" | "status" | "surface" | "template"
>;

const WORKSPACE_APP_TEMPLATE_BY_KIND: Record<
  Exclude<CompanyWorkspaceApp["kind"], "custom">,
  CompanyWorkspaceAppTemplate
> = {
  "novel-reader": "reader",
  "consistency-hub": "consistency",
  "knowledge-hub": "knowledge",
  "cto-workbench": "workbench",
};

export function hasStoredWorkspaceApps(company: Company | null | undefined): boolean {
  return Boolean(company?.workspaceApps?.length);
}

export function resolveWorkspaceAppTemplate(
  app: Pick<CompanyWorkspaceApp, "kind" | "template" | "implementation">,
): CompanyWorkspaceAppTemplate {
  if (app.implementation?.preset) {
    return app.implementation.preset;
  }
  if (app.template) {
    return app.template;
  }
  if (app.kind === "custom") {
    return "generic-app";
  }
  return WORKSPACE_APP_TEMPLATE_BY_KIND[app.kind];
}

export function resolveWorkspaceAppSurface(
  app: Pick<CompanyWorkspaceApp, "surface" | "implementation">,
): CompanyWorkspaceAppSurface {
  if (app.implementation?.kind === "embedded") {
    return "embedded";
  }
  return app.surface ?? "template";
}

function normalizeWorkspaceApp(app: CompanyWorkspaceApp): CompanyWorkspaceApp {
  const template = resolveWorkspaceAppTemplate(app);
  const surface = resolveWorkspaceAppSurface(app);
  const visibility: CompanyWorkspaceAppVisibility = app.visibility ?? "company";
  const shareScope: CompanyWorkspaceAppShareScope = app.shareScope ?? "company";
  const implementation: CompanyWorkspaceAppImplementation =
    app.implementation
      ?? {
        kind: surface === "embedded" ? "embedded" : "preset",
        preset: app.template ?? (surface === "template" ? template : null),
        entry: null,
      };
  const runtime: CompanyWorkspaceAppRuntimeContract | null =
    app.runtime
      ?? (surface === "embedded"
        ? {
          kind: "controlled-host",
          permissions: app.embeddedPermissions ?? DEFAULT_EMBEDDED_PERMISSIONS,
        }
        : null);
  return {
    ...app,
    summary: app.summary ?? app.description,
    visibility,
    shareScope,
    implementation,
    runtime,
    surface,
    template,
    embeddedPermissions: app.embeddedPermissions ?? runtime?.permissions ?? null,
  };
}

export function buildRecommendedWorkspaceApps(company: Company): CompanyWorkspaceApp[] {
  return buildGenericWorkspaceApps(company).map(normalizeWorkspaceApp);
}

function buildWorkspaceAppSeed(template: CompanyWorkspaceAppTemplate): WorkspaceAppSeed {
  switch (template) {
    case "reader":
      return {
        slug: "reader",
        title: "内容查看器",
        description: "直接查看主体内容、参考资料、报告和关键上下文，不再只靠文件树猜内容。",
        summary: "公司内统一查看主体内容、参考资料、报告和关键上下文。",
        icon: "📖",
        kind: "custom",
        status: "ready",
        surface: "template",
        template: "reader",
      };
    case "consistency":
      return {
        slug: "consistency-hub",
        title: "规则与校验",
        description: "围绕关键参考资料、规则和状态流转，管理这家公司的真相源与校验入口。",
        summary: "围绕关键参考资料、规则和状态流转管理真相源与校验入口。",
        icon: "🧭",
        kind: "custom",
        status: "recommended",
        surface: "template",
        template: "consistency",
      };
    case "knowledge":
      return {
        slug: "knowledge-hub",
        title: "知识与验收",
        description: "集中查看正式方案、验收结论和可追溯来源。",
        summary: "集中查看正式方案、验收结论和可追溯来源。",
        icon: "🧾",
        kind: "custom",
        status: "ready",
        surface: "template",
        template: "knowledge",
      };
    case "workbench":
      return {
        slug: "cto-workbench",
        title: "CTO 工具工坊",
        description: "围绕当前公司持续设计、开发和发布新能力。",
        summary: "围绕当前公司持续设计、开发和发布新能力。",
        icon: "🛠️",
        kind: "custom",
        status: "recommended",
        surface: "template",
        template: "workbench",
      };
    case "review-console":
      return {
        slug: "review-console",
        title: "审阅控制台",
        description: "集中查看审阅报告、终审结论和发布前检查结果。",
        summary: "集中查看审阅报告、终审结论和发布前检查结果。",
        icon: "🧪",
        kind: "custom",
        status: "recommended",
        surface: "template",
        template: "review-console",
      };
    case "dashboard":
      return {
        slug: "workspace-dashboard",
        title: "工作目录仪表盘",
        description: "把当前工作目录的状态数据、关键指标和上下文聚合成一个入口。",
        summary: "把当前工作目录的状态数据、关键指标和上下文聚合成一个入口。",
        icon: "📊",
        kind: "custom",
        status: "ready",
        surface: "template",
        template: "dashboard",
      };
    case "generic-app":
      return {
        slug: "generic-app",
        title: "公司内 App",
        description: "通过显式 manifest 和受控宿主注册的公司内页面或工具。",
        summary: "通过显式 manifest 和受控宿主注册的公司内页面或工具。",
        icon: "🧩",
        kind: "custom",
        status: "ready",
        surface: "embedded",
        template: "generic-app",
      };
  }
  const exhaustiveTemplate: never = template;
  throw new Error(`Unknown workspace app template: ${exhaustiveTemplate}`);
}

function buildDefaultWorkspaceAppId(template: CompanyWorkspaceAppTemplate): string {
  return `app:${template}`;
}

export type RegisterWorkspaceAppInput = {
  id?: string;
  slug: string;
  title: string;
  description?: string;
  summary?: string;
  icon?: string;
  status?: CompanyWorkspaceAppStatus;
  ownerAgentId?: string;
  visibility?: CompanyWorkspaceAppVisibility;
  shareScope?: CompanyWorkspaceAppShareScope;
  surface?: CompanyWorkspaceAppSurface;
  template?: CompanyWorkspaceAppTemplate;
  manifestArtifactId?: string | null;
  embeddedHostKey?: string | null;
  embeddedPermissions?: CompanyWorkspaceApp["embeddedPermissions"];
  implementation?: CompanyWorkspaceAppImplementation | null;
  runtime?: CompanyWorkspaceAppRuntimeContract | null;
};

type PublishWorkspaceAppInput = {
  template: CompanyWorkspaceAppTemplate;
  title?: string;
  description?: string;
  icon?: string;
  status?: CompanyWorkspaceAppStatus;
  surface?: CompanyWorkspaceAppSurface;
  ownerAgentId?: string;
  manifestArtifactId?: string | null;
  embeddedHostKey?: string | null;
  embeddedPermissions?: CompanyWorkspaceApp["embeddedPermissions"];
};

export function registerWorkspaceApp(
  company: Company,
  input: RegisterWorkspaceAppInput,
): CompanyWorkspaceApp[] {
  const baseApps = getCompanyWorkspaceApps(company).map(normalizeWorkspaceApp);
  const nextApps = [...baseApps];
  const existingIndex = nextApps.findIndex(
    (app) => app.id === input.id || app.slug === input.slug,
  );
  const existingApp = existingIndex >= 0 ? nextApps[existingIndex] : null;
  const surface = input.surface ?? existingApp?.surface ?? "embedded";
  const template = input.template ?? existingApp?.template;
  const embeddedPermissions =
    input.embeddedPermissions !== undefined
      ? input.embeddedPermissions
      : existingApp?.embeddedPermissions ?? (surface === "embedded" ? DEFAULT_EMBEDDED_PERMISSIONS : null);
  const runtime =
    input.runtime !== undefined
      ? input.runtime
      : surface === "embedded"
        ? {
          kind: "controlled-host" as const,
          permissions: embeddedPermissions ?? DEFAULT_EMBEDDED_PERMISSIONS,
        }
        : null;
  const implementation =
    input.implementation !== undefined
      ? input.implementation
      : {
        kind: surface === "embedded" ? "embedded" as const : "preset" as const,
        preset: template ?? null,
        entry: existingApp?.implementation?.entry ?? null,
      };
  const nextApp = normalizeWorkspaceApp({
    id: input.id ?? existingApp?.id ?? `app:${input.slug}`,
    slug: input.slug,
    title: input.title,
    description: input.description ?? input.summary ?? existingApp?.description ?? "",
    summary: input.summary ?? input.description ?? existingApp?.summary ?? existingApp?.description ?? "",
    icon: input.icon ?? existingApp?.icon ?? "🧩",
    kind: existingApp?.kind ?? "custom",
    status: input.status ?? existingApp?.status ?? "ready",
    ownerAgentId: input.ownerAgentId ?? existingApp?.ownerAgentId,
    visibility: input.visibility ?? existingApp?.visibility ?? "company",
    shareScope: input.shareScope ?? existingApp?.shareScope ?? "company",
    implementation,
    runtime,
    surface,
    template,
    manifestArtifactId:
      input.manifestArtifactId !== undefined
        ? input.manifestArtifactId
        : existingApp?.manifestArtifactId ?? null,
    embeddedHostKey:
      input.embeddedHostKey !== undefined
        ? input.embeddedHostKey
        : existingApp?.embeddedHostKey ?? (surface === "embedded" ? "generic-app" : null),
    embeddedPermissions,
  });

  if (existingIndex >= 0) {
    nextApps[existingIndex] = nextApp;
    return nextApps;
  }

  return [...nextApps, nextApp];
}

export function publishWorkspaceApp(
  company: Company,
  input: PublishWorkspaceAppInput,
): CompanyWorkspaceApp[] {
  const seed = buildWorkspaceAppSeed(input.template);
  return registerWorkspaceApp(company, {
    id: buildDefaultWorkspaceAppId(input.template),
    slug: seed.slug,
    title: input.title ?? seed.title,
    description: input.description ?? seed.description,
    summary: seed.summary,
    icon: input.icon ?? seed.icon,
    status: input.status ?? seed.status,
    ownerAgentId: input.ownerAgentId,
    surface: input.surface ?? seed.surface,
    template: input.template,
    manifestArtifactId: input.manifestArtifactId,
    embeddedHostKey: input.embeddedHostKey,
    embeddedPermissions: input.embeddedPermissions,
    implementation: {
      kind: (input.surface ?? seed.surface) === "embedded" ? "embedded" : "preset",
      preset: input.template,
      entry: null,
    },
    runtime:
      (input.surface ?? seed.surface) === "embedded"
        ? {
          kind: "controlled-host",
          permissions: input.embeddedPermissions ?? DEFAULT_EMBEDDED_PERMISSIONS,
        }
        : null,
  });
}

export function getCompanyWorkspaceApps(company: Company | null | undefined): CompanyWorkspaceApp[] {
  if (!company) {
    return [];
  }

  const storedApps = Array.isArray(company.workspaceApps)
    ? company.workspaceApps.map(normalizeWorkspaceApp)
    : [];
  if (storedApps.length > 0) {
    return storedApps;
  }

  return buildRecommendedWorkspaceApps(company);
}

function buildGenericWorkspaceApps(company: Company): CompanyWorkspaceApp[] {
  const ctoAgentId = company.employees.find((employee) => employee.metaRole === "cto")?.agentId;
  const templates: CompanyWorkspaceAppTemplate[] = ["reader", "consistency", "knowledge", "workbench"];
  return templates.map((template) => {
    const seed = buildWorkspaceAppSeed(template);
    return {
      id: buildDefaultWorkspaceAppId(template),
      slug: seed.slug,
      title: seed.title,
      description: seed.description,
      summary: seed.summary,
      icon: seed.icon,
      kind: seed.kind,
      status: seed.status,
      ownerAgentId: ctoAgentId,
      visibility: "company",
      shareScope: "company",
      implementation: {
        kind: "preset",
        preset: seed.template,
        entry: null,
      },
      runtime: null,
      surface: seed.surface,
      template: seed.template,
    };
  });
}

export function describeWorkspaceResource(name: string, path?: string | null): WorkspaceResourceDescriptor {
  const haystack = `${name} ${path ?? ""}`.trim().toLowerCase();
  const tags = new Set<string>();
  if (/(审校|review|终审|qa|校对|发布结果|publish)/i.test(haystack)) {
    tags.add("ops.report");
    tags.add("qa.report");
    tags.add("company.resource");
    return { kind: "review", resourceType: "report", tags: [...tags] };
  }
  if (
    /(第?\s*\d+\s*章|ch\d+|chapter|chapters\/|正文|(?:^|\/)(?:content|drafts|scenes|episodes|quests|missions|levels)\/)/i.test(
      haystack,
    )
  ) {
    tags.add("content.primary");
    tags.add("story.chapter");
    tags.add("company.resource");
    return { kind: "chapter", resourceType: "document", tags: [...tags] };
  }
  if (
    /(设定|人物|时间线|世界观|伏笔|canon|timeline|foreshadow|shared-system|reference|guide|manual|schema|spec|blueprint|architecture|规则|约束)/i.test(
      haystack,
    )
  ) {
    tags.add("domain.reference");
    tags.add("story.canon");
    if (/(时间线|timeline)/i.test(haystack)) {
      tags.add("story.timeline");
    }
    if (/(伏笔|foreshadow)/i.test(haystack)) {
      tags.add("story.foreshadow");
    }
    tags.add("company.resource");
    return { kind: "canon", resourceType: "document", tags: [...tags] };
  }
  if (
    /(团队规划|技术方案|工具方案|运营策略|汇总方案|执行方案|治理件|策略|方案|总结|总览|brief|prd|roadmap|analysis|retrospective|postmortem)/i.test(
      haystack,
    )
  ) {
    tags.add("company.knowledge");
    tags.add("domain.reference");
    tags.add("company.resource");
    return { kind: "knowledge", resourceType: "document", tags: [...tags] };
  }
  if (/\.(json|ya?ml|ts|js|py|sh)$/i.test(haystack) || /(tool|script|spec|simulator|generator|checker)/i.test(haystack)) {
    tags.add("tech.tool");
    return { kind: "tooling", resourceType: "tool", tags: [...tags] };
  }
  tags.add("company.resource");
  return { kind: "other", resourceType: "other", tags: [...tags] };
}

export function categorizeWorkspaceResource(name: string, path?: string | null): WorkspaceResourceKind {
  return describeWorkspaceResource(name, path).kind;
}

export function summarizeConsistencyAnchors(
  fileNames: string[],
): Array<{ id: string; label: string; found: boolean }> {
  return CONSISTENCY_ANCHORS.map((anchor) => ({
    id: anchor.id,
    label: anchor.label,
    found: fileNames.some((fileName) => anchor.matcher.test(fileName)),
  }));
}

export function buildWorkspaceToolRequest(
  company: Company,
  tool:
    | "consistency-checker"
    | "novel-reader"
    | "chapter-review-console",
): { title: string; prompt: string } {
  const companyLabel = `${company.icon} ${company.name}`;
  const sharedContext = [
    `当前公司：${companyLabel}`,
    `公司定位：${company.description}`,
    `你现在是这家公司的 CTO，请围绕当前公司的 workspace 直接开发工具，不要写泛泛建议。`,
    "要求：",
    "1. 先说明这次工具的目标用户、使用入口和唯一真相源。",
    "2. 给出第一版技术方案和文件/页面结构。",
    "3. 明确哪些内容会只在当前公司可见。",
    "4. 最后回复一个可执行的开发计划，方便 CEO 继续派发。",
  ].join("\n");

  switch (tool) {
    case "consistency-checker":
      return {
        title: "补齐规则校验能力",
        prompt: `${sharedContext}\n\n请先为当前公司补齐第一版“规则校验能力”。它至少要覆盖：唯一真相源、关键业务规则、状态流转检查，以及交接/验收前的阻塞项提示。`,
      };
    case "novel-reader":
      return {
        title: "补齐内容查看 App",
        prompt: `${sharedContext}\n\n请先为当前公司补齐第一版“内容查看 App”。它至少要覆盖：主体内容阅读、参考资料对照、报告回看、视图切换。\n\n交付要求：\n1. 除了页面方案，还要显式产出一份 \`workspace-app-manifest.reader.json\`。\n2. 这个 AppManifest 至少要把主体内容/参考资料/报告三类内容分到不同 section，不要只靠文件名猜。\n3. 每条资源至少包含：slot、title，以及 artifactId/sourcePath/sourceName 三选一的定位信息。\n4. 如果查看器会触发动作，请把动作声明到 manifest actions 里，而不是只写在文档里。`,
      };
    default:
      return {
        title: "补齐审阅与预检 App",
        prompt: `${sharedContext}\n\n请先为当前公司补齐第一版“审阅与预检 App”。它至少要覆盖：对象状态、待办清单、审阅意见、验收结论和交付前检查。`,
      };
  }
}
