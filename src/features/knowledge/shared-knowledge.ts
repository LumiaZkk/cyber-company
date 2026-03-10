import type {
  ArtifactRecord,
  Company,
  RequestRecord,
  SharedKnowledgeItem,
  SharedKnowledgeKind,
} from "../company/types";
import { getActiveHandoffs } from "../handoffs/active-handoffs";
import {
  extractDeliverableHeading,
  inferReportTransport,
  isPlaceholderOrBridgeText,
  looksLikeStructuredDeliverable,
  summarizeReportText,
} from "../requests/report-classifier";

type KnowledgeScenario = "novel" | "content" | "service" | "research" | "assistant" | "generic";
type KnowledgeRole = "hr" | "cto" | "coo" | "ceo";

type KnowledgeMessageLike = {
  role?: unknown;
  text?: unknown;
  content?: unknown;
  timestamp?: unknown;
};

type DerivedKnowledgeInput = {
  company: Company;
  artifacts?: ArtifactRecord[];
  requests?: RequestRecord[];
  histories?: Array<{
    agentId?: string | null;
    sessionKey: string;
    messages: KnowledgeMessageLike[];
  }>;
};

type KnowledgeCandidate = {
  role: KnowledgeRole;
  title: string;
  summary: string;
  content?: string;
  updatedAt: number;
  sourceAgentId?: string;
  sourceRequestId?: string;
  sourceArtifactId?: string;
  sourcePath?: string;
  sourceUrl?: string;
  transport?: SharedKnowledgeItem["transport"];
  sourceType: "artifact" | "request" | "history";
};

const KNOWLEDGE_ROLE_CONFIG: Record<
  KnowledgeRole,
  {
    kind: SharedKnowledgeKind;
    defaultTitle: string;
    keywords: RegExp;
  }
> = {
  hr: {
    kind: "staffing",
    defaultTitle: "HR 团队架构方案",
    keywords: /人员|岗位|组织架构|团队架构|招聘|人才|配置|职责/i,
  },
  cto: {
    kind: "technology",
    defaultTitle: "CTO 技术方案",
    keywords: /技术方案|工具方案|系统|平台|自动化|数据监控|协作平台|ai/i,
  },
  coo: {
    kind: "operations",
    defaultTitle: "COO 运营策略",
    keywords: /运营策略|平台规则|签约|推荐机制|发布节奏|内容策略|数据运营|收益/i,
  },
  ceo: {
    kind: "summary",
    defaultTitle: "CEO 最终汇总方案",
    keywords: /汇总|最终方案|整合方案|总结|组建方案|执行方案/i,
  },
};

export function formatKnowledgeKindLabel(kind: SharedKnowledgeKind): string {
  switch (kind) {
    case "canon":
      return "设定";
    case "responsibility":
      return "职责";
    case "roadmap":
      return "里程碑";
    case "workflow":
      return "流程";
    case "foreshadow":
      return "风险";
    case "staffing":
      return "人员规划";
    case "technology":
      return "技术方案";
    case "operations":
      return "运营策略";
    case "summary":
      return "最终汇总";
    default:
      return kind;
  }
}

function normalizeText(value: string | undefined | null): string {
  return String(value ?? "")
    .toLowerCase()
    .trim();
}

function normalizeLine(value: string): string {
  return value
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/[🎉🎯📚✅]/gu, "")
    .replace(/\s+/g, " ");
}

function inferKnowledgeScenario(company: Company): KnowledgeScenario {
  const haystack = normalizeText(
    [company.name, company.description, company.template, ...company.employees.map((item) => item.role)].join(" "),
  );

  if (/小说|创作|章节|主编|写手|审校|伏笔|设定/.test(haystack)) {
    return "novel";
  }
  if (/内容|社媒|选题|主笔|运营|seo/.test(haystack)) {
    return "content";
  }
  if (/客服|工单|知识库|质检|客诉/.test(haystack)) {
    return "service";
  }
  if (/研究|文献|实验|论文|数据/.test(haystack)) {
    return "research";
  }
  if (/个人|助理|日程|教练|提醒/.test(haystack)) {
    return "assistant";
  }
  return "generic";
}

