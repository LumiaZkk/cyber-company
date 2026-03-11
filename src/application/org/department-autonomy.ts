import type { SupportRequestRecord } from "../../domain/delegation/types";
import type { WorkItemRecord } from "../../domain/mission/types";
import type { Company, Department, EmployeeRef } from "../../domain/org/types";
import { isSupportRequestActive } from "../../domain/delegation/support-request";

export type DepartmentKind = NonNullable<Department["kind"]>;

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveEmployee(
  company: Company | null | undefined,
  agentId: string | null | undefined,
): EmployeeRef | null {
  const normalized = normalizeOptionalString(agentId);
  if (!company || !normalized) {
    return null;
  }
  return company.employees.find((employee) => employee.agentId === normalized) ?? null;
}

export function resolveDepartment(
  company: Company | null | undefined,
  departmentId: string | null | undefined,
): Department | null {
  const normalized = normalizeOptionalString(departmentId);
  if (!company || !normalized) {
    return null;
  }
  return company.departments?.find((department) => department.id === normalized) ?? null;
}

export function inferDepartmentKind(
  company: Company | null | undefined,
  department: Department | null | undefined,
): DepartmentKind {
  if (department?.kind) {
    return department.kind;
  }
  const lead = resolveEmployee(company, department?.leadAgentId);
  if (!lead) {
    return "business";
  }
  if (lead.metaRole === "ceo") {
    return "meta";
  }
  if (lead.metaRole === "hr" || lead.metaRole === "cto" || lead.metaRole === "coo") {
    return "support";
  }
  return "business";
}

export function resolveDepartmentForActor(
  company: Company | null | undefined,
  actorId: string | null | undefined,
): Department | null {
  const employee = resolveEmployee(company, actorId);
  if (!employee?.departmentId) {
    return null;
  }
  return resolveDepartment(company, employee.departmentId);
}

export function resolveDepartmentManager(
  company: Company | null | undefined,
  departmentId: string | null | undefined,
): EmployeeRef | null {
  const department = resolveDepartment(company, departmentId);
  if (!department?.leadAgentId) {
    return null;
  }
  return resolveEmployee(company, department.leadAgentId);
}

export function isDepartmentManager(
  company: Company | null | undefined,
  actorId: string | null | undefined,
): boolean {
  const normalized = normalizeOptionalString(actorId);
  if (!company || !normalized) {
    return false;
  }
  return (company.departments ?? []).some((department) => department.leadAgentId === normalized);
}

export function resolveDepartmentsManagedByActor(
  company: Company | null | undefined,
  actorId: string | null | undefined,
): Department[] {
  const normalized = normalizeOptionalString(actorId);
  if (!company || !normalized) {
    return [];
  }
  return (company.departments ?? []).filter(
    (department) => !department.archived && department.leadAgentId === normalized,
  );
}

export function resolveDepartmentMembers(
  company: Company | null | undefined,
  departmentId: string | null | undefined,
): EmployeeRef[] {
  const normalized = normalizeOptionalString(departmentId);
  if (!company || !normalized) {
    return [];
  }
  return company.employees.filter((employee) => employee.departmentId === normalized);
}

export function resolveSupportDepartments(company: Company | null | undefined): Department[] {
  if (!company) {
    return [];
  }
  return (company.departments ?? []).filter(
    (department) => !department.archived && inferDepartmentKind(company, department) === "support",
  );
}

function resolveMetaEmployee(
  company: Company | null | undefined,
  metaRole: NonNullable<EmployeeRef["metaRole"]>,
): EmployeeRef | null {
  if (!company) {
    return null;
  }
  return company.employees.find((employee) => employee.metaRole === metaRole) ?? null;
}

type WorkDemandKind =
  | "content_business"
  | "software_delivery"
  | "technical_enablement"
  | "operations_optimization"
  | "organization_building"
  | "general";

function classifyWorkDemand(workItem: WorkItemRecord): WorkDemandKind {
  const text = [
    workItem.title,
    workItem.goal,
    workItem.summary,
    workItem.nextAction,
    workItem.stageLabel,
  ]
    .join(" ")
    .toLowerCase();

  if (/招聘|招人|组团队|补团队|编制|岗位|组织|部门/u.test(text)) {
    return "organization_building";
  }
  if (/运营|渠道|发布|排期|sop|增长|转化|风控|投放|数据分析/u.test(text)) {
    return "operations_optimization";
  }
  if (/内部工具|辅助工具|自动化|sdk|集成|部署|排障|基础设施|脚手架|发布流水线/u.test(text)) {
    return "technical_enablement";
  }
  if (/小说|文章|文案|设计稿|课程|脚本|创作|写作|封面|海报|话术|内容生产/u.test(text)) {
    return "content_business";
  }
  if (/软件|系统|网站|应用|平台|产品开发|功能开发|前端|后端|app|api|代码|程序/u.test(text)) {
    return "software_delivery";
  }
  return "general";
}

