import { beforeEach, describe, expect, it } from "vitest";
import { clearRequirementRoomRecords, loadRequirementRoomRecords, persistRequirementRoomRecords } from "./room-persistence";
import type { RequirementRoomRecord } from "./types";
import { buildRoomRecordIdFromWorkItem } from "../../../application/mission/work-item";

describe("room-persistence", () => {
  const companyId = "company-room-test";
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      configurable: true,
      writable: true,
    });
  });

  it("drops provider conversation refs and keeps product room data as the persisted truth source", () => {
    const workItemId = "topic:mission:consistency-foundation";
    const room: RequirementRoomRecord = {
      id: buildRoomRecordIdFromWorkItem(workItemId),
      companyId,
      workItemId,
      sessionKey: `room:${buildRoomRecordIdFromWorkItem(workItemId)}`,
      title: "一致性底座与内部审阅系统执行方案",
      topicKey: "mission:consistency-foundation",
      memberIds: ["co-ceo", "co-cto"],
      memberActorIds: ["co-ceo", "co-cto"],
      ownerAgentId: "co-ceo",
      ownerActorId: "co-ceo",
      status: "active",
      providerConversationRefs: [
        {
          providerId: "openclaw",
          conversationId: "agent:co-cto:group:legacy-room",
          actorId: "co-cto",
        },
      ],
      transcript: [
        {
          id: "room:user:1",
          role: "user",
          text: "@CTO 请输出执行方案",
          timestamp: 1_000,
        },
      ],
      createdAt: 1_000,
      updatedAt: 1_100,
    };

    persistRequirementRoomRecords(companyId, [room]);
    const [loaded] = loadRequirementRoomRecords(companyId);

    expect(loaded?.id).toBe(room.id);
    expect(loaded?.providerConversationRefs).toBeUndefined();
    expect(loaded?.memberIds).toEqual(["co-ceo", "co-cto"]);
    expect(loaded?.memberActorIds).toEqual(["co-ceo", "co-cto"]);
    expect(loaded?.transcript).toHaveLength(1);

    clearRequirementRoomRecords(companyId);
    expect(loadRequirementRoomRecords(companyId)).toEqual([]);
  });

  it("drops artifact-backed rooms so artifacts do not pollute requirement rooms", () => {
    const artifactRoom: RequirementRoomRecord = {
      id: "workitem:topic:artifact:14-验收标准 v1.md@1",
      companyId,
      workItemId: "topic:artifact:14-验收标准 v1.md@1",
      sessionKey: "room:workitem:topic:artifact:14-验收标准 v1.md@1",
      title: "验收标准 v1 文档",
      topicKey: "artifact:14-验收标准 v1.md",
      memberIds: ["co-ceo"],
      memberActorIds: ["co-ceo"],
      ownerAgentId: "co-ceo",
      ownerActorId: "co-ceo",
      status: "active",
      transcript: [],
      createdAt: 1_000,
      updatedAt: 1_100,
    };

    persistRequirementRoomRecords(companyId, [artifactRoom]);
    expect(loadRequirementRoomRecords(companyId)).toEqual([]);
  });

  it("merges legacy duplicate rooms for the same work item into one canonical room", () => {
    const workItemId = "topic:mission:consistency-foundation";
    const canonicalRoomId = buildRoomRecordIdFromWorkItem(workItemId);

    persistRequirementRoomRecords(companyId, [
      {
        id: canonicalRoomId,
        companyId,
        workItemId,
        sessionKey: `room:${canonicalRoomId}`,
        title: "一致性底座与内部审阅系统执行方案",
        topicKey: "mission:consistency-foundation",
        memberIds: ["co-ceo", "co-cto"],
        memberActorIds: ["co-ceo", "co-cto"],
        ownerAgentId: "co-ceo",
        ownerActorId: "co-ceo",
        status: "active",
        transcript: [
          { id: "room:user:1", role: "user", text: "@CTO 请输出执行方案", timestamp: 1_000 },
        ],
        createdAt: 1_000,
        updatedAt: 1_100,
      },
      {
        id: "workitem:legacy-consistency-foundation",
        companyId,
        workItemId,
        sessionKey: "room:workitem:legacy-consistency-foundation",
        title: "一致性底座与内部审阅系统执行方案",
        topicKey: "mission:consistency-foundation",
        memberIds: ["co-coo", "co-cto"],
        memberActorIds: ["co-coo", "co-cto"],
        ownerAgentId: "co-ceo",
        ownerActorId: "co-ceo",
        status: "active",
        transcript: [
          { id: "room:assistant:2", role: "assistant", text: "CTO 已接单", timestamp: 1_200 },
        ],
        createdAt: 1_000,
        updatedAt: 1_200,
      },
    ]);

    const rooms = loadRequirementRoomRecords(companyId);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.id).toBe(canonicalRoomId);
    expect(rooms[0]?.memberIds).toEqual(["co-ceo", "co-coo", "co-cto"]);
    expect(rooms[0]?.transcript).toHaveLength(2);
  });

  it("normalizes drifted strategic room ids into one stable title-backed room", () => {
    persistRequirementRoomRecords(companyId, [
      {
        id: "workitem:topic:mission:4p27it",
        companyId,
        workItemId: "topic:mission:4p27it",
        sessionKey: "room:workitem:topic:mission:4p27it",
        title: "一致性底座与内部审阅系统执行方案",
        topicKey: "mission:4p27it",
        memberIds: ["co-ceo", "co-cto"],
        memberActorIds: ["co-ceo", "co-cto"],
        ownerAgentId: "co-ceo",
        ownerActorId: "co-ceo",
        status: "active",
        transcript: [
          { id: "room:user:1", role: "user", text: "@CTO 输出一致性底座技术方案", timestamp: 1_000 },
        ],
        createdAt: 1_000,
        updatedAt: 1_000,
      },
      {
        id: "workitem:topic:mission:1ip8yl0",
        companyId,
        workItemId: "topic:mission:1ip8yl0",
        sessionKey: "room:workitem:topic:mission:1ip8yl0",
        title: "一致性底座与内部审阅系统执行方案",
        topicKey: "mission:1ip8yl0",
        memberIds: ["co-ceo", "co-coo"],
        memberActorIds: ["co-ceo", "co-coo"],
        ownerAgentId: "co-ceo",
        ownerActorId: "co-ceo",
        status: "active",
        transcript: [
          { id: "room:assistant:2", role: "assistant", text: "COO 已回传内部审阅系统建议。", timestamp: 1_200 },
        ],
        createdAt: 1_000,
        updatedAt: 1_200,
      },
    ]);

    const rooms = loadRequirementRoomRecords(companyId);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.id).toMatch(/^workitem:topic:mission:/);
    expect(rooms[0]?.memberIds).toEqual(["co-ceo", "co-coo", "co-cto"]);
    expect(rooms[0]?.transcript).toHaveLength(2);
  });

  it("canonicalizes recursively wrapped strategic room identities from authority snapshots", () => {
    persistRequirementRoomRecords(companyId, [
      {
        id: "workitem:topic:aggregate:topic:aggregate:topic:mission:alpha@1000@2000",
        companyId,
        workItemId: "topic:aggregate:topic:aggregate:topic:mission:alpha@1000@2000",
        sessionKey: "room:workitem:topic:aggregate:topic:aggregate:topic:mission:alpha@1000@2000",
        title: "从头开始搭建 AI 小说创作团队",
        topicKey: "aggregate:topic:aggregate:topic:mission:alpha@1000",
        memberIds: ["co-ceo", "co-cto"],
        memberActorIds: ["co-ceo", "co-cto"],
        ownerAgentId: "co-ceo",
        ownerActorId: "co-ceo",
        status: "active",
        transcript: [],
        createdAt: 1_000,
        updatedAt: 1_200,
      },
    ]);

    const [room] = loadRequirementRoomRecords(companyId);
    expect(room?.id).toBe("workitem:topic:mission:alpha");
    expect(room?.workItemId).toBe("topic:mission:alpha");
    expect(room?.sessionKey).toBe("room:workitem:topic:mission:alpha");
    expect(room?.topicKey).toBe("mission:alpha");
  });

  it("merges legacy duplicate rooms with the same title and members even when work item ids drift", () => {
    persistRequirementRoomRecords(companyId, [
      {
        id: "room:legacy:1",
        companyId,
        workItemId: "topic:mission:legacy-a",
        sessionKey: "room:legacy:1",
        title: "重新完成第2章",
        topicKey: "mission:legacy-a",
        memberIds: ["co-ceo", "co-cto", "co-coo", "co-hr"],
        memberActorIds: ["co-ceo", "co-cto", "co-coo", "co-hr"],
        ownerAgentId: "co-ceo",
        ownerActorId: "co-ceo",
        status: "active",
        transcript: [
          { id: "room:user:1", role: "user", text: "@HR 请先补齐招聘 JD。", timestamp: 1_000 },
        ],
        createdAt: 1_000,
        updatedAt: 1_000,
      },
      {
        id: "room:legacy:2",
        companyId,
        workItemId: "topic:mission:legacy-b",
        sessionKey: "room:legacy:2",
        title: "重新完成第2章",
        topicKey: "mission:legacy-b",
        memberIds: ["co-coo", "co-hr", "co-cto", "co-ceo"],
        memberActorIds: ["co-coo", "co-hr", "co-cto", "co-ceo"],
        ownerAgentId: "co-ceo",
        ownerActorId: "co-ceo",
        status: "active",
        transcript: [
          { id: "room:assistant:2", role: "assistant", text: "HR：招聘 JD 已经整理完成。", timestamp: 1_200 },
        ],
        createdAt: 1_000,
        updatedAt: 1_200,
      },
    ]);

    const rooms = loadRequirementRoomRecords(companyId);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.memberIds).toEqual(["co-ceo", "co-coo", "co-cto", "co-hr"]);
    expect(rooms[0]?.transcript).toHaveLength(2);
  });
});
