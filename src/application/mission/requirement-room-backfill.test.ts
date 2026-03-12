import { describe, expect, it } from "vitest";
import { backfillRequirementRoomRecord } from "./requirement-room-backfill";
import type { Company, RequirementAggregateRecord, WorkItemRecord } from "../../domain";
import type { DispatchRecord, RequestRecord, RequirementRoomRecord } from "../../domain/delegation/types";

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
    ],
    quickPrompts: [],
    requests: [],
    createdAt: 1,
  };
}

function createAggregate(): RequirementAggregateRecord {
  return {
    id: "topic:mission:alpha",
    companyId: "company-1",
    topicKey: "mission:alpha",
    kind: "strategic",
    primary: true,
    workItemId: "topic:mission:alpha",
    roomId: "workitem:topic:mission:alpha",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    lifecyclePhase: "pre_requirement",
    stageGateStatus: "waiting_confirmation",
    stage: "待确认",
    summary: "当前主线已经明确。",
    nextAction: "创建需求房并收敛反馈。",
    memberIds: ["co-ceo", "co-cto"],
    sourceConversationId: "agent:co-ceo:main",
    startedAt: 1_000,
    updatedAt: 2_000,
    revision: 1,
    lastEvidenceAt: null,
    status: "waiting_owner",
    acceptanceStatus: "not_requested",
  };
}

function createWorkItem(): WorkItemRecord {
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
    title: "组建创作团队",
    goal: "形成明确的团队建设主线",
    headline: "组建创作团队",
    displayStage: "待确认",
    displaySummary: "当前主线已经明确。",
    displayOwnerLabel: "CEO",
    displayNextAction: "创建需求房并收敛反馈。",
    status: "draft",
    lifecyclePhase: "pre_requirement",
    stageGateStatus: "waiting_confirmation",
    stageLabel: "待确认",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    batonActorId: "co-cto",
    batonLabel: "CTO",
    roomId: "workitem:topic:mission:alpha",
    artifactIds: [],
    dispatchIds: ["dispatch:alpha:1"],
    startedAt: 1_000,
    updatedAt: 2_000,
    completedAt: null,
    summary: "当前主线已经明确。",
    nextAction: "创建需求房并收敛反馈。",
    steps: [],
  };
}

function createRoom(): RequirementRoomRecord {
  return {
    id: "workitem:topic:mission:alpha",
    companyId: "company-1",
    workItemId: "topic:mission:alpha",
    sessionKey: "room:workitem:topic:mission:alpha",
    title: "组建创作团队",
    topicKey: "mission:alpha",
    scope: "decision",
    memberIds: ["co-ceo", "co-cto"],
    memberActorIds: ["co-ceo", "co-cto"],
    ownerAgentId: "co-ceo",
    ownerActorId: "co-ceo",
    status: "active",
    headline: "组建创作团队",
    progress: "0 条可见消息",
    transcript: [],
    createdAt: 1_000,
    updatedAt: 1_000,
  };
}

describe("backfillRequirementRoomRecord", () => {
  it("defaults decision-shell ownership back to CEO when no execution work item exists", () => {
    const company = createCompany();
    const aggregate = {
      ...createAggregate(),
      ownerActorId: "co-cto",
      ownerLabel: "CTO",
      workItemId: null,
      roomId: "workitem:topic:mission:alpha",
    } satisfies RequirementAggregateRecord;

    const room = backfillRequirementRoomRecord({
      company,
      aggregate,
      workItem: null,
      room: null,
      dispatches: [],
      evidence: [],
      snapshots: [],
    });

    expect(room.scope).toBe("decision");
    expect(room.ownerActorId).toBe("co-ceo");
    expect(room.ownerAgentId).toBe("co-ceo");
  });

  it("hydrates a requirement room transcript from dispatches and member reports", () => {
    const company = createCompany();
    const aggregate = createAggregate();
    const room = backfillRequirementRoomRecord({
      company: {
        ...company,
        requests: [
          {
            id: "request:alpha:1",
            dispatchId: "dispatch:alpha:1",
            sessionKey: "agent:co-ceo:main",
            topicKey: "mission:alpha",
            taskId: "topic:mission:alpha",
            fromAgentId: "co-ceo",
            toAgentIds: ["co-cto"],
            title: "请输出技术方案",
            summary: "先给我一版技术方案。",
            status: "answered",
            resolution: "complete",
            responseSummary: "CTO 已提交第一版技术方案。",
            consumerSessionKey: "agent:co-cto:main",
            responseMessageTs: 1_900,
            createdAt: 1_200,
            updatedAt: 1_900,
          } satisfies RequestRecord,
        ],
      },
      aggregate,
      workItem: createWorkItem(),
      room: createRoom(),
      dispatches: [
        {
          id: "dispatch:alpha:1",
          workItemId: "topic:mission:alpha",
          roomId: "workitem:topic:mission:alpha",
          title: "请输出技术方案",
          summary: "先给我一版技术方案。",
          fromActorId: "co-ceo",
          targetActorIds: ["co-cto"],
          status: "sent",
          deliveryState: "sent",
          topicKey: "mission:alpha",
          createdAt: 1_200,
          updatedAt: 1_300,
        } satisfies DispatchRecord,
      ],
      evidence: [],
      snapshots: [],
    });

    expect(room.transcript.length).toBeGreaterThanOrEqual(2);
    expect(room.transcript.some((message) => message.role === "user" && message.text?.includes("技术方案"))).toBe(true);
    expect(room.transcript.some((message) => message.role === "assistant" && message.text?.includes("第一版技术方案"))).toBe(true);
    expect(room.progress).not.toBe("0 条可见消息");
  });
});
