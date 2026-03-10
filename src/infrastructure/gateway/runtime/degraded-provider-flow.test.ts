import { describe, expect, it, vi } from "vitest";
import type { Company } from "../../../domain";
import { appendRequirementRoomMessages, buildRequirementRoomRecord } from "../../../application/delegation/room-routing";
import { buildProviderManifest } from "./bootstrap";
import { sendTurnToCompanyActor } from "./runtime";
import {
  createBackendCapabilities,
  type ActorRef,
  type BackendCore,
  type ConversationKind,
  type ConversationRef,
} from "./types";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "小说创作工作室",
    description: "测试公司",
    icon: "🦞",
    template: "novel",
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "首席执行官", isMeta: true, metaRole: "ceo" },
      { agentId: "co-emp-1", nickname: "写手", role: "主笔写手", isMeta: false },
      { agentId: "co-emp-2", nickname: "审校", role: "审校", isMeta: false },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createSingleExecutorCore(providerId = "codex-like"): BackendCore {
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

describe("degraded provider flow", () => {
  it("runs a work item through product room + virtual actor on a single executor provider", async () => {
    const company = createCompany();
    const backend = createSingleExecutorCore();
    const manifest = buildProviderManifest({
      providerId: backend.providerId,
      capabilities: createBackendCapabilities(),
    });

    expect(manifest.actorStrategy).toBe("single-executor");
    expect(manifest.roomStrategy).toBe("product-room");
    expect(manifest.archiveStrategy).toBe("product-archives");
    expect(manifest.storageStrategy).toBe("product-store");

    const room = buildRequirementRoomRecord({
      companyId: company.id,
      workItemId: "mission:rewrite-ch02",
      sessionKey: "room:workitem:mission:rewrite-ch02",
      title: "重新完成第 2 章",
      memberIds: ["co-ceo", "co-emp-1", "co-emp-2"],
      ownerAgentId: "co-ceo",
      topicKey: "mission:rewrite-ch02",
      transcript: [],
      createdAt: 1_000,
      updatedAt: 1_000,
    });

    const dispatch = await sendTurnToCompanyActor({
      backend,
      manifest,
      company,
      actorId: "co-emp-1",
      message: "请重写第二章，并在完成后只回复一句：已交付新版正文。",
      targetActorIds: ["co-emp-1"],
    });

    expect(dispatch.conversationRef.conversationId).toBe("virtual:co-emp-1:direct");
    expect(dispatch.providerConversationRef.conversationId).toBe("executor:direct");
    expect(backend.sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "executor:direct" }),
      expect.stringContaining("你当前扮演 写手"),
      expect.objectContaining({ targetActorIds: ["co-emp-1"] }),
    );

    const nextRoom = appendRequirementRoomMessages({
      room,
      messages: [
        {
          id: "local:user:1",
          roomId: room.id,
          role: "user",
          text: "@写手 请重写第二章，并完成后回传。",
          timestamp: 1_100,
          visibility: "public",
          source: "owner_dispatch",
          targetActorIds: ["co-emp-1"],
          audienceAgentIds: ["co-emp-1"],
          sourceSessionKey: room.sessionKey,
        },
        {
          id: "reply:writer:1",
          roomId: room.id,
          role: "assistant",
          text: "已交付新版正文。",
          timestamp: 1_300,
          visibility: "public",
          source: "member_reply",
          senderAgentId: "co-emp-1",
          senderLabel: "写手",
          senderRole: "主笔写手",
          sourceSessionKey: "virtual:co-emp-1:direct",
        },
      ],
    });

    expect(nextRoom.id).toBe("workitem:mission:rewrite-ch02");
    expect(nextRoom.transcript).toHaveLength(2);
    expect(nextRoom.transcript[1]?.senderAgentId).toBe("co-emp-1");
    expect(nextRoom.transcript[1]?.text).toContain("已交付新版正文");
  });
});
