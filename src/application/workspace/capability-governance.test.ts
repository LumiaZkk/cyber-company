import { describe, expect, it } from "vitest";
import {
  buildCapabilityVerificationQueue,
  buildCapabilityIssueBoard,
  buildCapabilityRequestBoard,
  resolveCapabilityIssueLane,
  resolveCapabilityRequestLane,
} from "./capability-governance";

describe("capability-governance", () => {
  it("groups capability requests into backlog, building, verify, and closed lanes", () => {
    const board = buildCapabilityRequestBoard([
      {
        id: "request:closed",
        type: "app",
        summary: "关闭项",
        status: "closed",
        updatedAt: 1,
        createdAt: 1,
      },
      {
        id: "request:ready",
        type: "tool",
        summary: "待验证项",
        requesterLabel: "COO",
        appId: "app:reader",
        skillId: "reader.build-index",
        status: "ready",
        updatedAt: 5,
        createdAt: 1,
      },
      {
        id: "request:building",
        type: "tool",
        summary: "建设中项",
        status: "building",
        updatedAt: 4,
        createdAt: 1,
      },
      {
        id: "request:open",
        type: "check",
        summary: "新请求",
        status: "open",
        updatedAt: 6,
        createdAt: 1,
      },
      {
        id: "request:triaged",
        type: "import",
        summary: "已评估项",
        status: "triaged",
        updatedAt: 3,
        createdAt: 1,
      },
    ], {
      appLabelById: new Map([["app:reader", "小说阅读器"]]),
      skillLabelById: new Map([["reader.build-index", "重建阅读索引"]]),
    });

    expect(resolveCapabilityRequestLane("open")).toBe("backlog");
    expect(resolveCapabilityRequestLane("building")).toBe("building");
    expect(resolveCapabilityRequestLane("ready")).toBe("verify");
    expect(resolveCapabilityRequestLane("closed")).toBe("closed");
    expect(board.lanes.map((lane) => `${lane.id}:${lane.count}`)).toEqual([
      "backlog:2",
      "building:1",
      "verify:1",
      "closed:1",
    ]);
    expect(board.lanes[0]?.items[0]?.summary).toBe("新请求");
    expect(board.lanes[2]?.items[0]?.relatedLabels).toEqual([
      "App · 小说阅读器",
      "能力 · 重建阅读索引",
    ]);
  });

  it("groups capability issues into backlog, building, verify, and closed lanes", () => {
    const board = buildCapabilityIssueBoard([
      {
        id: "issue:fixing",
        type: "runtime_error",
        summary: "修复中问题",
        status: "fixing",
        updatedAt: 3,
        createdAt: 1,
      },
      {
        id: "issue:open",
        type: "unavailable",
        summary: "新问题",
        reporterLabel: "主编",
        status: "open",
        updatedAt: 6,
        createdAt: 1,
      },
      {
        id: "issue:verify",
        type: "bad_result",
        summary: "待回访问题",
        status: "ready_for_verify",
        updatedAt: 5,
        createdAt: 1,
      },
      {
        id: "issue:closed",
        type: "runtime_error",
        summary: "已关闭问题",
        status: "closed",
        updatedAt: 1,
        createdAt: 1,
      },
      {
        id: "issue:ack",
        type: "runtime_error",
        summary: "已确认问题",
        status: "acknowledged",
        updatedAt: 4,
        createdAt: 1,
      },
    ]);

    expect(resolveCapabilityIssueLane("open")).toBe("backlog");
    expect(resolveCapabilityIssueLane("fixing")).toBe("building");
    expect(resolveCapabilityIssueLane("verified")).toBe("verify");
    expect(resolveCapabilityIssueLane("closed")).toBe("closed");
    expect(board.lanes.map((lane) => `${lane.id}:${lane.count}`)).toEqual([
      "backlog:2",
      "building:1",
      "verify:1",
      "closed:1",
    ]);
    expect(board.lanes[0]?.items[0]?.summary).toBe("新问题");
    expect(board.lanes[0]?.items[0]?.nextActorLabel).toBe("业务负责人补事实");
  });

  it("builds a verify-first queue across requests and issues", () => {
    const queue = buildCapabilityVerificationQueue(
      [
        {
          id: "request:ready",
          type: "app",
          summary: "阅读器待业务验收",
          appId: "app:reader",
          skillId: "reader.build-index",
          requesterLabel: "COO",
          contextFileName: "chapters/第一章.md",
          status: "ready",
          updatedAt: 10,
          createdAt: 1,
        },
      ],
      [
        {
          id: "issue:verify",
          type: "bad_result",
          summary: "预检问题待回访",
          appId: "app:review",
          skillId: "review.precheck",
          reporterLabel: "主编",
          contextRunId: "skill-run:1",
          status: "ready_for_verify",
          updatedAt: 12,
          createdAt: 1,
        },
        {
          id: "issue:open",
          type: "runtime_error",
          summary: "不应进入验证队列",
          status: "open",
          updatedAt: 15,
          createdAt: 1,
        },
      ],
      {
        appLabelById: new Map([
          ["app:reader", "小说阅读器"],
          ["app:review", "审阅控制台"],
        ]),
        skillLabelById: new Map([
          ["reader.build-index", "重建阅读索引"],
          ["review.precheck", "发布前检查"],
        ]),
      },
    );

    expect(queue.map((item) => item.id)).toEqual(["issue:verify", "request:ready"]);
    expect(queue[0]).toMatchObject({
      kind: "issue",
      appLabel: "审阅控制台",
      skillLabel: "发布前检查",
      contextRunId: "skill-run:1",
    });
    expect(queue[1]).toMatchObject({
      kind: "request",
      appLabel: "小说阅读器",
      contextFileName: "chapters/第一章.md",
    });
  });
});
