import { describe, expect, it } from "vitest";
import type { WorkItemRecord } from "../company/types";
import type { RequirementExecutionOverview } from "./requirement-overview";
import {
  isReliableRequirementOverview,
  isReliableWorkItemRecord,
  shouldPreferReliableStrategicOverview,
  shouldReplaceLockedStrategicWorkItem,
} from "./work-item-signal";
import { applyWorkItemDisplayFields } from "./work-item";

function createStrategicOverview(
  overrides: Partial<RequirementExecutionOverview> = {},
): RequirementExecutionOverview {
  return {
    topicKey: "mission:consistency-platform",
    title: "一致性底座与内部审阅系统执行方案",
    headline: "当前卡点在 CEO",
    summary: "CTO、COO 已回传，等待 CEO 整合最终方案。",
    currentOwnerAgentId: "co-ceo",
    currentOwnerLabel: "CEO",
    currentStage: "CEO 整合团队方案并交付老板",
    nextAction: "让 CEO 输出最终执行方案和优先级。",
    startedAt: 1_000,
    participants: [],
    ...overrides,
  };
}

function createWorkItem(
  overrides: Partial<WorkItemRecord> = {},
): WorkItemRecord {
  return applyWorkItemDisplayFields({
    id: "topic:mission:consistency-platform",
    workKey: "topic:mission:consistency-platform",
    kind: "strategic",
    roundId: "topic:mission:consistency-platform@1000",
    companyId: "novel-studio-001",
    sessionKey: "agent:co-ceo:main",
    topicKey: "mission:consistency-platform",
    sourceActorId: "co-ceo",
    sourceActorLabel: "CEO",
    sourceSessionKey: "agent:co-ceo:main",
    sourceConversationId: "agent:co-ceo:main",
    providerId: null,
    title: "一致性底座与内部审阅系统执行方案",
    goal: "围绕一致性校验和内部审阅系统给出正式执行方案。",
    status: "active",
    stageLabel: "CEO 整合团队方案并交付老板",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    batonActorId: "co-ceo",
    batonLabel: "CEO",
    roomId: "workitem:topic:mission:consistency-platform",
    artifactIds: [],
    dispatchIds: [],
    startedAt: 1_000,
    updatedAt: 2_000,
    completedAt: null,
    summary: "CTO、COO 已回传，等待 CEO 收口。",
    nextAction: "让 CEO 输出最终执行方案和优先级。",
    steps: [],
    ...overrides,
  });
}

describe("work-item signal guards", () => {
  it("rejects chapter overviews whose content is clearly strategic", () => {
    const overview = createStrategicOverview({
      topicKey: "chapter:2",
      title: "重新完成第 2 章",
      currentOwnerAgentId: "co-coo",
      currentOwnerLabel: "COO",
      currentStage: "CEO 立即执行 · 流程治理缺口盘点",
      summary: "两份治理件已交付并入库，等待继续治理收口。",
      nextAction: "优先打开 COO 会话，把这一步补齐。",
    });

    expect(isReliableRequirementOverview(overview)).toBe(false);
  });

  it("rejects chapter work items whose stage and next action are strategic governance work", () => {
    const workItem = createWorkItem({
      topicKey: "chapter:2",
      title: "重新完成第 2 章",
      stageLabel: "CEO 立即执行 · 流程治理缺口盘点",
      ownerActorId: "co-coo",
      ownerLabel: "COO",
      batonActorId: "co-coo",
      batonLabel: "COO",
      summary: "两份治理件已交付并入库，等待继续治理收口。",
      nextAction: "优先打开 COO 会话，把这一步补齐。",
    });

    expect(isReliableWorkItemRecord(workItem)).toBe(false);
  });

  it("releases a locked strategic work item when a newer strategic overview points to a different mission", () => {
    const lockedWorkItem = createWorkItem({
      topicKey: "mission:consistency-platform",
      title: "一致性底座与内部审阅系统执行方案",
    });
    const overview = createStrategicOverview({
      topicKey: "mission:novel-team-bootstrap",
      title: "从头开始搭建 AI 小说创作团队",
      summary: "HR、CTO、COO 正在围绕团队搭建和流程治理回传结果。",
      currentStage: "CEO 汇总团队搭建方案",
      nextAction: "让 CEO 收口组织方案并确认下一步。",
    });

    expect(
      shouldReplaceLockedStrategicWorkItem({
        lockedWorkItem,
        latestHintText: "从头开始搭建 AI 小说创作团队",
        latestHintTopicKey: null,
        overview,
      }),
    ).toBe(true);
  });

  it("prefers a reliable strategic overview over a stale execution work item", () => {
    const staleExecutionWorkItem = createWorkItem({
      id: "topic:chapter:2",
      workKey: "topic:chapter:2",
      kind: "execution",
      roundId: "topic:chapter:2@1000",
      topicKey: "chapter:2",
      title: "重新完成第 2 章",
      stageLabel: "团队回执已到齐",
      summary: "等待 CEO 收口。",
      nextAction: "让 CEO 收口并决定下一步。",
    });
    const overview = createStrategicOverview({
      topicKey: "mission:novel-team-bootstrap",
      title: "从头开始搭建 AI 小说创作团队",
      summary: "HR、CTO、主编正在围绕团队搭建和质量底座回传结果。",
      currentStage: "CEO 汇总团队搭建方案",
      nextAction: "让 CEO 收口组织方案并确认下一步。",
    });

    expect(
      shouldPreferReliableStrategicOverview({
        stableWorkItem: staleExecutionWorkItem,
        latestHintText: "从头开始搭建 AI 小说创作团队",
        latestHintTopicKey: null,
        overview,
      }),
    ).toBe(true);
  });
});
