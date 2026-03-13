import { buildOrgAdvisorSnapshot } from "../assignment/org-fit";
import {
  buildDepartmentOpenSupportRequests,
  buildDepartmentOpenWorkItems,
  inferDepartmentKind,
  resolveDepartmentMembers,
  resolveDepartmentsManagedByActor,
  resolveEmployee,
  resolveSupportDepartments,
} from "../org/department-autonomy";
import { resolveCompanyKnowledge } from "../artifact/shared-knowledge";
import { isSupportRequestActive } from "../../domain/delegation/support-request";
import type { WorkItemRecord } from "../../domain/mission/types";
import type { Company, EmployeeRef } from "../../domain/org/types";
import { getCompanyWorkspaceApps } from "./workspace-apps";

export const COMPANY_CONTEXT_FILE_NAME = "company-context.json";
export const CEO_OPERATIONS_FILE_NAME = "OPERATIONS.md";
export const DEPARTMENT_CONTEXT_FILE_NAME = "department-context.json";
export const DEPARTMENT_OPERATIONS_FILE_NAME = "DEPARTMENT-OPERATIONS.md";

type CompanyContextEmployeeRecord = {
  agentId: string;
  nickname: string;
  role: string;
  metaRole?: EmployeeRef["metaRole"];
  isMeta: boolean;
  isDepartmentManager: boolean;
  reportsTo: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentKind: "meta" | "support" | "business" | null;
  managerAgentId: string | null;
};

type CompanyContextRuntimeSnapshot = {
  activeWorkItems?: WorkItemRecord[];
  activeSupportRequests?: Company["supportRequests"];
  activeEscalations?: Company["escalations"];
  activeDecisionTickets?: Company["decisionTickets"];
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
    isDepartmentManager: department?.leadAgentId === employee.agentId,
    reportsTo: employee.reportsTo ?? null,
    departmentId: employee.departmentId ?? null,
    departmentName: department?.name ?? null,
    departmentKind: department ? inferDepartmentKind(company, department) : null,
    managerAgentId: department?.leadAgentId ?? null,
  };
}

function buildOpenWorkItemInventory(runtime?: CompanyContextRuntimeSnapshot) {
  return (runtime?.activeWorkItems ?? [])
    .filter((workItem) => workItem.status !== "completed" && workItem.status !== "archived")
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 8)
    .map((workItem) => ({
      id: workItem.id,
      title: workItem.title,
      kind: workItem.kind,
      status: workItem.status,
      owningDepartmentId: workItem.owningDepartmentId ?? null,
      executionLevel: workItem.executionLevel ?? null,
      ownerActorId: workItem.ownerActorId ?? null,
      ownerLabel: workItem.ownerLabel,
      stage: workItem.displayStage || workItem.stageLabel,
      nextAction: workItem.displayNextAction || workItem.nextAction,
      updatedAt: workItem.updatedAt,
    }));
}

function buildKnowledgeInventory(company: Company) {
  return resolveCompanyKnowledge(company)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      summary: item.summary,
      ownerAgentId: item.ownerAgentIds?.[0] ?? null,
      updatedAt: item.updatedAt,
    }));
}

function buildWorkspaceAppInventory(company: Company) {
  return getCompanyWorkspaceApps(company).map((app) => ({
    id: app.id,
    title: app.title,
    kind: app.kind,
    status: app.status,
    ownerAgentId: app.ownerAgentId ?? null,
    surface: app.surface ?? null,
    template: app.template ?? null,
  }));
}

function buildBusinessDepartmentInventory(company: Company) {
  const employeesById = new Map(company.employees.map((employee) => [employee.agentId, employee] as const));
  return (company.departments ?? [])
    .filter((department) => inferDepartmentKind(company, department) === "business")
    .map((department) => {
      const lead = employeesById.get(department.leadAgentId)!;
      const memberCount = company.employees.filter(
        (employee) => !employee.isMeta && employee.departmentId === department.id,
      ).length;
      return {
        id: department.id,
        name: department.name,
        leadAgentId: department.leadAgentId,
        leadLabel: lead.nickname || lead.role || lead.agentId,
        kind: inferDepartmentKind(company, department),
        memberCount,
      };
    });
}