function findPreferredBusinessDepartment(
  company: Company,
  demand: WorkDemandKind,
): Department | null {
  const businessDepartments = (company.departments ?? []).filter(
    (department) => !department.archived && inferDepartmentKind(company, department) === "business",
  );
  if (businessDepartments.length === 0) {
    return null;
  }
  if (demand === "software_delivery") {
    return (
      businessDepartments.find((department) => /工程|研发|技术|产品/u.test(department.name)) ??
      null
    );
  }
  if (demand === "content_business") {
    return (
      businessDepartments.find((department) => /创作|内容|写作|设计|编辑|市场/u.test(department.name)) ??
      (businessDepartments.length === 1 ? businessDepartments[0] ?? null : null)
    );
  }
  return businessDepartments.length === 1 ? businessDepartments[0] ?? null : null;
}

function buildFallbackOwnedWorkItem(input: {
  workItem: WorkItemRecord;
  owner: EmployeeRef;
  nextAction: string;
  summaryPrefix: string;
}): WorkItemRecord {
  return {
    ...input.workItem,
    owningDepartmentId: input.owner.departmentId ?? input.workItem.owningDepartmentId ?? null,
    executionLevel: "department",
    ownerActorId: input.owner.agentId,
    ownerLabel: input.owner.nickname || input.owner.role || input.owner.agentId,
    batonActorId: input.workItem.batonActorId ?? input.owner.agentId,
    batonLabel:
      input.workItem.batonLabel ||
      input.owner.nickname ||
      input.owner.role ||
      input.owner.agentId,
    summary: input.workItem.summary.includes(input.summaryPrefix)
      ? input.workItem.summary
      : `${input.summaryPrefix}${input.workItem.summary ? `：${input.workItem.summary}` : ""}`,
    nextAction: input.nextAction,
  };
}

function resolveManagerLabel(employee: EmployeeRef | null, fallback: string | null | undefined): string {
  return employee?.nickname || employee?.role || normalizeOptionalString(fallback) || "部门负责人";
}

export function normalizeWorkItemDepartmentOwnership(input: {
  company: Company | null | undefined;
  workItem: WorkItemRecord;
}): WorkItemRecord {
  const { company, workItem } = input;
  if (!company) {
    return workItem;
  }

  const demand = classifyWorkDemand(workItem);
  const derivedEmployee =
    resolveEmployee(company, workItem.ownerActorId) ??
    resolveEmployee(company, workItem.batonActorId);
  const departmentCandidate =
    resolveDepartment(company, workItem.owningDepartmentId) ??
    resolveDepartment(company, derivedEmployee?.departmentId);
  const department =
    departmentCandidate &&
    (workItem.owningDepartmentId || inferDepartmentKind(company, departmentCandidate) !== "meta")
      ? departmentCandidate
      : null;
  if (!department) {
    const preferredBusinessDepartment = findPreferredBusinessDepartment(company, demand);
    if (preferredBusinessDepartment) {
      const businessManager = resolveDepartmentManager(company, preferredBusinessDepartment.id);
      if (businessManager) {
        return buildFallbackOwnedWorkItem({
          workItem,
          owner: businessManager,
          nextAction: workItem.nextAction,
          summaryPrefix: `当前主线归 ${businessManager.nickname} 负责部门收口`,
        });
      }
    }

    if (demand === "content_business" || demand === "organization_building") {
      const hr = resolveMetaEmployee(company, "hr");
      if (hr) {
        return buildFallbackOwnedWorkItem({
          workItem,
          owner: hr,
          nextAction: "先由 HR 组建业务团队、补业务负责人或补关键岗位，再进入执行。",
          summaryPrefix: "当前缺少明确业务承接团队，先进入 HR 组队路径",
        });
      }
    }

    if (demand === "software_delivery") {
      const cto = resolveMetaEmployee(company, "cto");
      if (cto) {
        return buildFallbackOwnedWorkItem({
          workItem,
          owner: cto,
          nextAction: "先由 CTO 暂代工程负责人给出最小技术主线，同时让 HR 补工程团队。",
          summaryPrefix: "当前没有工程业务部门，先由 CTO 暂代工程负责人",
        });
      }
    }

    if (demand === "technical_enablement") {
      const cto = resolveMetaEmployee(company, "cto");
      if (cto) {
        return buildFallbackOwnedWorkItem({
          workItem,
          owner: cto,
          nextAction: workItem.nextAction || "由 CTO 评估工具、系统和自动化方案。",
          summaryPrefix: "当前主线归 CTO 承接技术使能",
        });
      }
    }

    if (demand === "operations_optimization") {
      const coo = resolveMetaEmployee(company, "coo");
      if (coo) {
        return buildFallbackOwnedWorkItem({
          workItem,
          owner: coo,
          nextAction: workItem.nextAction || "由 COO 收敛流程、渠道和运营方案。",
          summaryPrefix: "当前主线归 COO 承接运营优化",
        });
      }
    }

    return {
      ...workItem,
      executionLevel:
        workItem.executionLevel ??
        (resolveEmployee(company, workItem.ownerActorId)?.metaRole === "ceo" ? "company" : "individual"),
    };
  }

  const manager = resolveDepartmentManager(company, department.id);
  if (!manager) {
    return {
      ...workItem,
      owningDepartmentId: workItem.owningDepartmentId ?? department.id,
      executionLevel: workItem.executionLevel ?? "department",
    };
  }

  const originalOwnerActorId = normalizeOptionalString(workItem.ownerActorId);
  const originalOwnerLabel = normalizeOptionalString(workItem.ownerLabel);
  const executionLevel = workItem.executionLevel ?? "department";

  if (executionLevel === "individual") {
    return {
      ...workItem,
      owningDepartmentId: workItem.owningDepartmentId ?? department.id,
      executionLevel,
    };
  }

  const shouldPromoteToManager =
    !originalOwnerActorId ||
    originalOwnerActorId === manager.agentId ||
    derivedEmployee?.departmentId === department.id ||
    workItem.owningDepartmentId === department.id;

  const nextOwnerActorId = shouldPromoteToManager ? manager.agentId : workItem.ownerActorId ?? null;
  const nextOwnerLabel = shouldPromoteToManager
    ? resolveManagerLabel(manager, workItem.ownerLabel)
    : workItem.ownerLabel;
  const nextBatonActorId =
    workItem.batonActorId ??
    (shouldPromoteToManager && originalOwnerActorId && originalOwnerActorId !== manager.agentId
      ? originalOwnerActorId
      : null);
  const nextBatonLabel =
    workItem.batonLabel ||
    (shouldPromoteToManager && originalOwnerActorId && originalOwnerActorId !== manager.agentId
      ? originalOwnerLabel ?? resolveManagerLabel(derivedEmployee ?? null, originalOwnerActorId)
      : nextOwnerLabel);

  return {
    ...workItem,
    owningDepartmentId: workItem.owningDepartmentId ?? department.id,
    executionLevel,
    ownerActorId: nextOwnerActorId,
    ownerLabel: nextOwnerLabel,
    batonActorId: nextBatonActorId,
    batonLabel: nextBatonLabel,
  };
}

