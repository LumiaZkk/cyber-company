import type {
  Company,
  CompanyAutonomyPolicy,
  CompanyCollaborationPolicy,
  CompanyDepartmentAutonomyCounter,
  CompanyOrgSettings,
  CompanyWorkspacePolicy,
} from "./types";

export const DEFAULT_AUTONOMY_POLICY: Required<CompanyAutonomyPolicy> = {
  autoApproveInternalReassignments: true,
  autoApproveSupportRequests: true,
  humanApprovalRequiredForLayoffs: true,
  humanApprovalRequiredForDepartmentCreateRemove: true,
  humanApprovalRequiredForAutomationEnable: true,
  automationMonthlyBudgetUsd: 0,
  maxAutoHeadcountDelta: 1,
  maxAutoBudgetDelta: 1,
  supportSlaHours: 6,
  departmentBlockerEscalationHours: 4,
};

export const DEFAULT_COLLABORATION_POLICY: Required<CompanyCollaborationPolicy> = {
  globalDispatchMetaRoles: ["ceo", "hr"],
  allowDepartmentLeadToDispatchWithinDepartment: true,
  allowDepartmentLeadToDispatchToSupportLeads: true,
  allowDepartmentLeadToDispatchToCeo: true,
  allowDepartmentMembersWithinDepartment: true,
  allowDepartmentMembersToManager: true,
  explicitEdges: [],
};

export const DEFAULT_WORKSPACE_POLICY: Required<CompanyWorkspacePolicy> = {
  deliverySource: "artifact_store",
  providerMirrorMode: "fallback",
  executorWriteTarget: "agent_workspace",
};

function normalizeDepartmentCounters(
  counters: CompanyDepartmentAutonomyCounter[] | null | undefined,
): CompanyDepartmentAutonomyCounter[] {
  return Array.isArray(counters)
    ? counters
        .filter((item): item is CompanyDepartmentAutonomyCounter => Boolean(item && item.departmentId))
        .map((item) => ({
          departmentId: item.departmentId,
          overloadStreak: Math.max(0, item.overloadStreak ?? 0),
          underloadStreak: Math.max(0, item.underloadStreak ?? 0),
          lastLoadScore: Math.max(0, item.lastLoadScore ?? 0),
          updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : 0,
        }))
    : [];
}

export function buildDefaultOrgSettings(
  orgSettings?: CompanyOrgSettings | null,
): CompanyOrgSettings {
  return {
    autoCalibrate: orgSettings?.autoCalibrate ?? true,
    lastAutoCalibratedAt: orgSettings?.lastAutoCalibratedAt,
    lastAutoCalibrationActions: orgSettings?.lastAutoCalibrationActions ?? [],
    autonomyPolicy: {
      ...DEFAULT_AUTONOMY_POLICY,
      ...(orgSettings?.autonomyPolicy ?? {}),
    },
    autonomyState: {
      lastEngineRunAt: orgSettings?.autonomyState?.lastEngineRunAt,
      lastEngineActions: orgSettings?.autonomyState?.lastEngineActions ?? [],
      departmentCounters: normalizeDepartmentCounters(
        orgSettings?.autonomyState?.departmentCounters,
      ),
    },
    collaborationPolicy: {
      ...DEFAULT_COLLABORATION_POLICY,
      ...(orgSettings?.collaborationPolicy ?? {}),
      globalDispatchMetaRoles:
        orgSettings?.collaborationPolicy?.globalDispatchMetaRoles ??
        DEFAULT_COLLABORATION_POLICY.globalDispatchMetaRoles,
      explicitEdges: orgSettings?.collaborationPolicy?.explicitEdges ?? [],
    },
    workspacePolicy: {
      ...DEFAULT_WORKSPACE_POLICY,
      ...(orgSettings?.workspacePolicy ?? {}),
    },
  };
}

export function applyCompanyAutonomyDefaults(company: Company): Company {
  return {
    ...company,
    orgSettings: buildDefaultOrgSettings(company.orgSettings),
  };
}
