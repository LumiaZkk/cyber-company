import { describe, expect, it } from "vitest";
import { buildHandoffRecords } from "./handoff-object";
import type { Company } from "../../domain";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "on",
    description: "desc",
    icon: "🏢",
    template: "blank",
    createdAt: 1_000,
    employees: [
      { agentId: "on-ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo" },
      { agentId: "on-hr", nickname: "HR", role: "Human Resources Director", isMeta: true, metaRole: "hr", reportsTo: "on-ceo" },
      { agentId: "on-cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto", reportsTo: "on-ceo" },
      { agentId: "on-coo", nickname: "COO", role: "Chief Operating Officer", isMeta: true, metaRole: "coo", reportsTo: "on-ceo" },
    ],
    quickPrompts: [],
  };
}

describe("buildHandoffRecords", () => {
  it("ignores workspace instruction documents that mention multiple meta roles", () => {
    const records = buildHandoffRecords({
      sessionKey: "agent:on-ceo:main",
      company: createCompany(),
      currentAgentId: "on-ceo",
      messages: [
        {
          role: "assistant",
          text: [
            "# CEO 执行准则",
            "",
            "公司：on",
            "",
            "## 开场动作",
            "1. 先读取 `company-context.json`。",
            "2. 不要把完整清单逐条念给老板。",
            "",
            "## 委派硬规则",
            "1. 员工接单、完成、阻塞时必须要求他们使用 `company_report` 回执。",
            "2. 严禁借用你自己的 workspace 替 CTO / COO / HR 执行他们的工作。",
            "",
            "## 当前 roster",
            "- HR [HR] -> on-hr，汇报给 on-ceo",
            "- CTO [CTO] -> on-cto，汇报给 on-ceo",
            "- COO [COO] -> on-coo，汇报给 on-ceo",
          ].join("\n"),
          timestamp: 1_100,
        },
      ],
    });

    expect(records).toEqual([]);
  });

  it("still recovers an explicit dispatch-style message from history", () => {
    const [record] = buildHandoffRecords({
      sessionKey: "agent:on-ceo:main",
      company: createCompany(),
      currentAgentId: "on-ceo",
      messages: [
        {
          role: "assistant",
          text: [
            "请 CTO 调研番茄发布的技术可行性，并给 CEO 汇报完整方案。",
            "1. 是否有官方 API",
            "2. 浏览器自动化是否可行",
            "3. 审核规则和风险",
          ].join("\n"),
          timestamp: 2_000,
        },
      ],
    });

    expect(record).toMatchObject({
      fromAgentId: "on-ceo",
      toAgentIds: ["on-cto"],
      status: "pending",
      title: "请 CTO 调研番茄发布的技术可行性，并给 CEO 汇报完整方案。",
    });
  });
});