function buildOrganizationInventory(company: Company) {
  const advisor = buildOrgAdvisorSnapshot(company);
  return {
    headline: advisor.headline,
    summary: advisor.summary,
    operatingMode: advisor.operatingMode,
    businessDepartments: buildBusinessDepartmentInventory(company),
    recommendations: advisor.recommendations.map((recommendation) => ({
      id: recommendation.id,
      kind: recommendation.kind,
      title: recommendation.title,
      summary: recommendation.summary,
      actionLabel: recommendation.actionLabel,
      priority: recommendation.priority,
      departmentId: recommendation.departmentId ?? null,
      leadAgentId: recommendation.leadAgentId ?? null,
    })),
  };
}

export function buildCompanyContextSnapshot(
  company: Company,
  runtime?: CompanyContextRuntimeSnapshot,
) {
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
    version: 4,
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
      managerAgentId: department.leadAgentId,
      leadAgentId: department.leadAgentId,
      kind: inferDepartmentKind(company, department),
      color: department.color ?? null,
      order: department.order ?? null,
      missionPolicy: department.missionPolicy ?? null,
    })),
    employees,
    quickPrompts: company.quickPrompts.map((prompt) => ({
      label: prompt.label,
      targetAgentId: prompt.targetAgentId,
    })),
    organization: buildOrganizationInventory(company),
    inventory: {
      openWorkItems: buildOpenWorkItemInventory(runtime),
      openSupportRequests: (runtime?.activeSupportRequests ?? company.supportRequests ?? [])
        .filter((request) => request && isSupportRequestActive(request))
        .slice(0, 8)
        .map((request) => ({
          id: request.id,
          summary: request.summary,
          status: request.status,
          workItemId: request.workItemId,
          requesterDepartmentId: request.requesterDepartmentId,
          targetDepartmentId: request.targetDepartmentId,
          updatedAt: request.updatedAt,
        })),
      escalations: (runtime?.activeEscalations ?? company.escalations ?? [])
        .filter((escalation) => escalation && (escalation.status === "open" || escalation.status === "acknowledged"))
        .slice(0, 8)
        .map((escalation) => ({
          id: escalation.id,
          reason: escalation.reason,
          sourceType: escalation.sourceType,
          severity: escalation.severity,
          targetActorId: escalation.targetActorId,
          updatedAt: escalation.updatedAt,
        })),
      decisionTickets: (runtime?.activeDecisionTickets ?? company.decisionTickets ?? [])
        .filter((ticket) => ticket && (ticket.status === "open" || ticket.status === "pending_human"))
        .slice(0, 8)
        .map((ticket) => ({
          id: ticket.id,
          summary: ticket.summary,
          decisionType: ticket.decisionType,
          requiresHuman: ticket.requiresHuman,
          status: ticket.status,
          updatedAt: ticket.updatedAt,
        })),
      knowledge: buildKnowledgeInventory(company),
      workspaceApps: buildWorkspaceAppInventory(company),
    },
  };
}

function buildEmployeeDirectoryLines(company: Company): string[] {
  const snapshot = buildCompanyContextSnapshot(company);
  return snapshot.employees.map((employee) => {
    const metaBadge = employee.metaRole ? ` [${employee.metaRole.toUpperCase()}]` : "";
    const manager = employee.reportsTo ? `，汇报给 ${employee.reportsTo}` : "，最高负责人";
    const department = employee.departmentName
      ? `，部门：${employee.departmentName}${employee.departmentKind ? ` (${employee.departmentKind})` : ""}`
      : "";
    const managerBadge = employee.isDepartmentManager ? "，部门负责人" : "";
    return `- ${employee.nickname}${metaBadge} (${employee.role}) -> ${employee.agentId}${department}${managerBadge}${manager}`;
  });
}

