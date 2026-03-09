import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Crown,
  Layers3,
  MessageSquare,
  RefreshCcw,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { buildCeoControlSurface } from "../features/ceo/control-surface";
import { useCompanyStore } from "../features/company/store";
import {
  applyOrgRecommendation,
  buildOrgAdvisorSnapshot,
  isOrgAutopilotEnabled,
  type OrgRecommendation,
} from "../features/org/org-advisor";
import {
  gateway,
  resolveCompanyActorConversation,
  sendTurnToCompanyActor,
  type ChatMessage,
  type GatewaySessionRow,
} from "../features/backend";
import {
  readCompanyRuntimeSnapshot,
  writeCompanyRuntimeSnapshot,
} from "../features/runtime/company-runtime";
import { useGatewayStore } from "../features/gateway/store";
import {
  buildEmployeeOperationalInsights,
  buildOutcomeReport,
  buildRetrospectiveSnapshot,
} from "../features/insights/company-insights";
import { getActiveHandoffs } from "../features/handoffs/active-handoffs";
import { resolveCompanyKnowledge } from "../features/knowledge/shared-knowledge";
import { toast } from "../features/ui/toast-store";
import { resolveConversationPresentation, resolveSessionPresentation } from "../lib/chat-routes";
import {
  isSessionActive,
  resolveSessionActorId,
  resolveSessionTitle,
  resolveSessionUpdatedAt,
} from "../lib/sessions";
import { usePageVisibility } from "../lib/use-page-visibility";
import { formatTime, getAvatarUrl } from "../lib/utils";

function extractText(message: ChatMessage | undefined): string {
  if (!message) {
    return "";
  }
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }
      if (block && typeof block === "object") {
        const record = block as Record<string, unknown>;
        if (record.type === "text" && typeof record.text === "string") {
          return record.text;
        }
      }
      return "";
    })
    .join("\n")
    .trim();
}

type ManagerStatusCard = {
  agentId: string;
  label: string;
  role: string;
  state: "running" | "idle" | "offline";
  subtitle: string;
};

