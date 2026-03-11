import type {
  DecisionTicketRecord,
  EscalationRecord,
  SupportRequestRecord,
} from "../../../src/domain/delegation/types";
import {
  COMPANY_CONTEXT_FILE_NAME,
  CEO_OPERATIONS_FILE_NAME,
  DEPARTMENT_CONTEXT_FILE_NAME,
  DEPARTMENT_OPERATIONS_FILE_NAME,
  buildCeoOperationsGuide,
  buildCompanyContextSnapshot,
  buildDepartmentContextSnapshot,
  buildDepartmentOperationsGuide,
} from "../../../src/application/company/agent-context";
import type { WorkItemRecord } from "../../../src/domain/mission/types";
import {
  generateDepartmentManagerSoul,
  generateCeoSoul,
  generateCooSoul,
  generateCtoSoul,
  generateHrSoul,
} from "../../../src/domain/org/meta-agent-souls";
import { isReservedSystemCompany } from "../../../src/domain/org/system-company";
import type { Company, CyberCompanyConfig, EmployeeRef } from "../../../src/domain/org/types";

export type ManagedExecutorAgentTarget = {
  agentId: string;
  companyId: string;
  workspace: string;
};

export type ManagedExecutorFile = {
  agentId: string;
  name: string;
  content: string;
};

export type ManagedExecutorTrackedAgent = {
  agentId: string;
  desiredPresent: boolean;
};

export type ManagedExecutorReconcilePlan = {
  deleteAgentIds: string[];
  createTargets: ManagedExecutorAgentTarget[];
};

export type ManagedCompanyRuntimeSnapshot = {
  activeWorkItems?: WorkItemRecord[];
  activeSupportRequests?: SupportRequestRecord[];
  activeEscalations?: EscalationRecord[];
  activeDecisionTickets?: DecisionTicketRecord[];
};

const MANAGED_EXECUTOR_WORKSPACE_ROOT = "~/.openclaw/workspaces/cyber-company";

function isSystemMappedEmployee(company: Company, employee: EmployeeRef) {
  return isReservedSystemCompany(company) && company.system?.mappedAgentId === employee.agentId;
}

function buildMetaSoul(company: Company, employee: EmployeeRef): string | null {
  switch (employee.metaRole) {
    case "ceo":
      return generateCeoSoul(company.name);
    case "hr":
      return generateHrSoul(company.name);
    case "cto":
      return generateCtoSoul(company.name);
    case "coo":
      return generateCooSoul(company.name);
    default:
      return null;
  }
}

function managesDepartment(company: Company, employee: EmployeeRef): boolean {
  return (company.departments ?? []).some(
    (department) => !department.archived && department.leadAgentId === employee.agentId,
  );
}

export function buildManagedExecutorWorkspace(params: {
  companyId: string;
  agentId: string;
}) {
  return `${buildManagedExecutorCompanyWorkspace(params.companyId)}/${params.agentId}`;
}

export function buildManagedExecutorWorkspaceRoot() {
  return MANAGED_EXECUTOR_WORKSPACE_ROOT;
}

export function buildManagedExecutorCompanyWorkspace(companyId: string) {
  return `${MANAGED_EXECUTOR_WORKSPACE_ROOT}/${companyId}`;
}

export function listDesiredManagedExecutorAgents(
  config: CyberCompanyConfig | null | undefined,
): ManagedExecutorAgentTarget[] {
  if (!config) {
    return [];
  }

  return config.companies.flatMap((company) =>
    company.employees
      .filter((employee) => !isSystemMappedEmployee(company, employee))
      .map((employee) => ({
        agentId: employee.agentId,
        companyId: company.id,
        workspace: buildManagedExecutorWorkspace({
          companyId: company.id,
          agentId: employee.agentId,
        }),
      })),
  );
}

export function buildManagedExecutorFilesForCompany(
  company: Company,
  runtime?: ManagedCompanyRuntimeSnapshot,
): ManagedExecutorFile[] {
  const files: ManagedExecutorFile[] = [];

  for (const employee of company.employees) {
    const soul =
      buildMetaSoul(company, employee) ??
      (managesDepartment(company, employee)
        ? generateDepartmentManagerSoul(
            company.name,
            (company.departments ?? [])
              .filter((department) => !department.archived && department.leadAgentId === employee.agentId)
              .map((department) => department.name)
              .join(" / "),
          )
        : null);
    if (soul) {
      files.push({
        agentId: employee.agentId,
        name: "SOUL.md",
        content: soul,
      });
    }
  }

  const ceo = company.employees.find((employee) => employee.metaRole === "ceo") ?? null;
  if (ceo) {
    files.push({
      agentId: ceo.agentId,
      name: COMPANY_CONTEXT_FILE_NAME,
      content: JSON.stringify(buildCompanyContextSnapshot(company, runtime), null, 2),
    });
    files.push({
      agentId: ceo.agentId,
      name: CEO_OPERATIONS_FILE_NAME,
      content: buildCeoOperationsGuide(company),
    });
  }

  const managerAgentIds = new Set(
    (company.departments ?? [])
      .filter((department) => !department.archived && department.leadAgentId !== ceo?.agentId)
      .map((department) => department.leadAgentId),
  );
  for (const managerAgentId of managerAgentIds) {
    files.push({
      agentId: managerAgentId,
      name: DEPARTMENT_CONTEXT_FILE_NAME,
      content: JSON.stringify(
        buildDepartmentContextSnapshot({
          company,
          managerAgentId,
          runtime,
        }),
        null,
        2,
      ),
    });
    files.push({
      agentId: managerAgentId,
      name: DEPARTMENT_OPERATIONS_FILE_NAME,
      content: buildDepartmentOperationsGuide({
        company,
        managerAgentId,
        runtime,
      }),
    });
  }

  return files;
}

export function buildManagedExecutorFiles(
  config: CyberCompanyConfig | null | undefined,
  runtimeByCompanyId?: ReadonlyMap<string, ManagedCompanyRuntimeSnapshot>,
): ManagedExecutorFile[] {
  if (!config) {
    return [];
  }
  return config.companies.flatMap((company) =>
    buildManagedExecutorFilesForCompany(company, runtimeByCompanyId?.get(company.id)),
  );
}

export function planManagedExecutorReconcile(params: {
  trackedAgents: ReadonlyArray<ManagedExecutorTrackedAgent>;
  desiredTargets: ReadonlyArray<ManagedExecutorAgentTarget>;
  existingAgentIds: ReadonlySet<string>;
}): ManagedExecutorReconcilePlan {
  return {
    deleteAgentIds: params.trackedAgents
      .filter((agent) => !agent.desiredPresent)
      .map((agent) => agent.agentId),
    createTargets: params.desiredTargets.filter(
      (target) => !params.existingAgentIds.has(target.agentId),
    ),
  };
}
