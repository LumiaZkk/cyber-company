import { describe, expect, it, vi } from "vitest";
import type { Company } from "../company/types";
import { buildProviderManifest } from "./bootstrap";
import { resolveCompanyActorConversation, sendTurnToCompanyActor } from "./runtime";
import { createBackendCapabilities, type ActorRef, type BackendCore, type ConversationRef } from "./types";

function createCompany(): Company {
  return {
    id: "co",
    name: "小说公司",
    description: "测试",
    icon: "📚",
    template: "novel",
    employees: [
      {
        agentId: "co-ceo",
        nickname: "CEO",
        role: "首席执行官",
        isMeta: true,
        metaRole: "ceo",
      },
      {
        agentId: "co-cto",
        nickname: "CTO",
        role: "首席技术官",
        isMeta: true,
        metaRole: "cto",
      },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createCore(providerId = "minimal"): BackendCore {
  return {
    providerId,
    isConnected: true,
    capabilities: createBackendCapabilities({ sessionHistory: true }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    probeCapabilities: vi.fn(async () => createBackendCapabilities({ sessionHistory: true })),
    listActors: vi.fn(async (): Promise<ActorRef[]> => [
      { providerId, actorId: "executor", label: "Executor" },
    ]),
    ensureConversation: vi.fn(
      async (actorRef: ActorRef, kind = "direct"): Promise<ConversationRef> => ({
        providerId,
        conversationId: `${actorRef.actorId}:${kind}`,
        actorId: actorRef.actorId,
        kind,
        native: !actorRef.virtual,
        sourceKey: actorRef.actorId,
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

describe("backend runtime helpers", () => {
  it("keeps native providers on direct actor conversations", async () => {
    const core = createCore("openclaw");
    const manifest = buildProviderManifest({
      providerId: "openclaw",
      capabilities: createBackendCapabilities({
        sessionHistory: true,
        skillsStatus: true,
      }),
    });

    const resolved = await resolveCompanyActorConversation({
      backend: core,
      manifest,
      company: createCompany(),
      actorId: "co-cto",
    });

    expect(resolved.actorRef.virtual).toBeUndefined();
    expect(resolved.conversationRef.conversationId).toBe("co-cto:direct");
  });

  it("routes weak providers through virtual actor prompts", async () => {
    const core = createCore("minimal");
    const manifest = buildProviderManifest({
      providerId: "minimal",
      capabilities: createBackendCapabilities({ sessionHistory: true }),
    });

    const result = await sendTurnToCompanyActor({
      backend: core,
      manifest,
      company: createCompany(),
      actorId: "co-cto",
      message: "请输出一致性技术方案",
      targetActorIds: ["co-ceo"],
    });

    expect(result.conversationRef.conversationId).toBe("virtual:co-cto:direct");
    expect(result.providerConversationRef.conversationId).toBe("executor:direct");
    expect(core.sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "executor:direct" }),
      expect.stringContaining("你当前扮演 CTO"),
      expect.objectContaining({ targetActorIds: ["co-ceo"] }),
    );
  });
});

