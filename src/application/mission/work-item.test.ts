import { describe, expect, it } from "vitest";
import type { ConversationMissionRecord, RequirementRoomRecord } from "../../domain";
import type { RequirementExecutionOverview } from "./requirement-overview";
import {
  applyWorkItemDisplayFields,
  buildRoomRecordIdFromWorkItem,
  buildRoundRecord,
  buildWorkItemRecordFromRequirementOverview,
  buildWorkItemRecordFromMission,
  deriveWorkItemFlowFromDispatches,
  pickWorkItemRecord,
  resolveStableWorkItemTitle,
} from "./work-item";

function createMission(overrides: Partial<ConversationMissionRecord> = {}): ConversationMissionRecord {
  return {
    id: "mission:rewrite-ch02",
    sessionKey: "agent:co-ceo:main",
    topicKey: "chapter:02-rewrite",
    startedAt: 1_000,
    lifecyclePhase: "active_requirement",
    stageGateStatus: "confirmed",
    title: "重新完成第 2 章",
    statusLabel: "执行中",
    progressLabel: "1/3",
    ownerAgentId: "co-emp-1",
    ownerLabel: "写手",
    currentStepLabel: "写手重写正文",
    nextAgentId: "co-emp-1",
    nextLabel: "等待写手交付 ch02_clean.md",
    summary: "完成更稳定的第 2 章正文。",
    guidance: "交付新版正文后进入审校。",
    completed: false,
    updatedAt: 2_000,
    planSteps: [
      {
        id: "step-write",
        title: "写手重写正文",
        assigneeLabel: "写手",
        assigneeAgentId: "co-emp-1",
        status: "wip",
        statusLabel: "进行中",
        detail: "交付 ch02_clean.md",
        isCurrent: true,
        isNext: false,
      },
      {
        id: "step-review",
        title: "审校复核",
        assigneeLabel: "审校",
        assigneeAgentId: "co-emp-2",
        status: "pending",
        statusLabel: "待处理",
        detail: "检查一致性和节奏",
        isCurrent: false,
        isNext: true,
      },
    ],
    ...overrides,
  };
}

