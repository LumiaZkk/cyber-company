import { describe, expect, it } from "vitest";
import type { Company } from "./types";
import { planHiredEmployee } from "./hiring";

function buildCompany(): Company {
  return {
    id: "0845da12-7cd7-45fe-af48-f340b4ee112e",
    name: "nl",
    description: "test",
    icon: "🏗",
    template: "blank",
    createdAt: 1,
    quickPrompts: [],
    departments: [
      {
        id: "dept-ceo",
        name: "管理中枢",
        leadAgentId: "nl-0845da-ceo",
        kind: "meta",
        color: "slate",
        order: 0,
        missionPolicy: "manager_delegated",
      },
      {
        id: "dept-hr",
        name: "人力资源部",
        leadAgentId: "nl-0845da-hr",
        kind: "support",
        color: "rose",
        order: 1,
        missionPolicy: "manager_delegated",
      },
    ],
    employees: [
      {
        agentId: "nl-0845da-ceo",
        nickname: "CEO",
        role: "Chief Executive Officer",
        isMeta: true,
        metaRole: "ceo",
      },
      {
        agentId: "nl-0845da-hr",
        nickname: "HR",
        role: "Human Resources Director",
        isMeta: true,
        metaRole: "hr",
        reportsTo: "nl-0845da-ceo",
        departmentId: "dept-hr",
      },
    ],
  };
}

describe("planHiredEmployee", () => {
  it("adds a new employee under the CEO by default", () => {
    const result = planHiredEmployee(buildCompany(), {
      role: "Content Director",
      description: "Own the content pipeline",
    });

    expect(result.employee.agentId).toBe("nl-0845da-content-director");
    expect(result.employee.nickname).toBe("Content Director");
    expect(result.employee.role).toBe("Content Director");
    expect(result.employee.reportsTo).toBe("nl-0845da-ceo");
    expect(result.company.employees).toHaveLength(3);
  });

  it("creates a department and assigns the new hire as lead when requested", () => {
    const result = planHiredEmployee(buildCompany(), {
      role: "内容总监",
      description: "统筹内容创作事业部",
      departmentName: "内容创作事业部",
      makeDepartmentLead: true,
    });

    expect(result.department).toMatchObject({
      name: "内容创作事业部",
      leadAgentId: "nl-0845da-内容总监",
      kind: "business",
    });
    expect(result.employee.departmentId).toBe(result.department?.id);
    expect(result.employee.reportsTo).toBe("nl-0845da-ceo");
  });

  it("deduplicates agent ids when the role already exists", () => {
    const company = buildCompany();
    company.employees.push({
      agentId: "nl-0845da-content-director",
      nickname: "Content Director",
      role: "Content Director",
      isMeta: false,
      reportsTo: "nl-0845da-ceo",
    });

    const result = planHiredEmployee(company, {
      role: "Content Director",
      description: "Own the content pipeline",
    });

    expect(result.employee.agentId).toBe("nl-0845da-content-director-2");
  });
});
