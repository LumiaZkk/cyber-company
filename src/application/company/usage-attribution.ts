import type {
  CostUsageTotals,
  SessionsUsageEntry,
} from "../gateway";
import type { Company } from "../../domain";

export type CompanyUsageSessionKind = "main" | "group" | "ad_hoc";

export type CompanyAttributedSession = SessionsUsageEntry & {
  kind: CompanyUsageSessionKind;
  firstActivity: number | null;
  groupMembers: string[];
};

export type CompanyUsageAttribution = {
  sessions: CompanyAttributedSession[];
  totals: CostUsageTotals;
  countsByKind: Record<CompanyUsageSessionKind, number>;
  eligibleSessionCount: number;
  unattributedSessionCount: number;
  coverageRatio: number | null;
  excludedBeforeCompanyCreation: number;
  excludedExternalGroupMembers: number;
};

function createEmptyCostUsageTotals(): CostUsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    missingCostEntries: 0,
  };
}

function mergeCostUsageTotals(target: CostUsageTotals, source: CostUsageTotals) {
  target.input += source.input;
  target.output += source.output;
  target.cacheRead += source.cacheRead;
  target.cacheWrite += source.cacheWrite;
  target.totalTokens += source.totalTokens;
  target.totalCost += source.totalCost;
  target.inputCost = (target.inputCost ?? 0) + (source.inputCost ?? 0);
  target.outputCost = (target.outputCost ?? 0) + (source.outputCost ?? 0);
  target.cacheReadCost = (target.cacheReadCost ?? 0) + (source.cacheReadCost ?? 0);
  target.cacheWriteCost = (target.cacheWriteCost ?? 0) + (source.cacheWriteCost ?? 0);
  target.missingCostEntries = (target.missingCostEntries ?? 0) + (source.missingCostEntries ?? 0);
}

function getScopedSessionRest(key: string): string {
  if (!key.startsWith("agent:")) {
    return key;
  }
  const firstColon = key.indexOf(":");
  const secondColon = key.indexOf(":", firstColon + 1);
  if (secondColon < 0) {
    return key;
  }
  return key.slice(secondColon + 1);
}

function classifySessionKind(key: string): CompanyUsageSessionKind {
  const rest = getScopedSessionRest(key).toLowerCase();
  if (rest === "main") {
    return "main";
  }
  if (rest.startsWith("group:")) {
    return "group";
  }
  return "ad_hoc";
}

function parseGroupMembers(key: string): string[] {
  const queryIndex = key.indexOf("?");
  if (queryIndex < 0) {
    return [];
  }

  const query = key.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  const members = params.get("m");
  if (!members) {
    return [];
  }

  return members
    .split(",")
    .map((member) => member.trim())
    .filter((member) => member.length > 0);
}

export function attributeUsageSessionsToCompany(params: {
  company: Company;
  sessions: SessionsUsageEntry[];
}): CompanyUsageAttribution {
  const { company, sessions } = params;
  const companyAgentIds = new Set(company.employees.map((employee) => employee.agentId));
  const totals = createEmptyCostUsageTotals();
  const countsByKind: Record<CompanyUsageSessionKind, number> = {
    main: 0,
    group: 0,
    ad_hoc: 0,
  };
  const attributedSessions: CompanyAttributedSession[] = [];
  let eligibleSessionCount = 0;
  let excludedBeforeCompanyCreation = 0;
  let excludedExternalGroupMembers = 0;

  for (const session of sessions) {
    if (!session.usage || typeof session.agentId !== "string" || !companyAgentIds.has(session.agentId)) {
      continue;
    }

    eligibleSessionCount += 1;

    const kind = classifySessionKind(session.key);
    const firstActivity =
      typeof session.usage.firstActivity === "number" ? session.usage.firstActivity : null;

    if (firstActivity !== null && firstActivity < company.createdAt) {
      excludedBeforeCompanyCreation += 1;
      continue;
    }

    const groupMembers = kind === "group" ? parseGroupMembers(session.key) : [];
    if (groupMembers.length > 0 && groupMembers.some((member) => !companyAgentIds.has(member))) {
      excludedExternalGroupMembers += 1;
      continue;
    }

    attributedSessions.push({
      ...session,
      kind,
      firstActivity,
      groupMembers,
    });
    countsByKind[kind] += 1;
    mergeCostUsageTotals(totals, session.usage);
  }

  const unattributedSessionCount = Math.max(0, eligibleSessionCount - attributedSessions.length);
  const coverageRatio =
    eligibleSessionCount > 0 ? attributedSessions.length / eligibleSessionCount : null;

  return {
    sessions: attributedSessions,
    totals,
    countsByKind,
    eligibleSessionCount,
    unattributedSessionCount,
    coverageRatio,
    excludedBeforeCompanyCreation,
    excludedExternalGroupMembers,
  };
}
