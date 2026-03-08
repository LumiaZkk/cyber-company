import type { Company, Department, EmployeeRef } from "../features/company/types";

export function resolveCeoAgentId(employees: EmployeeRef[]): string | null {
  const ceo = employees.find((employee) => employee.metaRole === "ceo");
  return ceo?.agentId ?? null;
}

function isValidManagerId(managerId: unknown, employeesById: Map<string, EmployeeRef>): managerId is string {
  return typeof managerId === "string" && managerId.trim().length > 0 && employeesById.has(managerId);
}

type MetaRole = NonNullable<EmployeeRef["metaRole"]>;

const META_DEPARTMENT_SPECS: Array<{
  metaRole: MetaRole;
  name: string;
  color: string;
  order: number;
}> = [
  { metaRole: "ceo", name: "管理中枢", color: "slate", order: 0 },
  { metaRole: "hr", name: "人力资源部", color: "rose", order: 1 },
  { metaRole: "cto", name: "技术部", color: "indigo", order: 2 },
  { metaRole: "coo", name: "运营部", color: "emerald", order: 3 },
];

function ensureMetaDepartments(params: {
  nextDepartments: Department[];
  employees: EmployeeRef[];
  employeesById: Map<string, EmployeeRef>;
  warnings: string[];
}): Department[] {
  const departments = params.nextDepartments.map((dept) => ({ ...dept }));
  const ids = new Set(departments.map((dept) => dept.id));
  const deptByLead = new Map(departments.map((dept) => [dept.leadAgentId, dept] as const));

  for (const spec of META_DEPARTMENT_SPECS) {
    const lead = params.employees.find((employee) => employee.metaRole === spec.metaRole);
    if (!lead) {
      continue;
    }

    const existing = deptByLead.get(lead.agentId);
    if (existing) {
      if (lead.departmentId !== existing.id) {
        lead.departmentId = existing.id;
      }
      continue;
    }

    const baseId = `dep-meta-${spec.metaRole}`;
    let id = baseId;
    for (let index = 2; ids.has(id); index += 1) {
      id = `${baseId}-${index}`;
    }

    const created: Department = {
      id,
      name: spec.name,
      leadAgentId: lead.agentId,
      color: spec.color,
      order: spec.order,
      archived: false,
    };
    departments.push(created);
    ids.add(id);
    deptByLead.set(lead.agentId, created);
    lead.departmentId = created.id;
  }

  const leadIds = new Set(departments.map((dept) => dept.leadAgentId));
  for (const dept of departments) {
    if (dept.archived) {
      continue;
    }
    if (typeof dept.leadAgentId !== "string" || dept.leadAgentId.trim().length === 0) {
      params.warnings.push(`部门「${dept.name}」缺少负责人`);
      continue;
    }
    if (!params.employeesById.has(dept.leadAgentId)) {
      params.warnings.push(`部门「${dept.name}」负责人不存在：${dept.leadAgentId}`);
    }
  }

  if (leadIds.size !== departments.length) {
    params.warnings.push("检测到重复的部门负责人（leadAgentId），建议在部门管理中修正。");
  }

  return departments;
}

function wouldCreateCycle(params: {
  employeesById: Map<string, EmployeeRef>;
  employeeId: string;
  managerId: string;
}): boolean {
  const visited = new Set<string>([params.employeeId]);
  let cursor: string | undefined = params.managerId;
  for (let i = 0; i < params.employeesById.size + 2; i += 1) {
    if (!cursor) {
      return false;
    }
    if (visited.has(cursor)) {
      return true;
    }
    visited.add(cursor);
    const next: unknown = params.employeesById.get(cursor)?.reportsTo;
    if (!isValidManagerId(next, params.employeesById)) {
      return false;
    }
    cursor = next;
  }
  return true;
}

export type OrgIssue = {
  agentId: string;
  reason: "missing_manager" | "invalid_manager" | "self_manager" | "cycle";
};

