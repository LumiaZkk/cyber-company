import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Files,
  MessageSquare,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildRequirementRoomHrefFromRecord } from "../../application/delegation/room-routing";
import { useMissionBoardApp, useMissionBoardQuery } from "../../application/mission";
import {
  buildPrimaryRequirementProjection,
  describeRequirementRoomPreview,
  buildRequirementExecutionProjection,
} from "../../application/mission/requirement-execution-projection";
import { buildPrimaryRequirementSurface } from "../../application/mission/primary-requirement-surface";
import { buildRequirementDecisionTicketId } from "../../application/mission/requirement-decision-ticket";
import {
  getRequirementStatusToneClass,
  resolveRequirementProductStatus,
} from "../../application/mission/requirement-product-status";
import {
  loadRequirementMetricEvents,
  trackRequirementMetric,
  type RequirementMetricEvent,
} from "../../application/telemetry/requirement-center-metrics";
import { formatWorkspaceBytes, useWorkspaceViewModel } from "../../application/workspace";
import { toast } from "../../components/system/toast-store";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { useGatewayStore } from "../../application/gateway";
import { usePageVisibility } from "../../lib/use-page-visibility";
import { formatTime } from "../../lib/utils";
import { useBoardCommunicationSync } from "../board/hooks/useBoardCommunicationSync";
import { useBoardRuntimeState } from "../board/hooks/useBoardRuntimeState";
import { useBoardTaskBackfill } from "../board/hooks/useBoardTaskBackfill";

function getExecutionStateLabel(state: string | null | undefined) {
  if (state === "completed") {
    return "已完成";
  }
  if (state === "waiting_input") {
    return "待输入";
  }
  if (state === "waiting_peer") {
    return "待协作";
  }
  if (state === "blocked_timeout" || state === "blocked_tool_failure" || state === "manual_takeover_required") {
    return "有阻塞";
  }
  if (state === "running") {
    return "执行中";
  }
  if (state === "idle") {
    return "待启动";
  }
  return "待确认";
}

function getRequirementTimelineLabel(eventType: string) {
  if (eventType === "requirement_seeded") return "主线已立项";
  if (eventType === "requirement_promoted") return "主线已切换";
  if (eventType === "requirement_change_requested") return "需求变更待确认";
  if (eventType === "requirement_owner_changed") return "负责人已变更";
  if (eventType === "requirement_room_bound") return "需求房已绑定";
  if (eventType === "requirement_completed") return "执行已收口";
  if (eventType === "requirement_acceptance_requested") return "已发起验收";
  if (eventType === "requirement_accepted") return "验收已通过";
  if (eventType === "requirement_reopened") return "需求已重开";
  if (eventType.startsWith("chat_")) return "收到会话证据";
  return "主线已更新";
}

function getRequirementTimelineSummary(payload: Record<string, unknown>) {
  if (typeof payload.summary === "string" && payload.summary.trim().length > 0) {
    return payload.summary.trim();
  }
  if (typeof payload.messageText === "string" && payload.messageText.trim().length > 0) {
    return payload.messageText.trim();
  }
  if (typeof payload.nextAction === "string" && payload.nextAction.trim().length > 0) {
    return payload.nextAction.trim();
  }
  return "当前主线已收到新的推进证据。";
}

function summarizeRequirementMetricEvents(events: RequirementMetricEvent[]) {
  return {
    requirementCenterOpened: events.filter((event) => event.name === "requirement_center_opened").length,
    collaborationOpened: events.filter((event) => event.name === "requirement_collaboration_opened").length,
    workspaceOpened: events.filter((event) => event.name === "requirement_workspace_opened").length,
    opsOpened: events.filter((event) => event.name === "requirement_ops_opened").length,
    acceptanceRequested: events.filter((event) => event.name === "requirement_acceptance_requested").length,
    acceptanceAccepted: events.filter((event) => event.name === "requirement_accepted").length,
    requirementReopened: events.filter((event) => event.name === "requirement_reopened").length,
  };
}

function getRequirementTimelinePriority(source: string) {
  if (source === "company-event") {
    return 0;
  }
  if (source === "local-command") {
    return 1;
  }
  if (source === "gateway-chat") {
    return 2;
  }
  return 3;
}

function buildRequirementTimelineDedupKey(event: RequirementCenterContentProps["activeRequirementEvidence"][number]) {
  const revision = typeof event.payload.revision === "number" ? event.payload.revision : null;
  if (revision !== null && event.eventType.startsWith("requirement_")) {
    return `${event.eventType}:${revision}`;
  }
  return event.id;
}

