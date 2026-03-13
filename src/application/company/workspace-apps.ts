import type {
  Company,
  CompanyWorkspaceApp,
  CompanyWorkspaceAppStatus,
  CompanyWorkspaceAppSurface,
  CompanyWorkspaceAppTemplate,
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

const NOVEL_COMPANY_PATTERN = /小说|创作|章节|主编|写手|审校|伏笔|设定|连载|剧情|世界观/i;

const CONSISTENCY_ANCHORS: WorkspaceAnchor[] = [
  { id: "canon", label: "共享设定库", matcher: /共享设定|设定库|canon|world|设定/i },
  { id: "timeline", label: "时间线", matcher: /时间线|timeline/i },
  { id: "foreshadow", label: "伏笔追踪", matcher: /伏笔|foreshadow/i },
  { id: "handoff", label: "章节交接", matcher: /交接|handoff|清单/i },
];

type WorkspaceAppSeed = Pick<
  CompanyWorkspaceApp,
  "slug" | "title" | "description" | "icon" | "kind" | "status" | "surface" | "template"
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

export function isNovelCompany(company: Company | null | undefined): boolean {
  if (!company) {
    return false;
  }

  const haystack = [
    company.template,
    company.name,
    company.description,
    ...company.employees.flatMap((employee) => [employee.role, employee.nickname]),
  ]
    .join(" ")
    .trim();

  return NOVEL_COMPANY_PATTERN.test(haystack);
}

export function hasStoredWorkspaceApps(company: Company | null | undefined): boolean {
  return Boolean(company?.workspaceApps?.length);
}

export function resolveWorkspaceAppTemplate(
  app: Pick<CompanyWorkspaceApp, "kind" | "template">,
): CompanyWorkspaceAppTemplate {
  if (app.template) {
    return app.template;
  }
  if (app.kind === "custom") {
    return "workbench";
  }
  return WORKSPACE_APP_TEMPLATE_BY_KIND[app.kind];
}

export function resolveWorkspaceAppSurface(
  app: Pick<CompanyWorkspaceApp, "surface">,
): CompanyWorkspaceAppSurface {
  return app.surface ?? "template";
}

function normalizeWorkspaceApp(app: CompanyWorkspaceApp): CompanyWorkspaceApp {
  return {
    ...app,
    surface: resolveWorkspaceAppSurface(app),
    template: resolveWorkspaceAppTemplate(app),
  };
}

export function buildRecommendedWorkspaceApps(company: Company): CompanyWorkspaceApp[] {
  if (isNovelCompany(company)) {
    return buildNovelWorkspaceApps(company).map(normalizeWorkspaceApp);
  }
  return [];
}

function buildWorkspaceAppSeed(template: CompanyWorkspaceAppTemplate): WorkspaceAppSeed {
  switch (template) {
    case "reader":
      return {
        slug: "reader",
        title: "公司阅读器",
        description: "直接阅读正文、设定、报告和关键上下文，不再只靠文件树猜内容。",
        icon: "📖",
        kind: "custom",
        status: "ready",
        surface: "template",
        template: "reader",
      };
    case "consistency":
      return {
        slug: "consistency-hub",
        title: "一致性中心",
        description: "围绕设定、人物、时间线和伏笔，管理这家公司的唯一真相源。",
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
        icon: "📊",
        kind: "custom",
        status: "ready",
        surface: "template",
        template: "dashboard",
      };
  }
  const exhaustiveTemplate: never = template;
  throw new Error(`Unknown workspace app template: ${exhaustiveTemplate}`);
}

function buildDefaultWorkspaceAppId(template: CompanyWorkspaceAppTemplate): string {
  return `app:${template}`;
}

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

export function publishWorkspaceApp(
  company: Company,
  input: PublishWorkspaceAppInput,
): CompanyWorkspaceApp[] {
  const baseApps = getCompanyWorkspaceApps(company).map(normalizeWorkspaceApp);
  const nextApps = [...baseApps];
  const existingIndex = nextApps.findIndex(
    (app) => resolveWorkspaceAppTemplate(app) === input.template,
  );
  const existingApp = existingIndex >= 0 ? nextApps[existingIndex] : null;
  const seed = buildWorkspaceAppSeed(input.template);

  const nextApp = normalizeWorkspaceApp({
    id: existingApp?.id ?? buildDefaultWorkspaceAppId(input.template),
    slug: existingApp?.slug ?? seed.slug,
    title: input.title ?? existingApp?.title ?? seed.title,
    description: input.description ?? existingApp?.description ?? seed.description,
    icon: input.icon ?? existingApp?.icon ?? seed.icon,
    kind: existingApp?.kind ?? seed.kind,
    status: input.status ?? existingApp?.status ?? seed.status,
    ownerAgentId: input.ownerAgentId ?? existingApp?.ownerAgentId,
    surface: input.surface ?? existingApp?.surface ?? seed.surface,
    template: input.template,
    manifestArtifactId:
      input.manifestArtifactId !== undefined
        ? input.manifestArtifactId
        : existingApp?.manifestArtifactId ?? null,
    embeddedHostKey:
      input.embeddedHostKey !== undefined
        ? input.embeddedHostKey
        : existingApp?.embeddedHostKey ?? null,
    embeddedPermissions:
      input.embeddedPermissions !== undefined
        ? input.embeddedPermissions
        : existingApp?.embeddedPermissions ?? null,
  });

  if (existingIndex >= 0) {
    nextApps[existingIndex] = nextApp;
    return nextApps;
  }

  return [...nextApps, nextApp];
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

function buildNovelWorkspaceApps(company: Company): CompanyWorkspaceApp[] {
  const ctoAgentId = company.employees.find((employee) => employee.metaRole === "cto")?.agentId;
  return [
    {
      id: "novel-reader",
      slug: "novel-reader",
      title: "小说阅读器",
      description: "直接阅读章节正文、审校报告和共享设定文件，不再只靠文件名猜内容。",
      icon: "📖",
      kind: "novel-reader",
      status: "ready",
      ownerAgentId: ctoAgentId,
      surface: "template",
      template: "reader",
    },
    {
      id: "consistency-hub",
      slug: "consistency-hub",
      title: "一致性中心",
      description: "围绕设定、人物、时间线和伏笔，追踪当前小说公司的唯一真相源。",
      icon: "🧭",
      kind: "consistency-hub",
      status: "recommended",
      ownerAgentId: ctoAgentId,
      surface: "template",
      template: "consistency",
    },
    {
      id: "knowledge-hub",
      slug: "knowledge-hub",
      title: "知识与验收",
      description: "集中查看团队方案、技术方案、运营策略和 CEO 收口结果，并追踪来源产物。",
      icon: "🧾",
      kind: "knowledge-hub",
      status: "ready",
      ownerAgentId: ctoAgentId,
      surface: "template",
      template: "knowledge",
    },
    {
      id: "cto-workbench",
      slug: "cto-workbench",
      title: "CTO 工具工坊",
      description: "把当前公司的工具需求直接交给 CTO，让他围绕本公司 workspace 开发能力。",
      icon: "🛠️",
      kind: "cto-workbench",
      status: "recommended",
      ownerAgentId: ctoAgentId,
      surface: "template",
      template: "workbench",
    },
  ];
}

export function describeWorkspaceResource(name: string, path?: string | null): WorkspaceResourceDescriptor {
  const haystack = `${name} ${path ?? ""}`.trim().toLowerCase();
  const tags = new Set<string>();
  if (/(审校|review|终审|qa|校对|发布结果|publish)/i.test(haystack)) {
    tags.add("qa.report");
    tags.add("company.resource");
    return { kind: "review", resourceType: "report", tags: [...tags] };
  }
  if (/(第?\s*\d+\s*章|ch\d+|chapter|chapters\/|正文)/i.test(haystack)) {
    tags.add("story.chapter");
    tags.add("company.resource");
    return { kind: "chapter", resourceType: "document", tags: [...tags] };
  }
  if (/(设定|人物|时间线|世界观|伏笔|canon|timeline|foreshadow|shared-system)/i.test(haystack)) {
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
  if (/(团队规划|技术方案|工具方案|运营策略|汇总方案|执行方案|治理件|策略|方案|总结|总览)/i.test(haystack)) {
    tags.add("company.knowledge");
    tags.add("company.resource");
    return { kind: "knowledge", resourceType: "document", tags: [...tags] };
  }
  if (/\.(json|ya?ml|ts|js|py|sh)$/i.test(haystack) || /(tool|script|spec)/i.test(haystack)) {
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
        title: "开发一致性工具",
        prompt: `${sharedContext}\n\n请先为小说创作团队设计并落地第一版“设定一致性工具”。它至少要覆盖：共享设定库、人物关系、时间线、伏笔与章节引用校验。`,
      };
    case "novel-reader":
      return {
        title: "开发小说阅读器",
        prompt: `${sharedContext}\n\n请先为小说创作团队开发第一版“小说阅读器”。它至少要覆盖：章节目录、正文阅读、审校报告对照、共享设定侧边栏、版本切换。\n\n交付要求：\n1. 除了页面方案，还要显式产出一份 \`workspace-app-manifest.reader.json\`。\n2. 这个 AppManifest 至少要把正文/设定/报告三类内容分到不同 section，不要只靠文件名猜。\n3. 每条资源至少包含：slot、title，以及 artifactId/sourcePath/sourceName 三选一的定位信息。\n4. 如果阅读器会触发动作，请把动作声明到 manifest actions 里，而不是只写在文档里。`,
      };
    default:
      return {
        title: "开发章节审阅台",
        prompt: `${sharedContext}\n\n请先为小说创作团队开发第一版“章节审阅台”。它至少要覆盖：章节状态、待办清单、审校意见、终审结论、发布前检查。`,
      };
  }
}
