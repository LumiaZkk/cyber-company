import type { Company } from "../company/types";
import { getActiveHandoffs } from "../handoffs/active-handoffs";
import { getActiveRequests } from "../requests/request-health";
import { evaluateSlaAlerts } from "../sla/escalation-rules";

export type CeoActionItem = {
  id: string;
  title: string;
  summary: string;
  actionLabel: string;
  href: string;
  tone: "amber" | "rose" | "violet" | "blue";
};

export type CeoControlSurfaceSnapshot = {
  activeBlockers: number;
  pendingHandoffs: number;
  openRequests: number;
  blockedRequests: number;
  overdueItems: number;
  manualTakeovers: number;
  topActions: CeoActionItem[];
};

export function buildCeoControlSurface(company: Company): CeoControlSurfaceSnapshot {
  const tasks = company.tasks ?? [];
  const handoffs = getActiveHandoffs(company.handoffs ?? []);
  const requests = getActiveRequests(company.requests ?? []);
  const alerts = evaluateSlaAlerts(company);

  const activeBlockers = tasks.filter(
    (task) =>
      task.state === "blocked_timeout" ||
      task.state === "blocked_tool_failure" ||
      task.state === "manual_takeover_required",
  ).length;
  const pendingHandoffs = handoffs.filter((handoff) => handoff.status !== "completed").length;
  const openRequests = requests.length;
  const blockedRequests = requests.filter((request) => request.status === "blocked").length;
  const overdueItems = alerts.length;
  const manualTakeovers = tasks.filter((task) => task.state === "manual_takeover_required").length;

  const alertActions: CeoActionItem[] = alerts.slice(0, 3).map((alert) => ({
      id: `alert:${alert.id}`,
      title: alert.title,
      summary: alert.summary,
      actionLabel: alert.sessionKey ? "打开会话" : "查看看板",
      href: alert.sessionKey ? `/chat/${encodeURIComponent(alert.sessionKey)}` : "/board",
      tone: alert.level === "critical" ? ("rose" as const) : ("amber" as const),
    }));
  const handoffActions: CeoActionItem[] = handoffs
      .filter((handoff) => handoff.status !== "completed")
      .slice(0, 2)
      .map((handoff) => ({
        id: `handoff:${handoff.id}`,
        title: `待处理交接: ${handoff.title}`,
        summary: handoff.summary,
        actionLabel: "查看会话",
        href: `/chat/${encodeURIComponent(handoff.sessionKey)}`,
        tone: handoff.status === "blocked" ? ("rose" as const) : ("violet" as const),
      }));
  const requestActions: CeoActionItem[] = requests
    .filter((request) => request.status === "blocked" || request.status === "pending")
    .slice(0, 2)
    .map((request) => ({
      id: `request:${request.id}`,
      title: `${request.status === "blocked" ? "请求阻塞" : "待答请求"}: ${request.title}`,
      summary: request.responseSummary ?? request.summary,
      actionLabel: "打开会话",
      href: `/chat/${encodeURIComponent(request.sessionKey)}`,
      tone: request.status === "blocked" ? ("rose" as const) : ("blue" as const),
    }));
  const topActions: CeoActionItem[] = [...alertActions, ...requestActions, ...handoffActions].slice(0, 5);

  return {
    activeBlockers,
    pendingHandoffs,
    openRequests,
    blockedRequests,
    overdueItems,
    manualTakeovers,
    topActions,
  };
}
