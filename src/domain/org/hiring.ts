import type { Company, Department, EmployeeRef } from "./types";
import { applyOneClickOrgFixups } from "./policies";

export type HireEmployeePlanInput = {
  role: string;
  description: string;
  nickname?: string;
  reportsTo?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  departmentKind?: Department["kind"];
  departmentColor?: string | null;
  makeDepartmentLead?: boolean;
  avatarJobId?: string;
};

export type HireEmployeePlanResult = {
  company: Company;
  employee: EmployeeRef;
  department: Department | null;
  warnings: string[];
};

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function inferNamespace(company: Company) {
  const ceoAgentId = company.employees.find((employee) => employee.metaRole === "ceo")?.agentId ?? "";
  if (ceoAgentId.endsWith("-ceo")) {
    return ceoAgentId.slice(0, -"-ceo".length);
  }
  const base = slugify(company.name) || "company";
  return `${base}-${company.id.slice(0, 6)}`;
}

function buildUniqueAgentId(company: Company, role: string) {
  const namespace = inferNamespace(company);
  const roleSlug = slugify(role) || "employee";
  const taken = new Set(company.employees.map((employee) => employee.agentId));
  const base = `${namespace}-${roleSlug}`;
  if (!taken.has(base)) {
    return base;
  }
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(`无法为岗位 ${role} 生成唯一 agentId。`);
}

function buildUniqueDepartmentId(company: Company, departmentName: string) {
  const base = `dept-${slugify(departmentName) || "business"}`;
  const taken = new Set((company.departments ?? []).map((department) => department.id));
  if (!taken.has(base)) {
    return base;
  }
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(`无法为部门 ${departmentName} 生成唯一 id。`);
}

function resolveDefaultManager(company: Company) {
  return (
    company.employees.find((employee) => employee.metaRole === "ceo")?.agentId
    ?? company.employees[0]?.agentId
    ?? null
  );
}

export function planHiredEmployee(company: Company, input: HireEmployeePlanInput): HireEmployeePlanResult {
  const role = input.role.trim();
  const description = input.description.trim();
  if (!role) {
    throw new Error("岗位名称不能为空。");
  }
  if (!description) {
    throw new Error("岗位职责不能为空。");
  }

  const nextDepartments = [...(company.departments ?? [])];
  const agentId = buildUniqueAgentId(company, role);
  const defaultManager = resolveDefaultManager(company);
  const requestedDepartmentName = input.departmentName?.trim() || "";
  const requestedDepartmentId = input.departmentId?.trim() || "";
  let department =
    nextDepartments.find((entry) => entry.id === requestedDepartmentId)
    ?? nextDepartments.find((entry) => entry.name === requestedDepartmentName)
    ?? null;

  if (!department && requestedDepartmentName) {
    department = {
      id: buildUniqueDepartmentId(company, requestedDepartmentName),
      name: requestedDepartmentName,
      leadAgentId: input.makeDepartmentLead ? agentId : (input.reportsTo?.trim() || defaultManager || agentId),
      kind: input.departmentKind ?? "business",
      color: input.departmentColor ?? "amber",
      order: nextDepartments.length,
      missionPolicy: "manager_delegated",
    };
    nextDepartments.push(department);
  }

  if (department && input.makeDepartmentLead) {
    department = { ...department, leadAgentId: agentId };
    const targetIndex = nextDepartments.findIndex((entry) => entry.id === department?.id);
    if (targetIndex >= 0) {
      nextDepartments[targetIndex] = department;
    }
  }

  const employee: EmployeeRef = {
    agentId,
    nickname: input.nickname?.trim() || role,
    role,
    isMeta: false,
    reportsTo: input.makeDepartmentLead ? (defaultManager ?? undefined) : (input.reportsTo?.trim() || defaultManager || undefined),
    departmentId: department?.id ?? undefined,
    ...(input.avatarJobId ? { avatarJobId: input.avatarJobId } : {}),
  };

  const normalized = applyOneClickOrgFixups({
    company,
    nextDepartments,
    nextEmployees: [...company.employees, employee],
  });

  const nextCompany: Company = {
    ...company,
    departments: normalized.departments,
    employees: normalized.employees,
  };
  const normalizedEmployee = nextCompany.employees.find((entry) => entry.agentId === agentId);
  if (!normalizedEmployee) {
    throw new Error(`新员工 ${agentId} 未能写入公司 roster。`);
  }
  const normalizedDepartment = normalizedEmployee.departmentId
    ? nextCompany.departments?.find((entry) => entry.id === normalizedEmployee.departmentId) ?? null
    : null;

  return {
    company: nextCompany,
    employee: normalizedEmployee,
    department: normalizedDepartment,
    warnings: normalized.warnings,
  };
}
