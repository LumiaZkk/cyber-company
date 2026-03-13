import type { Company } from "../../domain/org/types";
import type { AgentRuntimeRecord } from "../agent-runtime";
import { getActiveHandoffs } from "../delegation/active-handoffs";
import { evaluateSlaAlerts } from "./sla-rules";
import type { GatewaySessionRow } from "../gateway";
import { isSessionActive, resolveSessionActorId, resolveSessionUpdatedAt } from "../../lib/sessions";

export type EmployeeOperationalInsight = {
  agentId: string;
  nickname: string;
  role: string;
  loadScore: number;
  loadState: "idle" | "balanced" | "elevated" | "overloaded";
  reliabilityScore: number;
  reliabilityState: "strong" | "watch" | "fragile";
  activeTasks: number;
  blockedTasks: number;
  completedTasks: number;
  pendingHandoffs: number;
  blockedHandoffs: number;
  overdueAlerts: number;
  sessionCount: number;
  activeSessions: number;
  latestActivityAt: number;
  focusSummary: string;
};

export type OutcomeReport = {
  totalTasks: number;
  completedTasks: number;
  blockedTasks: number;
  waitingTasks: number;
  manualTakeovers: number;
  completionRate: number;
  blockedRate: number;
  waitingRate: number;
  totalHandoffs: number;
  completedHandoffs: number;
  blockedHandoffs: number;
  pendingHandoffs: number;
  handoffCompletionRate: number;
  slaAlerts: number;
  criticalAlerts: number;
  overloadedEmployees: number;
  fragileEmployees: number;
  avgLoadScore: number;
  avgReliabilityScore: number;
};

export type RetrospectiveSnapshot = {
  periodLabel: string;
  summary: string;
  wins: string[];
  risks: string[];
  actionItems: string[];
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value);
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return round((numerator / denominator) * 100);
}

function resolveLoadState(score: number): EmployeeOperationalInsight["loadState"] {
  if (score >= 75) {
    return "overloaded";
  }
  if (score >= 50) {
    return "elevated";
  }
  if (score >= 20) {
    return "balanced";
  }
  return "idle";
}

function resolveReliabilityState(score: number): EmployeeOperationalInsight["reliabilityState"] {
  if (score >= 80) {
    return "strong";
  }
  if (score >= 60) {
    return "watch";
  }
  return "fragile";
}

