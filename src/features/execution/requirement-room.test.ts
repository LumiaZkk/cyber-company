import { describe, expect, it } from "vitest";
import type { Company } from "../company/types";
import type { ChatMessage } from "../backend";
import {
  areRequirementRoomChatMessagesEqual,
  buildRoomConversationBindingsFromSessions,
  buildRequirementRoomHrefFromRecord,
  buildRequirementRoomRecordFromSessions,
  buildRequirementRoomRoute,
  buildRequirementRoomSessions,
  convertRequirementRoomRecordToChatMessages,
  mergeRequirementRoomRecordFromSessions,
  mergeRequirementRoomMessages,
  searchRequirementRoomMentionCandidates,
  resolveRequirementRoomMentionTargets,
} from "./requirement-room";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "小说",
    description: "测试公司",
    icon: "🏢",
    template: "novel",
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo" },
      { agentId: "co-emp-0", nickname: "主编", role: "主编", isMeta: false },
      { agentId: "co-emp-1", nickname: "写手", role: "主笔写手", isMeta: false },
      { agentId: "co-emp-2", nickname: "审校", role: "审校", isMeta: false },
      { agentId: "co-cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto" },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

describe("requirement-room helpers", () => {
  it("builds a stable requirement room route for the same topic and members", () => {
    const company = createCompany();
    const first = buildRequirementRoomRoute({
      company,
      memberIds: ["co-emp-1", "co-emp-2", "co-cto"],
      topic: "重新完成第 2 章",
    });
    const second = buildRequirementRoomRoute({
      company,
      memberIds: ["co-emp-2", "co-cto", "co-emp-1"],
      topic: "重新完成第 2 章",
    });

    expect(first).toBe(second);
    expect(first).toContain("title=%E9%87%8D%E6%96%B0%E5%AE%8C%E6%88%90%E7%AC%AC+2+%E7%AB%A0");
    expect(first).toContain("sk=room%3A");
  });

  it("keeps one stable room per requirement topicKey even if the title wording changes", () => {
    const company = createCompany();
    const first = buildRequirementRoomRoute({
      company,
      memberIds: ["co-ceo", "co-cto", "co-emp-0"],
      topic: "让 CTO 输出一致性技术方案",
      topicKey: "mission:consistency-foundation",
    });
    const second = buildRequirementRoomRoute({
      company,
      memberIds: ["co-cto", "co-ceo", "co-emp-0"],
      topic: "一致性底座与内部审阅系统执行方案",
      topicKey: "mission:consistency-foundation",
    });

    expect(first?.split("?")[0]).toBe(second?.split("?")[0]);
    expect(first).toContain("tk=mission%3Aconsistency-foundation");
  });

  it("reuses an existing requirement room record for the same requirement", () => {
    const company = createCompany();
    const existingHref = buildRequirementRoomHrefFromRecord({
      id: "agent:co-ceo:group:mission-consistency-abc123",
      sessionKey: "agent:co-ceo:group:mission-consistency-abc123",
      title: "一致性底座与内部审阅系统执行方案",
      topicKey: "mission:consistency-foundation",
      memberIds: ["co-ceo", "co-cto", "co-coo"],
      memberActorIds: ["co-ceo", "co-cto", "co-coo"],
      status: "active",
      ownerAgentId: "co-ceo",
      transcript: [],
      createdAt: 1,
      updatedAt: 2,
    });

    const route = buildRequirementRoomRoute({
      company,
      memberIds: ["co-ceo", "co-cto"],
      topic: "让 CTO 出一致性技术方案",
      topicKey: "mission:consistency-foundation",
      existingRooms: [
        {
          id: "agent:co-ceo:group:mission-consistency-abc123",
          sessionKey: "agent:co-ceo:group:mission-consistency-abc123",
          title: "一致性底座与内部审阅系统执行方案",
          topicKey: "mission:consistency-foundation",
          memberIds: ["co-ceo", "co-cto", "co-coo"],
          memberActorIds: ["co-ceo", "co-cto", "co-coo"],
          status: "active",
          ownerAgentId: "co-ceo",
          transcript: [],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    });

    expect(route).toBe(existingHref);
  });

  it("resolves @ mentions against current requirement-team members", () => {
    const company = createCompany();
    const targets = resolveRequirementRoomMentionTargets({
      company,
      text: "@写手 先重写，@CTO 先待命，@不存在 忽略",
      memberIds: ["co-emp-1", "co-cto", "co-emp-2"],
    });

    expect(targets).toEqual(["co-emp-1", "co-cto"]);
  });

  it("surfaces mention candidates for Chinese nicknames and roles", () => {
    const company = createCompany();
    const candidates = searchRequirementRoomMentionCandidates({
      company,
      memberIds: ["co-emp-1", "co-emp-2", "co-cto"],
      query: "审",
    });

    expect(candidates.map((candidate) => candidate.agentId)).toEqual(["co-emp-2"]);
    expect(candidates[0]?.label).toBe("审校");
  });

  it("builds member room sessions and merges broadcast messages into one room timeline", () => {
    const company = createCompany();
    const bindings = buildRoomConversationBindingsFromSessions({
      roomId: "workitem:rewrite-ch02",
      providerId: "minimal",
      sessions: [
        { sessionKey: "agent:co-ceo:group:rewrite-ch02-abc123", agentId: "co-ceo" },
        { sessionKey: "agent:co-emp-1:group:rewrite-ch02-abc123", agentId: "co-emp-1" },
        { sessionKey: "agent:co-emp-2:group:rewrite-ch02-abc123", agentId: "co-emp-2" },
      ],
    });
    const sessions = buildRequirementRoomSessions({
      company,
      bindings,
      targetSessionKey: "agent:co-ceo:group:rewrite-ch02-abc123",
      memberIds: ["co-emp-1", "co-emp-2"],
    });

    expect(sessions.map((session) => session.sessionKey)).toEqual([
      "agent:co-emp-1:group:rewrite-ch02-abc123",
      "agent:co-emp-2:group:rewrite-ch02-abc123",
    ]);

    const roomMessages = mergeRequirementRoomMessages({
      sessions: [
        {
          sessionKey: "agent:co-emp-1:group:rewrite-ch02-abc123",
          agentId: "co-emp-1",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "@写手 请重写第二章" }],
              timestamp: 1000,
            } satisfies ChatMessage,
            {
              role: "assistant",
              content: [{ type: "text", text: "已开始重写，稍后交付纯正文。" }],
              timestamp: 2000,
            } satisfies ChatMessage,
          ],
        },
        {
          sessionKey: "agent:co-emp-2:group:rewrite-ch02-abc123",
          agentId: "co-emp-2",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "@写手 请重写第二章" }],
              timestamp: 1002,
            } satisfies ChatMessage,
            {
              role: "assistant",
              content: [
                { type: "toolCall", name: "read" },
                { type: "toolResult", text: "{\"ok\":true}" },
              ],
              timestamp: 3000,
            } satisfies ChatMessage,
          ],
        },
      ],
    });

    expect(roomMessages).toHaveLength(2);
    expect(roomMessages[0]?.role).toBe("user");
    expect(roomMessages[0]?.roomAudienceAgentIds).toEqual(["co-emp-1", "co-emp-2"]);
    expect(roomMessages[1]?.role).toBe("assistant");
    expect(roomMessages[1]?.roomAgentId).toBe("co-emp-1");
  });

  it("builds a canonical room record that keeps transcript entries stable", () => {
    const company = createCompany();
    const roomRecord = buildRequirementRoomRecordFromSessions({
      company,
      sessionKey: "agent:co-ceo:group:rewrite-ch02-abc123",
      title: "重写第二章",
      memberIds: ["co-emp-1", "co-emp-2"],
      sessions: [
        {
          sessionKey: "agent:co-emp-1:group:rewrite-ch02-abc123",
          agentId: "co-emp-1",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "@写手 请重写第二章" }],
              timestamp: 1000,
            } satisfies ChatMessage,
            {
              role: "assistant",
              content: [{ type: "text", text: "我会先重写正文，再回传给主编。" }],
              timestamp: 2000,
            } satisfies ChatMessage,
          ],
        },
        {
          sessionKey: "agent:co-emp-2:group:rewrite-ch02-abc123",
          agentId: "co-emp-2",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "@写手 请重写第二章" }],
              timestamp: 1002,
            } satisfies ChatMessage,
          ],
        },
      ],
    });

    expect(roomRecord.transcript).toHaveLength(2);
    expect(roomRecord.transcript[0]?.audienceAgentIds).toEqual(["co-emp-1", "co-emp-2"]);
    expect(roomRecord.providerConversationRefs ?? []).toHaveLength(0);

    const roomChatMessages = convertRequirementRoomRecordToChatMessages(roomRecord);
    expect(roomChatMessages).toHaveLength(2);
    expect(roomChatMessages[1]?.roomAgentId).toBe("co-emp-1");
  });

  it("merges persisted room transcript back into the canonical room record on resync", () => {
    const company = createCompany();
    const roomRecord = buildRequirementRoomRecordFromSessions({
      company,
      sessionKey: "agent:co-ceo:group:rewrite-ch02-abc123",
      title: "重写第二章",
      memberIds: ["co-emp-1", "co-emp-2"],
      seedTranscript: [
        {
          id: "local:user:1",
          role: "user",
          text: "@审校 请你同时准备复核",
          timestamp: 1500,
          audienceAgentIds: ["co-emp-2"],
          sourceSessionKey: "agent:co-ceo:group:rewrite-ch02-abc123",
        },
      ],
      sessions: [
        {
          sessionKey: "agent:co-emp-1:group:rewrite-ch02-abc123",
          agentId: "co-emp-1",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "@写手 请重写第二章" }],
              timestamp: 1000,
            } satisfies ChatMessage,
          ],
        },
      ],
    });

    expect(roomRecord.transcript.map((message) => message.id)).toEqual([
      expect.stringContaining("user:agent:co-emp-1:group:rewrite-ch02-abc123"),
      "local:user:1",
    ]);
  });

  it("incrementally merges source sessions into an existing room without dropping prior transcript", () => {
    const company = createCompany();
    const existingRoom = buildRequirementRoomRecordFromSessions({
      company,
      sessionKey: "agent:co-ceo:group:rewrite-ch02-abc123",
      title: "重写第二章",
      memberIds: ["co-emp-1", "co-emp-2"],
      sessions: [
        {
          sessionKey: "agent:co-emp-1:group:rewrite-ch02-abc123",
          agentId: "co-emp-1",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "@写手 请重写第二章" }],
              timestamp: 1000,
            } satisfies ChatMessage,
          ],
        },
      ],
    });

    const mergedRoom = mergeRequirementRoomRecordFromSessions({
      company,
      room: existingRoom,
      sessionKey: existingRoom.sessionKey,
      title: existingRoom.title,
      memberIds: existingRoom.memberIds,
      sessions: [
        {
          sessionKey: "agent:co-emp-1:group:rewrite-ch02-abc123",
          agentId: "co-emp-1",
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "已完成新版初稿，准备交给审校。" }],
              timestamp: 2000,
            } satisfies ChatMessage,
          ],
        },
      ],
    });

    expect(mergedRoom.transcript).toHaveLength(2);
    expect(mergedRoom.lastSourceSyncAt).toBe(2000);

    const roomChatMessages = convertRequirementRoomRecordToChatMessages(mergedRoom);
    expect(
      areRequirementRoomChatMessagesEqual(roomChatMessages, convertRequirementRoomRecordToChatMessages(mergedRoom)),
    ).toBe(true);
  });

  it("builds provider bindings separately from the room transcript", () => {
    const bindings = buildRoomConversationBindingsFromSessions({
      roomId: "workitem:mission-consistency-foundation",
      providerId: "minimal",
      sessions: [
        {
          sessionKey: "agent:co-cto:group:mission-consistency-abc123",
          agentId: "co-cto",
        },
      ],
    });

    expect(bindings[0]).toMatchObject({
      roomId: "workitem:mission-consistency-foundation",
      providerId: "minimal",
      conversationId: "agent:co-cto:group:mission-consistency-abc123",
      actorId: "co-cto",
    });
  });
});
