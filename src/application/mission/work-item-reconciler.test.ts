import { describe, expect, it } from "vitest";
import type {
  ArtifactRecord,
  ConversationMissionRecord,
  DispatchRecord,
  RequirementRoomRecord,
  WorkItemRecord,
} from "../../domain";
import type { RequirementExecutionOverview } from "./requirement-overview";
import { applyWorkItemDisplayFields, buildRoomRecordIdFromWorkItem } from "./work-item";
import { reconcileWorkItemRecord } from "./work-item-reconciler";

function createMission(overrides: Partial<ConversationMissionRecord> = {}): ConversationMissionRecord {
  return {
    id: "mission:consistency-platform",
    sessionKey: "agent:co-ceo:main",
    topicKey: "mission:consistency-platform",
    startedAt: 1_000,
    title: "一致性底座与内部审阅系统执行方案",
    statusLabel: "待 CEO 收口",
    progressLabel: "2/3",
    ownerAgentId: "co-ceo",
    ownerLabel: "CEO",
    currentStepLabel: "整合团队方案并交付老板",
    nextAgentId: "co-ceo",
    nextLabel: "CEO 收口",
    summary: "CTO 与 COO 已回传方案，等待 CEO 汇总。",
    guidance: "输出最终执行方案和优先级。",
    completed: false,
    updatedAt: 2_000,
    planSteps: [
      {
        id: "step-cto",
        title: "CTO 输出技术方案",
        assigneeLabel: "CTO",
        assigneeAgentId: "co-cto",
        status: "done",
        statusLabel: "已完成",
        detail: "技术方案已交付",
        isCurrent: false,
        isNext: false,
      },
      {
        id: "step-ceo",
        title: "CEO 汇总输出",
        assigneeLabel: "CEO",
        assigneeAgentId: "co-ceo",
        status: "wip",
        statusLabel: "进行中",
        detail: "待输出老板版方案",
        isCurrent: true,
        isNext: false,
      },
    ],
    ...overrides,
  };
}

function createOverview(overrides: Partial<RequirementExecutionOverview> = {}): RequirementExecutionOverview {
  return {
    title: "一致性底座与内部审阅系统执行方案",
    topicKey: "mission:consistency-platform",
    headline: "当前卡点在 CEO",
    summary: "CTO 与 COO 已回传，等待 CEO 整合。",
    currentOwnerAgentId: "co-ceo",
    currentOwnerLabel: "CEO",
    currentStage: "整合团队方案并交付老板",
    nextAction: "让 CEO 输出最终执行方案和优先级。",
    startedAt: 1_000,
    participants: [],
    ...overrides,
  };
}

function createRoom(overrides: Partial<RequirementRoomRecord> = {}): RequirementRoomRecord {
  return {
    id: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
    companyId: "company-1",
    workItemId: "topic:mission:consistency-platform",
    sessionKey: "agent:co-ceo:group:mission-consistency-abc123",
    title: "一致性底座与内部审阅系统执行方案",
    ownerActorId: "co-ceo",
    ownerAgentId: "co-ceo",
    memberIds: ["co-ceo", "co-cto", "co-coo"],
    memberActorIds: ["co-ceo", "co-cto", "co-coo"],
    status: "active",
    transcript: [],
    createdAt: 1_000,
    updatedAt: 2_100,
    ...overrides,
  };
}

function createArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "workspace:company-1:co-cto:docs/consistency-plan.md",
    workItemId: "topic:mission:consistency-platform",
    title: "consistency-plan.md",
    kind: "tooling",
    status: "ready",
    ownerActorId: "co-cto",
    sourceActorId: "co-cto",
    sourceName: "consistency-plan.md",
    sourcePath: "docs/consistency-plan.md",
    summary: "CTO · 一致性技术实现方案",
    createdAt: 2_050,
    updatedAt: 2_050,
    ...overrides,
  };
}

function createDispatch(overrides: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    id: "dispatch:mission:consistency-platform:1",
    workItemId: "topic:mission:consistency-platform",
    roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
    title: "让 CTO 输出一致性技术方案",
    summary: "请 CTO 输出约束驱动一致性的技术方案。",
    fromActorId: "co-ceo",
    targetActorIds: ["co-cto"],
    status: "sent",
    topicKey: "mission:consistency-platform",
    createdAt: 2_100,
    updatedAt: 2_100,
    ...overrides,
  };
}

