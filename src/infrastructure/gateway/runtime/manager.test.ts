import { describe, expect, it, vi } from "vitest";
import { BackendManager } from "./manager";
import type { BackendProviderDefinition } from "./providers";
import {
  createBackendCapabilities,
  type AgentBackend,
  type ActorRef,
  type BackendCapabilities,
  type ConversationRef,
} from "./types";

type StubBackend = AgentBackend & {
  requestSpy: ReturnType<typeof vi.fn>;
};

function createStubBackend(
  providerId: string,
  capabilityOverrides: Partial<BackendCapabilities> = {},
): StubBackend {
  const requestSpy = vi.fn(async <T>() => ({ providerId } as T));
  const backend = {
    providerId,
    capabilities: createBackendCapabilities(capabilityOverrides),
    get isConnected() {
      return false;
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    probeCapabilities: vi.fn(async () => createBackendCapabilities(capabilityOverrides)),
    listActors: vi.fn(async (): Promise<ActorRef[]> => [
      { providerId, actorId: `${providerId}-ceo`, label: `${providerId} ceo` },
    ]),
    ensureConversation: vi.fn(
      async (actorRef: ActorRef): Promise<ConversationRef> => ({
        providerId,
        conversationId: `${providerId}:${actorRef.actorId}:direct`,
        actorId: actorRef.actorId,
        kind: "direct",
        native: true,
        sourceKey: `${providerId}:${actorRef.actorId}:direct`,
      }),
    ),
    readConversation: vi.fn(async (conversationRef: ConversationRef) => ({
      conversation: conversationRef,
      messages: [],
    })),
    sendTurn: vi.fn(async (conversationRef: ConversationRef) => ({
      run: {
        providerId,
        runId: `${providerId}:${conversationRef.conversationId}:run`,
        conversationId: conversationRef.conversationId,
      },
      status: "started" as const,
    })),
    watchRuns: vi.fn(() => () => {}),
    abortRun: vi.fn(async () => ({ ok: true, aborted: 1, runIds: [`${providerId}:run`] })),
    subscribe: vi.fn(() => () => {}),
    onEvent: vi.fn(),
    onHello: vi.fn(),
    onClose: vi.fn(),
    request: requestSpy,
    requestSpy,
  } as unknown as StubBackend;
  return backend;
}

function createProvider(
  id: string,
  capabilityOverrides: Partial<BackendCapabilities>,
): BackendProviderDefinition {
  return {
    id,
    label: id.toUpperCase(),
    description: `${id} backend`,
    urlLabel: "URL",
    tokenLabel: "Token",
    tokenOptional: true,
    defaultUrl: "ws://localhost:18789",
    tokenPlaceholder: "",
    connectHint: `${id} serve`,
    backend: createStubBackend(id, capabilityOverrides),
  };
}

describe("backend manager", () => {
  it("sanitizes provider metadata and tracks active-provider capabilities", async () => {
    const manager = new BackendManager([
      createProvider("alpha", { sessionArchives: true, config: true }),
      createProvider("beta", { sessionHistory: true }),
    ]);

    expect(manager.listProviders()).toEqual([
      expect.objectContaining({ id: "alpha", label: "ALPHA" }),
      expect.objectContaining({ id: "beta", label: "BETA" }),
    ]);
    expect(manager.capabilities.sessionArchives).toBe(true);
    expect(manager.capabilities.sessionHistory).toBe(false);

    manager.setActiveProvider("beta");

    expect(manager.providerId).toBe("beta");
    expect(manager.capabilities.sessionHistory).toBe(true);
    expect(manager.capabilities.sessionArchives).toBe(false);

    await manager.request("health.ping");
    const currentBackend = manager.currentProvider.backend as StubBackend;
    expect(currentBackend.requestSpy).toHaveBeenCalledWith("health.ping", undefined);
  });
});