function buildScenarioCanon(company: Company): { title: string; summary: string; details: string } {
  const scenario = inferKnowledgeScenario(company);

  if (scenario === "novel") {
    return {
      title: "世界观与人物设定库",
      summary: "统一维护人物弧线、世界规则、章节约束和伏笔回收，避免连载过程中的设定漂移。",
      details:
        "每次章节推进前先核对主角状态、世界观硬约束、关键伏笔和未兑现承诺；发现冲突时，必须在交接对象里明确回填。",
    };
  }

  if (scenario === "content") {
    return {
      title: "品牌与选题事实库",
      summary: "沉淀品牌语气、固定栏目、内容禁区和当前优先级，减少多角色重复校准。",
      details:
        "选题、表达口径、竞品判断和分发节奏都应落在同一份知识层里，避免内容主笔和运营各自维护私有语境。",
    };
  }

  if (scenario === "service") {
    return {
      title: "FAQ 与升级口径库",
      summary: "维护统一答复口径、升级条件和禁止承诺事项，避免客服会话出现冲突答案。",
      details:
        "高频追问、升级投诉和知识缺口应持续沉淀到公司级知识层，而不是在单条工单会话里耗散。",
    };
  }

  if (scenario === "research") {
    return {
      title: "研究前提与术语库",
      summary: "统一记录问题定义、关键假设、数据口径和参考术语，减少实验结果解释偏差。",
      details:
        "研究团队在生成结论前，应先对齐问题边界、数据口径和实验假设，防止不同角色在不同语境里工作。",
    };
  }

  if (scenario === "assistant") {
    return {
      title: "目标与约束清单",
      summary: "统一管理长期目标、近期优先级、固定约束和可用时间窗口，避免助理只做零散提醒。",
      details:
        "所有提醒、计划和复盘都应该回落到统一目标约束层，确保日程建议不是孤立任务列表。",
    };
  }

  return {
    title: "公司事实与约束层",
    summary: "统一沉淀这家公司的目标、术语和关键约束，避免关键上下文散落在聊天与文件中。",
    details:
      "共享知识层是跨角色协作的默认上下文，任何反复被引用的事实、流程和边界都应该被归档到这里。",
  };
}

function buildResponsibilities(company: Company): { summary: string; details: string; owners: string[] } {
  const roleLines = company.employees.slice(0, 6).map((employee) => `${employee.nickname} 负责 ${employee.role}`);
  return {
    summary: "把管理层和执行层的责任边界固化成公司默认上下文，减少反复在聊天里解释“谁接谁”。",
    details: roleLines.join("；"),
    owners: company.employees
      .filter((employee) => employee.metaRole === "ceo" || employee.metaRole === "coo")
      .map((employee) => employee.agentId),
  };
}

function buildRoadmap(company: Company): { summary: string; details: string } {
  const tasks = company.tasks ?? [];
  const completed = tasks.filter((task) => task.state === "completed").length;
  const blocked = tasks.filter(
    (task) =>
      task.state === "manual_takeover_required" ||
      task.state === "blocked_timeout" ||
      task.state === "blocked_tool_failure",
  ).length;
  const waiting = tasks.filter(
    (task) => task.state === "waiting_input" || task.state === "waiting_peer",
  ).length;

  return {
    summary: `当前任务池 ${tasks.length} 条，已完成 ${completed}，等待 ${waiting}，阻塞 ${blocked}。`,
    details:
      tasks.length > 0
        ? tasks
            .slice(0, 4)
            .map((task) => `${task.title} · ${task.state ?? "unknown"}`)
            .join("；")
        : "当前还没有结构化任务对象，建议从聊天和看板优先沉淀关键里程碑。",
  };
}

function buildWorkflow(company: Company): { summary: string; details: string } {
  const handoffs = getActiveHandoffs(company.handoffs ?? []);
  const pending = handoffs.filter((handoff) => handoff.status !== "completed").length;
  const blocked = handoffs.filter((handoff) => handoff.status === "blocked").length;
  const manual = (company.tasks ?? []).filter((task) => task.state === "manual_takeover_required").length;

  return {
    summary: `当前交接 ${handoffs.length} 条，待闭环 ${pending}，阻塞 ${blocked}，人工接管 ${manual}。`,
    details:
      "默认流程应当是：任务对象创建 -> 交接对象补齐 -> 超时触发 SLA -> 无法恢复时生成接管包。任何缺少交接项的流程都视为未完成。",
  };
}

