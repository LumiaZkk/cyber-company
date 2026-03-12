import { describe, expect, it } from "vitest";
import { buildPrimaryRequirementSurface } from "./primary-requirement-surface";
import type { Company, RequirementAggregateRecord, WorkItemRecord } from "../../domain";
import type { RequirementRoomRecord } from "../../domain/delegation/types";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "test",
    icon: "C",
    template: "novel",
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo" },
      { agentId: "co-cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto" },
      { agentId: "co-coo", nickname: "COO", role: "Chief Operating Officer", isMeta: true, metaRole: "coo" },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createDecisionAggregate(): RequirementAggregateRecord {
  return {
    id: "topic:mission:alpha",
    companyId: "company-1",
    topicKey: "mission:alpha",
    kind: "strategic",
    primary: true,
    workItemId: null,
    roomId: "workitem:topic:mission:alpha",
    ownerActorId: "co-coo",
    ownerLabel: "COO",
    lifecyclePhase: "pre_requirement",
    stageGateStatus: "waiting_confirmation",
    stage: "0 条可见消息",
    summary: "需要老板在 A/B/C 方案里做选择。",
    nextAction: "等待老板确认下一步。",
    memberIds: ["co-ceo", "co-cto", "co-coo"],
    sourceConversationId: "agent:co-ceo:main",
    startedAt: 1_000,
    updatedAt: 2_000,
    revision: 1,
    lastEvidenceAt: null,
    status: "waiting_owner",
    acceptanceStatus: "not_requested",
  };
}

function createDecisionRoom(): RequirementRoomRecord {
  return {
    id: "workitem:topic:mission:alpha",
    companyId: "company-1",
    workItemId: "topic:mission:alpha",
    sessionKey: "room:workitem:topic:mission:alpha",
    title: "需求团队房间",
    topicKey: "mission:alpha",
    scope: "decision",
    memberIds: ["co-ceo", "co-cto", "co-coo"],
    memberActorIds: ["co-ceo", "co-cto", "co-coo"],
    ownerAgentId: "co-coo",
    ownerActorId: "co-coo",
    status: "active",
    transcript: [],
    createdAt: 1_000,
    updatedAt: 2_000,
  };
}

function createPreviewWorkItem(): WorkItemRecord {
  return {
    id: "topic:mission:alpha",
    workKey: "topic:mission:alpha",
    kind: "strategic",
    roundId: "topic:mission:alpha",
    companyId: "company-1",
    sessionKey: "agent:co-ceo:main",
    topicKey: "mission:alpha",
    sourceActorId: "co-ceo",
    sourceActorLabel: "CEO",
    sourceSessionKey: "agent:co-ceo:main",
    sourceConversationId: "agent:co-ceo:main",
    providerId: null,
    title: "需要老板在 A/B/C 方案里做选择。",
    goal: "等待老板确认",
    headline: "需要老板在 A/B/C 方案里做选择。",
    displayStage: "团队回执已到齐",
    displaySummary: "方案已经齐全，等待老板确认下一步。",
    displayOwnerLabel: "COO",
    displayNextAction: "等待 CEO 收口",
    status: "draft",
    lifecyclePhase: "pre_requirement",
    stageGateStatus: "none",
    stageLabel: "团队回执已到齐",
    ownerActorId: "co-coo",
    ownerLabel: "COO",
    batonActorId: "co-ceo",
    batonLabel: "CEO",
    roomId: "workitem:topic:mission:alpha",
    artifactIds: [],
    dispatchIds: [],
    startedAt: 1_000,
    updatedAt: 2_500,
    completedAt: null,
    summary: "方案已经齐全，等待老板确认下一步。",
    nextAction: "等待 CEO 收口",
    steps: [],
  };
}

