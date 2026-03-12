import { describe, expect, it } from "vitest";
import {
  buildManagedExecutorCompanyWorkspace,
  buildManagedExecutorFilesForCompany,
  buildManagedExecutorWorkspace,
  buildManagedExecutorWorkspaceRoot,
  listDesiredManagedExecutorAgents,
  planManagedExecutorReconcile,
} from "./company-executor-sync";
import { buildDefaultMainCompany } from "../../../src/domain/org/system-company";
import type { Company, CyberCompanyConfig } from "../../../src/domain/org/types";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "desc",
    icon: "🏢",
    template: "blank",
    createdAt: 1,
    departments: [
      { id: "dep-1", name: "管理中枢", leadAgentId: "company-1-ceo", kind: "meta", order: 0 },
      { id: "dep-2", name: "人力", leadAgentId: "company-1-hr", kind: "support", order: 1 },
      { id: "dep-3", name: "技术", leadAgentId: "company-1-cto", kind: "support", order: 2 },
      { id: "dep-4", name: "运营", leadAgentId: "company-1-coo", kind: "support", order: 3 },
      { id: "dep-5", name: "设计部", leadAgentId: "company-1-designer", kind: "business", order: 4 },
    ],
    employees: [
      { agentId: "company-1-ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo" },
      {
        agentId: "company-1-hr",
        nickname: "HR",
        role: "HR",
        isMeta: true,
        metaRole: "hr",
        reportsTo: "company-1-ceo",
      },
      {
        agentId: "company-1-cto",
        nickname: "CTO",
        role: "CTO",
        isMeta: true,
        metaRole: "cto",
        reportsTo: "company-1-ceo",
      },
      {
        agentId: "company-1-coo",
        nickname: "COO",
        role: "COO",
        isMeta: true,
        metaRole: "coo",
        reportsTo: "company-1-ceo",
      },
      {
        agentId: "company-1-designer",
        nickname: "设计师",
        role: "Designer",
        isMeta: false,
        reportsTo: "company-1-ceo",
        departmentId: "dep-5",
      },
    ],
    quickPrompts: [],
  };
}

