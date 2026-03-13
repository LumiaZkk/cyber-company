import { describe, expect, it } from "vitest";
import {
  createCompanyEvent,
  projectCompanyCommunicationFromEvents,
} from "../../domain/delegation/events";
import type { Company } from "../org/types";

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
      deliveryState: "answered",
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
      dispatchId,
      status: "answered",
      deliveryState: "answered",
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

  it("allows answered reports to arrive without a prior acknowledged report", () => {
    const company = createCompany();
    const dispatchId = "dispatch:answer-first";
    const projected = projectCompanyCommunicationFromEvents({
      company,
      events: [
        createCompanyEvent({
          eventId: "event-1",
          companyId: company.id,
          kind: "dispatch_enqueued",
          dispatchId,
          workItemId: "work:answer-first",
          topicKey: "topic:answer-first",
          fromActorId: "live-co-ceo",
          targetActorId: "live-co-cto",
          sessionKey: "agent:live-co-cto:main",
          createdAt: 100,
          payload: {
            title: "Prepare delivery",
            message: "Please prepare the delivery and report back.",
            handoff: true,
          },
        }),
        createCompanyEvent({
          eventId: "event-2",
          companyId: company.id,
          kind: "report_answered",
          dispatchId,
          workItemId: "work:answer-first",
          topicKey: "topic:answer-first",
          fromActorId: "live-co-cto",
          targetActorId: "live-co-ceo",
          createdAt: 200,
          payload: {
            summary: "Delivery is complete.",
            resolution: "complete",
          },
        }),
      ],
    });

    expect(projected.dispatches).toMatchObject([
      {
        id: dispatchId,
        status: "answered",
        deliveryState: "answered",
      },
    ]);
    expect(projected.requests).toMatchObject([
      {
        id: "handoff:dispatch:answer-first:request",
        status: "answered",
        deliveryState: "answered",
        resolution: "complete",
        responseSummary: "Delivery is complete.",
      },
    ]);
  });

  it("tracks sent-but-not-yet-answered dispatches as pending requests", () => {
    const company = createCompany();
    const projected = projectCompanyCommunicationFromEvents({
      company,
      events: [
        createCompanyEvent({
          eventId: "event-1",
          companyId: company.id,
          kind: "dispatch_sent",
          dispatchId: "dispatch:pending",
          workItemId: "work:pending",
          topicKey: "topic:pending",
          fromActorId: "live-co-ceo",
          targetActorId: "live-co-cto",
          sessionKey: "agent:live-co-cto:main",
          createdAt: 100,
          payload: {
            title: "Draft proposal",
            message: "Please draft the proposal.",
            handoff: true,
          },
        }),
      ],
    });

    expect(projected.requests).toMatchObject([
      {
        id: "handoff:dispatch:pending:request",
        status: "pending",
        deliveryState: "sent",
        transport: "company_report",
      },
    ]);
  });

  it("keeps timed-out transport confirmations pending until a later report arrives", () => {
    const company = createCompany();
    const dispatchId = "dispatch:unconfirmed";
    const projected = projectCompanyCommunicationFromEvents({
      company,
      events: [
        createCompanyEvent({
          eventId: "event-1",
          companyId: company.id,
          kind: "dispatch_enqueued",
          dispatchId,
          workItemId: "work:unconfirmed",
          topicKey: "topic:unconfirmed",
          fromActorId: "live-co-ceo",
          targetActorId: "live-co-cto",
          sessionKey: "agent:live-co-cto:main",
          createdAt: 100,
          payload: {
            title: "Long-running job",
            message: "Start the long-running job.",
            handoff: true,
          },
        }),
        createCompanyEvent({
          eventId: "event-2",
          companyId: company.id,
          kind: "dispatch_unconfirmed",
          dispatchId,
          workItemId: "work:unconfirmed",
          topicKey: "topic:unconfirmed",
          fromActorId: "live-co-ceo",
          targetActorId: "live-co-cto",
          sessionKey: "agent:live-co-cto:main",
          createdAt: 30_100,
          payload: {
            title: "Long-running job",
            message: "Start the long-running job.",
            handoff: true,
          },
        }),
        createCompanyEvent({
          eventId: "event-3",
          companyId: company.id,
          kind: "report_answered",
          dispatchId,
          workItemId: "work:unconfirmed",
          topicKey: "topic:unconfirmed",
          fromActorId: "live-co-cto",
          targetActorId: "live-co-ceo",
          createdAt: 10 * 60_000,
          payload: {
            summary: "The long-running job finished successfully.",
            resolution: "complete",
          },
        }),
      ],
    });

    expect(projected.dispatches).toMatchObject([
      {
        id: dispatchId,
        status: "answered",
        deliveryState: "answered",
      },
    ]);
    expect(projected.requests).toMatchObject([
      {
        id: "handoff:dispatch:unconfirmed:request",
        status: "answered",
        deliveryState: "answered",
        responseSummary: "The long-running job finished successfully.",
      },
    ]);
  });

  it("supersedes older open dispatches when a manual retry creates a newer dispatch for the same target", () => {
    const company = createCompany();
    const projected = projectCompanyCommunicationFromEvents({
      company,
      events: [
        createCompanyEvent({
          eventId: "event-1",
          companyId: company.id,
          kind: "dispatch_enqueued",
          dispatchId: "dispatch:retry:1",
          workItemId: "work:retry",
          topicKey: "topic:retry",
          fromActorId: "live-co-ceo",
          targetActorId: "live-co-cto",
          sessionKey: "agent:live-co-cto:main",
          createdAt: 100,
          payload: {
            title: "Retryable task",
            message: "Please handle this task.",
            handoff: true,
          },
        }),
        createCompanyEvent({
          eventId: "event-2",
          companyId: company.id,
          kind: "dispatch_enqueued",
          dispatchId: "dispatch:retry:2",
          workItemId: "work:retry",
          topicKey: "topic:retry",
          fromActorId: "live-co-ceo",
          targetActorId: "live-co-cto",
          sessionKey: "agent:live-co-cto:main",
          createdAt: 400,
          payload: {
            title: "Retryable task",
            message: "Please handle this task.",
            handoff: true,
          },
        }),
      ],
    });

    const dispatchById = new Map(projected.dispatches.map((dispatch) => [dispatch.id, dispatch] as const));
    expect(dispatchById.get("dispatch:retry:2")).toMatchObject({
      id: "dispatch:retry:2",
      status: "pending",
    });
    expect(dispatchById.get("dispatch:retry:1")).toMatchObject({
      id: "dispatch:retry:1",
      status: "superseded",
    });
  });

  it("ignores non-delegation audit events when rebuilding delegation state", () => {
    const company = createCompany();
    const dispatchId = "dispatch:decision-audit";
    const projected = projectCompanyCommunicationFromEvents({
      company,
      events: [
        createCompanyEvent({
          eventId: "event-1",
          companyId: company.id,
          kind: "dispatch_sent",
          dispatchId,
          workItemId: "work:decision-audit",
          topicKey: "topic:decision-audit",
          fromActorId: "live-co-ceo",
          targetActorId: "live-co-cto",
          sessionKey: "agent:live-co-cto:main",
          createdAt: 100,
          payload: {
            title: "Draft the plan",
            message: "Please draft the rollout plan.",
            handoff: true,
          },
        }),
        createCompanyEvent({
          eventId: "event-2",
          companyId: company.id,
          kind: "decision_record_upserted",
          workItemId: "work:decision-audit",
          fromActorId: "live-co-ceo",
          targetActorId: "live-co-ceo",
          createdAt: 145,
          payload: {
            ticketId: "decision:launch-plan",
            decisionType: "requirement_gate",
            status: "pending_human",
            revision: 1,
          },
        }),
        createCompanyEvent({
          eventId: "event-3",
          companyId: company.id,
          kind: "decision_resolved",
          workItemId: "work:decision-audit",
          fromActorId: "live-co-ceo",
          targetActorId: "live-co-ceo",
          createdAt: 150,
          payload: {
            ticketId: "decision:launch-plan",
            decisionType: "requirement_gate",
            status: "resolved",
            resolution: "批准推进",
            resolutionOptionId: "confirm",
            revision: 2,
          },
        }),
        createCompanyEvent({
          eventId: "event-4",
          companyId: company.id,
          kind: "dispatch_record_upserted",
          dispatchId,
          workItemId: "work:decision-audit",
          topicKey: "topic:decision-audit",
          fromActorId: "live-co-ceo",
          targetActorId: "live-co-cto",
          createdAt: 160,
          payload: {
            title: "Draft the plan",
            status: "pending",
            revision: 2,
          },
        }),
        createCompanyEvent({
          eventId: "event-5",
          companyId: company.id,
          kind: "runtime_repaired",
          fromActorId: "system:authority-repair",
          createdAt: 170,
          payload: {
            storedRuntimeExisted: true,
            reconciledChanged: true,
            dispatchCount: 1,
          },
        }),
        createCompanyEvent({
          eventId: "event-6",
          companyId: company.id,
          kind: "operator_action_recorded",
          fromActorId: "operator:local-user",
          createdAt: 172,
          payload: {
            action: "communication_recovery",
            surface: "chat",
            outcome: "succeeded",
            requestsAdded: 1,
            requestsUpdated: 0,
            tasksRecovered: 0,
            handoffsRecovered: 1,
          },
        }),
        createCompanyEvent({
          eventId: "event-7",
          companyId: company.id,
          kind: "room_record_upserted",
          workItemId: "work:decision-audit",
          roomId: "room:decision-audit",
          fromActorId: "live-co-ceo",
          createdAt: 175,
          payload: {
            title: "Mission room",
            status: "active",
            transcriptCount: 2,
            revision: 3,
          },
        }),
        createCompanyEvent({
          eventId: "event-8",
          companyId: company.id,
          kind: "room_bindings_upserted",
          roomId: "room:decision-audit",
          fromActorId: "system:room-bindings",
          createdAt: 180,
          payload: {
            bindingCount: 1,
            roomIds: ["room:decision-audit"],
            providerIds: ["openclaw"],
          },
        }),
        createCompanyEvent({
          eventId: "event-9",
          companyId: company.id,
          kind: "artifact_record_upserted",
          workItemId: "work:decision-audit",
          fromActorId: "live-co-cto",
          createdAt: 185,
          payload: {
            artifactId: "artifact:plan",
            title: "Rollout plan",
            status: "ready",
            revision: 2,
          },
        }),
        createCompanyEvent({
          eventId: "event-10",
          companyId: company.id,
          kind: "artifact_mirror_synced",
          fromActorId: "system:artifact-mirror",
          createdAt: 190,
          payload: {
            mirrorPrefix: "workspace:",
            artifactCount: 1,
          },
        }),
        createCompanyEvent({
          eventId: "event-11",
          companyId: company.id,
          kind: "support_request_record_deleted",
          workItemId: "work:decision-audit",
          fromActorId: "system:company-ops-engine",
          createdAt: 195,
          payload: {
            requestId: "support:work:decision-audit:dep-cto",
            status: "cancelled",
          },
        }),
        createCompanyEvent({
          eventId: "event-12",
          companyId: company.id,
          kind: "escalation_record_deleted",
          workItemId: "work:decision-audit",
          fromActorId: "system:company-ops-engine",
          createdAt: 197,
          payload: {
            escalationId: "escalation:work:decision-audit",
            status: "resolved",
          },
        }),
        createCompanyEvent({
          eventId: "event-13",
          companyId: company.id,
          kind: "report_answered",
          dispatchId,
          workItemId: "work:decision-audit",
          topicKey: "topic:decision-audit",
          fromActorId: "live-co-cto",
          targetActorId: "live-co-ceo",
          createdAt: 200,
          payload: {
            summary: "Rollout plan is ready.",
            resolution: "complete",
          },
        }),
      ],
    });

    expect(projected.dispatches).toMatchObject([
      {
        id: dispatchId,
        status: "answered",
        deliveryState: "answered",
      },
    ]);
    expect(projected.requests).toMatchObject([
      {
        id: "handoff:dispatch:decision-audit:request",
        status: "answered",
        resolution: "complete",
      },
    ]);
  });
});