describe("buildPrimaryRequirementSurface", () => {
  it("treats pre-requirement decision rooms as waiting on the user", () => {
    const surface = buildPrimaryRequirementSurface({
      company: createCompany(),
      activeConversationStates: [],
      activeWorkItems: [],
      activeRequirementAggregates: [createDecisionAggregate()],
      activeRequirementEvidence: [],
      activeDecisionTickets: [],
      primaryRequirementId: "topic:mission:alpha",
      activeRoomRecords: [createDecisionRoom()],
      companySessions: [],
      companySessionSnapshots: [],
      currentTime: 5_000,
      ceoAgentId: "co-ceo",
    });

    expect(surface.ownerActorId).toBe("co-ceo");
    expect(surface.ownerLabel).toBe("CEO");
    expect(surface.currentStep).toBe("待你确认下一步");
    expect(surface.nextBatonActorId).toBeNull();
    expect(surface.nextBatonLabel).toBe("你");
  });

  it("treats unbound pre-requirement shells as CEO-owned until structured state arrives", () => {
    const surface = buildPrimaryRequirementSurface({
      company: createCompany(),
      activeConversationStates: [],
      activeWorkItems: [],
      activeRequirementAggregates: [createDecisionAggregate()],
      activeRequirementEvidence: [],
      activeDecisionTickets: [],
      primaryRequirementId: "topic:mission:alpha",
      activeRoomRecords: [],
      companySessions: [],
      companySessionSnapshots: [],
      currentTime: 5_000,
      ceoAgentId: "co-ceo",
    });

    expect(surface.ownerActorId).toBe("co-ceo");
    expect(surface.ownerLabel).toBe("CEO");
    expect(surface.currentStep).toBe("等待结构化状态声明");
    expect(surface.nextBatonActorId).toBeNull();
    expect(surface.nextBatonLabel).toBe("待结构化确认");
  });

  it("does not let pre-requirement decision work items break a user decision shell", () => {
    const surface = buildPrimaryRequirementSurface({
      company: createCompany(),
      activeConversationStates: [],
      activeWorkItems: [createPreviewWorkItem()],
      activeRequirementAggregates: [createDecisionAggregate()],
      activeRequirementEvidence: [],
      activeDecisionTickets: [],
      primaryRequirementId: "topic:mission:alpha",
      activeRoomRecords: [createDecisionRoom()],
      companySessions: [],
      companySessionSnapshots: [],
      currentTime: 5_000,
      ceoAgentId: "co-ceo",
    });

    expect(surface.workItem?.id).toBe("topic:mission:alpha");
    expect(surface.lifecyclePhase).toBe("pre_requirement");
    expect(surface.stageGateStatus).toBe("waiting_confirmation");
    expect(surface.ownerActorId).toBe("co-ceo");
    expect(surface.currentStep).toBe("待你确认下一步");
    expect(surface.nextBatonActorId).toBeNull();
    expect(surface.nextBatonLabel).toBe("你");
  });

  it("prefers the original CEO requirement when generic work item titles leak into the room", () => {
    const surface = buildPrimaryRequirementSurface({
      company: createCompany(),
      activeConversationStates: [],
      activeWorkItems: [
        {
          ...createPreviewWorkItem(),
          title: "当前主线正在推进。",
          displaySummary: "方案已经齐全，等待老板确认下一步。",
          summary: "方案已经齐全，等待老板确认下一步。",
        },
      ],
      activeRequirementAggregates: [
        {
          ...createDecisionAggregate(),
          summary: "当前主线正在推进。",
        },
      ],
      activeRequirementEvidence: [],
      activeDecisionTickets: [],
      primaryRequirementId: "topic:mission:alpha",
      activeRoomRecords: [createDecisionRoom()],
      companySessions: [],
      companySessionSnapshots: [
        {
          agentId: "co-ceo",
          sessionKey: "agent:co-ceo:main",
          updatedAt: 2_500,
          messages: [
            {
              role: "user",
              text: "我想通过ai完成完整的小说创作，选题可以自动化完成题材探索，也可以支持人工选题，要求高质量，一致性高不能前后文不一致，要去ai味，可以自动发布到对应小说平台，而且能学习和分析怎么优化流程。我需要全流程纯ai无须人工介入，如果有问题，ai内部会相互协助解决。帮我推进实现",
              timestamp: 1_100,
            },
            {
              role: "user",
              text: "发出结构化决策选项@CEO",
              timestamp: 2_400,
            },
          ],
        },
      ],
      currentTime: 5_000,
      ceoAgentId: "co-ceo",
    });

    expect(surface.title).toBe("全自动AI小说创作系统");
    expect(surface.summary).toContain("小说创作");
  });

  it("can recover a meaningful title from room transcript when snapshot hints are missing", () => {
    const surface = buildPrimaryRequirementSurface({
      company: createCompany(),
      activeConversationStates: [],
      activeWorkItems: [
        {
          ...createPreviewWorkItem(),
          title: "当前主线正在推进。",
        },
      ],
      activeRequirementAggregates: [
        {
          ...createDecisionAggregate(),
          summary: "当前主线正在推进。",
        },
      ],
      activeRequirementEvidence: [],
      activeDecisionTickets: [],
      primaryRequirementId: "topic:mission:alpha",
      activeRoomRecords: [
        {
          ...createDecisionRoom(),
          transcript: [
            {
              id: "room-msg-1",
              role: "user",
              text: "我想通过ai完成完整的小说创作，选题可以自动化完成题材探索，也可以支持人工选题，要求高质量，一致性高不能前后文不一致，要去ai味，可以自动发布到对应小说平台，而且能学习和分析怎么优化流程。",
              timestamp: 1_100,
            },
          ],
        },
      ],
      companySessions: [],
      companySessionSnapshots: [],
      currentTime: 5_000,
      ceoAgentId: "co-ceo",
    });

    expect(surface.title).toBe("全自动AI小说创作系统");
  });
});