function buildForeshadow(company: Company): { title: string; summary: string; details: string } {
  const scenario = inferKnowledgeScenario(company);
  if (scenario === "novel") {
    return {
      title: "伏笔与风险清单",
      summary: "专门记录长线伏笔、角色承诺和高风险章节，避免发布后才发现设定断裂。",
      details:
        "任何待兑现的伏笔、设定风险和跨章节依赖都要在这里跟踪；如果缺少回收路径，系统应优先提示主编补齐。",
    };
  }

  return {
    title: "风险与异常观察",
    summary: "持续记录当前公司最可能反复出现的流程风险和异常模式，作为后续复盘输入。",
    details:
      "阻塞任务、失败交接、知识冲突和人工接管都应被归档到风险观察层，方便后续形成稳定流程。",
  };
}

function buildSeedItem(params: {
  company: Company;
  kind: SharedKnowledgeKind;
  title: string;
  summary: string;
  details: string;
  owners?: string[];
  status?: SharedKnowledgeItem["status"];
}): SharedKnowledgeItem {
  return {
    id: `knowledge:${params.company.id}:${params.kind}`,
    kind: params.kind,
    title: params.title,
    summary: params.summary,
    details: params.details,
    ownerAgentIds: params.owners ?? [],
    source: "seeded",
    status: params.status ?? "active",
    updatedAt: Date.now(),
  };
}

function resolveEmployeeRole(company: Company, agentId: string | undefined | null): KnowledgeRole | null {
  if (!agentId) {
    return null;
  }
  const employee = company.employees.find((item) => item.agentId === agentId);
  if (
    employee?.metaRole === "hr" ||
    employee?.metaRole === "cto" ||
    employee?.metaRole === "coo" ||
    employee?.metaRole === "ceo"
  ) {
    return employee.metaRole;
  }
  return null;
}

function extractHistoryText(message: KnowledgeMessageLike): string {
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return message.content.trim();
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }
      if (block && typeof block === "object") {
        const record = block as Record<string, unknown>;
        if (record.type === "text" && typeof record.text === "string") {
          return record.text;
        }
      }
      return "";
    })
    .join("\n")
    .trim();
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function matchesKnowledgeRole(role: KnowledgeRole, text: string): boolean {
  return KNOWLEDGE_ROLE_CONFIG[role].keywords.test(normalizeLine(text));
}

function buildKnowledgeTitle(role: KnowledgeRole, sourceTitle?: string, sourceText?: string): string {
  const heading = sourceText ? extractDeliverableHeading(sourceText) : undefined;
  const normalizedSourceTitle = sourceTitle ? normalizeLine(sourceTitle) : "";
  if (heading) {
    return normalizeLine(heading);
  }
  if (normalizedSourceTitle.length >= 4 && normalizedSourceTitle.length <= 48) {
    return normalizedSourceTitle;
  }
  return KNOWLEDGE_ROLE_CONFIG[role].defaultTitle;
}

function buildKnowledgeSummary(text: string, fallback: string): string {
  return text.trim() ? summarizeReportText(text) : fallback;
}

