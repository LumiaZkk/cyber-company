import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = "/Users/zkk/openclaw/cyber-company";

describe("company workspace bootstrap boundary", () => {
  it("keeps scenario-specific smoke fixtures out of the main bootstrap module", () => {
    const content = readFileSync(
      join(WORKSPACE_ROOT, "packages/authority-daemon/src/company-workspace-bootstrap.ts"),
      "utf8",
    );

    for (const token of ["content-factory", "customer-service", "research-lab"]) {
      expect(
        content,
        `main bootstrap should not depend on legacy smoke fixture token ${token}`,
      ).not.toContain(token);
    }
  });
});
