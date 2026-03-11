import { describe, expect, it } from "vitest";
import type { Company } from "../../domain";
import type { ChatMessage } from "../gateway";
import { buildSessionProgressEvents } from "./chat-progress";

const company: Company = {
  id: "novel",
  name: "小说创作工作室",
  description: "test",
  icon: "🦞",
  template: "novel",
  employees: [
    { agentId: "co-ceo", nickname: "CEO", role: "首席执行官", isMeta: true, metaRole: "ceo" },
    { agentId: "co-cto", nickname: "CTO", role: "首席技术官", isMeta: true, metaRole: "cto" },
    { agentId: "co-coo", nickname: "COO", role: "首席运营官", isMeta: true, metaRole: "coo" },
  ],
  quickPrompts: [],
  tasks: [],
  handoffs: [],
  requests: [],
  createdAt: 1,
};

describe("buildSessionProgressEvents", () => {
  it("ignores plain direct user prompts so they stay in the chat stream only", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        text: "为什么前面默认响应成了Kimi K2.5",
        timestamp: 1_000,
      },
      {
        role: "user",
        text: "排查下原因",
        timestamp: 2_000,
      },
    ];

    expect(
      buildSessionProgressEvents({
        messages,
        company,
        ownerLabel: "CEO",
        includeOwnerAssistantEvents: false,
      }),
    ).toEqual([]);
  });

  it("keeps relayed collaborator feedback from direct chat history", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        text: "技术方案已完成，正在整理发布清单。",
        timestamp: 1_000,
        provenance: {
          sourceActorId: "co-cto",
        },
      },
    ];

    expect(
      buildSessionProgressEvents({
        messages,
        company,
        ownerLabel: "CEO",
        includeOwnerAssistantEvents: false,
      }),
    ).toEqual([
      {
        id: "user:1000:0",
        timestamp: 1_000,
        actorLabel: "CTO",
        title: "协作者状态回传",
        summary: "技术方案已完成，正在整理发布清单。",
        detail: undefined,
        tone: "indigo",
        source: "session",
        category: "status",
        actorAgentId: "co-cto",
      },
    ]);
  });

  it("uses room sender metadata for collaborator replies in group history", () => {
    const messages: ChatMessage[] = [
      {
        role: "assistant",
        text: "番茄发布参数已经确认，正在执行。",
        timestamp: 1_000,
        roomAgentId: "co-coo",
      },
    ];

    expect(
      buildSessionProgressEvents({
        messages,
        company,
        ownerLabel: "CEO",
        includeOwnerAssistantEvents: true,
      }),
    ).toEqual([
      {
        id: "assistant:1000:0",
        timestamp: 1_000,
        actorLabel: "COO",
        title: "协作者状态回传",
        summary: "番茄发布参数已经确认，正在执行。",
        detail: undefined,
        tone: "indigo",
        source: "session",
        category: "status",
        actorAgentId: "co-coo",
      },
    ]);
  });
});
