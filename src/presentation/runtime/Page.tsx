import {
  BookOpenCheck,
  ChevronRight,
  Cpu,
  Grid2x2,
  MessageSquare,
  Radar,
  ShieldAlert,
  UserRound,
  WifiOff,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  RuntimeInspectorAgentSurface,
  RuntimeInspectorSceneZone,
} from "../../application/runtime-inspector";
import { useRuntimeInspectorViewModel } from "../../application/runtime-inspector";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { cn, formatTime } from "../../lib/utils";

type RuntimeInspectorMode = "inspector" | "scene";
type RuntimeInspectorFilter = "all" | "executing" | "waiting" | "intervention" | "no_signal";
type MetricTone = "default" | "accent" | "warning" | "danger";

const MODE_OPTIONS: Array<{ id: RuntimeInspectorMode; label: string; icon: typeof Radar }> = [
  { id: "inspector", label: "Inspector", icon: Radar },
  { id: "scene", label: "Scene", icon: Grid2x2 },
];

const FILTER_OPTIONS: Array<{ id: RuntimeInspectorFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "executing", label: "执行中" },
  { id: "waiting", label: "待协作" },
  { id: "intervention", label: "需介入" },
  { id: "no_signal", label: "无信号" },
];

function getRuntimeLabel(agent: RuntimeInspectorAgentSurface): string {
  switch (agent.runtimeState) {
    case "busy":
      return "执行中";
    case "idle":
      return "待命";
    case "degraded":
      return "降级";
    case "no_signal":
      return "无信号";
    case "offline":
    default:
      return "离线";
  }
}

