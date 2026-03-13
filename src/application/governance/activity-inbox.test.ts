import { describe, expect, it } from "vitest";
import { buildActivityInboxSummary } from "./activity-inbox";

describe("buildActivityInboxSummary", () => {
  it("prioritizes pending human decisions", () => {
    const summary = buildActivityInboxSummary({
      scopeLabel: "当前公司",
      pendingHumanDecisionCount: 2,
      manualTakeoverCount: 1,
      handoffCount: 3,
    });

    expect(summary.state).toBe("action_required");
    expect(summary.badgeLabel).toBe("需拍板");
    expect(summary.title).toContain("待拍板");
  });

  it("flags execution anomalies when takeovers or escalations exist", () => {
    const summary = buildActivityInboxSummary({
      scopeLabel: "当前主线",
      blockerCount: 1,
      escalationCount: 2,
      manualTakeoverCount: 1,
      requestCount: 1,
    });

    expect(summary.state).toBe("action_required");
    expect(summary.badgeLabel).toBe("需介入");
    expect(summary.summary).toContain("需人工介入或升级的异常");
  });

  it("returns watch when only coordination items remain", () => {
    const summary = buildActivityInboxSummary({
      scopeLabel: "当前主线",
      requestCount: 2,
      handoffCount: 1,
    });

    expect(summary.state).toBe("watch");
    expect(summary.badgeLabel).toBe("待收口");
    expect(summary.metrics[3]?.value).toBe("3");
  });

  it("returns clear when no current activity needs attention", () => {
    const summary = buildActivityInboxSummary({
      scopeLabel: "当前公司",
    });

    expect(summary.state).toBe("clear");
    expect(summary.badgeLabel).toBe("已收口");
  });
});