export function buildEmployeeOperationalInsights(params: {
  company: Company;
  sessions: GatewaySessionRow[];
  activeAgentRuntime?: AgentRuntimeRecord[];
  now?: number;
}): EmployeeOperationalInsight[] {
  const now = params.now ?? Date.now();
  const alerts = evaluateSlaAlerts(params.company, now);
  const tasks = params.company.tasks ?? [];
  const handoffs = getActiveHandoffs(params.company.handoffs ?? []);
  const sessionsByAgent = new Map<string, GatewaySessionRow[]>();
  const runtimeByAgentId = new Map(
    (params.activeAgentRuntime ?? []).map((runtime) => [runtime.agentId, runtime] as const),
  );

  for (const session of params.sessions) {
    const agentId = resolveSessionActorId(session);
    if (!agentId) {
      continue;
    }
    const group = sessionsByAgent.get(agentId) ?? [];
    group.push(session);
    sessionsByAgent.set(agentId, group);
  }

  return params.company.employees
    .map((employee) => {
      const ownedTasks = tasks.filter(
        (task) =>
          task.ownerAgentId === employee.agentId ||
          task.agentId === employee.agentId ||
          task.assigneeAgentIds?.includes(employee.agentId),
      );
      const blockedTasks = ownedTasks.filter(
        (task) =>
          task.state === "manual_takeover_required" ||
          task.state === "blocked_timeout" ||
          task.state === "blocked_tool_failure",
      ).length;
      const activeTasks = ownedTasks.filter(
        (task) =>
          task.state === "running" ||
          task.state === "waiting_input" ||
          task.state === "waiting_peer",
      ).length;
      const completedTasks = ownedTasks.filter((task) => task.state === "completed").length;
      const pendingHandoffs = handoffs.filter(
        (handoff) => handoff.toAgentIds.includes(employee.agentId) && handoff.status !== "completed",
      ).length;
      const blockedHandoffs = handoffs.filter(
        (handoff) =>
          (handoff.toAgentIds.includes(employee.agentId) || handoff.fromAgentId === employee.agentId) &&
          handoff.status === "blocked",
      ).length;
      const overdueAlerts = alerts.filter((alert) => alert.ownerAgentId === employee.agentId).length;
      const employeeSessions = sessionsByAgent.get(employee.agentId) ?? [];
      const runtime = runtimeByAgentId.get(employee.agentId) ?? null;
      const activeSessions = runtime
        ? runtime.activeSessionKeys.length
        : employeeSessions.filter((session) => isSessionActive(session, now)).length;
      const latestActivityAt = employeeSessions.reduce(
        (latest, session) => Math.max(latest, resolveSessionUpdatedAt(session)),
        0,
      );
      const runtimeActivityAt = Math.max(
        runtime?.lastSeenAt ?? 0,
        runtime?.lastBusyAt ?? 0,
        runtime?.lastIdleAt ?? 0,
      );

      const loadScore = clamp(
        activeTasks * 18 +
          blockedTasks * 20 +
          pendingHandoffs * 10 +
          blockedHandoffs * 12 +
          overdueAlerts * 8 +
          activeSessions * 5 +
          Math.max(0, ownedTasks.length - completedTasks) * 2,
      );
      const reliabilityScore = clamp(
        100 -
          blockedTasks * 18 -
          blockedHandoffs * 14 -
          overdueAlerts * 10 -
          pendingHandoffs * 4 -
          activeTasks * 2 +
          completedTasks * 5,
      );
      const focusSummary =
        blockedTasks > 0 || blockedHandoffs > 0
          ? `当前最需要处理阻塞与交接恢复。`
          : activeTasks > 0
            ? `当前有 ${activeTasks} 条活跃任务，适合保持连续推进。`
            : completedTasks > 0
              ? `近期执行相对稳定，可承担更多收尾或复盘任务。`
              : `当前负载较轻，适合作为补位或接管节点。`;

      return {
        agentId: employee.agentId,
        nickname: employee.nickname,
        role: employee.role,
        loadScore,
        loadState: resolveLoadState(loadScore),
        reliabilityScore,
        reliabilityState: resolveReliabilityState(reliabilityScore),
        activeTasks,
        blockedTasks,
        completedTasks,
        pendingHandoffs,
        blockedHandoffs,
        overdueAlerts,
        sessionCount: employeeSessions.length,
        activeSessions,
        latestActivityAt: Math.max(latestActivityAt, runtimeActivityAt),
        focusSummary,
      };
    })
    .sort((left, right) => {
      if (left.loadScore !== right.loadScore) {
        return right.loadScore - left.loadScore;
      }
      return left.reliabilityScore - right.reliabilityScore;
    });
}

export function buildOutcomeReport(params: {
  company: Company;
  employeeInsights: EmployeeOperationalInsight[];
  now?: number;
}): OutcomeReport {
  const now = params.now ?? Date.now();
  const alerts = evaluateSlaAlerts(params.company, now);
  const tasks = params.company.tasks ?? [];
  const handoffs = getActiveHandoffs(params.company.handoffs ?? []);

  const completedTasks = tasks.filter((task) => task.state === "completed").length;
  const blockedTasks = tasks.filter(
    (task) =>
      task.state === "manual_takeover_required" ||
      task.state === "blocked_timeout" ||
      task.state === "blocked_tool_failure",
  ).length;
  const waitingTasks = tasks.filter(
    (task) => task.state === "waiting_input" || task.state === "waiting_peer",
  ).length;
  const manualTakeovers = tasks.filter((task) => task.state === "manual_takeover_required").length;
  const completedHandoffs = handoffs.filter((handoff) => handoff.status === "completed").length;
  const blockedHandoffs = handoffs.filter((handoff) => handoff.status === "blocked").length;
  const pendingHandoffs = handoffs.filter((handoff) => handoff.status !== "completed").length;
  const criticalAlerts = alerts.filter((alert) => alert.level === "critical").length;
  const overloadedEmployees = params.employeeInsights.filter(
    (insight) => insight.loadState === "overloaded",
  ).length;
  const fragileEmployees = params.employeeInsights.filter(
    (insight) => insight.reliabilityState === "fragile",
  ).length;
  const avgLoadScore =
    params.employeeInsights.length > 0
      ? round(
          params.employeeInsights.reduce((sum, insight) => sum + insight.loadScore, 0) /
            params.employeeInsights.length,
        )
      : 0;
  const avgReliabilityScore =
    params.employeeInsights.length > 0
      ? round(
          params.employeeInsights.reduce((sum, insight) => sum + insight.reliabilityScore, 0) /
            params.employeeInsights.length,
        )
      : 0;

  return {
    totalTasks: tasks.length,
    completedTasks,
    blockedTasks,
    waitingTasks,
    manualTakeovers,
    completionRate: safeRate(completedTasks, tasks.length),
    blockedRate: safeRate(blockedTasks, tasks.length),
    waitingRate: safeRate(waitingTasks, tasks.length),
    totalHandoffs: handoffs.length,
    completedHandoffs,
    blockedHandoffs,
    pendingHandoffs,
    handoffCompletionRate: safeRate(completedHandoffs, handoffs.length),
    slaAlerts: alerts.length,
    criticalAlerts,
    overloadedEmployees,
    fragileEmployees,
    avgLoadScore,
    avgReliabilityScore,
  };
}

