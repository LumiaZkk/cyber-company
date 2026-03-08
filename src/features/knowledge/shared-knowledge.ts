import type { Company, SharedKnowledgeItem, SharedKnowledgeKind } from "../company/types";
import { getActiveHandoffs } from "../handoffs/active-handoffs";

function normalizeText(value: string | undefined | null): string {
  return String(value ?? "")
    .toLowerCase()
    .trim();
}

function inferKnowledgeScenario(company: Company): "novel" | "content" | "service" | "research" | "assistant" | "generic" {
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

function buildItem(params: {
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

export function buildSeedKnowledgeItems(company: Company): SharedKnowledgeItem[] {
  const canon = buildScenarioCanon(company);
  const responsibilities = buildResponsibilities(company);
  const roadmap = buildRoadmap(company);
  const workflow = buildWorkflow(company);
  const foreshadow = buildForeshadow(company);

  return [
    buildItem({
      company,
      kind: "canon",
      title: canon.title,
      summary: canon.summary,
      details: canon.details,
      owners: company.employees
        .filter((employee) => employee.metaRole === "ceo" || employee.metaRole === "coo")
        .map((employee) => employee.agentId),
    }),
    buildItem({
      company,
      kind: "responsibility",
      title: "职责边界",
      summary: responsibilities.summary,
      details: responsibilities.details,
      owners: responsibilities.owners,
    }),
    buildItem({
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
    buildItem({
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
    buildItem({
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

export function resolveCompanyKnowledge(company: Company): SharedKnowledgeItem[] {
  const seededById = new Map(buildSeedKnowledgeItems(company).map((item) => [item.id, item]));
  const storedItems = company.knowledgeItems ?? [];

  for (const item of storedItems) {
    seededById.set(item.id, item);
  }

  return [...seededById.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}
