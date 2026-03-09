import {
  MessageSquare,
  Play,
  Plus,
  ChevronDown,
  CheckCircle2,
  BarChart,
  Server,
  MoreVertical,
  ShieldAlert,
  Cpu,
  Trash2,
  Zap,
  Activity,
  Users,
  Clock,
  BookOpen,
  Copy,
  GitFork,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ActionFormDialog } from "../components/ui/action-form-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { ExecutionStateBadge } from "../components/execution-state-badge";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { ImmersiveHireDialog, type HireConfig } from "../components/ui/immersive-hire-dialog";
import type { EmployeeRef } from "../features/company/types";
import { buildCeoControlSurface } from "../features/ceo/control-surface";
import { syncCompanyCommunicationState } from "../features/company/sync-company-communication";
import { getActiveHandoffs } from "../features/handoffs/active-handoffs";
import { summarizeRequestHealth } from "../features/requests/request-health";
import { requestTopicMatchesText } from "../features/requests/topic";
import { useCompanyStore } from "../features/company/store";
import { buildCompanyBlueprint } from "../features/company/blueprint";
import {
  pickConversationScopedWorkItem,
  pickWorkItemRecord,
} from "../features/execution/work-item";
import {
  isCanonicalProductWorkItemRecord,
  isReliableWorkItemRecord,
} from "../features/execution/work-item-signal";
import { useGatewayStore } from "../features/gateway/store";
import {
  isBlockedExecutionState,
  isWaitingExecutionState,
  resolveExecutionState,
  type ResolvedExecutionState,
} from "../features/execution/state";
import {
  buildExecutionFocusSummary,
  type ExecutionFocusSummary,
} from "../features/execution/focus-summary";
import {
  buildRequirementExecutionOverview,
  createRequirementMessageSnapshots,
  REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT,
  type RequirementSessionSnapshot,
} from "../features/execution/requirement-overview";
import { buildRequirementRoomRoute } from "../features/execution/requirement-room";
import {
  buildRequirementScope,
  filterRequirementSlaAlerts,
} from "../features/execution/requirement-scope";
import {
  isArtifactRequirementTopic,
  isStrategicRequirementTopic,
} from "../features/execution/requirement-kind";
import { isSyntheticWorkflowPromptText } from "../features/execution/message-truth";
import { resolveCompanyKnowledge } from "../features/knowledge/shared-knowledge";
import {
  buildEmployeeOperationalInsights,
  buildRetrospectiveSnapshot,
  buildOutcomeReport,
} from "../features/insights/company-insights";
import { evaluateSlaAlerts } from "../features/sla/escalation-rules";
import {
  gateway,
  type AgentListEntry,
  type GatewaySessionRow,
  type CronJob,
} from "../features/backend";
import {
  readCompanyRuntimeSnapshot,
  writeCompanyRuntimeSnapshot,
} from "../features/runtime/company-runtime";
import { toast } from "../features/ui/toast-store";
import { AgentOps } from "../lib/agent-ops";
import { resolveConversationPresentation } from "../lib/chat-routes";
import {
  isSessionActive,
  resolveSessionActorId,
  resolveSessionTitle,
  resolveSessionUpdatedAt,
} from "../lib/sessions";
import { usePageVisibility } from "../lib/use-page-visibility";
import { formatTime, getAvatarUrl } from "../lib/utils";

type UnifiedStreamItem = {
  key: string;
  type: "session" | "cron";
  timestamp: number;
  employee?: EmployeeCardData;
  active: boolean;
  title: string;
  preview?: string;
  execution: ResolvedExecutionState;
  focusSummary: ExecutionFocusSummary;
};

type EmployeeCardData = EmployeeRef & {
  status: "running" | "idle" | "stopped";
  realName: string;
  skills: string[];
  lastActiveAt: number;
  execution: ResolvedExecutionState;
  focusSummary: ExecutionFocusSummary;
};

type OpsSectionCardProps = {
  title: string;
  description: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

function extractChatSyncSessionKey(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = payload as { sessionKey?: unknown; state?: unknown };
  if (typeof candidate.sessionKey !== "string") {
    return null;
  }
  if (
    candidate.state !== "final" &&
    candidate.state !== "error" &&
    candidate.state !== "aborted"
  ) {
    return null;
  }
  return candidate.sessionKey;
}

function OpsSectionCard({
  title,
  description,
  meta,
  defaultOpen = false,
  children,
}: OpsSectionCardProps) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
        <div>
          <div className="text-sm font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          {meta ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">{meta}</span> : null}
          <span className="inline-flex items-center gap-1 font-medium">
            <ChevronDown className="h-3.5 w-3.5" />
            展开详情
          </span>
        </div>
      </summary>
      <div className="border-t border-slate-200 px-4 py-4">{children}</div>
    </details>
  );
}

