import { describe, expect, it } from "vitest";
import { buildChatConversationSurface } from "./chat-conversation-surface";
import type { ChatMessage } from "../gateway";

function createMessages(): ChatMessage[] {
  return [
    {
      role: "user",
      text: "帮我搭一个 AI 自动化团队",
      timestamp: 1_000,
    },
    {
      role: "assistant",
      text: [
        "当前理解：先评估现有员工、工具和知识沉淀是否足够支撑自动化团队搭建。",
        "建议下一步：先由 CEO 盘点现有能力与缺口，再决定是否需要 CTO / COO 接手专项。",
        "是否可推进：是",
        "如果你要我继续收口，请告诉我：优先级、预算和交付时点。",
      ].join("\n"),
      timestamp: 1_010,
    },
  ];
}

describe("buildChatConversationSurface", () => {
  it("does not treat a structured requirement reply as a request to restart the conversation", () => {
    const surface = buildChatConversationSurface({
      activeCompany: null,
      activeConversationState: null,
      activeRequirementRoom: null,
      activeRoomRecords: [],
      activeWorkItems: [],
      activeRequirementAggregates: [],
      primaryRequirementId: null,
      companySessionSnapshots: [],
      requirementRoomSnapshots: [],
      requirementRoomSnapshotAgentIds: [],
      requestPreview: [],
      handoffPreview: [],
      structuredTaskPreview: null,
      messages: createMessages(),
      currentTime: 2_000,
      historyAgentId: "co-ceo",
      sessionKey: "agent:co-ceo:main",
      productRoomId: null,
      groupTopicKey: null,
      groupWorkItemId: null,
      isGroup: false,
      isCeoSession: true,
      isFreshConversation: false,
      isRequirementBootstrapPending: false,
      isSummaryOpen: false,
      summaryPanelView: "owner",
    });

    expect(surface.latestAssistantRequestsNewTask).toBe(false);
    expect(surface.ceoReplyExplicitlyRequestsNewTask).toBe(false);
  });
});