describe("company-executor-sync", () => {
  it("builds a stable Authority-managed workspace root and company root", () => {
    expect(buildManagedExecutorWorkspaceRoot()).toBe("~/.openclaw/workspaces/cyber-company");
    expect(buildManagedExecutorCompanyWorkspace("co-1")).toBe("~/.openclaw/workspaces/cyber-company/co-1");
  });

  it("builds stable Authority-managed workspace paths", () => {
    expect(
      buildManagedExecutorWorkspace({ companyId: "co-1", agentId: "co-1-ceo" }),
    ).toBe("~/.openclaw/workspaces/cyber-company/co-1/co-1-ceo");
  });

  it("excludes the reserved system-main mapping from managed agent provisioning", () => {
    const config: CyberCompanyConfig = {
      version: 1,
      companies: [buildDefaultMainCompany(), createCompany()],
      activeCompanyId: "company-1",
      preferences: { theme: "classic", locale: "zh-CN" },
    };

    expect(listDesiredManagedExecutorAgents(config)).toEqual([
      {
        agentId: "company-1-ceo",
        companyId: "company-1",
        workspace: "~/.openclaw/workspaces/cyber-company/company-1/company-1-ceo",
      },
      {
        agentId: "company-1-hr",
        companyId: "company-1",
        workspace: "~/.openclaw/workspaces/cyber-company/company-1/company-1-hr",
      },
      {
        agentId: "company-1-cto",
        companyId: "company-1",
        workspace: "~/.openclaw/workspaces/cyber-company/company-1/company-1-cto",
      },
      {
        agentId: "company-1-coo",
        companyId: "company-1",
        workspace: "~/.openclaw/workspaces/cyber-company/company-1/company-1-coo",
      },
      {
        agentId: "company-1-designer",
        companyId: "company-1",
        workspace: "~/.openclaw/workspaces/cyber-company/company-1/company-1-designer",
      },
    ]);
  });

  it("builds managed manager files for both CEO and department leads", () => {
    const files = buildManagedExecutorFilesForCompany(createCompany());

    expect(files.map((file) => `${file.agentId}:${file.name}`)).toEqual([
      "company-1-ceo:SOUL.md",
      "company-1-ceo:collaboration-context.json",
      "company-1-hr:SOUL.md",
      "company-1-hr:collaboration-context.json",
      "company-1-cto:SOUL.md",
      "company-1-cto:collaboration-context.json",
      "company-1-coo:SOUL.md",
      "company-1-coo:collaboration-context.json",
      "company-1-designer:SOUL.md",
      "company-1-designer:collaboration-context.json",
      "company-1-ceo:company-context.json",
      "company-1-ceo:OPERATIONS.md",
      "company-1-hr:department-context.json",
      "company-1-hr:DEPARTMENT-OPERATIONS.md",
      "company-1-cto:department-context.json",
      "company-1-cto:DEPARTMENT-OPERATIONS.md",
      "company-1-coo:department-context.json",
      "company-1-coo:DEPARTMENT-OPERATIONS.md",
      "company-1-designer:department-context.json",
      "company-1-designer:DEPARTMENT-OPERATIONS.md",
    ]);
    expect(files.find((file) => file.name === "company-context.json")?.content).toContain('"id": "company-1"');
    expect(files.find((file) => file.name === "company-context.json")?.content).toContain('"organization"');
    expect(files.find((file) => file.agentId === "company-1-cto" && file.name === "collaboration-context.json")?.content).toContain(
      '"allowedDispatchTargets"',
    );
    expect(files.find((file) => file.agentId === "company-1-designer" && file.name === "collaboration-context.json")?.content).toContain(
      '"manager"',
    );
    expect(files.find((file) => file.name === "OPERATIONS.md")?.content).toContain("当前 roster");
    expect(files.find((file) => file.agentId === "company-1-ceo" && file.name === "SOUL.md")?.content).toContain(
      "业务归属先判定",
    );
    expect(files.find((file) => file.agentId === "company-1-hr" && file.name === "SOUL.md")?.content).toContain(
      "HR Director",
    );
    expect(files.find((file) => file.agentId === "company-1-hr" && file.name === "SOUL.md")?.content).toContain(
      "authority.company.employee.hire",
    );
    expect(files.find((file) => file.agentId === "company-1-hr" && file.name === "SOUL.md")?.content).toContain(
      "严禁把 `agents.create` 当作正式招聘入口",
    );
    expect(files.find((file) => file.agentId === "company-1-cto" && file.name === "SOUL.md")?.content).toContain(
      "你不直接承担文章、小说",
    );
    expect(files.find((file) => file.agentId === "company-1-designer" && file.name === "SOUL.md")?.content).toContain(
      "Department Manager",
    );
    expect(files.find((file) => file.agentId === "company-1-designer" && file.name === "department-context.json")?.content).toContain(
      '"name": "设计部"',
    );
    expect(files.find((file) => file.agentId === "company-1-designer" && file.name === "DEPARTMENT-OPERATIONS.md")?.content).toContain(
      "部门负责人执行准则",
    );
    expect(files.find((file) => file.agentId === "company-1-hr" && file.name === "DEPARTMENT-OPERATIONS.md")?.content).toContain(
      "authority.company.employee.hire",
    );
  });

  it("keeps delete intents even when agents.list no longer reports the agent", () => {
    const plan = planManagedExecutorReconcile({
      trackedAgents: [
        { agentId: "company-1-ceo", desiredPresent: false },
        { agentId: "company-1-hr", desiredPresent: true },
      ],
      desiredTargets: [
        {
          agentId: "company-1-hr",
          companyId: "company-1",
          workspace: "~/.openclaw/workspaces/cyber-company/company-1/company-1-hr",
        },
        {
          agentId: "company-1-cto",
          companyId: "company-1",
          workspace: "~/.openclaw/workspaces/cyber-company/company-1/company-1-cto",
        },
      ],
      existingAgentIds: new Set(["company-1-hr"]),
    });

    expect(plan.deleteAgentIds).toEqual(["company-1-ceo"]);
    expect(plan.createTargets).toEqual([
      {
        agentId: "company-1-cto",
        companyId: "company-1",
        workspace: "~/.openclaw/workspaces/cyber-company/company-1/company-1-cto",
      },
    ]);
  });
});
