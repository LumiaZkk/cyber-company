import { describe, expect, it } from "vitest";

import {
  buildDispatchCheckoutUpdate,
  describeDispatchCheckout,
  normalizeDispatchCheckout,
} from "./dispatch-checkout";
import type { DispatchRecord } from "./types";

function createDispatch(overrides: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    id: "dispatch:work-1",
    workItemId: "work-1",
    title: "需求团队派单 · CTO",
    summary: "请 CTO 接住当前步骤。",
    fromActorId: "ceo",
    targetActorIds: ["cto"],
    status: "pending",
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe("dispatch checkout", () => {
  it("normalizes acknowledged dispatches into claimed execution ownership", () => {
    const checkout = normalizeDispatchCheckout(
      createDispatch({
        status: "acknowledged",
        updatedAt: 200,
      }),
    );

    expect(checkout).toMatchObject({
      checkoutState: "claimed",
      checkoutActorId: "cto",
      checkoutSessionKey: "agent:cto:main",
      checkedOutAt: 200,
      releasedAt: null,
      releaseReason: null,
    });
  });

  it("builds a release patch for answered dispatches", () => {
    const patch = buildDispatchCheckoutUpdate({
      existing: createDispatch({
        status: "acknowledged",
        checkoutState: "claimed",
        checkoutActorId: "cto",
        checkoutSessionKey: "agent:cto:main",
        checkedOutAt: 150,
        updatedAt: 150,
      }),
      nextStatus: "answered",
      timestamp: 220,
      actorId: "cto",
      sessionKey: "agent:cto:main",
      targetActorIds: ["cto"],
    });

    expect(patch).toMatchObject({
      checkoutState: "released",
      checkoutActorId: "cto",
      checkoutSessionKey: "agent:cto:main",
      checkedOutAt: 150,
      releasedAt: 220,
      releaseReason: "answered",
    });
  });

  it("describes the current execution owner in user-facing language", () => {
    const summary = describeDispatchCheckout({
      dispatch: createDispatch({
        status: "acknowledged",
        updatedAt: 300,
      }),
      resolveActorLabel: (actorId) => (actorId === "cto" ? "CTO" : actorId ?? "成员"),
    });

    expect(summary).toMatchObject({
      checkoutState: "claimed",
      stateLabel: "执行中",
      tone: "info",
    });
    expect(summary.detail).toContain("CTO 已接手");
  });
});
