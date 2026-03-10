import { describe, expect, it } from "vitest";
import type { Company, WorkItemRecord } from "../../domain";
import type { RequirementExecutionOverview } from "./requirement-overview";
import { buildRequirementScope } from "./requirement-scope";
import { applyWorkItemDisplayFields } from "./work-item";

const company: Company = {
  id: "novel",
  name: "小说创作工作室",
  description: "test",
  icon: "🦞",
  template: "novel",
  employees: [
    { agentId: "co-ceo", nickname: "CEO", role: "首席执行官", isMeta: true, metaRole: "ceo" },
    { agentId: "co-cto", nickname: "CTO", role: "首席技术官", isMeta: true, metaRole: "cto" },
    { agentId: "co-coo", nickname: "COO", role: "首席运营官", isMeta: true, metaRole: "coo" },
    { agentId: "co-emp-1", nickname: "写手", role: "主笔", isMeta: false },
  ],
  quickPrompts: [],
  tasks: [
    {
      id: "task-relevant",
      title: "输出一致性方案",
      sessionKey: "agent:co-cto:main",
      agentId: "co-cto",
      ownerAgentId: "co-ceo",
      assigneeAgentIds: ["co-cto"],
      steps: [],
      createdAt: 1_000,
      updatedAt: 6_000,
      summary: "CTO 输出一致性技术方案",
    },
    {
      id: "task-old",
      title: "输出一致性方案",
      sessionKey: "agent:co-cto:main",
      agentId: "co-cto",
      ownerAgentId: "co-ceo",
      assigneeAgentIds: ["co-cto"],
      steps: [],
      createdAt: 1_000,
      updatedAt: 2_000,
      summary: "旧任务",
    },
    {
      id: "task-other-agent",
      title: "输出一致性方案",
      sessionKey: "agent:co-emp-1:main",
      agentId: "co-emp-1",
      ownerAgentId: "co-ceo",
      assigneeAgentIds: ["co-emp-1"],
      steps: [],
      createdAt: 1_000,
      updatedAt: 6_500,
      summary: "不属于当前主线成员",
    },
  ],
  requests: [
    {
      id: "request-relevant",
      sessionKey: "agent:co-cto:main",
      topicKey: "mission:consistency-platform",
      fromAgentId: "co-ceo",
      toAgentIds: ["co-cto"],
      title: "让 CTO 输出一致性技术方案",
      summary: "请 CTO 输出方案。",
      status: "acknowledged",
      resolution: "pending",
      createdAt: 5_500,
      updatedAt: 6_000,
    },
    {
      id: "request-other-agent",
      sessionKey: "agent:co-emp-1:main",
      topicKey: "mission:consistency-platform",
      fromAgentId: "co-ceo",
      toAgentIds: ["co-emp-1"],
      title: "无关成员也被误匹配",
      summary: "应该被过滤。",
      status: "pending",
      resolution: "pending",
      createdAt: 5_500,
      updatedAt: 6_000,
    },
  ],
  handoffs: [],
  createdAt: 1,
};

const overview: RequirementExecutionOverview = {
  title: "一致性底座与内部审阅系统执行方案",
  topicKey: "mission:consistency-platform",
  headline: "当前卡点在 CEO",
  summary: "CTO 与 COO 已回传，等待 CEO 整合。",
  currentOwnerAgentId: "co-ceo",
  currentOwnerLabel: "CEO",
  currentStage: "整合团队方案并交付老板",
  nextAction: "让 CEO 输出最终执行方案和优先级。",
  startedAt: 3_000,
  participants: [
    {
      agentId: "co-cto",
      nickname: "CTO",
      role: "首席技术官",
      stage: "输出一致性技术方案",
      statusLabel: "已回复",
      detail: "已回传",
      updatedAt: 6_000,
      tone: "emerald",
      isBlocking: false,
      isCurrent: false,
    },
    {
      agentId: "co-ceo",
      nickname: "CEO",
      role: "首席执行官",
      stage: "整合团队方案并交付老板",
      statusLabel: "已开工",
      detail: "待 CEO 收口",
      updatedAt: 6_100,
      tone: "violet",
      isBlocking: false,
      isCurrent: true,
    },
  ],
};

const workItem: WorkItemRecord = applyWorkItemDisplayFields({
  id: "mission:consistency-platform",
  workKey: "topic:mission:consistency-platform",
  kind: "strategic",
  roundId: "topic:mission:consistency-platform@5000",
  companyId: "novel",
  topicKey: "mission:consistency-platform",
  title: "一致性底座与内部审阅系统执行方案",
  goal: "先搭一致性底座，再做内部审阅系统。",
  status: "waiting_owner",
  stageLabel: "整合团队方案并交付老板",
  ownerActorId: "co-ceo",
  ownerLabel: "CEO",
  batonActorId: "co-ceo",
  batonLabel: "CEO",
  artifactIds: [],
  dispatchIds: [],
  roomId: "workitem:mission:consistency-platform",
  startedAt: 5_000,
  updatedAt: 6_100,
  summary: "CTO 与 COO 已回传，等待 CEO 整合。",
  nextAction: "让 CEO 输出最终执行方案和优先级。",
  steps: [
    {
      id: "step-cto",
      title: "输出一致性技术方案",
      assigneeActorId: "co-cto",
      assigneeLabel: "CTO",
      status: "done",
      updatedAt: 6_000,
    },
    {
      id: "step-ceo",
      title: "整合团队方案并交付老板",
      assigneeActorId: "co-ceo",
      assigneeLabel: "CEO",
      status: "active",
      updatedAt: 6_100,
    },
  ],
});

describe("buildRequirementScope", () => {
  it("prefers WorkItem timing and participants when scoping requests and tasks", () => {
    const scope = buildRequirementScope(company, overview, workItem);

    expect(scope?.tasks.map((task) => task.id)).toEqual(["task-relevant"]);
    expect(scope?.requests.map((request) => request.id)).toEqual(["request-relevant"]);
    expect(scope?.participantAgentIds).toContain("co-ceo");
    expect(scope?.participantAgentIds).toContain("co-cto");
    expect(scope?.participantAgentIds).not.toContain("co-emp-1");
  });
});
