import type { Company, EmployeeRef } from "../company/types";
import type { CronJob } from "../backend";

export type AutomationScenarioId =
  | "novel-studio"
  | "content-factory"
  | "customer-service"
  | "research-lab"
  | "personal-assistant"
  | "generic";

export type AutomationRecommendation = {
  id: string;
  label: string;
  category: string;
  scheduleLabel: string;
  expr?: string;
  everyMs?: number;
  task: string;
  reason: string;
  recommendedAgentId?: string;
  recommendedAgentLabel?: string;
  status: "ready" | "already_scheduled";
  matchedJobId?: string;
  matchedJobName?: string;
};

export type AutomationScenario = {
  id: AutomationScenarioId;
  label: string;
  description: string;
  recommendations: AutomationRecommendation[];
};

type RecommendationSeed = {
  id: string;
  label: string;
  category: string;
  scheduleLabel: string;
  expr?: string;
  everyMs?: number;
  task: string;
  reason: string;
  agentResolver: (employees: EmployeeRef[]) => EmployeeRef | null;
};

function normalizeText(value: string | undefined | null): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findEmployeeByPatterns(
  employees: EmployeeRef[],
  patterns: RegExp[],
  options?: { metaRole?: EmployeeRef["metaRole"]; includeMeta?: boolean },
): EmployeeRef | null {
  const includeMeta = options?.includeMeta ?? false;
  const pool = includeMeta ? employees : employees.filter((employee) => !employee.isMeta);

  for (const pattern of patterns) {
    const matched = pool.find((employee) => pattern.test(employee.role) || pattern.test(employee.nickname));
    if (matched) {
      return matched;
    }
  }

  if (options?.metaRole) {
    return employees.find((employee) => employee.metaRole === options.metaRole) ?? null;
  }

  return pool[0] ?? employees[0] ?? null;
}

function findMeta(employees: EmployeeRef[], metaRole: EmployeeRef["metaRole"]): EmployeeRef | null {
  return employees.find((employee) => employee.metaRole === metaRole) ?? null;
}

function resolveScheduleMatch(seed: RecommendationSeed, job: CronJob): boolean {
  if (seed.expr) {
    return job.schedule?.kind === "cron" && normalizeText(job.schedule.expr) === normalizeText(seed.expr);
  }
  if (typeof seed.everyMs === "number") {
    return job.schedule?.kind === "every" && job.schedule.everyMs === seed.everyMs;
  }
  return false;
}

function resolveRecommendationMatch(seed: RecommendationSeed, jobs: CronJob[]): CronJob | null {
  const targetName = normalizeText(seed.label);
  const targetTask = normalizeText(seed.task);

  return (
    jobs.find((job) => normalizeText(job.name) === targetName) ??
    jobs.find((job) => normalizeText(job.payload?.message) === targetTask && resolveScheduleMatch(seed, job)) ??
    null
  );
}

function inferAutomationScenario(company: Company): Pick<AutomationScenario, "id" | "label" | "description"> {
  const template = normalizeText(company.template);
  const haystack = normalizeText(
    [
      company.name,
      company.description,
      ...company.employees.map((employee) => `${employee.role} ${employee.nickname}`),
    ].join(" "),
  );

  if (/小说|创作|章节|主编|写手|审校|连载|设定|伏笔/.test(haystack)) {
    return {
      id: "novel-studio",
      label: "连载创作场景",
      description: "围绕章节交付、审校 SLA、发布回路和长线设定一致性来推荐自动化。",
    };
  }

  if (template.includes("content") || /内容|社媒|选题|主笔|短视频|seo/.test(haystack)) {
    return {
      id: "content-factory",
      label: "内容生产场景",
      description: "围绕选题、产能、分发和复盘来推荐高频内容运营自动化。",
    };
  }

  if (template.includes("customer-service") || /客服|工单|知识库|质检|客诉/.test(haystack)) {
    return {
      id: "customer-service",
      label: "客服调度场景",
      description: "围绕工单积压、知识冲突和质检抽样来推荐自动化巡检。",
    };
  }

  if (template.includes("research") || /研究|文献|实验|数据|论文/.test(haystack)) {
    return {
      id: "research-lab",
      label: "研究协作场景",
      description: "围绕新文献追踪、实验异常和阶段性研究摘要来推荐自动化。",
    };
  }

  if (template.includes("personal-assistant") || /日程|教练|个人|待办|提醒/.test(haystack)) {
    return {
      id: "personal-assistant",
      label: "个人助理场景",
      description: "围绕计划、提醒、复盘和周目标校准来推荐自动化。",
    };
  }

  return {
    id: "generic",
    label: "通用运营场景",
    description: "未识别到明确业务模板，先给出面向阻塞和复盘的基础自动化。",
  };
}

