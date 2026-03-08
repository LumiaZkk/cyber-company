import type {
  Company,
  EmployeeRef,
  QuickPrompt,
  SharedKnowledgeItem,
} from "./types";
import type { CronJob } from "../backend";

export type CompanyBlueprintV1 = {
  kind: "cyber-company.blueprint.v1";
  sourceCompanyName: string;
  template: string;
  icon: string;
  description: string;
  exportedAt: number;
  employees: BlueprintEmployee[];
  departments: BlueprintDepartment[];
  quickPrompts: BlueprintQuickPrompt[];
  automations: BlueprintAutomation[];
  knowledgeItems: SharedKnowledgeItem[];
};

export type BlueprintEmployee = {
  blueprintId: string;
  nickname: string;
  role: string;
  isMeta: boolean;
  metaRole?: EmployeeRef["metaRole"];
  reportsToBlueprintId?: string;
  departmentName?: string;
};

export type BlueprintDepartment = {
  name: string;
  color?: string;
  order?: number;
  leadBlueprintId?: string;
};

export type BlueprintQuickPrompt = {
  label: string;
  icon: string;
  prompt: string;
  targetBlueprintId?: string;
};

export type BlueprintAutomation = {
  name: string;
  task: string;
  expr?: string;
  everyMs?: number;
  targetBlueprintId?: string;
};

function toBlueprintEmployeeId(employee: EmployeeRef, index: number): string {
  if (employee.metaRole) {
    return `meta:${employee.metaRole}`;
  }
  return `member:${index}:${employee.nickname}:${employee.role}`.replace(/\s+/g, "-");
}

function stripFencedCode(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildCompanyBlueprint(params: {
  company: Company;
  jobs: CronJob[];
}): CompanyBlueprintV1 {
  const employeeIdMap = new Map<string, string>();
  const departmentById = new Map((params.company.departments ?? []).map((department) => [department.id, department]));

  const employees = params.company.employees.map((employee, index) => {
    const blueprintId = toBlueprintEmployeeId(employee, index);
    employeeIdMap.set(employee.agentId, blueprintId);
    return { employee, blueprintId };
  }).map(({ employee, blueprintId }) => {
    return {
      blueprintId,
      nickname: employee.nickname,
      role: employee.role,
      isMeta: employee.isMeta,
      metaRole: employee.metaRole,
      reportsToBlueprintId: employee.reportsTo ? employeeIdMap.get(employee.reportsTo) : undefined,
      departmentName: employee.departmentId ? departmentById.get(employee.departmentId)?.name : undefined,
    };
  });

  const departments = (params.company.departments ?? []).map((department) => ({
    name: department.name,
    color: department.color,
    order: department.order,
    leadBlueprintId: employeeIdMap.get(department.leadAgentId),
  }));

  const quickPrompts: BlueprintQuickPrompt[] = (params.company.quickPrompts ?? []).map((prompt: QuickPrompt) => ({
    label: prompt.label,
    icon: prompt.icon,
    prompt: prompt.prompt,
    targetBlueprintId: employeeIdMap.get(prompt.targetAgentId),
  }));

  const companyAgentIds = new Set(params.company.employees.map((employee) => employee.agentId));
  const automations: BlueprintAutomation[] = params.jobs
    .filter((job) => job.agentId && companyAgentIds.has(job.agentId))
    .map((job) => ({
      name: job.name,
      task: job.payload?.message ?? "",
      expr: job.schedule?.kind === "cron" ? job.schedule.expr : undefined,
      everyMs: job.schedule?.kind === "every" ? job.schedule.everyMs : undefined,
      targetBlueprintId: job.agentId ? employeeIdMap.get(job.agentId) : undefined,
    }))
    .filter((job) => job.task.trim().length > 0);

  return {
    kind: "cyber-company.blueprint.v1",
    sourceCompanyName: params.company.name,
    template: params.company.template,
    icon: params.company.icon,
    description: params.company.description,
    exportedAt: Date.now(),
    employees,
    departments,
    quickPrompts,
    automations,
    knowledgeItems: params.company.knowledgeItems ?? [],
  };
}

export function parseCompanyBlueprint(raw: string): CompanyBlueprintV1 | null {
  const normalized = stripFencedCode(raw);
  if (!normalized) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(normalized);
    if (!isObjectRecord(parsed) || parsed.kind !== "cyber-company.blueprint.v1") {
      return null;
    }
    if (!Array.isArray(parsed.employees) || !Array.isArray(parsed.departments)) {
      return null;
    }
    return parsed as CompanyBlueprintV1;
  } catch {
    return null;
  }
}

export function findBlueprintEmployee(
  blueprint: CompanyBlueprintV1,
  blueprintId: string | undefined,
): BlueprintEmployee | null {
  if (!blueprintId) {
    return null;
  }
  return blueprint.employees.find((employee) => employee.blueprintId === blueprintId) ?? null;
}
