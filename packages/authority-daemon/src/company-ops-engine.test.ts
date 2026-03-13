import { describe, expect, it } from "vitest";
import { buildCompanyOpsAuditEvents, runCompanyOpsCycle } from "./company-ops-engine";
import type { AuthorityCompanyRuntimeSnapshot } from "../../../src/infrastructure/authority/contract";
import type { Company, WorkItemRecord } from "../../../src/domain";
import { buildDefaultOrgSettings } from "../../../src/domain/org/autonomy-policy";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "",
    icon: "🏢",
    template: "blank",
    orgSettings: buildDefaultOrgSettings({
      autoCalibrate: false,
    }),
    departments: [
      { id: "dep-ceo", name: "管理中枢", leadAgentId: "co-ceo", kind: "meta" },
      { id: "dep-hr", name: "人力资源部", leadAgentId: "co-hr", kind: "support" },
      { id: "dep-cto", name: "技术部", leadAgentId: "co-cto", kind: "support" },
      { id: "dep-writing", name: "小说创作部", leadAgentId: "writer-lead", kind: "business" },
    ],
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo", departmentId: "dep-ceo" },
      { agentId: "co-hr", nickname: "HR", role: "HR", isMeta: true, metaRole: "hr", reportsTo: "co-ceo", departmentId: "dep-hr" },
      { agentId: "co-cto", nickname: "CTO", role: "CTO", isMeta: true, metaRole: "cto", reportsTo: "co-ceo", departmentId: "dep-cto" },
      { agentId: "writer-lead", nickname: "主编", role: "创作部经理", isMeta: false, reportsTo: "co-ceo", departmentId: "dep-writing" },
      { agentId: "writer-a", nickname: "写手", role: "Writer", isMeta: false, reportsTo: "writer-lead", departmentId: "dep-writing" },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createWorkItem(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: "work-1",
    workKey: "work-1",
    kind: "strategic",
    roundId: "work-1",
    companyId: "company-1",
    title: "写作部门需要一致性工具支持",
    goal: "继续推进小说交付",
    headline: "写作部门需要一致性工具支持",
    displayStage: "创作进行中",
    displaySummary: "需要技术辅助",
    displayOwnerLabel: "主编",
    displayNextAction: "请技术部提供章节一致性工具",
    status: "active",
    lifecyclePhase: "active_requirement",
    stageGateStatus: "confirmed",
    stageLabel: "创作进行中",
    owningDepartmentId: "dep-writing",
    executionLevel: "department",
    ownerActorId: "writer-lead",
    ownerLabel: "主编",
    batonActorId: "writer-a",
    batonLabel: "写手",
    roomId: "workitem:work-1",
    artifactIds: [],
    dispatchIds: [],
    startedAt: 1_000,
    updatedAt: 1_200,
    summary: "创作团队需要技术工具支持。",
    nextAction: "请技术部提供章节一致性工具。",
    steps: [],
    ...overrides,
  };
}

function createRuntime(workItems: WorkItemRecord[]): AuthorityCompanyRuntimeSnapshot {
  return {
    companyId: "company-1",
    activeRoomRecords: [],
    activeMissionRecords: [],
    activeConversationStates: [],
    activeWorkItems: workItems,
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
    updatedAt: 1_200,
  };
}

