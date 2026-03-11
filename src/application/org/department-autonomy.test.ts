import { describe, expect, it } from "vitest";
import type { Company, WorkItemRecord } from "../../domain";
import {
  normalizeWorkItemDepartmentOwnership,
  resolveDefaultDepartmentDispatchTarget,
} from "./department-autonomy";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "",
    icon: "🏢",
    template: "blank",
    departments: [
      { id: "dep-ceo", name: "管理中枢", leadAgentId: "co-ceo", kind: "meta" },
      { id: "dep-hr", name: "人力资源部", leadAgentId: "co-hr", kind: "support" },
      { id: "dep-cto", name: "技术部", leadAgentId: "co-cto", kind: "support" },
      { id: "dep-writing", name: "小说创作部", leadAgentId: "writer-lead", kind: "business" },
    ],
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo", departmentId: "dep-ceo" },
      { agentId: "co-hr", nickname: "HR", role: "HR Director", isMeta: true, metaRole: "hr", departmentId: "dep-hr", reportsTo: "co-ceo" },
      { agentId: "co-cto", nickname: "CTO", role: "CTO", isMeta: true, metaRole: "cto", departmentId: "dep-cto", reportsTo: "co-ceo" },
      { agentId: "writer-lead", nickname: "主编", role: "创作部经理", isMeta: false, departmentId: "dep-writing", reportsTo: "co-ceo" },
      { agentId: "writer-a", nickname: "写手", role: "Writer", isMeta: false, departmentId: "dep-writing", reportsTo: "writer-lead" },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createWorkItem(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: "topic:mission:novel",
    workKey: "topic:mission:novel",
    kind: "strategic",
    roundId: "topic:mission:novel@1000",
    companyId: "company-1",
    sessionKey: "agent:co-ceo:main",
    topicKey: "mission:novel",
    sourceActorId: "co-ceo",
    sourceActorLabel: "CEO",
    sourceSessionKey: "agent:co-ceo:main",
    sourceConversationId: "agent:co-ceo:main",
    providerId: null,
    title: "搭建 AI 小说创作业务",
    goal: "启动小说创作业务并形成交付闭环。",
    headline: "搭建 AI 小说创作业务",
    displayStage: "CEO intake",
    displaySummary: "先判断业务归属。",
    displayOwnerLabel: "CEO",
    displayNextAction: "判断组织承接方式。",
    status: "active",
    stageLabel: "CEO intake",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    batonActorId: null,
    batonLabel: "CEO",
    roomId: "workitem:topic:mission:novel",
    artifactIds: [],
    dispatchIds: [],
    startedAt: 1_000,
    updatedAt: 1_100,
    completedAt: null,
    summary: "需要明确由谁承接业务。",
    nextAction: "先决定业务 owner。",
    steps: [],
    ...overrides,
  };
}

describe("normalizeWorkItemDepartmentOwnership", () => {
  it("routes content business work to HR when no business department exists", () => {
    const company = {
      ...createCompany(),
      departments: createCompany().departments?.filter((department) => department.id !== "dep-writing"),
      employees: createCompany().employees.filter((employee) => employee.agentId !== "writer-lead" && employee.agentId !== "writer-a"),
    };
    const normalized = normalizeWorkItemDepartmentOwnership({
      company,
      workItem: createWorkItem(),
    });

    expect(normalized).toMatchObject({
      ownerActorId: "co-hr",
      executionLevel: "department",
      owningDepartmentId: "dep-hr",
    });
    expect(normalized.nextAction).toContain("先由 HR 组建业务团队");
  });

  it("routes software delivery work to CTO as interim engineering owner when no engineering department exists", () => {
    const normalized = normalizeWorkItemDepartmentOwnership({
      company: createCompany(),
      workItem: createWorkItem({
        title: "长期软件产品开发",
        goal: "启动一个新的软件产品并持续迭代。",
        summary: "需要明确工程承接方式。",
      }),
    });

    expect(normalized).toMatchObject({
      ownerActorId: "co-cto",
      executionLevel: "department",
      owningDepartmentId: "dep-cto",
    });
    expect(normalized.nextAction).toContain("CTO 暂代工程负责人");
  });
});

describe("resolveDefaultDepartmentDispatchTarget", () => {
  it("routes CEO dispatches to the department manager by default", () => {
    const target = resolveDefaultDepartmentDispatchTarget({
      company: createCompany(),
      fromActorId: "co-ceo",
      preferredTargetAgentId: "writer-a",
    });

    expect(target).toEqual({
      agentId: "writer-lead",
      label: "主编",
    });
  });

  it("lets the department manager dispatch directly to a member inside the same department", () => {
    const target = resolveDefaultDepartmentDispatchTarget({
      company: createCompany(),
      fromActorId: "writer-lead",
      preferredTargetAgentId: "writer-a",
    });

    expect(target).toEqual({
      agentId: "writer-a",
      label: "写手",
    });
  });
});