export function CompanyLobby() {
  const navigate = useNavigate();
  const {
    activeCompany,
    activeConversationStates,
    activeArtifacts,
    activeDispatches,
    activeRoomRecords,
    activeWorkItems,
    replaceDispatchRecords,
    updateCompany,
  } = useCompanyStore();
  const connected = useGatewayStore((state) => state.connected);
  const isPageVisible = usePageVisibility();
  const runtimeSnapshot = readCompanyRuntimeSnapshot(activeCompany?.id);
  const [agentsCache, setAgentsCache] = useState<AgentListEntry[]>(() => runtimeSnapshot?.agents ?? []);
  const [sessionsCache, setSessionsCache] = useState<GatewaySessionRow[]>(() => runtimeSnapshot?.sessions ?? []);
  const [cronCache, setCronCache] = useState<CronJob[]>(() => runtimeSnapshot?.cronJobs ?? []);
  const [sessionExecutionMap, setSessionExecutionMap] = useState<Map<string, ResolvedExecutionState>>(
    new Map(),
  );
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [hireDialogOpen, setHireDialogOpen] = useState(false);
  const [hireSubmitting, setHireSubmitting] = useState(false);
  const [updateRoleDialogOpen, setUpdateRoleDialogOpen] = useState(false);
  const [updateRoleTarget, setUpdateRoleTarget] = useState<string | null>(null);
  const [updateRoleInitial, setUpdateRoleInitial] = useState({ role: "", description: "" });
  const [updateRoleSubmitting, setUpdateRoleSubmitting] = useState(false);

  const [fireEmployeeDialogOpen, setFireEmployeeDialogOpen] = useState(false);
  const [fireEmployeeTarget, setFireEmployeeTarget] = useState<string | null>(null);
  const [groupChatDialogOpen, setGroupChatDialogOpen] = useState(false);
  const [groupChatSubmitting, setGroupChatSubmitting] = useState(false);

  const [quickTaskInput, setQuickTaskInput] = useState<string>("");
  const [quickTaskTarget, setQuickTaskTarget] = useState<string>("");
  const [quickTaskSubmitting, setQuickTaskSubmitting] = useState(false);
  const [recoveringCommunication, setRecoveringCommunication] = useState(false);
  const [companySessionSnapshots, setCompanySessionSnapshots] = useState<RequirementSessionSnapshot[]>(
    () => runtimeSnapshot?.companySessionSnapshots ?? [],
  );
  const [usageCost, setUsageCost] = useState<number | null>(() => runtimeSnapshot?.usageCost ?? null);

  useEffect(() => {
    if (!activeCompany) {
      return;
    }
    const snapshot = readCompanyRuntimeSnapshot(activeCompany.id);
    if (!snapshot) {
      return;
    }
    setAgentsCache(snapshot.agents ?? []);
    setSessionsCache(snapshot.sessions ?? []);
    setCronCache(snapshot.cronJobs ?? []);
    setCompanySessionSnapshots(snapshot.companySessionSnapshots ?? []);
    setUsageCost(snapshot.usageCost ?? null);
  }, [activeCompany?.id]);

  useEffect(() => {
    if (!activeCompany) {
      return;
    }
    writeCompanyRuntimeSnapshot(activeCompany.id, {
      agents: agentsCache,
      sessions: sessionsCache,
      cronJobs: cronCache,
      companySessionSnapshots,
      usageCost,
    });
  }, [activeCompany, agentsCache, companySessionSnapshots, cronCache, sessionsCache, usageCost]);

  useEffect(() => {
    async function fetchData() {
      if (!connected || !isPageVisible) return;
      try {
        const [agentsRes, sessionsRes, cronRes, usageRes] = await Promise.all([
          gateway.listAgents(),
          gateway.listSessions(),
          gateway.listCron().catch(() => ({ jobs: [] })),
          gateway.getUsageCost({ days: 30 }).catch(() => null),
        ]);
        setAgentsCache(agentsRes.agents || []);
        setSessionsCache(sessionsRes.sessions || []);
        setCronCache(cronRes.jobs || []);
        if (usageRes?.totals) {
          setUsageCost(usageRes.totals.totalCost);
        }
      } catch (err) {
        console.error("Failed to fetch lobby data:", err);
      }
    }
    fetchData();
    const timer = setInterval(fetchData, 10000); // 10s polling
    return () => clearInterval(timer);
  }, [connected, isPageVisible]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }
  const ceoEmployee = activeCompany.employees.find((employee) => employee.metaRole === "ceo") ?? null;

  // Cross-reference config employees with real agent statuses
  const companyAgentIds = new Set(activeCompany.employees.map((e) => e.agentId));
  const companySessions = sessionsCache
    .map((session) => ({
      ...session,
      agentId: resolveSessionActorId(session),
    }))
    .filter((session): session is GatewaySessionRow & { agentId: string } => {
      const agentId = session.agentId;
      return typeof agentId === "string" && companyAgentIds.has(agentId);
    })
    .sort((a, b) => resolveSessionUpdatedAt(b) - resolveSessionUpdatedAt(a));

  const sessionsByAgent = new Map<string, Array<GatewaySessionRow & { agentId: string }>>();
  for (const session of companySessions) {
    const existing = sessionsByAgent.get(session.agentId) ?? [];
    existing.push(session);
    sessionsByAgent.set(session.agentId, existing);
  }
  const companySessionsSignature = companySessions
    .map((session) => `${session.key}:${resolveSessionUpdatedAt(session)}`)
    .join("|");

  useEffect(() => {
    if (!connected || !isPageVisible || companySessions.length === 0) {
      return;
    }

    let cancelled = false;
    (async () => {
      const next = new Map<string, ResolvedExecutionState>();
      const snapshots: RequirementSessionSnapshot[] = [];
      const targets = companySessions.slice(0, 12);
      await Promise.allSettled(
        targets.map(async (session) => {
          try {
            const history = await gateway.getChatHistory(session.key, 20);
            const evidenceTexts = (history.messages || [])
              .map((message) => {
                if (typeof message.text === "string" && message.text.trim()) {
                  return message.text.trim();
                }
                if (typeof message.content === "string" && message.content.trim()) {
                  return message.content.trim();
                }
                if (Array.isArray(message.content)) {
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
                return "";
              })
              .filter((text) => text.length > 0);

            next.set(
              session.key,
              resolveExecutionState({
                session,
                evidenceTexts,
                now: Date.now(),
              }),
            );
            snapshots.push({
              agentId: session.agentId,
              sessionKey: session.key,
              updatedAt: resolveSessionUpdatedAt(session),
              messages: createRequirementMessageSnapshots(history.messages ?? [], {
                limit: REQUIREMENT_SNAPSHOT_MESSAGE_LIMIT,
              }),
            });
          } catch {
            next.set(session.key, resolveExecutionState({ session, now: Date.now() }));
          }
        }),
      );

      if (!cancelled) {
        setSessionExecutionMap(next);
        if (snapshots.length > 0) {
          setCompanySessionSnapshots((prev) => {
            const activeSessionKeys = new Set(companySessions.map((session) => session.key));
            const bySessionKey = new Map(prev.map((snapshot) => [snapshot.sessionKey, snapshot]));
            snapshots.forEach((snapshot) => {
              bySessionKey.set(snapshot.sessionKey, snapshot);
            });
            return [...bySessionKey.values()]
              .filter((snapshot) => activeSessionKeys.has(snapshot.sessionKey))
              .sort((left, right) => right.updatedAt - left.updatedAt)
              .slice(0, 12);
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, companySessionsSignature, isPageVisible]);

  const sessionExecutions = new Map<string, ResolvedExecutionState>(sessionExecutionMap);
  for (const session of companySessions) {
    if (!sessionExecutions.has(session.key)) {
      sessionExecutions.set(
        session.key,
        resolveExecutionState({
          session,
          evidenceTexts: [session.lastMessagePreview, resolveSessionTitle(session)],
          now: currentTime,
        }),
      );
    }
  }

  const ceoInstructionHint = useMemo(() => {
    if (!ceoEmployee) {
      return null;
    }
    const ceoSnapshot = companySessionSnapshots.find((snapshot) => snapshot.agentId === ceoEmployee.agentId);
    const latestUserMessage = [...(ceoSnapshot?.messages ?? [])]
      .reverse()
      .find(
        (message) =>
          message.role === "user" &&
          message.text.trim().length > 12 &&
          !isSyntheticWorkflowPromptText(message.text),
      );
    if (!latestUserMessage) {
      return null;
    }
    return {
      text: latestUserMessage.text,
      timestamp: latestUserMessage.timestamp,
    };
  }, [ceoEmployee, companySessionSnapshots]);
  const shouldBootstrapRequirementOverview = Boolean(
    ceoInstructionHint?.text ||
      activeWorkItems.some(
        (item) =>
          isReliableWorkItemRecord(item) &&
          item.status !== "completed" &&
          item.status !== "archived",
      ),
  );
  const rawRequirementOverview = useMemo(
    () =>
      activeCompany && shouldBootstrapRequirementOverview
        ? buildRequirementExecutionOverview({
            company: activeCompany,
            sessionSnapshots: companySessionSnapshots,
            preferredTopicText: ceoInstructionHint?.text ?? null,
            preferredTopicTimestamp: ceoInstructionHint?.timestamp ?? null,
            includeArtifactTopics: false,
            now: currentTime,
          })
        : null,
    [
      activeCompany,
      ceoInstructionHint?.text,
      ceoInstructionHint?.timestamp,
      companySessionSnapshots,
      currentTime,
      shouldBootstrapRequirementOverview,
    ],
  );
  const requirementCurrentOwner =
    rawRequirementOverview?.currentOwnerAgentId
      ? activeCompany.employees.find((employee) => employee.agentId === rawRequirementOverview.currentOwnerAgentId) ??
        null
      : null;
  const canonicalWorkItems = useMemo(
    () =>
      activeWorkItems.filter(
        (item) =>
          isCanonicalProductWorkItemRecord(item, ceoEmployee?.agentId) &&
          !isArtifactRequirementTopic(item.topicKey),
      ),
    [activeWorkItems, ceoEmployee?.agentId],
  );
  const latestOpenWorkItem = useMemo(
    () =>
      [...canonicalWorkItems]
        .filter((item) => item.status !== "completed" && item.status !== "archived")
        .sort((left, right) => {
          const leftSpecific = Number(Boolean(left.topicKey));
          const rightSpecific = Number(Boolean(right.topicKey));
          if (leftSpecific !== rightSpecific) {
            return rightSpecific - leftSpecific;
          }
          return right.updatedAt - left.updatedAt;
        })[0] ?? null,
    [canonicalWorkItems],
  );
  const latestStrategicWorkItem = useMemo(
    () =>
      [...canonicalWorkItems]
        .filter(
          (item) =>
            isStrategicRequirementTopic(item.topicKey) &&
            item.status !== "completed" &&
            item.status !== "archived",
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null,
    [canonicalWorkItems],
  );
  const ceoConversationWorkItem = useMemo(
    () =>
      pickConversationScopedWorkItem({
        items: canonicalWorkItems,
        conversationStates: activeConversationStates,
        actorId: ceoEmployee?.agentId ?? null,
      }),
    [activeConversationStates, canonicalWorkItems, ceoEmployee?.agentId],
  );
  const requirementTopicKeyHint = rawRequirementOverview?.topicKey ?? latestOpenWorkItem?.topicKey ?? null;
  const requirementStartedAtHint = rawRequirementOverview?.startedAt ?? latestOpenWorkItem?.startedAt ?? null;
  const matchedWorkItem = useMemo(
    () =>
      pickWorkItemRecord({
        items: canonicalWorkItems,
        sessionKey:
          requirementCurrentOwner && companySessions.length > 0
            ? companySessions.find((session) => session.agentId === requirementCurrentOwner.agentId)?.key ?? null
            : latestOpenWorkItem?.ownerActorId
              ? companySessions.find((session) => session.agentId === latestOpenWorkItem.ownerActorId)?.key ?? null
              : null,
        topicKey: requirementTopicKeyHint,
        startedAt: requirementStartedAtHint,
      }),
    [
      canonicalWorkItems,
      companySessions,
      latestOpenWorkItem?.ownerActorId,
      requirementCurrentOwner,
      requirementStartedAtHint,
      requirementTopicKeyHint,
    ],
  );
  const activeWorkItem = useMemo(
    () => {
      if (ceoConversationWorkItem) {
        return ceoConversationWorkItem;
      }
      if (latestStrategicWorkItem) {
        return latestStrategicWorkItem;
      }
      if (latestOpenWorkItem) {
        return latestOpenWorkItem;
      }
      return activeWorkItems.length === 0 ? matchedWorkItem ?? null : null;
    },
    [
      activeWorkItems.length,
      ceoConversationWorkItem,
      latestOpenWorkItem,
      latestStrategicWorkItem,
      matchedWorkItem,
    ],
  );
  const currentWorkItem = useMemo(
    () =>
      activeWorkItem && isReliableWorkItemRecord(activeWorkItem)
        ? activeWorkItem
        : null,
    [activeWorkItem],
  );
  const requirementOverview = useMemo(
    () => {
      if (!currentWorkItem || !rawRequirementOverview) {
        return null;
      }
      if (
        currentWorkItem.topicKey &&
        rawRequirementOverview.topicKey !== currentWorkItem.topicKey
      ) {
        return null;
      }
      return rawRequirementOverview;
    },
    [currentWorkItem, rawRequirementOverview],
  );
  const requirementScope = useMemo(
    () => (currentWorkItem ? buildRequirementScope(activeCompany, requirementOverview, currentWorkItem) : null),
    [activeCompany, currentWorkItem, requirementOverview],
  );
  const companyTasks = currentWorkItem ? requirementScope?.tasks ?? [] : [];
  const companyHandoffs = currentWorkItem ? requirementScope?.handoffs ?? getActiveHandoffs(activeCompany.handoffs ?? []) : [];
  const companyRequests = currentWorkItem ? requirementScope?.requests ?? (activeCompany.requests ?? []) : [];
  const rawSlaAlerts = currentWorkItem ? evaluateSlaAlerts(activeCompany, currentTime) : [];
  const slaAlerts = filterRequirementSlaAlerts(rawSlaAlerts, requirementScope);
  const ceoSurface = buildCeoControlSurface(
    currentWorkItem
      ? activeCompany
      : { ...activeCompany, tasks: [], handoffs: [], requests: [] },
  );

  function buildEmployeeFocusSummary(input: {
    agentId: string;
    sessionKey?: string;
    execution: ResolvedExecutionState;
    roleLabel: string;
  }): ExecutionFocusSummary {
    const { agentId, sessionKey, execution, roleLabel } = input;
    const relatedTask =
      [...companyTasks]
        .filter(
          (task) =>
            task.sessionKey === sessionKey ||
            task.ownerAgentId === agentId ||
            task.agentId === agentId ||
            task.assigneeAgentIds?.includes(agentId),
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
    const relatedHandoffs = companyHandoffs.filter(
      (handoff) =>
        handoff.sessionKey === sessionKey ||
        handoff.fromAgentId === agentId ||
        handoff.toAgentIds.includes(agentId),
    );
    const relatedRequests = companyRequests.filter(
      (request) =>
        request.sessionKey === sessionKey ||
        request.fromAgentId === agentId ||
        request.toAgentIds.includes(agentId),
    );
    const relatedAlerts = slaAlerts.filter(
      (alert) => alert.sessionKey === sessionKey || alert.ownerAgentId === agentId,
    );

    return buildExecutionFocusSummary({
      company: activeCompany,
      targetAgentId: agentId,
      targetRoleLabel: roleLabel,
      execution,
      task: relatedTask,
      requests: relatedRequests,
      handoffs: relatedHandoffs,
      takeoverPack: null,
      ceoSurface,
      alerts: relatedAlerts,
    });
  }

  const employeesData = activeCompany.employees.map((employee) => {
    const liveAgent = agentsCache.find((agent) => agent.id === employee.agentId);
    const employeeSessions = sessionsByAgent.get(employee.agentId) ?? [];
    const lastActiveAt = employeeSessions.reduce((latest, session) => {
      return Math.max(latest, resolveSessionUpdatedAt(session));
    }, 0);
    const status: EmployeeCardData["status"] = employeeSessions.some((session) =>
      isSessionActive(session, currentTime),
    )
      ? "running"
      : lastActiveAt > 0 || Boolean(liveAgent)
        ? "idle"
        : "stopped";

    const latestSession = employeeSessions[0];
    const execution = latestSession
      ? sessionExecutions.get(latestSession.key) ??
        resolveExecutionState({ session: latestSession, now: currentTime })
      : resolveExecutionState({
          fallbackState: status === "stopped" ? "unknown" : "idle",
        });
    const focusSummary = buildEmployeeFocusSummary({
      agentId: employee.agentId,
      sessionKey: latestSession?.key,
      execution,
      roleLabel: employee.role,
    });

    return {
      ...employee,
      status,
      realName: liveAgent?.name || `NO.${employee.agentId.slice(0, 8).toUpperCase()}`,
      skills: liveAgent?.identity?.theme ? [] : ((employee as { skills?: string[] }).skills ?? []),
      lastActiveAt,
      execution,
      focusSummary,
    };
  });

  // Build Unified Stream by combining Sessions and Crons
  const requirementParticipantAgentIds = new Set(requirementScope?.participantAgentIds ?? []);
  const scopedEmployeesData = requirementScope
    ? employeesData.filter((employee) => requirementParticipantAgentIds.has(employee.agentId))
    : employeesData;
  const displayEmployeesData = requirementScope
    ? [
        ...employeesData.filter((employee) => requirementParticipantAgentIds.has(employee.agentId)),
        ...employeesData.filter((employee) => !requirementParticipantAgentIds.has(employee.agentId)),
      ]
    : employeesData;
  const scopedSessions = requirementScope
    ? companySessions.filter((session) => requirementParticipantAgentIds.has(session.agentId))
    : companySessions;
  const activeSessions = scopedSessions.filter((session) => isSessionActive(session, currentTime));
  const completedSessions = scopedSessions.filter((session) => !isSessionActive(session, currentTime));

  const unifiedStream: UnifiedStreamItem[] = [
    ...scopedSessions.map((session) => {
      const employee = employeesData.find((item) => item.agentId === session.agentId);
      const execution =
        sessionExecutions.get(session.key) ??
        resolveExecutionState({
          session,
          evidenceTexts: [session.lastMessagePreview],
          now: currentTime,
        });

      return {
        key: session.key,
        type: "session" as const,
        timestamp: resolveSessionUpdatedAt(session),
        employee,
        active: isSessionActive(session, currentTime),
        title: resolveSessionTitle(session),
        preview: session.lastMessagePreview,
        execution,
        focusSummary:
          employee?.focusSummary ??
          buildEmployeeFocusSummary({
            agentId: session.agentId,
            sessionKey: session.key,
            execution,
            roleLabel: employee?.role ?? "会话",
          }),
      };
    }),
    ...cronCache
      .filter(
        (c) =>
          c.agentId &&
          companyAgentIds.has(c.agentId) &&
          c.state?.lastRunAtMs &&
          (!requirementScope || requirementParticipantAgentIds.has(c.agentId)),
      )
      .map((c) => {
        const employee = employeesData.find((item) => item.agentId === c.agentId);
        const execution =
          c.state?.lastStatus === "error"
            ? resolveExecutionState({
                evidenceTexts: ["tool failure", "班次执行失败"],
                fallbackState: "blocked_tool_failure",
              })
            : resolveExecutionState({
                evidenceTexts: [c.state?.lastStatus === "running" ? "正在执行" : "已完成"],
                fallbackState: c.state?.lastStatus === "running" ? "running" : "completed",
              });

        return {
          key: `cron-${c.id}`,
          type: "cron" as const,
          timestamp: c.state!.lastRunAtMs!,
          employee,
          active: c.state?.lastStatus === "running",
          title: `自动化执行: ${c.name}`,
          preview: c.state?.lastStatus === "error" ? "❌ 自动化执行失败" : "✅ 自动化已完成",
          execution,
          focusSummary: buildExecutionFocusSummary({
            company: activeCompany,
            targetAgentId: c.agentId,
            targetRoleLabel: employee?.role ?? "自动化执行",
            execution,
            task: null,
            requests: [],
            handoffs: [],
            takeoverPack: null,
            alerts: [],
          }),
        };
      }),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 15);

  const getPresenceBadge = (status: string) => {
    if (status === "running") {
      return (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 animate-pulse" />
          运行中
        </Badge>
      );
    }
    if (status === "idle") {
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
          空闲
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20">
        <div className="w-1.5 h-1.5 rounded-full bg-slate-500 mr-1.5" />
        离线
      </Badge>
    );
  };

  const handoffRecords = companyHandoffs;
  const knowledgeItems = resolveCompanyKnowledge(activeCompany);
  const employeeInsights = buildEmployeeOperationalInsights({
    company: activeCompany,
    sessions: companySessions,
    now: currentTime,
  });
  const outcomeReport = buildOutcomeReport({
    company: activeCompany,
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
  const requestHealth = summarizeRequestHealth(companyRequests);
  const primaryWorkItem = currentWorkItem;

  const currentRequirementWorkItemId = primaryWorkItem?.id ?? null;
  const primaryRequirementTopicKey = primaryWorkItem?.topicKey ?? requirementOverview?.topicKey ?? null;
  const isStrategicRequirement = Boolean(
    primaryRequirementTopicKey && isStrategicRequirementTopic(primaryRequirementTopicKey),
  );
  const strategicRequirementOverview =
    requirementOverview && requirementOverview.topicKey === primaryRequirementTopicKey
      ? requirementOverview
      : null;
  const requirementDisplayTitle =
    primaryWorkItem
      ? primaryWorkItem.title || primaryWorkItem.headline || "当前需求"
      : (isStrategicRequirement && strategicRequirementOverview
          ? strategicRequirementOverview.title
          : requirementOverview?.title) ?? "当前需求";
  const requirementDisplayCurrentStep =
    primaryWorkItem
      ? primaryWorkItem.displayStage || primaryWorkItem.stageLabel || "待确认"
      : (isStrategicRequirement && strategicRequirementOverview
          ? strategicRequirementOverview.headline
          : requirementOverview?.headline) ?? "待确认";
  const requirementDisplaySummary =
    primaryWorkItem
      ? primaryWorkItem.displaySummary || primaryWorkItem.summary || "待确认"
      : (isStrategicRequirement && strategicRequirementOverview
          ? strategicRequirementOverview.summary
          : requirementOverview?.summary) ?? "待确认";
  const requirementDisplayOwner =
    primaryWorkItem
      ? primaryWorkItem.displayOwnerLabel || primaryWorkItem.ownerLabel || "待确认"
      : (isStrategicRequirement && strategicRequirementOverview
          ? strategicRequirementOverview.currentOwnerLabel
          : requirementOverview?.currentOwnerLabel) || "待确认";
  const requirementDisplayStage =
    primaryWorkItem
      ? primaryWorkItem.displayStage || primaryWorkItem.stageLabel || "待确认"
      : (isStrategicRequirement && strategicRequirementOverview
          ? strategicRequirementOverview.currentStage
          : requirementOverview?.currentStage) ?? "待确认";
  const requirementDisplayNext =
    primaryWorkItem
      ? primaryWorkItem.displayNextAction || primaryWorkItem.nextAction || "待确认"
      : (isStrategicRequirement && strategicRequirementOverview
          ? strategicRequirementOverview.nextAction
          : requirementOverview?.nextAction) ?? "待确认";
  const primaryOwnerEmployee =
    primaryWorkItem?.ownerActorId
      ? activeCompany.employees.find((employee) => employee.agentId === primaryWorkItem.ownerActorId) ?? null
      : requirementCurrentOwner;
  const latestEmployeeStates = isStrategicRequirement
    ? []
    : scopedEmployeesData.map((employee) => employee.execution.state);
  const blockedCount = isStrategicRequirement
    ? primaryWorkItem?.status === "blocked"
      ? 1
      : 0
    : latestEmployeeStates.filter((state) => isBlockedExecutionState(state)).length;
  const waitingCount = isStrategicRequirement
    ? primaryWorkItem?.status === "waiting_owner" || primaryWorkItem?.status === "waiting_review"
      ? 1
      : 0
    : latestEmployeeStates.filter((state) => isWaitingExecutionState(state)).length;
  const manualCount = isStrategicRequirement
    ? 0
    : latestEmployeeStates.filter((state) => state === "manual_takeover_required").length;
  const runningCount = isStrategicRequirement
    ? primaryWorkItem && primaryWorkItem.status === "active"
      ? 1
      : 0
    : latestEmployeeStates.filter((state) => state === "running").length;
  const visibleHandoffRecords = isStrategicRequirement ? [] : handoffRecords;
  const visiblePendingHandoffs = visibleHandoffRecords.filter((handoff) => handoff.status !== "completed").length;
  const visibleBlockedHandoffs = visibleHandoffRecords.filter((handoff) => handoff.status === "blocked").length;
  const visibleRequestHealth = isStrategicRequirement
    ? { total: 0, active: 0, blocked: 0 }
    : requestHealth;
  const visibleSlaAlerts = isStrategicRequirement ? [] : slaAlerts;
  const visibleManualCount = isStrategicRequirement ? 0 : manualCount;
  const showOperationalQueues = !primaryWorkItem;
  const completedWorkSteps = primaryWorkItem?.steps.filter((step) => step.status === "done").length ?? 0;
  const totalWorkSteps = primaryWorkItem?.steps.length ?? 0;
  const teamHealthLabel =
    visibleManualCount > 0
      ? `${visibleManualCount} 处需人工介入`
      : blockedCount > 0
        ? `${blockedCount} 处阻塞待处理`
        : waitingCount > 0
          ? `${waitingCount} 项待跟进`
          : "当前推进稳定";
  const teamHealthClass =
    visibleManualCount > 0 || blockedCount > 0
      ? "text-rose-600 bg-rose-50"
      : waitingCount > 0
        ? "text-amber-700 bg-amber-50"
        : "text-green-600 bg-green-50";

  const handleCopyBlueprint = async () => {
    try {
      const blueprint = buildCompanyBlueprint({
        company: {
          ...activeCompany,
          knowledgeItems,
        },
        jobs: cronCache,
      });
      await navigator.clipboard.writeText(JSON.stringify(blueprint, null, 2));
      toast.success("组织蓝图已复制", "可以在新建公司页选择“从蓝图复制”后直接粘贴。");
    } catch (error) {
      toast.error("复制失败", error instanceof Error ? error.message : String(error));
    }
  };

  const handleSyncKnowledge = async () => {
    await updateCompany({ knowledgeItems });
    toast.success("共享知识已同步", `已写入 ${knowledgeItems.length} 条公司级知识内容。`);
  };

  const handleRecoverCommunication = async (options?: { silent?: boolean; force?: boolean }) => {
    if (!activeCompany) {
      return;
    }

    setRecoveringCommunication(true);
    try {
      const { companyPatch, dispatches, sessionSnapshots, summary } =
        await syncCompanyCommunicationState({
          company: activeCompany,
          previousSnapshots: companySessionSnapshots,
          activeArtifacts,
          activeDispatches,
          force: options?.force,
        });
      setCompanySessionSnapshots(sessionSnapshots);
      replaceDispatchRecords(dispatches);
      await updateCompany(companyPatch);
      if (!options?.silent) {
        toast.success(
          "请求闭环已同步",
          `新增 ${summary.requestsAdded}，更新 ${summary.requestsUpdated}，恢复任务 ${summary.tasksRecovered}，恢复交接 ${summary.handoffsRecovered}。`,
        );
      }
    } catch (error) {
      if (!options?.silent) {
        toast.error("恢复失败", error instanceof Error ? error.message : String(error));
      }
    } finally {
      setRecoveringCommunication(false);
    }
  };

  useEffect(() => {
    if (!activeCompany || !connected || !isPageVisible) {
      return;
    }
    void handleRecoverCommunication({
      silent: true,
      force: companySessionSnapshots.length === 0,
    });
  }, [activeCompany, companySessionSnapshots.length, connected, isPageVisible]);

  useEffect(() => {
    if (!activeCompany || !connected || !isPageVisible) {
      return;
    }
    const companyAgentIds = new Set(activeCompany.employees.map((employee) => employee.agentId));
    let timerId: number | null = null;
    const unsubscribe = gateway.subscribe("chat", (payload) => {
      const sessionKey = extractChatSyncSessionKey(payload);
      const actorId = resolveSessionActorId(sessionKey);
      if (!actorId || !companyAgentIds.has(actorId)) {
        return;
      }
      if (timerId !== null) {
        return;
      }
      timerId = window.setTimeout(() => {
        timerId = null;
        void handleRecoverCommunication({ silent: true });
      }, 400);
    });
    return () => {
      unsubscribe();
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [activeCompany, connected, handleRecoverCommunication, isPageVisible]);

  const handleHireSubmit = async (config: HireConfig) => {
    if (!activeCompany) {
      return;
    }

    const role = (config.role ?? "").trim();
    const description = (config.description ?? "").trim();
    if (!role || !description) {
      return;
    }

    setHireSubmitting(true);
    try {
      const result = await AgentOps.hireEmployee(activeCompany, config);
      setHireDialogOpen(false);
      navigate(`/chat/${result.agentId}`);
    } finally {
      setHireSubmitting(false);
    }
  };

  const handleUpdateRoleSubmit = async (values: Record<string, string>) => {
    if (!updateRoleTarget) return;
    const role = (values.role ?? "").trim();
    const description = (values.description ?? "").trim();
    if (!role || !description) return;

    setUpdateRoleSubmitting(true);
    try {
      await AgentOps.updateRole(updateRoleTarget, role, description);
      setUpdateRoleDialogOpen(false);
    } finally {
      setUpdateRoleSubmitting(false);
    }
  };

  const handleFireEmployee = (agentId: string) => {
    setFireEmployeeTarget(agentId);
    setFireEmployeeDialogOpen(true);
  };

  const onFireEmployeeSubmit = async () => {
    if (!activeCompany || !fireEmployeeTarget) return;
    try {
      await AgentOps.fireAgent(fireEmployeeTarget);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleQuickTaskSubmit = async () => {
    if (!quickTaskTarget || !quickTaskInput.trim()) return;
    setQuickTaskSubmitting(true);
    try {
      await AgentOps.assignTask(quickTaskTarget, quickTaskInput.trim());
      toast.success("指令派发成功", "任务已交给对应成员。");
      setQuickTaskInput("");
    } catch (err: any) {
      toast.error("派发失败", err.message || String(err));
    } finally {
      setQuickTaskSubmitting(false);
    }
  };

  const handleGroupChatSubmit = (values: Record<string, any>) => {
    const topic = (values.topic ?? "").trim();
    const members = Object.keys(values)
      .filter((k) => k.startsWith("member_") && values[k])
      .map((k) => k.replace("member_", ""));

    if (!topic || members.length < 2) {
      toast.warning("信息不全", "请至少选择2名跨部门与会者，并指定会议主题");
      return;
    }
    setGroupChatSubmitting(true);
    try {
      const currentRequirementTopicKey =
        requirementOverview?.topicKey && requestTopicMatchesText(requirementOverview.topicKey, topic)
          ? requirementOverview.topicKey
          : null;
      const route = buildRequirementRoomRoute({
        company: activeCompany,
        memberIds: members,
        topic,
        topicKey: currentRequirementTopicKey,
        workItemId: currentRequirementWorkItemId,
        existingRooms: activeRoomRecords,
      });
      if (!route) {
        toast.error("团队房间创建失败", "没有生成有效的需求团队房间。");
        return;
      }

      navigate(route);
      setGroupChatDialogOpen(false);
    } finally {
      setGroupChatSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">运营大厅</h1>
          <p className="mt-1 text-sm text-slate-500">
            {requirementOverview
              ? isStrategicRequirement
                ? `当前默认只看「${requirementDisplayTitle}」这条战略主线，执行期超时、接管和历史请求已自动隐藏。`
                : `当前默认只看「${requirementDisplayTitle}」这条主线，历史交接、旧请求和过期活动已隐藏。`
              : "这里只看异常、成员状态和最近活动。完整任务顺序和子任务进度请去工作看板。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/board")}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            查看工作看板
          </Button>
          {ceoEmployee ? (
            <Button variant="outline" onClick={() => navigate(`/chat/${ceoEmployee.agentId}`)}>
              <MessageSquare className="mr-2 h-4 w-4" />
              联系 CEO
            </Button>
          ) : null}
        </div>
      </div>

      {requirementOverview ? (
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm">
          <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.4fr,1fr,auto] lg:items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-500">
                本次需求总览
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-950">
                {requirementDisplayTitle}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-700">
                {requirementDisplayCurrentStep}
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                {requirementDisplaySummary}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  当前负责人
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {requirementDisplayOwner}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  当前环节：{requirementDisplayStage}
                </div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  下一步
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-800">
                  {requirementDisplayNext}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {(primaryWorkItem?.ownerActorId ?? requirementCurrentOwner?.agentId) ? (
                <Button
                  onClick={() =>
                    navigate(
                      `/chat/${encodeURIComponent(
                        primaryWorkItem?.ownerActorId ?? requirementCurrentOwner!.agentId,
                      )}`,
                    )
                  }
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  打开当前负责人
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => navigate("/board")}>
                查看工作看板
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-slate-50 to-white shadow-sm border-slate-200">
          <CardContent className="p-3 md:p-4 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] md:text-xs font-semibold uppercase text-slate-500 tracking-wider">
                {requirementOverview ? "当前协作成员" : "团队成员"}
              </span>
              <Server className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl md:text-3xl font-bold tracking-tight">
                {requirementOverview ? scopedEmployeesData.length : employeesData.length}
              </span>
              <span className={`text-[9px] md:text-xs font-medium px-1.5 py-0.5 rounded ${teamHealthClass}`}>
                {teamHealthLabel}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-50 to-white shadow-sm border-slate-200">
          <CardContent className="p-3 md:p-4 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] md:text-xs font-semibold uppercase text-slate-500 tracking-wider">
                {requirementOverview ? "当前主线进行中" : "进行中的任务流"}
              </span>
              <Play className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl md:text-3xl font-bold tracking-tight text-blue-700">
                {activeSessions.length}
              </span>
              <span className="text-[9px] md:text-xs text-slate-500">处理中事务</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-50 to-white shadow-sm border-slate-200">
          <CardContent className="p-3 md:p-4 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] md:text-xs font-semibold uppercase text-slate-500 tracking-wider">
                {requirementOverview ? "当前主线已完成" : "最近结束的任务流"}
              </span>
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl md:text-3xl font-bold tracking-tight text-slate-700">
                {completedSessions.length}
              </span>
              <span className="text-[9px] md:text-xs text-slate-500">笔交付记录</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-50 to-white shadow-sm border-slate-200">
          <CardContent className="p-3 md:p-4 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] md:text-xs font-semibold uppercase text-slate-500 tracking-wider">
                近 30 天估算成本
              </span>
              <BarChart className="w-4 h-4 text-orange-400" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl md:text-3xl font-bold tracking-tight text-orange-600">
                <span className="text-lg md:text-xl">$</span>{" "}
                {usageCost !== null ? usageCost.toFixed(4) : "--"}
              </span>
              <span className="text-[9px] md:text-xs text-slate-500">USD 估算</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        {primaryWorkItem ? (
          <>
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
              当前负责人：{requirementDisplayOwner}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
              当前环节：{requirementDisplayStage}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
              下一步：{requirementDisplayNext}
            </span>
            {totalWorkSteps > 0 ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                进度：{completedWorkSteps}/{totalWorkSteps}
              </span>
            ) : null}
            {visibleManualCount > 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                当前需求需人工介入 {visibleManualCount} 项
              </span>
            ) : null}
          </>
        ) : (
          <>
            <ExecutionStateBadge
              compact
              status={resolveExecutionState({
                fallbackState: blockedCount > 0 ? "blocked_timeout" : "idle",
                evidenceTexts: [
                  blockedCount > 0
                    ? `${blockedCount} 位成员存在阻塞`
                    : "当前没有检测到超时或工具阻塞",
                ],
              })}
            />
            <span className="text-xs text-slate-500">
              {blockedCount > 0
                ? `${blockedCount} 位成员需要优先排障`
                : "当前没有高优先级阻塞"}
            </span>
            <ExecutionStateBadge
              compact
              status={resolveExecutionState({
                fallbackState: waitingCount > 0 ? "waiting_peer" : "idle",
                evidenceTexts: [
                  waitingCount > 0 ? `${waitingCount} 位成员正在等待输入或同事反馈` : "当前没有等待中的交接",
                ],
              })}
            />
            <span className="text-xs text-slate-500">
              {visibleManualCount > 0 ? `${visibleManualCount} 位成员已进入人工接管态` : `${runningCount} 位成员仍在执行中`}
            </span>
            {showOperationalQueues && handoffRecords.length > 0 && (
              <span className="text-xs text-slate-500">
                交接 {visibleHandoffRecords.length} 条，待完成 {visiblePendingHandoffs}，阻塞 {visibleBlockedHandoffs}
              </span>
            )}
            {showOperationalQueues && visibleRequestHealth.total > 0 && (
              <span className="text-xs text-slate-500">
                请求 {visibleRequestHealth.total} 条，活跃 {visibleRequestHealth.active}，阻塞 {visibleRequestHealth.blocked}
              </span>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-950">
              {primaryWorkItem ? "本次需求的卡点与下一步" : "先处理这些异常与下一步"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {primaryWorkItem
                ? "这里默认只保留本次需求的负责人、阶段和下一步；旧请求、交接和 SLA 已降到次级视图。"
                : "这里是后台总览。先在 CEO 首页推进工作，再来这里排障和查看全局状态。"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
              阻塞 {blockedCount}
            </Badge>
            {showOperationalQueues ? (
              <>
                <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                  交接 {visiblePendingHandoffs}
                </Badge>
                <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                  请求 {visibleRequestHealth.active}
                </Badge>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  SLA {visibleSlaAlerts.length}
                </Badge>
              </>
            ) : totalWorkSteps > 0 ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                进度 {completedWorkSteps}/{totalWorkSteps}
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
              接管 {visibleManualCount}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="border-slate-200 bg-white"
              disabled={recoveringCommunication}
              onClick={() => void handleRecoverCommunication()}
            >
              {recoveringCommunication ? "恢复中..." : "恢复当前阻塞"}
            </Button>
          </div>
        </div>
        {primaryWorkItem ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {primaryOwnerEmployee ? (
              <button
                type="button"
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3 text-left transition-colors hover:bg-indigo-100"
                onClick={() => navigate(`/chat/${encodeURIComponent(primaryOwnerEmployee.agentId)}`)}
              >
                <div className="text-sm font-medium text-slate-900">打开当前负责人</div>
                <div className="mt-1 text-xs leading-5 text-slate-600">
                  {requirementDisplayOwner} · {requirementDisplayStage}
                </div>
                <div className="mt-2 text-[11px] font-medium text-slate-500">现在就去处理当前卡点</div>
              </button>
            ) : null}
            {ceoEmployee ? (
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-100"
                onClick={() => navigate(`/chat/${ceoEmployee.agentId}`)}
              >
                <div className="text-sm font-medium text-slate-900">回 CEO 会话</div>
                <div className="mt-1 text-xs leading-5 text-slate-600">
                  继续推进主线指令和跨节点协作。
                </div>
                <div className="mt-2 text-[11px] font-medium text-slate-500">查看主会话</div>
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-100"
              onClick={() => navigate("/board")}
            >
              <div className="text-sm font-medium text-slate-900">查看当前需求看板</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">
                只看这条主线的任务顺序、当前步骤和下一棒。
              </div>
              <div className="mt-2 text-[11px] font-medium text-slate-500">进入工作看板</div>
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-100"
              onClick={() => void handleRecoverCommunication()}
              disabled={recoveringCommunication}
            >
              <div className="text-sm font-medium text-slate-900">
                {recoveringCommunication ? "同步当前阻塞中..." : "同步当前阻塞"}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-600">
                重扫这条主线的请求、交接和回复，清掉过期卡点。
              </div>
              <div className="mt-2 text-[11px] font-medium text-slate-500">只同步当前需求</div>
            </button>
          </div>
        ) : ceoSurface.topActions.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {ceoSurface.topActions.map((item) => (
              <button
                key={item.id}
                type="button"
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-100"
                onClick={() => navigate(item.href)}
              >
                <div className="text-sm font-medium text-slate-900">{item.title}</div>
                <div className="mt-1 text-xs leading-5 text-slate-600">{item.summary}</div>
                <div className="mt-2 text-[11px] font-medium text-slate-500">{item.actionLabel}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {visibleManualCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-950">人工接管警报</div>
              <div className="mt-1 text-xs text-amber-800">
                当前有 {visibleManualCount} 条执行链路要求人工介入，建议直接进入对应会话复制接管包。
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-200 bg-white text-amber-900 hover:bg-amber-100"
              onClick={() => {
                const manualSession = scopedSessions.find(
                  (session) => sessionExecutions.get(session.key)?.state === "manual_takeover_required",
                );
                if (manualSession) {
                  navigate(
                    resolveConversationPresentation({
                      sessionKey: manualSession.key,
                      actorId: resolveSessionActorId(manualSession),
                      rooms: activeRoomRecords,
                      employees: activeCompany.employees,
                    }).route,
                  );
                }
              }}
            >
              查看接管包
            </Button>
          </div>
        </div>
      )}

      {showOperationalQueues && visibleRequestHealth.active > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-sky-950">
                {primaryWorkItem ? "当前需求请求闭环" : "请求闭环队列"}
              </div>
              <div className="mt-1 text-xs text-sky-800">
                {primaryWorkItem
                  ? `当前这条主线还有 ${visibleRequestHealth.active} 条请求未真正闭环，其中阻塞 ${visibleRequestHealth.blocked} 条；历史请求已隐藏。`
                  : `当前有 ${visibleRequestHealth.active} 条请求仍未真正闭环，其中阻塞 ${visibleRequestHealth.blocked} 条。`}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-sky-200 bg-white text-sky-900 hover:bg-sky-100"
              disabled={recoveringCommunication}
              onClick={() => void handleRecoverCommunication()}
            >
              {recoveringCommunication ? "同步中..." : "同步请求闭环"}
            </Button>
          </div>
        </div>
      )}

      {showOperationalQueues && visibleSlaAlerts.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-rose-950">
                {primaryWorkItem ? "当前需求超时提醒" : "SLA 升级队列"}
              </div>
              <div className="mt-1 text-xs text-rose-800">
                {primaryWorkItem
                  ? `当前这条主线有 ${visibleSlaAlerts.length} 条升级提醒，历史超时项已隐藏。`
                  : `当前有 ${visibleSlaAlerts.length} 条规则触发升级，CEO 不需要手动轮询即可看到这些异常。`}
              </div>
            </div>
          </div>
          {primaryWorkItem ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-white/80 px-3 py-3 text-xs leading-6 text-slate-700">
              具体超时条目已收起，避免旧提醒再次抢占视线。默认先按上面的“当前负责人 / 下一步 / 查看工作看板”推进主线。
            </div>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {visibleSlaAlerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border border-rose-200 bg-white/80 px-3 py-2 text-xs text-slate-700"
                >
                  <div className="font-medium text-slate-900">{alert.title}</div>
                  <div className="mt-1">{alert.summary}</div>
                  <div className="mt-1 text-[11px] text-rose-700">
                    {alert.ageMinutes} 分钟 · {alert.recommendedAction}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <OpsSectionCard
        title="运营工具与共享知识"
        description="把规范、复用和快速派单放在第二层，首屏先保留异常与下一步。"
        meta={`知识 ${knowledgeItems.length} · 班次 ${cronCache.length}`}
      >
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1.7fr,1fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-slate-50/60">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    共享知识板
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    把设定、职责、里程碑和默认交付流程沉淀成共享知识，而不是散在聊天里。
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => void handleSyncKnowledge()}>
                  <Copy className="mr-2 h-4 w-4" />
                  写入公司知识
                </Button>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 md:grid-cols-2">
                {knowledgeItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                          {item.kind}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          item.status === "active"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : item.status === "watch"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                        }
                      >
                        {item.status === "active" ? "已启用" : item.status === "watch" ? "需关注" : "草稿"}
                      </Badge>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-slate-700">{item.summary}</div>
                    <div className="mt-3 text-xs leading-5 text-slate-500">{item.details}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b bg-slate-50/60">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitFork className="w-4 h-4 text-teal-600" />
                    可复用团队蓝图
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  复制当前公司的组织、知识和自动化蓝图，在新公司中直接复用。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">知识条目</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{knowledgeItems.length}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">自动化班次</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{cronCache.length}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  蓝图会带上当前组织的员工结构、共享知识层、快捷指令和自动化班次，适合复制到新的项目或团队。
                </div>
                <Button className="w-full" onClick={() => void handleCopyBlueprint()}>
                  <Copy className="mr-2 h-4 w-4" />
                  复制组织蓝图
                </Button>
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-600">当前运营复盘摘要</div>
                  <div className="mt-2 text-sm leading-6 text-slate-800">{retrospective.summary}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="bg-white border rounded-lg p-1.5 flex flex-col md:flex-row md:items-center shadow-sm gap-2">
            <select
              className="h-10 px-3 md:border-r border-slate-200 bg-transparent outline-none text-sm font-medium w-full md:w-[200px] shrink-0 hover:bg-slate-50 transition-colors"
              value={quickTaskTarget}
              onChange={(e) => setQuickTaskTarget(e.target.value)}
            >
              <option value="" disabled>
                选择直接派单成员...
              </option>
              {employeesData.map((e) => (
                <option key={e.agentId} value={e.agentId}>
                  {e.nickname} ({e.role})
                </option>
              ))}
            </select>
            <input
              type="text"
              className="flex-1 h-10 px-4 outline-none text-sm bg-transparent placeholder:text-slate-400"
              placeholder="直接交给所选成员，例如：开始巡检数据库健康状态"
              value={quickTaskInput}
              onChange={(e) => setQuickTaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuickTaskSubmit();
              }}
            />
            <Button
              size="sm"
              className="h-9 px-6 rounded shadow-none w-full md:w-auto"
              disabled={quickTaskSubmitting || !quickTaskTarget || !quickTaskInput.trim()}
              onClick={handleQuickTaskSubmit}
            >
              {quickTaskSubmitting ? (
                <span className="animate-spin mr-2">◓</span>
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}{" "}
              快速指派
            </Button>
          </div>
        </div>
      </OpsSectionCard>

      <OpsSectionCard
        title="成员状态与最近活动"
        description="只有在需要深挖谁在跑、谁阻塞、最近发生了什么时，再展开这一层。"
        meta={
          requirementOverview
            ? `当前需求成员 ${scopedEmployeesData.length} · 活动 ${unifiedStream.length}`
            : `成员 ${employeesData.length} · 活动 ${unifiedStream.length}`
        }
      >
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
            <h2 className="text-xl font-semibold flex items-center gap-2">团队成员</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setGroupChatDialogOpen(true)}>
                <Users className="mr-2 h-4 w-4 text-indigo-500" /> 跨部门会议
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const ceo = employeesData.find((e) => e.metaRole === "ceo");
                  if (ceo) navigate(`/chat/${ceo.agentId}`);
                }}
              >
                <MessageSquare className="mr-2 h-4 w-4" /> 联系 CEO
              </Button>
              <Button size="sm" onClick={() => setHireDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> 新增成员
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max">
          {displayEmployeesData.map((emp) => {
            const isManager =
              emp.metaRole === "ceo" ||
              emp.metaRole === "cto" ||
              emp.metaRole === "coo" ||
              emp.metaRole === "hr";
            return (
              <Card
                key={emp.agentId}
                className={`transition-all ${emp.status === "running" ? "border-primary/50 ring-1 ring-primary/20" : emp.status === "stopped" ? "opacity-75" : ""}`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Avatar className="h-10 w-10 border border-zinc-800 bg-zinc-900 rounded-lg">
                        <AvatarImage
                          src={getAvatarUrl(emp.agentId, emp.avatarJobId)}
                          className="object-cover"
                        />
                        <AvatarFallback className="bg-zinc-800 text-zinc-400 font-mono text-xs rounded-lg">
                          {emp.nickname.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate" title={emp.nickname}>
                          {emp.nickname}
                        </CardTitle>
                        <CardDescription className="truncate text-xs flex items-center gap-1">
                          {isManager && <Server className="w-3 h-3" />}
                          {emp.role}
                        </CardDescription>
                        {emp.skills && emp.skills.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {emp.skills.map((s: string) => (
                              <Badge
                                key={s}
                                variant="outline"
                                className="text-[10px] bg-slate-100/50"
                              >
                                {s}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 ml-2 flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {getPresenceBadge(emp.status)}
                        <ExecutionStateBadge compact status={emp.execution} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-slate-200"
                            >
                              <MoreVertical className="w-4 h-4 text-slate-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 z-50 bg-white">
                            <DropdownMenuLabel>管理操作</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setUpdateRoleTarget(emp.agentId);
                                setUpdateRoleInitial({ role: emp.role || "", description: "" });
                                setUpdateRoleDialogOpen(true);
                              }}
                            >
                              <ShieldAlert className="w-4 h-4 mr-2" />
                              调整职责描述
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <Cpu className="w-4 h-4 mr-2" />
                              更换大脑模型 (WIP)
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 hover:bg-red-50 hover:text-red-700 focus:text-red-700"
                              onClick={() => handleFireEmployee(emp.agentId)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              移除此成员
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <div className="text-xs text-muted-foreground mt-2 truncate" title={emp.realName}>
                    系统名称: {emp.realName}
                  </div>
                  <div className="mt-2 text-xs font-medium text-slate-700 line-clamp-2">
                    {emp.focusSummary.currentWork}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                    下一步：{emp.focusSummary.nextStep}
                  </div>
                  {emp.focusSummary.blockReason ? (
                    <div className="mt-1 text-[11px] text-rose-700 line-clamp-2">
                      当前卡点：{emp.focusSummary.blockReason}
                    </div>
                  ) : null}
                  {emp.execution.state === "manual_takeover_required" && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
                      该成员已进入人工接管态，建议直接打开会话复制接管包继续处理。
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full text-xs"
                      disabled={emp.status === "stopped"}
                      onClick={() => navigate(`/chat/${emp.agentId}`)}
                    >
                      <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> 聊天
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full text-xs"
                      disabled={emp.status === "stopped"}
                      onClick={() => navigate("/board")}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> 派单
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

          <Card className="lg:col-span-1 flex flex-col max-h-[600px] border-l-4 border-l-slate-200">
          <CardHeader className="shrink-0 bg-slate-50 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              {requirementOverview ? "本次需求活动动态" : "全时序活动动态"}
            </CardTitle>
            <CardDescription className="text-xs">
              {requirementOverview
                ? "这里只保留当前需求相关成员和自动化的最近活动。"
                : "按时间排列的所有交互流与自动化日志"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 pt-6">
            <div className="relative border-l ml-3 space-y-6 pl-6">
              {unifiedStream.map((item) => {
                return (
                  <div key={item.key} className="relative">
                    <div className="absolute -left-[31px] bg-background p-1 rounded-full border">
                      <Avatar className="h-8 w-8 border border-zinc-800 bg-zinc-900 rounded-lg shrink-0 overflow-hidden">
                        <AvatarImage
                          src={getAvatarUrl(
                            item.employee?.agentId,
                            item.employee?.avatarJobId,
                            (item as any).agentId || (item as any).job?.id,
                          )}
                          className="object-cover"
                        />
                        <AvatarFallback className="bg-zinc-800 text-zinc-500 rounded-lg text-[10px] font-mono">
                          SYS
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">
                        {item.employee?.nickname || item.employee?.agentId || "Unknown"}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[9px] uppercase px-1 py-0 scale-90 origin-left opacity-80"
                      >
                        {item.type === "cron" ? "自动化" : "会话"}
                      </Badge>
                      <ExecutionStateBadge compact status={item.execution} />
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-2 opacity-60">
                      <Clock className="w-3 h-3" />
                      {formatTime(item.timestamp || undefined)}
                    </div>
                    <div
                      className={`rounded-md p-2.5 text-xs ${item.active ? "bg-indigo-50 border border-indigo-100" : "bg-slate-50 border border-slate-100"}`}
                    >
                      <div className={item.active ? "text-indigo-800" : "text-slate-600"}>
                        <span className="font-medium">"{item.title}"</span>
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-slate-700">
                        {item.focusSummary.currentWork}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        下一步：{item.focusSummary.nextStep}
                      </div>
                      {item.focusSummary.blockReason ? (
                        <div className="mt-1 text-[11px] text-rose-700">
                          当前卡点：{item.focusSummary.blockReason}
                        </div>
                      ) : null}
                      {item.execution.state === "manual_takeover_required" && (
                        <button
                          type="button"
                          className="mt-2 inline-flex text-[11px] font-medium text-amber-800 hover:text-amber-900"
                          onClick={() =>
                            navigate(
                              resolveConversationPresentation({
                                sessionKey: item.key,
                                actorId: item.employee?.agentId ?? null,
                                rooms: activeRoomRecords,
                                employees: activeCompany.employees,
                              }).route,
                            )
                          }
                        >
                          查看接管包
                        </button>
                      )}
                      {item.preview && (
                        <div className="mt-1.5 text-[11px] text-slate-500 line-clamp-2 leading-relaxed border-t border-slate-200/50 pt-1.5 italic">
                          {(item.preview || "")
                            .slice(0, 100)
                            .replace(/([{["].{10,}$)/, "...[代码体隐藏]")
                            .replace(/__tool_call__[\s\S]*/, "...[正在调用系统工具]")}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {unifiedStream.length === 0 && (
                <div className="text-slate-400 text-sm py-4 border-l-transparent text-center">
                  系统还未产生任何活动记录
                </div>
              )}
            </div>
          </CardContent>
        </Card>
          </div>
        </div>
      </OpsSectionCard>

      <ImmersiveHireDialog
        open={hireDialogOpen}
        onOpenChange={setHireDialogOpen}
        onSubmit={handleHireSubmit}
        busy={hireSubmitting}
      />

      <ActionFormDialog
        open={groupChatDialogOpen}
        onOpenChange={setGroupChatDialogOpen}
        title="发起跨部门会议"
        description="选择会议主题和参会人员，系统将自动创建会议并通知相关人员。"
        confirmLabel="发起会议"
        busy={groupChatSubmitting}
        fields={[
          {
            name: "topic",
            label: "会议主题",
            type: "text",
            required: true,
            placeholder: "例如: 第二届双十一大促复盘",
          },
          ...employeesData.map((e) => ({
            name: `member_${e.agentId}`,
            label: `邀请: ${e.nickname} (${e.role})`,
            type: "checkbox" as const,
            defaultValue: "true",
            required: false,
            placeholder: "",
          })),
        ]}
        onSubmit={handleGroupChatSubmit}
      />

      <ActionFormDialog
        open={updateRoleDialogOpen}
        onOpenChange={setUpdateRoleDialogOpen}
        title="调整成员职责"
        description="系统将联系 HR 下发结构变动与系统提示词修改命令。"
        confirmLabel="确认调岗"
        busy={updateRoleSubmitting}
        fields={[
          {
            name: "role",
            label: "岗位名称",
            defaultValue: updateRoleInitial?.role || "",
            required: true,
            placeholder: "例如：高级架构师",
          },
          {
            name: "description",
            label: "岗位补充说明",
            defaultValue: updateRoleInitial?.description || "",
            required: true,
            multiline: true,
            placeholder: "输入新的职责描述",
          },
        ]}
        onSubmit={handleUpdateRoleSubmit}
      />
      <ActionFormDialog
        open={fireEmployeeDialogOpen}
        onOpenChange={setFireEmployeeDialogOpen}
        title="移除此成员"
        description="移除后该成员将被彻底隔离并从团队中除名，此操作不可逆。是否继续？"
        confirmLabel="确认移除"
        fields={[]}
        onSubmit={onFireEmployeeSubmit}
      />
    </div>
  );
}
