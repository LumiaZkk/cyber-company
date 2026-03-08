import type { Company, Department, EmployeeRef } from "../company/types";
import {
  applyBootstrapSingleDepartment,
  applyDepartmentLeadConstraints,
  applyOneClickOrgFixups,
  inferDefaultDepartmentName,
  resolveCeoAgentId,
  resolveDepartmentLeadCandidate,
  resolveOrgIssues,
} from "../../lib/org-departments";

export type OrgRecommendationKind =
  | "fix_org_issues"
  | "bootstrap_business_department"
  | "flatten_small_department_to_ceo"
  | "introduce_department_lead";

export type OrgRecommendation = {
  id: string;
  kind: OrgRecommendationKind;
  title: string;
  summary: string;
  actionLabel: string;
  priority: "high" | "medium";
  departmentId?: string;
  leadAgentId?: string;
};

export type OrgAdvisorSnapshot = {
  headline: string;
  summary: string;
  operatingMode: {
    key: "ceo_direct" | "hybrid" | "departmental";
    label: string;
    summary: string;
  };
  recommendations: OrgRecommendation[];
};

type OrgMutationResult = {
  departments: Department[];
  employees: EmployeeRef[];
  warnings: string[];
};

export type OrgAutoCalibrationResult = OrgMutationResult & {
  changed: boolean;
  appliedRecommendations: OrgRecommendation[];
  finalSnapshot: OrgAdvisorSnapshot;
};

function isMetaDepartment(params: {
  dept: Department;
  employeesById: Map<string, EmployeeRef>;
}): boolean {
  const lead = params.employeesById.get(params.dept.leadAgentId);
  return Boolean(lead?.isMeta);
}

function applyDepartmentReportsToCeo(params: {
  company: Company;
  deptId: string;
}): OrgMutationResult {
  const employees = params.company.employees.map((employee) => ({ ...employee }));
  const ceoAgentId = resolveCeoAgentId(employees);
  if (!ceoAgentId) {
    return {
      departments: params.company.departments ?? [],
      employees,
      warnings: ["无法执行 CEO 直管重整：未找到 CEO 节点"],
    };
  }

  for (const employee of employees) {
    if (employee.isMeta || employee.departmentId !== params.deptId) {
      continue;
    }
    if (employee.agentId === ceoAgentId) {
      continue;
    }
    employee.reportsTo = ceoAgentId;
  }

  const normalized = applyDepartmentLeadConstraints({
    company: params.company,
    nextDepartments: params.company.departments ?? [],
    nextEmployees: employees,
  });

  return {
    departments: normalized.departments,
    employees: normalized.employees,
    warnings: normalized.warnings,
  };
}

function applyDepartmentLeadHierarchy(params: {
  company: Company;
  deptId: string;
  leadAgentId: string;
}): OrgMutationResult {
  const employees = params.company.employees.map((employee) => ({ ...employee }));
  const departments = (params.company.departments ?? []).map((department) =>
    department.id === params.deptId
      ? { ...department, leadAgentId: params.leadAgentId }
      : { ...department },
  );
  const ceoAgentId = resolveCeoAgentId(employees);
  const employeesById = new Map(employees.map((employee) => [employee.agentId, employee]));
  const lead = employeesById.get(params.leadAgentId);

  if (!lead) {
    return {
      departments,
      employees,
      warnings: [`无法建立部门负责人：未找到员工 ${params.leadAgentId}`],
    };
  }

  lead.departmentId = params.deptId;
  if (!lead.isMeta && ceoAgentId && lead.agentId !== ceoAgentId) {
    lead.reportsTo = ceoAgentId;
  }

  for (const employee of employees) {
    if (employee.isMeta || employee.departmentId !== params.deptId || employee.agentId === lead.agentId) {
      continue;
    }
    employee.reportsTo = lead.agentId;
  }

  const normalized = applyDepartmentLeadConstraints({
    company: params.company,
    nextDepartments: departments,
    nextEmployees: employees,
  });

  return {
    departments: normalized.departments,
    employees: normalized.employees,
    warnings: normalized.warnings,
  };
}

function cloneCompany(company: Company): Company {
  return {
    ...company,
    departments: company.departments?.map((department) => ({ ...department })),
    employees: company.employees.map((employee) => ({ ...employee })),
  };
}

export function isOrgAutopilotEnabled(company: Company): boolean {
  return company.orgSettings?.autoCalibrate ?? true;
}

