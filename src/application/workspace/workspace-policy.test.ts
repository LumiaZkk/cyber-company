import { describe, expect, it } from "vitest";
import type { Company } from "../../domain/org/types";
import {
  buildWorkspacePolicySummary,
  resolveCompanyWorkspacePolicy,
  shouldUseProviderWorkspaceMirror,
} from "./workspace-policy";

function createCompany(policy?: Company["orgSettings"]): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "",
    icon: "🏢",
    template: "blank",
    createdAt: 1,
    employees: [],
    quickPrompts: [],
    orgSettings: policy,
  };
}

describe("workspace policy", () => {
  it("resolves the default workspace policy", () => {
    expect(resolveCompanyWorkspacePolicy(createCompany())).toEqual({
      deliverySource: "artifact_store",
      providerMirrorMode: "fallback",
      executorWriteTarget: "agent_workspace",
    });
  });

  it("builds a summary for disabled provider mirror mode", () => {
    const summary = buildWorkspacePolicySummary({
      deliverySource: "artifact_store",
      providerMirrorMode: "disabled",
      executorWriteTarget: "delivery_artifacts",
    });

    expect(summary.mirrorEnabled).toBe(false);
    expect(summary.mirrorLabel).toContain("关闭");
    expect(summary.executionLabel).toBe("只写交付区");
  });

  it("disables provider mirroring when policy turns mirror fallback off", () => {
    expect(
      shouldUseProviderWorkspaceMirror({
        policy: { providerMirrorMode: "disabled" },
        supportsAgentFiles: true,
        storageStrategy: "provider-files",
      }),
    ).toBe(false);
  });

  it("requires both provider capability and provider-files strategy before enabling mirror fallback", () => {
    expect(
      shouldUseProviderWorkspaceMirror({
        policy: { providerMirrorMode: "fallback" },
        supportsAgentFiles: true,
        storageStrategy: "provider-files",
      }),
    ).toBe(true);
    expect(
      shouldUseProviderWorkspaceMirror({
        policy: { providerMirrorMode: "fallback" },
        supportsAgentFiles: false,
        storageStrategy: "provider-files",
      }),
    ).toBe(false);
    expect(
      shouldUseProviderWorkspaceMirror({
        policy: { providerMirrorMode: "fallback" },
        supportsAgentFiles: true,
        storageStrategy: "artifact-files",
      }),
    ).toBe(false);
  });
});