describe("runCompanyOpsCycle", () => {
  it("auto-creates a CTO support request for business work that asks for tooling", () => {
    const result = runCompanyOpsCycle({
      company: createCompany(),
      runtime: createRuntime([createWorkItem()]),
      now: 10_000,
    });

    expect(result.runtime.activeSupportRequests).toHaveLength(1);
    expect(result.runtime.activeSupportRequests[0]).toMatchObject({
      requesterDepartmentId: "dep-writing",
      targetDepartmentId: "dep-cto",
      requestedByActorId: "writer-lead",
      ownerActorId: "co-cto",
      status: "open",
    });
  });

  it("escalates blocked support requests to CEO without changing the business owner", () => {
    const runtime = createRuntime([
      createWorkItem({
        updatedAt: 1_000,
      }),
    ]);
    runtime.activeSupportRequests = [
      {
        id: "support:work-1:dep-cto",
        workItemId: "work-1",
        requesterDepartmentId: "dep-writing",
        targetDepartmentId: "dep-cto",
        requestedByActorId: "writer-lead",
        ownerActorId: "co-cto",
        summary: "需要技术支持",
        status: "blocked",
        createdAt: 5_000,
        updatedAt: 9_000,
      },
    ];

    const result = runCompanyOpsCycle({
      company: createCompany(),
      runtime,
      now: 20_000,
    });

    expect(result.runtime.activeEscalations[0]).toMatchObject({
      sourceType: "support_request",
      sourceId: "support:work-1:dep-cto",
      targetActorId: "co-ceo",
      status: "open",
    });
    expect(result.runtime.activeWorkItems[0]?.ownerActorId).toBe("writer-lead");
  });

  it("does not escalate waiting_owner work items as blocked until they become explicit blockers", () => {
    const runtime = createRuntime([
      createWorkItem({
        title: "等待确认",
        goal: "等待主管确认",
        summary: "等待主管确认",
        nextAction: "等待主管确认",
        stageLabel: "等待确认",
        displayNextAction: "等待主管确认",
        status: "waiting_owner",
        updatedAt: 1_000,
      }),
    ]);

    const result = runCompanyOpsCycle({
      company: createCompany(),
      runtime,
      now: 72 * 60 * 60 * 1000,
    });

    expect(
      result.runtime.activeEscalations.some(
        (escalation) => escalation.sourceType === "work_item" && escalation.sourceId === "work-1",
      ),
    ).toBe(false);
  });

  it("creates a pending human decision ticket when a department stays underloaded", () => {
    const company = createCompany();
    company.orgSettings = buildDefaultOrgSettings({
      autoCalibrate: false,
      autonomyState: {
        departmentCounters: [
          {
            departmentId: "dep-writing",
            overloadStreak: 0,
            underloadStreak: 1,
            lastLoadScore: 4,
            updatedAt: 8_000,
          },
        ],
      },
    });

    const result = runCompanyOpsCycle({
      company,
      runtime: createRuntime([]),
      now: 20_000,
    });

    expect(result.runtime.activeDecisionTickets[0]).toMatchObject({
      decisionType: "headcount",
      requiresHuman: true,
      status: "pending_human",
    });
    expect(
      result.company.orgSettings?.autonomyState?.departmentCounters?.find(
        (counter) => counter.departmentId === "dep-writing",
      )?.underloadStreak,
    ).toBe(2);
  });

  it("does not keep churning runtime state when the same underload escalation is already open", () => {
    const company = createCompany();
    company.orgSettings = buildDefaultOrgSettings({
      autoCalibrate: false,
      autonomyState: {
        lastEngineRunAt: 10_000,
        lastEngineActions: ["组织策略建议冻结或收缩：小说创作部"],
        departmentCounters: [
          {
            departmentId: "dep-writing",
            overloadStreak: 0,
            underloadStreak: 2,
            lastLoadScore: 0,
            updatedAt: 10_000,
          },
        ],
      },
    });
    const runtime = createRuntime([]);
    runtime.activeEscalations = [
      {
        id: "escalation:org_policy:underload:dep-writing",
        sourceType: "org_policy",
        sourceId: "underload:dep-writing",
        companyId: "company-1",
        requesterDepartmentId: "dep-writing",
        targetActorId: "co-ceo",
        reason: "部门长期低负载，建议冻结或收缩：小说创作部",
        severity: "warning",
        status: "open",
        createdAt: 10_000,
        updatedAt: 10_000,
      },
    ];
    runtime.activeDecisionTickets = [
      {
        id: "decision:escalation:org_policy:underload:dep-writing",
        companyId: "company-1",
        revision: 1,
        sourceType: "escalation",
        sourceId: "escalation:org_policy:underload:dep-writing",
        escalationId: "escalation:org_policy:underload:dep-writing",
        decisionOwnerActorId: "co-ceo",
        decisionType: "headcount",
        summary: "部门收缩涉及裁员门槛，需要人类审批：小说创作部",
        options: [
          { id: "freeze", label: "只冻结招聘", summary: "保留团队，不新增编制。" },
          { id: "reorg", label: "重组团队", summary: "调整汇报线和职责归属。" },
          { id: "layoff", label: "批准收缩", summary: "允许进入裁撤流程。" },
        ],
        requiresHuman: true,
        status: "pending_human",
        createdAt: 10_000,
        updatedAt: 10_000,
      },
    ];
    company.supportRequests = [];
    company.escalations = [...runtime.activeEscalations];
    company.decisionTickets = [...runtime.activeDecisionTickets];

    const result = runCompanyOpsCycle({
      company,
      runtime,
      now: 20_000,
    });

    expect(result.changed).toBe(false);
    expect(result.runtime.activeEscalations[0]?.updatedAt).toBe(10_000);
    expect(result.runtime.activeDecisionTickets[0]?.updatedAt).toBe(10_000);
    expect(result.company.orgSettings?.autonomyState?.lastEngineRunAt).toBe(10_000);
  });

  it("builds audit events for ops-created support, escalation, and decision records", () => {
    const previousRuntime = createRuntime([]);
    const nextRuntime = createRuntime([]);
    nextRuntime.activeSupportRequests = [
      {
        id: "support:work-1:dep-cto",
        workItemId: "work-1",
        requesterDepartmentId: "dep-writing",
        targetDepartmentId: "dep-cto",
        requestedByActorId: "writer-lead",
        ownerActorId: "co-cto",
        summary: "小说创作部 需要 技术部 支持：写作部门需要一致性工具支持",
        status: "open",
        createdAt: 10_000,
        updatedAt: 10_000,
      },
    ];
    nextRuntime.activeEscalations = [
      {
        id: "escalation:support_request:support:work-1:dep-cto",
        sourceType: "support_request",
        sourceId: "support:work-1:dep-cto",
        companyId: "company-1",
        workItemId: "work-1",
        requesterDepartmentId: "dep-writing",
        targetActorId: "co-ceo",
        reason: "支持请求超过 SLA，需要 CEO 介入协调：小说创作部 需要 技术部 支持：写作部门需要一致性工具支持",
        severity: "critical",
        status: "open",
        createdAt: 20_000,
        updatedAt: 20_000,
      },
    ];
    nextRuntime.activeDecisionTickets = [
      {
        id: "decision:escalation:support:work-1:headcount",
        companyId: "company-1",
        revision: 2,
        sourceType: "escalation",
        sourceId: "escalation:support_request:support:work-1:dep-cto",
        escalationId: "escalation:support_request:support:work-1:dep-cto",
        decisionOwnerActorId: "co-ceo",
        decisionType: "headcount",
        summary: "需要人类确认支持资源",
        options: [{ id: "approve", label: "批准支持" }],
        requiresHuman: true,
        status: "pending_human",
        resolution: null,
        resolutionOptionId: null,
        createdAt: 20_000,
        updatedAt: 20_000,
      },
    ];

    const events = buildCompanyOpsAuditEvents({
      companyId: "company-1",
      previousRuntime,
      nextRuntime,
      actions: ["自动创建支持请求：小说创作部 -> 技术部"],
      createdAt: 20_000,
    });

    expect(events.map((event) => event.kind)).toEqual([
      "ops_cycle_applied",
      "support_request_record_upserted",
      "escalation_record_upserted",
      "decision_record_upserted",
    ]);
    expect(events[0]?.payload).toMatchObject({
      actionCount: 1,
      actions: ["自动创建支持请求：小说创作部 -> 技术部"],
    });
    expect(events[1]?.payload).toMatchObject({
      requestId: "support:work-1:dep-cto",
      status: "open",
      targetDepartmentId: "dep-cto",
    });
    expect(events[2]?.payload).toMatchObject({
      escalationId: "escalation:support_request:support:work-1:dep-cto",
      status: "open",
      severity: "critical",
    });
    expect(events[3]?.payload).toMatchObject({
      ticketId: "decision:escalation:support:work-1:headcount",
      decisionType: "headcount",
      status: "pending_human",
      revision: 2,
    });
  });

  it("builds audit events for ops-removed support, escalation, and decision records", () => {
    const previousRuntime = createRuntime([]);
    previousRuntime.activeSupportRequests = [
      {
        id: "support:work-1:dep-cto",
        workItemId: "work-1",
        requesterDepartmentId: "dep-writing",
        targetDepartmentId: "dep-cto",
        requestedByActorId: "writer-lead",
        ownerActorId: "co-cto",
        summary: "小说创作部 需要 技术部 支持：写作部门需要一致性工具支持",
        status: "cancelled",
        createdAt: 10_000,
        updatedAt: 30_000,
      },
    ];
    previousRuntime.activeEscalations = [
      {
        id: "escalation:support_request:support:work-1:dep-cto",
        sourceType: "support_request",
        sourceId: "support:work-1:dep-cto",
        companyId: "company-1",
        workItemId: "work-1",
        requesterDepartmentId: "dep-writing",
        targetActorId: "co-ceo",
        reason: "支持请求超过 SLA，需要 CEO 介入协调：小说创作部 需要 技术部 支持：写作部门需要一致性工具支持",
        severity: "critical",
        status: "resolved",
        decisionTicketId: "decision:escalation:support:work-1:headcount",
        createdAt: 20_000,
        updatedAt: 30_000,
      },
    ];
    previousRuntime.activeDecisionTickets = [
      {
        id: "decision:escalation:support:work-1:headcount",
        companyId: "company-1",
        revision: 3,
        sourceType: "escalation",
        sourceId: "escalation:support_request:support:work-1:dep-cto",
        escalationId: "escalation:support_request:support:work-1:dep-cto",
        decisionOwnerActorId: "co-ceo",
        decisionType: "headcount",
        summary: "需要人类确认支持资源",
        options: [{ id: "approve", label: "批准支持" }],
        requiresHuman: true,
        status: "cancelled",
        resolution: "支持请求已关闭，无需追加人力",
        resolutionOptionId: "approve",
        createdAt: 20_000,
        updatedAt: 30_000,
      },
    ];
    const nextRuntime = createRuntime([]);

    const events = buildCompanyOpsAuditEvents({
      companyId: "company-1",
      previousRuntime,
      nextRuntime,
      actions: ["自动收口支持请求和升级项：小说创作部 -> 技术部"],
      createdAt: 31_000,
    });

    expect(events.map((event) => event.kind)).toEqual([
      "ops_cycle_applied",
      "support_request_record_deleted",
      "escalation_record_deleted",
      "decision_record_deleted",
    ]);
    expect(events[1]?.payload).toMatchObject({
      requestId: "support:work-1:dep-cto",
      status: "cancelled",
      targetDepartmentId: "dep-cto",
    });
    expect(events[2]?.payload).toMatchObject({
      escalationId: "escalation:support_request:support:work-1:dep-cto",
      status: "resolved",
      decisionTicketId: "decision:escalation:support:work-1:headcount",
    });
    expect(events[3]?.payload).toMatchObject({
      ticketId: "decision:escalation:support:work-1:headcount",
      status: "cancelled",
      revision: 3,
    });
  });
});
