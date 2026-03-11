import { useEffect, useRef } from "react";
import { useOrgQuery } from "../../application/org";
import { toast } from "../../components/system/toast-store";

function buildAutonomyFingerprint(companyId: string, actions: string[]): string {
  return JSON.stringify({
    companyId,
    actions,
  });
}

export function OrgAutopilotHost() {
  const { activeCompany } = useOrgQuery();
  const lastFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeCompany) {
      return;
    }
    const ts = activeCompany.orgSettings?.autonomyState?.lastEngineRunAt ?? null;
    const actions = activeCompany.orgSettings?.autonomyState?.lastEngineActions ?? [];
    if (!ts || actions.length === 0) {
      return;
    }
    const fingerprint = buildAutonomyFingerprint(activeCompany.id, actions);
    if (fingerprint === lastFingerprintRef.current) {
      return;
    }
    lastFingerprintRef.current = fingerprint;
    toast.info("自治引擎更新", actions.slice(0, 2).join(" · "));
  }, [activeCompany]);

  return null;
}
