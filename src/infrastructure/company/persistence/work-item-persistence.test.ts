import { describe, expect, it } from "vitest";
import type { WorkItemRecord } from "./types";
import { sanitizeWorkItemRecords } from "./work-item-persistence";
import { applyWorkItemDisplayFields } from "../../../application/mission/work-item";

function createWorkItem(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return applyWorkItemDisplayFields({
    id: "workitem:mission:consistency",
    workKey: "topic:mission:consistency-platform",
    kind: "strategic",
    roundId: "topic:mission:consistency-platform@1000",
    companyId: "novel-studio-001",
    topicKey: "mission:consistency-platform",
    title: "一致性底座与内部审阅系统执行方案",
    goal: "围绕一致性校验和内部审阅系统给出正式执行方案。",
    status: "active",
    stageLabel: "CEO 整合团队方案并交付老板",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    batonActorId: "co-ceo",
    batonLabel: "CEO",
    artifactIds: [],
    dispatchIds: [],
    startedAt: 1_000,
    updatedAt: 2_000,
    completedAt: null,
    summary: "CTO 与 COO 已回传，等待 CEO 收口输出。",
    nextAction: "让 CEO 输出最终执行方案和优先级。",
    steps: [],
    ...overrides,
  });
}

describe("sanitizeWorkItemRecords", () => {
  it("drops unreliable placeholder work items", () => {
    const records = sanitizeWorkItemRecords([
      createWorkItem({
        id: "bad",
        topicKey: "artifact:growth-plan.md",
        title: "当前需求",
        stageLabel: "{",
        goal: "\"count\": 20,",
        summary: "恢复中",
        nextAction: "恢复中",
      }),
      createWorkItem(),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe("topic:mission:consistency-platform");
  });

  it("drops artifact-backed work items so artifact mirrors do not become task truth", () => {
    const records = sanitizeWorkItemRecords([
      createWorkItem({
        id: "artifact-task",
        topicKey: "artifact:14-验收标准 v1.md",
        title: "验收标准 v1 文档",
        stageLabel: "文档检查",
        goal: "查看验收标准文档。",
        summary: "检查验收标准文档内容。",
        nextAction: "继续查看文档。",
      }),
      createWorkItem(),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe("topic:mission:consistency-platform");
  });

  it("dedupes by id and keeps the newest reliable record", () => {
    const older = createWorkItem({ updatedAt: 1_000, summary: "旧总结" });
    const newer = createWorkItem({ updatedAt: 3_000, summary: "新总结" });

    const records = sanitizeWorkItemRecords([older, newer]);
    expect(records).toHaveLength(1);
    expect(records[0]?.summary).toBe("新总结");
  });

  it("derives sourceActorId from legacy session fields so pages do not need to parse session keys", () => {
    const [record] = sanitizeWorkItemRecords([
      createWorkItem({
        sourceActorId: null,
        sourceConversationId: "agent:co-cto:main",
      }),
    ]);

    expect(record?.sourceActorId).toBe("co-cto");
  });

  it("dedupes strategic active records by topic and prefers canonical topic-backed entries", () => {
    const records = sanitizeWorkItemRecords([
      createWorkItem({
        id: "session:agent:co-ceo:main@1",
        topicKey: "mission:consistency-platform",
        sourceActorId: "co-ceo",
        updatedAt: 4_000,
        status: "active",
      }),
      createWorkItem({
        id: "topic:mission:consistency-platform@2",
        workKey: "topic:mission:consistency-platform",
        kind: "strategic",
        roundId: "topic:mission:consistency-platform@2",
        topicKey: "mission:consistency-platform",
        sourceActorId: "co-coo",
        updatedAt: 3_900,
        status: "waiting_owner",
      }),
    ]);

    expect(records.map((record) => record.id)).toContain("topic:mission:consistency-platform");
    expect(records.map((record) => record.id)).not.toContain("session:agent:co-ceo:main@1");
  });

  it("collapses drifted strategic records from the same source conversation into one stable title-backed record", () => {
    const records = sanitizeWorkItemRecords([
      createWorkItem({
        id: "topic:mission:4p27it",
        workKey: "topic:mission:4p27it",
        roundId: "topic:mission:4p27it@2000",
        topicKey: "mission:4p27it",
        sourceConversationId: "agent:co-ceo:main",
        sourceSessionKey: "agent:co-ceo:main",
        updatedAt: 4_000,
      }),
      createWorkItem({
        id: "topic:mission:1ip8yl0",
        workKey: "topic:mission:1ip8yl0",
        roundId: "topic:mission:1ip8yl0@1500",
        topicKey: "mission:1ip8yl0",
        title: "CEO",
        sourceConversationId: "agent:co-ceo:main",
        sourceSessionKey: "agent:co-ceo:main",
        updatedAt: 3_000,
      }),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]?.id).toMatch(/^topic:mission:/);
    expect(records[0]?.title).toBe("一致性底座与内部审阅系统执行方案");
    expect(records[0]?.sourceConversationId).toBe("agent:co-ceo:main");
  });

  it("normalizes recursively wrapped strategic ids from authority snapshots", () => {
    const [record] = sanitizeWorkItemRecords([
      createWorkItem({
        id: "topic:aggregate:topic:aggregate:topic:mission:alpha@1000@2000",
        workKey: "topic:aggregate:topic:aggregate:topic:mission:alpha@1000@2000",
        roundId: "topic:aggregate:topic:aggregate:topic:mission:alpha@1000@2000",
        topicKey: "aggregate:topic:aggregate:topic:mission:alpha@1000",
        title: "从头开始搭建 AI 小说创作团队",
        sourceConversationId: "agent:co-ceo:main",
        sourceSessionKey: "agent:co-ceo:main",
      }),
    ]);

    expect(record?.id).toBe("topic:mission:alpha");
    expect(record?.workKey).toBe("topic:mission:alpha");
    expect(record?.topicKey).toBe("mission:alpha");
  });

  it("preserves distinct strategic tasks from the same source conversation", () => {
    const records = sanitizeWorkItemRecords([
      createWorkItem({
        id: "topic:mission:consistency-platform",
        workKey: "topic:mission:consistency-platform",
        roundId: "topic:mission:consistency-platform@1000",
        topicKey: "mission:consistency-platform",
        sourceConversationId: "agent:co-ceo:main",
        sourceSessionKey: "agent:co-ceo:main",
        updatedAt: 4_000,
      }),
      createWorkItem({
        id: "topic:mission:novel-team-bootstrap",
        workKey: "topic:mission:novel-team-bootstrap",
        roundId: "topic:mission:novel-team-bootstrap@5000",
        topicKey: "mission:novel-team-bootstrap",
        title: "从头开始搭建 AI 小说创作团队",
        goal: "先把小说公司的组织、规范、工具和流程从头搭起来。",
        summary: "围绕招聘、流程、工具和质量标准从头搭建小说创作团队。",
        nextAction: "让 CEO 启动团队搭建主线并派发第一批任务。",
        stageLabel: "CEO 发起团队搭建主线",
        sourceConversationId: "agent:co-ceo:main",
        sourceSessionKey: "agent:co-ceo:main",
        updatedAt: 5_000,
      }),
    ]);

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.title)).toContain("一致性底座与内部审阅系统执行方案");
    expect(records.map((record) => record.title)).toContain("从头开始搭建 AI 小说创作团队");
  });
});
