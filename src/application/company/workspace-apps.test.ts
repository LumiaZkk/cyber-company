import { describe, expect, it } from "vitest";
import {
  buildRecommendedWorkspaceApps,
  buildWorkspaceToolRequest,
  categorizeWorkspaceResource,
  getCompanyWorkspaceApps,
  hasStoredWorkspaceApps,
  isNovelCompany,
  publishWorkspaceApp,
  resolveWorkspaceAppSurface,
  resolveWorkspaceAppTemplate,
  summarizeConsistencyAnchors,
} from "./workspace-apps";
import type { Company } from "../../domain/org/types";

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
      "knowledge-hub",
      "cto-workbench",
    ]);
    expect(hasStoredWorkspaceApps(company)).toBe(false);
    expect(buildRecommendedWorkspaceApps(company).every((app) => app.surface === "template")).toBe(true);
  });

  it("prefers explicitly stored apps and resolves template metadata for custom entries", () => {
    const company = makeCompany({
      workspaceApps: [
        {
          id: "novelcraft-reader",
          slug: "novelcraft-reader",
          title: "NovelCraft 阅读器",
          description: "显式发布到公司的阅读入口。",
          icon: "📚",
          kind: "custom",
          status: "ready",
          surface: "template",
          template: "reader",
          ownerAgentId: "cto",
        },
      ],
    });

    const apps = getCompanyWorkspaceApps(company);
    expect(hasStoredWorkspaceApps(company)).toBe(true);
    expect(apps).toHaveLength(1);
    expect(apps[0]?.id).toBe("novelcraft-reader");
    expect(resolveWorkspaceAppTemplate(apps[0]!)).toBe("reader");
    expect(resolveWorkspaceAppSurface(apps[0]!)).toBe("template");
  });

  it("publishes a single template app while preserving the rest of the workspace entry set", () => {
    const seededApps = buildRecommendedWorkspaceApps(makeCompany()).map((app) =>
      resolveWorkspaceAppTemplate(app) === "reader"
        ? { ...app, manifestArtifactId: "workspace-app-manifest:company-1:app:reader" }
        : app,
    );
    const company = makeCompany({ workspaceApps: seededApps });

    const nextApps = publishWorkspaceApp(company, {
      template: "reader",
      title: "NovelCraft 阅读器",
      description: "围绕当前公司的章节、设定和审校报告提供阅读入口。",
      ownerAgentId: "cto",
    });

    expect(nextApps).toHaveLength(4);
    expect(nextApps.find((app) => resolveWorkspaceAppTemplate(app) === "reader")?.title).toBe(
      "NovelCraft 阅读器",
    );
    expect(nextApps.find((app) => resolveWorkspaceAppTemplate(app) === "reader")?.ownerAgentId).toBe("cto");
    expect(nextApps.find((app) => resolveWorkspaceAppTemplate(app) === "reader")?.manifestArtifactId).toBe(
      "workspace-app-manifest:company-1:app:reader",
    );
    expect(nextApps.find((app) => resolveWorkspaceAppTemplate(app) === "consistency")?.title).toBe("一致性中心");
  });

  it("categorizes workspace resources into novel-friendly buckets", () => {
    expect(categorizeWorkspaceResource("chapters/02-提前布局.md")).toBe("chapter");
    expect(categorizeWorkspaceResource("00-共享设定库.md")).toBe("canon");
    expect(categorizeWorkspaceResource("CH02-审校报告.md")).toBe("review");
    expect(categorizeWorkspaceResource("番茄小说运营策略方案.md")).toBe("knowledge");
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
