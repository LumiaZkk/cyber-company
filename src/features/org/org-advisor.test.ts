import { describe, expect, it } from "vitest";
import type { Company, Department, EmployeeRef } from "../company/types";
import {
  applyOrgRecommendation,
  autoCalibrateOrganization,
  buildOrgAdvisorSnapshot,
  isOrgAutopilotEnabled,
} from "./org-advisor";

function buildCompany(params: {
  employees: EmployeeRef[];
  departments?: Department[];
  template?: string;
  name?: string;
}): Company {
  return {
    id: "company-1",
    name: params.name ?? "小说创作工作室",
    description: "",
    icon: "🏢",
    template: params.template ?? "blank",
    employees: params.employees,
    departments: params.departments,
    quickPrompts: [],
    createdAt: Date.now(),
  };
}

describe("org advisor", () => {
  it("recommends flattening a small department back to CEO", () => {
    const employees: EmployeeRef[] = [
      { agentId: "ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo" },
      { agentId: "coo", nickname: "COO", role: "COO", isMeta: true, metaRole: "coo", reportsTo: "ceo" },
      { agentId: "writer-a", nickname: "小李", role: "主笔", isMeta: false, departmentId: "story", reportsTo: "coo" },
      { agentId: "writer-b", nickname: "小王", role: "剧情设计", isMeta: false, departmentId: "story", reportsTo: "coo" },
      { agentId: "writer-c", nickname: "小张", role: "设定师", isMeta: false, departmentId: "story", reportsTo: "coo" },
    ];
    const departments: Department[] = [
      { id: "story", name: "创作部", leadAgentId: "writer-a" },
    ];

    const company = buildCompany({ employees, departments });
    const snapshot = buildOrgAdvisorSnapshot(company);
    expect(snapshot.operatingMode.key).toBe("hybrid");
    const recommendation = snapshot.recommendations.find(
      (item) => item.kind === "flatten_small_department_to_ceo",
    );

    expect(recommendation).toBeTruthy();

    const applied = applyOrgRecommendation({
      company,
      recommendation: recommendation!,
    });

    const reports = new Map(applied.employees.map((employee) => [employee.agentId, employee.reportsTo]));
    expect(reports.get("writer-a")).toBe("ceo");
    expect(reports.get("writer-b")).toBe("ceo");
    expect(reports.get("writer-c")).toBe("ceo");
  });

  it("recommends bootstrapping a business department when workers sit under meta departments", () => {
    const employees: EmployeeRef[] = [
      { agentId: "ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo" },
      { agentId: "coo", nickname: "COO", role: "COO", isMeta: true, metaRole: "coo", reportsTo: "ceo" },
      { agentId: "writer-a", nickname: "小李", role: "主笔", isMeta: false, departmentId: "dep-meta-coo", reportsTo: "coo" },
      { agentId: "writer-b", nickname: "小王", role: "剧情设计", isMeta: false, departmentId: "dep-meta-coo", reportsTo: "coo" },
    ];
    const departments: Department[] = [
      { id: "dep-meta-coo", name: "运营部", leadAgentId: "coo" },
    ];

    const company = buildCompany({ employees, departments, template: "content-factory" });
    const snapshot = buildOrgAdvisorSnapshot(company);
    expect(snapshot.operatingMode.key).toBe("ceo_direct");

    expect(
      snapshot.recommendations.some((item) => item.kind === "bootstrap_business_department"),
    ).toBe(true);
  });

  it("recommends introducing a lead for a large department fully reporting to CEO", () => {
    const employees: EmployeeRef[] = [
      { agentId: "ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo" },
      { agentId: "lead", nickname: "阿青", role: "主编", isMeta: false, departmentId: "content", reportsTo: "ceo" },
      { agentId: "w1", nickname: "小一", role: "写手", isMeta: false, departmentId: "content", reportsTo: "ceo" },
      { agentId: "w2", nickname: "小二", role: "写手", isMeta: false, departmentId: "content", reportsTo: "ceo" },
      { agentId: "w3", nickname: "小三", role: "写手", isMeta: false, departmentId: "content", reportsTo: "ceo" },
      { agentId: "w4", nickname: "小四", role: "写手", isMeta: false, departmentId: "content", reportsTo: "ceo" },
    ];
    const departments: Department[] = [
      { id: "content", name: "内容部", leadAgentId: "lead" },
    ];

    const company = buildCompany({ employees, departments });
    const snapshot = buildOrgAdvisorSnapshot(company);
    expect(snapshot.operatingMode.key).toBe("departmental");
    const recommendation = snapshot.recommendations.find(
      (item) => item.kind === "introduce_department_lead",
    );

    expect(recommendation).toBeTruthy();

    const applied = applyOrgRecommendation({
      company,
      recommendation: recommendation!,
    });

    const reports = new Map(applied.employees.map((employee) => [employee.agentId, employee.reportsTo]));
    expect(reports.get("lead")).toBe("ceo");
    expect(reports.get("w1")).toBe("lead");
    expect(reports.get("w4")).toBe("lead");
  });

  it("auto-calibrates a small story department back to CEO direct reports", () => {
    const employees: EmployeeRef[] = [
      { agentId: "ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo" },
      { agentId: "coo", nickname: "COO", role: "COO", isMeta: true, metaRole: "coo", reportsTo: "ceo" },
      { agentId: "writer-a", nickname: "小李", role: "主笔", isMeta: false, departmentId: "story", reportsTo: "coo" },
      { agentId: "writer-b", nickname: "小王", role: "剧情设计", isMeta: false, departmentId: "story", reportsTo: "coo" },
    ];
    const departments: Department[] = [
      { id: "story", name: "创作部", leadAgentId: "writer-a" },
    ];

    const result = autoCalibrateOrganization(buildCompany({ employees, departments }));
    const reports = new Map(result.employees.map((employee) => [employee.agentId, employee.reportsTo]));

    expect(result.changed).toBe(true);
    expect(result.appliedRecommendations.map((item) => item.kind)).toContain("flatten_small_department_to_ceo");
    expect(result.finalSnapshot.recommendations).toHaveLength(0);
    expect(reports.get("writer-a")).toBe("ceo");
    expect(reports.get("writer-b")).toBe("ceo");
  });

  it("treats org autopilot as enabled by default unless explicitly disabled", () => {
    const company = buildCompany({
      employees: [{ agentId: "ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo" }],
    });

    expect(isOrgAutopilotEnabled(company)).toBe(true);
    expect(
      isOrgAutopilotEnabled({
        ...company,
        orgSettings: { autoCalibrate: false },
      }),
    ).toBe(false);
  });
});
