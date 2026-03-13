import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = "/Users/zkk/openclaw/cyber-company";

const guardedFiles = [
  "src/application/company/workspace-apps.ts",
  "src/application/workspace/app-manifest.ts",
  "src/application/workspace/platform-closeout.ts",
  "src/application/workspace/skill-executor.ts",
  "src/application/workspace/workflow-capability-bindings.ts",
  "src/presentation/workspace/Page.tsx",
  "src/presentation/workspace/components/WorkspacePageContent.tsx",
];

const forbiddenTokens = [
  "isNovelCompany(",
  "scenarioKey",
  "scenarioLabel",
  "buildCapabilityPlatformGaMatrix",
  "CapabilityPlatformGaMatrix",
  "platformGaMatrix",
];

describe("workspace legacy boundary", () => {
  it("keeps legacy scenario and matrix concepts out of the main workspace chain", () => {
    for (const relativePath of guardedFiles) {
      const content = readFileSync(join(WORKSPACE_ROOT, relativePath), "utf8");
      for (const token of forbiddenTokens) {
        expect(
          content,
          `${relativePath} should not depend on legacy token ${token}`,
        ).not.toContain(token);
      }
    }
  });
});
