import { useNavigate } from "react-router-dom";
import { useLobbyPageCommands, useLobbyPageViewModel } from "../../application/lobby";
import { buildActivityInboxSummary } from "../../application/governance/activity-inbox";
import { appendOperatorActionAuditEvent } from "../../application/governance/operator-action-audit";
import { useCanonicalRuntimeSummary } from "../../application/runtime-summary";
import { Badge } from "../../components/ui/badge";
import { resolveConversationPresentation } from "../../lib/chat-routes";
import { usePageVisibility } from "../../lib/use-page-visibility";
import {
  LobbyActionStrip,
  LobbyAlertStrip,
  LobbyDialogs,
  LobbyHeroSection,
  LobbyKnowledgeSection,
  LobbyMetricCards,
  OpsSectionCard,
  LobbyRequirementCard,
} from "./components/LobbySections";
import { LobbyTeamActivitySection } from "./components/LobbyTeamActivitySection";
import { useLobbyPageState } from "./hooks/useLobbyPageState";
import { CanonicalRuntimeSummaryCard } from "../shared/CanonicalRuntimeSummaryCard";
import { ActivityInboxStrip } from "../shared/ActivityInboxStrip";

type CompanyLobbyPageContentProps = Omit<
  ReturnType<typeof useLobbyPageViewModel>,
  "activeCompany"
> & {
  activeCompany: NonNullable<ReturnType<typeof useLobbyPageViewModel>["activeCompany"]>;
};

export function CompanyLobbyPageScreen() {
  const isPageVisible = usePageVisibility();
  const viewModel = useLobbyPageViewModel({ isPageVisible });
  const { activeCompany, ...rest } = viewModel;

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  return <CompanyLobbyPageContent activeCompany={activeCompany} {...rest} />;
}

