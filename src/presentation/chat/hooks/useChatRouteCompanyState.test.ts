import { describe, expect, it } from "vitest";

import { selectRouteChatMessages } from "./useChatRouteCompanyState";
import type { ChatMessage } from "../../../application/gateway";
import type { RequirementRoomRecord } from "../../../domain/delegation/types";

function createRoom(overrides: Partial<RequirementRoomRecord> = {}): RequirementRoomRecord {
  return {
    id: "workitem:topic:mission:alpha",
    companyId: "company-1",
    workItemId: "topic:mission:alpha",
    sessionKey: "room:workitem:topic:mission:alpha",
    title: "需求团队房间",
    topicKey: "mission:alpha",
    scope: "decision",
    memberIds: ["co-ceo", "co-cto"],
    memberActorIds: ["co-ceo", "co-cto"],
    ownerAgentId: "co-ceo",
    ownerActorId: "co-ceo",
    status: "active",
    headline: "需求团队房间",
    progress: "0 条可见消息",
    transcript: [],
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

function createChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "历史消息" }],
    text: "历史消息",
    timestamp: 1_000,
    ...overrides,
  };
}

describe("selectRouteChatMessages", () => {
  it("keeps locally initialized group history when authority room transcript is empty", () => {
    const historyMessages = [
      createChatMessage({
        roomMessageId: "room-message:1",
        roomSessionKey: "room:workitem:topic:mission:alpha",
      }),
    ];

    const messages = selectRouteChatMessages({
      isGroup: true,
      authorityBackedState: true,
      activeRequirementRoom: createRoom(),
      sessionMessages: historyMessages,
    });

    expect(messages).toEqual(historyMessages);
  });

  it("merges local history with live room transcript updates in authority-backed rooms", () => {
    const historyMessages = [
      createChatMessage({
        roomMessageId: "room-message:1",
        roomSessionKey: "room:workitem:topic:mission:alpha",
      }),
    ];
    const liveRoomMessage = {
      id: "room-message:2",
      role: "assistant" as const,
      text: "新的成员反馈",
      content: [{ type: "text" as const, text: "新的成员反馈" }],
      timestamp: 2_000,
      senderAgentId: "co-cto",
      senderLabel: "CTO",
      audienceAgentIds: ["co-ceo"],
      sessionKey: "agent:co-cto:main",
      source: "member_reply" as const,
    };

    const messages = selectRouteChatMessages({
      isGroup: true,
      authorityBackedState: true,
      activeRequirementRoom: createRoom({
        transcript: [liveRoomMessage],
        updatedAt: 2_000,
      }),
      sessionMessages: historyMessages,
    });

    expect(messages.map((message) => message.text)).toEqual(["历史消息", "新的成员反馈"]);
  });
});
