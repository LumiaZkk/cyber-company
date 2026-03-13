import type { CostUsageTotals } from "../gateway";

export type UsageLoadStatus = "loading" | "loaded" | "empty" | "error";

export type CompanyUsageTrustState =
  | "trusted_company"
  | "estimated_company"
  | "gateway_fallback"
  | "unavailable";

export type CompanyUsageTrustMetric = {
  label: string;
  value: string;
};

export type CompanyUsageTrustSummary = {
  state: CompanyUsageTrustState;
  badgeLabel: string;
  title: string;
  summary: string;
  detail: string;
  metrics: CompanyUsageTrustMetric[];
};

type CompanyUsageTrustInput = {
  companyName: string;
  usageDays: number;
  gatewayUsageStatus: UsageLoadStatus;
  gatewayUsageError?: string | null;
  companyUsageStatus: UsageLoadStatus;
  companyUsageError?: string | null;
  companyUsage: {
    sessionCount: number;
    unattributedSessionCount: number;
    coverageRatio: number | null;
    excludedBeforeCompanyCreation: number;
    excludedExternalGroupMembers: number;
    totals: Pick<CostUsageTotals, "missingCostEntries">;
  } | null;
};

function formatCoverageRatio(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }
  return `${Math.round(value * 100)}%`;
}

export function buildCompanyUsageTrustSummary(
  input: CompanyUsageTrustInput,
): CompanyUsageTrustSummary {
  const {
    companyName,
    usageDays,
    gatewayUsageStatus,
    gatewayUsageError,
    companyUsageStatus,
    companyUsageError,
    companyUsage,
  } = input;

  if (companyUsageStatus === "loaded" && companyUsage) {
    const missingCostEntries = companyUsage.totals.missingCostEntries ?? 0;
    const estimated = companyUsage.unattributedSessionCount > 0 || missingCostEntries > 0;
    const detailParts: string[] = [];

    if (companyUsage.excludedBeforeCompanyCreation > 0) {
      detailParts.push(
        `${companyUsage.excludedBeforeCompanyCreation} 个会话发生在公司创建前，已排除在归因口径外`,
      );
    }
    if (companyUsage.excludedExternalGroupMembers > 0) {
      detailParts.push(
        `${companyUsage.excludedExternalGroupMembers} 个群聊会话包含外部成员，已排除在公司成本归因外`,
      );
    }
    if (missingCostEntries > 0) {
      detailParts.push(`${missingCostEntries} 条 usage 缺少定价，当前成本仍然偏估算值`);
    }

    return {
      state: estimated ? "estimated_company" : "trusted_company",
      badgeLabel: estimated ? "归因估算" : "公司归因",
      title: estimated ? "当前成本已归因，但可信度仍有缺口" : "当前成本已具备公司级可信归因",
      summary: estimated
        ? `最近 ${usageDays} 天的成本已经归因到「${companyName}」的 ${companyUsage.sessionCount} 个会话，但还有 ${companyUsage.unattributedSessionCount} 个公司会话未进入当前账单。`
        : `最近 ${usageDays} 天的成本已经稳定归因到「${companyName}」的 ${companyUsage.sessionCount} 个公司会话。`,
      detail:
        detailParts.join("；") || "当前归因覆盖完整，且没有发现缺失定价的 usage 记录。",
      metrics: [
        {
          label: "归因会话",
          value: String(companyUsage.sessionCount),
        },
        {
          label: "归因覆盖",
          value: formatCoverageRatio(companyUsage.coverageRatio),
        },
        {
          label: "未归因会话",
          value: String(companyUsage.unattributedSessionCount),
        },
      ],
    };
  }

  if (gatewayUsageStatus === "loaded") {
    const summary =
      companyUsageStatus === "loading"
        ? `正在校准「${companyName}」最近 ${usageDays} 天的公司级归因，当前先显示 Gateway 汇总口径。`
        : companyUsageStatus === "error"
          ? `公司级归因暂时失败，当前回退为 Gateway 最近 ${usageDays} 天汇总。`
          : `当前还没有足够的公司级归因覆盖，先显示 Gateway 最近 ${usageDays} 天汇总。`;

    return {
      state: "gateway_fallback",
      badgeLabel: "Gateway 汇总",
      title: "当前成本仍在使用回退口径",
      summary,
      detail:
        companyUsageError?.trim()
        || "这张卡片还不能证明成本已经稳定归因到当前公司，所以只能把 Gateway 的汇总值当成近似参考。",
      metrics: [
        {
          label: "归因会话",
          value: "--",
        },
        {
          label: "归因覆盖",
          value: "--",
        },
        {
          label: "当前口径",
          value: "Gateway",
        },
      ],
    };
  }

  return {
    state: "unavailable",
    badgeLabel: "成本不可用",
    title: "当前还没有可用的成本可信视图",
    summary:
      gatewayUsageStatus === "loading"
        ? "正在拉取 usage 数据，暂时还无法判断当前成本是否可信。"
        : "目前既没有稳定的公司级归因结果，也没有可用的 Gateway usage 汇总。",
    detail:
      gatewayUsageError?.trim()
      || companyUsageError?.trim()
      || "需要先让 Gateway usage 恢复可读，之后才能判断公司归因覆盖是否可靠。",
    metrics: [
      {
        label: "归因会话",
        value: "--",
      },
      {
        label: "归因覆盖",
        value: "--",
      },
      {
        label: "当前口径",
        value: "不可用",
      },
    ],
  };
}
