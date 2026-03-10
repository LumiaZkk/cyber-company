import { describe, expect, it, vi } from "vitest";
import {
  createBackendCapabilities,
  type ActorRef,
  type BackendCore,
  type ConversationKind,
  type ConversationRef,
} from "./types";
import { createBackendProviderFromCore } from "./providers";

function createMinimalCore(providerId = "minimal"): BackendCore {
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
      async (actorRef: ActorRef, kind: ConversationKind = "direct"): Promise<ConversationRef> => ({
        providerId,
        conversationId: `${actorRef.actorId}:${kind}`,
        actorId: actorRef.actorId,
        kind,
        native: false,
        sourceKey: `${actorRef.actorId}:${kind}`,
      }),
    ),
    readConversation: vi.fn(async (conversationRef: ConversationRef) => ({
      conversation: conversationRef,
      messages: [],
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

describe("createBackendProviderFromCore", () => {
  it("wraps a BackendCore as a provider definition with safe fallbacks", async () => {
    const provider = createBackendProviderFromCore(
      {
        id: "minimal",
        label: "Minimal",
        description: "Minimal provider",
        urlLabel: "URL",
        tokenLabel: "Token",
        tokenOptional: true,
        defaultUrl: "http://localhost:1234",
        tokenPlaceholder: "",
        connectHint: "minimal serve",
      },
      createMinimalCore(),
    );

    expect(provider.id).toBe("minimal");
    expect(provider.backend.providerId).toBe("minimal");
    const agents = await provider.backend.listAgents();
    expect(agents.agents[0]?.id).toBe("executor");
  });
});
