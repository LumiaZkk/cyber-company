import { describe, expect, it } from "vitest";
import {
  resolveBoardPreRequirementDraft,
  shouldShowBoardPreRequirementDraft,
} from "./board-pre-requirement";
import type { ConversationStateRecord, DraftRequirementRecord } from "../../domain/mission/types";

function createDraft(
  overrides: Partial<DraftRequirementRecord> = {},
): DraftRequirementRecord {
  return {
    topicKey: "mission:ceo-test",
    topicText: "测试需求",
    summary: "先确认当前需求范围。",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    stage: "CEO 正在收敛目标",
    nextAction: "确认是否升级为正式需求。",
    state: "awaiting_promotion_choice",
    promotionReason: null,
    promotable: false,
    updatedAt: 1_000,
    ...overrides,
  };
}

function createConversationState(
  conversationId: string,
  draftRequirement: DraftRequirementRecord | null,
  updatedAt = draftRequirement?.updatedAt ?? 1_000,
): ConversationStateRecord {
  return {
    companyId: "company-1",
    conversationId,
    currentWorkKey: null,
    currentWorkItemId: null,
    currentRoundId: null,
    draftRequirement,
    updatedAt,
  };
}

describe("board pre-requirement helpers", () => {
  it("picks the latest visible CEO direct-chat draft", () => {
    const latestDraft = createDraft({
      summary: "最新 CEO 草案",
      state: "promoted_manual",
      updatedAt: 2_000,
    });

    const draft = resolveBoardPreRequirementDraft({
      ceoAgentId: "co-ceo",
      activeConversationStates: [
        createConversationState("agent:co-ceo:main", createDraft({ updatedAt: 1_000 })),
        createConversationState("agent:co-cto:main", createDraft({ ownerActorId: "co-cto" })),
        createConversationState("room:req:1", createDraft({ updatedAt: 5_000 })),
        createConversationState(
          "agent:co-ceo:strategy",
          createDraft({
            summary: "应被忽略的 chatting 草案",
            state: "chatting",
            updatedAt: 3_000,
          }),
        ),
        createConversationState("agent:co-ceo:followup", latestDraft),
      ],
    });

    expect(draft?.summary).toBe("最新 CEO 草案");
    expect(draft?.state).toBe("promoted_manual");
  });

  it("shows the pre-requirement guidance only when the board truly has no current task line", () => {
    const draft = createDraft();

    expect(
      shouldShowBoardPreRequirementDraft({
        trackedTaskCount: 0,
        hasRequirementOverview: false,
        hasCurrentWorkItem: false,
        preRequirementDraft: draft,
      }),
    ).toBe(true);

    expect(
      shouldShowBoardPreRequirementDraft({
        trackedTaskCount: 1,
        hasRequirementOverview: false,
        hasCurrentWorkItem: false,
        preRequirementDraft: draft,
      }),
    ).toBe(false);

    expect(
      shouldShowBoardPreRequirementDraft({
        trackedTaskCount: 0,
        hasRequirementOverview: false,
        hasCurrentWorkItem: false,
        preRequirementDraft: null,
      }),
    ).toBe(false);
  });
});