export function buildOrgAdvisorSnapshot(company: Company): OrgAdvisorSnapshot {
  const employees = company.employees;
  const departments = company.departments ?? [];
  const employeesById = new Map(employees.map((employee) => [employee.agentId, employee]));
  const ceoAgentId = resolveCeoAgentId(employees);
  const orgIssues = resolveOrgIssues({ employees });
  const recommendations: OrgRecommendation[] = [];

  if (orgIssues.length > 0) {
    recommendations.push({
      id: "fix-org-issues",
      kind: "fix_org_issues",
      title: "先修复汇报线异常",
      summary: `检测到 ${orgIssues.length} 个组织结构问题，优先修复缺失上级、无效汇报或循环引用。`,
      actionLabel: "一键修复",
      priority: "high",
    });
  }

  const nonMetaEmployees = employees.filter((employee) => !employee.isMeta);
  const businessDepartments = departments.filter(
    (department) => !isMetaDepartment({ dept: department, employeesById }),
  );
  const employeesInBusinessDepartments = new Set(
    nonMetaEmployees
      .filter((employee) => employee.departmentId && businessDepartments.some((dept) => dept.id === employee.departmentId))
      .map((employee) => employee.agentId),
  );
  const unstructuredBusinessEmployees = nonMetaEmployees.filter(
    (employee) => !employeesInBusinessDepartments.has(employee.agentId),
  );

  if (unstructuredBusinessEmployees.length > 1) {
    const candidate = resolveDepartmentLeadCandidate(unstructuredBusinessEmployees);
    recommendations.push({
      id: "bootstrap-business-department",
      kind: "bootstrap_business_department",
      title: "补一个真正的业务部门",
      summary: `当前有 ${unstructuredBusinessEmployees.length} 名业务员工仍挂在管理层名下，建议从 CEO 视角抽出一个业务部门承接日常协作。`,
      actionLabel: "建立业务部门",
      priority: "high",
      leadAgentId: candidate?.agentId,
    });
  }

  for (const department of businessDepartments) {
    const members = nonMetaEmployees.filter((employee) => employee.departmentId === department.id);
    if (members.length === 0) {
      continue;
    }

    const lead = employeesById.get(department.leadAgentId) ?? null;
    const directToCeoCount = ceoAgentId
      ? members.filter((employee) => employee.reportsTo === ceoAgentId).length
      : 0;

    if (members.length <= 3) {
      const nonCeoReports = members.filter(
        (employee) => ceoAgentId && employee.reportsTo && employee.reportsTo !== ceoAgentId,
      );
      if (nonCeoReports.length > 0) {
        recommendations.push({
          id: `flatten:${department.id}`,
          kind: "flatten_small_department_to_ceo",
          title: `让「${department.name}」回归 CEO 直管`,
          summary: `这个部门当前只有 ${members.length} 名业务成员，更适合先由 CEO 直管，减少无效中间层。`,
          actionLabel: "切回 CEO 直管",
          priority: "high",
          departmentId: department.id,
        });
      }
      continue;
    }

    const leadIsUsable = Boolean(lead && !lead.isMeta && members.some((employee) => employee.agentId === lead.agentId));
    const candidate = leadIsUsable ? lead : resolveDepartmentLeadCandidate(members);
    const shouldIntroduceLead =
      !leadIsUsable ||
      (candidate ? directToCeoCount >= Math.max(3, members.length - 1) : false);

    if (shouldIntroduceLead && candidate) {
      recommendations.push({
        id: `lead:${department.id}`,
        kind: "introduce_department_lead",
        title: `给「${department.name}」设一个负责人`,
        summary: `这个部门已有 ${members.length} 名成员，继续全部直报 CEO 会放大协调噪音，建议先收敛到一名负责人。`,
        actionLabel: "设负责人",
        priority: "medium",
        departmentId: department.id,
        leadAgentId: candidate.agentId,
      });
      continue;
    }

    if (leadIsUsable && candidate) {
      const offHierarchyMembers = members.filter(
        (employee) => employee.agentId !== candidate.agentId && employee.reportsTo !== candidate.agentId,
      );
      if (offHierarchyMembers.length > 0) {
        recommendations.push({
          id: `lead:${department.id}`,
          kind: "introduce_department_lead",
          title: `收拢「${department.name}」的汇报链`,
          summary: `该部门已经具备负责人候选，但仍有 ${offHierarchyMembers.length} 名成员没有向负责人汇报。`,
          actionLabel: "重整汇报线",
          priority: "medium",
          departmentId: department.id,
          leadAgentId: candidate.agentId,
        });
      }
    }
  }

  const headline =
    recommendations.length > 0
      ? `CEO 已识别到 ${recommendations.length} 条组织优化动作`
      : "当前组织结构可持续运行";
  const summary =
    recommendations.length > 0
      ? recommendations[0]?.summary ?? "组织诊断已完成。"
      : "现阶段可以继续由 CEO 主导推进，等并行复杂度抬升后再引入更多业务层级。";
  const departmentsWithLead = businessDepartments.filter((department) => {
    const lead = employeesById.get(department.leadAgentId);
    return Boolean(lead && !lead.isMeta);
  }).length;
  const businessEmployeesDirectToCeo = nonMetaEmployees.filter(
    (employee) => employee.reportsTo === ceoAgentId,
  ).length;
  const operatingMode =
    departmentsWithLead === 0
      ? {
          key: "ceo_direct" as const,
          label: "CEO 直管",
          summary: `当前 ${businessEmployeesDirectToCeo} 名业务员工主要由 CEO 直接带队，适合小团队快速推进。`,
        }
      : departmentsWithLead < Math.max(1, businessDepartments.length)
        ? {
            key: "hybrid" as const,
            label: "混合分层",
            summary: `已有 ${departmentsWithLead} 个业务部门具备负责人，其余团队仍由 CEO 直接兜底。`,
          }
        : {
            key: "departmental" as const,
            label: "部门分层",
            summary: `业务部门已形成较完整的负责人结构，CEO 更适合盯方向和跨部门协同。`,
          };

  return {
    headline,
    summary,
    operatingMode,
    recommendations: recommendations.slice(0, 4),
  };
}

