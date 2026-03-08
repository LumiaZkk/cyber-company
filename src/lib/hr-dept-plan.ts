import type { Company, Department, EmployeeRef } from "../features/company/types";

export type HrDepartmentPlanV1 = {
  kind: "cyber-company.departmentPlan.v1";
  companyId: string;
  departments: Array<{
    id: string;
    name: string;
    leadAgentId: string;
    color?: string;
    order?: number;
  }>;
  employees: Array<{
    agentId: string;
    departmentId?: string | null;
    reportsTo?: string | null;
  }>;
  notes?: string[];
};

export function extractJsonFence(text: string): string | null {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/i);
  return match?.[1]?.trim() ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseHrDepartmentPlan(text: string): HrDepartmentPlanV1 | null {
  const json = extractJsonFence(text) ?? text.trim();
  if (!json) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  if (parsed.kind !== "cyber-company.departmentPlan.v1") {
    return null;
  }
  if (typeof parsed.companyId !== "string" || parsed.companyId.trim().length === 0) {
    return null;
  }
  if (!Array.isArray(parsed.departments) || !Array.isArray(parsed.employees)) {
    return null;
  }
  return parsed as HrDepartmentPlanV1;
}

export function applyHrDepartmentPlan(params: {
  company: Company;
  plan: HrDepartmentPlanV1;
}): { departments: Department[]; employees: EmployeeRef[]; warnings: string[] } {
  const warnings: string[] = [];
  const company = params.company;
  const employeesById = new Map(company.employees.map((employee) => [employee.agentId, employee]));

  const existingDepartments: Department[] = Array.isArray(company.departments)
    ? company.departments.map((dept) => ({ ...dept }))
    : [];

  const deptIndexByLead = new Map(existingDepartments.map((dept, index) => [dept.leadAgentId, index] as const));
  const deptIds = new Set(existingDepartments.map((dept) => dept.id));

  const nextDepartments = [...existingDepartments];

  for (let index = 0; index < params.plan.departments.length; index += 1) {
    const dept = params.plan.departments[index];
    const name = String(dept.name ?? "").trim() || `部门-${index + 1}`;
    const leadAgentId = String(dept.leadAgentId ?? "").trim();
    if (!employeesById.has(leadAgentId)) {
      warnings.push(`部门「${name}」负责人不存在：${leadAgentId}`);
    }

    const existingIndex = deptIndexByLead.get(leadAgentId);
    if (typeof existingIndex === "number") {
      const current = nextDepartments[existingIndex];
      nextDepartments[existingIndex] = {
        ...current,
        name,
        leadAgentId,
        color: normalizeOptionalString(dept.color) ?? current.color,
        order: typeof dept.order === "number" ? dept.order : current.order,
        archived: false,
      };
      continue;
    }

    const desiredId = String(dept.id ?? "").trim();
    let id = desiredId || crypto.randomUUID();
    if (deptIds.has(id)) {
      id = crypto.randomUUID();
    }
    deptIds.add(id);

    const created: Department = {
      id,
      name,
      leadAgentId,
      color: normalizeOptionalString(dept.color) ?? undefined,
      order: typeof dept.order === "number" ? dept.order : nextDepartments.length,
      archived: false,
    };
    deptIndexByLead.set(leadAgentId, nextDepartments.length);
    nextDepartments.push(created);
  }

  const patchById = new Map(
    params.plan.employees.map((entry) => [String(entry.agentId ?? ""), entry]),
  );

  const nextEmployees: EmployeeRef[] = company.employees.map((employee) => {
    const patch = patchById.get(employee.agentId);
    if (!patch) {
      return employee;
    }

    const next: EmployeeRef = { ...employee };
    if (Object.prototype.hasOwnProperty.call(patch, "departmentId")) {
      const deptIdRaw = patch.departmentId;
      if (deptIdRaw === null || deptIdRaw === undefined || String(deptIdRaw).trim().length === 0) {
        delete next.departmentId;
      } else {
        next.departmentId = String(deptIdRaw).trim();
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "reportsTo")) {
      const reportsToRaw = patch.reportsTo;
      if (reportsToRaw === null || reportsToRaw === undefined || String(reportsToRaw).trim().length === 0) {
        delete next.reportsTo;
      } else {
        next.reportsTo = String(reportsToRaw).trim();
      }
    }

    return next;
  });

  return { departments: nextDepartments, employees: nextEmployees, warnings };
}