function buildArtifactCandidates(input: DerivedKnowledgeInput): KnowledgeCandidate[] {
  return (input.artifacts ?? [])
    .flatMap((artifact) => {
      const role = resolveEmployeeRole(input.company, artifact.sourceActorId ?? artifact.ownerActorId);
      if (!role) {
        return [];
      }
      const text = `${artifact.title}\n${artifact.summary ?? ""}\n${artifact.content ?? ""}`.trim();
      if (!text || isPlaceholderOrBridgeText(text) || !matchesKnowledgeRole(role, text)) {
        return [];
      }
      if (!looksLikeStructuredDeliverable(text) && !(artifact.sourcePath || artifact.sourceUrl)) {
        return [];
      }
      return [
        {
          role,
          title: buildKnowledgeTitle(role, artifact.sourceName ?? artifact.title, artifact.content ?? text),
          summary: buildKnowledgeSummary(artifact.summary ?? artifact.content ?? text, artifact.title),
          content: artifact.content ?? undefined,
          updatedAt: artifact.updatedAt,
          sourceAgentId: artifact.sourceActorId ?? artifact.ownerActorId ?? undefined,
          sourceArtifactId: artifact.id,
          sourcePath: artifact.sourcePath,
          sourceUrl: artifact.sourceUrl,
          transport: inferReportTransport(text),
          sourceType: "artifact",
        } satisfies KnowledgeCandidate,
      ];
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function buildRequestCandidates(input: DerivedKnowledgeInput): KnowledgeCandidate[] {
  return (input.requests ?? [])
    .flatMap((request) => {
      if (request.status !== "answered") {
        return [];
      }
      const role = resolveEmployeeRole(input.company, request.fromAgentId);
      if (!role) {
        return [];
      }
      const responseDetails = request.responseDetails?.trim() ?? "";
      const responseSummary = request.responseSummary?.trim() ?? "";
      const requestSummary = request.summary?.trim() ?? "";
      const text = responseDetails || responseSummary || requestSummary;
      if (!text || isPlaceholderOrBridgeText(text) || !matchesKnowledgeRole(role, `${request.title}\n${text}`)) {
        return [];
      }
      if (!looksLikeStructuredDeliverable(text)) {
        return [];
      }
      return [
        {
          role,
          title: buildKnowledgeTitle(role, request.title, text),
          summary: buildKnowledgeSummary(responseSummary || text, request.title),
          content: responseDetails || text,
          updatedAt: request.updatedAt,
          sourceAgentId: request.fromAgentId,
          sourceRequestId: request.id,
          transport: request.transport ?? inferReportTransport(text),
          sourceType: "request",
        } satisfies KnowledgeCandidate,
      ];
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function buildHistoryCandidates(input: DerivedKnowledgeInput): KnowledgeCandidate[] {
  return (input.histories ?? [])
    .flatMap((history) => {
      const role = resolveEmployeeRole(input.company, history.agentId);
      if (!role) {
        return [];
      }
      const orderedMessages = history.messages
        .map((message, index) => ({
          role: message.role,
          text: extractHistoryText(message),
          timestamp: normalizeTimestamp(message.timestamp, index + 1),
        }))
        .filter((message) => message.role === "assistant" && message.text.length > 0)
        .sort((left, right) => right.timestamp - left.timestamp);

      const match = orderedMessages.find((message) => {
        if (isPlaceholderOrBridgeText(message.text)) {
          return false;
        }
        return matchesKnowledgeRole(role, message.text) && looksLikeStructuredDeliverable(message.text);
      });
      if (!match) {
        return [];
      }
      return [
        {
          role,
          title: buildKnowledgeTitle(role, undefined, match.text),
          summary: buildKnowledgeSummary(match.text, KNOWLEDGE_ROLE_CONFIG[role].defaultTitle),
          content: match.text,
          updatedAt: match.timestamp,
          sourceAgentId: history.agentId ?? undefined,
          transport: inferReportTransport(match.text),
          sourceType: "history",
        } satisfies KnowledgeCandidate,
      ];
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function pickKnowledgeSource(candidates: KnowledgeCandidate[]): KnowledgeCandidate | null {
  if (candidates.length === 0) {
    return null;
  }
  const score = (candidate: KnowledgeCandidate) =>
    (candidate.content?.trim() ? 4 : 0) +
    (candidate.sourceType === "artifact" ? 3 : candidate.sourceType === "request" ? 2 : 1) +
    (candidate.sourcePath || candidate.sourceUrl ? 2 : 0);

  return [...candidates].sort((left, right) => {
    const byScore = score(right) - score(left);
    if (byScore !== 0) {
      return byScore;
    }
    return right.updatedAt - left.updatedAt;
  })[0] ?? null;
}

function mergeKnowledgeCandidates(
  role: KnowledgeRole,
  company: Company,
  candidates: KnowledgeCandidate[],
): SharedKnowledgeItem | null {
  if (candidates.length === 0) {
    return null;
  }
  const primary = pickKnowledgeSource(candidates);
  if (!primary) {
    return null;
  }
  const artifactSource =
    candidates
      .filter((candidate) => candidate.sourceType === "artifact" && (candidate.sourcePath || candidate.sourceUrl))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
  const requestSource =
    candidates
      .filter((candidate) => candidate.sourceType === "request" && candidate.content?.trim())
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
  const latestUpdatedAt = Math.max(...candidates.map((candidate) => candidate.updatedAt));
  const config = KNOWLEDGE_ROLE_CONFIG[role];
  const content =
    primary.content?.trim() ??
    requestSource?.content?.trim() ??
    artifactSource?.content?.trim() ??
    undefined;

  return {
    id: `knowledge:${company.id}:derived:${role}`,
    kind: config.kind,
    title: buildKnowledgeTitle(role, primary.title, content ?? primary.summary),
    summary: primary.summary,
    details: primary.summary,
    content,
    ownerAgentIds: primary.sourceAgentId ? [primary.sourceAgentId] : [],
    source: "derived",
    sourceAgentId: primary.sourceAgentId ?? artifactSource?.sourceAgentId,
    sourceRequestId: requestSource?.sourceRequestId ?? primary.sourceRequestId,
    sourceArtifactId: artifactSource?.sourceArtifactId ?? primary.sourceArtifactId,
    sourcePath: artifactSource?.sourcePath ?? primary.sourcePath,
    sourceUrl: artifactSource?.sourceUrl ?? primary.sourceUrl,
    transport: primary.transport ?? requestSource?.transport ?? artifactSource?.transport,
    acceptedAt: latestUpdatedAt,
    acceptanceMode: "auto",
    status: "active",
    updatedAt: latestUpdatedAt,
  } satisfies SharedKnowledgeItem;
}

export function buildSeedKnowledgeItems(company: Company): SharedKnowledgeItem[] {
  const canon = buildScenarioCanon(company);
  const responsibilities = buildResponsibilities(company);
  const roadmap = buildRoadmap(company);
  const workflow = buildWorkflow(company);
  const foreshadow = buildForeshadow(company);

  return [
    buildSeedItem({
      company,
      kind: "canon",
      title: canon.title,
      summary: canon.summary,
      details: canon.details,
      owners: company.employees
        .filter((employee) => employee.metaRole === "ceo" || employee.metaRole === "coo")
        .map((employee) => employee.agentId),
    }),
    buildSeedItem({
      company,
      kind: "responsibility",
      title: "职责边界",
      summary: responsibilities.summary,
      details: responsibilities.details,
      owners: responsibilities.owners,
    }),
    buildSeedItem({
      company,
      kind: "roadmap",
      title: "当前里程碑",
      summary: roadmap.summary,
      details: roadmap.details,
      owners: company.employees
        .filter((employee) => employee.metaRole === "ceo" || employee.metaRole === "coo")
        .map((employee) => employee.agentId),
      status: "watch",
    }),
    buildSeedItem({
      company,
      kind: "workflow",
      title: "默认交付流程",
      summary: workflow.summary,
      details: workflow.details,
      owners: company.employees
        .filter((employee) => employee.metaRole === "coo" || employee.metaRole === "hr")
        .map((employee) => employee.agentId),
      status: "watch",
    }),
    buildSeedItem({
      company,
      kind: "foreshadow",
      title: foreshadow.title,
      summary: foreshadow.summary,
      details: foreshadow.details,
      owners: company.employees
        .filter((employee) => employee.metaRole === "ceo" || employee.metaRole === "hr")
        .map((employee) => employee.agentId),
      status: "watch",
    }),
  ];
}

export function buildDerivedKnowledgeItems(input: DerivedKnowledgeInput): SharedKnowledgeItem[] {
  const artifactCandidates = buildArtifactCandidates(input);
  const requestCandidates = buildRequestCandidates(input);
  const historyCandidates = buildHistoryCandidates(input);
  const allCandidates = [...artifactCandidates, ...requestCandidates, ...historyCandidates];

  return (["hr", "cto", "coo", "ceo"] as const)
    .map((role) =>
      mergeKnowledgeCandidates(
        role,
        input.company,
        allCandidates.filter((candidate) => candidate.role === role),
      ),
    )
    .filter((item): item is SharedKnowledgeItem => item !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function mergeCompanyKnowledgeItems(
  existingItems: SharedKnowledgeItem[],
  derivedItems: SharedKnowledgeItem[],
): SharedKnowledgeItem[] {
  const merged = new Map<string, SharedKnowledgeItem>();
  existingItems
    .filter((item) => item.source !== "derived")
    .forEach((item) => {
      merged.set(item.id, item);
    });
  derivedItems.forEach((item) => {
    merged.set(item.id, item);
  });
  return [...merged.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function resolveCompanyKnowledge(company: Company): SharedKnowledgeItem[] {
  const seededById = new Map(buildSeedKnowledgeItems(company).map((item) => [item.id, item] as const));
  const storedItems = company.knowledgeItems ?? [];

  for (const item of storedItems) {
    seededById.set(item.id, item);
  }

  return [...seededById.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}
