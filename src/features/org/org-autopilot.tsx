import { useEffect, useRef } from "react";
import type { Company } from "../company/types";
import { useCompanyStore } from "../company/store";
import { useGatewayStore } from "../gateway/store";
import { toast } from "../ui/toast-store";
import { autoCalibrateOrganization, isOrgAutopilotEnabled } from "./org-advisor";

function buildOrgFingerprint(company: Company): string {
  return JSON.stringify({
    id: company.id,
    autoCalibrate: isOrgAutopilotEnabled(company),
    departments: (company.departments ?? []).map((department) => ({
      id: department.id,
      leadAgentId: department.leadAgentId,
      archived: department.archived ?? false,
    })),
    employees: company.employees.map((employee) => ({
      agentId: employee.agentId,
      departmentId: employee.departmentId ?? null,
      reportsTo: employee.reportsTo ?? null,
      isMeta: employee.isMeta,
    })),
  });
}

export function OrgAutopilot() {
  const activeCompany = useCompanyStore((state) => state.activeCompany);
  const updateCompany = useCompanyStore((state) => state.updateCompany);
  const connected = useGatewayStore((state) => state.connected);
  const runningRef = useRef(false);
  const lastFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (!connected || !activeCompany || !isOrgAutopilotEnabled(activeCompany) || runningRef.current) {
      return;
    }

    const fingerprint = buildOrgFingerprint(activeCompany);
    if (lastFingerprintRef.current === fingerprint) {
      return;
    }
    lastFingerprintRef.current = fingerprint;
    runningRef.current = true;

    let cancelled = false;
    const run = async () => {
      try {
        const result = autoCalibrateOrganization(activeCompany);
        if (!result.changed || cancelled) {
          return;
        }

        await updateCompany({
          departments: result.departments,
          employees: result.employees,
          orgSettings: {
            ...(activeCompany.orgSettings ?? {}),
            autoCalibrate: true,
            lastAutoCalibratedAt: Date.now(),
            lastAutoCalibrationActions: result.appliedRecommendations.map((item) => item.title),
          },
        });

        for (const warning of result.warnings) {
          toast.info("组织自动校准", warning);
        }

        const summary = result.appliedRecommendations
          .slice(0, 2)
          .map((item) => item.title)
          .join(" · ");
        const suffix =
          result.appliedRecommendations.length > 2
            ? ` 等 ${result.appliedRecommendations.length} 项`
            : "";
        toast.success("组织已自动校准", `${summary}${suffix}`);
      } catch (error) {
        console.error("Failed to auto-calibrate organization", error);
        if (!cancelled) {
          toast.error("组织自动校准失败", error instanceof Error ? error.message : String(error));
        }
      } finally {
        runningRef.current = false;
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeCompany, connected, updateCompany]);

  return null;
}
