import { describe, expect, it } from "vitest";
import {
  buildConversationMissionTruth,
  buildRequirementTeamRoomTruth,
  type ConversationMissionView,
} from "./conversation-truth";
import type { RequirementRoomRecord } from "../../domain/delegation/types";
import type { Company } from "../../domain/org/types";

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

function createCompany(): Company {
  return {
    id: "company-no",
    name: "No",
    description: "Test company",
    icon: "🏢",
    template: "default",
    employees: [
      {
        agentId: "co-ceo",
        nickname: "CEO",
        role: "CEO",
        isMeta: true,
        metaRole: "ceo",
      },
      {
        agentId: "co-cto",
        nickname: "CTO",
        role: "CTO",
        isMeta: true,
        metaRole: "cto",
      },
    ],
    quickPrompts: [],
    createdAt: 1_000,
  };
}

function createExistingRoom(): RequirementRoomRecord {
  return {
    id: "workitem:topic:mission:co-ceo",
    companyId: "company-no",
    workItemId: "topic:mission:co-ceo",
    sessionKey: "room:workitem:topic:mission:co-ceo",
    title: "需要我做什么？",
    topicKey: "mission:co-ceo",
    scope: "department",
    memberIds: ["co-ceo", "co-cto", "co-ops"],
    memberActorIds: ["co-ceo", "co-cto", "co-ops"],
    ownerAgentId: "co-cto",
    ownerActorId: "co-cto",
    status: "active",
    headline: "需要我做什么？",
    progress: "0 条可见消息",
    transcript: [],
    createdAt: 1_000,
    updatedAt: 1_000,
  };
}

describe("buildConversationMissionTruth", () => {
  it("does not persist CEO direct-chat truth before the draft becomes promotable", () => {
    const result = buildConversationMissionTruth({
      allowConversationPersistence: false,
      draftRequirement: null,
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
      draftRequirement: {
        state: "draft_ready",
        promotionReason: null,
        stageGateStatus: "waiting_confirmation",
      },
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
      promotionState: "draft_ready",
      lifecyclePhase: "pre_requirement",
      stageGateStatus: "waiting_confirmation",
    });
  });

  it("builds a fallback requirement room while the CEO draft is still waiting for confirmation", () => {
    const missionTruth = buildConversationMissionTruth({
      allowConversationPersistence: true,
      draftRequirement: {
        state: "awaiting_promotion_choice",
        promotionReason: null,
        stageGateStatus: "waiting_confirmation",
      },
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
      effectiveOwnerAgentId: "co-cto",
      displayNextBatonAgentId: null,
      missionIsCompleted: false,
    });

    const room = buildRequirementTeamRoomTruth({
      activeCompany: createCompany(),
      requirementTeam: null,
      isFreshConversation: false,
      isRequirementBootstrapPending: false,
      persistedWorkItem: null,
      groupWorkItemId: null,
      conversationMissionRecord: missionTruth.conversationMissionRecord,
      activeRoomRecords: [],
      effectiveOwnerAgentId: "co-cto",
      targetAgentId: "co-ceo",
      effectiveRequirementRoomSnapshots: [],
    });

    expect(room).toMatchObject({
      workItemId: missionTruth.conversationMissionRecord?.id,
      title: "推进番茄小说半自动 MVP",
      scope: "decision",
    });
    expect(room?.memberIds).toEqual(["co-ceo", "co-cto"]);
  });

  it("preserves an existing richer requirement room over fallback mission metadata", () => {
    const missionTruth = buildConversationMissionTruth({
      allowConversationPersistence: true,
      draftRequirement: {
        state: "awaiting_promotion_choice",
        promotionReason: null,
        stageGateStatus: "waiting_confirmation",
      },
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
      effectiveOwnerAgentId: "co-cto",
      displayNextBatonAgentId: null,
      missionIsCompleted: false,
    });

    const room = buildRequirementTeamRoomTruth({
      activeCompany: createCompany(),
      requirementTeam: null,
      isFreshConversation: false,
      isRequirementBootstrapPending: false,
      persistedWorkItem: null,
      groupWorkItemId: "topic:mission:co-ceo",
      conversationMissionRecord: {
        ...missionTruth.conversationMissionRecord!,
        id: "topic:mission:co-ceo",
        title: "当前规划/任务",
      },
      activeRoomRecords: [createExistingRoom()],
      effectiveOwnerAgentId: "co-cto",
      targetAgentId: "co-ceo",
      effectiveRequirementRoomSnapshots: [],
    });

    expect(room).toMatchObject({
      title: "需要我做什么？",
      ownerAgentId: "co-cto",
      scope: "department",
    });
    expect(room?.memberIds).toEqual(["co-ceo", "co-cto", "co-ops"]);
  });
});