function buildScenarioSeeds(company: Company): RecommendationSeed[] {
  const employees = company.employees;

  switch (inferAutomationScenario(company).id) {
    case "novel-studio":
      return [
        {
          id: "chapter-publish-tracking",
          label: "章节发布追踪",
          category: "发布闭环",
          scheduleLabel: "每天 10:00 / 14:00 / 18:00 / 22:00",
          expr: "0 10,14,18,22 * * *",
          task: "检查今日章节从写手到审校到主编的推进状态，列出阻塞章节、缺失交接项和待手动发布任务，并同步给 CEO。",
          reason: "把发布链路里的卡点提前暴露，减少 CEO 反复催促和最后时刻手动接管。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/主编|编辑|总编/i], { metaRole: "coo" }),
        },
        {
          id: "review-sla-watch",
          label: "审校 SLA 提醒",
          category: "交接监控",
          scheduleLabel: "每 30 分钟",
          everyMs: 30 * 60 * 1000,
          task: "巡检所有待审章节与审校交接对象，标记超过 SLA 的任务，并提醒主编改派或切人工接管。",
          reason: "真实记录里审校和主编交接经常超时，需要自动提醒而不是继续等待。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/审校|校对|编辑/i], { metaRole: "coo" }),
        },
        {
          id: "nightly-publish-retro",
          label: "章节发布后复盘",
          category: "日终复盘",
          scheduleLabel: "每天 23:30",
          expr: "30 23 * * *",
          task: "汇总今日章节发布结果、返工原因、评论反馈和未闭环阻塞，生成一份运营复盘给 CEO 和 COO。",
          reason: "把每天的发布成功率、返工和评论信号沉淀下来，避免问题只留在群聊里。",
          agentResolver: () => findMeta(employees, "coo") ?? findMeta(employees, "ceo"),
        },
        {
          id: "story-consistency-audit",
          label: "长线设定巡检",
          category: "内容质量",
          scheduleLabel: "每周日 21:00",
          expr: "0 21 * * 0",
          task: "检查本周章节中的设定漂移、人物弧线和伏笔回收情况，整理成下周创作风险清单。",
          reason: "长线连载最容易积累设定漂移，适合用低频审计自动发现一致性风险。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/主编|审校|校对/i], { metaRole: "ceo" }),
        },
      ];
    case "content-factory":
      return [
        {
          id: "morning-topic-radar",
          label: "热点选题晨报",
          category: "选题流",
          scheduleLabel: "每天 09:00",
          expr: "0 9 * * *",
          task: "扫描昨晚到今早的热点、竞品动态和评论区需求，生成当天选题优先级并抄送 COO。",
          reason: "内容团队先要解决今天做什么，再解决怎么做，晨报适合作为统一输入。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/研究|主笔|选题|运营/i], { metaRole: "coo" }),
        },
        {
          id: "asset-funnel-check",
          label: "素材漏斗巡检",
          category: "产能监控",
          scheduleLabel: "每小时",
          everyMs: 60 * 60 * 1000,
          task: "检查选题、素材、初稿、定稿和分发各阶段是否断档，列出当前产能瓶颈并提醒负责人。",
          reason: "比起全局健康度，内容团队更关心素材和成稿漏斗是否断流。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/运营|主笔|负责人/i], { metaRole: "coo" }),
        },
        {
          id: "nightly-content-retro",
          label: "晚间内容复盘",
          category: "日终复盘",
          scheduleLabel: "每天 21:30",
          expr: "30 21 * * *",
          task: "汇总今天已发布内容的产出量、互动表现、返工项和未完成选题，生成复盘报告。",
          reason: "把产量、表现和返工放进同一份日终复盘，才方便第二天调策略。",
          agentResolver: () => findMeta(employees, "coo") ?? findMeta(employees, "ceo"),
        },
        {
          id: "weekly-topic-retro",
          label: "周选题会前资料包",
          category: "周度节奏",
          scheduleLabel: "每周一 10:00",
          expr: "0 10 * * 1",
          task: "整理上周爆款线索、低表现内容和下周机会清单，为周选题会生成资料包。",
          reason: "把零散复盘压成周度决策资料，减少团队开会前再翻历史数据。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/研究|运营|主笔/i], { metaRole: "ceo" }),
        },
      ];
    case "customer-service":
      return [
        {
          id: "ticket-backlog-watch",
          label: "工单积压预警",
          category: "服务稳定性",
          scheduleLabel: "每 15 分钟",
          everyMs: 15 * 60 * 1000,
          task: "巡检高优先级工单、超时会话和未分配请求，生成积压预警并提醒 COO。",
          reason: "客服系统最先需要知道哪里要爆单，而不是只看系统是否在线。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/客服|工单|运营/i], { metaRole: "coo" }),
        },
        {
          id: "faq-conflict-audit",
          label: "FAQ 冲突巡检",
          category: "知识一致性",
          scheduleLabel: "每 4 小时",
          everyMs: 4 * 60 * 60 * 1000,
          task: "扫描当天会话中的高频追问、冲突答复和缺失知识点，整理成知识库更新清单。",
          reason: "真实客服闭环里，知识冲突比单次超时更容易持续伤害体验。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/知识|FAQ|文档/i], { metaRole: "cto" }),
        },
        {
          id: "nightly-qa-sampling",
          label: "晚间质检抽样",
          category: "服务质量",
          scheduleLabel: "每天 21:00",
          expr: "0 21 * * *",
          task: "抽样检查今日客服会话，标记态度、准确性和升级处理上的问题，生成质检报告。",
          reason: "日终抽样能更快暴露服务下限问题，避免第二天继续复制错误。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/质检|主管|经理/i], { metaRole: "ceo" }),
        },
        {
          id: "weekly-escalation-review",
          label: "投诉升级周复盘",
          category: "周度节奏",
          scheduleLabel: "每周一 11:00",
          expr: "0 11 * * 1",
          task: "复盘上周升级投诉、重复问题和知识缺口，给 CEO 提交服务改进清单。",
          reason: "高优先级投诉最值得被提炼成周度流程改进，而不是散在会话里消失。",
          agentResolver: () => findMeta(employees, "ceo") ?? findMeta(employees, "coo"),
        },
      ];
    case "research-lab":
      return [
        {
          id: "paper-morning-brief",
          label: "新文献晨报",
          category: "输入更新",
          scheduleLabel: "每天 09:30",
          expr: "30 9 * * *",
          task: "检索昨日至今的新论文与研究动态，按主题整理成晨报并标出值得深入的方向。",
          reason: "研究型团队的第一价值是别错过新输入，晨报适合作为统一入口。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/文献|研究|助理/i], { metaRole: "coo" }),
        },
        {
          id: "experiment-data-watch",
          label: "实验数据异常巡检",
          category: "实验稳定性",
          scheduleLabel: "每 2 小时",
          everyMs: 2 * 60 * 60 * 1000,
          task: "检查实验数据、分析脚本和结果摘要中是否存在异常波动或缺失字段，并生成告警。",
          reason: "研究链路里一旦数据异常没有被及时发现，后面所有分析都会失真。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/数据|架构|分析/i], { metaRole: "cto" }),
        },
        {
          id: "nightly-research-summary",
          label: "晚间研究摘要",
          category: "日终复盘",
          scheduleLabel: "每天 20:30",
          expr: "30 20 * * *",
          task: "汇总今天的阅读、实验、数据清洗和结论输出，生成一份研究进展摘要给 CEO。",
          reason: "研究工作很容易碎片化，统一摘要能让决策者看到今天到底推进了什么。",
          agentResolver: () => findMeta(employees, "coo") ?? findMeta(employees, "ceo"),
        },
        {
          id: "weekly-hypothesis-review",
          label: "假设与方向周复盘",
          category: "周度节奏",
          scheduleLabel: "每周五 18:00",
          expr: "0 18 * * 5",
          task: "汇总本周被验证和被推翻的研究假设，整理下周优先验证的问题列表。",
          reason: "周复盘更适合做方向校准，而不是继续堆实验日志。",
          agentResolver: () => findMeta(employees, "ceo") ?? findMeta(employees, "cto"),
        },
      ];
    case "personal-assistant":
      return [
        {
          id: "morning-plan-sync",
          label: "每日晨间计划",
          category: "日程驱动",
          scheduleLabel: "每天 08:30",
          expr: "30 8 * * *",
          task: "根据今天的待办、会议和目标，生成一份可执行的晨间计划并提醒关键时间点。",
          reason: "个人助理最先需要的是把一天的重点拉出来，而不是泛泛提醒。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/日程|管家|秘书/i], { metaRole: "ceo" }),
        },
        {
          id: "midday-focus-check",
          label: "午间专注检查",
          category: "节奏维持",
          scheduleLabel: "每天 13:00",
          expr: "0 13 * * *",
          task: "检查上午计划执行情况、下午优先级和拖延项，并给出一个重新聚焦建议。",
          reason: "午间比全天候催促更容易被接受，也更适合做节奏校正。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/教练|助理|管家/i], { metaRole: "ceo" }),
        },
        {
          id: "nightly-personal-retro",
          label: "晚间复盘",
          category: "日终复盘",
          scheduleLabel: "每天 21:30",
          expr: "30 21 * * *",
          task: "回顾今日完成事项、拖延原因和明日准备项，生成简短复盘并更新优先级。",
          reason: "把复盘和明日准备合在一起，才能真正形成连续的个人运营闭环。",
          agentResolver: (allEmployees) =>
            findEmployeeByPatterns(allEmployees, [/教练|助理|管家/i], { metaRole: "ceo" }),
        },
        {
          id: "weekly-goal-reset",
          label: "周目标校准",
          category: "周度节奏",
          scheduleLabel: "每周日 20:00",
          expr: "0 20 * * 0",
          task: "复盘本周目标完成情况、能量状态和拖延模式，为下周生成新的目标分配建议。",
          reason: "周目标和能量状态最好一起复盘，避免只看事项不看可持续性。",
          agentResolver: () => findMeta(employees, "ceo"),
        },
      ];
    default:
      return [
        {
          id: "daily-ops-summary",
          label: "每日运营简报",
          category: "基础运营",
          scheduleLabel: "每天 09:30",
          expr: "30 9 * * *",
          task: "汇总当前公司的关键会话、阻塞任务、待处理交接和人工接管项，并发送给 CEO。",
          reason: "当场景尚未完全产品化时，先保证决策层每天能看到全局摘要。",
          agentResolver: () => findMeta(employees, "coo") ?? findMeta(employees, "ceo"),
        },
        {
          id: "hourly-blocker-watch",
          label: "阻塞巡检",
          category: "基础运营",
          scheduleLabel: "每小时",
          everyMs: 60 * 60 * 1000,
          task: "检查当前公司里的超时、失联、阻塞和待人工接管事项，生成一份异常列表。",
          reason: "把最容易拖垮协作体验的异常统一拉出来，是最低成本的运营改良。",
          agentResolver: () => findMeta(employees, "coo") ?? findMeta(employees, "ceo"),
        },
        {
          id: "weekly-process-retro",
          label: "周度流程复盘",
          category: "基础运营",
          scheduleLabel: "每周一 10:00",
          expr: "0 10 * * 1",
          task: "整理上周的任务完成率、交接阻塞和人工接管原因，生成流程改进建议。",
          reason: "通用团队最先需要的是识别流程问题，再逐步沉淀成场景模板。",
          agentResolver: () => findMeta(employees, "ceo"),
        },
      ];
  }
}

export function buildAutomationScenario(params: {
  company: Company;
  jobs: CronJob[];
}): AutomationScenario {
  const scenario = inferAutomationScenario(params.company);
  const seeds = buildScenarioSeeds(params.company);

  return {
    ...scenario,
    recommendations: seeds.map((seed) => {
      const matchedJob = resolveRecommendationMatch(seed, params.jobs);
      const agent = seed.agentResolver(params.company.employees);
      return {
        id: seed.id,
        label: seed.label,
        category: seed.category,
        scheduleLabel: seed.scheduleLabel,
        expr: seed.expr,
        everyMs: seed.everyMs,
        task: seed.task,
        reason: seed.reason,
        recommendedAgentId: agent?.agentId,
        recommendedAgentLabel: agent ? `${agent.nickname} (${agent.role})` : undefined,
        status: matchedJob ? "already_scheduled" : "ready",
        matchedJobId: matchedJob?.id,
        matchedJobName: matchedJob?.name,
      };
    }),
  };
}
