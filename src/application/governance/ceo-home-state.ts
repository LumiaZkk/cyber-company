import {
  mapAgentRuntimeAvailabilityToLegacyStatus,
  type CanonicalAgentStatusRecord,
  type AgentSessionRecord,
  type AgentRuntimeRecord,
} from "../agent-runtime";
import {
  buildEmployeeOperationalInsights,
  buildOutcomeReport,
  buildRetrospectiveSnapshot,
  type EmployeeOperationalInsight,
  type OutcomeReport,
  type RetrospectiveSnapshot,
} from "./company-insights";
import { buildCeoControlSurface, type CeoControlSurfaceSnapshot } from "./ceo-control-surface";
import { buildOrgAdvisorSnapshot } from "../assignment/org-fit";
import { getActiveHandoffs } from "../delegation/active-handoffs";
import { resolveCompanyKnowledge } from "../artifact/shared-knowledge";
import type { OrgAdvisorSnapshot } from "../assignment/org-fit";
import type { ChatMessage, GatewaySessionRow } from "../gateway";
import type {
  Company,
  RequirementRoomRecord,
  RoomConversationBindingRecord,
  WorkItemRecord,
  SupportRequestRecord,
  EscalationRecord,
  DecisionTicketRecord,
} from "../../infrastructure/company/runtime/types";
import { resolveConversationPresentation, resolveSessionPresentation } from "../../lib/chat-routes";
import {
  isSessionActive,
  resolveSessionActorId,
  resolveSessionTitle,
  resolveSessionUpdatedAt,
} from "../../lib/sessions";
import { formatTime } from "../../lib/utils";
import { inferDepartmentKind, resolveDepartmentMembers } from "../org/department-autonomy";

export type ManagerStatusCard = {
  agentId: string;
  label: string;
  role: string;
  departmentName: string;
  departmentKind: "meta" | "support" | "business";
  state: "running" | "idle" | "no_signal" | "offline";
  subtitle: string;
};

export type CeoActivityItem = {
  id: string;
  title: string;
  summary: string;
  ts: number;
  href: string;
};

export type CeoHomeSnapshot = {
  ceoSurface: CeoControlSurfaceSnapshot;
  orgAdvisor: OrgAdvisorSnapshot;
  companySessions: Array<GatewaySessionRow & { agentId: string }>;
  employeeInsights: EmployeeOperationalInsight[];
  outcomeReport: OutcomeReport;
  retrospective: RetrospectiveSnapshot;
  ceoMemo: string;
  managerCards: ManagerStatusCard[];
  activityItems: CeoActivityItem[];
};

