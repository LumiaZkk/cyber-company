import { describe, expect, it } from "vitest";
import {
  buildRoomConversationBindingKey,
  mergeRoomConversationBindings,
} from "./room-records";
import type { RoomConversationBindingRecord } from "../../domain/delegation/types";

function createBinding(
  overrides: Partial<RoomConversationBindingRecord> = {},
): RoomConversationBindingRecord {
  return {
    roomId: "room:alpha",
    providerId: "authority",
    conversationId: "agent:co-cto:main",
    actorId: "co-cto",
    nativeRoom: false,
    updatedAt: 1_000,
    ...overrides,
  };
}

describe("room conversation bindings", () => {
  it("keeps provider and actor in the composite binding key", () => {
    const authorityBinding = createBinding();
    const fallbackBinding = createBinding({
      providerId: "runtime-fallback",
    });
    const delegateBinding = createBinding({
      actorId: "co-ceo",
    });

    expect(buildRoomConversationBindingKey(authorityBinding)).not.toBe(
      buildRoomConversationBindingKey(fallbackBinding),
    );
    expect(buildRoomConversationBindingKey(authorityBinding)).not.toBe(
      buildRoomConversationBindingKey(delegateBinding),
    );
  });

  it("merges only exact binding identities and keeps distinct provider bindings", () => {
    const merged = mergeRoomConversationBindings({
      existing: [
        createBinding({
          providerId: "authority",
          updatedAt: 1_000,
        }),
      ],
      incoming: [
        createBinding({
          providerId: "runtime-fallback",
          updatedAt: 1_200,
        }),
        createBinding({
          providerId: "authority",
          nativeRoom: true,
          updatedAt: 1_500,
        }),
      ],
    });

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      providerId: "authority",
      nativeRoom: true,
      updatedAt: 1_500,
    });
    expect(merged[1]).toMatchObject({
      providerId: "runtime-fallback",
      nativeRoom: false,
      updatedAt: 1_200,
    });
  });
});
