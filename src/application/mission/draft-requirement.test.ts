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

function createStructuredMessages(input: {
  userText: string;
  assistantText: string;
  draft: {
    summary: string;
    nextAction: string;
    ownerLabel?: string | null;
    stage?: string | null;
    canProceed?: boolean | null;
    stageGateStatus?: "none" | "waiting_confirmation" | "confirmed";
    topicKey?: string | null;
  };
  baseTs?: number;
}): ChatMessage[] {
  const baseTs = input.baseTs ?? 1_000;
  return [
    { role: "user", text: input.userText, timestamp: baseTs },
    {
      role: "assistant",
      text: input.assistantText,
      metadata: {
        control: {
          version: 1,
          requirementDraft: {
            ...input.draft,
            stageGateStatus: input.draft.stageGateStatus ?? "none",
          },
        },
      },
      timestamp: baseTs + 10,
    },
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
    state: "awaiting_promotion_choice",
    promotionReason: null,
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
  it("creates a draft on the first structured CEO reply without auto-promoting", () => {
    const draft = buildConversationDraftRequirement({
      company: createCompany(),
      activeConversationState: null,
      messages: createStructuredMessages({
        userText: "帮我搭一个 AI 自动化团队",
        assistantText: "我先基于公司现状判断这件事能不能直接推进。",
        draft: {
          summary: "先评估现有员工、工具和知识沉淀是否足够支撑自动化团队搭建。",
          nextAction: "先由 CEO 盘点现有能力与缺口，再决定是否需要 CTO / COO 接手专项。",
          ownerLabel: "CEO",
          stage: "CEO 正在收敛目标和推进方式",
          canProceed: true,
        },
      }),
      isGroup: false,
      isCeoSession: true,
      isArchiveView: false,
      hasRuntimePromotionSignal: false,
    });

    expect(draft).toMatchObject({
      ownerActorId: "co-ceo",
      ownerLabel: "CEO",
      state: "draft_ready",
      promotable: false,
    });
    expect(draft?.summary).toContain("现有员工");
    expect(draft?.nextAction).toContain("先由 CEO 盘点现有能力");
  });

  it("moves a stable draft into awaiting_promotion_choice after it already exists", () => {
    const previousDraft = createDraft({ state: "draft_ready" });
    const draft = buildConversationDraftRequirement({
      company: createCompany(),
      activeConversationState: createConversationState(previousDraft),
      messages: createStructuredMessages({
        userText: "继续，就按这个方向推进",
        assistantText: "当前条件已经足够进入真实推进。",
        draft: {
          summary: previousDraft.summary,
          nextAction: previousDraft.nextAction,
          ownerLabel: "CEO",
          stage: previousDraft.stage,
          canProceed: true,
          topicKey: previousDraft.topicKey,
        },
        baseTs: 2_000,
      }),
      isGroup: false,
      isCeoSession: true,
      isArchiveView: false,
      hasRuntimePromotionSignal: false,
    });

    expect(draft?.promotable).toBe(false);
    expect(draft?.state).toBe("awaiting_promotion_choice");
    expect(draft?.topicKey).toBe(previousDraft.topicKey);
    expect(draft?.topicText).toBe(previousDraft.topicText);
    expect(draft?.summary).toBe(previousDraft.summary);
    expect(draft?.nextAction).toBe(previousDraft.nextAction);
  });

  it("marks the draft as active_requirement once runtime already produced a real signal", () => {
    const draft = buildConversationDraftRequirement({
      company: createCompany(),
      activeConversationState: null,
      messages: createStructuredMessages({
        userText: "帮我重整内部交付流程",
        assistantText: "我会直接基于现有推进信号接着收口。",
        draft: {
          summary: "当前公司已经有对应推进对象，可以直接把这件事并入现有执行链路。",
          nextAction: "沿用已有执行对象继续推进，并让当前负责人给出收口计划。",
          ownerLabel: "CEO",
          canProceed: true,
        },
      }),
      isGroup: false,
      isCeoSession: true,
      isArchiveView: false,
      hasRuntimePromotionSignal: true,
    });

    expect(draft?.promotable).toBe(true);
    expect(draft?.state).toBe("active_requirement");
  });

  it("auto-promotes when a cross-team dispatch signal already exists", () => {
    const draft = buildConversationDraftRequirement({
      company: createCompany(),
      activeConversationState: createConversationState(createDraft()),
      messages: createStructuredMessages({
        userText: "帮我重整内部交付流程",
        assistantText: "我已经看到了跨部门推进的真实信号。",
        draft: {
          summary: "这件事已经从 CEO 收敛进入跨团队执行。",
          nextAction: "补建需求主线，让 HR、CTO、COO 在同一条主线里协同推进。",
          ownerLabel: "CEO",
          canProceed: true,
        },
        baseTs: 3_000,
      }),
      isGroup: false,
      isCeoSession: true,
      isArchiveView: false,
      hasRuntimePromotionSignal: false,
      hasMultiActorDispatchSignal: true,
    });

    expect(draft?.promotable).toBe(true);
    expect(draft?.state).toBe("promoted_auto");
    expect(draft?.promotionReason).toBe("multi_actor_dispatch");
  });

  it("prefers structured requirementDraft payloads over visible text labels", () => {
    const draft = buildConversationDraftRequirement({
      company: createCompany(),
      activeConversationState: null,
      messages: [
        {
          role: "user",
          text: "帮我搭一个 AI 自动化团队",
          timestamp: 4_000,
        },
        {
          role: "assistant",
          text: [
            "我先用结构化草案把主线收住。",
            "当前理解：这是旧的展示文本，不应该成为最终草案。",
            "建议下一步：这是旧的下一步，也不应该覆盖 metadata。",
            "是否可推进：否",
          ].join("\n"),
          metadata: {
            control: {
              version: 1,
              requirementDraft: {
                summary: "先确认当前团队的业务边界与现有工具，再决定如何搭建 AI 自动化团队。",
                nextAction: "盘点现有角色和工具，确认是否需要补业务 owner 或交给 CTO 做技术底座。",
                ownerLabel: "CEO",
                stage: "CEO 正在收敛目标",
                canProceed: true,
                stageGateStatus: "waiting_confirmation",
              },
            },
          },
          timestamp: 4_010,
        },
      ],
      isGroup: false,
      isCeoSession: true,
      isArchiveView: false,
      hasRuntimePromotionSignal: false,
    });

    expect(draft).toMatchObject({
      summary: "先确认当前团队的业务边界与现有工具，再决定如何搭建 AI 自动化团队。",
      nextAction: "盘点现有角色和工具，确认是否需要补业务 owner 或交给 CTO 做技术底座。",
      ownerLabel: "CEO",
      stage: "CEO 正在收敛目标",
      stageGateStatus: "waiting_confirmation",
      state: "draft_ready",
    });
  });

  it("does not derive a new draft from visible labels when structured metadata is missing", () => {
    const previousDraft = createDraft();
    const draft = buildConversationDraftRequirement({
      company: createCompany(),
      activeConversationState: createConversationState(previousDraft),
      messages: createMessages(
        "我想继续推进",
        [
          "当前理解：这里故意只给可见文本。",
          "建议下一步：如果系统还在解析这段文字，就会把状态机拉回文本世界。",
          "是否可推进：是",
        ].join("\n"),
        5_000,
      ),
      isGroup: false,
      isCeoSession: true,
      isArchiveView: false,
      hasRuntimePromotionSignal: false,
    });

    expect(draft).toEqual(previousDraft);
  });

});