export function resolveOrgIssues(params: {
  employees: EmployeeRef[];
}): OrgIssue[] {
  const employeesById = new Map(params.employees.map((employee) => [employee.agentId, employee]));
  const out: OrgIssue[] = [];

  for (const employee of params.employees) {
    if (employee.metaRole === "ceo") {
      continue;
    }

    const managerId = employee.reportsTo;
    if (managerId === undefined || managerId === null || String(managerId).trim().length === 0) {
      out.push({ agentId: employee.agentId, reason: "missing_manager" });
      continue;
    }

    if (managerId === employee.agentId) {
      out.push({ agentId: employee.agentId, reason: "self_manager" });
      continue;
    }

    if (!isValidManagerId(managerId, employeesById)) {
      out.push({ agentId: employee.agentId, reason: "invalid_manager" });
      continue;
    }

    if (wouldCreateCycle({ employeesById, employeeId: employee.agentId, managerId })) {
      out.push({ agentId: employee.agentId, reason: "cycle" });
    }
  }

  return out;
}

export function applyDepartmentLeadConstraints(params: {
  company: Company;
  nextDepartments: Department[];
  nextEmployees: EmployeeRef[];
}): { departments: Department[]; employees: EmployeeRef[]; warnings: string[] } {
  const warnings: string[] = [];
  const employees = params.nextEmployees.map((employee) => ({ ...employee }));
  const employeesById = new Map(employees.map((employee) => [employee.agentId, employee]));
  const ceoAgentId = resolveCeoAgentId(employees);

  const departments = ensureMetaDepartments({
    nextDepartments: params.nextDepartments,
    employees,
    employeesById,
    warnings,
  });

  for (const dept of departments) {
    const lead = employeesById.get(dept.leadAgentId);
    if (!lead) {
      warnings.push(`部门「${dept.name}」负责人不存在：${dept.leadAgentId}`);
      continue;
    }

    if (lead.departmentId !== dept.id) {
      lead.departmentId = dept.id;
    }

    if (lead.metaRole === "ceo") {
      continue;
    }

    if (!ceoAgentId) {
      warnings.push(`无法校准部门负责人「${lead.nickname}」汇报线：未找到 CEO 节点`);
      continue;
    }

    if (lead.reportsTo !== ceoAgentId) {
      if (wouldCreateCycle({ employeesById, employeeId: lead.agentId, managerId: ceoAgentId })) {
        warnings.push(`无法将部门负责人「${lead.nickname}」挂到 CEO：会形成循环`);
      } else {
        lead.reportsTo = ceoAgentId;
        warnings.push(`已将部门负责人「${lead.nickname}」汇报线校准到 CEO`);
      }
    }
  }

  return { departments, employees, warnings };
}

export function applyOneClickOrgFixups(params: {
  company: Company;
  nextDepartments: Department[];
  nextEmployees: EmployeeRef[];
}): {
  departments: Department[];
  employees: EmployeeRef[];
  warnings: string[];
  stats: {
    issuesBefore: number;
    fixedManagers: number;
  };
} {
  const warnings: string[] = [];
  const employees = params.nextEmployees.map((employee) => ({ ...employee }));
  const employeesById = new Map(employees.map((employee) => [employee.agentId, employee]));
  const ceoAgentId = resolveCeoAgentId(employees);
  const departmentsById = new Map(params.nextDepartments.map((dept) => [dept.id, dept]));

  for (const dept of params.nextDepartments) {
    const lead = employeesById.get(dept.leadAgentId);
    if (!lead) {
      continue;
    }
    if (lead.departmentId !== dept.id) {
      lead.departmentId = dept.id;
    }
  }

  const issuesBefore = resolveOrgIssues({ employees }).length;
  let fixedManagers = 0;

  for (const issue of resolveOrgIssues({ employees })) {
    const employee = employeesById.get(issue.agentId);
    if (!employee) {
      continue;
    }

    const deptId = employee.departmentId;
    const dept = deptId ? departmentsById.get(deptId) ?? null : null;

    let targetManager: string | null = null;

    if (employee.isMeta) {
      targetManager = ceoAgentId;
    } else if (dept && isValidManagerId(dept.leadAgentId, employeesById) && dept.leadAgentId !== employee.agentId) {
      targetManager = dept.leadAgentId;
    } else {
      targetManager = ceoAgentId;
    }

    if (!targetManager || targetManager === employee.agentId) {
      if (!ceoAgentId) {
        warnings.push(`无法修复「${employee.nickname}」：未找到 CEO 节点`);
      }
      continue;
    }

    if (wouldCreateCycle({ employeesById, employeeId: employee.agentId, managerId: targetManager })) {
      if (ceoAgentId && targetManager !== ceoAgentId) {
        if (!wouldCreateCycle({ employeesById, employeeId: employee.agentId, managerId: ceoAgentId })) {
          targetManager = ceoAgentId;
        }
      }
    }

    if (employee.reportsTo !== targetManager) {
      employee.reportsTo = targetManager;
      fixedManagers += 1;
    }
  }

  const afterLeadConstraints = applyDepartmentLeadConstraints({
    company: params.company,
    nextDepartments: params.nextDepartments,
    nextEmployees: employees,
  });

  for (const warning of afterLeadConstraints.warnings) {
    warnings.push(warning);
  }

  return {
    departments: afterLeadConstraints.departments,
    employees: afterLeadConstraints.employees,
    warnings,
    stats: { issuesBefore, fixedManagers },
  };
}

