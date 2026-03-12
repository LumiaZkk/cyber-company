import { describe, expect, it } from "vitest";
import {
  buildCeoOperationsGuide,
  buildCompanyContextSnapshot,
  buildDepartmentContextSnapshot,
  buildDepartmentOperationsGuide,
} from "./agent-context";
import { buildCollaborationContextSnapshot } from "./collaboration-context";
import type { Company, WorkItemRecord } from "../../domain";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "围绕多角色协作推进真实工作",
    icon: "🏢",
    template: "blank",
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo", departmentId: "dep-ceo" },
      { agentId: "co-cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto", reportsTo: "co-ceo", departmentId: "dep-cto" },
      { agentId: "co-coo", nickname: "COO", role: "Chief Operating Officer", isMeta: true, metaRole: "coo", reportsTo: "co-ceo", departmentId: "dep-coo" },
      { agentId: "writer-lead", nickname: "主编", role: "创作部经理", isMeta: false, reportsTo: "co-ceo", departmentId: "dep-writing" },
      { agentId: "writer-a", nickname: "小李", role: "主笔", isMeta: false, reportsTo: "writer-lead", departmentId: "dep-writing" },
      { agentId: "writer-b", nickname: "小王", role: "剧情设计", isMeta: false, reportsTo: "writer-lead", departmentId: "dep-writing" },
    ],
    departments: [
      { id: "dep-ceo", name: "管理中枢", leadAgentId: "co-ceo", kind: "meta" },
      { id: "dep-cto", name: "技术部", leadAgentId: "co-cto", kind: "support" },
      { id: "dep-coo", name: "运营部", leadAgentId: "co-coo", kind: "support" },
      { id: "dep-writing", name: "小说创作部", leadAgentId: "writer-lead", kind: "business" },
    ],
    supportRequests: [
      {
        id: "support-1",
        workItemId: "topic:mission:alpha",
        requesterDepartmentId: "dep-writing",
        targetDepartmentId: "dep-cto",
        requestedByActorId: "writer-lead",
        summary: "需要章节一致性校验工具",
        status: "open",
        createdAt: 1_500,
        updatedAt: 1_500,
      },
    ],
    quickPrompts: [
      {
        label: "让 CEO 梳理主线",
        icon: "🧭",
        prompt: "先帮我梳理目标、分工和下一步。",
        targetAgentId: "co-ceo",
      },
    ],
    createdAt: 1,
  };
}

function createWorkItem(): WorkItemRecord {
  return {
    id: "topic:mission:alpha",
    workKey: "topic:mission:alpha",
    kind: "strategic",
    roundId: "topic:mission:alpha",
    companyId: "company-1",
    sessionKey: "agent:co-ceo:main",
    topicKey: "mission:alpha",
    sourceActorId: "co-ceo",
    sourceActorLabel: "CEO",
    sourceSessionKey: "agent:co-ceo:main",
    sourceConversationId: "agent:co-ceo:main",
    providerId: null,
    title: "推进交付闭环",
    goal: "打通交付闭环",
    headline: "推进交付闭环",
    displayStage: "CEO 收口",
    displaySummary: "当前交付闭环正在推进。",
    displayOwnerLabel: "CEO",
    displayNextAction: "让 CTO 输出执行方案。",
    status: "active",
    lifecyclePhase: "active_requirement",
    stageGateStatus: "confirmed",
    stageLabel: "CEO 收口",
    owningDepartmentId: "dep-writing",
    executionLevel: "department",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    batonActorId: "co-cto",
    batonLabel: "CTO",
    parentWorkItemId: null,
    roomId: "workitem:topic:mission:alpha",
    artifactIds: [],
    dispatchIds: [],
    startedAt: 1_000,
    updatedAt: 2_000,
    completedAt: null,
    summary: "当前交付闭环正在推进。",
    nextAction: "让 CTO 输出执行方案。",
    steps: [],
  };
}

