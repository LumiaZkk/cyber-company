import { describe, expect, it } from "vitest";
import { reconcileAuthorityRequirementRuntime } from "./requirement-control-runtime";
import type { AuthorityCompanyRuntimeSnapshot } from "../../../src/infrastructure/authority/contract";
import type { ChatMessage } from "../../../src/infrastructure/gateway/openclaw/sessions";
import type { Company } from "../../../src/domain";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "",
    icon: "🏢",
    template: "blank",
    employees: [
      {
        agentId: "co-ceo",
        nickname: "CEO",
        role: "Chief Executive Officer",
        isMeta: true,
        metaRole: "ceo",
      },
      {
        agentId: "co-coo",
        nickname: "COO",
        role: "Chief Operating Officer",
        isMeta: true,
        metaRole: "coo",
      },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createRuntime(): AuthorityCompanyRuntimeSnapshot {
  return {
    companyId: "company-1",
    activeRoomRecords: [],
    activeMissionRecords: [],
    activeConversationStates: [],
    activeWorkItems: [],
    activeRequirementAggregates: [],
    activeRequirementEvidence: [],
    primaryRequirementId: null,
    activeRoundRecords: [],
    activeArtifacts: [],
    activeDispatches: [],
    activeRoomBindings: [],
    activeSupportRequests: [],
    activeEscalations: [],
    activeDecisionTickets: [],
    updatedAt: 1_000,
  };
}

function createControlMessage(): ChatMessage {
  return {
    role: "assistant",
    text: "请选择接下来先启动哪一项。",
    metadata: {
      control: {
        version: 1,
        requirementDraft: {
          summary: "搭建 AI 小说创作系统，并先确定当前启动优先级。",
          nextAction: "先由你在结构化选项里决定先启哪一棒。",
          ownerLabel: "CEO",
          stage: "等待老板决策",
          topicKey: "mission:novel-system",
          canProceed: true,
          stageGateStatus: "waiting_confirmation",
        },
        decision: {
          key: "launch-plan",
          type: "requirement_gate",
          summary: "请选择当前要先启动的执行项。",
          options: [
            { id: "launch_a", label: "先启动 A", summary: "先让 CTO 开始搭建技术底座。" },
            { id: "launch_all", label: "全部启动", summary: "让 CTO / COO / HR 并行推进。" },
          ],
          requiresHuman: true,
        },
      },
    },
    timestamp: 2_000,
  };
}

describe("reconcileAuthorityRequirementRuntime", () => {
  it("creates requirement-controlled waiting state only from structured control metadata", () => {
    const result = reconcileAuthorityRequirementRuntime({
      company: createCompany(),
      runtime: createRuntime(),
      controlUpdate: {
        sessionKey: "agent:co-ceo:main",
        message: createControlMessage(),
        timestamp: 2_000,
      },
    });

    expect(result.violations).toEqual([]);
    expect(result.runtime.activeConversationStates[0]?.draftRequirement).toMatchObject({
      summary: "搭建 AI 小说创作系统，并先确定当前启动优先级。",
      stageGateStatus: "waiting_confirmation",
    });
    expect(result.runtime.activeDecisionTickets[0]).toMatchObject({
      sourceType: "requirement",
      decisionType: "requirement_gate",
      status: "pending_human",
    });
    expect(result.runtime.primaryRequirementId).toBeTruthy();
    expect(result.runtime.activeRequirementAggregates[0]).toMatchObject({
      stageGateStatus: "waiting_confirmation",
      lifecyclePhase: "pre_requirement",
    });
  });

  it("does not change requirement state when assistant message has only natural language", () => {
    const runtime = createRuntime();
    runtime.activeConversationStates = [
      {
        companyId: "company-1",
        conversationId: "agent:co-ceo:main",
        currentWorkKey: null,
        currentWorkItemId: null,
        currentRoundId: null,
        draftRequirement: {
          topicKey: "mission:novel-system",
          topicText: "搭建 AI 小说创作系统",
          summary: "现有主线已经收敛。",
          ownerActorId: "co-ceo",
          ownerLabel: "CEO",
          stage: "执行准备中",
          nextAction: "继续推进现有主线。",
          stageGateStatus: "confirmed",
          state: "active_requirement",
          promotionReason: null,
          promotable: true,
          updatedAt: 1_500,
        },
        updatedAt: 1_500,
      },
    ];

    const result = reconcileAuthorityRequirementRuntime({
      company: createCompany(),
      runtime,
      controlUpdate: {
        sessionKey: "agent:co-ceo:main",
        message: {
          role: "assistant",
          text: "请确认后我就继续推进。",
          timestamp: 2_000,
        },
        timestamp: 2_000,
      },
    });

    expect(result.runtime.activeConversationStates[0]?.draftRequirement?.stageGateStatus).toBe(
      "confirmed",
    );
    expect(result.runtime.activeDecisionTickets).toHaveLength(0);
  });

  it("derives confirmed stage gate from a resolved requirement ticket", () => {
    const seeded = reconcileAuthorityRequirementRuntime({
      company: createCompany(),
      runtime: createRuntime(),
      controlUpdate: {
        sessionKey: "agent:co-ceo:main",
        message: createControlMessage(),
        timestamp: 2_000,
      },
    }).runtime;

    seeded.activeDecisionTickets = seeded.activeDecisionTickets.map((ticket) => ({
      ...ticket,
      status: "resolved",
      resolutionOptionId: "launch_all",
      resolution: "全部启动",
      updatedAt: 3_000,
    }));

    const result = reconcileAuthorityRequirementRuntime({
      company: createCompany(),
      runtime: seeded,
    });

    expect(result.runtime.activeDecisionTickets[0]?.status).toBe("resolved");
    expect(result.runtime.activeConversationStates[0]?.draftRequirement?.stageGateStatus).toBe(
      "confirmed",
    );
    expect(result.runtime.activeRequirementAggregates[0]?.stageGateStatus).toBe("confirmed");
  });
});