export function resolveDepartmentLabel(params: {
  deptId: string | undefined;
  departments: Department[];
}): string {
  if (!params.deptId) {
    return "待分配";
  }
  const dept = params.departments.find((item) => item.id === params.deptId);
  return dept?.name ?? "待分配";
}

function stripCompanySuffix(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.replace(/(公司|工作室|团队|工厂)$/, "");
}

export function inferDefaultDepartmentName(company: Company): string {
  const base = stripCompanySuffix(company.name);
  const template = String(company.template ?? "").toLowerCase();
  const preferCreate = template.includes("content") || base.includes("小说") || base.includes("创作");
  if (preferCreate) {
    if (base.includes("创作")) {
      return `${base}部`;
    }
    return `${base}创作部`;
  }
  return `${base}部`;
}

export function resolveDepartmentLeadCandidate(employees: EmployeeRef[]): EmployeeRef | null {
  const nonMeta = employees.filter((employee) => !employee.isMeta);
  const candidates = nonMeta.length > 0 ? nonMeta : employees;
  if (candidates.length === 0) {
    return null;
  }

  const keyword = /(主编|主笔|负责人|经理|主管|组长|leader|lead)/i;
  const scored = candidates.map((employee) => {
    const role = employee.role ?? "";
    const nickname = employee.nickname ?? "";
    const score =
      (keyword.test(role) ? 4 : 0) +
      (keyword.test(nickname) ? 2 : 0) +
      (employee.metaRole === "ceo" ? -10 : 0);
    return { employee, score };
  });
  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.employee.agentId.localeCompare(b.employee.agentId);
  });
  return scored[0].employee;
}

export function applyBootstrapSingleDepartment(params: {
  company: Company;
  dept: Department;
  nextEmployees: EmployeeRef[];
  normalizeReportsToLead?: boolean;
}): {
  departments: Department[];
  employees: EmployeeRef[];
  warnings: string[];
  stats: { assigned: number; rewired: number };
} {
  const warnings: string[] = [];
  const employees = params.nextEmployees.map((employee) => ({ ...employee }));
  const employeesById = new Map(employees.map((employee) => [employee.agentId, employee]));
  const lead = employeesById.get(params.dept.leadAgentId);
  if (!lead) {
    return {
      departments: [params.dept],
      employees,
      warnings: [`部门负责人不存在：${params.dept.leadAgentId}`],
      stats: { assigned: 0, rewired: 0 },
    };
  }

  let assigned = 0;
  let rewired = 0;

  for (const employee of employees) {
    if (employee.isMeta) {
      continue;
    }
    if (employee.agentId === lead.agentId) {
      if (employee.departmentId !== params.dept.id) {
        employee.departmentId = params.dept.id;
        assigned += 1;
      }
      continue;
    }

    if (employee.departmentId !== params.dept.id) {
      employee.departmentId = params.dept.id;
      assigned += 1;
    }

    if (params.normalizeReportsToLead) {
      if (employee.reportsTo !== lead.agentId) {
        if (wouldCreateCycle({ employeesById, employeeId: employee.agentId, managerId: lead.agentId })) {
          warnings.push(`跳过「${employee.nickname}」汇报重连：会形成循环`);
        } else {
          employee.reportsTo = lead.agentId;
          rewired += 1;
        }
      }
    }
  }

  const normalized = applyDepartmentLeadConstraints({
    company: params.company,
    nextDepartments: [params.dept],
    nextEmployees: employees,
  });

  for (const warning of normalized.warnings) {
    warnings.push(warning);
  }

  return {
    departments: normalized.departments,
    employees: normalized.employees,
    warnings,
    stats: { assigned, rewired },
  };
}
