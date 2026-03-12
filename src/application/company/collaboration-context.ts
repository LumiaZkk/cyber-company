import { buildDefaultOrgSettings } from "../../domain/org/autonomy-policy";
import type { Company, EmployeeRef } from "../../domain/org/types";
import {
  inferDepartmentKind,
  isDepartmentManager,
  resolveDepartment,
  resolveDepartmentManager,
  resolveDepartmentMembers,
  resolveEmployee,
  resolveSupportDepartments,
} from "../org/department-autonomy";

export const COLLABORATION_CONTEXT_FILE_NAME = "collaboration-context.json";
export const COLLABORATION_SCOPE_VERSION = 1;

type CollaborationReason =
  | "global_dispatch"
  | "department_peer"
  | "department_manager"
  | "support_lead"
  | "ceo"
  | "explicit_edge"
  | "report_chain"
  | "escalation";

export type CollaborationActorSnapshot = {
  agentId: string;
  nickname: string;
  role: string;
  metaRole: "ceo" | "hr" | "cto" | "coo" | null;
  isMeta: boolean;
  isDepartmentManager: boolean;
  departmentId: string | null;
  departmentName: string | null;
  departmentKind: "meta" | "support" | "business" | null;
};

export type CollaborationTargetSnapshot = CollaborationActorSnapshot & {
  reason: CollaborationReason;
};

export type CollaborationContextSnapshot = {
  company: {
    id: string;
    name?: string;
  };
  scopeVersion: number;
  generatedAt: number;
  self: CollaborationActorSnapshot;
  manager: CollaborationActorSnapshot | null;
  allowedDispatchTargets: CollaborationTargetSnapshot[];
  defaultReportChain: CollaborationActorSnapshot[];
  supportTargets: CollaborationTargetSnapshot[];
  escalationTargets: CollaborationTargetSnapshot[];
};

function buildActorSnapshot(
  company: Company,
  employee: EmployeeRef,
): CollaborationActorSnapshot {
  const department = resolveDepartment(company, employee.departmentId);
  return {
    agentId: employee.agentId,
    nickname: employee.nickname,
    role: employee.role,
    metaRole: employee.metaRole ?? null,
    isMeta: employee.isMeta,
    isDepartmentManager: isDepartmentManager(company, employee.agentId),
    departmentId: department?.id ?? employee.departmentId ?? null,
    departmentName: department?.name ?? null,
    departmentKind: department ? inferDepartmentKind(company, department) : null,
  };
}

function sortTargets(left: CollaborationTargetSnapshot, right: CollaborationTargetSnapshot) {
  return left.agentId.localeCompare(right.agentId, "en");
}

function pushUniqueTarget(
  next: Map<string, CollaborationTargetSnapshot>,
  company: Company,
  employee: EmployeeRef | null,
  reason: CollaborationReason,
  selfAgentId: string,
) {
  if (!employee || employee.agentId === selfAgentId || next.has(employee.agentId)) {
    return;
  }
  next.set(employee.agentId, {
    ...buildActorSnapshot(company, employee),
    reason,
  });
}

function buildDefaultReportChain(
  company: Company,
  employee: EmployeeRef,
): CollaborationActorSnapshot[] {
  const chain: CollaborationActorSnapshot[] = [];
  const visited = new Set<string>([employee.agentId]);
  let cursor = resolveEmployee(company, employee.reportsTo);
  while (cursor && !visited.has(cursor.agentId)) {
    visited.add(cursor.agentId);
    chain.push(buildActorSnapshot(company, cursor));
    cursor = resolveEmployee(company, cursor.reportsTo);
  }
  return chain;
}

function resolveExplicitEdgeTargets(
  company: Company,
  employee: EmployeeRef,
) {
  const orgSettings = buildDefaultOrgSettings(company.orgSettings);
  const policy = orgSettings.collaborationPolicy;
  const next = new Map<string, CollaborationTargetSnapshot>();

  for (const edge of policy?.explicitEdges ?? []) {
    const fromAgentMatch = edge.fromAgentId && edge.fromAgentId === employee.agentId;
    const fromDepartmentMatch =
      edge.fromDepartmentId &&
      employee.departmentId &&
      edge.fromDepartmentId === employee.departmentId;
    if (!fromAgentMatch && !fromDepartmentMatch) {
      continue;
    }
    pushUniqueTarget(
      next,
      company,
      resolveEmployee(company, edge.toAgentId),
      "explicit_edge",
      employee.agentId,
    );
    if (edge.toDepartmentId) {
      for (const member of resolveDepartmentMembers(company, edge.toDepartmentId)) {
        pushUniqueTarget(next, company, member, "explicit_edge", employee.agentId);
      }
    }
  }

  return [...next.values()].sort(sortTargets);
}

