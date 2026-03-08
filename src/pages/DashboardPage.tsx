import { BarChart, Activity, Zap, HardDrive, DollarSign, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { useCompanyStore } from "../features/company/store";
import {
  gateway,
  type AgentListEntry,
  type CostUsageSummary,
  type GatewaySessionRow,
} from "../features/backend";
import {
  buildEmployeeOperationalInsights,
  buildOutcomeReport,
  buildRetrospectiveSnapshot,
} from "../features/insights/company-insights";
import { resolveCompanyKnowledge } from "../features/knowledge/shared-knowledge";
import { toast } from "../features/ui/toast-store";
import { attributeUsageSessionsToCompany } from "../features/usage/company-usage-attribution";
import {
  isSessionActive,
  parseAgentIdFromSessionKey,
} from "../lib/sessions";
import { formatTime } from "../lib/utils";

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
  excludedBeforeCompanyCreation: number;
  excludedExternalGroupMembers: number;
};

export function DashboardPage() {
  const { activeCompany, updateCompany } = useCompanyStore();
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
    async function loadDash() {
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
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }

    void loadDash();
    const timer = setInterval(() => {
      void loadDash();
    }, 10000);

    return () => clearInterval(timer);
  }, [activeCompany, connected]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  const companyAgentIds = new Set(activeCompany.employees.map((employee) => employee.agentId));
  const companySessions = sessions
    .map((session) => ({ ...session, agentId: parseAgentIdFromSessionKey(session.key) }))
    .filter((session): session is GatewaySessionRow & { agentId: string } => {
      return typeof session.agentId === "string" && companyAgentIds.has(session.agentId);
    });

  const activeSessions = companySessions.filter((session) => isSessionActive(session, currentTime));
  const runningAgentIds = new Set(activeSessions.map((session) => session.agentId));
  const runningAgents = activeCompany.employees.filter((employee) =>
    runningAgentIds.has(employee.agentId),
  );

  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name ?? agent.id]));
  const usageDays = usage?.days ?? 30;
  const showingCompanyUsage = companyUsageStatus === "loaded" && Boolean(companyUsage);
  const displayedTotals = companyUsage?.totals ?? usage?.totals ?? null;
  const displayedUpdatedAt =
    companyUsage?.updatedAt ?? usage?.updatedAt ?? lastUsageRefreshAt ?? null;
  const gatewayCostStr = usage ? usage.totals.totalCost.toFixed(4) : "--";
  const missingCostEntries = displayedTotals?.missingCostEntries ?? 0;

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
  const usageScopeNote = showingCompanyUsage
    ? `当前卡片已按「${activeCompany.name}」的 ${companyUsage?.sessionCount ?? 0} 个会话归因（${companyUsage?.countsByKind.main ?? 0} 主会话 / ${companyUsage?.countsByKind.group ?? 0} 群聊 / ${companyUsage?.countsByKind.ad_hoc ?? 0} 临时会话）；网关同期汇总估算为 $ ${gatewayCostStr}。`
    : companyUsageStatus === "error"
      ? `公司级成本归因暂时失败，当前回退为 Gateway 最近 ${usageDays} 天汇总。${companyUsageError ? `错误：${companyUsageError}` : ""}`
      : `当前展示的是 Gateway 最近 ${usageDays} 天的汇总估算，不是「${activeCompany.name}」的独占账单。`;
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

  const persistRetrospective = async () => {
    const record = {
      id: `retro:${activeCompany.id}:${Date.now()}`,
      periodLabel: retrospective.periodLabel,
      summary: retrospective.summary,
      wins: retrospective.wins,
      risks: retrospective.risks,
      actionItems: retrospective.actionItems,
      generatedAt: Date.now(),
    };
    const history = [record, ...(activeCompany.retrospectives ?? [])].slice(0, 6);
    await updateCompany({ retrospectives: history });
    toast.success("复盘已写入", "当前运营周期的复盘和动作项已保存到公司记录。");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 lg:p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart className="w-8 h-8 text-teal-600" />
            运营与监控报表
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">先看交付是否推进，再看团队负载和资源成本。</p>
        </div>
        <Badge
          variant="outline"
          className={`px-3 py-1 flex items-center gap-1.5 ${connected ? "text-teal-700 bg-teal-50/80 border-teal-200 backdrop-blur-sm" : "text-slate-500 bg-slate-50 border-slate-200"}`}
        >
          {connected ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
            </span>
          ) : (
            <Activity className="w-3 h-3 text-slate-400" />
          )}
          {connected ? "Gateway 心跳正常" : "网络未连接"}
        </Badge>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground animate-pulse mb-4">正在汇聚系统参数...</div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
        <div className="font-medium">成本口径说明</div>
        <div className="mt-1 text-xs leading-5 text-amber-900/80">{usageScopeNote}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 shrink-0 mt-4">
        <Card className="bg-white border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              任务完成率
            </CardDescription>
            <CardTitle className="text-3xl font-black text-emerald-700 flex items-center justify-between">
              {outcomeReport.completionRate}%
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              共 {outcomeReport.totalTasks} 条结构化任务，已完成 {outcomeReport.completedTasks} 条。
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              交接闭环率
            </CardDescription>
            <CardTitle className="text-3xl font-black text-indigo-700 flex items-center justify-between">
              {outcomeReport.handoffCompletionRate}%
              <Users className="w-5 h-5 text-indigo-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              共 {outcomeReport.totalHandoffs} 条交接，待完成 {outcomeReport.pendingHandoffs}，阻塞 {outcomeReport.blockedHandoffs}。
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              人工接管与阻塞
            </CardDescription>
            <CardTitle className="text-3xl font-black text-amber-700 flex items-center justify-between">
              {outcomeReport.manualTakeovers}
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              阻塞率 {outcomeReport.blockedRate}% ，等待率 {outcomeReport.waitingRate}%。
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              团队稳定性
            </CardDescription>
            <CardTitle className="text-3xl font-black text-slate-800 flex items-center justify-between">
              {outcomeReport.avgReliabilityScore}
              <Activity className="w-5 h-5 text-slate-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              SLA {outcomeReport.slaAlerts} 条，过载 {outcomeReport.overloadedEmployees}，脆弱 {outcomeReport.fragileEmployees}。
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
        <Card className="bg-gradient-to-br from-white to-slate-50 border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              当前忙碌成员占比
            </CardDescription>
            <CardTitle className="text-3xl font-black text-slate-800 flex items-center justify-between">
              {utilization}%
              <Activity className="w-5 h-5 text-indigo-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full"
                style={{ width: `${utilization}%` }}
              ></div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              总数 {activeCompany.employees.length} 名成员中，{runningAgents.length} 名当前有活跃会话
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white to-slate-50 border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              活跃会话数
            </CardDescription>
            <CardTitle className="text-3xl font-black text-slate-800 flex items-center justify-between">
              {activeSessions.length}
              <Zap className="w-5 h-5 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mt-5 flex items-center">
              当前仍在持续推进的会话总数
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white to-slate-50 border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {tokenCardLabel}
            </CardDescription>
            <CardTitle className="text-3xl font-black text-slate-800 flex items-center justify-between">
              {totalTokensStr}{" "}
              <span className="text-sm text-slate-500 font-medium">百万 Token</span>
              <HardDrive className="w-5 h-5 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mt-5">{usageFootnote}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white to-slate-50 border-slate-200 border-l-4 border-l-teal-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {costCardLabel}
            </CardDescription>
            <CardTitle className="text-3xl font-black text-teal-800 flex items-center justify-between">
              $ {totalCostStr}
              <DollarSign className="w-5 h-5 text-teal-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-teal-600/70 mt-5 font-medium">{usageFootnote}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8 flex-1 min-h-0">
        <Card className="lg:col-span-2 flex flex-col shadow-sm bg-white/40 backdrop-blur-sm ring-1 ring-black/5 border-0">
          <CardHeader className="border-b bg-slate-50/50 pb-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart className="w-4 h-4 text-indigo-600" /> 结果导向复盘
              </CardTitle>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => void persistRetrospective()}
              >
                写入本期复盘
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-6 bg-slate-50/50 min-h-[250px]">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-sm font-semibold text-slate-900">{retrospective.periodLabel}</div>
              <div className="mt-2 text-sm leading-6 text-slate-700">{retrospective.summary}</div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  做得好的
                </div>
                <div className="mt-3 space-y-2 text-sm text-emerald-950">
                  {retrospective.wins.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  当前风险
                </div>
                <div className="mt-3 space-y-2 text-sm text-amber-950">
                  {retrospective.risks.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  下一步动作
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-800">
                  {retrospective.actionItems.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 flex flex-col shadow-sm bg-white/40 backdrop-blur-sm ring-1 ring-black/5 border-0">
          <CardHeader className="border-b bg-slate-50/50 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-600" /> 成员可靠性画像
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">成员昵称</th>
                  <th className="px-4 py-3 text-right">可靠性</th>
                </tr>
              </thead>
              <tbody>
                {employeeInsights
                  .slice()
                  .sort((left, right) => right.reliabilityScore - left.reliabilityScore)
                  .map((employee, index) => (
                    <tr key={employee.agentId} className="border-b last:border-0 hover:bg-slate-50 align-top">
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        <span
                          className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${index === 0 ? "bg-amber-100 text-amber-700" : index === 1 ? "bg-slate-200 text-slate-700" : index === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {index + 1}
                        </span>
                        <div>
                          <div>{agentNameById.get(employee.agentId) ?? employee.nickname}</div>
                          <div className="mt-1 text-[11px] font-normal text-slate-500">
                            负载 {employee.loadScore} · 告警 {employee.overdueAlerts}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono text-slate-700">{employee.reliabilityScore}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {employee.reliabilityState === "strong"
                            ? "稳定"
                            : employee.reliabilityState === "watch"
                              ? "观察"
                              : "脆弱"}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
