import type { Company } from "../../domain/org/types";

export const AUTOMATION_BUDGET_WINDOW_DAYS = 30;
export const AUTOMATION_BUDGET_WARNING_RATIO = 0.8;

export type AutomationBudgetGuardrailStatus =
  | "inactive"
  | "within_budget"
  | "warning"
  | "over_budget"
  | "usage_unavailable";

export type AutomationBudgetGuardrail = {
  status: AutomationBudgetGuardrailStatus;
  budgetUsd: number | null;
  currentUsageCost: number | null;
  remainingUsd: number | null;
  usageRatio: number | null;
  windowDays: number;
  shouldEscalateToApproval: boolean;
  title: string;
  detail: string;
};

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function normalizeBudget(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function evaluateAutomationBudgetGuardrail(input: {
  company: Company;
  usageCost: number | null;
  windowDays?: number;
}): AutomationBudgetGuardrail {
  const windowDays = input.windowDays ?? AUTOMATION_BUDGET_WINDOW_DAYS;
  const budgetUsd = normalizeBudget(
    input.company.orgSettings?.autonomyPolicy?.automationMonthlyBudgetUsd,
  );

  if (budgetUsd === null) {
    return {
      status: "inactive",
      budgetUsd: null,
      currentUsageCost: input.usageCost,
      remainingUsd: null,
      usageRatio: null,
      windowDays,
      shouldEscalateToApproval: false,
      title: "未配置自动化预算护栏",
      detail: `当前公司没有设置近 ${windowDays} 天的自动化预算软上限。`,
    };
  }

  if (input.usageCost === null || !Number.isFinite(input.usageCost)) {
    return {
      status: "usage_unavailable",
      budgetUsd,
      currentUsageCost: null,
      remainingUsd: null,
      usageRatio: null,
      windowDays,
      shouldEscalateToApproval: true,
      title: "暂时无法判断自动化预算风险",
      detail: `当前已配置近 ${windowDays} 天预算上限 ${formatUsd(budgetUsd)}，但暂时无法读取最近 usage 成本。为避免预算失控，新的启用动作会自动升级为人工审批。`,
    };
  }

  const currentUsageCost = Math.max(0, input.usageCost);
  const usageRatio = budgetUsd > 0 ? currentUsageCost / budgetUsd : null;
  const remainingUsd = Number((budgetUsd - currentUsageCost).toFixed(2));

  if (currentUsageCost > budgetUsd) {
    return {
      status: "over_budget",
      budgetUsd,
      currentUsageCost,
      remainingUsd,
      usageRatio,
      windowDays,
      shouldEscalateToApproval: true,
      title: "自动化预算已超限",
      detail: `最近 ${windowDays} 天 usage 成本 ${formatUsd(currentUsageCost)}，已超过自动化预算上限 ${formatUsd(budgetUsd)}。后续启用将自动升级为人工审批。`,
    };
  }

  if (currentUsageCost >= budgetUsd * AUTOMATION_BUDGET_WARNING_RATIO) {
    return {
      status: "warning",
      budgetUsd,
      currentUsageCost,
      remainingUsd,
      usageRatio,
      windowDays,
      shouldEscalateToApproval: false,
      title: "自动化预算接近上限",
      detail: `最近 ${windowDays} 天 usage 成本 ${formatUsd(currentUsageCost)}，距离预算上限 ${formatUsd(budgetUsd)} 只剩 ${formatUsd(Math.max(0, remainingUsd))}。`,
    };
  }

  return {
    status: "within_budget",
    budgetUsd,
    currentUsageCost,
    remainingUsd,
    usageRatio,
    windowDays,
    shouldEscalateToApproval: false,
    title: "自动化预算处于安全范围",
    detail: `最近 ${windowDays} 天 usage 成本 ${formatUsd(currentUsageCost)}，低于预算上限 ${formatUsd(budgetUsd)}。`,
  };
}
