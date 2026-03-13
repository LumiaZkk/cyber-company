import { describe, expect, it } from "vitest";
import type {
  CapabilityAuditEventRecord,
  CapabilityIssueRecord,
  CapabilityRequestRecord,
  CompanyWorkspaceApp,
  SkillDefinition,
  SkillRunRecord,
} from "../../domain/org/types";
import {
  buildCapabilityPlatformCloseoutSnapshot,
  buildCapabilityPlatformCloseoutSummary,
  isCapabilityPlatformCloseoutSnapshotEqual,
} from "./platform-closeout";

const readerApp: CompanyWorkspaceApp = {
  id: "app:reader",
  slug: "reader",
  title: "内容查看器",
  description: "查看器",
  icon: "📖",
  kind: "custom",
  status: "ready",
  template: "reader",
  surface: "template",
};

const skill: SkillDefinition = {
  id: "reader.build-index",
  title: "重建内容索引",
  summary: "重建索引",
  ownerAgentId: "cto-1",
  status: "ready",
  entryPath: "scripts/build-reader-index.ts",
  writesResourceTypes: ["document", "report"],
  allowedTriggers: ["app_action"],
  manifestActionIds: ["trigger-reader-index"],
  appIds: ["app:reader"],
  smokeTest: "跑通一次内容索引重建。",
  createdAt: 1,
  updatedAt: 1,
};

function createSkillRun(input?: Partial<SkillRunRecord>): SkillRunRecord {
  return {
    id: "run-1",
    skillId: skill.id,
    appId: "app:reader",
    triggerType: "manual",
    triggerActionId: "smoke-test:reader.build-index",
    triggerLabel: "CTO 工具工坊能力验证",
    status: "succeeded",
    executionMode: "workspace_script",
    executionEntryPath: "scripts/build-reader-index.ts",
    startedAt: 10,
    completedAt: 11,
    updatedAt: 11,
    ...input,
  };
}

function createAuditEvent(input?: Partial<CapabilityAuditEventRecord>): CapabilityAuditEventRecord {
  return {
    id: "audit-1",
    kind: "run",
    entityId: "run-1",
    action: "run_succeeded",
    summary: "内容查看器 已成功触发重建内容索引",
    createdAt: 12,
    updatedAt: 12,
    ...input,
  };
}

describe("buildCapabilityPlatformCloseoutSummary", () => {
  it("surfaces attention and in-progress states when the platform is only partially closed out", () => {
    const summary = buildCapabilityPlatformCloseoutSummary({
      workspaceApps: [readerApp],
      workspaceFiles: [
        { resourceOrigin: "declared", resourceType: "document", tags: ["content.primary"] },
        { resourceOrigin: "inferred", resourceType: "document", tags: ["domain.reference"] },
      ],
      skillDefinitions: [skill],
      skillRuns: [],
      capabilityRequests: [] as CapabilityRequestRecord[],
      capabilityIssues: [] as CapabilityIssueRecord[],
      capabilityAuditEvents: [] as CapabilityAuditEventRecord[],
      executorProvisioning: {
        state: "degraded",
        lastError: "OpenClaw agent 暂未可见",
      },
    });

    expect(summary.totals.attention).toBeGreaterThan(0);
    expect(summary.checks.find((check) => check.id === "executor-provisioning")?.status).toBe("attention");
    expect(summary.checks.find((check) => check.id === "formal-resource-coverage")?.status).toBe("in_progress");
    expect(summary.checks.find((check) => check.id === "capability-validation")?.status).toBe("attention");
    expect(summary.checks.find((check) => check.id === "executor-provisioning")?.nextStep).toContain("重试补齐执行器");
  });

  it("marks checks ready when manifest, formal resources, validation, and governance evidence are all present", () => {
    const summary = buildCapabilityPlatformCloseoutSummary({
      workspaceApps: [{ ...readerApp, manifestArtifactId: "workspace-app-manifest:app:reader" }],
      workspaceFiles: [
        { resourceOrigin: "declared", resourceType: "report", tags: ["ops.report"] },
        { resourceOrigin: "manifest", resourceType: "document", tags: ["content.primary"] },
        { resourceOrigin: "declared", resourceType: "other", tags: ["tech.app-manifest"] },
      ],
      skillDefinitions: [skill],
      skillRuns: [createSkillRun()],
      capabilityRequests: [
        {
          id: "request-1",
          type: "app",
          summary: "补内容查看器",
          status: "closed",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      capabilityIssues: [
        {
          id: "issue-1",
          type: "bad_result",
          summary: "索引结果异常",
          status: "closed",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      capabilityAuditEvents: [createAuditEvent()],
      executorProvisioning: {
        state: "ready",
      },
    });

    expect(summary.totals.ready).toBe(5);
    expect(summary.checks.every((check) => check.status === "ready")).toBe(true);
    expect(summary.checks.every((check) => !check.nextStep)).toBe(true);
  });

  it("builds a stable closeout snapshot and compares by signature instead of timestamp", () => {
    const summary = buildCapabilityPlatformCloseoutSummary({
      workspaceApps: [{ ...readerApp, manifestArtifactId: "workspace-app-manifest:app:reader" }],
      workspaceFiles: [
        { resourceOrigin: "declared", resourceType: "report", tags: ["ops.report"] },
        { resourceOrigin: "manifest", resourceType: "document", tags: ["content.primary"] },
      ],
      skillDefinitions: [skill],
      skillRuns: [createSkillRun()],
      capabilityRequests: [] as CapabilityRequestRecord[],
      capabilityIssues: [] as CapabilityIssueRecord[],
      capabilityAuditEvents: [createAuditEvent()],
      executorProvisioning: {
        state: "ready",
      },
    });
    const first = buildCapabilityPlatformCloseoutSnapshot({
      summary,
      updatedAt: 100,
    });
    const second = buildCapabilityPlatformCloseoutSnapshot({
      summary,
      updatedAt: 200,
    });

    expect(first.status).toBe("ready");
    expect(first.readyCount).toBe(5);
    expect(first.totalCount).toBe(5);
    expect(isCapabilityPlatformCloseoutSnapshotEqual(first, second)).toBe(true);
  });

  it("marks the snapshot as attention when any closeout checks are still missing", () => {
    const summary = buildCapabilityPlatformCloseoutSummary({
      workspaceApps: [readerApp],
      workspaceFiles: [],
      skillDefinitions: [],
      skillRuns: [],
      capabilityRequests: [] as CapabilityRequestRecord[],
      capabilityIssues: [] as CapabilityIssueRecord[],
      capabilityAuditEvents: [] as CapabilityAuditEventRecord[],
      executorProvisioning: {
        state: "blocked",
        lastError: "OpenClaw 不可用",
      },
    });

    const snapshot = buildCapabilityPlatformCloseoutSnapshot({
      summary,
      updatedAt: 10,
    });

    expect(snapshot.status).toBe("attention");
    expect(snapshot.attentionCount).toBeGreaterThan(0);
    expect(snapshot.totalCount).toBe(5);
  });
});
