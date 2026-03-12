import { buildRequirementRoomHrefFromRecord } from "../delegation/room-routing";
import { formatAgentLabel } from "../governance/focus-summary";
import { buildCompanyChatRoute } from "../../lib/chat-routes";
import {
  buildDisplayRequirementProgressGroups,
  buildHeaderStatusBadgeClass,
  buildRequirementLifecycleSections,
  buildTeamAdjustmentActionFactory,
  buildTeamGroupRoute,
} from "./action-surface-sections";
import type {
  BuildChatActionSurfaceInput,
  RequirementLifecycleSection,
  RequirementProgressGroups,
} from "./action-surface-types";
import {
  dedupeFocusActions,
  type FocusActionButton,
} from "./focus-actions";

export type {
  BuildChatActionSurfaceInput,
  RequirementLifecycleSection,
  RequirementProgressGroups,
} from "./action-surface-types";

export function buildChatActionSurface(input: BuildChatActionSurfaceInput) {
  const {
    activeCompany,
    activeRoomRecords,
    linkedRequirementRoom,
    stableDisplayWorkItem,
    stableDisplayPrimaryView,
    strategicDirectParticipantView,
    requirementOverview,
    requirementProgressGroups,
    requirementRoomSummary,
    requirementTeam,
    persistedWorkItem,
    conversationMissionRecord,
    groupWorkItemId,
    groupTopicKey,
    targetAgentId,
    isGroup,
    isCeoSession,
    isFreshConversation,
    isRequirementBootstrapPending,
    isSummaryOpen,
    summaryPanelView,
    currentTime,
    workbenchOpenAction,
    focusActions,
    summaryRecoveryAction,
    taskPlanOverview,
    canonicalNextBatonAgentId,
    canonicalNextBatonLabel,
    missionIsCompleted,
    shouldUseTaskPlanPrimaryView,
    effectiveOwnerAgentId,
    effectiveOwnerLabel,
    effectiveStage,
    effectiveStatusLabel,
    effectiveSummary,
    effectiveHeadline,
    effectiveTone,
    shouldAdvanceToNextPhase,
    shouldDispatchPublish,
    shouldDirectToTechDispatch,
    publishDispatchTargetAgentId,
    publishDispatchTargetLabel,
    requirementTechParticipant,
    focusSummaryOwnerRole,
  } = input;

  const displayOpenAction: FocusActionButton | null = (() => {
    if (isGroup) {
      return requirementRoomSummary?.openAction ?? null;
    }

    if (isCeoSession && linkedRequirementRoom && stableDisplayWorkItem?.kind === "strategic") {
      return {
        id: `open-main-room:${linkedRequirementRoom.id}`,
        label: "打开需求团队房间",
        description: "进入这条主线任务的固定团队房间，查看完整协作消息和当前进度。",
        kind: "navigate",
        tone: "secondary",
        href: buildRequirementRoomHrefFromRecord(linkedRequirementRoom),
      };
    }

    if (stableDisplayPrimaryView) {
      return stableDisplayPrimaryView.nextAgentId &&
        stableDisplayPrimaryView.nextAgentId !== targetAgentId
        ? {
            id: `open-workitem-next:${stableDisplayPrimaryView.nextAgentId}`,
            label: `打开 ${stableDisplayPrimaryView.nextLabel} 会话`,
            description: `直接进入 ${stableDisplayPrimaryView.nextLabel} 的会话继续处理当前工作项。`,
            kind: "navigate",
            tone: "secondary",
            targetAgentId: stableDisplayPrimaryView.nextAgentId,
            href: buildCompanyChatRoute(stableDisplayPrimaryView.nextAgentId, activeCompany?.id),
          }
        : null;
    }

    if (
      strategicDirectParticipantView?.nextAgentId &&
      strategicDirectParticipantView.nextAgentId !== targetAgentId
    ) {
      return {
        id: `open-strategic-owner:${strategicDirectParticipantView.nextAgentId}`,
        label: `打开 ${
          activeCompany
            ? formatAgentLabel(activeCompany, strategicDirectParticipantView.nextAgentId)
            : strategicDirectParticipantView.nextLabel
        } 会话`,
        description: `直接进入 ${strategicDirectParticipantView.nextLabel} 的会话继续收口当前战略需求。`,
        kind: "navigate",
        tone: "secondary",
        targetAgentId: strategicDirectParticipantView.nextAgentId,
        href: buildCompanyChatRoute(strategicDirectParticipantView.nextAgentId, activeCompany?.id),
      };
    }

    if (requirementOverview?.currentOwnerAgentId) {
      return requirementOverview.currentOwnerAgentId !== targetAgentId
        ? {
            id: `open-requirement:${requirementOverview.currentOwnerAgentId}`,
            label: `打开 ${requirementOverview.currentOwnerLabel} 会话`,
            description: `直接进入 ${requirementOverview.currentOwnerLabel} 的会话继续处理当前主线。`,
            kind: "navigate",
            tone: "secondary",
            targetAgentId: requirementOverview.currentOwnerAgentId,
            href: buildCompanyChatRoute(
              requirementOverview.currentOwnerAgentId,
              activeCompany?.id,
            ),
          }
        : null;
    }

    return workbenchOpenAction;
  })();

  const publishDispatchOpenAction: FocusActionButton | null =
    !(shouldDispatchPublish || shouldDirectToTechDispatch) ||
    !publishDispatchTargetAgentId ||
    publishDispatchTargetAgentId === targetAgentId
      ? null
      : {
          id: `open-dispatch:${publishDispatchTargetAgentId}`,
          label: `打开 ${publishDispatchTargetLabel} 会话`,
          description: `直接进入 ${publishDispatchTargetLabel} 的会话，确认新版发布有没有真正开始执行。`,
          kind: "navigate",
          tone: "secondary",
          targetAgentId: publishDispatchTargetAgentId,
          href: buildCompanyChatRoute(publishDispatchTargetAgentId, activeCompany?.id),
        };

  const effectiveOpenAction: FocusActionButton | null = (() => {
    if (isRequirementBootstrapPending || isFreshConversation) {
      return null;
    }
    if (publishDispatchOpenAction) {
      return publishDispatchOpenAction;
    }
    if (
      shouldUseTaskPlanPrimaryView &&
      effectiveOwnerAgentId &&
      effectiveOwnerAgentId !== targetAgentId
    ) {
      return {
        id: `open-effective:${effectiveOwnerAgentId}`,
        label: `打开 ${effectiveOwnerLabel} 会话`,
        description: `直接进入 ${effectiveOwnerLabel} 的会话继续处理当前待办。`,
        kind: "navigate",
        tone: "secondary",
        targetAgentId: effectiveOwnerAgentId,
        href: buildCompanyChatRoute(effectiveOwnerAgentId, activeCompany?.id),
      };
    }
    return displayOpenAction;
  })();

  const stagePlanningAction: FocusActionButton | null = null;
  const stageConfirmAction: FocusActionButton | null = null;

  const stageLaunchReminderAction: FocusActionButton | null = null;

  const advancePhaseAction: FocusActionButton | null = !shouldAdvanceToNextPhase
    ? null
    : {
        id: `advance-phase:${taskPlanOverview?.currentStep?.id ?? "current"}`,
        label: shouldDispatchPublish ? "让 CEO 通知 CTO 发布" : "让 CEO 发起下一阶段",
        description: shouldDispatchPublish
          ? "写手、审校、主编都已经完成，这一步只差 CEO 把终审通过结果转给 CTO。"
          : "重开准备已完成，直接进入新版审校 -> 终审 -> 发布，不再停在状态汇报。",
        kind: "message",
        tone: "primary",
        targetAgentId: targetAgentId ?? undefined,
        followupTargetAgentId:
          shouldDispatchPublish && publishDispatchTargetAgentId
            ? publishDispatchTargetAgentId
            : undefined,
        followupTargetLabel: shouldDispatchPublish ? publishDispatchTargetLabel : undefined,
        message: shouldDispatchPublish
          ? "写手、审校、主编都已经完成新版流程。现在不要再汇总现状，直接把“新版终审通过、准予发布”的结果转给 CTO，要求他立刻发布，并只回复我：1. 是否已下发给 CTO 2. CTO 是否接单 3. 下一次回传会给我什么结果。"
          : "重开准备动作已经完成。现在不要再总结现状，直接进入下一阶段并按这个顺序执行：1. 立即把 ch02_clean.md 发给审校，要求只检查纯正文和非正文污染 2. 审校完成后立刻转主编终审 3. 终审通过后再通知 CTO 发布。先执行第 1 步，并明确回我：是否已发出新版审校指令、发给了谁、下一步等待谁。",
      };

  const requirementNudgingAction: FocusActionButton | null =
    shouldUseTaskPlanPrimaryView ||
    !requirementOverview?.currentOwnerAgentId ||
    !activeCompany
      ? null
      : {
          id: `requirement-nudge:${requirementOverview.currentOwnerAgentId}:${requirementOverview.topicKey}`,
          label: `催 ${requirementOverview.currentOwnerLabel} 继续处理`,
          description: requirementOverview.nextAction,
          kind: "message",
          tone: "primary",
          targetAgentId: requirementOverview.currentOwnerAgentId,
          message: `现在主线卡在你这里。当前需求：${requirementOverview.title}。当前判断：${requirementOverview.summary}。请不要只汇报状态，直接继续处理，并明确回复：1. 你已经完成了什么 2. 还差什么 3. 下一次回传时给我什么结果。`,
        };

  const nudgingAction: FocusActionButton | null =
    isGroup || isFreshConversation
      ? null
      : stageConfirmAction ??
        stagePlanningAction ??
        stageLaunchReminderAction ??
        advancePhaseAction ??
        requirementNudgingAction ??
        focusActions.find((action) => action.kind === "message" && action.targetAgentId) ??
        focusActions.find((action) => action.kind === "recover") ??
        focusActions[0] ??
        null;

  const detailActions = (() => {
    if (isFreshConversation) {
      return [];
    }

    const primaryDetailAction = isGroup
      ? requirementRoomSummary?.primaryAction ?? effectiveOpenAction
      : effectiveOpenAction;
    const curated = [
      primaryDetailAction,
      effectiveOpenAction && effectiveOpenAction.id !== primaryDetailAction?.id
        ? effectiveOpenAction
        : null,
      nudgingAction && nudgingAction.id !== effectiveOpenAction?.id ? nudgingAction : null,
      summaryRecoveryAction,
    ].filter((action): action is FocusActionButton => Boolean(action));

    if (shouldAdvanceToNextPhase || requirementOverview) {
      return dedupeFocusActions(curated).slice(0, 3);
    }

    return dedupeFocusActions([...curated, ...focusActions]).slice(0, 4);
  })();

  const displayRequirementLifecycleSections: RequirementLifecycleSection[] | null =
    buildRequirementLifecycleSections({
      activeCompany,
      currentTime,
      effectiveOwnerAgentId,
      effectiveOwnerLabel,
      effectiveStage,
      effectiveStatusLabel,
      effectiveSummary,
      focusSummaryOwnerRole,
      isSummaryOpen,
      requirementOverview,
      requirementProgressGroups,
      requirementTechParticipant,
      shouldDispatchPublish,
      summaryPanelView,
      targetAgentId,
    });

  const displayRequirementProgressGroups: RequirementProgressGroups | null =
    buildDisplayRequirementProgressGroups({
      isSummaryOpen,
      requirementOverview,
      requirementProgressGroups,
      requirementTechParticipant,
      shouldDispatchPublish,
      summaryPanelView,
    });

  const headerStatusBadgeClass = buildHeaderStatusBadgeClass(effectiveTone);

  const primaryOpenAction: FocusActionButton | null = (() => {
    if (isRequirementBootstrapPending || isFreshConversation) {
      return null;
    }
    if (isGroup) {
      return requirementRoomSummary?.primaryAction ?? displayOpenAction;
    }
    if (stageConfirmAction) {
      return stageConfirmAction;
    }

    const nextBatonOpenAction =
      canonicalNextBatonAgentId && canonicalNextBatonAgentId !== targetAgentId
        ? {
            id: `open-next:${canonicalNextBatonAgentId}`,
            label: `打开 ${canonicalNextBatonLabel} 会话`,
            description: `直接进入 ${canonicalNextBatonLabel} 的会话，确认下一棒有没有真正接住。`,
            kind: "navigate" as const,
            tone: "secondary" as const,
            targetAgentId: canonicalNextBatonAgentId,
            href: buildCompanyChatRoute(canonicalNextBatonAgentId, activeCompany?.id),
          }
        : null;
    if (canonicalNextBatonAgentId && nextBatonOpenAction) {
      return nextBatonOpenAction;
    }
    if (effectiveOwnerAgentId === targetAgentId && nextBatonOpenAction) {
      return nextBatonOpenAction;
    }
    return effectiveOpenAction;
  })();

  const showRequirementTeamEntry = Boolean(
    (linkedRequirementRoom || requirementTeam) &&
      !isGroup &&
      !isRequirementBootstrapPending &&
      !isFreshConversation,
  );

  const teamGroupRoute = buildTeamGroupRoute({
    activeCompany,
    activeRoomRecords,
    conversationMissionRecord,
    groupWorkItemId,
    linkedRequirementRoom,
    persistedWorkItem,
    requirementTeam,
    targetAgentId,
  });

  const currentConversationWorkItemId =
    persistedWorkItem?.id ?? groupWorkItemId ?? conversationMissionRecord?.id ?? null;
  const currentConversationTopicKey =
    persistedWorkItem?.topicKey ??
    groupTopicKey ??
    conversationMissionRecord?.topicKey ??
    requirementOverview?.topicKey ??
    undefined;

  const buildTeamAdjustmentAction = buildTeamAdjustmentActionFactory({
    effectiveHeadline,
    effectiveOwnerAgentId,
    effectiveOwnerLabel,
    effectiveSummary,
    requirementTeam,
  });

  return {
    detailActions,
    displayRequirementLifecycleSections,
    displayRequirementProgressGroups,
    headerStatusBadgeClass,
    primaryOpenAction,
    showRequirementTeamEntry,
    teamGroupRoute,
    currentConversationWorkItemId,
    currentConversationTopicKey,
    buildTeamAdjustmentAction,
    missionIsCompleted,
  };
}