describe("buildCompanyContextSnapshot", () => {
  it("includes inventory for open work items, knowledge, and workspace apps", () => {
    const snapshot = buildCompanyContextSnapshot(createCompany(), {
      activeWorkItems: [createWorkItem()],
      activeEscalations: [
        {
          id: "esc-1",
          sourceType: "support_request",
          sourceId: "support-1",
          companyId: "company-1",
          workItemId: "topic:mission:alpha",
          requesterDepartmentId: "dep-writing",
          targetActorId: "co-ceo",
          reason: "支持请求超时，需要 CEO 协调",
          severity: "warning",
          status: "open",
          createdAt: 1_700,
          updatedAt: 1_800,
        },
      ],
      activeDecisionTickets: [
        {
          id: "decision-1",
          companyId: "company-1",
          sourceType: "escalation",
          sourceId: "esc-1",
          escalationId: "esc-1",
          decisionOwnerActorId: "co-ceo",
          decisionType: "headcount",
          summary: "是否批准扩编",
          options: [{ id: "approve", label: "批准" }],
          requiresHuman: true,
          status: "pending_human",
          createdAt: 1_900,
          updatedAt: 2_000,
        },
      ],
    });

    expect(snapshot.version).toBe(4);
    expect(snapshot.inventory.openWorkItems).toHaveLength(1);
    expect(snapshot.inventory.openWorkItems[0]).toMatchObject({
      title: "推进交付闭环",
      ownerLabel: "CEO",
      owningDepartmentId: "dep-writing",
      executionLevel: "department",
    });
    expect(snapshot.organization.operatingMode.label).toBeTruthy();
    expect(snapshot.organization.businessDepartments[0]).toMatchObject({
      name: "小说创作部",
      leadAgentId: "writer-lead",
    });
    expect(snapshot.inventory.openSupportRequests[0]).toMatchObject({
      targetDepartmentId: "dep-cto",
    });
    expect(snapshot.inventory.escalations[0]).toMatchObject({
      sourceType: "support_request",
      targetActorId: "co-ceo",
    });
    expect(snapshot.inventory.decisionTickets[0]).toMatchObject({
      requiresHuman: true,
      decisionType: "headcount",
    });
    expect(snapshot.inventory.knowledge.length).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.inventory.workspaceApps)).toBe(true);
  });
});

describe("buildCeoOperationsGuide", () => {
  it("documents the lightweight reply contract and business ownership guardrails", () => {
    const guide = buildCeoOperationsGuide(createCompany());

    expect(guide).toContain("当前理解");
    expect(guide).toContain("建议下一步");
    expect(guide).toContain("是否可推进");
    expect(guide).toContain("不要把完整清单逐条念给老板");
    expect(guide).toContain("业务归属判断");
    expect(guide).toContain("不要把业务活硬塞给 CTO / COO");
  });
});

describe("buildDepartmentContextSnapshot", () => {
  it("builds department-level execution context for managers", () => {
    const snapshot = buildDepartmentContextSnapshot({
      company: createCompany(),
      managerAgentId: "writer-lead",
      runtime: {
        activeWorkItems: [createWorkItem()],
      },
    });

    expect(snapshot.manager).toMatchObject({
      agentId: "writer-lead",
      nickname: "主编",
    });
    expect(snapshot.departments[0]).toMatchObject({
      name: "小说创作部",
      kind: "business",
      memberCount: 3,
    });
    expect(snapshot.departments[0]?.openWorkItems[0]).toMatchObject({
      id: "topic:mission:alpha",
      executionLevel: "department",
    });
    expect(snapshot.escalationRules).toContain("工具、系统、自动化问题先找 CTO。");
  });
});

