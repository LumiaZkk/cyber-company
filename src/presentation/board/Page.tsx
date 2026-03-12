import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBoardPageViewModel } from "../../application/mission/board-view-model";
import { buildRequirementRoomHrefFromRecord } from "../../application/delegation/room-routing";
import {
  buildBoardRequirementSurface,
  describeRequirementRoomPreview,
} from "../../application/mission/board-requirement-surface";
import { buildPrimaryRequirementSurface } from "../../application/mission/primary-requirement-surface";
import {
  resolveBoardPreRequirementDraft,
  shouldShowBoardPreRequirementDraft,
} from "../../application/mission/board-pre-requirement";
import { buildBoardTaskSurface } from "../../application/mission/board-task-surface";
import { gateway, useGatewayStore } from "../../application/gateway";
import { trackChatRequirementMetric } from "../../application/telemetry/chat-requirement-metrics";
import { toast } from "../../components/system/toast-store";
import { resolveConversationPresentation } from "../../lib/chat-routes";
import {
  resolveSessionActorId,
  resolveSessionUpdatedAt,
} from "../../lib/sessions";
import { usePageVisibility } from "../../lib/use-page-visibility";
import {
  BoardAlertStrip,
  BoardDialogs,
  BoardHeroSection,
  BoardRequirementCard,
  BoardRoomPanel,
  BoardSessionMonitor,
  BoardTaskBoardSection,
} from "./components/BoardSections";
import { useBoardCommunicationSync } from "./hooks/useBoardCommunicationSync";
import { useBoardRuntimeState } from "./hooks/useBoardRuntimeState";
import { useBoardTaskBackfill } from "./hooks/useBoardTaskBackfill";

type BoardPageContentProps = Omit<
  ReturnType<typeof useBoardPageViewModel>,
  "activeCompany"
> & {
  activeCompany: NonNullable<ReturnType<typeof useBoardPageViewModel>["activeCompany"]>;
};

