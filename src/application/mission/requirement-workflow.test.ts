import { describe, expect, it } from "vitest";
import type { RequirementAggregateRecord } from "../../domain/mission/types";
import { buildRequirementWorkflowEvidencePayload } from "./requirement-workflow";

function createAggregate(
  overrides: Partial<RequirementAggregateRecord> = {},
): RequirementAggregateRecord {
  return {
    id: "topic:mission:alpha",
    companyId: "company-1",
    topicKey: "mission:alpha",
    kind: "strategic",
    primary: true,
    workItemId: "work-1",
    roomId: "room:alpha",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    lifecyclePhase: "active_requirement",
    stageGateStatus: "confirmed",
    stage: "CEO 统筹",
    summary: "Alpha 主线正在推进。",
    nextAction: "继续推进 Alpha。",
    memberIds: ["co-ceo", "co-cto"],
    sourceConversationId: "agent:co-ceo:main",
    startedAt: 1_000,
    updatedAt: 2_000,
    revision: 2,
    lastEvidenceAt: 2_000,
    status: "active",
    acceptanceStatus: "not_requested",
    acceptanceNote: null,
    ...overrides,
  };
}

describe("buildRequirementWorkflowEvidencePayload", () => {
  it("captures source, changed fields, and previous context for requirement transitions", () => {
    const previousAggregate = createAggregate();
    const nextAggregate = createAggregate({
      ownerActorId: "co-cto",
      ownerLabel: "CTO",
      roomId: "room:alpha:handoff",
      stage: "待你验收",
      nextAction: "请确认交付是否满足预期。",
      status: "waiting_review",
      acceptanceStatus: "pending",
      revision: 3,
      updatedAt: 6_000,
      lastEvidenceAt: 6_000,
    });

    const payload = buildRequirementWorkflowEvidencePayload({
      previousAggregate,
      nextAggregate,
      source: "local-command",
      changes: {
        ownerActorId: "co-cto",
        ownerLabel: "CTO",
        roomId: "room:alpha:handoff",
        stage: "待你验收",
        nextAction: "请确认交付是否满足预期。",
        status: "waiting_review",
        acceptanceStatus: "pending",
      },
    });

    expect(payload).toMatchObject({
      source: "local-command",
      previousAggregateId: "topic:mission:alpha",
      previousOwnerActorId: "co-ceo",
      previousOwnerLabel: "CEO",
      previousRoomId: "room:alpha",
      previousRevision: 2,
      previousStatus: "active",
      previousStageGateStatus: "confirmed",
      previousAcceptanceStatus: "not_requested",
    });
    expect(payload.changedFields).toEqual(
      expect.arrayContaining([
        "ownerActorId",
        "ownerLabel",
        "roomId",
        "stage",
        "nextAction",
        "status",
        "acceptanceStatus",
      ]),
    );
  });

  it("marks primary requirement promotion as a primaryRequirementId change", () => {
    const previousAggregate = createAggregate();
    const nextAggregate = createAggregate({
      id: "topic:mission:beta",
      topicKey: "mission:beta",
      workItemId: "work-2",
      roomId: "room:beta",
      ownerActorId: "co-cto",
      ownerLabel: "CTO",
      stage: "CTO 接管",
      summary: "Beta 主线接管中。",
      nextAction: "继续推进 Beta。",
      sourceConversationId: "agent:co-cto:main",
      revision: 4,
      updatedAt: 8_000,
      lastEvidenceAt: 8_000,
    });

    const payload = buildRequirementWorkflowEvidencePayload({
      previousAggregate,
      nextAggregate,
      source: "backfill",
    });

    expect(payload).toMatchObject({
      source: "backfill",
      previousAggregateId: "topic:mission:alpha",
      previousOwnerActorId: "co-ceo",
      previousRoomId: "room:alpha",
    });
    expect(payload.changedFields).toContain("primaryRequirementId");
  });
});
