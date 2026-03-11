import { describe, expect, it } from "vitest";
import { buildChatDisplayItems } from "./messages";
import type { ChatMessage } from "../../../application/gateway";

describe("buildChatDisplayItems", () => {
  it("collapses plain toolResult role messages into a tool summary item", () => {
    const messages: ChatMessage[] = [
      {
        role: "toolResult",
        toolName: "write",
        text: "Successfully wrote 285 bytes to /tmp/TASK-BOARD.md",
        timestamp: 1_000,
      },
    ];

    expect(buildChatDisplayItems(messages)).toEqual([
      {
        kind: "tool",
        id: "1000:tool",
        title: "写入文件 已返回结果",
        detail: "Successfully wrote 285 bytes to /tmp/TASK-BOARD.md",
        tone: "sky",
        count: 1,
      },
    ]);
  });

  it("keeps regular assistant content visible while collapsing tool chatter", () => {
    const messages: ChatMessage[] = [
      {
        role: "assistant",
        text: "我现在就派发任务给 CTO 和 COO。",
        timestamp: 1_000,
      },
      {
        role: "toolResult",
        toolName: "company_dispatch",
        text: "{\"ok\":true,\"status\":\"sent\"}",
        timestamp: 1_100,
      },
    ];

    const items = buildChatDisplayItems(messages);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "message",
      message: expect.objectContaining({
        role: "assistant",
        text: "我现在就派发任务给 CTO 和 COO。",
      }),
    });
    expect(items[1]).toMatchObject({
      kind: "tool",
      title: "company dispatch 已返回结果",
      detail: "已返回结构化结果",
      tone: "sky",
    });
  });
});
