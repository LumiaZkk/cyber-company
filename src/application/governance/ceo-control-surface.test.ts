import { describe, expect, it } from "vitest";
import { buildCeoControlSurface } from "./ceo-control-surface";
import type { Company } from "../../domain/org/types";
import type { ApprovalRecord } from "../../domain/governance/types";

function createApproval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: overrides.id ?? "approval-1",
    companyId: overrides.companyId ?? "company-1",
    scope: overrides.scope ?? "org",
    actionType: overrides.actionType ?? "employee_fire",
    status: overrides.status ?? "pending",
    summary: overrides.summary ?? "审批离职",
    requestedAt: overrides.requestedAt ?? 1,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    ...overrides,
  };
}

function createCompany(): Company {
  return {
    id: "company-1",
    name: "Cyber Company",
    description: "CEO control surface tests",
    icon: "building",
    template: "default",
    createdAt: 1,
    quickPrompts: [],
    employees: [],
    tasks: [],
    handoffs: [],
    requests: [],
    supportRequests: [],
    escalations: [],
    decisionTickets: [],
    approvals: [
      createApproval(),
      createApproval({
        id: "approval-2",
        status: "approved",
      }),
    ],
  };
}

describe("buildCeoControlSurface", () => {
  it("counts pending approvals separately from decision tickets", () => {
    const surface = buildCeoControlSurface({
      company: createCompany(),
      activeDecisionTickets: [
        {
          id: "decision-1",
          companyId: "company-1",
          sourceType: "requirement",
          sourceId: "req-1",
          aggregateId: "req-1",
          decisionOwnerActorId: "ceo",
          decisionType: "requirement_gate",
          summary: "是否继续投入",
          status: "pending_human",
          createdAt: 1,
          updatedAt: 1,
          requiresHuman: true,
          options: [],
        },
      ],
    });

    expect(surface.pendingHumanDecisions).toBe(1);
    expect(surface.pendingApprovals).toBe(1);
  });
});
