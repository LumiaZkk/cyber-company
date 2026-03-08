import type { Company, CompanyWorkspaceApp } from "./types";

export type WorkspaceResourceKind = "chapter" | "canon" | "review" | "tooling" | "other";

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

export function getCompanyWorkspaceApps(company: Company | null | undefined): CompanyWorkspaceApp[] {
  if (!company) {
    return [];
  }

  const derivedApps = isNovelCompany(company)
    ? buildNovelWorkspaceApps(company)
    : [];
  const storedApps = Array.isArray(company.workspaceApps) ? company.workspaceApps : [];

  const merged = new Map<string, CompanyWorkspaceApp>();
  for (const app of [...derivedApps, ...storedApps]) {
    merged.set(app.id, app);
  }
  return [...merged.values()];
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
    },
  ];
}

export function categorizeWorkspaceResource(name: string, path?: string | null): WorkspaceResourceKind {
  const haystack = `${name} ${path ?? ""}`.toLowerCase();
  if (/(第?\s*\d+\s*章|ch\d+|chapter|chapters\/|正文)/i.test(haystack)) {
    return "chapter";
  }
  if (/(审校|review|终审|qa|校对|发布结果|publish)/i.test(haystack)) {
    return "review";
  }
  if (/(设定|人物|时间线|世界观|伏笔|canon|timeline|foreshadow|shared-system)/i.test(haystack)) {
    return "canon";
  }
  if (/\.(json|ya?ml|ts|js|py|sh)$/i.test(haystack) || /(tool|script|spec|方案)/i.test(haystack)) {
    return "tooling";
  }
  return "other";
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
        prompt: `${sharedContext}\n\n请先为小说创作团队开发第一版“小说阅读器”。它至少要覆盖：章节目录、正文阅读、审校报告对照、共享设定侧边栏、版本切换。`,
      };
    default:
      return {
        title: "开发章节审阅台",
        prompt: `${sharedContext}\n\n请先为小说创作团队开发第一版“章节审阅台”。它至少要覆盖：章节状态、待办清单、审校意见、终审结论、发布前检查。`,
      };
  }
}
