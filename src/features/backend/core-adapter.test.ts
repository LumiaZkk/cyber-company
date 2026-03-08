import { describe, expect, it, vi } from "vitest";
import { createAgentBackendFromCore } from "./core-adapter";
import { createBackendCapabilities, type ActorRef, type BackendCore, type ConversationRef } from "./types";

function createCore(providerId = "minimal"): BackendCore {
  return {
    providerId,
    isConnected: true,
    capabilities: createBackendCapabilities(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    probeCapabilities: vi.fn(async () => createBackendCapabilities()),
    listActors: vi.fn(async (): Promise<ActorRef[]> => [
      { providerId, actorId: "executor", label: "Executor" },
    ]),
    ensureConversation: vi.fn(
      async (actorRef: ActorRef, kind = "direct"): Promise<ConversationRef> => ({
        providerId,
        conversationId: `${actorRef.actorId}:${kind}`,
        actorId: actorRef.actorId,
        kind,
        native: false,
        sourceKey: actorRef.actorId,
      }),
    ),
    readConversation: vi.fn(async (conversationRef: ConversationRef) => ({
      conversation: conversationRef,
      messages: [
        {
          id: `${conversationRef.conversationId}:1`,
          role: "assistant" as const,
          text: "done",
          timestamp: 1,
        },
      ],
    })),
    sendTurn: vi.fn(async (conversationRef: ConversationRef) => ({
      run: {
        providerId,
        runId: `${conversationRef.conversationId}:run`,
        conversationId: conversationRef.conversationId,
      },
      status: "started" as const,
    })),
  };
}

describe("createAgentBackendFromCore", () => {
  it("derives agent list and chat history from core methods", async () => {
    const backend = createAgentBackendFromCore(createCore());

    const actors = await backend.listActors();
    expect(actors[0]?.actorId).toBe("executor");

    const agents = await backend.listAgents();
    expect(agents.agents[0]?.id).toBe("executor");

    const session = await backend.resolveSession("executor");
    expect(session.ok).toBe(true);

    const history = await backend.getChatHistory(session.key, 20);
    expect(history.messages[0]?.text).toBe("done");
  });

  it("provides safe fallbacks for unsupported optional surfaces", async () => {
    const backend = createAgentBackendFromCore(createCore("weak"));

    const sessions = await backend.listSessions();
    expect(sessions.sessions).toEqual([]);

    const archives = await backend.listSessionArchives("weak");
    expect(archives.archives).toEqual([]);

    await expect(backend.request("health.ping")).rejects.toThrow(/not supported/i);
    await expect(backend.resetSession("weak:main")).rejects.toThrow(/not supported/i);
  });
});