export function buildRetrospectiveSnapshot(params: {
  company: Company;
  outcome: OutcomeReport;
  employeeInsights: EmployeeOperationalInsight[];
}): RetrospectiveSnapshot {
  const { company, outcome, employeeInsights } = params;
  const topOverload = employeeInsights.slice(0, 2).filter((insight) => insight.loadScore >= 50);
  const fragileEmployees = employeeInsights.filter((insight) => insight.reliabilityState === "fragile");

  const wins: string[] = [];
  const risks: string[] = [];
  const actionItems: string[] = [];

  if (outcome.completionRate >= 60) {
    wins.push(`结构化任务完成率达到 ${outcome.completionRate}% ，说明任务对象开始稳定承载推进过程。`);
  }
  if (outcome.handoffCompletionRate >= 50) {
    wins.push(`交接闭环率达到 ${outcome.handoffCompletionRate}% ，多角色协作开始脱离纯聊天转述。`);
  }
  if (outcome.avgReliabilityScore >= 75) {
    wins.push(`团队平均可靠性 ${outcome.avgReliabilityScore} 分，当前组织的执行稳定性处于可运营区间。`);
  }

  if (outcome.blockedRate >= 25) {
    risks.push(`阻塞任务占比 ${outcome.blockedRate}% ，说明仍有较多工作在等待排障或人工接管。`);
  }
  if (outcome.manualTakeovers > 0) {
    risks.push(`本期仍有 ${outcome.manualTakeovers} 条任务进入人工接管，说明自动链路尚未完全自洽。`);
  }
  if (fragileEmployees.length > 0) {
    risks.push(
      `${fragileEmployees.map((item) => item.nickname).join("、")} 的可靠性评分偏低，容易成为流程单点。`,
    );
  }

  if (topOverload.length > 0) {
    actionItems.push(
      `优先给 ${topOverload.map((item) => item.nickname).join("、")} 减负或补位，避免继续堆积等待中的交接和告警。`,
    );
  }
  if (outcome.blockedHandoffs > 0 || outcome.pendingHandoffs > 0) {
    actionItems.push("把交接清单缺失项补成必填结构，减少手动提醒和丢交付物的情况。");
  }
  if ((company.knowledgeItems ?? []).length < 4) {
    actionItems.push("继续完善共享知识层，把设定、职责和流程约束从聊天沉淀成公司对象。");
  }
  if (outcome.slaAlerts > 0) {
    actionItems.push("针对高频 SLA 告警收紧超时升级规则，优先让 CEO 面板直接给出可执行动作。");
  }

  if (wins.length === 0) {
    wins.push("已经具备结构化任务、交接、SLA 和接管对象，为后续自动运营打下了产品基础。");
  }
  if (risks.length === 0) {
    risks.push("当前没有显著异常，但仍需防止知识和职责再次回退到分散聊天里。");
  }
  if (actionItems.length === 0) {
    actionItems.push("继续积累更多任务样本，再按真实数据收紧角色负载和自动化策略。");
  }

  return {
    periodLabel: "当前运营周期复盘",
    summary: `${company.name} 当前任务完成率 ${outcome.completionRate}% ，交接闭环率 ${outcome.handoffCompletionRate}% ，平均可靠性 ${outcome.avgReliabilityScore} 分。`,
    wins: wins.slice(0, 3),
    risks: risks.slice(0, 3),
    actionItems: actionItems.slice(0, 4),
  };
}
