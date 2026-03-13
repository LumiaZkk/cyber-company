import { BarChart, Activity, Zap, HardDrive, DollarSign, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { useDashboardViewModel } from "../../application/dashboard";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { toast } from "../../components/system/toast-store";
import { ExecutiveSummaryStrip } from "../shared/ExecutiveSummaryStrip";

export function DashboardPresentationPage() {
  const { activeCompany, persistRetrospective, surface } = useDashboardViewModel();

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }
  if (!surface) {
    return <div className="p-8 text-center text-muted-foreground">正在汇聚系统参数...</div>;
  }

  const {
    activeSessions,
    agentNameById,
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
  } = surface;

  const usageTrustStyles = {
    trusted_company: {
      container: "border-emerald-200 bg-emerald-50/70 text-emerald-950",
      badge: "border-emerald-200 bg-emerald-100 text-emerald-800",
      metric: "text-emerald-900",
      detail: "text-emerald-900/80",
    },
    estimated_company: {
      container: "border-amber-200 bg-amber-50/70 text-amber-950",
      badge: "border-amber-200 bg-amber-100 text-amber-800",
      metric: "text-amber-900",
      detail: "text-amber-900/80",
    },
    gateway_fallback: {
      container: "border-slate-200 bg-slate-50/80 text-slate-900",
      badge: "border-slate-200 bg-white text-slate-700",
      metric: "text-slate-900",
      detail: "text-slate-700",
    },
    unavailable: {
      container: "border-rose-200 bg-rose-50/80 text-rose-950",
      badge: "border-rose-200 bg-rose-100 text-rose-800",
      metric: "text-rose-900",
      detail: "text-rose-900/80",
    },
  }[usageTrust.state];

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

      <div className={`rounded-xl border px-4 py-4 ${usageTrustStyles.container}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium">成本可信度</div>
              <Badge variant="outline" className={usageTrustStyles.badge}>
                {usageTrust.badgeLabel}
              </Badge>
            </div>
            <div className="mt-2 text-sm font-medium leading-6">{usageTrust.title}</div>
            <div className="mt-1 text-sm leading-6">{usageTrust.summary}</div>
            <div className={`mt-2 text-xs leading-5 ${usageTrustStyles.detail}`}>{usageTrust.detail}</div>
          </div>
          <div className="grid min-w-[220px] grid-cols-3 gap-3">
            {usageTrust.metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-white/70 bg-white/70 px-3 py-2 shadow-sm">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{metric.label}</div>
                <div className={`mt-1 text-sm font-semibold ${usageTrustStyles.metric}`}>{metric.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ExecutiveSummaryStrip
        title="经营总览"
        summary="这里是完整历史视图，用来复盘交付、稳定性和成本，不承担当前主线的指挥入口。"
        items={[
          {
            id: "completion",
            label: "任务完成率",
            value: `${outcomeReport.completionRate}%`,
            tone: "success",
          },
          {
            id: "handoff",
            label: "交接闭环",
            value: `${outcomeReport.handoffCompletionRate}%`,
            tone: "accent",
          },
          {
            id: "cost",
            label: costCardLabel,
            value: `$ ${totalCostStr}`,
            tone: "warning",
          },
          {
            id: "reliability",
            label: "团队稳定性",
            value: String(outcomeReport.avgReliabilityScore),
          },
        ]}
        footnote={retrospective.summary}
      />

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
                onClick={() =>
                  void persistRetrospective()
                    .then((result) => {
                      if (result) {
                        toast.success(result.title, result.description);
                      }
                    })
                    .catch((error) => {
                      toast.error("写入复盘失败", error instanceof Error ? error.message : String(error));
                    })
                }
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
