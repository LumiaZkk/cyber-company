import { describe, expect, it } from "vitest";
import { buildConversationDraftRequirement } from "./draft-requirement";
import type { ChatMessage } from "../gateway";
import type { Company, ConversationStateRecord, DraftRequirementRecord } from "../../domain";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "测试",
    icon: "🏢",
    template: "blank",
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo" },
      { agentId: "co-cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto" },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createMessages(userText: string, assistantText: string, baseTs = 1_000): ChatMessage[] {
  return [
    { role: "user", text: userText, timestamp: baseTs },
    { role: "assistant", text: assistantText, timestamp: baseTs + 10 },
  ];
}

function createDraft(overrides: Partial<DraftRequirementRecord> = {}): DraftRequirementRecord {
  return {
    topicKey: "mission:automation-team",
    topicText: "帮我搭一个 AI 自动化团队",
    summary: "先基于现有团队能力判断是否可以直接推进自动化搭建。",
    ownerActorId: "co-ceo",
    ownerLabel: "CEO",
    stage: "CEO 正在收敛目标和推进方式",
    nextAction: "先确认现有角色、知识和待办，再决定是否需要 CTO / COO 介入。",
    promotable: false,
    updatedAt: 1_010,
    ...overrides,
  };
}

function createConversationState(
  draftRequirement: DraftRequirementRecord | null,
): ConversationStateRecord {
  return {
    companyId: "company-1",
    conversationId: "agent:co-ceo:main",
    currentWorkKey: null,
    currentWorkItemId: null,
    currentRoundId: null,
    draftRequirement,
    updatedAt: draftRequirement?.updatedAt ?? 1_010,
  };
}

describe("buildConversationDraftRequirement", () => {
  it("promotes the first structured CEO reply once it already contains an actionable next step", () => {
    const draft = buildConversationDraftRequirement({
      company: createCompany(),
      activeConversationState: null,
      messages: createMessages(
        "帮我搭一个 AI 自动化团队",
        [
          "我先基于公司现状判断这件事能不能直接推进。",
          "当前理解：先评估现有员工、工具和知识沉淀是否足够支撑自动化团队搭建。",
          "建议下一步：先由 CEO 盘点现有能力与缺口，再决定是否需要 CTO / COO 接手专项。",
          "是否可推进：是",
        ].join("\n"),
      ),
      isGroup: false,
      isCeoSession: true,
      isArchiveView: false,
      hasRuntimePromotionSignal: false,
    });

    expect(draft).toMatchObject({
      ownerActorId: "co-ceo",
      ownerLabel: "CEO",
      promotable: true,
    });
    expect(draft?.summary).toContain("现有员工");
    expect(draft?.nextAction).toContain("先由 CEO 盘点现有能力");
  });

  it("marks a stable follow-up as promotable after the draft already exists", () => {
    const previousDraft = createDraft();
    const draft = buildConversationDraftRequirement({
      company: createCompany(),
      activeConversationState: createConversationState(previousDraft),
      messages: createMessages(
        "继续，就按这个方向推进",
        [
          "当前条件已经足够进入真实推进。",
          "当前理解：先基于现有团队能力判断是否可以直接推进自动化搭建。",
          "建议下一步：先确认现有角色、知识和待办，再决定是否需要 CTO / COO 介入。",
          "是否可推进：是",
        ].join("\n"),
        2_000,
      ),
      isGroup: false,
      isCeoSession: true,
      isArchiveView: false,
      hasRuntimePromotionSignal: false,
    });

    expect(draft?.promotable).toBe(true);
    expect(draft?.topicKey).toBe(previousDraft.topicKey);
    expect(draft?.topicText).toBe(previousDraft.topicText);
    expect(draft?.summary).toBe(previousDraft.summary);
    expect(draft?.nextAction).toBe(previousDraft.nextAction);
  });

  it("allows promotion on the first structured reply when runtime has already produced a real signal", () => {
    const draft = buildConversationDraftRequirement({
      company: createCompany(),
      activeConversationState: null,
      messages: createMessages(
        "帮我重整内部交付流程",
        [
          "我会直接基于现有推进信号接着收口。",
          "当前理解：当前公司已经有对应推进对象，可以直接把这件事并入现有执行链路。",
          "建议下一步：沿用已有执行对象继续推进，并让当前负责人给出收口计划。",
          "是否可推进：是",
        ].join("\n"),
      ),
      isGroup: false,
      isCeoSession: true,
      isArchiveView: false,
      hasRuntimePromotionSignal: true,
    });

    expect(draft?.promotable).toBe(true);
  });
});
