import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeChatSession } from "./session-runtime";
import { gateway } from "../gateway";
import type { ChatMessage } from "../gateway";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("initializeChatSession direct history hydration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps a late history promise when the first direct history fetch times out", async () => {
    vi.useFakeTimers();

    const lateMessages: ChatMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "老板需求" }],
        timestamp: 1_000,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "CEO 已收到" }],
        timestamp: 2_000,
      },
    ];
    const historyDeferred = deferred<{ sessionKey: string; messages: ChatMessage[] }>();

    vi.spyOn(gateway, "resolveSession").mockResolvedValue({
      ok: true,
      key: "agent:co-ceo:main",
    });
    vi.spyOn(gateway, "getChatHistory").mockImplementation(() => historyDeferred.promise);

    const initializationPromise = initializeChatSession({
      activeCompany: null,
      archiveId: null,
      activeArchivedRound: null,
      effectiveGroupSessionKey: null,
      effectiveOwnerAgentId: null,
      effectiveRequirementRoom: null,
      effectiveRequirementRoomSnapshots: [],
      groupTitle: "CEO",
      groupTopicKey: null,
      groupWorkItemId: null,
      historyAgentId: null,
      isArchiveView: false,
      isGroup: false,
      persistedWorkItemStartedAt: null,
      providerId: "authority",
      requirementRoomSessions: [],
      requirementRoomTargetAgentIds: [],
      targetAgentId: "co-ceo",
    });

    await vi.advanceTimersByTimeAsync(8_000);
    const initialization = await initializationPromise;

    expect(initialization.sessionKey).toBe("agent:co-ceo:main");
    expect(initialization.messages).toEqual([]);
    expect(initialization.lateHistoryMessagesPromise).toBeTruthy();

    historyDeferred.resolve({
      sessionKey: "agent:co-ceo:main",
      messages: lateMessages,
    });

    await expect(initialization.lateHistoryMessagesPromise).resolves.toEqual(lateMessages);
  });
});