export function buildDepartmentContextSnapshot(input: {
  company: Company;
  managerAgentId: string;
  runtime?: CompanyContextRuntimeSnapshot;
}) {
  const manager = resolveEmployee(input.company, input.managerAgentId);
  const managedDepartments = resolveDepartmentsManagedByActor(input.company, input.managerAgentId);
  const supportDepartments = resolveSupportDepartments(input.company)
    .filter((department) => department.leadAgentId !== input.managerAgentId)
    .map((department) => ({
      id: department.id,
      name: department.name,
      kind: inferDepartmentKind(input.company, department),
      managerAgentId: department.leadAgentId,
      managerLabel: resolveEmployee(input.company, department.leadAgentId)?.nickname ?? department.leadAgentId,
    }));

  return {
    version: 1,
    generatedAt: Date.now(),
    manager: manager
      ? {
          agentId: manager.agentId,
          nickname: manager.nickname,
          role: manager.role,
          metaRole: manager.metaRole ?? null,
        }
      : null,
    departments: managedDepartments.map((department) => {
      const members = resolveDepartmentMembers(input.company, department.id);
      return {
        id: department.id,
        name: department.name,
        kind: inferDepartmentKind(input.company, department),
        missionPolicy: department.missionPolicy ?? null,
        memberCount: members.length,
        members: members.map((employee) => ({
          agentId: employee.agentId,
          nickname: employee.nickname,
          role: employee.role,
          reportsTo: employee.reportsTo ?? null,
          isManager: employee.agentId === department.leadAgentId,
        })),
        openWorkItems: buildDepartmentOpenWorkItems({
          company: input.company,
          departmentId: department.id,
          managerAgentId: input.managerAgentId,
          workItems: input.runtime?.activeWorkItems,
        })
          .slice(0, 8)
          .map((workItem) => ({
            id: workItem.id,
            title: workItem.title,
            status: workItem.status,
            stage: workItem.displayStage || workItem.stageLabel,
            nextAction: workItem.displayNextAction || workItem.nextAction,
            executionLevel: workItem.executionLevel ?? null,
            ownerActorId: workItem.ownerActorId ?? null,
            batonActorId: workItem.batonActorId ?? null,
            updatedAt: workItem.updatedAt,
          })),
        openSupportRequests: buildDepartmentOpenSupportRequests({
          company: {
            ...input.company,
            supportRequests: input.runtime?.activeSupportRequests ?? input.company.supportRequests,
          },
          departmentId: department.id,
        })
          .slice(0, 8)
          .map((request) => ({
            id: request.id,
            summary: request.summary,
            status: request.status,
            targetDepartmentId: request.targetDepartmentId,
            requesterDepartmentId: request.requesterDepartmentId,
            updatedAt: request.updatedAt,
          })),
      };
    }),
    supportDepartments,
    escalationRules:
      managedDepartments.length > 0 &&
      managedDepartments.every((department) => inferDepartmentKind(input.company, department) === "business")
        ? [
            "工具、系统、自动化问题先找 CTO。",
            "流程、渠道、节奏、运营机制问题先找 COO。",
            "招聘、编制、组织结构问题先找 HR。",
            "预算、优先级冲突、跨部门阻塞升级给 CEO。",
          ]
        : [
            "支持部门默认只承接支持请求，不替业务部门交付主业务。",
            "跨部门优先级或资源冲突升级给 CEO。",
          ],
  };
}

