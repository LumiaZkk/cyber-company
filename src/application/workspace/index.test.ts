import { describe, expect, it } from "vitest";
import { formatWorkspaceFileKindLabel } from "./index";

describe("formatWorkspaceFileKindLabel", () => {
  it("prefers explicit dataset resource types over legacy tooling labels", () => {
    expect(
      formatWorkspaceFileKindLabel({
        kind: "tooling",
        resourceType: "dataset",
      }),
    ).toBe("数据");
  });

  it("prefers explicit state resource types over legacy other labels", () => {
    expect(
      formatWorkspaceFileKindLabel({
        kind: "other",
        resourceType: "state",
      }),
    ).toBe("状态");
  });
});
