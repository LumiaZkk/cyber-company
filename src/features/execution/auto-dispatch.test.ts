import { describe, expect, it } from "vitest";

import { buildAutoDispatchPlan, shouldDelegateToNextBaton } from "./auto-dispatch";
import type { Company, DispatchRecord } from "../company/types";

function createCompany(): Company {
  return {
    id: "company-live",
    name: "live",
    description: "",
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
        reportsTo: "live-co-ceo",
      },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createDispatch(id: string): DispatchRecord {
  return {
    id,
    workItemId: "topic:flashsale",
    title: "dispatch",
    summary: "dispatch",
    targetActorIds: ["live-co-cto"],
    status: "sent",
    createdAt: 10,
    updatedAt: 10,
  };
}

describe("auto dispatch planning", () => {
  it("builds a real company-targeted dispatch for the current non-CEO step", () => {
    const plan = buildAutoDispatchPlan({
      company: createCompany(),
      dispatches: [],
      workItemId: "topic:flashsale",
      currentActorId: "live-co-ceo",
      workTitle: "闪购排品系统",
      ownerLabel: "CEO",
      summary: "CTO 需要先确认技术路线",
      actionHint: "先确认权限和架构",
      currentStep: {
        id: "step-cto",
        title: "CTO 确认技术路线",
        assigneeAgentId: "live-co-cto",
        assigneeLabel: "CTO",
        detail: "确认 API 权限和最小技术方案",
      },
    });

    expect(plan).not.toBeNull();
    expect(plan?.targetAgentId).toBe("live-co-cto");
    expect(plan?.dispatchId).toBe("dispatch:auto:topic:flashsale:step-cto:live-co-cto");
    expect(plan?.message).toContain("现在主线卡在你这里。当前需求：闪购排品系统");
    expect(plan?.message).toContain("你负责的步骤：CTO 确认技术路线");
  });

  it("reuses the next baton when the current step is a CEO handoff step", () => {
    const plan = buildAutoDispatchPlan({
      company: createCompany(),
      dispatches: [],
      workItemId: "topic:flashsale",
      currentActorId: "live-co-ceo",
      workTitle: "闪购排品系统",
      ownerLabel: "CEO",
      summary: "现在该把发布动作转给 CTO",
      currentStep: {
        id: "step-ceo-dispatch",
        title: "通知 CTO 发布新版",
        assigneeAgentId: "live-co-ceo",
        assigneeLabel: "CEO",
      },
      nextBatonAgentId: "live-co-cto",
      nextBatonLabel: "CTO",
      delegateToNextBaton: true,
    });

    expect(plan?.targetAgentId).toBe("live-co-cto");
  });

  it("does not create a duplicate plan when the same auto dispatch already exists", () => {
    const existingId = "dispatch:auto:topic:flashsale:step-cto:live-co-cto";
    const plan = buildAutoDispatchPlan({
      company: createCompany(),
      dispatches: [createDispatch(existingId)],
      workItemId: "topic:flashsale",
      currentActorId: "live-co-ceo",
      workTitle: "闪购排品系统",
      ownerLabel: "CEO",
      summary: "CTO 需要先确认技术路线",
      currentStep: {
        id: "step-cto",
        title: "CTO 确认技术路线",
        assigneeAgentId: "live-co-cto",
        assigneeLabel: "CTO",
      },
    });

    expect(plan).toBeNull();
  });

  it("recognizes explicit handoff wording", () => {
    expect(shouldDelegateToNextBaton("通知 CTO 发布新版")).toBe(true);
    expect(shouldDelegateToNextBaton("CTO 确认技术路线")).toBe(false);
  });
});
