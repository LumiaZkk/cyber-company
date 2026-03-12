import { describe, expect, it } from "vitest";
import {
  applyRequirementEvidenceToAggregates,
  buildAggregateBackedRequirementOverview,
  reconcileRequirementAggregateState,
} from "./requirement-aggregate";
import type { Company, RequirementAggregateRecord, RequirementEvidenceEvent, WorkItemRecord } from "../../domain";
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

function createWorkItem(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
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
    title: "一致性底座",
    goal: "建设一致性底座",
    headline: "一致性底座",
    displayStage: "CTO 制定方案",
    displaySummary: "主线正在推进一致性底座。",
    displayOwnerLabel: "CEO",
    displayNextAction: "跟进 CTO 方案输出。",
    status: "active",
    lifecyclePhase: "active_requirement",
    stageGateStatus: "confirmed",
    stageLabel: "CTO 制定方案",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    batonActorId: "co-cto",
    batonLabel: "CTO",
    roomId: "workitem:topic:mission:alpha",
    artifactIds: [],
    dispatchIds: [],
    startedAt: 1_000,
    updatedAt: 2_000,
    completedAt: null,
    summary: "主线正在推进一致性底座。",
    nextAction: "跟进 CTO 方案输出。",
    steps: [
      {
        id: "step-cto",
        title: "CTO 输出技术方案",
        assigneeActorId: "co-cto",
        assigneeLabel: "CTO",
        status: "active",
        completionCriteria: "提交技术方案",
        detail: "正在起草方案。",
        updatedAt: 2_000,
      },
    ],
    ...overrides,
  };
}

