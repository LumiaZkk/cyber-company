import {
  type BuildChatMissionSurfaceInput,
  resolveDisplaySurface,
  resolveEffectiveSurface,
} from "./chat-mission-display";
import { workItemToConversationMission } from "./conversation-work-item-view";
import type { FocusProgressTone } from "../governance/chat-progress";
import type {
  ConversationMissionRecord,
  ConversationMissionStepRecord,
} from "../../domain/mission/types";

type TaskPlanStep = {
  id: string;
  title: string;
  assigneeAgentId: string | null;
  assigneeLabel: string;
  status: "done" | "wip" | "pending";
  statusLabel: string;
  detail: string | null;
};

export type TaskPlanOverview = {
  totalCount: number;
  doneCount: number;
  currentStep: TaskPlanStep | null;
  nextStep: TaskPlanStep | null;
  steps: TaskPlanStep[];
};

export type ActiveConversationMission = {
  title: string;
  statusLabel: string;
  progressLabel: string;
  ownerLabel: string;
  currentStepLabel: string;
  nextLabel: string;
  summary: string;
  guidance: string;
  planSteps: ConversationMissionStepRecord[];
};

export type ChatMissionSurface = {
  displayHeadline: string;
  displayOwnerLabel: string;
  displayStage: string;
  displaySummary: string;
  displayActionHint: string;
  displayStatusLabel: string;
  displayTone: FocusProgressTone;
  shouldUseTaskPlanPrimaryView: boolean;
  effectiveOwnerAgentId: string | null;
  effectiveOwnerLabel: string;
  effectiveStepLabel: string;
  effectiveStage: string;
  effectiveStatusLabel: string;
  effectiveSummary: string;
  effectiveActionHint: string;
  effectiveHeadline: string;
  effectiveTone: FocusProgressTone;
  displayPlanCurrentStep: TaskPlanStep | null;
  canonicalNextBatonAgentId: string | null;
  canonicalNextBatonLabel: string;
  displayPlanNextStep: TaskPlanStep | null;
  displayNextBatonLabel: string;
  displayNextBatonAgentId: string | null;
  missionIsCompleted: boolean;
  missionPlanSteps: ConversationMissionStepRecord[];
  conversationMission: ActiveConversationMission | null;
  shouldPreferPersistedConversationMission: boolean;
  activeConversationMission: ActiveConversationMission | ConversationMissionRecord | null;
};

function summarizeMissionStepLabel(text: string | null | undefined): string {
  const normalized = (text ?? "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "待推进";
  }
  const preferred =
    normalized
      .split(/(?:\s+·\s+|\n|---|【需要你确认】|需要你确认的关键问题[:：])/i)
      .map((segment) => segment.trim())
      .find((segment) => segment.length > 0) ?? normalized;
  if (preferred.length <= 36) {
    return preferred;
  }
  return `${preferred.slice(0, 35).trimEnd()}…`;
}

