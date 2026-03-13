import { useEffect, useMemo, useRef, useState } from "react";
import { mapAgentRuntimeAvailabilityToLegacyStatus } from "../agent-runtime";
import { resolveCompanyKnowledge } from "../artifact/shared-knowledge";
import { attributeUsageSessionsToCompany } from "../company/usage-attribution";
import { buildCompanyUsageTrustSummary } from "../company/usage-trust";
import { gateway, type AgentListEntry, type CostUsageSummary, type GatewaySessionRow } from "../gateway";
import {
  buildEmployeeOperationalInsights,
  buildOutcomeReport,
  buildRetrospectiveSnapshot,
} from "../governance/company-insights";
import { useOrgApp, useOrgQuery } from "../org";
import { isSessionActive, resolveSessionActorId } from "../../lib/sessions";
import { formatTime } from "../../lib/utils";

type UsageStatus = "loading" | "loaded" | "empty" | "error";

type AttributedUsage = {
  totals: CostUsageSummary["totals"];
  sessionCount: number;
  updatedAt: number;
  countsByKind: {
    main: number;
    group: number;
    ad_hoc: number;
  };
  unattributedSessionCount: number;
  coverageRatio: number | null;
  excludedBeforeCompanyCreation: number;
  excludedExternalGroupMembers: number;
};