function createRoom(overrides: Partial<RequirementRoomRecord> = {}): RequirementRoomRecord {
  return {
    id: "workitem:topic:mission:alpha",
    companyId: "company-1",
    workItemId: "topic:mission:alpha",
    sessionKey: "room:workitem:topic:mission:alpha",
    title: "一致性底座需求房",
    topicKey: "mission:alpha",
    memberIds: ["co-ceo", "co-cto"],
    memberActorIds: ["co-ceo", "co-cto"],
    ownerAgentId: "co-ceo",
    ownerActorId: "co-ceo",
    status: "active",
    headline: "一致性底座需求房",
    progress: "等待 CTO 输出方案",
    transcript: [],
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

describe("requirement aggregate", () => {
  it("keeps a single stable primary aggregate across newer unrelated work items", () => {
    const primaryWorkItem = createWorkItem();
    const result = reconcileRequirementAggregateState({
      companyId: "company-1",
      existingAggregates: [],
      primaryRequirementId: null,
      activeConversationStates: [
        {
          companyId: "company-1",
          conversationId: "agent:co-ceo:main",
          currentWorkKey: primaryWorkItem.workKey,
          currentWorkItemId: primaryWorkItem.id,
          currentRoundId: primaryWorkItem.roundId,
          updatedAt: 2_000,
        },
      ],
      activeWorkItems: [primaryWorkItem],
      activeRoomRecords: [createRoom()],
      activeRequirementEvidence: [],
    });

    const unrelatedWorkItem = createWorkItem({
      id: "topic:mission:beta",
      workKey: "topic:mission:beta",
      roundId: "topic:mission:beta",
      topicKey: "mission:beta",
      title: "发布链路重构",
      updatedAt: 9_000,
      startedAt: 8_000,
    });
    const next = reconcileRequirementAggregateState({
      companyId: "company-1",
      existingAggregates: result.activeRequirementAggregates,
      primaryRequirementId: result.primaryRequirementId,
      activeConversationStates: [
        {
          companyId: "company-1",
          conversationId: "agent:co-ceo:main",
          currentWorkKey: primaryWorkItem.workKey,
          currentWorkItemId: primaryWorkItem.id,
          currentRoundId: primaryWorkItem.roundId,
          updatedAt: 2_000,
        },
      ],
      activeWorkItems: [primaryWorkItem, unrelatedWorkItem],
      activeRoomRecords: [createRoom()],
      activeRequirementEvidence: [],
    });

    expect(result.primaryRequirementId).toBe(primaryWorkItem.id);
    expect(next.primaryRequirementId).toBe(primaryWorkItem.id);
    expect(next.activeRequirementAggregates.filter((aggregate) => aggregate.primary)).toHaveLength(1);
  });

  it("applies matching evidence without changing the primary aggregate", () => {
    const company = createCompany();
    const aggregate: RequirementAggregateRecord = {
      id: "topic:mission:alpha",
      companyId: "company-1",
      topicKey: "mission:alpha",
      kind: "strategic",
      primary: true,
      workItemId: "topic:mission:alpha",
      roomId: "workitem:topic:mission:alpha",
      ownerActorId: "co-ceo",
      ownerLabel: "CEO",
      lifecyclePhase: "active_requirement",
      stageGateStatus: "confirmed",
      stage: "CTO 制定方案",
      summary: "主线正在推进一致性底座。",
      nextAction: "跟进 CTO 方案输出。",
      memberIds: ["co-ceo", "co-cto"],
      sourceConversationId: "agent:co-ceo:main",
      startedAt: 1_000,
      updatedAt: 2_000,
      revision: 1,
      lastEvidenceAt: null,
      status: "active",
      acceptanceStatus: "not_requested",
    };
    const evidence: RequirementEvidenceEvent = {
      id: "evt-1",
      companyId: "company-1",
      aggregateId: "topic:mission:alpha",
      source: "company-event",
      sessionKey: "agent:co-cto:main",
      actorId: "co-cto",
      eventType: "requirement_progressed",
      timestamp: 3_000,
      payload: {
        workItemId: "topic:mission:alpha",
        ownerActorId: "co-cto",
        stage: "CTO 输出技术方案",
        summary: "CTO 已提交第一版技术方案。",
      },
      applied: false,
    };

    const result = applyRequirementEvidenceToAggregates({
      company,
      activeConversationStates: [],
      activeRequirementAggregates: [aggregate],
      activeRoomRecords: [createRoom()],
      activeWorkItems: [createWorkItem()],
      primaryRequirementId: aggregate.id,
      event: evidence,
    });

    expect(result.applied).toBe(true);
    expect(result.aggregateId).toBe(aggregate.id);
    expect(result.primaryRequirementId).toBe(aggregate.id);
    expect(result.activeRequirementAggregates[0]?.ownerActorId).toBe("co-cto");
    expect(result.activeRequirementAggregates[0]?.primary).toBe(true);
  });

  it("bootstraps a pre-requirement aggregate directly from a stable CEO draft", () => {
    const result = reconcileRequirementAggregateState({
      companyId: "company-1",
      existingAggregates: [],
      primaryRequirementId: null,
      activeConversationStates: [
        {
          companyId: "company-1",
          conversationId: "agent:co-ceo:main",
          currentWorkKey: null,
          currentWorkItemId: null,
          currentRoundId: null,
          draftRequirement: {
            topicKey: "mission:alpha",
            topicText: "组建小说创作团队",
            summary: "先明确组织搭建目标，并固化成需求主线。",
            ownerActorId: "co-ceo",
            ownerLabel: "CEO",
            stage: "待确认组织搭建方式",
            nextAction: "先创建需求房，再确认是否放行执行。",
            stageGateStatus: "waiting_confirmation",
            state: "awaiting_promotion_choice",
            promotionReason: null,
            promotable: true,
            updatedAt: 2_400,
          },
          updatedAt: 2_400,
        },
      ],
      activeWorkItems: [],
      activeRoomRecords: [],
      activeRequirementEvidence: [],
    });

    expect(result.primaryRequirementId).toBe("topic:mission:alpha");
    expect(result.activeRequirementAggregates[0]).toMatchObject({
      id: "topic:mission:alpha",
      lifecyclePhase: "pre_requirement",
      stageGateStatus: "waiting_confirmation",
      ownerActorId: "co-ceo",
      sourceConversationId: "agent:co-ceo:main",
    });
  });

  it("bootstraps an aggregate from report evidence when no aggregate exists yet", () => {
    const company = createCompany();
    const result = applyRequirementEvidenceToAggregates({
      company,
      activeConversationStates: [
        {
          companyId: "company-1",
          conversationId: "agent:co-ceo:main",
          currentWorkKey: null,
          currentWorkItemId: null,
          currentRoundId: null,
          draftRequirement: {
            topicKey: "mission:alpha",
            topicText: "搭建创作团队",
            summary: "把组织搭建目标固化成公司级需求。",
            ownerActorId: "co-ceo",
            ownerLabel: "CEO",
            stage: "待确认",
            nextAction: "先建立需求房并回收下游方案。",
            stageGateStatus: "waiting_confirmation",
            state: "awaiting_promotion_choice",
            promotionReason: null,
            promotable: true,
            updatedAt: 2_000,
          },
          updatedAt: 2_000,
        },
      ],
      activeRequirementAggregates: [],
      activeRoomRecords: [],
      activeWorkItems: [],
      primaryRequirementId: null,
      event: {
        id: "evt-report-1",
        companyId: "company-1",
        aggregateId: null,
        source: "company-event",
        sessionKey: "agent:co-ceo:main",
        actorId: "co-cto",
        eventType: "report_answered",
        timestamp: 3_000,
        payload: {
          topicKey: "mission:alpha",
          summary: "CTO 已完成技术方案初稿。",
          ownerActorId: "co-ceo",
        },
        applied: false,
      },
    });

    expect(result.applied).toBe(true);
    expect(result.aggregateId).toBe("topic:mission:alpha");
    expect(result.primaryRequirementId).toBe("topic:mission:alpha");
    expect(result.activeRequirementAggregates[0]?.summary).toContain("技术方案初稿");
  });

  it("does not let an empty shell room overwrite aggregate owner and progress", () => {
    const existingAggregate: RequirementAggregateRecord = {
      id: "topic:mission:alpha",
      companyId: "company-1",
      topicKey: "mission:alpha",
      kind: "strategic",
      primary: true,
      workItemId: "topic:mission:alpha",
      roomId: "workitem:topic:mission:alpha",
      ownerActorId: "co-coo",
      ownerLabel: "当前主线正在推进。",
      lifecyclePhase: "pre_requirement",
      stageGateStatus: "none",
      stage: "0 条可见消息",
      summary: "当前主线正在推进。",
      nextAction: "0 条可见消息",
      memberIds: ["co-ceo", "co-coo", "co-cto"],
      sourceConversationId: "agent:co-ceo:main",
      startedAt: 1_000,
      updatedAt: 10_000,
      revision: 4,
      lastEvidenceAt: null,
      status: "active",
      acceptanceStatus: "not_requested",
    };

    const result = reconcileRequirementAggregateState({
      companyId: "company-1",
      existingAggregates: [existingAggregate],
      primaryRequirementId: existingAggregate.id,
      activeConversationStates: [
        {
          companyId: "company-1",
          conversationId: "agent:co-ceo:main",
          currentWorkKey: "topic:mission:alpha",
          currentWorkItemId: "topic:mission:alpha",
          currentRoundId: null,
          draftRequirement: null,
          updatedAt: 10_000,
        },
      ],
      activeWorkItems: [],
      activeRoomRecords: [
        createRoom({
          title: "当前主线正在推进。",
          headline: "当前主线正在推进。",
          progress: "0 条可见消息",
          ownerActorId: "co-coo",
          ownerAgentId: "co-coo",
          transcript: [],
          updatedAt: 10_500,
        }),
      ],
      activeRequirementEvidence: [],
    });

    expect(result.activeRequirementAggregates[0]).toMatchObject({
      id: "topic:mission:alpha",
      ownerActorId: "co-ceo",
      nextAction: "继续推进当前主线。",
      stage: "进行中",
    });
  });

  it("keeps an aggregate-backed overview when raw overview drifts to another topic", () => {
    const company = createCompany();
    const workItem = createWorkItem();
    const aggregate: RequirementAggregateRecord = {
      id: workItem.id,
      companyId: "company-1",
      topicKey: "mission:alpha",
      kind: "strategic",
      primary: true,
      workItemId: workItem.id,
      roomId: workItem.roomId ?? null,
      ownerActorId: "co-ceo",
      ownerLabel: "CEO",
      lifecyclePhase: "active_requirement",
      stageGateStatus: "confirmed",
      stage: "CTO 制定方案",
      summary: "主线正在推进一致性底座。",
      nextAction: "跟进 CTO 方案输出。",
      memberIds: ["co-ceo", "co-cto"],
      sourceConversationId: "agent:co-ceo:main",
      startedAt: 1_000,
      updatedAt: 2_000,
      revision: 1,
      lastEvidenceAt: null,
      status: "active",
      acceptanceStatus: "not_requested",
    };

    const overview = buildAggregateBackedRequirementOverview({
      company,
      aggregate,
      workItem,
      room: createRoom(),
      rawOverview: {
        topicKey: "mission:beta",
        title: "错误主线",
        startedAt: 5_000,
        headline: "错误主线",
        summary: "这条 overview 不应抢主线。",
        currentOwnerAgentId: "co-coo",
        currentOwnerLabel: "COO",
        currentStage: "错误阶段",
        nextAction: "错误 next",
        participants: [],
      },
    });

    expect(overview?.topicKey).toBe("mission:alpha");
    expect(overview?.currentOwnerAgentId).toBe("co-ceo");
    expect(overview?.title).toBe("一致性底座");
    expect(overview?.participants.length).toBeGreaterThan(0);
  });

  it("derives a canonical overview topic key from a wrapped aggregate id when topicKey is missing", () => {
    const company = createCompany();
    const overview = buildAggregateBackedRequirementOverview({
      company,
      aggregate: {
        id: "topic:aggregate:topic:aggregate:topic:mission:alpha@1000@2000",
        companyId: "company-1",
        topicKey: null,
        kind: "strategic",
        primary: true,
        workItemId: null,
        roomId: null,
        ownerActorId: "co-ceo",
        ownerLabel: "CEO",
        lifecyclePhase: "active_requirement",
        stageGateStatus: "confirmed",
        stage: "CEO 发起主线",
        summary: "从头开始搭建 AI 小说创作团队。",
        nextAction: "让 CTO 和 COO 分别给出方案。",
        memberIds: ["co-ceo", "co-cto"],
        sourceConversationId: "agent:co-ceo:main",
        startedAt: 1_000,
        updatedAt: 2_000,
        revision: 1,
        lastEvidenceAt: null,
        status: "active",
        acceptanceStatus: "not_requested",
      },
      workItem: null,
      room: null,
      rawOverview: {
        topicKey: "aggregate:topic:aggregate:topic:mission:alpha@1000",
        title: "错误主线",
        startedAt: 1_500,
        headline: "错误主线",
        summary: "不应继续保留 aggregate 包裹。",
        currentOwnerAgentId: "co-cto",
        currentOwnerLabel: "CTO",
        currentStage: "错误阶段",
        nextAction: "错误 next",
        participants: [],
      },
    });

    expect(overview?.topicKey).toBe("mission:alpha");
    expect(overview?.title).toBe("从头开始搭建 AI 小说创作团队。");
  });
});
