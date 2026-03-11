import { describe, expect, it } from "vitest";
import { buildConversationMissionTruth, type ConversationMissionView } from "./conversation-truth";

function createConversationMission(): ConversationMissionView {
  return {
    title: "推进番茄小说半自动 MVP",
    statusLabel: "进行中",
    progressLabel: "CEO 收敛中",
    ownerLabel: "CEO",
    currentStepLabel: "判断现有条件",
    nextLabel: "给出下一步",
    summary: "先判断现有能力是否足够直接推进。",
    guidance: "先收敛目标，再决定是否派单。",
    planSteps: [],
  };
}

describe("buildConversationMissionTruth", () => {
  it("does not persist CEO direct-chat truth before the draft becomes promotable", () => {
    const result = buildConversationMissionTruth({
      allowConversationPersistence: false,
      isGroup: false,
      isCeoSession: true,
      sessionKey: "agent:co-ceo:main",
      isArchiveView: false,
      isFreshConversation: false,
      isRequirementBootstrapPending: false,
      latestMessageTimestamp: 1_000,
      effectiveRequirementRoom: null,
      requirementOverview: null,
      persistedWorkItem: null,
      persistedConversationMission: null,
      conversationMission: createConversationMission(),
      hasStableConversationWorkItem: false,
      shouldPreferPersistedConversationMission: false,
      groupTopicKey: null,
      productRoomId: null,
      effectiveOwnerAgentId: "co-ceo",
      displayNextBatonAgentId: null,
      missionIsCompleted: false,
    });

    expect(result.shouldPersistConversationTruth).toBe(false);
  });

  it("persists CEO direct-chat truth once promotion is allowed", () => {
    const result = buildConversationMissionTruth({
      allowConversationPersistence: true,
      isGroup: false,
      isCeoSession: true,
      sessionKey: "agent:co-ceo:main",
      isArchiveView: false,
      isFreshConversation: false,
      isRequirementBootstrapPending: false,
      latestMessageTimestamp: 1_000,
      effectiveRequirementRoom: null,
      requirementOverview: null,
      persistedWorkItem: null,
      persistedConversationMission: null,
      conversationMission: createConversationMission(),
      hasStableConversationWorkItem: false,
      shouldPreferPersistedConversationMission: false,
      groupTopicKey: null,
      productRoomId: null,
      effectiveOwnerAgentId: "co-ceo",
      displayNextBatonAgentId: null,
      missionIsCompleted: false,
    });

    expect(result.shouldPersistConversationTruth).toBe(true);
    expect(result.conversationMissionRecord).toMatchObject({
      sessionKey: "agent:co-ceo:main",
      ownerAgentId: "co-ceo",
      title: "推进番茄小说半自动 MVP",
    });
  });
});
