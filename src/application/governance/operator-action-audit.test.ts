import { describe, expect, it } from "vitest";
import { buildOperatorActionAuditEvent } from "./operator-action-audit";

describe("buildOperatorActionAuditEvent", () => {
  it("builds a structured operator recovery audit event", () => {
    const event = buildOperatorActionAuditEvent({
      companyId: "company-1",
      action: "communication_recovery",
      surface: "chat",
      outcome: "succeeded",
      force: true,
      requestsAdded: 2,
      requestsUpdated: 3,
      tasksRecovered: 1,
      handoffsRecovered: 4,
      timestamp: 9_000,
    });

    expect(event).toMatchObject({
      companyId: "company-1",
      kind: "operator_action_recorded",
      fromActorId: "operator:local-user",
      createdAt: 9_000,
      payload: {
        action: "communication_recovery",
        surface: "chat",
        outcome: "succeeded",
        force: true,
        requestsAdded: 2,
        requestsUpdated: 3,
        tasksRecovered: 1,
        handoffsRecovered: 4,
        error: null,
      },
    });
  });

  it("captures failure details for operator recovery attempts", () => {
    const event = buildOperatorActionAuditEvent({
      companyId: "company-1",
      action: "communication_recovery",
      surface: "board",
      outcome: "failed",
      error: "Network timeout",
    });

    expect(event.payload).toMatchObject({
      action: "communication_recovery",
      surface: "board",
      outcome: "failed",
      force: false,
      error: "Network timeout",
    });
  });

  it("allows structured details for dispatched focus actions", () => {
    const event = buildOperatorActionAuditEvent({
      companyId: "company-1",
      action: "focus_action_dispatch",
      surface: "chat",
      outcome: "succeeded",
      details: {
        focusActionId: "retry-request:co-cto:req-1",
        focusActionKind: "message",
        label: "重新派单给 CTO",
        targetActorId: "co-cto",
        dispatchId: "dispatch:retry:1",
      },
    });

    expect(event.payload).toMatchObject({
      action: "focus_action_dispatch",
      surface: "chat",
      outcome: "succeeded",
      focusActionId: "retry-request:co-cto:req-1",
      focusActionKind: "message",
      label: "重新派单给 CTO",
      targetActorId: "co-cto",
      dispatchId: "dispatch:retry:1",
    });
  });

  it("captures manual takeover pack copy details", () => {
    const event = buildOperatorActionAuditEvent({
      companyId: "company-1",
      action: "takeover_pack_copy",
      surface: "chat",
      outcome: "succeeded",
      details: {
        noteLength: 128,
        hasTakeoverPack: true,
      },
    });

    expect(event.payload).toMatchObject({
      action: "takeover_pack_copy",
      surface: "chat",
      outcome: "succeeded",
      noteLength: 128,
      hasTakeoverPack: true,
    });
  });

  it("captures lobby group chat routing intent", () => {
    const event = buildOperatorActionAuditEvent({
      companyId: "company-1",
      action: "group_chat_route_open",
      surface: "lobby",
      outcome: "succeeded",
      details: {
        memberCount: 3,
        topicPreview: "协同梳理本周发布阻塞",
      },
    });

    expect(event.payload).toMatchObject({
      action: "group_chat_route_open",
      surface: "lobby",
      outcome: "succeeded",
      memberCount: 3,
      topicPreview: "协同梳理本周发布阻塞",
    });
  });

  it("captures quick task assignment intent with target and preview", () => {
    const preview = "请先整理今天的运营阻塞并给出处理顺序";
    const event = buildOperatorActionAuditEvent({
      companyId: "company-1",
      action: "quick_task_assign",
      surface: "lobby",
      outcome: "succeeded",
      details: {
        targetActorId: "employee-coo",
        taskPreview: preview,
        taskLength: preview.length,
      },
    });

    expect(event.payload).toMatchObject({
      action: "quick_task_assign",
      surface: "lobby",
      outcome: "succeeded",
      targetActorId: "employee-coo",
      taskPreview: preview,
      taskLength: preview.length,
    });
  });

  it("captures structured staffing action details", () => {
    const event = buildOperatorActionAuditEvent({
      companyId: "company-1",
      action: "employee_role_update",
      surface: "lobby",
      outcome: "succeeded",
      details: {
        targetActorId: "employee-cto",
        role: "Chief Platform Officer",
        descriptionLength: 32,
      },
    });

    expect(event.payload).toMatchObject({
      action: "employee_role_update",
      surface: "lobby",
      outcome: "succeeded",
      targetActorId: "employee-cto",
      role: "Chief Platform Officer",
      descriptionLength: 32,
    });
  });
});
