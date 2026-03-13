import { describe, expect, it } from "vitest";
import type { CompanyWorkspaceApp, SkillDefinition, SkillRunRecord } from "../../domain/org/types";
import { buildSkillReleaseReadiness } from "./skill-release";

const readerApp: CompanyWorkspaceApp = {
  id: "app:reader",
  slug: "reader",
  title: "小说阅读器",
  description: "阅读器",
  icon: "📖",
  kind: "custom",
  status: "ready",
  template: "reader",
  surface: "template",
};

const skill: SkillDefinition = {
  id: "reader.build-index",
  title: "重建阅读索引",
  summary: "重建阅读索引",
  ownerAgentId: "cto-1",
  status: "draft",
  entryPath: "scripts/build-reader-index.ts",
  writesResourceTypes: ["document", "report"],
  allowedTriggers: ["app_action"],
  manifestActionIds: ["trigger-reader-index"],
  appIds: ["app:reader"],
  smokeTest: "至少跑通一轮索引构建。",
  createdAt: 1,
  updatedAt: 1,
};

function createSkillRun(input?: Partial<SkillRunRecord>): SkillRunRecord {
  return {
    id: "run-1",
    skillId: "reader.build-index",
    appId: "app:reader",
    triggerType: "manual",
    triggerActionId: "smoke-test:reader.build-index",
    triggerLabel: "CTO 工具工坊 smoke test",
    status: "succeeded",
    startedAt: 10,
    completedAt: 11,
    updatedAt: 11,
    ...input,
  };
}

describe("buildSkillReleaseReadiness", () => {
  it("marks a skill publishable after a successful smoke test and complete contract", () => {
    const readiness = buildSkillReleaseReadiness({
      skill,
      skillRuns: [createSkillRun()],
      workspaceApps: [readerApp],
    });

    expect(readiness.publishable).toBe(true);
    expect(readiness.latestSuccessfulSmokeTestRun?.id).toBe("run-1");
    expect(readiness.checks.every((check) => check.ok)).toBe(true);
  });

  it("keeps a skill unpublishable when no successful smoke test exists", () => {
    const readiness = buildSkillReleaseReadiness({
      skill,
      skillRuns: [createSkillRun({ id: "run-failed", status: "failed" })],
      workspaceApps: [readerApp],
    });

    expect(readiness.publishable).toBe(false);
    expect(readiness.latestSuccessfulSmokeTestRun).toBeNull();
    expect(readiness.checks.find((check) => check.id === "smoke-test-run")?.ok).toBe(false);
  });

  it("marks execution-target as incomplete when no adapter is registered", () => {
    const readiness = buildSkillReleaseReadiness({
      skill: {
        ...skill,
        id: "custom.unimplemented",
        entryPath: "scripts/custom-unimplemented.ts",
      },
      skillRuns: [createSkillRun()],
      workspaceApps: [readerApp],
    });

    expect(readiness.publishable).toBe(false);
    expect(readiness.checks.find((check) => check.id === "execution-target")?.ok).toBe(false);
  });

  it("accepts a successful workspace script smoke test as execution backing", () => {
    const readiness = buildSkillReleaseReadiness({
      skill: {
        ...skill,
        id: "custom.workspace-script",
        entryPath: "scripts/custom-reader-index.py",
      },
      skillRuns: [
        createSkillRun({
          id: "run-workspace-script",
          skillId: "custom.workspace-script",
          executionMode: "workspace_script",
          executionEntryPath: "scripts/custom-reader-index.py",
        }),
      ],
      workspaceApps: [readerApp],
    });

    expect(readiness.checks.find((check) => check.id === "execution-target")?.ok).toBe(true);
    expect(readiness.publishable).toBe(true);
  });
});
