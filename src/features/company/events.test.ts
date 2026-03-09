import { describe, expect, it } from "vitest";
import { createCompanyEvent, projectCompanyCommunicationFromEvents } from "./events";
import type { Company } from "./types";

function createCompany(): Company {
  return {
    id: "live-co",
    name: "Live Co",
    description: "Company event replay test",
    icon: "🏢",
    template: "blank",
    employees: [
      {
        agentId: "live-co-ceo",
        nickname: "CEO",
        role: "Chief Executive Officer",
        isMeta: true,
        metaRole: "ceo",
      },
      {
        agentId: "live-co-cto",
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

describe("projectCompanyCommunicationFromEvents", () => {
  it("rebuilds dispatch, request, and handoff state from durable events", () => {
    const company = createCompany();
    const dispatchId = "dispatch:123";
    const events = [
      createCompanyEvent({
        eventId: "event-1",
        companyId: company.id,
        kind: "dispatch_sent",
        dispatchId,
        workItemId: "work:123",
        topicKey: "topic:architecture",
        fromActorId: "live-co-ceo",
        targetActorId: "live-co-cto",
        sessionKey: "agent:live-co-cto:main",
        createdAt: 100,
        payload: {
          title: "Deliver architecture update",
          message: "Please draft the architecture update.",
          handoff: true,
        },
      }),
      createCompanyEvent({
        eventId: "event-2",
        companyId: company.id,
        kind: "report_answered",
        dispatchId,
        workItemId: "work:123",
        topicKey: "topic:architecture",
        fromActorId: "live-co-cto",
        targetActorId: "live-co-ceo",
        createdAt: 200,
        payload: {
          summary: "Architecture update is complete.",
          resolution: "complete",
          requiredItems: ["deck", "tradeoff-table"],
        },
      }),
    ];

    const projected = projectCompanyCommunicationFromEvents({
      company,
      events,
    });

    expect(projected.coveredSessionKeys.has("agent:live-co-cto:main")).toBe(true);
    expect(projected.dispatches).toHaveLength(1);
    expect(projected.dispatches[0]).toMatchObject({
      id: dispatchId,
      status: "answered",
      title: "Deliver architecture update",
      summary: "Please draft the architecture update.",
      fromActorId: "live-co-ceo",
      targetActorIds: ["live-co-cto"],
      syncSource: "event",
      responseMessageId: "event-2",
    });

    expect(projected.requests).toHaveLength(1);
    expect(projected.requests[0]).toMatchObject({
      id: "handoff:dispatch:123:request",
      status: "answered",
      resolution: "complete",
      responseSummary: "Architecture update is complete.",
      requiredItems: ["deck", "tradeoff-table"],
      syncSource: "event",
    });

    expect(projected.handoffs).toHaveLength(1);
    expect(projected.handoffs[0]).toMatchObject({
      id: "handoff:dispatch:123",
      status: "completed",
      fromAgentId: "live-co-ceo",
      toAgentIds: ["live-co-cto"],
      syncSource: "event",
    });
  });
});
