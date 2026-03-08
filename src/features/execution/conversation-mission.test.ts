import { describe, expect, it } from "vitest";
import {
  buildConversationMissionRecord,
  pickConversationMissionRecord,
} from "./conversation-mission";

describe("conversation mission helpers", () => {
  it("uses topic key as the stable mission id when available", () => {
    const mission = buildConversationMissionRecord({
      sessionKey: "agent:co-ceo:main",
      topicKey: "mission:consistency-plan",
      startedAt: 123,
      title: "一致性方案",
      statusLabel: "处理中",
      progressLabel: "1/3",
      ownerAgentId: "co-ceo",
      ownerLabel: "CEO",
      currentStepLabel: "CEO · 收口方案",
      nextAgentId: "co-cto",
      nextLabel: "CTO · 交付技术方案",
      summary: "当前先由 CEO 汇总这轮方案。",
      guidance: "继续收口，再推进下一棒。",
      completed: false,
      updatedAt: 10,
      planSteps: [],
    });

    expect(mission.id).toBe("topic:mission:consistency-plan@123");
  });

  it("prefers current topic/round over stale session matches", () => {
    const missions = [
      buildConversationMissionRecord({
        sessionKey: "agent:co-ceo:main",
        topicKey: "chapter:2",
        startedAt: 10,
        title: "旧章节任务",
        statusLabel: "处理中",
        progressLabel: "1/3",
        ownerAgentId: "co-emp-0",
        ownerLabel: "主编",
        currentStepLabel: "主编 · 终审",
        nextAgentId: "co-cto",
        nextLabel: "CTO · 发布",
        summary: "旧章节仍在收尾。",
        guidance: "继续终审。",
        completed: false,
        updatedAt: 40,
        planSteps: [],
      }),
      buildConversationMissionRecord({
        sessionKey: "agent:co-ceo:main",
        topicKey: "mission:consistency-plan",
        startedAt: 200,
        title: "一致性方案",
        statusLabel: "待收口",
        progressLabel: "2/3",
        ownerAgentId: "co-ceo",
        ownerLabel: "CEO",
        currentStepLabel: "CEO · 收口方案",
        nextAgentId: "co-ceo",
        nextLabel: "CEO · 输出最终执行方案",
        summary: "CTO 和 COO 都回了。",
        guidance: "继续收口，再推进下一棒。",
        completed: false,
        updatedAt: 260,
        planSteps: [],
      }),
      buildConversationMissionRecord({
        sessionKey: "agent:co-ceo:group:consistency-abc123",
        roomId: "agent:co-ceo:group:consistency-abc123",
        topicKey: "mission:consistency-plan",
        startedAt: 200,
        title: "一致性团队房间",
        statusLabel: "等待回执",
        progressLabel: "2/3",
        ownerAgentId: "co-ceo",
        ownerLabel: "CEO",
        currentStepLabel: "需求团队 · 等待 CTO 回执",
        nextAgentId: "co-ceo",
        nextLabel: "CEO · 收口",
        summary: "团队房间里已经有人回复。",
        guidance: "等负责人收口。",
        completed: false,
        updatedAt: 20,
        planSteps: [],
      }),
    ];

    expect(
      pickConversationMissionRecord({
        missions,
        sessionKey: "agent:co-ceo:main",
        topicKey: "mission:consistency-plan",
        startedAt: 200,
      })?.title,
    ).toBe("一致性方案");
  });

  it("still prefers exact room matches inside requirement rooms", () => {
    const missions = [
      buildConversationMissionRecord({
        sessionKey: "agent:co-ceo:main",
        topicKey: "mission:consistency-plan",
        startedAt: 200,
        title: "一致性方案",
        statusLabel: "待收口",
        progressLabel: "2/3",
        ownerAgentId: "co-ceo",
        ownerLabel: "CEO",
        currentStepLabel: "CEO · 收口方案",
        nextAgentId: "co-ceo",
        nextLabel: "CEO · 输出最终执行方案",
        summary: "CTO 和 COO 都回了。",
        guidance: "继续收口，再推进下一棒。",
        completed: false,
        updatedAt: 260,
        planSteps: [],
      }),
      buildConversationMissionRecord({
        sessionKey: "agent:co-ceo:group:consistency-abc123",
        roomId: "agent:co-ceo:group:consistency-abc123",
        topicKey: "mission:consistency-plan",
        startedAt: 200,
        title: "一致性团队房间",
        statusLabel: "等待回执",
        progressLabel: "2/3",
        ownerAgentId: "co-ceo",
        ownerLabel: "CEO",
        currentStepLabel: "需求团队 · 等待 CTO 回执",
        nextAgentId: "co-ceo",
        nextLabel: "CEO · 收口",
        summary: "团队房间里已经有人回复。",
        guidance: "等负责人收口。",
        completed: false,
        updatedAt: 280,
        planSteps: [],
      }),
    ];

    expect(
      pickConversationMissionRecord({
        missions,
        roomId: "agent:co-ceo:group:consistency-abc123",
        topicKey: "mission:consistency-plan",
        startedAt: 200,
      })?.title,
    ).toBe("一致性团队房间");
  });
});