describe("reconcileWorkItemRecord", () => {
  it("prefers mission/overview truth and links matching artifacts", () => {
    const reconciled = reconcileWorkItemRecord({
      companyId: "company-1",
      mission: createMission(),
      overview: createOverview(),
      room: createRoom(),
      artifacts: [createArtifact()],
      fallbackSessionKey: "agent:co-ceo:main",
    });

    expect(reconciled).toMatchObject({
      id: "topic:mission:consistency-platform",
      workKey: "topic:mission:consistency-platform",
      kind: "strategic",
      roundId: "topic:mission:consistency-platform@1000",
      sourceActorId: "co-ceo",
      sourceConversationId: "agent:co-ceo:main",
      ownerActorId: "co-ceo",
      batonActorId: "co-ceo",
      roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
      stageLabel: "整合团队方案并交付老板",
      nextAction: "输出最终执行方案和优先级。",
    });
    expect(reconciled?.artifactIds).toContain("workspace:company-1:co-cto:docs/consistency-plan.md");
  });

  it("keeps newer existing work item timestamps while backfilling linked artifacts", () => {
    const existing: WorkItemRecord = applyWorkItemDisplayFields({
      id: "topic:mission:consistency-platform",
      workKey: "topic:mission:consistency-platform",
      kind: "strategic",
      roundId: "topic:mission:consistency-platform@1000",
      companyId: "company-1",
      sessionKey: "agent:co-ceo:main",
      topicKey: "mission:consistency-platform",
      title: "一致性底座与内部审阅系统执行方案",
      goal: "先搭一致性底座，再做阅读审阅系统。",
      status: "waiting_owner",
      stageLabel: "整合团队方案并交付老板",
      ownerActorId: "co-ceo",
      ownerLabel: "CEO",
      batonActorId: "co-ceo",
      batonLabel: "CEO",
      roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
      sourceActorId: "co-ceo",
      sourceConversationId: "agent:co-ceo:main",
      artifactIds: [],
      dispatchIds: [],
      startedAt: 1_000,
      updatedAt: 5_000,
      summary: "等待 CEO 收口。",
      nextAction: "让 CEO 输出最终执行方案。",
      steps: [],
    });

    const reconciled = reconcileWorkItemRecord({
      companyId: "company-1",
      existingWorkItem: existing,
      room: createRoom({ updatedAt: 4_000 }),
      artifacts: [createArtifact()],
    });

    expect(reconciled?.updatedAt).toBe(5_000);
    expect(reconciled?.artifactIds).toContain("workspace:company-1:co-cto:docs/consistency-plan.md");
  });

  it("uses dispatch truth to point baton at the current assignee", () => {
    const reconciled = reconcileWorkItemRecord({
      companyId: "company-1",
      existingWorkItem: applyWorkItemDisplayFields({
        id: "topic:mission:consistency-platform",
        workKey: "topic:mission:consistency-platform",
        kind: "strategic",
        roundId: "topic:mission:consistency-platform@1000",
        companyId: "company-1",
        title: "一致性底座与内部审阅系统执行方案",
        goal: "先搭一致性底座，再做阅读审阅系统。",
        status: "active",
        stageLabel: "等待 CTO 输出方案",
        ownerActorId: "co-ceo",
        ownerLabel: "CEO",
        batonActorId: "co-ceo",
        batonLabel: "CEO",
        roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
        artifactIds: [],
        dispatchIds: [],
        startedAt: 1_000,
        updatedAt: 2_000,
        summary: "等待团队开始推进。",
        nextAction: "让 CTO 接住当前任务。",
        steps: [],
      }),
      dispatches: [createDispatch()],
    });

    expect(reconciled).toMatchObject({
      status: "active",
      batonActorId: "co-cto",
      batonLabel: "co-cto",
      nextAction: "请 CTO 输出约束驱动一致性的技术方案。",
    });
    expect(reconciled?.summary).toContain("co-cto");
    expect(reconciled?.dispatchIds).toContain("dispatch:mission:consistency-platform:1");
  });

  it("returns baton to owner after a member reply arrives", () => {
    const reconciled = reconcileWorkItemRecord({
      companyId: "company-1",
      mission: createMission(),
      dispatches: [
        createDispatch({
          status: "answered",
          responseMessageId: "reply:1",
          updatedAt: 2_300,
        }),
      ],
    });

    expect(reconciled).toMatchObject({
      status: "waiting_owner",
      batonActorId: "co-ceo",
      batonLabel: "CEO",
      nextAction: "负责人收口并决定下一步。",
    });
    expect(reconciled?.summary).toContain("等待负责人收口");
  });

  it("lets a room conclusion override stale open dispatch state", () => {
    const existing = applyWorkItemDisplayFields({
      id: "topic:mission:consistency-platform",
      workKey: "topic:mission:consistency-platform",
      kind: "strategic",
      roundId: "topic:mission:consistency-platform@1000",
      companyId: "company-1",
      sessionKey: "agent:co-ceo:main",
      topicKey: "mission:consistency-platform",
      title: "一致性底座与内部审阅系统执行方案",
      goal: "让 CTO 和 COO 回传方案，再由 CEO 收口。",
      status: "active",
      stageLabel: "等待 CTO、COO 回传",
      ownerActorId: "co-ceo",
      ownerLabel: "CEO",
      batonActorId: "co-cto",
      batonLabel: "CTO",
      roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
      artifactIds: [],
      dispatchIds: [],
      startedAt: 1_000,
      updatedAt: 2_000,
      summary: "等待 CTO、COO 回传。",
      nextAction: "@CEO HR反馈的工作完成了吗",
      steps: [],
    });

    const reconciled = reconcileWorkItemRecord({
      companyId: "company-1",
      existingWorkItem: existing,
      room: createRoom({
        lastConclusionAt: 2_600,
        progress: "2 条结论回传",
      }),
      dispatches: [
        createDispatch({
          status: "acknowledged",
          updatedAt: 2_300,
        }),
      ],
    });

    expect(reconciled).toMatchObject({
      status: "waiting_owner",
      stageLabel: "团队回执已到齐",
      batonActorId: "co-ceo",
      batonLabel: "CEO",
      nextAction: "CEO 收口并决定下一步。",
    });
    expect(reconciled?.summary).toContain("2 条结论回传");
  });

  it("reconciles a strategic work item onto a stable title-backed identity when later overviews drift", () => {
    const existing = applyWorkItemDisplayFields({
      id: "topic:mission:consistency-platform",
      workKey: "topic:mission:consistency-platform",
      kind: "strategic",
      roundId: "topic:mission:consistency-platform@1000",
      companyId: "company-1",
      sessionKey: "agent:co-ceo:main",
      topicKey: "mission:consistency-platform",
      title: "开发一致性底座与内部审阅系统",
      goal: "先搭一致性底座，再做内部审阅系统。",
      status: "active",
      stageLabel: "等待 CTO、COO 回传",
      ownerActorId: "co-ceo",
      ownerLabel: "CEO",
      batonActorId: "co-ceo",
      batonLabel: "CEO",
      roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
      artifactIds: [],
      dispatchIds: [],
      startedAt: 1_000,
      updatedAt: 2_000,
      summary: "CTO 与 COO 正在推进。",
      nextAction: "等待 CTO、COO 回传。",
      steps: [],
    });

    const reconciled = reconcileWorkItemRecord({
      companyId: "company-1",
      existingWorkItem: existing,
      overview: createOverview({
        topicKey: "mission:4p27it",
        title: "一致性底座与内部审阅系统执行方案",
        headline: "当前卡点在 CEO",
        summary: "CTO 与 COO 已回传，等待 CEO 整合。",
        currentStage: "整合团队方案并交付老板",
        nextAction: "让 CEO 输出最终执行方案和优先级。",
        startedAt: 5_000,
      }),
      room: createRoom({
        workItemId: "topic:mission:consistency-platform",
        id: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
      }),
    });

    expect(reconciled).toMatchObject({
      id: "topic:mission:1d4ique",
      workKey: "topic:mission:1d4ique",
      topicKey: "mission:1d4ique",
      roundId: "topic:mission:1d4ique@5000",
      title: "一致性底座与内部审阅系统执行方案",
      displayStage: "整合团队方案并交付老板",
      displayNextAction: "让 CEO 输出最终执行方案和优先级。",
      roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform"),
    });
  });

  it("replaces an unrelated legacy execution work item when the current overview is a new strategic mainline", () => {
    const existing = applyWorkItemDisplayFields({
      id: "mission:rewrite-ch02",
      workKey: "topic:chapter:02-rewrite",
      kind: "execution",
      roundId: "topic:chapter:02-rewrite@1000",
      companyId: "company-1",
      sessionKey: "agent:co-ceo:main",
      topicKey: "chapter:02-rewrite",
      title: "重新完成第 2 章",
      goal: "完成第 2 章纯正文。",
      status: "active",
      stageLabel: "等待写手交稿",
      ownerActorId: "co-emp-1",
      ownerLabel: "写手",
      batonActorId: "co-emp-1",
      batonLabel: "写手",
      roomId: buildRoomRecordIdFromWorkItem("mission:rewrite-ch02"),
      artifactIds: ["artifact:chapter-2"],
      dispatchIds: ["dispatch:chapter-2"],
      startedAt: 1_000,
      updatedAt: 2_000,
      summary: "继续完成第 2 章。",
      nextAction: "等待写手交稿。",
      steps: [],
    });

    const reconciled = reconcileWorkItemRecord({
      companyId: "company-1",
      existingWorkItem: existing,
      overview: createOverview({
        topicKey: "mission:netnovel-team",
        title: "从头开始搭建 AI 小说创作团队",
        headline: "当前卡点在 CEO",
        summary: "团队基础岗位、工具能力和流程标准需要重新搭建。",
        currentStage: "CEO 收口组织搭建方案",
        nextAction: "CEO 确认组织方案并分派 HR / CTO / 主编。",
        startedAt: 6_000,
      }),
      room: createRoom({
        id: buildRoomRecordIdFromWorkItem("topic:mission:netnovel-team"),
        workItemId: "topic:mission:netnovel-team",
        title: "从头开始搭建 AI 小说创作团队",
      }),
    });

    expect(reconciled).toMatchObject({
      id: "topic:mission:netnovel-team",
      workKey: "topic:mission:netnovel-team",
      topicKey: "mission:netnovel-team",
      title: "从头开始搭建 AI 小说创作团队",
      displayStage: "CEO 收口组织搭建方案",
      displayNextAction: "CEO 确认组织方案并分派 HR / CTO / 主编。",
      roomId: buildRoomRecordIdFromWorkItem("topic:mission:netnovel-team"),
      artifactIds: [],
      dispatchIds: [],
    });
  });
});
