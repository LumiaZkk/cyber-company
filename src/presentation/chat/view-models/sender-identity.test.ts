import { describe, expect, it } from "vitest";
import { getChatSenderIdentity } from "./sender-identity";
import type { ChatMessage } from "../../../application/gateway";
import type { Company, EmployeeRef } from "../../../domain/org/types";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "测试",
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
    ],
    quickPrompts: [],
    createdAt: 1_000,
  };
}

function createEmployeesByAgentId(): Map<string, EmployeeRef> {
  const company = createCompany();
  return new Map(company.employees.map((employee) => [employee.agentId, employee] as const));
}

function createInput(overrides: Partial<Parameters<typeof getChatSenderIdentity>[0]> = {}) {
  const company = createCompany();
  return {
    msg: { role: "user", text: "继续推进", timestamp: 1_000 } satisfies ChatMessage,
    activeCompany: company,
    employeesByAgentId: createEmployeesByAgentId(),
    isGroup: false,
    isCeoSession: false,
    groupTopic: null,
    emp: company.employees[0] ?? null,
    effectiveOwnerAgentId: null,
    requirementRoomSessionsLength: 0,
    ...overrides,
  };
}

describe("getChatSenderIdentity", () => {
  it("treats non-group user messages as the current user", () => {
    const identity = getChatSenderIdentity(
      createInput({
        msg: {
          role: "user",
          text: "张三：请继续推进",
          timestamp: 1_000,
        },
      }),
    );

    expect(identity).toMatchObject({
      name: "我",
      isOutgoing: true,
      isRelayed: false,
    });
  });

  it("uses neutral fallback labels for group relay guesses", () => {
    const identity = getChatSenderIdentity(
      createInput({
        isGroup: true,
        msg: {
          role: "user",
          text: "张三：请继续推进",
          timestamp: 1_000,
        },
      }),
    );

    expect(identity).toMatchObject({
      name: "张三",
      isRelayed: true,
      badgeLabel: "同步转发",
      metaLabel: "跨会话消息",
    });
  });
});