export function buildDepartmentOperationsGuide(input: {
  company: Company;
  managerAgentId: string;
  runtime?: CompanyContextRuntimeSnapshot;
}): string {
  const snapshot = buildDepartmentContextSnapshot(input);
  const departmentLines = snapshot.departments
    .map(
      (department) =>
        `- ${department.name} [${department.kind}]：成员 ${department.memberCount} 人，开放主线 ${department.openWorkItems.length} 条，支持请求 ${department.openSupportRequests.length} 条`,
    )
    .join("\n");
  const supportLines = snapshot.supportDepartments
    .map(
      (department) =>
        `- ${department.name} -> ${department.managerLabel} (${department.managerAgentId})`,
    )
    .join("\n");
  const escalationLines = snapshot.escalationRules.map((rule) => `- ${rule}`).join("\n");
  const hrHiringSection =
    snapshot.manager?.metaRole === "hr"
      ? `

## HR 招聘硬规则
1. 正式招聘必须调用 \`authority.company.employee.hire\`，不要走 \`agents.create\` + 手工补文件的旧流程。
2. 招聘成功的判定标准是：员工已经写入 canonical company roster，而不是只在某个 workspace 里出现了 agent 文件夹。
3. 严禁直接手改 \`company-context.json\` 来冒充“已入职”；该文件只应作为 authority 已落盘状态的镜像。
4. 如果 authority hire 失败，你应该回报阻塞并说明失败原因，而不是继续半手工补人。
5. 如需新增业务部门且同一轮要补多人，优先调用 \`authority.company.employee.batch_hire\`；它会先校验每个新部门至少有一个 \`makeDepartmentLead=true\`，再按负责人优先落盘。
6. 如果只是单人补位，才继续使用 \`authority.company.employee.hire\`；如需新增业务部门，可在参数里同时提供 \`departmentName\`、\`departmentKind\`、\`makeDepartmentLead\`，让入职和组织调整一次完成。
`
      : "";

  return `# 部门负责人执行准则

公司：${input.company.name}
负责人：${snapshot.manager?.nickname ?? input.managerAgentId}

## 默认工作方式
1. 先读取 \`${DEPARTMENT_CONTEXT_FILE_NAME}\`，确认本部门目标、成员、开放主线和待处理支持请求。
2. 先读取 \`collaboration-context.json\`，确认你当前允许协作的对象、默认汇报链和升级目标。
3. 你默认拥有本部门主线，不要把 CEO 当作日常项目经理。成员默认先向你回报，不直接绕过你找 CEO。
4. 收到 CEO 的目标后，先拆本部门计划，再决定是否把子任务发给部门成员。
5. 如果需要工具、流程、招聘或资源支持，向对应支持部门提出支持请求；不要把主线 owner 直接让给 CTO / COO / HR。

## 协作边界
1. 部门主线 owner 默认是你；部门成员的子任务只是挂在你的主线下面。
2. 部门内外的正式协作交接优先使用 \`company_dispatch\`；针对某一条具体 dispatch 的回执必须使用 \`company_report\`。
3. CEO 只需要看到阶段结果、风险和需要拍板的事项，不需要盯你部门内部每一棒。
4. 只有 CEO 明确 override 时，才允许跨过部门经理直接派给个人。
5. 如果收到不属于本部门的业务交付，先指出归属错误，再建议正确的承接部门或所需支持。

## 当前负责部门
${departmentLines || "- 当前没有挂在你名下的部门。"}

## 可调用支持部门
${supportLines || "- 当前没有额外支持部门。"}

## 升级规则
${escalationLines}
${hrHiringSection}
`;
}

