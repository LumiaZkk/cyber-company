import { describe, expect, it } from "vitest";
import { createCompanyEvent } from "../../../src/domain/delegation/events";
import type { Company } from "../../../src/domain/org/types";
import { repairAgentSessionsFromDispatches, reconcileDispatchesFromCompanyEvents, resolveSessionStatusCapabilityState } from "./runtime-authority";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "Cyber Company",
    description: "authority runtime authority tests",
    icon: "🏢",
    template: "blank",
    employees: [
      {
        agentId: "ceo",
        nickname: "CEO",
        role: "Chief Executive Officer",
        isMeta: true,
        metaRole: "ceo",
      },
      {
        agentId: "cto",
        nickname: "CTO",
        role: "Chief Technology Officer",
        isMeta: true,
        metaRole: "cto",
      },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

describe("runtime-authority", () => {
  it("marks session_status capability unsupported when the executor reports an unknown method", () => {
    expect(
      resolveSessionStatusCapabilityState({
        current: "unknown",
        outcome: "error",
        error: new Error("unknown method: session_status"),
      }),
    ).toBe("unsupported");
  });

  it("replays durable company events into the dispatch table", () => {
    const nextDispatches = reconcileDispatchesFromCompanyEvents({
      company: createCompany(),
      existingDispatches: [],
      events: [
        createCompanyEvent({
          eventId: "dispatch-1",
          companyId: "company-1",
          kind: "dispatch_sent",
          dispatchId: "dispatch:cto",
          workItemId: "work:cto",
          topicKey: "topic:cto",
          roomId: "workitem:cto",
          fromActorId: "ceo",
          targetActorId: "cto",
          sessionKey: "agent:cto:main",
          createdAt: 100,
          payload: {
            title: "Continue implementation",
            message: "Please continue implementation and report back.",
          },
        }),
        createCompanyEvent({
          eventId: "report-1",
          companyId: "company-1",
          kind: "report_answered",
          dispatchId: "dispatch:cto",
          workItemId: "work:cto",
          topicKey: "topic:cto",
          roomId: "workitem:cto",
          fromActorId: "cto",
          targetActorId: "ceo",
          createdAt: 200,
          payload: {
            summary: "Implementation completed.",
            resolution: "complete",
          },
        }),
      ],
    });

    expect(nextDispatches).toMatchObject([
      {
        id: "dispatch:cto",
        status: "answered",
        deliveryState: "answered",
        targetActorIds: ["cto"],
        checkoutState: "released",
        checkoutActorId: "cto",
        checkoutSessionKey: "agent:cto:main",
        releaseReason: "answered",
      },
    ]);
  });

  it("recovers errored sessions after a later answered dispatch closes the loop", () => {
    const repaired = repairAgentSessionsFromDispatches({
      sessions: [
        {
          sessionKey: "agent:cto:main",
          agentId: "cto",
          providerId: "openclaw",
          sessionState: "error",
          lastSeenAt: 100,
          lastStatusSyncAt: null,
          lastMessageAt: 100,
          abortedLastRun: false,
          lastError: "rate limit",
          lastTerminalRunState: "error",
          lastTerminalSummary: "rate limit",
          source: "lifecycle",
        },
      ],
      runs: [],
      dispatches: [
        {
          id: "dispatch:cto",
          workItemId: "work:cto",
          revision: 1,
          roomId: "workitem:cto",
          title: "Continue implementation",
          summary: "Please continue implementation and report back.",
          fromActorId: "ceo",
          targetActorIds: ["cto"],
          status: "answered",
          deliveryState: "answered",
          createdAt: 100,
          updatedAt: 200,
        },
      ],
    });

    expect(repaired[0]).toMatchObject({
      sessionState: "idle",
      abortedLastRun: false,
      lastError: null,
      lastTerminalRunState: "completed",
      executionContext: {
        dispatchId: "dispatch:cto",
        checkoutState: "released",
        releaseReason: "answered",
      },
      source: "fallback",
    });
  });

  it("rebuilds claimed execution context onto sessions even when runtime is otherwise idle", () => {
    const repaired = repairAgentSessionsFromDispatches({
      sessions: [
        {
          sessionKey: "agent:cto:main",
          agentId: "cto",
          providerId: "openclaw",
          sessionState: "idle",
          lastSeenAt: 180,
          lastStatusSyncAt: 180,
          lastMessageAt: 180,
          abortedLastRun: false,
          lastError: null,
          source: "session_status",
        },
      ],
      runs: [],
      dispatches: [
        {
          id: "dispatch-claimed",
          workItemId: "work-claimed",
          revision: 1,
          roomId: "workitem:claimed",
          title: "继续实现恢复基线",
          summary: "把 session 恢复上下文写回 authority runtime。",
          fromActorId: "ceo",
          targetActorIds: ["cto"],
          status: "acknowledged",
          checkoutState: "claimed",
          checkoutActorId: "cto",
          checkoutSessionKey: "agent:cto:main",
          checkedOutAt: 170,
          createdAt: 150,
          updatedAt: 170,
        },
      ],
    });

    expect(repaired[0]).toMatchObject({
      sessionState: "idle",
      executionContext: {
        dispatchId: "dispatch-claimed",
        assignment: "继续实现恢复基线",
        objective: "把 session 恢复上下文写回 authority runtime。",
        checkoutState: "claimed",
        actorId: "cto",
      },
    });
  });
});
