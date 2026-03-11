import { describe, expect, it } from "vitest";

import type { RequestRecord } from "../../domain/delegation/types";
import type { CompanyEvent } from "../../domain/delegation/events";
import { buildRecoveredReportEvents } from "./report-event";

function createRequest(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: "handoff:dispatch:work-item-1:request",
    sessionKey: "agent:on-58c5a4-cto:main",
    topicKey: "novel-project",
    taskId: "work-item-1",
    handoffId: "handoff:dispatch:work-item-1",
    fromAgentId: "on-58c5a4-ceo",
    toAgentIds: ["on-58c5a4-cto"],
    title: "调研番茄平台技术可行性",
    summary: "请给出技术可行性判断和初步方案建议。",
    status: "answered",
    resolution: "complete",
    responseSummary: "已完成完整技术方案调研。",
    responseDetails: "# 技术方案\n\n这里是完整报告。",
    sourceMessageTs: 1_000,
    responseMessageTs: 2_000,
    transport: "company_report",
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

describe("buildRecoveredReportEvents", () => {
  it("materializes a deterministic report event from a recovered answered request", () => {
    const request = createRequest();

    const events = buildRecoveredReportEvents({
      companyId: "company-1",
      existingEvents: [],
      recoveredRequests: [
        {
          agentId: "on-58c5a4-cto",
          sessionKey: "agent:on-58c5a4-cto:main",
          request,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventId: "report:dispatch:work-item-1:answered:on-58c5a4-cto:2000",
      companyId: "company-1",
      kind: "report_answered",
      dispatchId: "dispatch:work-item-1",
      workItemId: "work-item-1",
      topicKey: "novel-project",
      fromActorId: "on-58c5a4-cto",
      targetActorId: "on-58c5a4-ceo",
      sessionKey: "agent:on-58c5a4-cto:main",
      createdAt: 2_000,
      payload: {
        title: "调研番茄平台技术可行性",
        summary: "已完成完整技术方案调研。",
        details: "# 技术方案\n\n这里是完整报告。",
        resolution: "complete",
        transport: "company_report",
        sourceMessageTs: 1_000,
        responseMessageTs: 2_000,
      },
    });
  });

  it("skips non-dispatch requests and already materialized events", () => {
    const existingEvent: CompanyEvent = {
      eventId: "report:dispatch:work-item-1:answered:on-58c5a4-cto:2000",
      companyId: "company-1",
      kind: "report_answered",
      dispatchId: "dispatch:work-item-1",
      fromActorId: "on-58c5a4-cto",
      targetActorId: "on-58c5a4-ceo",
      createdAt: 2_000,
      payload: {},
    };

    const events = buildRecoveredReportEvents({
      companyId: "company-1",
      existingEvents: [existingEvent],
      recoveredRequests: [
        {
          agentId: "on-58c5a4-cto",
          sessionKey: "agent:on-58c5a4-cto:main",
          request: createRequest(),
        },
        {
          agentId: "on-58c5a4-coo",
          sessionKey: "agent:on-58c5a4-coo:main",
          request: createRequest({
            id: "handoff:history:ops-plan:request",
            handoffId: "handoff:history:ops-plan",
            status: "blocked",
            responseMessageTs: 3_000,
            updatedAt: 3_000,
          }),
        },
        {
          agentId: "on-58c5a4-hr",
          sessionKey: "agent:on-58c5a4-hr:main",
          request: createRequest({
            id: "handoff:dispatch:work-item-2:request",
            handoffId: "handoff:dispatch:work-item-2",
            status: "pending",
            responseSummary: undefined,
            responseDetails: undefined,
            responseMessageTs: undefined,
            updatedAt: 4_000,
          }),
        },
      ],
    });

    expect(events).toEqual([]);
  });
});