function CompanyLobbyPageContent({
  activeCompany,
  activeArtifacts,
  activeDispatches,
  activeRoomRecords,
  cronCache,
  companySessionSnapshots,
  setCompanySessionSnapshots,
  connected,
  pageSurface,
  replaceDispatchRecords,
  usageCost,
  updateCompany,
  sessionExecutions,
}: CompanyLobbyPageContentProps) {
  const navigate = useNavigate();
  const isPageVisible = usePageVisibility();
  const { summary: runtimeSummary } = useCanonicalRuntimeSummary();
  const {
    buildBlueprintText,
    syncKnowledge,
    hireEmployee,
    updateRole,
    fireEmployee,
    resolveApproval,
    assignQuickTask,
    buildGroupChatRoute,
    hireSubmitting,
    updateRoleSubmitting,
    quickTaskSubmitting,
    groupChatSubmitting,
    approvalSubmittingId,
    recoveringCommunication,
    recoverCommunication,
  } = useLobbyPageCommands({
    activeCompany,
    activeArtifacts,
    activeDispatches,
    activeRoomRecords,
    companySessionSnapshots,
    cronCache,
    connected,
    isPageVisible,
    knowledgeItems: pageSurface?.operationsSurface.knowledgeItems ?? [],
    currentRequirementTopicKey: pageSurface?.requirementSurface.requirementOverview?.topicKey ?? null,
    currentRequirementWorkItemId: pageSurface?.requirementSurface.currentRequirementWorkItemId ?? null,
    replaceDispatchRecords,
    setCompanySessionSnapshots,
    updateCompany,
  });
  const {
    ceoEmployee,
    ceoSurface,
    operationsSurface,
    primaryWorkItem,
    requirementSurface,
    scopedSessions,
    showOperationalQueues,
  } = pageSurface!;
  const {
    currentRequirementOwnerAgentId,
    requirementOverview,
    isStrategicRequirement,
    requirementDisplayTitle,
    requirementDisplayCurrentStep,
    requirementDisplaySummary,
    requirementDisplayOwner,
    requirementDisplayStage,
    requirementDisplayNext,
    primaryOwnerEmployee,
    completedWorkSteps,
    totalWorkSteps,
  } = requirementSurface;
  const {
    employeesData,
    scopedEmployeesData,
    displayEmployeesData,
    activeSessions,
    completedSessions,
    unifiedStream,
    knowledgeItems,
    retrospective,
    blockedCount,
    visibleManualCount,
    visiblePendingHandoffs,
    visibleRequestHealth,
    visibleSlaAlerts,
    teamHealthLabel,
    teamHealthClass,
  } = operationsSurface;
  const {
    fireEmployeeDialogOpen,
    groupChatDialogOpen,
    handleCopyBlueprint,
    handleFireEmployee,
    handleApprovalDecision,
    handleGroupChatSubmit,
    handleHireSubmit,
    handleQuickTaskSubmit,
    handleRecoverCommunication,
    handleSyncKnowledge,
    handleUpdateRoleSubmit,
    hireDialogOpen,
    onFireEmployeeSubmit,
    approvalBusyId,
    openCeoChat,
    quickTaskInput,
    quickTaskTarget,
    setFireEmployeeDialogOpen,
    setGroupChatDialogOpen,
    setHireDialogOpen,
    setQuickTaskInput,
    setQuickTaskTarget,
    setUpdateRoleDialogOpen,
    setUpdateRoleInitial,
    setUpdateRoleTarget,
    updateRoleDialogOpen,
    updateRoleInitial,
  } = useLobbyPageState({
    activeCompanyId: activeCompany.id,
    commands: {
      buildBlueprintText,
      syncKnowledge,
      hireEmployee,
      updateRole,
      fireEmployee,
      resolveApproval,
      assignQuickTask,
      buildGroupChatRoute,
      recoverCommunication,
    },
    ceoAgentId: ceoEmployee?.agentId ?? null,
  });
  const pendingApprovals = (activeCompany.approvals ?? []).filter((approval) => approval.status === "pending");

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
    if (status === "no_signal") {
      return (
        <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-500 mr-1.5" />
          无信号
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
  const activityInboxSummary = buildActivityInboxSummary({
    scopeLabel: primaryWorkItem ? "当前主线" : "当前公司",
    blockerCount: blockedCount,
    requestCount: visibleRequestHealth.active,
    handoffCount: visiblePendingHandoffs,
    escalationCount: visibleSlaAlerts.length + ceoSurface.openEscalations,
    pendingHumanDecisionCount: ceoSurface.pendingHumanDecisions + ceoSurface.pendingApprovals,
    manualTakeoverCount: visibleManualCount,
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
      <LobbyHeroSection
        title="运营大厅"
        description={
          requirementOverview
            ? isStrategicRequirement
              ? `当前默认只看「${requirementDisplayTitle}」这条战略主线，执行期超时、接管和历史请求已自动隐藏。`
              : `当前默认只看「${requirementDisplayTitle}」这条主线，历史交接、旧请求和过期活动已隐藏。`
            : "这里只看异常、成员状态和最近活动。完整任务顺序和子任务进度请去工作看板。"
        }
        canContactCeo={Boolean(ceoEmployee)}
        canOpenRequirementCenter={Boolean(requirementOverview || primaryWorkItem)}
        onOpenRequirementCenter={() => navigate("/requirement")}
        onOpenBoard={() => navigate("/board")}
        onOpenRuntimeInspector={() => navigate("/runtime")}
        onContactCeo={() => ceoEmployee && navigate(`/chat/${ceoEmployee.agentId}`)}
      />

      <LobbyRequirementCard
        visible={Boolean(requirementOverview)}
        title={requirementDisplayTitle}
        currentStep={requirementDisplayCurrentStep}
        summary={requirementDisplaySummary}
        owner={requirementDisplayOwner}
        stage={requirementDisplayStage}
        nextStep={requirementDisplayNext}
        onOpenOwner={
          primaryWorkItem?.ownerActorId ?? currentRequirementOwnerAgentId
            ? () =>
                navigate(
                  `/chat/${encodeURIComponent(
                    primaryWorkItem?.ownerActorId ?? currentRequirementOwnerAgentId!,
                  )}`,
                )
            : null
        }
        onOpenBoard={() => navigate("/board")}
        onOpenRequirementCenter={() => navigate("/requirement")}
      />

      <LobbyMetricCards
        hasRequirement={Boolean(requirementOverview)}
        scopedEmployeeCount={scopedEmployeesData.length}
        employeeCount={employeesData.length}
        teamHealthLabel={teamHealthLabel}
        teamHealthClass={teamHealthClass}
        activeSessions={activeSessions.length}
        completedSessions={completedSessions.length}
        usageCost={usageCost}
      />

      {pendingApprovals.length > 0 ? (
        <OpsSectionCard
          title="待处理审批"
          description="危险动作在继续执行前，先在这里经过一次明确确认。"
          meta={`待处理 ${pendingApprovals.length} 项`}
        >
          <div className="space-y-3">
            {pendingApprovals.map((approval) => {
              const busy = approvalBusyId === approval.id || approvalSubmittingId === approval.id;
              return (
                <div
                  key={approval.id}
                  className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-slate-700"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">
                          {approval.scope === "org" ? "组织审批" : "治理审批"}
                        </Badge>
                        {approval.targetLabel ? (
                          <span className="text-xs text-slate-500">目标：{approval.targetLabel}</span>
                        ) : null}
                      </div>
                      <div className="text-base font-semibold text-slate-900">{approval.summary}</div>
                      {approval.detail ? <div className="text-sm text-slate-600">{approval.detail}</div> : null}
                    </div>

                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy}
                        onClick={() => {
                          void handleApprovalDecision(approval, "rejected");
                        }}
                      >
                        拒绝
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                        disabled={busy}
                        onClick={() => {
                          void handleApprovalDecision(approval, "approved");
                        }}
                      >
                        {busy ? "处理中..." : "批准并继续"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </OpsSectionCard>
      ) : null}

      <CanonicalRuntimeSummaryCard
        summary={runtimeSummary}
        title="统一运行态摘要"
        description="监控、排障和关注队列统一从 `/runtime` 复用，运营大厅只保留执行摘要和动作入口。"
        compact
      />

      <ActivityInboxStrip summary={activityInboxSummary} title="统一活动摘要" />

      <LobbyActionStrip
        title={primaryWorkItem ? "本次需求的卡点与下一步" : "先处理这些异常与下一步"}
        description={
          primaryWorkItem
            ? "这里默认只保留本次需求的负责人、阶段和下一步；旧请求、交接和 SLA 已降到次级视图。"
            : "这里是运营摘要和动作入口。完整运行态、阻塞链和值班判断统一在 `/runtime`。"
        }
        blockedCount={blockedCount}
        visiblePendingHandoffs={visiblePendingHandoffs}
        visibleRequestActive={visibleRequestHealth.active}
        visibleSlaAlerts={visibleSlaAlerts.length}
        visibleManualCount={visibleManualCount}
        recoveringCommunication={recoveringCommunication}
        hasPrimaryWorkItem={Boolean(primaryWorkItem)}
        completedWorkSteps={completedWorkSteps}
        totalWorkSteps={totalWorkSteps}
        ceoAvailable={Boolean(ceoEmployee)}
        topActions={ceoSurface.topActions}
        onRecoverCommunication={() => void handleRecoverCommunication()}
        onOpenCurrentOwner={
          primaryOwnerEmployee
            ? () => navigate(`/chat/${encodeURIComponent(primaryOwnerEmployee.agentId)}`)
            : undefined
        }
        onOpenCeo={ceoEmployee ? () => navigate(`/chat/${ceoEmployee.agentId}`) : undefined}
        onOpenBoard={() => navigate("/board")}
        onNavigateHref={(href) => navigate(href)}
      />

      <LobbyAlertStrip
        visible={visibleManualCount > 0}
        tone="amber"
        title="人工接管警报"
        description={`当前有 ${visibleManualCount} 条执行链路要求人工介入，建议直接进入对应会话复制接管包。`}
        actionLabel="查看接管包"
        onAction={() => {
          const manualSession = scopedSessions.find(
            (session) => sessionExecutions.get(session.key)?.state === "manual_takeover_required",
          );
          if (manualSession) {
            const route = resolveConversationPresentation({
              sessionKey: manualSession.key,
              actorId: manualSession.agentId,
              rooms: activeRoomRecords,
              employees: activeCompany.employees,
            }).route;
            void appendOperatorActionAuditEvent({
              companyId: activeCompany.id,
              action: "takeover_route_open",
              surface: "lobby",
              outcome: "succeeded",
              details: {
                sessionKey: manualSession.key,
                targetActorId: manualSession.agentId,
                route,
                visibleTakeoverCount: visibleManualCount,
              },
            });
            navigate(route);
            return;
          }
          void appendOperatorActionAuditEvent({
            companyId: activeCompany.id,
            action: "takeover_route_open",
            surface: "lobby",
            outcome: "failed",
            error: "没有找到可打开的人工接管会话。",
            details: {
              visibleTakeoverCount: visibleManualCount,
            },
          });
        }}
      />

      <LobbyAlertStrip
        visible={showOperationalQueues && visibleRequestHealth.active > 0}
        tone="sky"
        title={primaryWorkItem ? "当前需求请求闭环" : "请求闭环队列"}
        description={
          primaryWorkItem
            ? `当前这条主线还有 ${visibleRequestHealth.active} 条请求未真正闭环，其中阻塞 ${visibleRequestHealth.blocked} 条；历史请求已隐藏。`
            : `当前有 ${visibleRequestHealth.active} 条请求仍未真正闭环，其中阻塞 ${visibleRequestHealth.blocked} 条。`
        }
        actionLabel={recoveringCommunication ? "同步中..." : "同步请求闭环"}
        actionDisabled={recoveringCommunication}
        onAction={() => void handleRecoverCommunication()}
      />

      <LobbyAlertStrip
        visible={showOperationalQueues && visibleSlaAlerts.length > 0}
        tone="rose"
        title={primaryWorkItem ? "当前需求超时提醒" : "SLA 升级队列"}
        description={
          primaryWorkItem
            ? `当前这条主线有 ${visibleSlaAlerts.length} 条升级提醒，历史超时项已隐藏。`
            : `当前有 ${visibleSlaAlerts.length} 条规则触发升级，CEO 不需要手动轮询即可看到这些异常。`
        }
      >
        {primaryWorkItem ? (
          <div className="rounded-lg border border-rose-200 bg-white/80 px-3 py-3 text-xs leading-6 text-slate-700">
            具体超时条目已收起，避免旧提醒再次抢占视线。默认先按上面的“当前负责人 / 下一步 / 查看工作看板”推进主线。
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
      </LobbyAlertStrip>

      <LobbyKnowledgeSection
        knowledgeItems={knowledgeItems}
        cronCount={cronCache.length}
        retrospectiveSummary={retrospective.summary}
        quickTaskTarget={quickTaskTarget}
        quickTaskInput={quickTaskInput}
        employees={employeesData}
        quickTaskSubmitting={quickTaskSubmitting}
        onChangeQuickTaskTarget={setQuickTaskTarget}
        onChangeQuickTaskInput={setQuickTaskInput}
        onSubmitQuickTask={() => void handleQuickTaskSubmit()}
        onKeyDownQuickTask={() => void handleQuickTaskSubmit()}
        onSyncKnowledge={() => void handleSyncKnowledge()}
        onCopyBlueprint={() => void handleCopyBlueprint()}
      />

      <OpsSectionCard
        title="成员状态与最近活动"
        description="只有在需要深挖谁在跑、谁阻塞、最近发生了什么时，再展开这一层。"
        meta={
          requirementOverview
            ? `当前需求成员 ${scopedEmployeesData.length} · 活动 ${unifiedStream.length}`
            : `成员 ${employeesData.length} · 活动 ${unifiedStream.length}`
        }
      >
        <LobbyTeamActivitySection
          hasRequirementOverview={Boolean(requirementOverview)}
          displayEmployeesData={displayEmployeesData}
          unifiedStream={unifiedStream}
          activeCompanyEmployees={activeCompany.employees}
          activeRoomRecords={activeRoomRecords}
          renderPresenceBadge={getPresenceBadge}
          onOpenGroupChat={() => setGroupChatDialogOpen(true)}
          onOpenCeoChat={openCeoChat}
          onOpenHire={() => setHireDialogOpen(true)}
          onUpdateRole={(employee) => {
            setUpdateRoleTarget(employee.agentId);
            setUpdateRoleInitial({ role: employee.role || "", description: "" });
            setUpdateRoleDialogOpen(true);
          }}
          onFireEmployee={handleFireEmployee}
          onOpenRoute={(route) => navigate(route)}
          onOpenBoard={() => navigate("/board")}
        />
      </OpsSectionCard>

      <LobbyDialogs
        hireDialogOpen={hireDialogOpen}
        setHireDialogOpen={setHireDialogOpen}
        onHireSubmit={handleHireSubmit}
        hireSubmitting={hireSubmitting}
        groupChatDialogOpen={groupChatDialogOpen}
        setGroupChatDialogOpen={setGroupChatDialogOpen}
        onGroupChatSubmit={handleGroupChatSubmit}
        groupChatSubmitting={groupChatSubmitting}
        employees={employeesData}
        updateRoleDialogOpen={updateRoleDialogOpen}
        setUpdateRoleDialogOpen={setUpdateRoleDialogOpen}
        updateRoleInitial={updateRoleInitial}
        onUpdateRoleSubmit={handleUpdateRoleSubmit}
        updateRoleSubmitting={updateRoleSubmitting}
        fireEmployeeDialogOpen={fireEmployeeDialogOpen}
        setFireEmployeeDialogOpen={setFireEmployeeDialogOpen}
        onFireEmployeeSubmit={onFireEmployeeSubmit}
      />
    </div>
  );
}
