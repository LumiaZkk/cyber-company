import { describe, expect, it } from "vitest";
import { buildRequirementPromotionSystemMessages } from "./promotion-system-events";

describe("buildRequirementPromotionSystemMessages", () => {
  it("creates a manual promotion system event", () => {
    const events = buildRequirementPromotionSystemMessages({
      draftRequirement: {
        topicKey: "topic:mission:novel-mvp",
        topicText: "小说发布 MVP",
        summary: "先把需求主线固定下来。",
        ownerActorId: "co-ceo",
        ownerLabel: "CEO",
        stage: "待确认",
        nextAction: "确认并推进",
        state: "promoted_manual",
        promotionReason: "manual_confirmation",
        promotable: true,
        updatedAt: 2_000,
      },
    });

    expect(events).toEqual([
      expect.objectContaining({
        role: "system",
        text: "已转为需求主线，后续协作将在需求房和工作看板持续同步。",
        timestamp: 2_000,
      }),
    ]);
  });

  it("creates an auto-promotion system event for task-board detection", () => {
    const events = buildRequirementPromotionSystemMessages({
      draftRequirement: {
        topicKey: "topic:mission:novel-mvp",
        topicText: "小说发布 MVP",
        summary: "任务板已经形成。",
        ownerActorId: "co-ceo",
        ownerLabel: "CEO",
        stage: "执行中",
        nextAction: "打开需求房",
        state: "promoted_auto",
        promotionReason: "task_board_detected",
        promotable: true,
        updatedAt: 3_000,
      },
    });

    expect(events[0]?.text).toBe("检测到 CEO 已输出可执行任务板，系统已自动转为需求主线。");
  });
});
