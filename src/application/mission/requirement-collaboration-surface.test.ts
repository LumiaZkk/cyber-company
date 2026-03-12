import { describe, expect, it } from "vitest";
import { buildRequirementCollaborationSurface } from "./requirement-collaboration-surface";
import type { PrimaryRequirementSurface } from "./primary-requirement-surface";
import type { Company } from "../../domain/org/types";
import type { RequirementExecutionOverview } from "./requirement-overview-types";
import type { RequirementScope } from "./requirement-scope";
import type { WorkItemRecord } from "../../domain/mission/types";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "test",
    icon: "C",
    template: "novel",
    employees: [
      { agentId: "ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo" },
      { agentId: "cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto" },
      { agentId: "coo", nickname: "COO", role: "Chief Operating Officer", isMeta: true, metaRole: "coo" },
      { agentId: "hr", nickname: "HR", role: "Human Resources Director", isMeta: true, metaRole: "hr" },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createOverview(): RequirementExecutionOverview {
  return {
    topicKey: "mission:alpha",
    title: "全自动AI小说创作系统",
    startedAt: 1_000,
    headline: "当前主线正在推进。",
    summary: "三管齐下并行推进。",
    currentOwnerAgentId: "ceo",
    currentOwnerLabel: "CEO",
    currentStage: "等待 CEO 收口",
    nextAction: "收齐方案后进入下一阶段。",
    participants: [
      {
        agentId: "cto",
        nickname: "CTO",
        role: "Chief Technology Officer",
        stage: "技术开发方案",
        statusLabel: "已开工",
        detail: "技术方案已经进入搭建阶段。",
        updatedAt: 3_000,
        tone: "blue",
        isBlocking: false,
        isCurrent: true,
      },
      {
        agentId: "coo",
        nickname: "COO",
        role: "Chief Operating Officer",
        stage: "平台入驻方案",
        statusLabel: "已接单",
        detail: "平台账号注册方案已接单。",
        updatedAt: 2_500,
        tone: "violet",
        isBlocking: false,
        isCurrent: false,
      },
      {
        agentId: "hr",
        nickname: "HR",
        role: "Human Resources Director",
        stage: "团队搭建方案",
        statusLabel: "已阻塞",
        detail: "团队岗位职责还缺少最后确认。",
        updatedAt: 2_800,
        tone: "rose",
        isBlocking: true,
        isCurrent: false,
      },
    ],
  };
}

function createScope(): RequirementScope {
  return {
    topicKey: "mission:alpha",
    title: "全自动AI小说创作系统",
    tasks: [],
    requests: [
      {
        id: "req-cto",
        sessionKey: "agent:ceo:main",
        topicKey: "mission:alpha",
        fromAgentId: "ceo",
        toAgentIds: ["cto"],
        title: "启动 A - 技术开发",
        summary: "请 CTO 启动技术底座搭建。",
        status: "acknowledged",
        deliveryState: "acknowledged",
        resolution: "pending",
        updatedAt: 3_000,
        createdAt: 2_000,
      },
      {
        id: "req-coo",
        sessionKey: "agent:ceo:main",
        topicKey: "mission:alpha",
        fromAgentId: "ceo",
        toAgentIds: ["coo"],
        title: "启动 B - 平台入驻",
        summary: "请 COO 完成平台账号准备。",
        status: "acknowledged",
        deliveryState: "acknowledged",
        resolution: "pending",
        updatedAt: 2_500,
        createdAt: 2_100,
      },
      {
        id: "req-hr",
        sessionKey: "agent:ceo:main",
        topicKey: "mission:alpha",
        fromAgentId: "ceo",
        toAgentIds: ["hr"],
        title: "启动 C - 团队搭建",
        summary: "请 HR 推进团队职责定义。",
        status: "blocked",
        deliveryState: "blocked",
        resolution: "partial",
        updatedAt: 2_800,
        createdAt: 2_200,
      },
    ],
    handoffs: [],
    participantAgentIds: ["cto", "coo", "hr"],
  };
}

function createSurface(overrides: Partial<PrimaryRequirementSurface> = {}): PrimaryRequirementSurface {
  return {
    aggregateId: "topic:mission:alpha",
    workItemId: "topic:mission:alpha",
    roomId: "room:topic:mission:alpha",
    title: "全自动AI小说创作系统",
    summary: "通过多人协作完成 AI 小说创作系统搭建。",
    ownerActorId: "ceo",
    ownerLabel: "CEO",
    currentStep: "三管齐下并行推进",
    nextBatonActorId: null,
    nextBatonLabel: "并行推进",
    lifecyclePhase: "active_requirement",
    stageGateStatus: "confirmed",
    updatedAt: 3_000,
    latestBlocker: null,
    latestReportSummary: "CTO 已经给出第一版技术方案。",
    roomStatus: "ready",
    openDecisionTicket: null,
    latestDecisionTicket: null,
    aggregate: null,
    workItem: null,
    room: null,
    requirementOverview: createOverview(),
    requirementScope: createScope(),
    roomMemberIds: ["ceo", "cto", "coo", "hr"],
    recentReports: [],
    ...overrides,
  };
}

function createWorkItem(): WorkItemRecord {
  return {
    id: "topic:mission:alpha",
    workKey: "topic:mission:alpha",
    kind: "strategic",
    roundId: "topic:mission:alpha",
    companyId: "company-1",
    sessionKey: "agent:ceo:main",
    topicKey: "mission:alpha",
    sourceActorId: "ceo",
    sourceActorLabel: "CEO",
    sourceSessionKey: "agent:ceo:main",
    sourceConversationId: "agent:ceo:main",
    providerId: null,
    title: "全自动AI小说创作系统",
    goal: "完成系统搭建",
    headline: "全自动AI小说创作系统",
    displayStage: "等待 CEO 归档",
    displaySummary: "三项执行已完成，等待最终收口。",
    displayOwnerLabel: "CEO",
    displayNextAction: "做最终归档",
    status: "waiting_owner",
    lifecyclePhase: "active_requirement",
    stageGateStatus: "confirmed",
    stageLabel: "等待 CEO 归档",
    ownerActorId: "ceo",
    ownerLabel: "CEO",
    batonActorId: "ceo",
    batonLabel: "CEO",
    roomId: "room:topic:mission:alpha",
    artifactIds: [],
    dispatchIds: [],
    startedAt: 1_000,
    updatedAt: 4_000,
    completedAt: null,
    summary: "三项执行已完成，等待最终收口。",
    nextAction: "做最终归档",
    steps: [
      {
        id: "step-1",
        title: "完成技术底座",
        assigneeActorId: "cto",
        assigneeLabel: "CTO",
        status: "done",
        detail: "技术底座已交付。",
        updatedAt: 3_500,
      },
      {
        id: "step-2",
        title: "完成平台入驻",
        assigneeActorId: "coo",
        assigneeLabel: "COO",
        status: "done",
        detail: "平台入驻已完成。",
        updatedAt: 3_600,
      },
    ],
  };
}

describe("buildRequirementCollaborationSurface", () => {
  it("builds a parallel execution overview from explicit requests", () => {
    const surface = buildRequirementCollaborationSurface({
      company: createCompany(),
      surface: createSurface(),
    });

    expect(surface).not.toBeNull();
    expect(surface?.collaborationLabel).toBe("多人并行");
    expect(surface?.activeParticipantsLabel).toContain("CTO");
    expect(surface?.activeParticipantsLabel).toContain("COO");
    expect(surface?.headerSummary.phaseLabel).toBe("三管齐下并行推进");
    expect(surface?.headerSummary.activeParticipantsLabel).toContain("CTO");
    expect(surface?.overviewSummary.goalSummary).toContain("AI 小说创作系统");
    expect(surface?.executionPlan.totalCount).toBe(3);
    expect(surface?.executionPlan.inProgressCount).toBe(2);
    expect(surface?.executionPlan.blockedCount).toBe(1);
    expect(surface?.executionPlan.tasks[0]?.title).toContain("启动");
  });

  it("marks the room closable when explicit work steps are all done", () => {
    const surface = buildRequirementCollaborationSurface({
      company: createCompany(),
      surface: createSurface({
        currentStep: "等待 CEO 最终归档",
        latestReportSummary: "全部执行子任务都已完成。",
        workItem: createWorkItem(),
        requirementScope: {
          ...createScope(),
          requests: [],
        },
        requirementOverview: {
          ...createOverview(),
          currentStage: "等待 CEO 最终归档",
          participants: [
            {
              ...createOverview().participants[0],
              statusLabel: "已确认",
              detail: "技术底座已完成。",
              isCurrent: false,
            },
            {
              ...createOverview().participants[1],
              statusLabel: "已确认",
              detail: "平台入驻已完成。",
              isCurrent: false,
            },
          ],
        },
      }),
    });

    expect(surface?.executionPlan.totalCount).toBe(2);
    expect(surface?.executionPlan.doneCount).toBe(2);
    expect(surface?.executionPlan.progressPct).toBe(100);
    expect(surface?.executionPlan.closable).toBe(true);
    expect(surface?.executionPlan.closureHint).toContain("等待 CEO 最终归档");
    expect(surface?.overviewSummary.closable).toBe(true);
    expect(surface?.overviewSummary.closureHint).toContain("等待 CEO 最终归档");
  });

  it("can recover legacy execution tasks from loaded room messages", () => {
    const surface = buildRequirementCollaborationSurface({
      company: createCompany(),
      surface: createSurface({
        requirementOverview: {
          ...createOverview(),
          participants: [],
        },
        requirementScope: {
          ...createScope(),
          requests: [],
        },
      }),
      roomMessages: [
        {
          text: "## 📊 三管齐下最新进展汇报\n【启动A】开始技术开发 CTO 🔄 进行中 40% 已创建 NovelCraft 系统核心代码\n【启动B】激活内容总监 HR ✅ 已完成 内容总监已成功激活\n【启动C】注册平台账号 COO 🔄 进行中 50% 已完成《平台账号注册指南》文档",
          timestamp: 4_000,
        },
      ],
    });

    expect(surface?.activeParticipantsLabel).toContain("CTO");
    expect(surface?.activeParticipantsLabel).toContain("HR");
    expect(surface?.executionPlan.totalCount).toBe(3);
    expect(surface?.executionPlan.doneCount).toBe(1);
    expect(surface?.executionPlan.inProgressCount).toBe(2);
  });

  it("recovers legacy execution tasks from markdown tables", () => {
    const surface = buildRequirementCollaborationSurface({
      company: createCompany(),
      surface: createSurface({
        requirementOverview: {
          ...createOverview(),
          participants: [],
        },
        requirementScope: {
          ...createScope(),
          requests: [],
        },
      }),
      roomMessages: [
        {
          text: `## 📊 三管齐下最新进展汇报

| 任务 | 负责人 | 状态 | 进展详情 |
|------|--------|------|----------|
| 【启动A】开始技术开发 | CTO | 🔄 进行中 40% | NovelCraft 系统核心代码开发中 |
| 【启动B】激活内容总监 | HR | ✅ 已完成 | 内容总监 agent 已成功创建并激活 |
| 【启动C】注册平台账号 | COO | 🔄 进行中 50% | 已完成《平台账号注册指南》文档 |`,
          timestamp: 4_500,
        },
      ],
    });

    expect(surface?.executionPlan.totalCount).toBe(3);
    expect(surface?.executionPlan.tasks[0]?.title).toContain("启动A");
    expect(surface?.executionPlan.tasks[1]?.status).toBe("已完成");
    expect(surface?.activeParticipantsLabel).toContain("COO");
  });

  it("prefers a rich legacy execution plan over low-signal synthesized step placeholders", () => {
    const surface = buildRequirementCollaborationSurface({
      company: createCompany(),
      surface: createSurface({
        workItem: {
          ...createWorkItem(),
          steps: [
            {
              id: "step-generic",
              title: "团队回执已到齐",
              assigneeActorId: "ceo",
              assigneeLabel: "CEO",
              status: "active",
              detail: "CEO 已经给出反馈。---",
              updatedAt: 4_200,
            },
          ],
        },
        requirementOverview: {
          ...createOverview(),
          participants: [],
        },
        requirementScope: {
          ...createScope(),
          requests: [],
        },
      }),
      roomMessages: [
        {
          text: `✅ **三管齐下并行推进已启动！**

| 任务 | 负责人 | 状态 | Dispatch ID |
|------|--------|------|-------------|
| 【启动A】开始技术开发 | CTO | ⏳ 已派发 | dispatch:a |
| 【启动B】激活内容总监 | HR | ⏳ 已派发 | dispatch:b |
| 【启动C】注册平台账号 | COO | ⏳ 已派发 | dispatch:c |`,
          timestamp: 4_300,
        },
      ],
    });

    expect(surface?.executionPlan.totalCount).toBe(3);
    expect(surface?.executionPlan.tasks.map((task) => task.title)).toEqual([
      "【启动A】开始技术开发",
      "【启动B】激活内容总监",
      "【启动C】注册平台账号",
    ]);
  });

  it("drops coarse owner dispatch rows when a structured A/B/C plan exists for the same owners", () => {
    const surface = buildRequirementCollaborationSurface({
      company: createCompany(),
      surface: createSurface({
        requirementOverview: {
          ...createOverview(),
          participants: [],
        },
        requirementScope: {
          ...createScope(),
          requests: [],
        },
      }),
      roomMessages: [
        {
          text: `✅ **已启动三管齐下并行推进！**

| 负责人 | 任务 | 状态 |
|--------|------|------|
| @HR | 组建内容创作事业部（6个岗位） | 🔄已派发 |
| @CTO | 小说创作系统技术架构 | 🔄已派发 |
| @COO | 运营机制与流程设计 | 🔄已派发 |`,
          timestamp: 4_100,
        },
        {
          text: `## 📊 三管齐下最新进展汇报

| 任务 | 负责人 | 状态 | 进展详情 |
|------|--------|------|----------|
| 【启动A】开始技术开发 | CTO | 🔄 进行中 40% | NovelCraft 系统核心代码开发中 |
| 【启动B】激活内容总监 | HR | ✅ 已完成 | 内容总监 agent 已成功创建并激活 |
| 【启动C】注册平台账号 | COO | 🔄 进行中 50% | 已完成《平台账号注册指南》文档 |`,
          timestamp: 4_500,
        },
      ],
    });

    expect(surface?.executionPlan.totalCount).toBe(3);
    expect(surface?.executionPlan.tasks.every((task) => /^【启动/.test(task.title))).toBe(true);
  });
});