type RequirementCenterContentProps = Omit<ReturnType<typeof useMissionBoardQuery>, "activeCompany"> &
  ReturnType<typeof useMissionBoardApp> & {
    activeCompany: NonNullable<ReturnType<typeof useMissionBoardQuery>["activeCompany"]>;
  };

export function RequirementCenterScreen() {
  const viewModel = {
    ...useMissionBoardQuery(),
    ...useMissionBoardApp(),
  };
  const { activeCompany, ...restViewModel } = viewModel;

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  return <RequirementCenterContent activeCompany={activeCompany} {...restViewModel} />;
}

function RequirementCenterContent({
  activeCompany,
  activeConversationStates,
  activeDispatches,
  activeRoomRecords,
  activeWorkItems,
  activeRequirementAggregates,
  activeRequirementEvidence,
  activeDecisionTickets,
  activeAgentSessions,
  activeAgentRuntime,
  activeAgentStatuses,
  primaryRequirementId,
  activeArtifacts,
  replaceDispatchRecords,
  upsertTask,
  updateCompany,
  applyRequirementTransition,
  upsertWorkItemRecord,
  resolveDecisionTicket,
  upsertDecisionTicketRecord,
  ensureRequirementRoomForAggregate,
}: RequirementCenterContentProps) {
  const navigate = useNavigate();
  const isPageVisible = usePageVisibility();
  const connected = useGatewayStore((state) => state.connected);
  const supportsAgentFiles = useGatewayStore((state) => state.capabilities.agentFiles);
  const {
    setCompanySessionSnapshots,
    companySessionSnapshots,
    companySessions,
    currentTime,
    sessionStates,
    sessionTakeoverPacks,
    fileTasks,
  } = useBoardRuntimeState({
    activeCompany,
    activeAgentSessions,
    activeAgentRuntime,
    activeAgentStatuses,
    activeArtifacts,
    connected,
    isPageVisible,
    supportsAgentFiles,
  });
  const workspaceViewModel = useWorkspaceViewModel({ isPageVisible });
  const [acceptanceSubmitting, setAcceptanceSubmitting] = useState<null | "request" | "accept" | "revise" | "reopen" | "change">(null);
  const [decisionSubmittingOptionId, setDecisionSubmittingOptionId] = useState<string | null>(null);
  const [metricRevision, setMetricRevision] = useState(0);
  const trackedOpenKeyRef = useRef<string | null>(null);

  const ceo = activeCompany.employees.find((employee) => employee.metaRole === "ceo") ?? null;
  const primaryRequirementSurface = useMemo(
    () =>
      buildPrimaryRequirementSurface({
        company: activeCompany,
        activeConversationStates,
        activeWorkItems,
        activeRequirementAggregates,
        activeRequirementEvidence,
        activeDecisionTickets,
        primaryRequirementId,
        activeRoomRecords,
        companySessions,
        companySessionSnapshots,
        currentTime,
        ceoAgentId: ceo?.agentId ?? null,
      }),
    [
      activeCompany,
      activeConversationStates,
      activeDecisionTickets,
      activeRequirementAggregates,
      activeRequirementEvidence,
      activeRoomRecords,
      activeWorkItems,
      companySessionSnapshots,
      companySessions,
      currentTime,
      ceo?.agentId,
      primaryRequirementId,
    ],
  );

  const requirementSurface = useMemo(
    () =>
      buildPrimaryRequirementProjection({
        company: activeCompany,
        activeConversationStates,
        activeWorkItems,
        activeRequirementAggregates,
        primaryRequirementId,
        companySessions,
        companySessionSnapshots,
        activeRoomRecords,
        currentTime,
        ceoAgentId: ceo?.agentId ?? null,
      }),
    [
      activeCompany,
      activeConversationStates,
      activeRequirementAggregates,
      activeRoomRecords,
      activeWorkItems,
      ceo?.agentId,
      companySessionSnapshots,
      companySessions,
      currentTime,
      primaryRequirementId,
    ],
  );

  const boardTaskSurface = useMemo(
    () =>
      buildRequirementExecutionProjection({
        activeCompany,
        companySessions,
        currentTime,
        fileTasks,
        sessionStates,
        sessionTakeoverPacks,
        requirementScope: requirementSurface.requirementScope,
        currentWorkItem: requirementSurface.currentWorkItem,
        activeWorkItem: requirementSurface.activeWorkItem,
        requirementOverview: requirementSurface.requirementOverview,
        strategicRequirementOverview: requirementSurface.strategicRequirementOverview,
        isStrategicRequirement: requirementSurface.isStrategicRequirement,
        requirementSyntheticTask: requirementSurface.requirementSyntheticTask,
      }),
    [
      activeCompany,
      companySessions,
      currentTime,
      fileTasks,
      requirementSurface,
      sessionStates,
      sessionTakeoverPacks,
    ],
  );

  useBoardTaskBackfill({
    tasks: boardTaskSurface.trackedTasks,
    upsertTask,
  });

  const { recoveringCommunication, handleRecoverCommunication } = useBoardCommunicationSync({
    activeCompany,
    surface: "requirement_center",
    companySessionSnapshots,
    setCompanySessionSnapshots,
    activeArtifacts,
    activeDispatches,
    replaceDispatchRecords,
    updateCompany,
    connected,
    isPageVisible,
  });

  const aggregate = primaryRequirementSurface.aggregate;
  const workItem = primaryRequirementSurface.workItem ?? requirementSurface.currentWorkItem ?? null;
  const room = primaryRequirementSurface.room ?? requirementSurface.requirementRoomRecords[0] ?? null;
  const openRequirementDecisionTicket = primaryRequirementSurface.openDecisionTicket;
  const productStatus = resolveRequirementProductStatus({
    aggregate,
    workItem,
  });
  const statusClassName = getRequirementStatusToneClass(productStatus.tone);
  const ownerAgentId = aggregate?.ownerActorId ?? workItem?.ownerActorId ?? null;
  const ownerLabel =
    workItem?.displayOwnerLabel ??
    workItem?.ownerLabel ??
    aggregate?.ownerLabel ??
    "当前负责人";
  const stageLabel =
    workItem?.displayStage ??
    workItem?.stageLabel ??
    aggregate?.stage ??
    "待推进";
  const nextAction =
    workItem?.displayNextAction ??
    workItem?.nextAction ??
    aggregate?.nextAction ??
    "继续在需求房推进。";
  const summary =
    workItem?.displaySummary ??
    workItem?.summary ??
    aggregate?.summary ??
    "CEO 正在把这条主线收敛为可执行的结果。";

  const roomDispatches = useMemo(
    () =>
      activeDispatches
        .filter((dispatch) =>
          Boolean(
            (room?.id && dispatch.roomId === room.id) ||
              (aggregate?.workItemId && dispatch.workItemId === aggregate.workItemId),
          ),
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [activeDispatches, aggregate?.workItemId, room?.id],
  );

  const scopedArtifactIds = useMemo(
    () =>
      new Set(
        activeArtifacts
          .filter((artifact) =>
            Boolean(
              (aggregate?.workItemId && artifact.workItemId === aggregate.workItemId) ||
                (artifact.ownerActorId && aggregate?.memberIds.includes(artifact.ownerActorId)) ||
                (artifact.sourceActorId && aggregate?.memberIds.includes(artifact.sourceActorId)),
            ),
          )
          .map((artifact) => artifact.id),
      ),
    [activeArtifacts, aggregate?.memberIds, aggregate?.workItemId],
  );

  const deliverableFiles = useMemo(() => {
    const scopedFiles = workspaceViewModel.workspaceFiles.filter((file) =>
      Boolean(
        (file.artifactId && scopedArtifactIds.has(file.artifactId)) ||
          (aggregate?.memberIds.includes(file.agentId) ?? false),
      ),
    );
    return (scopedFiles.length > 0 ? scopedFiles : workspaceViewModel.workspaceFiles)
      .slice(0, 6);
  }, [aggregate?.memberIds, scopedArtifactIds, workspaceViewModel.workspaceFiles]);
  const requirementTimeline = useMemo(() => {
    if (!aggregate) {
      return [];
    }
    const events = activeRequirementEvidence
      .filter((event) =>
        Boolean(
          event.aggregateId === aggregate.id ||
            (aggregate.workItemId && event.payload.workItemId === aggregate.workItemId) ||
            (aggregate.roomId && event.payload.roomId === aggregate.roomId) ||
            (aggregate.topicKey && event.payload.topicKey === aggregate.topicKey),
        ),
      )
      .sort((left, right) => {
        if (right.timestamp !== left.timestamp) {
          return right.timestamp - left.timestamp;
        }
        return getRequirementTimelinePriority(left.source) - getRequirementTimelinePriority(right.source);
      });
    const seen = new Set<string>();
    return events.filter((event) => {
      const key = buildRequirementTimelineDedupKey(event);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }).slice(0, 8);
  }, [activeRequirementEvidence, aggregate]);
  const [metricEvents, setMetricEvents] = useState<RequirementMetricEvent[]>([]);
  const metricSummary = useMemo(
    () => summarizeRequirementMetricEvents(metricEvents),
    [metricEvents],
  );

  const taskSequence = boardTaskSurface.taskSequence;
  const transcriptPreview = [...(room?.transcript ?? [])].slice(-4).reverse();
  const canRequestAcceptance =
    Boolean(aggregate) &&
    aggregate?.acceptanceStatus === "not_requested" &&
    (aggregate.status === "waiting_review" || aggregate.status === "completed");
  const canAccept = Boolean(aggregate) && aggregate?.acceptanceStatus === "pending";
  const canContinueModify =
    Boolean(aggregate) &&
    (aggregate?.acceptanceStatus === "pending" || aggregate?.acceptanceStatus === "accepted");
  const canRejectReopen =
    Boolean(aggregate) &&
    (aggregate?.acceptanceStatus === "pending" || aggregate?.status === "completed");
  const canRequestChange = Boolean(aggregate) && aggregate?.status !== "archived";

  const resolveRequirementDecision = (optionId: string) => {
    if (!openRequirementDecisionTicket) {
      return;
    }
    const option =
      openRequirementDecisionTicket.options.find((candidate) => candidate.id === optionId) ?? null;
    if (!option) {
      return;
    }
    setDecisionSubmittingOptionId(optionId);
    resolveDecisionTicket({
      ticketId: openRequirementDecisionTicket.id,
      optionId: option.id,
      resolution: option.summary ?? option.label,
      timestamp: Date.now(),
    });
    setDecisionSubmittingOptionId(null);
    toast.success("已记录你的决策", "当前主线会按这张决策票继续推进。");
  };

  const recordMetric = (input: {
    requirementId: string | null;
    name: RequirementMetricEvent["name"];
    metadata?: RequirementMetricEvent["metadata"];
  }) => {
    trackRequirementMetric({
      companyId: activeCompany.id,
      requirementId: input.requirementId,
      name: input.name,
      metadata: input.metadata,
    });
    setMetricRevision((revision) => revision + 1);
  };

  useEffect(() => {
    setMetricEvents(
      loadRequirementMetricEvents(activeCompany.id).filter(
        (event) => event.requirementId === (aggregate?.id ?? null),
      ),
    );
  }, [activeCompany.id, aggregate?.id, metricRevision]);

  const runAcceptanceAction = (mode: "request" | "accept" | "revise" | "reopen" | "change") => {
    if (!aggregate) {
      return;
    }
    const timestamp = Date.now();
    setAcceptanceSubmitting(mode);
    try {
      if (mode === "request") {
        recordMetric({
          requirementId: aggregate.id,
          name: "requirement_acceptance_requested",
        });
        applyRequirementTransition({
          aggregateId: aggregate.id,
          timestamp,
          source: "local-command",
          changes: {
            status: "waiting_review",
            acceptanceStatus: "pending",
            acceptanceNote: "待你验收",
            stage: "待你验收",
            nextAction: "请确认当前交付是否满足预期，选择验收通过或继续修改。",
          },
        });
        if (workItem) {
          upsertWorkItemRecord({
            ...workItem,
            status: "waiting_review",
            displayStage: "待你验收",
            stageLabel: "待你验收",
            displayNextAction: "请确认当前交付是否满足预期。",
            nextAction: "请确认当前交付是否满足预期。",
            updatedAt: Math.max(workItem.updatedAt, timestamp),
          });
        }
        toast.success("已发起验收", "当前主线已进入待你验收。");
      }
      if (mode === "accept") {
        recordMetric({
          requirementId: aggregate.id,
          name: "requirement_accepted",
        });
        applyRequirementTransition({
          aggregateId: aggregate.id,
          timestamp,
          source: "local-command",
          changes: {
            status: "completed",
            acceptanceStatus: "accepted",
            acceptanceNote: "验收通过",
            stage: "已完成",
            nextAction: "本次需求已通过验收，可以归档或开启下一条主线。",
          },
        });
        if (workItem) {
          upsertWorkItemRecord({
            ...workItem,
            status: "completed",
            displayStage: "已完成",
            stageLabel: "已完成",
            displayNextAction: "本次需求已通过验收，可以归档或开启下一条主线。",
            nextAction: "本次需求已通过验收，可以归档或开启下一条主线。",
            updatedAt: Math.max(workItem.updatedAt, timestamp),
            completedAt: timestamp,
          });
        }
        toast.success("验收已通过", "当前主线已正式闭环。");
      }
      if (mode === "revise" || mode === "reopen") {
        recordMetric({
          requirementId: aggregate.id,
          name: "requirement_reopened",
          metadata: { mode },
        });
        const stage = mode === "revise" ? "继续修改" : "驳回重开";
        const next = mode === "revise"
          ? "根据验收反馈继续修改后，再次提交验收。"
          : "当前结果未达标，请重新推进后再提交验收。";
        applyRequirementTransition({
          aggregateId: aggregate.id,
          timestamp,
          source: "local-command",
          changes: {
            status: "active",
            acceptanceStatus: mode === "revise" ? "not_requested" : "rejected",
            acceptanceNote: mode === "revise" ? "继续修改" : stage,
            stage,
            nextAction: next,
          },
        });
        if (workItem) {
          upsertWorkItemRecord({
            ...workItem,
            status: "active",
            displayStage: stage,
            stageLabel: stage,
            displayNextAction: next,
            nextAction: next,
            updatedAt: Math.max(workItem.updatedAt, timestamp),
            completedAt: null,
          });
        }
        toast.warning(stage, "当前主线已回到执行态。");
      }
      if (mode === "change") {
        const decisionTicketId = buildRequirementDecisionTicketId({
          sourceType: "requirement",
          sourceId: aggregate.id,
          decisionType: "requirement_change",
        });
        const existingDecisionTicket =
          activeDecisionTickets.find((ticket) => ticket.id === decisionTicketId) ?? null;
        recordMetric({
          requirementId: aggregate.id,
          name: "requirement_change_requested",
        });
        upsertDecisionTicketRecord({
          id: decisionTicketId,
          companyId: activeCompany.id,
          sourceType: "requirement",
          sourceId: aggregate.id,
          escalationId: null,
          aggregateId: aggregate.id,
          workItemId: workItem?.id ?? aggregate.workItemId ?? null,
          sourceConversationId:
            aggregate.sourceConversationId ?? workItem?.sourceConversationId ?? null,
          decisionOwnerActorId:
            ceo?.agentId ?? aggregate.ownerActorId ?? workItem?.ownerActorId ?? "system:requirement",
          decisionType: "requirement_change",
          summary: "请确认这次需求变更。系统会继续沿用当前需求主线，不会自动拆成新需求。",
          options: [
            {
              id: "confirm_change",
              label: "确认变更并继续",
              summary: "按新的范围继续推进当前需求。",
            },
            {
              id: "cancel_change",
              label: "取消这次变更",
              summary: "维持当前需求范围和执行计划。",
            },
          ],
          requiresHuman: true,
          status: "pending_human",
          resolution: null,
          resolutionOptionId: null,
          roomId: aggregate.roomId ?? workItem?.roomId ?? null,
          createdAt: existingDecisionTicket?.createdAt ?? timestamp,
          updatedAt: timestamp,
        });
        applyRequirementTransition({
          aggregateId: aggregate.id,
          timestamp,
          source: "local-command",
          changes: {
            status: "waiting_owner",
            acceptanceStatus: "not_requested",
            acceptanceNote: "需求变更待确认",
            stage: "需求变更中",
            nextAction: "请先在需求房确认变更范围、优先级和受影响任务，再决定是否继续执行。",
          },
        });
        if (workItem) {
          upsertWorkItemRecord({
            ...workItem,
            status: "waiting_owner",
            displayStage: "需求变更中",
            stageLabel: "需求变更中",
            displayNextAction: "请先在需求房确认变更范围、优先级和受影响任务，再决定是否继续执行。",
            nextAction: "请先在需求房确认变更范围、优先级和受影响任务，再决定是否继续执行。",
            updatedAt: Math.max(workItem.updatedAt, timestamp),
            completedAt: null,
          });
        }
        toast.warning("需求变更待确认", "当前主线已进入需求变更确认态，下一棒回到你。");
      }
    } finally {
      setAcceptanceSubmitting(null);
    }
  };

  const roomPreviewText = room
    ? describeRequirementRoomPreview(room, workItem)
    : aggregate
      ? "当前主线已经明确，但还没有固化出真实需求房。创建后会把已有派单和成员反馈回灌进来。"
      : "当前还没有绑定需求房，先由 CEO 或当前负责人继续收敛执行方式。";
  const collaborationActionLabel =
    primaryRequirementSurface.roomStatus === "ready"
      ? "进入需求房"
      : aggregate
        ? "创建并进入需求房"
        : "去协作";

  useEffect(() => {
    const openKey = `${activeCompany.id}:${aggregate?.id ?? "none"}`;
    if (trackedOpenKeyRef.current === openKey) {
      return;
    }
    trackedOpenKeyRef.current = openKey;
    trackRequirementMetric({
      companyId: activeCompany.id,
      requirementId: aggregate?.id ?? null,
      name: "requirement_center_opened",
      metadata: {
        hasRoom: Boolean(room),
        hasWorkItem: Boolean(workItem),
      },
    });
    setMetricRevision((revision) => revision + 1);
  }, [activeCompany.id, aggregate?.id, room, workItem]);

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <Card className="overflow-hidden border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.18),_transparent_34%),linear-gradient(135deg,#ffffff_0%,#f8fafc_46%,#eef2ff_100%)] shadow-sm">
        <CardHeader className="border-b border-white/70 bg-white/70 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  需求中心
                </Badge>
                <Badge variant="outline" className={statusClassName}>
                  {productStatus.label}
                </Badge>
                {aggregate ? (
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                    第 {aggregate.revision} 次推进
                  </Badge>
                ) : null}
              </div>
              <div>
                <CardTitle className="text-3xl font-black tracking-tight text-slate-950">
                  {workItem?.title ?? requirementSurface.requirementDisplayTitle ?? "当前主线需求"}
                </CardTitle>
                <CardDescription className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  {summary}
                </CardDescription>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    当前负责人
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">{ownerLabel}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    最后更新 {formatTime(aggregate?.updatedAt ?? workItem?.updatedAt ?? null)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    当前阶段
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">{stageLabel}</div>
                  <div className="mt-1 text-xs text-slate-500">{productStatus.description}</div>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    下一步
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">{nextAction}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {aggregate?.acceptanceNote?.trim() ? `当前备注：${aggregate.acceptanceNote}` : "主线会在这里持续同步。"}
                  </div>
                </div>
              </div>
              {openRequirementDecisionTicket ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                        待你决策
                      </div>
                      <div className="mt-2 font-semibold">{openRequirementDecisionTicket.summary}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {openRequirementDecisionTicket.options.map((option) => (
                        <Button
                          key={option.id}
                          variant="outline"
                          className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                          onClick={() => resolveRequirementDecision(option.id)}
                          disabled={decisionSubmittingOptionId === option.id}
                        >
                          {decisionSubmittingOptionId === option.id ? "处理中..." : option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  trackRequirementMetric({
                    companyId: activeCompany.id,
                    requirementId: aggregate?.id ?? null,
                    name: "requirement_collaboration_opened",
                    metadata: {
                      hasRoom: Boolean(room),
                    },
                  });
                  if (room) {
                    navigate(buildRequirementRoomHrefFromRecord(room));
                    return;
                  }
                  if (aggregate?.id) {
                    const ensuredRoom = ensureRequirementRoomForAggregate(aggregate.id);
                    if (ensuredRoom) {
                      navigate(buildRequirementRoomHrefFromRecord(ensuredRoom));
                      return;
                    }
                  }
                  if (ceo?.agentId) {
                    toast.info("需求房还未就绪", "已为这条主线创建房间失败，先回 CEO 会话继续推进或稍后重试。");
                    navigate(`/chat/${encodeURIComponent(ceo.agentId)}`);
                    return;
                  }
                  toast.info("当前还没有需求房", "先让 CEO 或负责人继续收敛后再进入多人协作。");
                }}
              >
                <Users className="mr-2 h-4 w-4" />
                {collaborationActionLabel}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  trackRequirementMetric({
                    companyId: activeCompany.id,
                    requirementId: aggregate?.id ?? null,
                    name: "requirement_workspace_opened",
                  });
                  navigate("/workspace");
                }}
              >
                <Files className="mr-2 h-4 w-4" />
                看交付
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  trackRequirementMetric({
                    companyId: activeCompany.id,
                    requirementId: aggregate?.id ?? null,
                    name: "requirement_ops_opened",
                  });
                  navigate("/ops");
                }}
              >
                <ShieldAlert className="mr-2 h-4 w-4" />
                去排障
              </Button>
              {ownerAgentId ? (
                <Button variant="outline" onClick={() => navigate(`/chat/${encodeURIComponent(ownerAgentId)}`)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  打开负责人
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
      </Card>

      {!aggregate ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="rounded-full bg-slate-100 p-3 text-slate-500">
              <BookOpenCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-950">当前还没有可推进的主线需求</div>
              <div className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                先去 CEO 深聊把目标、边界和下一步收敛出来，需求中心只承接已经形成主线的需求。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {ceo ? (
                <Button onClick={() => navigate(`/chat/${encodeURIComponent(ceo.agentId)}`)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  进入 CEO 深聊
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => navigate("/")}>
                返回 CEO 首页
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b bg-slate-50/70">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-indigo-600" />
                  执行区
                </CardTitle>
                <CardDescription>
                  这里固定显示当前主线的负责人、任务顺序和推进状态，不再让旧会话抢主线。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{ownerLabel}</div>
                      <div className="mt-1 text-xs text-slate-500">{stageLabel}</div>
                    </div>
                    <Badge variant="outline" className={statusClassName}>
                      {productStatus.label}
                    </Badge>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-700">{nextAction}</div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500"
                      style={{ width: `${Math.max(boardTaskSurface.globalPct, taskSequence.length > 0 ? 24 : 8)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    已完成 {boardTaskSurface.doneSteps} / {boardTaskSurface.totalSteps} 步
                  </div>
                </div>

                <div className="space-y-3">
                  {taskSequence.length > 0 ? (
                    taskSequence.map((item) => (
                      <div key={item.task.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-950">{item.task.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {item.ownerLabel} · {getExecutionStateLabel(item.execution.state)}
                            </div>
                          </div>
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                            {item.stepSummary.doneCount}/{item.stepSummary.total} 步
                          </Badge>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {item.task.steps.slice(0, 4).map((step, index) => (
                            <div
                              key={`${item.task.id}:${index}:${step.text}`}
                              className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2"
                            >
                              <span
                                className={`mt-1 h-2.5 w-2.5 rounded-full ${
                                  step.status === "done"
                                    ? "bg-emerald-500"
                                    : step.status === "wip"
                                      ? "bg-sky-500"
                                      : "bg-slate-300"
                                }`}
                              />
                              <div className="min-w-0">
                                <div className="text-sm text-slate-900">{step.text}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {step.assignee ?? "待分配"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                      当前主线还没有清晰的任务顺序，先去 CEO 深聊或需求房继续收敛。
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="border-b bg-slate-50/70">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    主线时间线
                  </CardTitle>
                  <CardDescription>
                    把 workflow event、chat evidence 和验收动作收成一条时间线，方便从头验收。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">进入需求中心</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{metricSummary.requirementCenterOpened}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">进入协作 / 交付</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {metricSummary.collaborationOpened + metricSummary.workspaceOpened}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">进入 Ops</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{metricSummary.opsOpened}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">验收动作</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {metricSummary.acceptanceRequested + metricSummary.acceptanceAccepted + metricSummary.requirementReopened}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {requirementTimeline.length > 0 ? (
                      requirementTimeline.map((event) => {
                        const actorId =
                          typeof event.actorId === "string" && event.actorId.trim().length > 0
                            ? event.actorId.trim()
                            : null;
                        const actorLabel =
                          actorId
                            ? activeCompany.employees.find((employee) => employee.agentId === actorId)?.nickname ??
                              actorId
                            : event.source === "company-event"
                              ? "公司事件"
                              : "系统";
                        return (
                          <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                                {getRequirementTimelineLabel(event.eventType)}
                              </span>
                              <span>{actorLabel}</span>
                              <span>·</span>
                              <span>{formatTime(event.timestamp)}</span>
                              <span>·</span>
                              <span>{event.source}</span>
                            </div>
                            <div className="mt-2 text-sm leading-6 text-slate-800">
                              {getRequirementTimelineSummary(event.payload)}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                        当前主线还没有足够多的事件证据。你从头创建公司并推进后，这里会逐步形成完整时间线。
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="border-b bg-slate-50/70">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4 text-violet-600" />
                    协作区
                  </CardTitle>
                  <CardDescription>
                    需求房是协作投影视图，底层可能拆成多个成员会话执行。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="text-sm font-semibold text-slate-950">
                      {room?.title ?? requirementSurface.currentRequirementRoomTitle ?? "当前需求房"}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">{roomPreviewText}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                        {roomDispatches.length} 条派单
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                        {(room?.memberIds ?? aggregate.memberIds).length} 位成员
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                        最近同步 {formatTime(room?.updatedAt ?? aggregate.updatedAt)}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {transcriptPreview.length > 0 ? (
                      transcriptPreview.map((message) => {
                        const audienceLabels = (message.audienceAgentIds ?? [])
                          .map(
                            (agentId) =>
                              activeCompany.employees.find((employee) => employee.agentId === agentId)?.nickname ??
                              agentId,
                          )
                          .filter(Boolean);
                        return (
                          <div key={message.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span>{message.senderLabel ?? (message.role === "user" ? "用户" : "团队成员")}</span>
                              <span>·</span>
                              <span>{formatTime(message.timestamp)}</span>
                              {message.source ? (
                                <>
                                  <span>·</span>
                                  <span>{message.source}</span>
                                </>
                              ) : null}
                            </div>
                            <div className="mt-2 text-sm leading-6 text-slate-800">
                              {message.text?.trim() || "该消息包含结构化内容。"}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                              {audienceLabels.length > 0 ? (
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                                  派给 {audienceLabels.join("、")}
                                </span>
                              ) : null}
                              {message.senderAgentId ? (
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                                  来自 {activeCompany.employees.find((employee) => employee.agentId === message.senderAgentId)?.nickname ?? message.senderAgentId}
                                </span>
                              ) : null}
                              {roomDispatches.find((dispatch) => dispatch.sourceMessageId === message.id || dispatch.responseMessageId === message.id) ? (
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                                  对应派单 {roomDispatches.find((dispatch) => dispatch.sourceMessageId === message.id || dispatch.responseMessageId === message.id)?.title}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                        当前还没有可展示的协作回流。进入需求房后，派单和成员回复会回流到这里。
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="border-b bg-slate-50/70">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Files className="h-4 w-4 text-emerald-600" />
                    交付区
                  </CardTitle>
                  <CardDescription>
                    展示当前主线最近的文件、报告和镜像产物，完整内容仍在 Workspace。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                  {deliverableFiles.length > 0 ? (
                    deliverableFiles.map((file) => (
                      <div key={file.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-950">{file.name}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {file.agentLabel} · {file.workspace}
                            </div>
                          </div>
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                            {file.kind}
                          </Badge>
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-600">
                          {file.previewText ?? file.path}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                          <span>更新时间 {formatTime(file.updatedAtMs ?? null)}</span>
                          {typeof file.size === "number" ? <span>· {formatWorkspaceBytes(file.size)}</span> : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                      当前主线还没有稳定的交付物镜像，先让团队继续产出，再回这里验收。
                    </div>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      trackRequirementMetric({
                        companyId: activeCompany.id,
                        requirementId: aggregate?.id ?? null,
                        name: "requirement_workspace_opened",
                        metadata: { source: "deliverables-card" },
                      });
                      navigate("/workspace");
                    }}
                  >
                    打开完整交付区
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b bg-slate-50/70">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-amber-600" />
                验收区
              </CardTitle>
              <CardDescription>
                执行完成不等于闭环完成。这里明确区分待你验收、验收通过和驳回重开。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.1fr,auto] lg:items-center">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={statusClassName}>
                    {productStatus.label}
                  </Badge>
                  {aggregate.acceptanceNote?.trim() ? (
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      {aggregate.acceptanceNote}
                    </Badge>
                  ) : null}
                </div>
                <div className="text-sm leading-6 text-slate-700">{productStatus.description}</div>
                <div className="text-xs leading-6 text-slate-500">
                  如果当前已经进入待你验收，你应该在这里决定是正式通过、继续修改，还是驳回重开，而不是继续在群聊里口头判断。
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => runAcceptanceAction("request")}
                  disabled={!canRequestAcceptance || acceptanceSubmitting !== null}
                >
                  {acceptanceSubmitting === "request" ? "处理中..." : "发起验收"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runAcceptanceAction("change")}
                  disabled={!canRequestChange || acceptanceSubmitting !== null}
                >
                  {acceptanceSubmitting === "change" ? "处理中..." : "需求变更"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runAcceptanceAction("accept")}
                  disabled={!canAccept || acceptanceSubmitting !== null}
                >
                  {acceptanceSubmitting === "accept" ? "处理中..." : "验收通过"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runAcceptanceAction("revise")}
                  disabled={!canContinueModify || acceptanceSubmitting !== null}
                >
                  {acceptanceSubmitting === "revise" ? "处理中..." : "继续修改"}
                </Button>
                <Button
                  variant="ghost"
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  onClick={() => runAcceptanceAction("reopen")}
                  disabled={!canRejectReopen || acceptanceSubmitting !== null}
                >
                  {acceptanceSubmitting === "reopen" ? "处理中..." : "驳回重开"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b bg-slate-50/70">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                排障入口
              </CardTitle>
              <CardDescription>
                这里不承担排障细节，只保留最短跳转和同步入口，避免把需求中心再次做成第二个 Ops。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-sm leading-6 text-slate-600">
                当前有 {boardTaskSurface.visibleTakeoverCount} 条接管提醒，{boardTaskSurface.visibleSlaAlerts.length} 条超时提醒，
                {boardTaskSurface.visiblePendingHandoffs.length} 条待完成交接。
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void handleRecoverCommunication()}
                  disabled={recoveringCommunication}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {recoveringCommunication ? "同步中..." : "恢复当前阻塞"}
                </Button>
                <Button variant="outline" onClick={() => navigate("/ops")}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  打开 Ops
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
