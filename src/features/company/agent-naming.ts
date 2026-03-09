import type { AgentListEntry } from "../gateway/client";

const CHINESE_COMPANY_PHRASES: Array<[string, string]> = [
  ["网络安全", "cyber-security"],
  ["信息安全", "information-security"],
  ["人工智能", "ai"],
  ["机器学习", "machine-learning"],
  ["深度学习", "deep-learning"],
  ["内容工厂", "content-factory"],
  ["客服调度中心", "customer-service-dispatch-center"],
  ["客户服务中心", "customer-service-center"],
  ["学术研究院", "academic-research-institute"],
  ["研究院", "research-institute"],
  ["研究中心", "research-center"],
  ["实验室", "lab"],
  ["工作室", "studio"],
  ["自动化", "automation"],
  ["调度", "dispatch"],
  ["运营", "operations"],
  ["产品", "product"],
  ["设计", "design"],
  ["科技", "tech"],
  ["技术", "technology"],
  ["研发", "research-and-development"],
  ["平台", "platform"],
  ["系统", "system"],
  ["数据", "data"],
  ["智能", "intelligence"],
  ["内容", "content"],
  ["客服", "support"],
  ["客户服务", "customer-service"],
  ["知识库", "knowledge-base"],
  ["学术", "academic"],
  ["研究", "research"],
  ["个人", "personal"],
  ["全能", "all-purpose"],
  ["助理", "assistant"],
  ["小说", "novel"],
  ["媒体", "media"],
  ["游戏", "game"],
  ["教育", "education"],
  ["营销", "marketing"],
  ["销售", "sales"],
  ["财务", "finance"],
  ["运营", "operations"],
  ["工厂", "factory"],
  ["中心", "center"],
  ["团队", "team"],
  ["公司", "company"],
  ["集团", "group"],
];

function normalizeAsciiSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function translateChineseCompanyTerms(value: string): string {
  let translated = value.normalize("NFKC");
  for (const [source, target] of CHINESE_COMPANY_PHRASES) {
    translated = translated.replaceAll(source, ` ${target} `);
  }
  return translated;
}

function normalizeExistingHandle(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = normalizeAsciiSlug(translateChineseCompanyTerms(value.trim()));
  return normalized.length > 0 ? normalized : null;
}

export function buildCompanyAgentSlug(companyName: string): string {
  const translated = translateChineseCompanyTerms(companyName);
  const normalized = normalizeAsciiSlug(translated);
  return normalized.length > 0 ? normalized : "company";
}

export function collectExistingAgentHandles(agents: AgentListEntry[]): Set<string> {
  const handles = new Set<string>();
  for (const agent of agents) {
    for (const value of [agent.id, agent.name, agent.identity?.name]) {
      const normalized = normalizeExistingHandle(value);
      if (normalized) {
        handles.add(normalized);
      }
    }
  }
  return handles;
}

function doesNamespaceCollide(namespace: string, existingHandles: Set<string>): boolean {
  const normalizedNamespace = normalizeAsciiSlug(namespace);
  if (existingHandles.has(normalizedNamespace)) {
    return true;
  }

  for (const handle of existingHandles) {
    if (
      handle === `${normalizedNamespace}-ceo` ||
      handle === `${normalizedNamespace}-hr` ||
      handle === `${normalizedNamespace}-cto` ||
      handle === `${normalizedNamespace}-coo` ||
      handle.startsWith(`${normalizedNamespace}-emp-`) ||
      handle.startsWith(`${normalizedNamespace}-bp-`)
    ) {
      return true;
    }
  }

  return false;
}

export function allocateCompanyAgentNamespace(
  companyName: string,
  existingHandles: Iterable<string>,
): string {
  const baseSlug = buildCompanyAgentSlug(companyName);
  const normalizedExistingHandles = new Set<string>();
  for (const handle of existingHandles) {
    const normalized = normalizeExistingHandle(handle);
    if (normalized) {
      normalizedExistingHandles.add(normalized);
    }
  }

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const namespace = attempt === 0 ? `${baseSlug}-co` : `${baseSlug}-co-${attempt + 1}`;
    if (!doesNamespaceCollide(namespace, normalizedExistingHandles)) {
      return namespace;
    }
  }

  return `${baseSlug}-co-${Date.now().toString(36)}`;
}

export function buildCompanyRoleAgentName(namespace: string, role: string): string {
  return `${namespace}-${normalizeAsciiSlug(role)}`;
}
