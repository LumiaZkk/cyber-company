import { describe, expect, it } from "vitest";
import { buildCompanyUsageTrustSummary } from "./usage-trust";

describe("buildCompanyUsageTrustSummary", () => {
  it("returns trusted_company when attribution is complete", () => {
    const summary = buildCompanyUsageTrustSummary({
      companyName: "Cyber Company",
      usageDays: 30,
      gatewayUsageStatus: "loaded",
      companyUsageStatus: "loaded",
      companyUsage: {
        sessionCount: 4,
        unattributedSessionCount: 0,
        coverageRatio: 1,
        excludedBeforeCompanyCreation: 0,
        excludedExternalGroupMembers: 0,
        totals: {
          missingCostEntries: 0,
        },
      },
    });

    expect(summary.state).toBe("trusted_company");
    expect(summary.badgeLabel).toBe("公司归因");
    expect(summary.metrics[1]?.value).toBe("100%");
  });

  it("returns estimated_company when attribution has coverage gaps", () => {
    const summary = buildCompanyUsageTrustSummary({
      companyName: "Cyber Company",
      usageDays: 30,
      gatewayUsageStatus: "loaded",
      companyUsageStatus: "loaded",
      companyUsage: {
        sessionCount: 2,
        unattributedSessionCount: 1,
        coverageRatio: 2 / 3,
        excludedBeforeCompanyCreation: 1,
        excludedExternalGroupMembers: 0,
        totals: {
          missingCostEntries: 2,
        },
      },
    });

    expect(summary.state).toBe("estimated_company");
    expect(summary.badgeLabel).toBe("归因估算");
    expect(summary.detail).toContain("公司创建前");
    expect(summary.detail).toContain("缺少定价");
  });

  it("returns gateway_fallback when company attribution fails", () => {
    const summary = buildCompanyUsageTrustSummary({
      companyName: "Cyber Company",
      usageDays: 30,
      gatewayUsageStatus: "loaded",
      companyUsageStatus: "error",
      companyUsageError: "sessions.usage timeout",
      companyUsage: null,
    });

    expect(summary.state).toBe("gateway_fallback");
    expect(summary.detail).toContain("timeout");
  });

  it("returns unavailable when neither company nor gateway usage is available", () => {
    const summary = buildCompanyUsageTrustSummary({
      companyName: "Cyber Company",
      usageDays: 30,
      gatewayUsageStatus: "error",
      gatewayUsageError: "usage unavailable",
      companyUsageStatus: "empty",
      companyUsage: null,
    });

    expect(summary.state).toBe("unavailable");
    expect(summary.badgeLabel).toBe("成本不可用");
  });
});