export function buildChatMissionSurface(
  input: BuildChatMissionSurfaceInput,
): ChatMissionSurface {
  const display = resolveDisplaySurface(input);
  const shouldUseTaskPlanPrimaryView = Boolean(
    input.taskPlanOverview?.currentStep &&
      input.isChapterExecutionRequirement &&
      input.requirementCurrentParticipant &&
      input.requirementProgressWorkingCount === 0 &&
      ["已确认", "已交付待下游", "已回复", "已冻结待命"].includes(input.requirementCurrentParticipant.statusLabel),
  );

  const effective = resolveEffectiveSurface({
    display,
    isGroup: input.isGroup,
    isFreshConversation: input.isFreshConversation,
    isRequirementBootstrapPending: input.isRequirementBootstrapPending,
    requirementRoomSummary: input.requirementRoomSummary,
    stableDisplayPrimaryView: input.stableDisplayPrimaryView,
    strategicDirectParticipantView: input.strategicDirectParticipantView,
      shouldUseTaskPlanPrimaryView,
      taskPlanOverview: input.taskPlanOverview,
      requirementOverview: input.requirementOverview,
      workbenchOwnerAgentId: input.workbenchOwnerAgentId,
      shouldDispatchPublish: input.shouldDispatchPublish,
      shouldAdvanceToNextPhase: input.shouldAdvanceToNextPhase,
      groupTitle: input.groupTitle,
  });

  const visibleDispatchTargetAgentId =
    input.isChapterExecutionRequirement &&
    /当前卡点在 CEO|当前应由 CEO 发起下一阶段/i.test(effective.headline) &&
    /CTO|技术/i.test(`${effective.stage} ${effective.summary} ${effective.actionHint}`)
      ? input.publishDispatchTargetAgentId
      : null;
  const visibleDispatchTargetLabel =
    visibleDispatchTargetAgentId === input.publishDispatchTargetAgentId
      ? input.publishDispatchTargetLabel
      : null;

  const canonicalNextBatonAgentId =
    input.shouldDispatchPublish
      ? input.publishDispatchTargetAgentId
      : input.isCeoSession && input.stableDisplayPrimaryView?.nextAgentId
        ? input.stableDisplayPrimaryView.nextAgentId
        : input.strategicDirectParticipantView?.nextAgentId ??
          visibleDispatchTargetAgentId ??
          input.taskPlanOverview?.nextStep?.assigneeAgentId ??
          input.requirementTeam?.members.find((member) => member.isNext)?.agentId ??
          null;
  const canonicalNextBatonLabel =
    input.shouldDispatchPublish
      ? input.publishDispatchTargetLabel
      : input.isCeoSession && input.stableDisplayPrimaryView?.nextLabel
        ? input.stableDisplayPrimaryView.nextLabel
        : input.strategicDirectParticipantView?.nextLabel ??
          visibleDispatchTargetLabel ??
          input.taskPlanOverview?.nextStep?.assigneeLabel ??
          input.requirementTeam?.nextBatonLabel ??
          "待确认";

  const displayPlanCurrentStep =
    input.isRequirementBootstrapPending
      ? null
      : input.shouldDispatchPublish && input.taskPlanOverview?.currentStep
        ? {
            ...input.taskPlanOverview.currentStep,
            title: "通知 CTO 发布新版",
            assigneeLabel: effective.ownerLabel,
            assigneeAgentId: effective.ownerAgentId,
          }
        : input.taskPlanOverview?.currentStep ?? null;

  const displayPlanNextStep =
    input.isRequirementBootstrapPending
      ? null
      : canonicalNextBatonAgentId &&
          (input.shouldDispatchPublish || visibleDispatchTargetAgentId === canonicalNextBatonAgentId)
        ? {
            id: input.shouldDispatchPublish ? "synthetic:cto-publish" : "synthetic:cto-dispatch-fallback",
            title: "执行发布并回传结果",
            assigneeLabel: canonicalNextBatonLabel,
            assigneeAgentId: canonicalNextBatonAgentId,
            status: "pending" as const,
            statusLabel: "待接手",
            detail: input.shouldDispatchPublish
              ? "收到新版发布指令后，立即执行发布并回传链接/审核状态。"
              : "当前负责人已经收敛到发布口径，下一棒应该交给 CTO 执行并回传结果。",
          }
        : input.taskPlanOverview?.nextStep ?? null;

  const displayNextBatonLabel = input.isGroup
    ? input.requirementRoomSummary?.ownerLabel ?? "待确认"
    : canonicalNextBatonLabel;
  const displayNextBatonAgentId = input.isGroup
    ? input.requirementRoomSummary?.ownerAgentId ?? null
    : canonicalNextBatonAgentId;

  const missionIsCompleted = Boolean(
    !input.isGroup &&
      !input.isRequirementBootstrapPending &&
      !input.isFreshConversation &&
      input.taskPlanOverview &&
      input.taskPlanOverview.totalCount > 0 &&
      input.taskPlanOverview.doneCount >= input.taskPlanOverview.totalCount &&
      !input.shouldAdvanceToNextPhase &&
      !input.shouldDispatchPublish &&
      !input.shouldDirectToTechDispatch,
  );

  const missionPlanSteps: ConversationMissionStepRecord[] = input.taskPlanOverview?.steps.length
    ? input.taskPlanOverview.steps.map((step) => {
        const isCurrentStep = displayPlanCurrentStep?.id === step.id;
        const displayStep = isCurrentStep && displayPlanCurrentStep ? { ...step, ...displayPlanCurrentStep } : step;
        return {
          ...displayStep,
          isCurrent: isCurrentStep,
          isNext: displayPlanNextStep?.id === step.id,
        };
      })
    : input.requirementOverview
        ? [
            {
              id: `mission-current:${input.requirementOverview.topicKey}`,
              title: effective.stage,
              assigneeLabel: effective.ownerLabel,
              assigneeAgentId: effective.ownerAgentId,
              status:
                effective.statusLabel === "已完成" || effective.statusLabel === "已确认"
                  ? ("done" as const)
                  : ("wip" as const),
              statusLabel: effective.statusLabel,
              detail: effective.summary,
              isCurrent: true,
              isNext: false,
            },
            ...(displayNextBatonAgentId &&
            displayNextBatonLabel &&
            displayNextBatonAgentId !== effective.ownerAgentId &&
            displayNextBatonLabel !== effective.ownerLabel
              ? [
                  {
                    id: `mission-next:${displayNextBatonAgentId}`,
                    title: "接手下一棒",
                    assigneeLabel: displayNextBatonLabel,
                    assigneeAgentId: displayNextBatonAgentId,
                    status: "pending" as const,
                    statusLabel: "待接手",
                    detail: "上一棒完成后，这里会成为新的执行负责人。",
                    isCurrent: false,
                    isNext: true,
                  },
                ]
              : []),
          ]
        : [];

  const conversationMission: ActiveConversationMission | null =
    input.isFreshConversation
      ? {
          title: "新的规划/任务",
          statusLabel: "待创建",
          progressLabel: "0/0",
          ownerLabel: input.ceoLabel,
          currentStepLabel: "等待你提出这轮新需求",
          nextLabel: "CEO 先梳理需求并给出 plan",
          summary: "这是一段新的空白对话。你现在对 CEO 说的目标，会被收成这一轮唯一的规划/任务。",
          guidance: "先把目标、约束、预期结果说清楚；CEO 会先整理成 plan，再由你确认进入执行。",
          planSteps: [],
        }
      : input.isRequirementBootstrapPending
        ? {
            title: "正在恢复当前规划/任务",
            statusLabel: "恢复中",
            progressLabel: "--",
            ownerLabel: "系统",
            currentStepLabel: "从公司会话恢复当前主线",
            nextLabel: "恢复完成后回到最新任务",
            summary: "刷新后会先重建当前规划/任务，避免先看到历史章节再跳回当前章节。",
            guidance: "这段时间先不要判断当前负责人；恢复完成后，再看本轮规划/任务。",
            planSteps: [],
          }
        : !input.isGroup && !input.requirementOverview && !input.taskPlanOverview
          ? null
          : {
              title:
                (input.persistedWorkItem?.title?.trim() || input.persistedWorkItem?.headline?.trim()) ??
                input.requirementOverview?.title ??
                input.structuredTaskTitle ??
                "当前规划/任务",
              statusLabel: missionIsCompleted
                ? "已完成"
                : effective.statusLabel,
              progressLabel: input.taskPlanOverview
                ? `${input.taskPlanOverview.doneCount}/${input.taskPlanOverview.totalCount}`
                : input.requirementTeam?.progressLabel ?? "进行中",
              ownerLabel: effective.ownerLabel,
              currentStepLabel: displayPlanCurrentStep
                ? `${displayPlanCurrentStep.assigneeLabel} · ${displayPlanCurrentStep.title}`
                : effective.stage,
              nextLabel: missionIsCompleted
                ? "可以复盘，或开启下一轮"
                : displayPlanNextStep
                  ? `${displayPlanNextStep.assigneeLabel} · ${displayPlanNextStep.title}`
                  : displayNextBatonLabel,
              summary: missionIsCompleted
                ? "这轮规划/任务已经完成。现在可以让 CEO 做阶段总结、复盘，或者直接开启下一轮。"
                : effective.summary,
              guidance: missionIsCompleted
                ? "如果你还想继续围绕这一轮复盘或补问题，可以继续聊天；如果要开始新目标，直接开启下一轮。"
                : "继续跟 CEO 聊，就是在调整这份规划/任务。CEO 会继续更新 plan、负责人、下一棒和当前判断。",
              planSteps: missionPlanSteps,
            };

  const persistedConversationMissionFromWorkItem = input.persistedWorkItem
    ? workItemToConversationMission(input.persistedWorkItem)
    : null;
  const shouldPreferPersistedConversationMission = Boolean(
    !input.isGroup &&
      input.isCeoSession &&
      (input.hasStableConversationWorkItem || input.shouldUsePersistedWorkItemPrimaryView) &&
      persistedConversationMissionFromWorkItem,
  );

  const activeConversationMission =
    ((input.hasStableConversationWorkItem || shouldPreferPersistedConversationMission)
      ? persistedConversationMissionFromWorkItem
      : null) ??
    conversationMission ??
    persistedConversationMissionFromWorkItem ??
    (input.requirementOverview || input.isRequirementBootstrapPending || input.isFreshConversation
      ? null
      : input.persistedConversationMission);

  return {
    displayHeadline: display.headline,
    displayOwnerLabel: display.ownerLabel,
    displayStage: display.stage,
    displaySummary: display.summary,
    displayActionHint: display.actionHint,
    displayStatusLabel: display.statusLabel,
    displayTone: display.tone,
    shouldUseTaskPlanPrimaryView,
    effectiveOwnerAgentId: effective.ownerAgentId,
    effectiveOwnerLabel: effective.ownerLabel,
    effectiveStepLabel: summarizeMissionStepLabel(displayPlanCurrentStep?.title ?? effective.stage),
    effectiveStage: effective.stage,
    effectiveStatusLabel: effective.statusLabel,
    effectiveSummary: effective.summary,
    effectiveActionHint: effective.actionHint,
    effectiveHeadline: effective.headline,
    effectiveTone: effective.tone,
    displayPlanCurrentStep,
    canonicalNextBatonAgentId,
    canonicalNextBatonLabel,
    displayPlanNextStep,
    displayNextBatonLabel,
    displayNextBatonAgentId,
    missionIsCompleted,
    missionPlanSteps,
    conversationMission,
    shouldPreferPersistedConversationMission,
    activeConversationMission,
  };
}
