import type { Company } from "../../domain";
import { isSupportRequestActive } from "../../domain/delegation/support-request";
import type {
  DecisionTicketRecord,
  EscalationRecord,
  SupportRequestRecord,
} from "../../domain/delegation/types";
import { getActiveHandoffs } from "../delegation/active-handoffs";
import { getActiveRequests } from "../delegation/request-health";
import { evaluateSlaAlerts } from "./sla-rules";

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
  openEscalations: number;
  pendingHumanDecisions: number;
  pendingApprovals: number;
  topActions: CeoActionItem[];
};

export function buildCeoControlSurface(input: {
  company: Company;
  activeSupportRequests?: SupportRequestRecord[];
  activeEscalations?: EscalationRecord[];
  activeDecisionTickets?: DecisionTicketRecord[];
}): CeoControlSurfaceSnapshot {
  const { company } = input;
  const tasks = company.tasks ?? [];
  const handoffs = getActiveHandoffs(company.handoffs ?? []);
  const requests = getActiveRequests(company.requests ?? []);
  const supportRequests = (input.activeSupportRequests ?? company.supportRequests ?? []).filter(
    isSupportRequestActive,
  );
  const pendingApprovals = (company.approvals ?? []).filter((approval) => approval.status === "pending").length;
  const escalations = (input.activeEscalations ?? company.escalations ?? []).filter(
    (item) => item.status === "open" || item.status === "acknowledged",
  );
  const decisionTickets = (input.activeDecisionTickets ?? company.decisionTickets ?? []).filter(
    (item) => item.status === "open" || item.status === "pending_human",
  );
  const alerts = evaluateSlaAlerts(company);

  const activeBlockers = tasks.filter(
    (task) =>
      task.state === "blocked_timeout"
      || task.state === "blocked_tool_failure"
      || task.state === "manual_takeover_required",
  ).length + escalations.length;
  const pendingHandoffs = handoffs.filter((handoff) => handoff.status !== "completed").length;
  const openRequests = requests.length + supportRequests.length;
  const blockedRequests =
    requests.filter((request) => request.status === "blocked").length
    + supportRequests.filter((request) => request.status === "blocked").length;
  const overdueItems = alerts.length + supportRequests.filter((request) => (request.slaDueAt ?? Number.MAX_SAFE_INTEGER) <= Date.now()).length;
  const manualTakeovers = tasks.filter((task) => task.state === "manual_takeover_required").length;

  const escalationActions: CeoActionItem[] = escalations.slice(0, 3).map((escalation) => ({
    id: `escalation:${escalation.id}`,
    title: escalation.reason,
    summary: `${escalation.sourceType} -> ${escalation.targetActorId}`,
    actionLabel: "查看 CEO 决策",
    href: "/",
    tone: escalation.severity === "critical" ? "rose" : "amber",
  }));
  const decisionActions: CeoActionItem[] = decisionTickets.slice(0, 2).map((ticket) => ({
    id: `decision:${ticket.id}`,
    title: `待${ticket.requiresHuman ? "人类" : "CEO"}决策: ${ticket.summary}`,
    summary: ticket.options.map((option) => option.label).join(" / "),
    actionLabel: ticket.requiresHuman ? "查看决策票据" : "查看 CEO 决策",
    href: "/ops",
    tone: ticket.requiresHuman ? "violet" : "blue",
  }));
  const supportRequestActions: CeoActionItem[] = supportRequests
    .filter((request) => request.status === "blocked" || (request.slaDueAt ?? Number.MAX_SAFE_INTEGER) <= Date.now())
    .slice(0, 2)
    .map((request) => ({
      id: `support-request:${request.id}`,
      title: `支持请求待升级: ${request.summary}`,
      summary: `${request.requesterDepartmentId} -> ${request.targetDepartmentId}`,
      actionLabel: "查看运营大厅",
      href: "/ops",
      tone: request.status === "blocked" ? "rose" : "blue",
    }));
  const topActions: CeoActionItem[] = [...decisionActions, ...escalationActions, ...supportRequestActions].slice(0, 5);

  return {
    activeBlockers,
    pendingHandoffs,
    openRequests,
    blockedRequests,
    overdueItems,
    manualTakeovers,
    openEscalations: escalations.length,
    pendingHumanDecisions: decisionTickets.filter((item) => item.requiresHuman).length,
    pendingApprovals,
    topActions,
  };
}
