import { describe, expect, it } from "vitest";
import type { Company, HandoffRecord, RequestRecord } from "../../domain";
import { reconcileCompanyCommunication } from "./reconcile";

function createCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    name: "novel",
    description: "番茄小说创作团队",
    icon: "📚",
    template: "novel",
    employees: [
      { agentId: "novel-co-ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo" },
      { agentId: "novel-co-cto", nickname: "CTO", role: "CTO", isMeta: true, metaRole: "cto" },
    ],
    quickPrompts: [],
    createdAt: 1_000,
    ...overrides,
  };
}

function createDispatchHandoff(overrides: Partial<HandoffRecord> = {}): HandoffRecord {
  return {
    id: "handoff:dispatch:cto-plan",
    sessionKey: "agent:novel-co-cto:main",
    taskId: "task:cto-plan",
    fromAgentId: "novel-co-ceo",
    toAgentIds: ["novel-co-cto"],
    title: "【任务】规划番茄小说创作的技术支持方案",
    summary: "请 CTO 给出完整技术方案。",
    status: "pending",
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

function createRequest(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: "handoff:dispatch:cto-plan:request",
    sessionKey: "agent:novel-co-cto:main",
    taskId: "task:cto-plan",
    handoffId: "handoff:dispatch:cto-plan",
    fromAgentId: "novel-co-cto",
    toAgentIds: ["novel-co-ceo"],
    title: "## 番茄小说创作团队技术方案",
    summary: "@CEO 已完成技术方案规划，以下是详细报告：",
    status: "answered",
    resolution: "complete",
    responseSummary: "@CEO 已完成技术方案规划，以下是详细报告：",
    responseDetails: "## 番茄小说创作团队技术方案\n- 创作工具\n- 数据监控",
    sourceMessageTs: 1_000,
    responseMessageTs: 2_000,
    syncSource: "normalized",
    transport: "sessions_send",
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

describe("reconcileCompanyCommunication", () => {
  it("recovers the original dispatch handoff from a normalized fallback reply", () => {
    const result = reconcileCompanyCommunication(
      createCompany({
        handoffs: [createDispatchHandoff()],
      }),
      [createRequest()],
      3_000,
    );

    expect(result.companyPatch.handoffs?.[0]).toMatchObject({
      id: "handoff:dispatch:cto-plan",
      status: "completed",
    });
    expect(result.companyPatch.requests?.[0]).toMatchObject({
      syncSource: "normalized",
      transport: "sessions_send",
      status: "answered",
    });
  });

  it("supersedes older logical duplicates and drops pure placeholder noise", () => {
    const noisyRequest = createRequest({
      id: "noise-request",
      title: "任务",
      summary: "---",
      responseSummary: "收到！HR 和 COO 已完成汇报，CTO 也通过消息发送了完整方案。让我更新任务看板并为您汇总完整的团队组建方案：",
      responseDetails: "收到！HR 和 COO 已完成汇报，CTO 也通过消息发送了完整方案。让我更新任务看板并为您汇总完整的团队组建方案：",
      updatedAt: 1_500,
    });
    const olderRequest = createRequest({
      id: "older-request",
      status: "acknowledged",
      resolution: "pending",
      responseSummary: "收到，开始处理技术方案。",
      responseDetails: "收到，开始处理技术方案。",
      updatedAt: 1_200,
      responseMessageTs: 1_200,
      syncSource: "history",
      transport: "inferred",
    });
    const latestRequest = createRequest();

    const result = reconcileCompanyCommunication(
      createCompany({
        requests: [noisyRequest, olderRequest],
      }),
      [latestRequest],
      3_000,
    );

    expect(result.companyPatch.requests?.find((request) => request.id === "noise-request")).toBeUndefined();
    expect(result.companyPatch.requests?.find((request) => request.id === "older-request")?.status).toBe("superseded");
    expect(result.companyPatch.requests?.find((request) => request.id === latestRequest.id)?.status).toBe("answered");
  });

  it("drops instruction-doc requests recovered from workspace bootstrap text", () => {
    const result = reconcileCompanyCommunication(
      createCompany({
        requests: [
          createRequest({
            id: "ops-guide-request",
            title: "# CEO 执行准则",
            summary: "公司：on",
            requiredItems: [
              "1. 先读取 `company-context.json`。",
              "2. 严禁借用你自己的 workspace 替 CTO / COO / HR 执行他们的工作。",
            ],
            responseSummary: "公司：on",
            responseDetails: undefined,
          }),
        ],
      }),
      [],
      3_000,
    );

    expect(result.companyPatch.requests).toEqual([]);
  });
});