export function resolveDefaultDepartmentDispatchTarget(input: {
  company: Company | null | undefined;
  fromActorId: string | null | undefined;
  preferredTargetAgentId: string | null | undefined;
  explicitOverride?: boolean;
}): { agentId: string; label: string } | null {
  const targetAgentId = normalizeOptionalString(input.preferredTargetAgentId);
  if (!input.company || !targetAgentId) {
    return null;
  }

  const target = resolveEmployee(input.company, targetAgentId);
  if (!target) {
    return null;
  }
  if (input.explicitOverride) {
    return {
      agentId: target.agentId,
      label: target.nickname || target.role || target.agentId,
    };
  }

  const sender = resolveEmployee(input.company, input.fromActorId);
  const targetDepartment = resolveDepartment(input.company, target.departmentId);
  const targetManager = resolveDepartmentManager(input.company, targetDepartment?.id);

  if (!targetDepartment || !targetManager || targetManager.agentId === target.agentId) {
    return {
      agentId: target.agentId,
      label: target.nickname || target.role || target.agentId,
    };
  }

  if (sender?.metaRole === "ceo") {
    return {
      agentId: targetManager.agentId,
      label: targetManager.nickname || targetManager.role || targetManager.agentId,
    };
  }

  const senderManagedDepartments = resolveDepartmentsManagedByActor(input.company, sender?.agentId);
  const senderDepartmentId = sender?.departmentId ?? null;
  const senderLeadsTargetDepartment = senderManagedDepartments.some(
    (department) => department.id === targetDepartment.id,
  );

  if (senderLeadsTargetDepartment) {
    return {
      agentId: target.agentId,
      label: target.nickname || target.role || target.agentId,
    };
  }

  if (senderDepartmentId && senderDepartmentId === targetDepartment.id && sender?.agentId === targetManager.agentId) {
    return {
      agentId: target.agentId,
      label: target.nickname || target.role || target.agentId,
    };
  }

  return {
    agentId: targetManager.agentId,
    label: targetManager.nickname || targetManager.role || targetManager.agentId,
  };
}

export function buildDepartmentOpenWorkItems(input: {
  company: Company;
  departmentId: string;
  managerAgentId: string;
  workItems?: WorkItemRecord[];
}): WorkItemRecord[] {
  const memberIds = new Set(
    resolveDepartmentMembers(input.company, input.departmentId).map((employee) => employee.agentId),
  );
  return (input.workItems ?? [])
    .filter((workItem) => {
      if (workItem.status === "completed" || workItem.status === "archived") {
        return false;
      }
      if (workItem.owningDepartmentId === input.departmentId) {
        return true;
      }
      if (workItem.ownerActorId === input.managerAgentId) {
        return true;
      }
      if (workItem.batonActorId && memberIds.has(workItem.batonActorId)) {
        return true;
      }
      return workItem.steps.some(
        (step) => Boolean(step.assigneeActorId && memberIds.has(step.assigneeActorId)),
      );
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function buildDepartmentOpenSupportRequests(input: {
  company: Company;
  departmentId: string;
}): SupportRequestRecord[] {
  return (input.company.supportRequests ?? [])
    .filter(
      (request) =>
        isSupportRequestActive(request) &&
        (request.requesterDepartmentId === input.departmentId ||
          request.targetDepartmentId === input.departmentId),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);
}
