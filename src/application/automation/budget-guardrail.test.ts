import { describe, expect, it } from "vitest";
import type { Company } from "../../domain/org/types";
import { evaluateAutomationBudgetGuardrail } from "./budget-guardrail";

function createCompany(budgetUsd?: number): Company {
  return {
    id: "company-1",
    name: "Company",
    description: "desc",
    icon: "icon",
    template: "tpl",
    employees: [],
    quickPrompts: [],
    createdAt: 1,
    orgSettings: {
      autonomyPolicy: {
        automationMonthlyBudgetUsd: budgetUsd ?? 0,
      },
    },
  };
}

describe("automation budget guardrail", () => {
  it("returns inactive when no automation budget is configured", () => {
    const result = evaluateAutomationBudgetGuardrail({
      company: createCompany(0),
      usageCost: 6,
    });

    expect(result.status).toBe("inactive");
    expect(result.shouldEscalateToApproval).toBe(false);
  });

  it("returns warning when usage is near the configured budget", () => {
    const result = evaluateAutomationBudgetGuardrail({
      company: createCompany(10),
      usageCost: 8.5,
    });

    expect(result.status).toBe("warning");
    expect(result.shouldEscalateToApproval).toBe(false);
  });

  it("returns over_budget when usage exceeds the configured budget", () => {
    const result = evaluateAutomationBudgetGuardrail({
      company: createCompany(10),
      usageCost: 12.5,
    });

    expect(result.status).toBe("over_budget");
    expect(result.shouldEscalateToApproval).toBe(true);
  });

  it("escalates to approval when usage is temporarily unavailable", () => {
    const result = evaluateAutomationBudgetGuardrail({
      company: createCompany(10),
      usageCost: null,
    });

    expect(result.status).toBe("usage_unavailable");
    expect(result.shouldEscalateToApproval).toBe(true);
    expect(result.detail).toContain("自动升级为人工审批");
  });
});