export function applyOrgRecommendation(params: {
  company: Company;
  recommendation: OrgRecommendation;
}): OrgMutationResult {
  switch (params.recommendation.kind) {
    case "fix_org_issues": {
      const normalized = applyOneClickOrgFixups({
        company: params.company,
        nextDepartments: params.company.departments ?? [],
        nextEmployees: params.company.employees,
      });
      return {
        departments: normalized.departments,
        employees: normalized.employees,
        warnings: normalized.warnings,
      };
    }
    case "bootstrap_business_department": {
      const leadAgentId =
        params.recommendation.leadAgentId ??
        resolveDepartmentLeadCandidate(params.company.employees.filter((employee) => !employee.isMeta))
          ?.agentId;
      if (!leadAgentId) {
        return {
          departments: params.company.departments ?? [],
          employees: params.company.employees,
          warnings: ["无法建立业务部门：缺少负责人候选"],
        };
      }
      const dept = {
        id: crypto.randomUUID(),
        name: inferDefaultDepartmentName(params.company),
        leadAgentId,
        color: "amber",
        order: (params.company.departments ?? []).length,
      };
      const businessEmployees = params.company.employees.filter((employee) => !employee.isMeta);
      const normalized = applyBootstrapSingleDepartment({
        company: params.company,
        dept,
        nextEmployees: businessEmployees.length >= 4
          ? params.company.employees
          : params.company.employees.map((employee) =>
              employee.isMeta ? employee : { ...employee, departmentId: dept.id },
            ),
        normalizeReportsToLead: businessEmployees.length >= 4,
      });
      if (businessEmployees.length <= 3) {
        return applyDepartmentReportsToCeo({
          company: {
            ...params.company,
            departments: normalized.departments,
            employees: normalized.employees,
          },
          deptId: dept.id,
        });
      }
      return normalized;
    }
    case "flatten_small_department_to_ceo": {
      if (!params.recommendation.departmentId) {
        return {
          departments: params.company.departments ?? [],
          employees: params.company.employees,
          warnings: ["无法扁平化部门：缺少 departmentId"],
        };
      }
      return applyDepartmentReportsToCeo({
        company: params.company,
        deptId: params.recommendation.departmentId,
      });
    }
    case "introduce_department_lead": {
      if (!params.recommendation.departmentId || !params.recommendation.leadAgentId) {
        return {
          departments: params.company.departments ?? [],
          employees: params.company.employees,
          warnings: ["无法建立负责人：缺少部门或负责人候选"],
        };
      }
      return applyDepartmentLeadHierarchy({
        company: params.company,
        deptId: params.recommendation.departmentId,
        leadAgentId: params.recommendation.leadAgentId,
      });
    }
  }
}

export function autoCalibrateOrganization(company: Company): OrgAutoCalibrationResult {
  let current = cloneCompany(company);
  const warnings: string[] = [];
  const appliedRecommendations: OrgRecommendation[] = [];
  const seenRecommendationIds = new Set<string>();

  for (let step = 0; step < 6; step++) {
    const snapshot = buildOrgAdvisorSnapshot(current);
    const recommendation = snapshot.recommendations[0];
    if (!recommendation || seenRecommendationIds.has(recommendation.id)) {
      return {
        departments: current.departments ?? [],
        employees: current.employees,
        warnings,
        changed: appliedRecommendations.length > 0,
        appliedRecommendations,
        finalSnapshot: snapshot,
      };
    }

    seenRecommendationIds.add(recommendation.id);
    const result = applyOrgRecommendation({
      company: current,
      recommendation,
    });
    current = {
      ...current,
      departments: result.departments,
      employees: result.employees,
    };
    warnings.push(...result.warnings);
    appliedRecommendations.push(recommendation);
  }

  const finalSnapshot = buildOrgAdvisorSnapshot(current);
  return {
    departments: current.departments ?? [],
    employees: current.employees,
    warnings,
    changed: appliedRecommendations.length > 0,
    appliedRecommendations,
    finalSnapshot,
  };
}