function BoardPageContent({
  activeCompany,
  activeConversationStates,
  activeDispatches,
  activeRequirementEvidence,
  activeDecisionTickets,
  activeRequirementAggregates,
  activeRoomRecords,
  activeWorkItems,
  activeArtifacts,
  primaryRequirementId,
  replaceDispatchRecords,
  upsertTask,
  updateCompany,
  ensureRequirementRoomForAggregate,
}: BoardPageContentProps) {
  const navigate = useNavigate();
  const connected = useGatewayStore((state) => state.connected);
  const supportsAgentFiles = useGatewayStore((state) => state.capabilities.agentFiles);
  const isPageVisible = usePageVisibility();
  const {
    setSessions,
    setCompanySessionSnapshots,
    sessions,
    currentTime,
    sessionMeta,
    sessionStates,
    sessionTakeoverPacks,
    fileTasks,
    companySessionSnapshots,
    companySessions,
    activeSessions,
    archivedSessions,
  } = useBoardRuntimeState({
    activeCompany,
    activeArtifacts,
    connected,
    isPageVisible,
    supportsAgentFiles,
  });
  const [showSessions, setShowSessions] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const lastTrackedBoardFallbackRef = useRef<string | null>(null);
  const [dialogConfig, setDialogConfig] = useState<{
    open: boolean;
    type: "nudge" | "delete" | null;
    sessionKey: string | null;
  }>({ open: false, type: null, sessionKey: null });
  const [dialogSubmitting, setDialogSubmitting] = useState(false);
  const getEmpName = (agentId: string) => {
    const emp = activeCompany.employees.find((e) => e.agentId === agentId);
    return emp ? emp.nickname : agentId;
  };
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
      buildBoardRequirementSurface({
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
      companySessions,
      companySessionSnapshots,
      currentTime,
      ceo?.agentId,
      primaryRequirementId,
    ],
  );
  const {
    activeWorkItem,
    currentWorkItem,
    requirementOverview,
    requirementScope,
    strategicRequirementOverview,
    isStrategicRequirement,
    requirementDisplayTitle,
    requirementDisplayCurrentStep,
    requirementDisplaySummary,
    requirementDisplayOwner,
    requirementDisplayStage,
    requirementDisplayNext,
    requirementSyntheticTask,
    requirementRoomRecords,
    requirementRoomRoute,
  } = requirementSurface;
  const boardTaskSurface = useMemo(
    () =>
      buildBoardTaskSurface({
        activeCompany,
        companySessions,
        currentTime,
        fileTasks,
        sessionStates,
        sessionTakeoverPacks,
        requirementScope,
        currentWorkItem,
        activeWorkItem,
        requirementOverview,
        strategicRequirementOverview,
        isStrategicRequirement,
        requirementSyntheticTask,
      }),
    [
      activeCompany,
      activeWorkItem,
      companySessions,
      currentTime,
      currentWorkItem,
      fileTasks,
      isStrategicRequirement,
      requirementOverview,
      requirementScope,
      requirementSyntheticTask,
      sessionStates,
      sessionTakeoverPacks,
      strategicRequirementOverview,
    ],
  );
  const {
    trackedTasks,
    activeTasks,
    archivedTaskItems,
    totalSteps,
    doneSteps,
    wipSteps,
    globalPct,
    visibleTakeoverCount,
    visiblePendingHandoffs,
    visibleSlaAlerts,
    visibleRequestHealth,
    orderedTaskSections,
  } = boardTaskSurface;
  const stageStripSteps =
    currentWorkItem?.steps.length
      ? currentWorkItem.steps.map((step, index) => ({
          id: step.id,
          index,
          title: step.title,
          owner: step.assigneeLabel,
          status: step.status,
        }))
      : requirementSyntheticTask?.steps.length
        ? requirementSyntheticTask.steps.map((step, index) => ({
            id: `${requirementSyntheticTask.id}:${index}`,
            index,
            title: step.text,
            owner: step.assignee ?? "待分配",
            status: step.status === "wip" ? "active" : step.status === "done" ? "done" : "pending",
          }))
        : [];

  useBoardTaskBackfill({
    tasks: trackedTasks,
    upsertTask,
  });

  const { recoveringCommunication, handleRecoverCommunication } = useBoardCommunicationSync({
    activeCompany,
    companySessionSnapshots,
    setCompanySessionSnapshots,
    activeArtifacts,
    activeDispatches,
    replaceDispatchRecords,
    updateCompany,
    connected,
    isPageVisible,
  });

  const handleNudge = (sessionKey: string) =>
    setDialogConfig({ open: true, type: "nudge", sessionKey });
  const handleDelete = (sessionKey: string) =>
    setDialogConfig({ open: true, type: "delete", sessionKey });

  const onDialogSubmit = async (values: Record<string, string>) => {
    const { type, sessionKey } = dialogConfig;
    if (!type || !sessionKey) {
      return;
    }
    setDialogSubmitting(true);
    try {
      if (type === "nudge") {
        const msg = values.nudgeText || "请报告当前进度并加快处理";
        await gateway.sendChatMessage(sessionKey, msg);
        toast.success("指令已下发", "已将催促指令强制插入任务流");
      } else if (type === "delete") {
        await gateway.deleteSession(sessionKey);
        toast.success("销毁成功", "任务进程及日志已从底层剥离");
        setSessions((s) => s.filter((x) => x.key !== sessionKey));
      }
      setDialogConfig({ open: false, type: null, sessionKey: null });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      toast.error("操作失败", errMsg);
    } finally {
      setDialogSubmitting(false);
    }
  };

  const currentOwnerAgentId =
    currentWorkItem?.ownerActorId ?? requirementOverview?.currentOwnerAgentId ?? null;
  const preRequirementDraft = useMemo(
    () =>
      resolveBoardPreRequirementDraft({
        activeConversationStates,
        ceoAgentId: ceo?.agentId ?? null,
      }),
    [activeConversationStates, ceo?.agentId],
  );
  const showPreRequirementDraft = shouldShowBoardPreRequirementDraft({
    trackedTaskCount: trackedTasks.length,
    hasRequirementOverview: Boolean(requirementOverview),
    hasCurrentWorkItem: Boolean(currentWorkItem),
    preRequirementDraft,
  });
  const showPreRequirementMainline =
    Boolean(currentWorkItem) && currentWorkItem?.lifecyclePhase === "pre_requirement";
  const isBoardFallbackView =
    !requirementOverview &&
    !currentWorkItem &&
    fileTasks.length > 0 &&
    trackedTasks.length > 0;

  useEffect(() => {
    if (!activeCompany?.id || !isBoardFallbackView) {
      lastTrackedBoardFallbackRef.current = null;
      return;
    }
    const metricKey = `${activeCompany.id}:${fileTasks.length}:${trackedTasks.length}`;
    if (lastTrackedBoardFallbackRef.current === metricKey) {
      return;
    }
    lastTrackedBoardFallbackRef.current = metricKey;
    trackChatRequirementMetric({
      companyId: activeCompany.id,
      conversationId: null,
      requirementId: null,
      name: "board_fallback_rendered_from_task_board",
      metadata: {
        fileTaskCount: fileTasks.length,
        trackedTaskCount: trackedTasks.length,
      },
    });
  }, [activeCompany?.id, fileTasks.length, isBoardFallbackView, trackedTasks.length]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 lg:p-8 h-full flex flex-col">
      <BoardHeroSection
        description={
          requirementOverview
            ? isStrategicRequirement
              ? `当前默认只看「${requirementDisplayTitle}」这条战略主线，章节接管、超时和历史请求已自动隐藏。`
              : `当前默认只看「${requirementDisplayTitle}」这条主线，历史交接和旧请求已自动隐藏。`
            : showPreRequirementMainline
              ? `当前主线「${requirementDisplayTitle}」已经固化为需求房入口，先补充、澄清或确认后再启动真实执行。`
            : showPreRequirementDraft
              ? "CEO 已经形成当前目标草案，但系统还没有正式 requirement/work item。先回 CEO 会话确认草案或继续推进，这里会在主线落地后自动切换。"
            : isBoardFallbackView
              ? "当前展示 CEO 任务板视图。系统还没有正式 requirement，但已根据 TASK-BOARD.md 还原当前步骤和执行顺序。"
              : "这里只看任务顺序、当前步骤和子任务进度。成员状态和异常监控请去运营大厅。"
        }
        trackedTasks={trackedTasks.length}
        wipSteps={wipSteps}
        doneSteps={doneSteps}
        totalSteps={totalSteps}
        globalPct={globalPct}
        canOpenCeo={Boolean(ceo)}
        canOpenRequirementCenter={Boolean(primaryRequirementSurface.aggregateId || requirementOverview || currentWorkItem)}
        onOpenRequirementCenter={() => navigate("/requirement")}
        onOpenOps={() => navigate("/ops")}
        onOpenCeo={() => ceo && navigate(`/chat/${ceo.agentId}`)}
      />

      <BoardRequirementCard
        visible={Boolean(primaryRequirementSurface.aggregateId || requirementOverview || currentWorkItem)}
        title={primaryRequirementSurface.title || requirementDisplayTitle}
        currentStep={primaryRequirementSurface.currentStep || requirementDisplayCurrentStep}
        summary={primaryRequirementSurface.summary || requirementDisplaySummary}
        owner={primaryRequirementSurface.ownerLabel || requirementDisplayOwner}
        stage={requirementDisplayStage}
        nextStep={primaryRequirementSurface.nextBatonLabel || requirementDisplayNext}
        onOpenOwner={
          currentOwnerAgentId
            ? () => navigate(`/chat/${encodeURIComponent(currentOwnerAgentId)}`)
            : undefined
        }
        onOpenCeo={ceo ? () => navigate(`/chat/${ceo.agentId}`) : undefined}
        onOpenRequirementCenter={() => navigate("/requirement")}
      />

      <BoardRoomPanel
        visible={Boolean(primaryRequirementSurface.aggregateId || currentWorkItem || requirementRoomRecords.length > 0 || requirementRoomRoute)}
        rooms={requirementRoomRecords}
        roomPreview={(room) =>
          describeRequirementRoomPreview(
            room,
            currentWorkItem &&
              (room.workItemId === currentWorkItem.id || room.workItemId === currentWorkItem.workKey)
              ? currentWorkItem
              : null,
          )
        }
        onOpenRoom={(roomId) => {
          const room = requirementRoomRecords.find((item) => item.id === roomId);
          if (room) {
            navigate(buildRequirementRoomHrefFromRecord(room));
          }
        }}
        route={primaryRequirementSurface.aggregateId ? `ensure:${primaryRequirementSurface.aggregateId}` : requirementRoomRoute}
        onCreateRoom={() => {
          if (primaryRequirementSurface.aggregateId) {
            const ensuredRoom = ensureRequirementRoomForAggregate(primaryRequirementSurface.aggregateId);
            if (ensuredRoom) {
              navigate(buildRequirementRoomHrefFromRecord(ensuredRoom));
              return;
            }
          }
          if (requirementRoomRoute) {
            navigate(requirementRoomRoute);
          }
        }}
      />

      {stageStripSteps.length > 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">主线阶段</div>
              <div className="mt-1 text-sm text-slate-500">
                只保留这一条主线的阶段顺序，不再重复渲染独立的大型任务顺序面板。
              </div>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              当前负责人 {primaryRequirementSurface.ownerLabel}
            </div>
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-4">
            {stageStripSteps.map((step) => (
              <div key={step.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {String(step.index + 1).padStart(2, "0")}
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-950">{step.title}</div>
                <div className="mt-2 text-xs text-slate-500">{step.owner}</div>
                <div className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                  {step.status === "done" ? "已完成" : step.status === "active" ? "进行中" : "待开始"}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <BoardAlertStrip
        visible={visibleTakeoverCount > 0}
        tone="amber"
        title="人工接管警报"
        description={`当前检测到 ${visibleTakeoverCount} 条会话需要人工接管，已生成接管包。`}
        actionLabel="查看接管包"
        onAction={() => {
          const firstSessionKey = sessionTakeoverPacks.keys().next().value;
          if (typeof firstSessionKey === "string") {
            const session = sessions.find((item) => item.key === firstSessionKey) ?? null;
            navigate(
              resolveConversationPresentation({
                sessionKey: firstSessionKey,
                actorId: session ? resolveSessionActorId(session) : null,
                rooms: activeRoomRecords,
                employees: activeCompany.employees,
              }).route,
            );
          }
        }}
      />

      <BoardAlertStrip
        visible={visibleRequestHealth.active > 0}
        tone="sky"
        title={requirementOverview ? "当前需求请求闭环" : "请求闭环队列"}
        description={
          requirementOverview
            ? `当前主线还有 ${visibleRequestHealth.active} 条请求未闭环，其中阻塞 ${visibleRequestHealth.blocked} 条；历史请求已隐藏。`
            : `当前有 ${visibleRequestHealth.active} 条请求尚未闭环，其中阻塞 ${visibleRequestHealth.blocked} 条。`
        }
        actionLabel={recoveringCommunication ? "同步中..." : "恢复当前阻塞"}
        actionDisabled={recoveringCommunication}
        onAction={() => void handleRecoverCommunication()}
      />

      <BoardAlertStrip
        visible={visiblePendingHandoffs.length > 0}
        tone="violet"
        title={requirementOverview ? "当前需求交接队列" : "交接队列"}
        description={
          requirementOverview
            ? `当前主线有 ${visiblePendingHandoffs.length} 条待完成交接；过期交接已自动隐藏。`
            : `当前有 ${visiblePendingHandoffs.length} 条待完成交接，缺失项会阻塞后续执行。`
        }
      >
        {requirementOverview ? (
          <div className="rounded-lg border border-violet-200 bg-white/80 px-3 py-3 text-xs leading-6 text-slate-700">
            交接明细默认已收起，避免旧广播和重复交接卡片继续干扰。主线推进请优先看上面的“本次需求总览”和任务顺序。
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {visiblePendingHandoffs.slice(0, 4).map((handoff) => (
              <div
                key={handoff.id}
                className="rounded-lg border border-violet-200 bg-white/80 px-3 py-2 text-xs text-slate-700"
              >
                <div className="font-medium text-slate-900">{handoff.title}</div>
                <div className="mt-1">{handoff.summary}</div>
                <div className="mt-1 text-[11px] text-violet-700">to: {handoff.toAgentIds.join(", ")}</div>
                {handoff.missingItems && handoff.missingItems.length > 0 ? (
                  <div className="mt-1 text-[11px] text-amber-700">缺失项 {handoff.missingItems.length}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </BoardAlertStrip>

      <BoardAlertStrip
        visible={visibleSlaAlerts.length > 0}
        tone="rose"
        title={requirementOverview ? "当前需求超时提醒" : "SLA 升级队列"}
        description={
          requirementOverview
            ? `当前主线有 ${visibleSlaAlerts.length} 条超时或阻塞提醒；历史超时项已隐藏。`
            : `当前有 ${visibleSlaAlerts.length} 条任务或交接超过 SLA，建议优先处理这里。`
        }
      >
        {requirementOverview ? (
          <div className="rounded-lg border border-rose-200 bg-white/80 px-3 py-3 text-xs leading-6 text-slate-700">
            具体超时条目默认已收起，避免历史噪音抢走注意力。先看“当前负责人 / 下一步”，确实需要排障时再去 CEO 会话或恢复当前阻塞。
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
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
      </BoardAlertStrip>

      <BoardTaskBoardSection
        trackedTasks={trackedTasks.length}
        orderedTaskSections={orderedTaskSections}
        activeTasks={activeTasks.length}
        archivedTaskItems={archivedTaskItems}
        showArchived={showArchived}
        setShowArchived={setShowArchived}
        activeRoomRecords={activeRoomRecords}
        activeCompanyEmployees={activeCompany.employees}
        preRequirementDraft={showPreRequirementDraft ? preRequirementDraft : null}
        onOpenCeo={ceo ? () => navigate(`/chat/${ceo.agentId}`) : undefined}
        onOpenRoute={(route) => navigate(route)}
      />

      <BoardSessionMonitor
        showSessions={showSessions}
        setShowSessions={setShowSessions}
        activeSessions={activeSessions}
        archivedSessions={archivedSessions}
        sessionMeta={sessionMeta}
        sessionStates={sessionStates}
        sessionTakeoverPacks={sessionTakeoverPacks}
        getEmpName={getEmpName}
        resolveUpdatedAt={resolveSessionUpdatedAt}
        onOpenSession={(sessionKey, actorId) =>
          navigate(
            resolveConversationPresentation({
              sessionKey,
              actorId,
              rooms: activeRoomRecords,
              employees: activeCompany.employees,
            }).route,
          )
        }
        onNudge={handleNudge}
        onDelete={handleDelete}
      />

      <BoardDialogs
        dialogConfig={dialogConfig}
        dialogSubmitting={dialogSubmitting}
        setDialogOpen={(open) => setDialogConfig((prev) => ({ ...prev, open }))}
        onSubmit={onDialogSubmit}
      />
    </div>
  );
}

export function BoardPageScreen() {
  const viewModel = useBoardPageViewModel();
  const { activeCompany, ...rest } = viewModel;

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  return <BoardPageContent activeCompany={activeCompany} {...rest} />;
}
