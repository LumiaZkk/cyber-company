import { describe, expect, it } from "vitest";
import { buildProviderManifest } from "./bootstrap";
import { createBackendCapabilities } from "./types";
import {
  buildVirtualActorDispatchPrompt,
  buildVirtualActorProfiles,
  buildVirtualConversationRef,
  providerNeedsVirtualActors,
  toVirtualActorRef,
} from "./virtual-actor";

describe("virtual actor runtime helpers", () => {
  it("builds stable virtual actor profiles for company employees", () => {
    const profiles = buildVirtualActorProfiles({
      providerId: "minimal",
      executorActorId: "executor",
      employees: [
        { agentId: "co-ceo", nickname: "CEO", role: "首席执行官", isMeta: true, departmentId: "mgmt" },
        { agentId: "co-cto", nickname: "CTO", role: "首席技术官", isMeta: true, departmentId: "mgmt" },
      ],
    });

    expect(profiles).toHaveLength(2);
    expect(profiles[0]?.memoryNamespace).toBe("virtual:co-ceo");
    expect(profiles[1]?.backingActorId).toBe("executor");

    const actorRef = toVirtualActorRef({
      providerId: "minimal",
      profile: profiles[0]!,
    });
    expect(actorRef.virtual).toBe(true);

    const conversation = buildVirtualConversationRef({
      providerId: "minimal",
      profile: profiles[0]!,
    });
    expect(conversation.conversationId).toBe("virtual:co-ceo:direct");

    const prompt = buildVirtualActorDispatchPrompt({
      profile: profiles[1]!,
      message: "请输出技术方案",
      targetActorIds: ["co-coo"],
    });
    expect(prompt).toContain("首席技术官");
    expect(prompt).toContain("co-coo");
  });

  it("marks weak providers as virtual-actor driven", () => {
    const manifest = buildProviderManifest({
      providerId: "minimal",
      capabilities: createBackendCapabilities({ sessionHistory: true }),
    });
    expect(providerNeedsVirtualActors(manifest)).toBe(true);
  });
});
