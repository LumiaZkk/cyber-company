import { describe, expect, it } from "vitest";
import { buildCapabilityAuditTimeline } from "./capability-audit";

describe("buildCapabilityAuditTimeline", () => {
  it("sorts newest-first and resolves app/skill labels", () => {
    const timeline = buildCapabilityAuditTimeline(
      [
        {
          id: "event-1",
          kind: "request",
          entityId: "request-1",
          action: "created",
          summary: "先登记需求",
          appId: "app:reader",
          skillId: "reader.build-index",
          createdAt: 10,
          updatedAt: 10,
        },
        {
          id: "event-2",
          kind: "run",
          entityId: "run-2",
          action: "run_succeeded",
          summary: "后运行能力",
          appId: "app:reader",
          skillId: "reader.build-index",
          createdAt: 20,
          updatedAt: 20,
        },
      ],
      {
        appLabelById: new Map([["app:reader", "小说阅读器"]]),
        skillLabelById: new Map([["reader.build-index", "重建阅读索引"]]),
      },
    );

    expect(timeline.map((item) => item.id)).toEqual(["event-2", "event-1"]);
    expect(timeline[0]?.appLabel).toBe("小说阅读器");
    expect(timeline[0]?.skillLabel).toBe("重建阅读索引");
    expect(timeline[0]?.actionLabel).toBe("运行成功");
  });
});