function extractText(message: ChatMessage | undefined): string {
  if (!message) {
    return "";
  }
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim()) {
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

export function buildCeoHomeSnapshot(params: {
  company: Company;
  sessions: GatewaySessionRow[];
  ceoHistory: ChatMessage[];
  currentTime: number;
  activeAgentSessions?: AgentSessionRecord[];
  activeAgentRuntime?: AgentRuntimeRecord[];
  activeAgentStatuses?: CanonicalAgentStatusRecord[];
  activeRoomRecords: RequirementRoomRecord[];
  activeRoomBindings: RoomConversationBindingRecord[];
  activeWorkItems: WorkItemRecord[];
  activeSupportRequests: SupportRequestRecord[];
  activeEscalations: EscalationRecord[];
  activeDecisionTickets: DecisionTicketRecord[];
}): CeoHomeSnapshot {
  const {
    company,
    sessions,
    ceoHistory,
    currentTime,
    activeAgentSessions = [],
    activeAgentRuntime = [],
    activeAgentStatuses = [],
    activeRoomRecords,
    activeRoomBindings,
    activeWorkItems,
    activeSupportRequests,
    activeEscalations,
    activeDecisionTickets,
  } = params;
  const companyEmployees = company.employees;
  const companyAgentIds = new Set(companyEmployees.map((employee) => employee.agentId));
  const companySessions = sessions
    .map((session) => ({ ...session, agentId: resolveSessionActorId(session) }))
    .filter((session): session is GatewaySessionRow & { agentId: string } => {
      return typeof session.agentId === "string" && companyAgentIds.has(session.agentId);
    })
    .sort((left, right) => resolveSessionUpdatedAt(right) - resolveSessionUpdatedAt(left));
  const runtimeByAgentId = new Map(activeAgentRuntime.map((runtime) => [runtime.agentId, runtime] as const));
  const canonicalStatusByAgentId = new Map(
    activeAgentStatuses.map((status) => [status.agentId, status] as const),
  );
  const sessionRuntimeByKey = new Map(
    activeAgentSessions.map((session) => [session.sessionKey, session] as const),
  );

  const knowledgeItems = resolveCompanyKnowledge(company);
  const activeHandoffs = getActiveHandoffs(company.handoffs ?? []);
  const companyWithKnowledge = { ...company, knowledgeItems };
  const employeeInsights = buildEmployeeOperationalInsights({
    company: companyWithKnowledge,
    sessions: companySessions,
    activeAgentRuntime,
    now: currentTime,
  });
  const outcomeReport = buildOutcomeReport({
    company: companyWithKnowledge,
    employeeInsights,
    now: currentTime,
  });
  const retrospective = buildRetrospectiveSnapshot({
    company: companyWithKnowledge,
    outcome: outcomeReport,
    employeeInsights,
  });

  const lastAssistantMessage = [...ceoHistory]
    .reverse()
    .find((message) => message.role === "assistant");
  const ceoMemo =
    extractText(lastAssistantMessage).split("\n").find((line) => line.trim().length > 0) ??
    retrospective.summary;

  const managerCards: ManagerStatusCard[] = (company.departments ?? [])
    .filter((department) => !department.archived)
    .map((department) => {
      const employee = companyEmployees.find((candidate) => candidate.agentId === department.leadAgentId);
      if (!employee || employee.metaRole === "ceo") {
        return null;
      }
      const latestSession = companySessions.find((session) => session.agentId === employee.agentId);
      const runtime = runtimeByAgentId.get(employee.agentId) ?? null;
      const canonicalStatus = canonicalStatusByAgentId.get(employee.agentId) ?? null;
      const sessionRuntime = latestSession ? sessionRuntimeByKey.get(latestSession.key) ?? null : null;
      const legacyState = canonicalStatus
        ? canonicalStatus.runtimeState === "busy"
          ? "running"
          : canonicalStatus.runtimeState === "offline"
            ? "offline"
            : canonicalStatus.runtimeState === "no_signal"
              ? "no_signal"
              : "idle"
        : runtime
          ? mapAgentRuntimeAvailabilityToLegacyStatus(runtime.availability)
          : null;
      const state: ManagerStatusCard["state"] = sessionRuntime
        ? sessionRuntime.sessionState === "running" || sessionRuntime.sessionState === "streaming"
          ? "running"
          : sessionRuntime.sessionState === "offline"
            ? "offline"
            : "idle"
        : legacyState === "running"
          ? "running"
          : legacyState === "idle"
            ? "idle"
            : legacyState === "no_signal"
              ? "no_signal"
              : runtime
              ? "offline"
              : latestSession
                ? isSessionActive(latestSession, currentTime)
                  ? "running"
                  : "idle"
                : "offline";
      const memberCount = resolveDepartmentMembers(company, department.id).length;
      return {
        agentId: employee.agentId,
        label: employee.nickname,
        role: employee.role,
        departmentName: department.name,
        departmentKind: inferDepartmentKind(company, department),
        state,
        subtitle: latestSession
          ? canonicalStatus?.reason ?? `${resolveSessionTitle(latestSession)} · ${formatTime(resolveSessionUpdatedAt(latestSession))}`
          : canonicalStatus?.reason ?? `${memberCount} 名成员，当前待命`,
      };
    })
    .filter((card): card is ManagerStatusCard => Boolean(card));

  const activityItems = [
    ...companySessions.slice(0, 5).map((session) => ({
      id: session.key,
      title: resolveSessionPresentation({
        session,
        rooms: activeRoomRecords,
        bindings: activeRoomBindings,
        employees: companyEmployees,
      }).title,
      summary: session.lastMessagePreview ?? "最近一次会话更新",
      ts: resolveSessionUpdatedAt(session),
      href: resolveSessionPresentation({
        session,
        rooms: activeRoomRecords,
        bindings: activeRoomBindings,
        employees: companyEmployees,
      }).route,
    })),
    ...activeHandoffs.slice(-3).map((handoff) => ({
      id: handoff.id,
      title: `交接: ${handoff.title}`,
      summary: handoff.summary,
      ts: handoff.updatedAt,
      href:
        resolveConversationPresentation({
          sessionKey: handoff.sessionKey,
          actorId:
            activeWorkItems.find((item) => item.id === handoff.taskId)?.ownerActorId ??
            handoff.fromAgentId ??
            handoff.toAgentIds[0] ??
            null,
          rooms: activeRoomRecords,
          bindings: activeRoomBindings,
          employees: companyEmployees,
        }).route,
    })),
  ]
    .sort((left, right) => right.ts - left.ts)
    .slice(0, 3);

  return {
    ceoSurface: buildCeoControlSurface({
      company,
      activeSupportRequests,
      activeEscalations,
      activeDecisionTickets,
    }),
    orgAdvisor: buildOrgAdvisorSnapshot(company),
    companySessions,
    employeeInsights,
    outcomeReport,
    retrospective,
    ceoMemo,
    managerCards,
    activityItems,
  };
}