describe("buildDepartmentOperationsGuide", () => {
  it("documents manager-owned execution and support escalation rules", () => {
    const guide = buildDepartmentOperationsGuide({
      company: createCompany(),
      managerAgentId: "writer-lead",
      runtime: {
        activeWorkItems: [createWorkItem()],
      },
    });

    expect(guide).toContain("部门负责人执行准则");
    expect(guide).toContain("部门主线 owner 默认是你");
    expect(guide).toContain("向对应支持部门提出支持请求");
  });

  it("adds authority-first hiring rules for HR managers", () => {
    const company = {
      ...createCompany(),
      employees: [
        ...createCompany().employees,
        {
          agentId: "co-hr",
          nickname: "HR",
          role: "Human Resources Director",
          isMeta: true,
          metaRole: "hr" as const,
          reportsTo: "co-ceo",
          departmentId: "dep-hr",
        },
      ],
      departments: [
        ...(createCompany().departments ?? []),
        { id: "dep-hr", name: "人力资源部", leadAgentId: "co-hr", kind: "support" as const },
      ],
    };

    const guide = buildDepartmentOperationsGuide({
      company,
      managerAgentId: "co-hr",
    });

    expect(guide).toContain("HR 招聘硬规则");
    expect(guide).toContain("authority.company.employee.hire");
    expect(guide).toContain("不要走 `agents.create` + 手工补文件的旧流程");
  });
});

describe("buildCollaborationContextSnapshot", () => {
  it("grants department members scoped collaboration targets and report chain", () => {
    const snapshot = buildCollaborationContextSnapshot({
      company: createCompany(),
      agentId: "writer-a",
    });

    expect(snapshot.self).toMatchObject({
      agentId: "writer-a",
      departmentId: "dep-writing",
    });
    expect(snapshot.manager).toMatchObject({
      agentId: "writer-lead",
    });
    expect(snapshot.allowedDispatchTargets.map((target) => target.agentId)).toEqual([
      "writer-b",
      "writer-lead",
    ]);
    expect(snapshot.defaultReportChain.map((target) => target.agentId)).toEqual([
      "writer-lead",
      "co-ceo",
    ]);
    expect(snapshot.supportTargets.map((target) => target.agentId)).toEqual([
      "co-coo",
      "co-cto",
    ]);
    expect(snapshot.escalationTargets.map((target) => target.agentId)).toEqual([
      "co-ceo",
      "writer-lead",
    ]);
  });

  it("lets a global dispatch role reach the full company roster", () => {
    const snapshot = buildCollaborationContextSnapshot({
      company: createCompany(),
      agentId: "co-ceo",
    });

    expect(snapshot.allowedDispatchTargets.map((target) => target.agentId)).toEqual([
      "co-coo",
      "co-cto",
      "writer-a",
      "writer-b",
      "writer-lead",
    ]);
  });

  it("expands explicit department edges into allowed dispatch targets", () => {
    const snapshot = buildCollaborationContextSnapshot({
      company: {
        ...createCompany(),
        orgSettings: {
          collaborationPolicy: {
            explicitEdges: [
              {
                fromDepartmentId: "dep-writing",
                toDepartmentId: "dep-coo",
              },
            ],
          },
        },
      },
      agentId: "writer-a",
    });

    expect(snapshot.allowedDispatchTargets.map((target) => target.agentId)).toEqual([
      "co-coo",
      "writer-b",
      "writer-lead",
    ]);
    expect(snapshot.allowedDispatchTargets.find((target) => target.agentId === "co-coo")?.reason).toBe(
      "explicit_edge",
    );
  });

  it("automatically includes newly added department peers without editing policy", () => {
    const company = createCompany();
    company.employees.push({
      agentId: "writer-c",
      nickname: "小周",
      role: "审核",
      isMeta: false,
      reportsTo: "writer-lead",
      departmentId: "dep-writing",
    });

    const snapshot = buildCollaborationContextSnapshot({
      company,
      agentId: "writer-a",
    });

    expect(snapshot.allowedDispatchTargets.map((target) => target.agentId)).toEqual([
      "writer-b",
      "writer-c",
      "writer-lead",
    ]);
    expect(snapshot.allowedDispatchTargets.find((target) => target.agentId === "writer-c")?.reason).toBe(
      "department_peer",
    );
  });
});