export function buildCeoOperationsGuide(company: Company): string {
  const snapshot = buildCompanyContextSnapshot(company);
  const employeeDirectory = buildEmployeeDirectoryLines(company).join("\n");
  const businessDepartmentLines = snapshot.organization.businessDepartments
    .map(
      (department) =>
        `- ${department.name} -> ${department.leadLabel} (${department.leadAgentId})，成员 ${department.memberCount} 人`,
    )
    .join("\n");
  const organizationRecommendationLines = snapshot.organization.recommendations
    .map((recommendation) => `- [${recommendation.priority}] ${recommendation.title}：${recommendation.summary}`)
    .join("\n");

  return `# CEO 执行准则

公司：${company.name}
CEO：${snapshot.metaAgents.ceo ?? "未配置"}

## 开场动作
1. 先读取 \`${COMPANY_CONTEXT_FILE_NAME}\`，它是当前公司 roster、开放工作项、知识沉淀和 workspace 能力的统一清单。
2. 再读取 \`collaboration-context.json\`，确认你当前可直接协作的对象、默认汇报链和升级目标。
3. 每次收到新目标、明显改题或老板追问“公司里现在有什么”时，先根据这份清单判断：哪些能力能复用、哪些缺口必须先补、现在能不能直接推进。
4. 不要把完整清单逐条念给老板；只需要在回复里说明“有哪些现有条件可用、缺什么、为什么下一步这样安排”。

## 对老板的第一轮回复
1. 先用自然语言简短复述你对目标的理解，并结合当前公司能力判断是否能继续推进。
2. 只有在信息缺口会实质改变方案时，才追问 1 到 3 个关键问题。
3. 自然语言正文后，必须追加这 3 行轻量标签：
   - \`当前理解：...\`
   - \`建议下一步：...\`
   - \`是否可推进：是 / 否\`
4. 当 \`当前理解\` 与 \`建议下一步\` 已经稳定时，同时通过内部 \`commit_requirement_draft\` 约定写入隐藏 \`metadata.control\`：
   - 格式固定为 \`{ version: 1, requirementDraft: { ... }, decision?: { ... } }\`
   - \`requirementDraft\` 字段固定为 \`summary\`、\`nextAction\`、\`ownerActorId?\`、\`ownerLabel?\`、\`stage?\`、\`topicKey?\`、\`canProceed?\`、\`stageGateStatus\`
   - 如果你是在等老板确认后再启动执行，必须同时写入 \`decision\`，格式为 \`{ key, type: "requirement_gate", summary, options[], requiresHuman: true }\`，并把 \`stageGateStatus\` 写成 \`waiting_confirmation\`
   - 已经确认或已明确进入真实执行时，\`stageGateStatus\` 写成 \`confirmed\`
   - metadata 内容要和可见标签语义一致，但不要把 JSON 或协议头直接输出到正文里
   - 不要为了写 metadata 再额外制造可见 toolResult 或调试噪音
5. 不要在第一轮就输出大段行业分析，不要一次性假装已经形成完整主线。
6. 只有当你决定真实进入执行、或已经开始派单/接手推进时，才进入任务拆解和长期跟踪。

## 业务归属判断
1. 每次进入执行前，先判断这次需求属于哪一类：业务交付 / 技术使能 / 运营优化 / 组织建设。
2. CEO、CTO、COO、HR 都是管理或支持角色，不默认承接业务交付。
3. 文章、小说、课程、设计稿、销售文案、客服话术等直接面向外部或用户的产出，默认属于业务交付；应优先交给业务部门、业务负责人或对应业务员工。
4. CTO 只负责工具、系统、集成、自动化、排障；COO 只负责流程、渠道、数据、运营机制；HR 只负责人岗与组织结构。
5. 如果当前 roster 没有能承接该业务的团队或负责人，先明确“业务承接人缺失”，再让 HR 补业务团队或新增岗位；不要把业务活硬塞给 CTO / COO。
6. 小团队可以暂时由业务成员直接向 CEO 汇报，但业务产出仍归业务成员，不归 meta 管理层。

## 委派硬规则
1. 只能把任务发给 roster 中已经存在的员工 agentId。
2. 公司内受控协作交接必须优先使用 \`company_dispatch\`；它会按协作作用域校验目标、固定路由到员工主会话并记录生命周期事件。
3. 员工接到具体 dispatch 后，acknowledged / answered / blocked 都必须用 \`company_report\` 回给该 dispatch 发起人；不要只依赖自由文本消息来判断状态。
4. \`company_spawn_subtask\` / \`sessions_spawn\` 只用于临时隔离子任务/子运行时，严禁把它当成给 CTO / COO / HR 这类既有员工发消息的方式。
5. 严禁创建或借用通用 agent（例如 \`claude-code\`）来冒充 CTO / COO / HR。
6. 严禁借用你自己的 workspace 代替 CTO / COO / HR 执行他们的具体工作。
7. 如果委派工具报错、运行时缺失、线程绑定不可用，必须立刻向老板明确报告“委派能力不可用，当前阻塞”。
8. 在真实收到下属接单或回执前，不得把 \`TASK-BOARD.md\` 写成“进行中”。
9. 涉及正式招聘时，要求 HR 通过 authority 完成员工入职；单人用 \`authority.company.employee.hire\`，同一轮新部门多岗位优先用 \`authority.company.employee.batch_hire\`，不要接受“只创建了 agent / 只改了文件”的半完成状态。

## 当前组织判断
- 当前组织模式：${snapshot.organization.operatingMode.label}；${snapshot.organization.operatingMode.summary}
- 组织诊断：${snapshot.organization.summary}

### 当前业务部门
${businessDepartmentLines || "- 暂无明确业务部门；如本轮需求属于业务交付，先判断是否需要 HR 补团队。"}

### 当前升级与人类决策
- CEO 待处理升级项：${snapshot.inventory.escalations.length} 条
- 待人类决策票据：${snapshot.inventory.decisionTickets.length} 条

### 当前组织建议
${organizationRecommendationLines || "- 当前没有额外组织调整建议。"}

## 当前 roster
${employeeDirectory || "- 暂无员工"}
`;
}
