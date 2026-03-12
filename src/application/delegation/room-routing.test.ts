import { describe, expect, it } from "vitest";
import type { Company } from "../../domain";
import type { ChatMessage } from "../gateway";
import {
  areRequirementRoomChatMessagesEqual,
  areRequirementRoomRecordsEquivalent,
  buildRoomConversationBindingsFromSessions,
  buildRequirementRoomHrefFromRecord,
  buildRequirementRoomRecordFromSessions,
  buildRequirementRoomRecordFromSnapshots,
  buildRequirementRoomRoute,
  buildRequirementRoomSessions,
  convertRequirementRoomRecordToChatMessages,
  createOutgoingRequirementRoomMessage,
  isVisibleRequirementRoomMessage,
  mergeRequirementRoomRecordFromSnapshots,
  mergeRequirementRoomRecordFromSessions,
  mergeRequirementRoomMessages,
  searchRequirementRoomMentionCandidates,
  sortRequirementRoomMemberIds,
  resolveRequirementRoomMentionTargets,
} from "./room-routing";

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
    expect(first).not.toContain("sk=");
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
    expect(route).toBe("/chat/room%3Aagent%3Aco-ceo%3Agroup%3Amission-consistency-abc123");
  });

  it("keeps existing room href free of compatibility query params", () => {
    const href = buildRequirementRoomHrefFromRecord({
      id: "workitem:topic:mission:consistency-foundation",
      sessionKey: "agent:co-ceo:group:mission-consistency-abc123",
      title: "一致性底座与内部审阅系统执行方案",
      topicKey: "mission:consistency-foundation",
      workItemId: "topic:mission:consistency-foundation",
      memberIds: ["co-ceo", "co-cto", "co-coo"],
      memberActorIds: ["co-ceo", "co-cto", "co-coo"],
      status: "active",
      ownerAgentId: "co-ceo",
      transcript: [],
      createdAt: 1,
      updatedAt: 2,
    });

    expect(href).toBe("/chat/room%3Aworkitem%3Atopic%3Amission%3Aconsistency-foundation");
    expect(href).not.toContain("?");
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

  it("sorts room member ids stably for product-room truth", () => {
    expect(sortRequirementRoomMemberIds(["co-emp-2", "co-ceo", "co-emp-1", "co-ceo"])).toEqual([
      "co-ceo",
      "co-emp-1",
      "co-emp-2",
    ]);
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

  it("keeps human-readable member-side room messages while still hiding workflow noise", () => {
    const company = createCompany();
    const roomRecord = buildRequirementRoomRecordFromSessions({
      company,
      sessionKey: "agent:co-ceo:group:consistency-platform",
      title: "一致性底座与内部审阅系统执行方案",
      memberIds: ["co-ceo", "co-cto"],
      ownerAgentId: "co-ceo",
      sessions: [
        {
          sessionKey: "agent:co-cto:group:consistency-platform",
          agentId: "co-cto",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "我建议先把一致性规则拆成规则层和校验层。" }],
              timestamp: 1000,
            } satisfies ChatMessage,
            {
              role: "user",
              content: [{ type: "text", text: "需求团队房间《一致性底座》本轮已经收到回执。" }],
              timestamp: 1010,
            } satisfies ChatMessage,
            {
              role: "assistant",
              content: [{ type: "text", text: "我会先输出 CTO 版技术方案。" }],
              timestamp: 1100,
            } satisfies ChatMessage,
          ],
        },
      ],
    });

    expect(roomRecord.transcript).toHaveLength(2);
    expect(roomRecord.transcript[0]).toMatchObject({
      source: "member_message",
      senderAgentId: "co-cto",
      text: "我建议先把一致性规则拆成规则层和校验层。",
    });
    expect(roomRecord.transcript[1]).toMatchObject({
      source: "member_reply",
      senderAgentId: "co-cto",
      text: "我会先输出 CTO 版技术方案。",
    });
  });

  it("marks outgoing room dispatches as owner dispatch", () => {
    const message = createOutgoingRequirementRoomMessage({
      roomId: "room:workitem:topic:mission:consistency-platform",
      sessionKey: "room:workitem:topic:mission:consistency-platform",
      text: "@CTO 请先输出一致性技术方案。",
      audienceAgentIds: ["co-cto"],
      timestamp: 1000,
    });

    expect(message.source).toBe("owner_dispatch");
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
    expect(roomRecord.providerConversationRefs).toBeUndefined();

    const roomChatMessages = convertRequirementRoomRecordToChatMessages(roomRecord);
    expect(roomChatMessages).toHaveLength(2);
    expect(roomChatMessages[1]?.roomAgentId).toBe("co-emp-1");
    expect(roomChatMessages[1]?.roomSessionKey).toBe(roomRecord.id);
  });

  it("treats semantically identical room records as equivalent even when member order differs", () => {
    const left = buildRequirementRoomRecordFromSessions({
      company: createCompany(),
      companyId: "company-1",
      workItemId: "mission:consistency-foundation",
      sessionKey: "room:workitem:mission-consistency-foundation",
      title: "一致性底座与内部审阅系统执行方案",
      memberIds: ["co-cto", "co-ceo", "co-emp-1"],
      ownerAgentId: "co-ceo",
      topicKey: "mission:consistency-foundation",
      sessions: [],
    });
    const right = {
      ...left,
      memberIds: ["co-emp-1", "co-ceo", "co-cto"],
      memberActorIds: ["co-emp-1", "co-ceo", "co-cto"],
    };

    expect(areRequirementRoomRecordsEquivalent(left, right)).toBe(true);
  });

  it("treats room headline/progress changes as semantic room changes", () => {
    const left = buildRequirementRoomRecordFromSessions({
      company: createCompany(),
      companyId: "company-1",
      workItemId: "topic:mission:consistency-foundation",
      sessionKey: "room:workitem:topic:mission:consistency-foundation",
      title: "一致性底座与内部审阅系统执行方案",
      memberIds: ["co-ceo", "co-cto"],
      ownerAgentId: "co-ceo",
      topicKey: "mission:consistency-foundation",
      sessions: [],
    });
    const right = {
      ...left,
      headline: "需求团队: 一致性底座与内部审阅系统执行方案",
      progress: "2 条结论回传",
      lastConclusionAt: 2_000,
    };

    expect(areRequirementRoomRecordsEquivalent(left, right)).toBe(false);
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
    const roomChatMessages = convertRequirementRoomRecordToChatMessages(roomRecord);
    expect(roomChatMessages[0]?.roomSessionKey).toBe(roomRecord.id);
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

  it("replays older bound session history when the stored room is still an empty shell", () => {
    const company = createCompany();
    const emptyShellRoom = {
      id: "workitem:topic:mission:alpha",
      companyId: company.id,
      workItemId: "topic:mission:alpha",
      sessionKey: "agent:co-ceo:main",
      title: "当前主线正在推进。",
      headline: "当前主线正在推进。",
      topicKey: "mission:alpha",
      memberIds: ["co-ceo", "co-emp-1"],
      memberActorIds: ["co-ceo", "co-emp-1"],
      ownerAgentId: "co-ceo",
      ownerActorId: "co-ceo",
      status: "active" as const,
      progress: "0 条可见消息",
      transcript: [],
      createdAt: 1_000,
      updatedAt: 10_000,
      lastSourceSyncAt: 10_000,
    };

    const mergedRoom = mergeRequirementRoomRecordFromSessions({
      company,
      room: emptyShellRoom,
      workItemId: "topic:mission:alpha",
      sessionKey: emptyShellRoom.sessionKey,
      title: emptyShellRoom.title,
      memberIds: emptyShellRoom.memberIds,
      ownerAgentId: emptyShellRoom.ownerAgentId,
      topicKey: emptyShellRoom.topicKey,
      sessions: [
        {
          sessionKey: "agent:co-ceo:main",
          agentId: "co-ceo",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "@写手 请整理第一版大纲" }],
              timestamp: 1_200,
            } satisfies ChatMessage,
          ],
        },
        {
          sessionKey: "agent:co-emp-1:main",
          agentId: "co-emp-1",
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "第一版大纲已整理完成。" }],
              timestamp: 1_800,
            } satisfies ChatMessage,
          ],
        },
      ],
    });

    expect(mergedRoom.transcript).toHaveLength(2);
    expect(convertRequirementRoomRecordToChatMessages(mergedRoom)).toHaveLength(2);
    expect(mergedRoom.progress).not.toBe("0 条可见消息");
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

  it("prefers explicit room bindings over legacy provider refs when resolving room sessions", () => {
    const company = createCompany();
    const sessions = buildRequirementRoomSessions({
      company,
      room: {
        id: "workitem:mission-consistency-foundation",
        sessionKey: "room:workitem:mission-consistency-foundation",
        title: "一致性底座与内部审阅系统执行方案",
        topicKey: "mission:consistency-foundation",
        memberIds: ["co-ceo", "co-cto"],
        memberActorIds: ["co-ceo", "co-cto"],
        status: "active",
        ownerAgentId: "co-ceo",
        providerConversationRefs: [
          {
            providerId: "legacy",
            conversationId: "agent:co-ceo:group:legacy-room",
            actorId: "co-ceo",
          },
        ],
        transcript: [],
        createdAt: 1,
        updatedAt: 2,
      },
      bindings: [
        {
          roomId: "workitem:mission-consistency-foundation",
          providerId: "minimal",
          conversationId: "agent:co-cto:group:mission-consistency-abc123",
          actorId: "co-cto",
          updatedAt: 10,
        },
      ],
      targetSessionKey: "room:workitem:mission-consistency-foundation",
      memberIds: ["co-ceo", "co-cto"],
    });

    expect(sessions).toEqual([
      {
        agentId: "co-cto",
        label: "CTO",
        role: "Chief Technology Officer",
        sessionKey: "agent:co-cto:group:mission-consistency-abc123",
      },
    ]);
  });

  it("hides system and mirror noise from the visible room chat flow", () => {
    const roomRecord = buildRequirementRoomRecordFromSessions({
      company: createCompany(),
      companyId: "company-1",
      workItemId: "mission:consistency-foundation",
      sessionKey: "agent:co-ceo:group:mission-consistency-abc123",
      title: "一致性底座与内部审阅系统执行方案",
      memberIds: ["co-ceo", "co-cto"],
      ownerAgentId: "co-ceo",
      topicKey: "mission:consistency-foundation",
      seedTranscript: [
        {
          id: "room:debug:1",
          role: "assistant",
          text: "任务追踪已同步到顶部“本次需求执行 / 协作生命周期”，正文里不再重复展开。",
          timestamp: 900,
          visibility: "debug",
          source: "system",
        },
      ],
      sessions: [
        {
          sessionKey: "agent:co-cto:group:mission-consistency-abc123",
          agentId: "co-cto",
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "我会先输出一致性底座方案，再回传给 CEO。" }],
              timestamp: 1200,
            } satisfies ChatMessage,
          ],
        },
      ],
    });

    expect(roomRecord.transcript).toHaveLength(1);
    expect(isVisibleRequirementRoomMessage(roomRecord.transcript[0])).toBe(true);
    expect(convertRequirementRoomRecordToChatMessages(roomRecord)).toHaveLength(1);
  });

  it("hydrates a canonical room transcript from requirement snapshots when provider room sessions are missing", () => {
    const company = createCompany();
    const roomRecord = buildRequirementRoomRecordFromSnapshots({
      company,
      companyId: "company-1",
      workItemId: "topic:mission:consistency-foundation",
      sessionKey: "room:workitem:topic:mission:consistency-foundation",
      title: "开发一致性底座与内部审阅系统",
      memberIds: ["co-ceo", "co-cto", "co-emp-2"],
      ownerAgentId: "co-ceo",
      topicKey: "mission:consistency-foundation",
      snapshots: [
        {
          agentId: "co-cto",
          sessionKey: "agent:co-cto:main",
          updatedAt: 2_000,
          messages: [
            {
              role: "assistant",
              text: "我先出一版一致性技术方案，包含规则层和校验层。",
              timestamp: 1_500,
            },
          ],
        },
        {
          agentId: "co-emp-2",
          sessionKey: "agent:co-emp-2:main",
          updatedAt: 2_500,
          messages: [
            {
              role: "assistant",
              text: "审校这边建议先做内部审阅页面，再补一致性检查。",
              timestamp: 2_200,
            },
          ],
        },
      ],
    });

    expect(roomRecord.id).toBe("workitem:topic:mission:consistency-foundation");
    expect(roomRecord.transcript.map((message) => message.text)).toEqual([
      "我先出一版一致性技术方案，包含规则层和校验层。",
      "审校这边建议先做内部审阅页面，再补一致性检查。",
    ]);
  });

  it("merges snapshot replies into an existing room without reinitializing it", () => {
    const company = createCompany();
    const existingRoom = buildRequirementRoomRecordFromSessions({
      company,
      companyId: "company-1",
      workItemId: "topic:mission:consistency-foundation",
      sessionKey: "room:workitem:topic:mission:consistency-foundation",
      title: "开发一致性底座与内部审阅系统",
      memberIds: ["co-ceo", "co-cto"],
      ownerAgentId: "co-ceo",
      topicKey: "mission:consistency-foundation",
      seedTranscript: [
        {
          id: "dispatch:1",
          role: "user",
          text: "@CTO 请先输出技术方案。",
          timestamp: 1_000,
          source: "owner_dispatch",
          audienceAgentIds: ["co-cto"],
        },
      ],
      sessions: [],
    });

    const mergedRoom = mergeRequirementRoomRecordFromSnapshots({
      company,
      room: existingRoom,
      companyId: "company-1",
      workItemId: "topic:mission:consistency-foundation",
      sessionKey: "room:workitem:topic:mission:consistency-foundation",
      title: existingRoom.title,
      memberIds: existingRoom.memberIds,
      ownerAgentId: "co-ceo",
      topicKey: "mission:consistency-foundation",
      snapshots: [
        {
          agentId: "co-cto",
          sessionKey: "agent:co-cto:main",
          updatedAt: 2_000,
          messages: [
            {
              role: "assistant",
              text: "我先出一版一致性技术方案，包含规则层和校验层。",
              timestamp: 1_800,
            },
          ],
        },
      ],
    });

    expect(mergedRoom.transcript).toHaveLength(2);
    expect(mergedRoom.transcript[0]?.text).toBe("@CTO 请先输出技术方案。");
    expect(mergedRoom.transcript[1]).toMatchObject({
      source: "member_reply",
      senderAgentId: "co-cto",
      text: "我先出一版一致性技术方案，包含规则层和校验层。",
    });
  });
});
