import { describe, expect, it } from "vitest";
import type { ConversationMissionRecord, RequirementRoomRecord } from "../company/types";
import type { RequirementExecutionOverview } from "./requirement-overview";
import {
  buildRoomRecordIdFromWorkItem,
  buildRoundRecord,
  buildWorkItemRecordFromRequirementOverview,
  buildWorkItemRecordFromMission,
  pickWorkItemRecord,
} from "./work-item";

function createMission(overrides: Partial<ConversationMissionRecord> = {}): ConversationMissionRecord {
  return {
    id: "mission:rewrite-ch02",
    sessionKey: "agent:co-ceo:main",
    topicKey: "chapter:02-rewrite",
    startedAt: 1_000,
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
    expect(workItem.ownerActorId).toBe("co-emp-1");
    expect(workItem.batonActorId).toBe("co-emp-1");
    expect(workItem.steps).toHaveLength(2);
    expect(workItem.steps[0]).toMatchObject({
      title: "写手重写正文",
      assigneeActorId: "co-emp-1",
      status: "active",
    });
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

  it("builds a work item directly from a requirement overview", () => {
    const workItem = buildWorkItemRecordFromRequirementOverview({
      companyId: "company-1",
      overview: createRequirementOverview(),
      roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform@5000"),
      ownerSessionKey: "agent:co-ceo:main",
    });

    expect(workItem).toMatchObject({
      companyId: "company-1",
      topicKey: "mission:consistency-platform",
      title: "一致性底座与内部审阅系统执行方案",
      ownerActorId: "co-ceo",
      batonActorId: "co-ceo",
      status: "waiting_owner",
      roomId: buildRoomRecordIdFromWorkItem("topic:mission:consistency-platform@5000"),
      nextAction: "让 CEO 输出最终执行方案和优先级。",
    });
    expect(workItem.steps).toHaveLength(3);
    expect(workItem.steps[2]).toMatchObject({
      assigneeActorId: "co-ceo",
      status: "active",
    });
  });
});