export function useDashboardViewModel() {
  const { activeCompany, activeAgentSessions, activeAgentRuntime } = useOrgQuery();
  const { updateCompany } = useOrgApp();
  const [agents, setAgents] = useState<AgentListEntry[]>([]);
  const [sessions, setSessions] = useState<GatewaySessionRow[]>([]);
  const [usage, setUsage] = useState<CostUsageSummary | null>(null);
  const [usageStatus, setUsageStatus] = useState<UsageStatus>("loading");
  const [usageError, setUsageError] = useState<string | null>(null);
  const [companyUsage, setCompanyUsage] = useState<AttributedUsage | null>(null);
  const [companyUsageStatus, setCompanyUsageStatus] = useState<UsageStatus>("loading");
  const [companyUsageError, setCompanyUsageError] = useState<string | null>(null);
  const [lastUsageRefreshAt, setLastUsageRefreshAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [connected, setConnected] = useState(gateway.isConnected);
  const usageRef = useRef<CostUsageSummary | null>(null);

  useEffect(() => {
    usageRef.current = usage;
  }, [usage]);

  useEffect(() => {
    const connPoller = setInterval(() => setConnected(gateway.isConnected), 2000);
    return () => clearInterval(connPoller);
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      if (!activeCompany) {
        setLoading(false);
        return;
      }

      if (!connected) {
        setLoading(false);
        if (!usageRef.current) {
          setUsageStatus("empty");
        }
        setCompanyUsageStatus("empty");
        return;
      }

      setLoading(true);
      setCompanyUsageStatus("loading");

      try {
        const [agentsRes, sessionsRes, costRes, sessionsUsageRes] = await Promise.allSettled([
          gateway.listAgents(),
          gateway.listSessions(),
          gateway.getUsageCost(),
          gateway.getSessionsUsage({ limit: 200 }),
        ]);

        if (agentsRes.status === "fulfilled") {
          setAgents(agentsRes.value.agents || []);
        }

        if (sessionsRes.status === "fulfilled") {
          setSessions(sessionsRes.value.sessions || []);
        }

        if (costRes.status === "fulfilled") {
          setUsage(costRes.value);
          setUsageStatus("loaded");
          setUsageError(null);
          setLastUsageRefreshAt(Date.now());
        } else {
          setUsageError(costRes.reason instanceof Error ? costRes.reason.message : String(costRes.reason));
          if (!usageRef.current) {
            setUsageStatus("error");
          }
        }

        if (sessionsUsageRes.status === "fulfilled") {
          const attribution = attributeUsageSessionsToCompany({
            company: activeCompany,
            sessions: sessionsUsageRes.value.sessions,
          });

          if (attribution.sessions.length > 0) {
            setCompanyUsage({
              totals: attribution.totals,
              sessionCount: attribution.sessions.length,
              updatedAt: sessionsUsageRes.value.updatedAt,
              countsByKind: attribution.countsByKind,
              unattributedSessionCount: attribution.unattributedSessionCount,
              coverageRatio: attribution.coverageRatio,
              excludedBeforeCompanyCreation: attribution.excludedBeforeCompanyCreation,
              excludedExternalGroupMembers: attribution.excludedExternalGroupMembers,
            });
            setCompanyUsageStatus("loaded");
            setCompanyUsageError(null);
          } else {
            setCompanyUsage(null);
            setCompanyUsageStatus("empty");
            setCompanyUsageError(null);
          }
        } else {
          setCompanyUsage(null);
          setCompanyUsageStatus("error");
          setCompanyUsageError(
            sessionsUsageRes.reason instanceof Error
              ? sessionsUsageRes.reason.message
              : String(sessionsUsageRes.reason),
          );
        }
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
    const timer = setInterval(() => {
      void loadDashboard();
    }, 10000);

    return () => clearInterval(timer);
  }, [activeCompany, connected]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const surface = useMemo(() => {
    if (!activeCompany) {
      return null;
    }

    const companyAgentIds = new Set(activeCompany.employees.map((employee) => employee.agentId));
    const companySessions = sessions
      .map((session) => ({ ...session, agentId: resolveSessionActorId(session) }))
      .filter((session): session is GatewaySessionRow & { agentId: string } => {
        return typeof session.agentId === "string" && companyAgentIds.has(session.agentId);
      });

    const sessionRuntimeByKey = new Map(
      activeAgentSessions.map((session) => [session.sessionKey, session] as const),
    );
    const activeRuntimeSessionKeys = new Set(
      activeAgentRuntime.flatMap((runtime) => runtime.activeSessionKeys),
    );
    const activeSessions = companySessions.filter((session) => {
      const sessionRuntime = sessionRuntimeByKey.get(session.key);
      if (sessionRuntime) {
        return sessionRuntime.sessionState === "running" || sessionRuntime.sessionState === "streaming";
      }
      if (activeRuntimeSessionKeys.has(session.key)) {
        return true;
      }
      return isSessionActive(session, currentTime);
    });
    const runningAgentIds = new Set(
      activeAgentRuntime
        .filter((runtime) => mapAgentRuntimeAvailabilityToLegacyStatus(runtime.availability) === "running")
        .map((runtime) => runtime.agentId),
    );
    const runningAgents = activeCompany.employees.filter((employee) =>
      runningAgentIds.has(employee.agentId),
    );

    const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name ?? agent.id]));
    const usageDays = usage?.days ?? 30;
    const showingCompanyUsage = companyUsageStatus === "loaded" && Boolean(companyUsage);
    const displayedTotals = companyUsage?.totals ?? usage?.totals ?? null;
    const displayedUpdatedAt =
      companyUsage?.updatedAt ?? usage?.updatedAt ?? lastUsageRefreshAt ?? null;
    const missingCostEntries = displayedTotals?.missingCostEntries ?? 0;
    const usageTrust = buildCompanyUsageTrustSummary({
      companyName: activeCompany.name,
      usageDays,
      gatewayUsageStatus: usageStatus,
      gatewayUsageError: usageError,
      companyUsageStatus,
      companyUsageError,
      companyUsage,
    });

    const totalTokensStr = displayedTotals
      ? (displayedTotals.totalTokens / 1_000_000).toFixed(2)
      : "--";
    const totalCostStr = displayedTotals ? displayedTotals.totalCost.toFixed(4) : "--";
    const usageEstimateNote = displayedTotals
      ? missingCostEntries > 0
        ? `估算口径，且有 ${missingCostEntries} 条记录缺少定价，成本可能偏低`
        : "估算口径，按日志成本或模型定价配置汇总"
      : "";
    const usageFootnote = displayedTotals
      ? `最近更新 ${formatTime(displayedUpdatedAt)} · ${usageEstimateNote}`
      : usageStatus === "loading"
        ? "正在获取 usage 数据..."
        : usageStatus === "error"
          ? `未能读取 usage 数据：${usageError || "未知错误"}`
          : "网关暂未返回 usage 数据";
    const tokenCardLabel = showingCompanyUsage
      ? `${activeCompany.name} 近 ${usageDays} 天归因吞吐`
      : `网关近 ${usageDays} 天吞吐`;
    const costCardLabel = showingCompanyUsage
      ? `${activeCompany.name} 近 ${usageDays} 天归因成本`
      : `网关近 ${usageDays} 天估算成本`;
    const utilization =
      activeCompany.employees.length > 0
        ? Math.round((runningAgents.length / activeCompany.employees.length) * 100)
        : 0;
    const companyKnowledge = resolveCompanyKnowledge(activeCompany);
    const employeeInsights = buildEmployeeOperationalInsights({
      company: {
        ...activeCompany,
        knowledgeItems: companyKnowledge,
      },
      sessions: companySessions,
      activeAgentRuntime,
      now: currentTime,
    });
    const outcomeReport = buildOutcomeReport({
      company: {
        ...activeCompany,
        knowledgeItems: companyKnowledge,
      },
      employeeInsights,
      now: currentTime,
    });
    const retrospective = buildRetrospectiveSnapshot({
      company: {
        ...activeCompany,
        knowledgeItems: companyKnowledge,
      },
      outcome: outcomeReport,
      employeeInsights,
    });

    return {
      activeSessions,
      agentNameById,
      companyKnowledge,
      companySessions,
      connected,
      costCardLabel,
      employeeInsights,
      loading,
      outcomeReport,
      retrospective,
      runningAgents,
      tokenCardLabel,
      totalCostStr,
      totalTokensStr,
      usageFootnote,
      usageTrust,
      utilization,
    };
  }, [
    activeCompany,
    activeAgentSessions,
    activeAgentRuntime,
    agents,
    companyUsage,
    companyUsageError,
    companyUsageStatus,
    connected,
    currentTime,
    lastUsageRefreshAt,
    loading,
    sessions,
    usage,
    usageError,
    usageStatus,
  ]);

  const persistRetrospective = async () => {
    if (!activeCompany || !surface) {
      return null;
    }

    const record = {
      id: `retro:${activeCompany.id}:${Date.now()}`,
      periodLabel: surface.retrospective.periodLabel,
      summary: surface.retrospective.summary,
      wins: surface.retrospective.wins,
      risks: surface.retrospective.risks,
      actionItems: surface.retrospective.actionItems,
      generatedAt: Date.now(),
    };
    const history = [record, ...(activeCompany.retrospectives ?? [])].slice(0, 6);
    await updateCompany({ retrospectives: history });
    return { title: "复盘已写入", description: "当前运营周期的复盘和动作项已保存到公司记录。" };
  };

  return {
    activeCompany,
    persistRetrospective,
    surface,
  };
}