function createRoom(overrides: Partial<RequirementRoomRecord> = {}): RequirementRoomRecord {
  return {
    id: buildRoomRecordIdFromWorkItem("mission:rewrite-ch02"),
    sessionKey: "agent:co-ceo:group:rewrite-ch02-abc123",
    title: "重新完成第 2 章",
    companyId: "company-1",
    workItemId: "mission:rewrite-ch02",
    ownerActorId: "co-ceo",
    ownerAgentId: "co-ceo",
    memberIds: ["co-ceo", "co-emp-1", "co-emp-2"],
    memberActorIds: ["co-ceo", "co-emp-1", "co-emp-2"],
    status: "active",
    transcript: [],
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

function createRequirementOverview(
  overrides: Partial<RequirementExecutionOverview> = {},
): RequirementExecutionOverview {
  return {
    title: "一致性底座与内部审阅系统执行方案",
    topicKey: "mission:consistency-platform",
    headline: "当前卡点在 CEO",
    summary: "CTO 与 COO 已回传，等待 CEO 整合方案并交付老板。",
    currentOwnerAgentId: "co-ceo",
    currentOwnerLabel: "CEO",
    currentStage: "整合团队方案并交付老板",
    nextAction: "让 CEO 输出最终执行方案和优先级。",
    startedAt: 5_000,
    participants: [
      {
        agentId: "co-cto",
        nickname: "CTO",
        role: "Chief Technology Officer",
        stage: "输出一致性技术方案",
        statusLabel: "已交付待下游",
        detail: "技术方案已回传，等待 CEO 收口。",
        updatedAt: 5_100,
        tone: "blue",
        isCurrent: false,
        isBlocking: false,
      },
      {
        agentId: "co-coo",
        nickname: "COO",
        role: "Chief Operating Officer",
        stage: "输出阅读系统业务建议",
        statusLabel: "已交付待下游",
        detail: "产品建议已回传，等待 CEO 收口。",
        updatedAt: 5_200,
        tone: "emerald",
        isCurrent: false,
        isBlocking: false,
      },
      {
        agentId: "co-ceo",
        nickname: "CEO",
        role: "Chief Executive Officer",
        stage: "整合团队方案并交付老板",
        statusLabel: "已开工",
        detail: "等待 CEO 汇总输出。",
        updatedAt: 5_300,
        tone: "violet",
        isCurrent: true,
        isBlocking: false,
      },
    ],
    ...overrides,
  };
}

describe("work-item helpers", () => {
  it("builds a work item from a mission record", () => {
    const workItem = buildWorkItemRecordFromMission({
      companyId: "company-1",
      mission: createMission(),
      room: createRoom(),
    });

    expect(workItem.id).toBe("mission:rewrite-ch02");
    expect(workItem.roomId).toBe(buildRoomRecordIdFromWorkItem("mission:rewrite-ch02"));
    expect(workItem.workKey).toBe("topic:chapter:02-rewrite");
    expect(workItem.kind).toBe("execution");
    expect(workItem.sourceActorId).toBe("co-ceo");
    expect(workItem.sourceConversationId).toBe("agent:co-ceo:main");
    expect(workItem.ownerActorId).toBe("co-emp-1");
    expect(workItem.batonActorId).toBe("co-emp-1");
    expect(workItem.steps).toHaveLength(2);
    expect(workItem.steps[0]).toMatchObject({
      title: "写手重写正文",
      assigneeActorId: "co-emp-1",
      status: "active",
    });
  });

  it("builds stable mission step timestamps for the same mission snapshot", () => {
    const mission = createMission();

    const first = buildWorkItemRecordFromMission({
      companyId: "company-1",
      mission,
    });
    const second = buildWorkItemRecordFromMission({
      companyId: "company-1",
      mission,
    });

    expect(second.steps).toEqual(first.steps);
    expect(second.steps.map((step) => step.updatedAt)).toEqual([mission.updatedAt, mission.updatedAt]);
  });

  it("prefers topic and start time when picking the active work item", () => {
    const older = buildWorkItemRecordFromMission({
      companyId: "company-1",
      mission: createMission({
        id: "mission:chapter-01",
        topicKey: "chapter:01",
        startedAt: 100,
        updatedAt: 500,
      }),
    });
    const current = buildWorkItemRecordFromMission({
      companyId: "company-1",
      mission: createMission({
        id: "mission:chapter-02",
        topicKey: "chapter:02-rewrite",
        startedAt: 1_000,
        updatedAt: 2_000,
      }),
    });

    const selected = pickWorkItemRecord({
      items: [older, current],
      sessionKey: "agent:co-ceo:main",
      topicKey: "chapter:02-rewrite",
      startedAt: 1_000,
    });

    expect(selected?.id).toBe("mission:chapter-02");
  });

  it("builds a round record for product-owned round archives", () => {
    const round = buildRoundRecord({
      companyId: "company-1",
      workItemId: "mission:rewrite-ch02",
      roomId: buildRoomRecordIdFromWorkItem("mission:rewrite-ch02"),
      title: "重新完成第 2 章",
      sourceActorId: "co-ceo",
      sourceActorLabel: "CEO",
      sourceSessionKey: "agent:co-ceo:main",
      archivedAt: 9_999,
    });

    expect(round).toMatchObject({
      companyId: "company-1",
      workItemId: "mission:rewrite-ch02",
      roomId: buildRoomRecordIdFromWorkItem("mission:rewrite-ch02"),
      sourceActorId: "co-ceo",
      sourceActorLabel: "CEO",
      sourceSessionKey: "agent:co-ceo:main",
      sourceConversationId: "agent:co-ceo:main",
      restorable: true,
    });
  });

  it("sanitizes round titles and previews when building product archives", () => {
    const round = buildRoundRecord({
      companyId: "company-1",
      title: "[Sun 2026-03-08] 一致性方案讨论",
      preview: "**Reviewing SOUL.md** 我是赛博公司 CEO，负责拆解、派单、验收、汇报。",
    });

    expect(round.title).toBe("一致性方案讨论");
    expect(round.preview).toBe("我是赛博公司 CEO，负责拆解、派单、验收、汇报。");
  });

  it("builds a work item directly from a requirement overview", () => {
    const workItem = buildWorkItemRecordFromRequirementOverview({
      companyId: "company-1",
      overview: createRequirementOverview(),
      roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
      ownerSessionKey: "agent:co-ceo:main",
    });

    expect(workItem).toMatchObject({
      companyId: "company-1",
      topicKey: "mission:consistency-platform",
      title: "一致性底座与内部审阅系统执行方案",
      sourceActorId: "co-ceo",
      sourceConversationId: "agent:co-ceo:main",
      ownerActorId: "co-ceo",
      batonActorId: "co-ceo",
      status: "waiting_owner",
      roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
      nextAction: "让 CEO 输出最终执行方案和优先级。",
    });
    expect(workItem.workKey).toBe("topic:mission:consistency-platform");
    expect(workItem.kind).toBe("strategic");
    expect(workItem.roundId).toBe("topic:mission:consistency-platform@5000");
    expect(workItem.steps).toHaveLength(3);
    expect(workItem.steps[2]).toMatchObject({
      assigneeActorId: "co-ceo",
      status: "active",
    });
  });

  it("canonicalizes strategic mission records into topic-backed work item ids", () => {
    const workItem = buildWorkItemRecordFromMission({
      companyId: "company-1",
      mission: createMission({
        id: "session:agent:co-ceo:main@1",
        topicKey: "mission:consistency-platform",
        startedAt: 5_000,
        title: "一致性底座与内部审阅系统执行方案",
      }),
    });

    expect(workItem.id).toBe("topic:mission:consistency-platform");
    expect(workItem.workKey).toBe("topic:mission:consistency-platform");
    expect(workItem.roundId).toBe("topic:mission:consistency-platform@5000");
    expect(workItem.sourceConversationId).toBe("agent:co-ceo:main");
  });

  it("prefers a newer answered dispatch over older open dispatches", () => {
    const workItem = buildWorkItemRecordFromRequirementOverview({
      companyId: "company-1",
      overview: createRequirementOverview(),
      ownerSessionKey: "agent:co-ceo:main",
    });

    const flow = deriveWorkItemFlowFromDispatches(workItem, [
      {
        id: "dispatch-open",
        workItemId: workItem.id,
        title: "请 CTO 输出方案",
        summary: "CTO 正在处理当前派单。",
        targetActorIds: ["co-cto"],
        status: "pending",
        updatedAt: 5_100,
      } as never,
      {
        id: "dispatch-answered",
        workItemId: workItem.id,
        title: "CTO 已回传方案",
        summary: "CTO 已交付结果",
        targetActorIds: ["co-cto"],
        status: "answered",
        updatedAt: 5_300,
      } as never,
    ]);

    expect(flow).toMatchObject({
      status: "waiting_owner",
      batonActorId: "co-ceo",
      batonLabel: "CEO",
      nextAction: "负责人收口并决定下一步。",
      summary: "co-cto 已回传结果，等待负责人收口。",
    });
  });

  it("keeps a strategic work item title stable while only display fields change across rounds", () => {
    const base = buildWorkItemRecordFromRequirementOverview({
      companyId: "company-1",
      overview: createRequirementOverview(),
      ownerSessionKey: "agent:co-ceo:main",
    });

    const updated = applyWorkItemDisplayFields({
      ...base,
      stageLabel: "等待 CTO / COO 回传",
      summary: "CTO 和 COO 已回传，等待 CEO 汇总输出。",
      nextAction: "让 CEO 输出最终执行方案和优先级。",
      updatedAt: base.updatedAt + 500,
    });

    expect(updated.title).toBe("一致性底座与内部审阅系统执行方案");
    expect(updated.headline).toBe("一致性底座与内部审阅系统执行方案");
    expect(updated.displayStage).toBe("等待 CTO / COO 回传");
    expect(updated.displayNextAction).toBe("让 CEO 输出最终执行方案和优先级。");
  });

  it("normalizes drifted strategic mission topic keys into one stable title-backed identity", () => {
    const fromFirstOverview = buildWorkItemRecordFromRequirementOverview({
      companyId: "company-1",
      overview: createRequirementOverview({
        topicKey: "mission:4p27it",
        title: "开发一致性底座与内部审阅系统",
      }),
      ownerSessionKey: "agent:co-ceo:main",
    });
    const fromSecondOverview = buildWorkItemRecordFromRequirementOverview({
      companyId: "company-1",
      overview: createRequirementOverview({
        topicKey: "mission:1ip8yl0",
        title: "开发一致性底座与内部审阅系统",
      }),
      ownerSessionKey: "agent:co-ceo:main",
    });

    expect(fromFirstOverview.title).toBe("开发一致性底座与内部审阅系统");
    expect(fromFirstOverview.topicKey).toBe(fromSecondOverview.topicKey);
    expect(fromFirstOverview.id).toBe(fromSecondOverview.id);
    expect(fromFirstOverview.workKey).toBe(fromSecondOverview.workKey);
    expect(fromFirstOverview.topicKey).toMatch(/^mission:/);
    expect(fromFirstOverview.topicKey).not.toBe("mission:4p27it");
    expect(fromFirstOverview.topicKey).not.toBe("mission:1ip8yl0");
  });

  it("allows a stronger strategic bootstrap title to replace an older strategic title", () => {
    expect(
      resolveStableWorkItemTitle({
        existingTitle: "一致性底座与内部审阅系统执行方案",
        candidateTitle: "从头开始搭建 AI 小说创作团队",
        kind: "strategic",
      }),
    ).toBe("从头开始搭建 AI 小说创作团队");
  });

  it("replaces an old chapter execution title when the current mainline is strategic", () => {
    expect(
      resolveStableWorkItemTitle({
        existingTitle: "重新完成第 2 章",
        candidateTitle: "从头开始搭建 AI 小说创作团队",
        kind: "strategic",
      }),
    ).toBe("从头开始搭建 AI 小说创作团队");
  });
});
