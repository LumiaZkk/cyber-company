import type { Company, EmployeeRef } from "./types";

export const COMPANY_CONTEXT_FILE_NAME = "company-context.json";
export const CEO_OPERATIONS_FILE_NAME = "OPERATIONS.md";

type CompanyContextEmployeeRecord = {
  agentId: string;
  nickname: string;
  role: string;
  metaRole?: EmployeeRef["metaRole"];
  isMeta: boolean;
  reportsTo: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentLeadAgentId: string | null;
};

function resolveDepartmentLookup(company: Company) {
  return new Map((company.departments ?? []).map((department) => [department.id, department] as const));
}

function normalizeCompanyContextEmployee(
  company: Company,
  employee: EmployeeRef,
): CompanyContextEmployeeRecord {
  const departmentsById = resolveDepartmentLookup(company);
  const department = employee.departmentId ? departmentsById.get(employee.departmentId) ?? null : null;

  return {
    agentId: employee.agentId,
    nickname: employee.nickname,
    role: employee.role,
    metaRole: employee.metaRole,
    isMeta: employee.isMeta,
    reportsTo: employee.reportsTo ?? null,
    departmentId: employee.departmentId ?? null,
    departmentName: department?.name ?? null,
    departmentLeadAgentId: department?.leadAgentId ?? null,
  };
}

export function buildCompanyContextSnapshot(company: Company) {
  const employees = company.employees.map((employee) =>
    normalizeCompanyContextEmployee(company, employee),
  );
  const metaAgents = {
    ceo: employees.find((employee) => employee.metaRole === "ceo")?.agentId ?? null,
    hr: employees.find((employee) => employee.metaRole === "hr")?.agentId ?? null,
    cto: employees.find((employee) => employee.metaRole === "cto")?.agentId ?? null,
    coo: employees.find((employee) => employee.metaRole === "coo")?.agentId ?? null,
  };

  return {
    version: 1,
    generatedAt: Date.now(),
    company: {
      id: company.id,
      name: company.name,
      description: company.description,
      icon: company.icon,
      template: company.template,
    },
    metaAgents,
    departments: (company.departments ?? []).map((department) => ({
      id: department.id,
      name: department.name,
      leadAgentId: department.leadAgentId,
      color: department.color ?? null,
      order: department.order ?? null,
    })),
    employees,
    quickPrompts: company.quickPrompts.map((prompt) => ({
      label: prompt.label,
      targetAgentId: prompt.targetAgentId,
    })),
  };
}

function buildEmployeeDirectoryLines(company: Company): string[] {
  const snapshot = buildCompanyContextSnapshot(company);
  return snapshot.employees.map((employee) => {
    const metaBadge = employee.metaRole ? ` [${employee.metaRole.toUpperCase()}]` : "";
    const manager = employee.reportsTo ? `，汇报给 ${employee.reportsTo}` : "，最高负责人";
    const department = employee.departmentName ? `，部门：${employee.departmentName}` : "";
    return `- ${employee.nickname}${metaBadge} (${employee.role}) -> ${employee.agentId}${department}${manager}`;
  });
}

export function buildCeoOperationsGuide(company: Company): string {
  const snapshot = buildCompanyContextSnapshot(company);
  const employeeDirectory = buildEmployeeDirectoryLines(company).join("\n");

  return `# CEO 执行准则

公司：${company.name}
CEO：${snapshot.metaAgents.ceo ?? "未配置"}

## 开场动作
1. 先读取 \`${COMPANY_CONTEXT_FILE_NAME}\`，它是当前组织结构的唯一准确信息源。
2. 只基于 roster 里的真实员工推进任务，不要猜测不存在的 agent。

## 委派硬规则
1. 只能把任务发给 roster 中已经存在的员工 agentId。
2. 公司内普通派单必须优先使用 \`company_dispatch\`；它会自动校验 roster、固定路由到员工主会话并记录生命周期事件。
3. 员工接单、完成、阻塞时必须要求他们使用 \`company_report\` 回执；不要只依赖自由文本消息来判断状态。
4. \`company_spawn_subtask\` / \`sessions_spawn\` 只用于临时隔离子任务/子运行时，严禁把它当成给 CTO / COO / HR 这类既有员工发消息的方式。
5. 严禁创建或借用通用 agent（例如 \`claude-code\`）来冒充 CTO / COO / HR。
6. 严禁借用你自己的 workspace 代替 CTO / COO / HR 执行他们的具体工作。
7. 如果委派工具报错、运行时缺失、线程绑定不可用，必须立刻向老板明确报告“委派能力不可用，当前阻塞”。
8. 在真实收到下属接单或回执前，不得把 \`TASK-BOARD.md\` 写成“进行中”。

## 当前 roster
${employeeDirectory || "- 暂无员工"}
`;
}