function getRuntimeBadgeClass(agent: RuntimeInspectorAgentSurface): string {
  switch (agent.runtimeState) {
    case "busy":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "idle":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "degraded":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "no_signal":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "offline":
    default:
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
}

function getRuntimeDotClass(agent: RuntimeInspectorAgentSurface): string {
  switch (agent.runtimeState) {
    case "busy":
      return "bg-sky-500";
    case "idle":
      return "bg-emerald-500";
    case "degraded":
      return "bg-amber-500";
    case "no_signal":
      return "bg-violet-500";
    case "offline":
    default:
      return "bg-slate-400";
  }
}

function getCoordinationLabel(agent: RuntimeInspectorAgentSurface): string {
  if (agent.interventionState === "takeover_required") {
    return "人工接管";
  }
  switch (agent.coordinationState) {
    case "executing":
      return "执行中";
    case "pending_ack":
      return "待确认";
    case "waiting_peer":
      return agent.interventionState === "escalated"
        ? "待协作·已升级"
        : agent.interventionState === "overdue"
          ? "待协作·超时"
          : "待协作";
    case "waiting_input":
      return agent.interventionState === "overdue" ? "待输入·超时" : "待输入";
    case "explicit_blocked":
      return "明确阻塞";
    case "completed":
      return "已完成";
    case "none":
    default:
      return "无挂载";
  }
}

function getCoordinationBadgeClass(agent: RuntimeInspectorAgentSurface): string {
  if (agent.interventionState === "takeover_required" || agent.coordinationState === "explicit_blocked") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (
    agent.interventionState === "escalated" ||
    agent.interventionState === "overdue" ||
    agent.coordinationState === "waiting_peer" ||
    agent.coordinationState === "waiting_input" ||
    agent.coordinationState === "pending_ack"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (agent.coordinationState === "executing") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (agent.coordinationState === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getInterventionLabel(agent: RuntimeInspectorAgentSurface): string {
  switch (agent.interventionState) {
    case "takeover_required":
      return "需接管";
    case "escalated":
      return "已升级";
    case "overdue":
      return "超时";
    case "healthy":
    default:
      return "正常";
  }
}

function getInterventionBadgeClass(agent: RuntimeInspectorAgentSurface): string {
  switch (agent.interventionState) {
    case "takeover_required":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "escalated":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "overdue":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "healthy":
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

function matchesFilter(agent: RuntimeInspectorAgentSurface, filter: RuntimeInspectorFilter): boolean {
  switch (filter) {
    case "executing":
      return agent.coordinationState === "executing";
    case "waiting":
      return (
        agent.coordinationState === "pending_ack" ||
        agent.coordinationState === "waiting_peer" ||
        agent.coordinationState === "waiting_input"
      );
    case "intervention":
      return agent.interventionState !== "healthy" || agent.coordinationState === "explicit_blocked";
    case "no_signal":
      return agent.runtimeState === "no_signal";
    case "all":
    default:
      return true;
  }
}

function metricToneClass(tone: MetricTone): string {
  if (tone === "accent") return "border-sky-200 bg-sky-50 text-sky-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-white text-slate-700";
}

function buildMetrics(agents: RuntimeInspectorAgentSurface[]) {
  return [
    {
      key: "executing",
      label: "执行中",
      value: agents.filter((agent) => agent.coordinationState === "executing").length,
      icon: Cpu,
      tone: "accent" as MetricTone,
    },
    {
      key: "waiting",
      label: "待协作",
      value: agents.filter((agent) =>
        agent.coordinationState === "pending_ack" ||
        agent.coordinationState === "waiting_peer" ||
        agent.coordinationState === "waiting_input",
      ).length,
      icon: Workflow,
      tone: "warning" as MetricTone,
    },
    {
      key: "intervention",
      label: "需介入",
      value: agents.filter((agent) =>
        agent.interventionState !== "healthy" || agent.coordinationState === "explicit_blocked",
      ).length,
      icon: ShieldAlert,
      tone: "danger" as MetricTone,
    },
    {
      key: "no_signal",
      label: "无信号",
      value: agents.filter((agent) => agent.runtimeState === "no_signal").length,
      icon: WifiOff,
      tone: "default" as MetricTone,
    },
  ];
}

function MetricCard(props: {
  label: string;
  value: number;
  tone: MetricTone;
  icon: typeof Cpu;
}) {
  const { label, value, tone, icon: Icon } = props;
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2 shadow-sm", metricToneClass(tone))}>
      <div className="rounded-xl bg-white/80 p-2 shadow-sm">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">{label}</div>
        <div className="text-lg font-black tracking-tight">{value}</div>
      </div>
    </div>
  );
}

function TinySprite(props: { agent: RuntimeInspectorAgentSurface }) {
  const { agent } = props;
  return (
    <div className="relative h-5 w-4 shrink-0">
      <span className="absolute left-1 top-0 h-1.5 w-1.5 rounded-[1px] bg-slate-900/80" />
      <span className="absolute left-0.5 top-1.5 h-2 w-2.5 rounded-[1px] bg-slate-900" />
      <span className={cn("absolute right-0 top-0 h-1.5 w-1.5 rounded-[1px]", getRuntimeDotClass(agent))} />
    </div>
  );
}

function InspectorRow(props: {
  agent: RuntimeInspectorAgentSurface;
  selected: boolean;
  onSelect: () => void;
}) {
  const { agent, selected, onSelect } = props;
  const navigate = useNavigate();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "grid w-full min-w-[1120px] cursor-pointer grid-cols-[minmax(190px,1.05fr)_118px_140px_minmax(320px,2fr)_110px_62px_132px] items-center gap-3 border-b border-slate-100 px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
        selected ? "bg-sky-50/60" : "bg-white hover:bg-slate-50",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", getRuntimeDotClass(agent))} />
        <div className="min-w-0 truncate text-sm font-semibold text-slate-950" title={`${agent.nickname} · ${agent.role}`}>
          {agent.nickname}
          <span className="ml-2 text-xs font-medium text-slate-500">{agent.role}</span>
        </div>
      </div>

      <div className="min-w-0">
        <Badge variant="outline" className={cn("max-w-full truncate", getRuntimeBadgeClass(agent))}>
          {getRuntimeLabel(agent)}
        </Badge>
      </div>

      <div className="min-w-0">
        <Badge variant="outline" className={cn("max-w-full truncate", getCoordinationBadgeClass(agent))}>
          {getCoordinationLabel(agent)}
        </Badge>
      </div>

      <div className="min-w-0 truncate text-xs text-slate-600" title={agent.reason}>
        {agent.reason}
      </div>

      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500" title={agent.sceneZoneLabel}>
        {agent.sceneZoneLabel}
      </div>

      <div className="text-right text-[11px] font-semibold text-slate-500">
        {agent.activeSessionCount}/{agent.activeRunCount}
      </div>

      <div
        className="flex items-center justify-end gap-1"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-slate-500 hover:text-slate-900"
          title="打开会话"
          onClick={() => navigate(`/chat/${encodeURIComponent(agent.agentId)}`)}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-slate-500 hover:text-slate-900"
          title="查看详情"
          onClick={() => navigate(`/employees/${encodeURIComponent(agent.agentId)}`)}
        >
          <UserRound className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-slate-500 hover:text-slate-900"
          title="打开工作看板"
          onClick={() => navigate("/board")}
        >
          <BookOpenCheck className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function DetailDrawer(props: {
  agent: RuntimeInspectorAgentSurface | null;
  open: boolean;
  onClose: () => void;
}) {
  const { agent, open, onClose } = props;
  const navigate = useNavigate();

  if (!agent || !open) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full justify-end">
      <div className="pointer-events-auto h-full w-full max-w-[420px] border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", getRuntimeDotClass(agent))} />
                <div className="truncate text-lg font-black tracking-tight text-slate-950">{agent.nickname}</div>
              </div>
              <div className="mt-1 truncate text-sm text-slate-500">{agent.role}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline" className={getRuntimeBadgeClass(agent)}>
                  {getRuntimeLabel(agent)}
                </Badge>
                <Badge variant="outline" className={getCoordinationBadgeClass(agent)}>
                  {getCoordinationLabel(agent)}
                </Badge>
                <Badge variant="outline" className={getInterventionBadgeClass(agent)}>
                  {getInterventionLabel(agent)}
                </Badge>
              </div>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reason</div>
              <div className="mt-2 text-sm font-medium leading-6 text-slate-900">{agent.reason}</div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">当前任务</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{agent.currentAssignment}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{agent.currentObjective}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">S / R / Esc</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {agent.activeSessionCount} / {agent.activeRunCount} / {agent.openEscalationCount}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">最近信号 {formatTime(agent.latestSignalAt)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">证据</div>
                <span className="text-[11px] text-slate-400">{agent.sceneZoneLabel}</span>
              </div>
              <div className="mt-2 space-y-2">
                {agent.runtimeEvidence.length > 0 ? (
                  agent.runtimeEvidence.slice(0, 5).map((evidence, index) => (
                    <div key={`${evidence.kind}-${evidence.timestamp}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs leading-5 text-slate-700">{evidence.summary}</div>
                        <Badge variant="outline" className="border-slate-200 bg-white text-[10px] text-slate-500">
                          {evidence.kind}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">{formatTime(evidence.timestamp)}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                    当前没有可展示的 runtime evidence。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Session / Run</div>
              <div className="mt-2 space-y-2">
                {agent.sessions.slice(0, 4).map((session) => (
                  <div key={session.sessionKey} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="truncate text-xs font-semibold text-slate-900">{session.sessionKey}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{session.sessionState}</span>
                      <span>·</span>
                      <span>{formatTime(session.lastStatusSyncAt ?? session.lastSeenAt)}</span>
                    </div>
                  </div>
                ))}
                {agent.runs.slice(0, 4).map((run) => (
                  <div key={run.runId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="truncate text-xs font-semibold text-slate-900">{run.runId}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{run.state}</span>
                      <span>·</span>
                      <span>{formatTime(run.lastEventAt)}</span>
                    </div>
                  </div>
                ))}
                {agent.sessions.length === 0 && agent.runs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                    当前没有挂载到该成员的 session 或活跃 run。
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-4">
            <Button size="sm" variant="outline" onClick={() => navigate(`/chat/${encodeURIComponent(agent.agentId)}`)}>
              <MessageSquare className="mr-2 h-3.5 w-3.5" />
              会话
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/employees/${encodeURIComponent(agent.agentId)}`)}>
              <UserRound className="mr-2 h-3.5 w-3.5" />
              详情
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/board")}>
              <BookOpenCheck className="mr-2 h-3.5 w-3.5" />
              看板
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneZoneCard(props: {
  zone: RuntimeInspectorSceneZone;
  agents: RuntimeInspectorAgentSurface[];
  selectedAgentId: string | null;
  onSelect: (agentId: string) => void;
}) {
  const { zone, agents, selectedAgentId, onSelect } = props;
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="font-mono text-sm font-black uppercase tracking-[0.18em] text-slate-950">
              {zone.label}
            </CardTitle>
            <CardDescription className="mt-1 text-xs text-slate-500">{zone.description}</CardDescription>
          </div>
          <div className="text-right text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <div>{agents.filter((agent) => agent.coordinationState === "executing").length} Busy</div>
            <div>{agents.filter((agent) => agent.interventionState !== "healthy" || agent.coordinationState === "explicit_blocked").length} Alert</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {agents.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {agents.map((agent) => (
              <button
                key={agent.agentId}
                type="button"
                onClick={() => onSelect(agent.agentId)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                  agent.agentId === selectedAgentId ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100",
                )}
              >
                <TinySprite agent={agent} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-xs font-semibold text-slate-950">{agent.nickname}</div>
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", getRuntimeBadgeClass(agent))}>
                      {getRuntimeLabel(agent)}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-slate-500">{agent.sceneActivityLabel}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            当前过滤条件下，这个区域没有成员。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RuntimeInspectorPageScreen() {
  const navigate = useNavigate();
  const { activeCompany, surface } = useRuntimeInspectorViewModel();
  const [mode, setMode] = useState<RuntimeInspectorMode>("inspector");
  const [filter, setFilter] = useState<RuntimeInspectorFilter>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const metrics = useMemo(() => buildMetrics(surface?.agents ?? []), [surface?.agents]);
  const filteredAgents = useMemo(
    () => (surface ? surface.agents.filter((agent) => matchesFilter(agent, filter)) : []),
    [filter, surface],
  );

  useEffect(() => {
    if (filteredAgents.length === 0) {
      setSelectedAgentId(null);
      setDrawerOpen(false);
      return;
    }
    if (!selectedAgentId || !filteredAgents.some((agent) => agent.agentId === selectedAgentId)) {
      setSelectedAgentId(filteredAgents[0]?.agentId ?? null);
    }
  }, [filteredAgents, selectedAgentId]);

  const selectedAgent =
    filteredAgents.find((agent) => agent.agentId === selectedAgentId)
    ?? filteredAgents[0]
    ?? null;

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  if (!surface) {
    return <div className="p-8 text-center text-muted-foreground">正在汇聚运行态快照...</div>;
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 p-3 md:p-4 lg:p-5">
      <Card className="overflow-hidden border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_38%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-sm">
        <CardContent className="flex flex-col gap-3 p-3 lg:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                  {activeCompany.name}
                </Badge>
                <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                  Agent Runtime
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
                  lifecycle-first
                </Badge>
              </div>
              <h1 className="mt-2 text-xl font-black tracking-tight text-slate-950 md:text-2xl">
                公司运行态总览
              </h1>
              <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-600 md:text-sm">
                一眼看清谁在执行、谁在等待、谁需要介入。详情只在右侧抽屉展开，不再挤占总览空间。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/ops")}>
                运营大厅
              </Button>
              <Button variant="outline" onClick={() => navigate("/board")}>
                工作看板
              </Button>
              <Button variant="outline" onClick={() => navigate("/ceo")}>
                CEO 首页
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                tone={metric.tone}
                icon={metric.icon}
              />
            ))}
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {MODE_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <Button
                    key={option.id}
                    size="sm"
                    variant={mode === option.id ? "default" : "outline"}
                    className={cn("rounded-full", mode === option.id ? "" : "border-slate-200 bg-white text-slate-700")}
                    onClick={() => setMode(option.id)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {option.label}
                  </Button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  size="sm"
                  variant={filter === option.id ? "secondary" : "outline"}
                  className={cn(
                    "rounded-full",
                    filter === option.id ? "border-slate-200 bg-slate-900 text-white hover:bg-slate-800" : "",
                  )}
                  onClick={() => setFilter(option.id)}
                >
                  {option.label}
                  <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px]">
                    {surface.agents.filter((agent) => matchesFilter(agent, option.id)).length}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {mode === "inspector" ? (
        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-black tracking-tight text-slate-950">Inspector</CardTitle>
                <CardDescription>单行监控表，直接回答每个人是否在执行、在等谁、为什么要介入。</CardDescription>
              </div>
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                {filteredAgents.length} / {surface.agents.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-[1120px]">
              <div className="grid grid-cols-[minmax(190px,1.05fr)_118px_140px_minmax(320px,2fr)_110px_62px_132px] gap-3 border-b border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <div>成员</div>
                <div>Runtime</div>
                <div>Coordination</div>
                <div>Reason</div>
                <div>区域</div>
                <div className="text-right">S/R</div>
                <div className="text-right">操作</div>
              </div>
              {filteredAgents.length > 0 ? (
                filteredAgents.map((agent) => (
                  <InspectorRow
                    key={agent.agentId}
                    agent={agent}
                    selected={agent.agentId === selectedAgent?.agentId}
                    onSelect={() => {
                      setSelectedAgentId(agent.agentId);
                      setDrawerOpen(true);
                    }}
                  />
                ))
              ) : (
                <div className="px-4 py-10 text-center text-sm text-slate-500">当前过滤条件下没有成员。</div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {surface.sceneZones.map((zone) => (
            <SceneZoneCard
              key={zone.id}
              zone={zone}
              agents={zone.agents.filter((agent) => matchesFilter(agent, filter))}
              selectedAgentId={selectedAgent?.agentId ?? null}
              onSelect={(agentId) => {
                setSelectedAgentId(agentId);
                setDrawerOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {selectedAgent ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-30 hidden xl:flex">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg"
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", getRuntimeDotClass(selectedAgent))} />
            {selectedAgent.nickname}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <DetailDrawer agent={selectedAgent} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
