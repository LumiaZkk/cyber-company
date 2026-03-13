import { describe, expect, it } from "vitest";
import type { SessionsUsageEntry } from "../gateway";
import type { Company } from "../../domain/org/types";
import { attributeUsageSessionsToCompany } from "./usage-attribution";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "Cyber Company",
    description: "desc",
    icon: "icon",
    template: "tpl",
    createdAt: 100,
    employees: [
      {
        agentId: "agent-1",
        nickname: "CEO",
        role: "ceo",
        isMeta: true,
        metaRole: "ceo",
      },
      {
        agentId: "agent-2",
        nickname: "COO",
        role: "ops",
        isMeta: true,
        metaRole: "coo",
      },
    ],
    quickPrompts: [],
  };
}

function createUsageEntry(overrides: Partial<SessionsUsageEntry>): SessionsUsageEntry {
  return {
    key: "agent:agent-1:main",
    agentId: "agent-1",
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      totalCost: 1.25,
      firstActivity: 120,
      lastActivity: 180,
    },
    ...overrides,
  };
}

describe("attributeUsageSessionsToCompany", () => {
  it("tracks eligible and unattributed company sessions", () => {
    const attribution = attributeUsageSessionsToCompany({
      company: createCompany(),
      sessions: [
        createUsageEntry({
          key: "agent:agent-1:main",
        }),
        createUsageEntry({
          key: "agent:agent-1:task-older",
          usage: {
            input: 2,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 3,
            totalCost: 0.2,
            firstActivity: 80,
            lastActivity: 90,
          },
        }),
        createUsageEntry({
          key: "agent:agent-1:group:ops?m=agent-1,external-agent",
        }),
        createUsageEntry({
          key: "agent:agent-1:adhoc",
          usage: null,
        }),
        createUsageEntry({
          key: "agent:external:main",
          agentId: "external",
        }),
      ],
    });

    expect(attribution.sessions).toHaveLength(1);
    expect(attribution.eligibleSessionCount).toBe(3);
    expect(attribution.unattributedSessionCount).toBe(2);
    expect(attribution.coverageRatio).toBeCloseTo(1 / 3, 5);
    expect(attribution.excludedBeforeCompanyCreation).toBe(1);
    expect(attribution.excludedExternalGroupMembers).toBe(1);
  });
});