export function CEOHomePage() {
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((state) => state.activeCompany);
  const updateCompany = useCompanyStore((state) => state.updateCompany);
  const activeRoomRecords = useCompanyStore((state) => state.activeRoomRecords);
  const activeRoomBindings = useCompanyStore((state) => state.activeRoomBindings);
  const activeWorkItems = useCompanyStore((state) => state.activeWorkItems);
  const connected = useGatewayStore((state) => state.connected);
  const manifest = useGatewayStore((state) => state.manifest);
  const isPageVisible = usePageVisibility();
  const runtimeSnapshot = readCompanyRuntimeSnapshot(activeCompany?.id);

  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [applyingRecommendationId, setApplyingRecommendationId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<GatewaySessionRow[]>(() => runtimeSnapshot?.sessions ?? []);
  const [ceoHistory, setCeoHistory] = useState<ChatMessage[]>(() => {
    const ceoAgentId =
      activeCompany?.employees.find((employee) => employee.metaRole === "ceo")?.agentId ?? null;
    if (!ceoAgentId) {
      return [];
    }
    return runtimeSnapshot?.ceoHistoryByActor?.[ceoAgentId] ?? [];
  });
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const ceo = activeCompany?.employees.find((employee) => employee.metaRole === "ceo") ?? null;
  const companyEmployees = activeCompany?.employees ?? [];
  const orgAutopilotEnabled = activeCompany ? isOrgAutopilotEnabled(activeCompany) : false;
  const ceoSurface = useMemo(
    () => (activeCompany ? buildCeoControlSurface(activeCompany) : null),
    [activeCompany],
  );
  const orgAdvisor = useMemo(
    () => (activeCompany ? buildOrgAdvisorSnapshot(activeCompany) : null),
    [activeCompany],
  );

  useEffect(() => {
    if (!activeCompany) {
      return;
    }
    const snapshot = readCompanyRuntimeSnapshot(activeCompany.id);
    if (!snapshot) {
      return;
    }
    setSessions(snapshot.sessions ?? []);
    if (ceo?.agentId) {
      setCeoHistory(snapshot.ceoHistoryByActor?.[ceo.agentId] ?? []);
    }
  }, [activeCompany?.id, ceo?.agentId]);

  useEffect(() => {
    if (!activeCompany) {
      return;
    }
    writeCompanyRuntimeSnapshot(activeCompany.id, {
      sessions,
      ceoHistoryByActor:
        ceo?.agentId
          ? {
              ...(readCompanyRuntimeSnapshot(activeCompany.id)?.ceoHistoryByActor ?? {}),
              [ceo.agentId]: ceoHistory,
            }
          : readCompanyRuntimeSnapshot(activeCompany.id)?.ceoHistoryByActor,
    });
  }, [activeCompany, ceo?.agentId, ceoHistory, sessions]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeCompany || !connected || !isPageVisible) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const sessionsResult = await gateway.listSessions({
          limit: 80,
          includeDerivedTitles: true,
          includeLastMessage: true,
        });
        if (cancelled) {
          return;
        }
        setSessions(sessionsResult.sessions ?? []);
      } catch (error) {
        console.error("Failed to load CEO homepage data", error);
      }
    };

    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeCompany, connected, isPageVisible]);

  useEffect(() => {
    if (!ceo || !connected || !isPageVisible) {
      return;
    }

    let cancelled = false;
    const loadHistory = async () => {
      try {
        const resolved = await resolveCompanyActorConversation({
          backend: gateway,
          manifest,
          company: activeCompany,
          actorId: ceo.agentId,
          kind: "direct",
        });
        const history = await gateway.readConversation(resolved.conversationRef, 8);
        if (!cancelled) {
          setCeoHistory(
            (history.messages ?? []).map((message) => ({
              role: message.role,
              text: message.text,
              content: message.content,
              timestamp: message.timestamp,
            })),
          );
        }
      } catch (error) {
        console.error("Failed to load CEO history", error);
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [activeCompany, ceo, connected, isPageVisible, manifest]);

  if (!activeCompany || !ceo || !ceoSurface || !orgAdvisor) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  const companyAgentIds = new Set(activeCompany.employees.map((employee) => employee.agentId));
  const companySessions = sessions
    .map((session) => ({ ...session, agentId: resolveSessionActorId(session) }))
    .filter((session): session is GatewaySessionRow & { agentId: string } => {
      return typeof session.agentId === "string" && companyAgentIds.has(session.agentId);
    })
    .sort((left, right) => resolveSessionUpdatedAt(right) - resolveSessionUpdatedAt(left));

  const knowledgeItems = resolveCompanyKnowledge(activeCompany);
  const activeHandoffs = getActiveHandoffs(activeCompany.handoffs ?? []);
  const employeeInsights = buildEmployeeOperationalInsights({
    company: {
      ...activeCompany,
      knowledgeItems,
    },
    sessions: companySessions,
    now: currentTime,
  });
  const outcomeReport = buildOutcomeReport({
    company: {
      ...activeCompany,
      knowledgeItems,
    },
    employeeInsights,
    now: currentTime,
  });
  const retrospective = buildRetrospectiveSnapshot({
    company: {
      ...activeCompany,
      knowledgeItems,
    },
    outcome: outcomeReport,
    employeeInsights,
  });

  const lastAssistantMessage = [...ceoHistory]
    .reverse()
    .find((message) => message.role === "assistant");
  const ceoMemo =
    extractText(lastAssistantMessage).split("\n").find((line) => line.trim().length > 0) ??
    retrospective.summary;

  const managerCards: ManagerStatusCard[] = activeCompany.employees
    .filter((employee) => employee.metaRole === "hr" || employee.metaRole === "cto" || employee.metaRole === "coo")
    .map((employee) => {
      const latestSession = companySessions.find((session) => session.agentId === employee.agentId);
      const state: ManagerStatusCard["state"] = latestSession
        ? isSessionActive(latestSession, currentTime)
          ? "running"
          : "idle"
        : "offline";
      return {
        agentId: employee.agentId,
        label: employee.nickname,
        role: employee.role,
        state,
        subtitle: latestSession
          ? `${resolveSessionTitle(latestSession)} · ${formatTime(resolveSessionUpdatedAt(latestSession))}`
          : "当前待命，尚无最近会话",
      };
    });

  const managementStateLabel = (state: ManagerStatusCard["state"]) => {
    if (state === "running") {
      return "执行中";
    }
    if (state === "idle") {
      return "待命";
    }
    return "离线";
  };

  const managementStateClass = (state: ManagerStatusCard["state"]) => {
    if (state === "running") {
      return "border-sky-200 bg-sky-50 text-sky-700";
    }
    if (state === "idle") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    return "border-slate-200 bg-slate-50 text-slate-500";
  };

  const activityItems = [
    ...companySessions.slice(0, 5).map((session) => ({
      id: session.key,
      title: resolveSessionPresentation({
        session,
        rooms: activeRoomRecords,
        bindings: activeRoomBindings,
        employees: companyEmployees,
      }).title,
      summary: session.lastMessagePreview ?? "最近一次会话更新",
      ts: resolveSessionUpdatedAt(session),
      href: resolveSessionPresentation({
        session,
        rooms: activeRoomRecords,
        bindings: activeRoomBindings,
        employees: companyEmployees,
      }).route,
    })),
    ...activeHandoffs.slice(-3).map((handoff) => ({
      id: handoff.id,
      title: `交接: ${handoff.title}`,
      summary: handoff.summary,
      ts: handoff.updatedAt,
      href:
        resolveConversationPresentation({
          sessionKey: handoff.sessionKey,
          actorId:
            activeWorkItems.find((item) => item.id === handoff.taskId)?.ownerActorId ??
            handoff.fromAgentId ??
            handoff.toAgentIds[0] ??
            null,
          rooms: activeRoomRecords,
          bindings: activeRoomBindings,
          employees: companyEmployees,
        }).route,
    })),
  ]
    .sort((left, right) => right.ts - left.ts)
    .slice(0, 3);

  const quickPrompts = [
    "先别展开太多，直接给我一个最小可执行推进方案。",
    "告诉我现在最该补哪一类角色或流程。",
    "先帮我梳理目标、分工和下一步。",
  ];

  const handleSend = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || sending) {
      return;
    }

    setSending(true);
    try {
      await sendTurnToCompanyActor({
        backend: gateway,
        manifest,
        company: activeCompany,
        actorId: ceo.agentId,
        message: trimmed,
        targetActorIds: [ceo.agentId],
      });
      setInputValue("");
      navigate(`/chat/${ceo.agentId}`);
    } catch (error) {
      toast.error("发送失败", error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  const handleApplyRecommendation = async (recommendation: OrgRecommendation) => {
    if (applyingRecommendationId) {
      return;
    }
    setApplyingRecommendationId(recommendation.id);
    try {
      const result = applyOrgRecommendation({
        company: activeCompany,
        recommendation,
      });
      await updateCompany({
        departments: result.departments,
        employees: result.employees,
      });
      for (const warning of result.warnings) {
        toast.info("组织校准", warning);
      }
      toast.success("组织建议已应用", recommendation.title);
    } catch (error) {
      toast.error("应用失败", error instanceof Error ? error.message : String(error));
    } finally {
      setApplyingRecommendationId(null);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="grid gap-6 xl:grid-cols-[1.4fr,0.9fr]">
        <Card className="overflow-hidden border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.12),_transparent_36%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-white/70 backdrop-blur-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16 rounded-2xl border border-slate-200 bg-zinc-900">
                  <AvatarImage src={getAvatarUrl(ceo.agentId, ceo.avatarJobId)} className="object-cover" />
                  <AvatarFallback className="rounded-2xl bg-zinc-900 text-white">
                    CEO
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                      <Crown className="mr-1 h-3.5 w-3.5" />
                      CEO 主导模式
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        orgAutopilotEnabled
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-500"
                      }
                    >
                      {orgAutopilotEnabled ? "自动校准开启" : "自动校准关闭"}
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                      {activeCompany.icon} {activeCompany.name}
                    </Badge>
                  </div>
                  <CardTitle className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                    先说目标，再由 CEO 调度团队
                  </CardTitle>
                  <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    {ceoMemo}
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate(`/chat/${ceo.agentId}`)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  进入 CEO 深聊
                </Button>
                <Button variant="outline" onClick={() => navigate("/ops")}>
                  <Layers3 className="mr-2 h-4 w-4" />
                  打开运营大厅
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <div>
                  <div className="text-sm font-semibold text-slate-950">直接对 CEO 说</div>
                  <div className="mt-1 text-xs text-slate-500">
                    你不需要先把岗位和流程想清楚。先说目标，CEO 会帮你收敛方案并调度团队。
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <textarea
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder="例如：帮我把本周的内容选题、分工和交付节奏排出来。"
                  className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50"
                        onClick={() => setInputValue(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <Button onClick={() => void handleSend(inputValue)} disabled={sending || !inputValue.trim()}>
                    <Send className="mr-2 h-4 w-4" />
                    {sending ? "发送中..." : "交给 CEO 推进"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-violet-600" />
              支持角色状态
            </CardTitle>
            <CardDescription>HR / CTO / COO 常驻待命，需要时由 CEO 拉起处理专项工作。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {managerCards.map((manager) => (
              <div key={manager.agentId} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {manager.label} · {manager.role}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{manager.subtitle}</div>
                  </div>
                  <Badge variant="outline" className={managementStateClass(manager.state)}>
                    {managementStateLabel(manager.state)}
                  </Badge>
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-500">
              只有在扩编、接系统或搭自动化时，才需要切到这些支持角色。默认先把目标交给 CEO。
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,1fr]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b bg-slate-50/60">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              组织建议
            </CardTitle>
            <CardDescription>
              只有当当前分工开始拖慢推进时，系统才建议你调整组织结构。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {orgAdvisor.recommendations.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                当前组织没有明显拖慢推进，先继续把目标往前推。
              </div>
            ) : (
              orgAdvisor.recommendations.map((recommendation) => (
                <div key={recommendation.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-950">{recommendation.title}</div>
                        <Badge
                          variant="outline"
                          className={
                            recommendation.priority === "high"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }
                        >
                          {recommendation.priority === "high" ? "优先" : "建议"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">{recommendation.summary}</div>
                    </div>
                    <Button
                      variant="outline"
                      disabled={applyingRecommendationId !== null}
                      onClick={() => void handleApplyRecommendation(recommendation)}
                    >
                      {applyingRecommendationId === recommendation.id ? (
                        <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="mr-2 h-4 w-4" />
                      )}
                      {recommendation.actionLabel}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b bg-slate-50/60">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                现在先处理什么
              </CardTitle>
              <CardDescription>首页只保留异常数量和操作入口，不展示自动生成的长说明。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                  阻塞 {ceoSurface.activeBlockers}
                </Badge>
                <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                  交接 {ceoSurface.pendingHandoffs}
                </Badge>
                <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                  请求 {ceoSurface.openRequests}
                </Badge>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  SLA {ceoSurface.overdueItems}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                  接管 {ceoSurface.manualTakeovers}
                </Badge>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                如果没有明显异常，直接继续和 CEO 对话；需要排障时再进入工作看板或运营大厅。
                <div className="mt-3 text-xs leading-5 text-slate-500">
                  完成率 {outcomeReport.completionRate}% · 交接闭环 {outcomeReport.handoffCompletionRate}% · {retrospective.summary}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => navigate(`/chat/${ceo.agentId}`)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  继续和 CEO 对话
                </Button>
                <Button variant="outline" onClick={() => navigate("/board")}>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  进入工作看板
                </Button>
                <Button variant="outline" onClick={() => navigate("/ops")} className="sm:col-span-2">
                  <Layers3 className="mr-2 h-4 w-4" />
                  查看运营异常
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b bg-slate-50/60">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-teal-600" />
                最近 3 条关键动态
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {activityItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-left transition-colors hover:bg-slate-100"
                  onClick={() => navigate(item.href)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.summary}</div>
                    </div>
                    <div className="text-[11px] text-slate-400">{formatTime(item.ts)}</div>
                  </div>
                </button>
              ))}
              {activityItems.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  还没有最近动态，先对 CEO 下达第一条任务。
                </div>
              )}
              <div className="text-xs leading-6 text-slate-500">
                  更细的执行链路、交接和人工接管都放在工作看板与完整会话里，首页只保留当前最值得先看的 3 条信号。
                </div>
              </CardContent>
            </Card>
          </div>
      </div>
    </div>
  );
}