function resolveSupportTargets(
  company: Company,
  employee: EmployeeRef,
): CollaborationTargetSnapshot[] {
  const next = new Map<string, CollaborationTargetSnapshot>();
  for (const department of resolveSupportDepartments(company)) {
    pushUniqueTarget(
      next,
      company,
      resolveEmployee(company, department.leadAgentId),
      "support_lead",
      employee.agentId,
    );
  }
  return [...next.values()].sort(sortTargets);
}

function resolveAllowedDispatchTargets(
  company: Company,
  employee: EmployeeRef,
): CollaborationTargetSnapshot[] {
  const orgSettings = buildDefaultOrgSettings(company.orgSettings);
  const policy = orgSettings.collaborationPolicy;
  const next = new Map<string, CollaborationTargetSnapshot>();
  const isGlobalRole = Boolean(
    employee.metaRole &&
      policy?.globalDispatchMetaRoles?.includes(employee.metaRole),
  );

  if (isGlobalRole) {
    for (const candidate of company.employees) {
      pushUniqueTarget(next, company, candidate, "global_dispatch", employee.agentId);
    }
  } else if (isDepartmentManager(company, employee.agentId)) {
    if (policy?.allowDepartmentLeadToDispatchWithinDepartment && employee.departmentId) {
      for (const member of resolveDepartmentMembers(company, employee.departmentId)) {
        pushUniqueTarget(next, company, member, "department_peer", employee.agentId);
      }
    }
    if (policy?.allowDepartmentLeadToDispatchToSupportLeads) {
      for (const target of resolveSupportTargets(company, employee)) {
        next.set(target.agentId, target);
      }
    }
    if (policy?.allowDepartmentLeadToDispatchToCeo) {
      const ceo = company.employees.find((candidate) => candidate.metaRole === "ceo") ?? null;
      pushUniqueTarget(next, company, ceo, "ceo", employee.agentId);
    }
  } else {
    if (policy?.allowDepartmentMembersWithinDepartment && employee.departmentId) {
      for (const member of resolveDepartmentMembers(company, employee.departmentId)) {
        pushUniqueTarget(next, company, member, "department_peer", employee.agentId);
      }
    }
    if (policy?.allowDepartmentMembersToManager && employee.departmentId) {
      pushUniqueTarget(
        next,
        company,
        resolveDepartmentManager(company, employee.departmentId),
        "department_manager",
        employee.agentId,
      );
    }
  }

  for (const target of resolveExplicitEdgeTargets(company, employee)) {
    if (!next.has(target.agentId)) {
      next.set(target.agentId, target);
    }
  }

  return [...next.values()].sort(sortTargets);
}

function resolveEscalationTargets(
  company: Company,
  employee: EmployeeRef,
): CollaborationTargetSnapshot[] {
  const next = new Map<string, CollaborationTargetSnapshot>();
  pushUniqueTarget(next, company, resolveEmployee(company, employee.reportsTo), "escalation", employee.agentId);
  const ceo = company.employees.find((candidate) => candidate.metaRole === "ceo") ?? null;
  pushUniqueTarget(next, company, ceo, "escalation", employee.agentId);
  return [...next.values()].sort(sortTargets);
}

export function buildCollaborationContextSnapshot(input: {
  company: Company;
  agentId: string;
}): CollaborationContextSnapshot {
  const employee = resolveEmployee(input.company, input.agentId);
  if (!employee) {
    throw new Error(`Unknown employee: ${input.agentId}`);
  }

  const manager = resolveEmployee(input.company, employee.reportsTo);
  return {
    company: {
      id: input.company.id,
      name: input.company.name,
    },
    scopeVersion: COLLABORATION_SCOPE_VERSION,
    generatedAt: Date.now(),
    self: buildActorSnapshot(input.company, employee),
    manager: manager ? buildActorSnapshot(input.company, manager) : null,
    allowedDispatchTargets: resolveAllowedDispatchTargets(input.company, employee),
    defaultReportChain: buildDefaultReportChain(input.company, employee),
    supportTargets: resolveSupportTargets(input.company, employee),
    escalationTargets: resolveEscalationTargets(input.company, employee),
  };
}
