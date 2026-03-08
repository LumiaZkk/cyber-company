import { describe, expect, it } from "vitest";
import {
  buildWorkspaceToolRequest,
  categorizeWorkspaceResource,
  getCompanyWorkspaceApps,
  isNovelCompany,
  summarizeConsistencyAnchors,
} from "./workspace-apps";
import type { Company } from "./types";

function makeCompany(overrides?: Partial<Company>): Company {
  return {
    id: "company-1",
    name: "小说创作工作室",
    description: "围绕长篇连载创作、审校和发布的内容团队",
    icon: "📚",
    template: "novel",
    employees: [
      { agentId: "ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo" },
      { agentId: "cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto" },
      { agentId: "writer", nickname: "写手", role: "小说写手", isMeta: false },
    ],
    quickPrompts: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("workspace-apps", () => {
  it("detects novel companies and seeds company-specific apps", () => {
    const company = makeCompany();

    expect(isNovelCompany(company)).toBe(true);
    expect(getCompanyWorkspaceApps(company).map((app) => app.id)).toEqual([
      "novel-reader",
      "consistency-hub",
      "cto-workbench",
    ]);
  });

  it("categorizes workspace resources into novel-friendly buckets", () => {
    expect(categorizeWorkspaceResource("chapters/02-提前布局.md")).toBe("chapter");
    expect(categorizeWorkspaceResource("00-共享设定库.md")).toBe("canon");
    expect(categorizeWorkspaceResource("CH02-审校报告.md")).toBe("review");
    expect(categorizeWorkspaceResource("consistency-check.ts")).toBe("tooling");
  });

  it("summarizes anchor coverage and builds CTO prompts", () => {
    const anchors = summarizeConsistencyAnchors([
      "00-共享设定库.md",
      "01-时间线.md",
      "03-伏笔追踪.md",
    ]);
    expect(anchors.filter((anchor) => anchor.found)).toHaveLength(3);
    expect(anchors.find((anchor) => anchor.id === "handoff")?.found).toBe(false);

    const request = buildWorkspaceToolRequest(makeCompany(), "novel-reader");
    expect(request.title).toBe("开发小说阅读器");
    expect(request.prompt).toContain("当前公司");
    expect(request.prompt).toContain("小说阅读器");
  });
});
