import type { StrategicDirectParticipantView } from "../assignment/chat-participants";
import type { RequirementTeamView } from "../assignment/requirement-team";
import type { FocusProgressTone } from "../governance/chat-progress";
import type { WorkItemPrimaryView } from "./conversation-work-item-view";
import type {
  RequirementExecutionOverview,
  RequirementParticipantProgress,
} from "./requirement-overview";
import type {
  ConversationMissionRecord,
  WorkItemRecord,
} from "../../domain/mission/types";
import type { TaskPlanOverview } from "./chat-mission-surface";

export type RequirementRoomMissionSummary = {
  ownerAgentId: string | null;
  ownerLabel: string;
  stage: string;
  statusLabel: string;
  summary: string;
  actionHint: string;
  headline: string;
  tone: FocusProgressTone;
};

export type DisplaySurface = {
  headline: string;
  ownerLabel: string;
  stage: string;
  summary: string;
  actionHint: string;
  statusLabel: string;
  tone: FocusProgressTone;
};

export type EffectiveSurface = {
  ownerAgentId: string | null;
  ownerLabel: string;
  stage: string;
  statusLabel: string;
  summary: string;
  actionHint: string;
  headline: string;
  tone: FocusProgressTone;
};

export type BuildChatMissionSurfaceInput = {
  isGroup: boolean;
  isFreshConversation: boolean;
  isRequirementBootstrapPending: boolean;
  isCeoSession: boolean;
  isChapterExecutionRequirement: boolean;
  groupTitle: string;
  ceoLabel: string;
  stableDisplayWorkItem: WorkItemRecord | null;
  stableDisplayPrimaryView: WorkItemPrimaryView | null;
  strategicDirectParticipantView: StrategicDirectParticipantView | null;
  requirementOverview: RequirementExecutionOverview | null;
  requirementCurrentParticipant: RequirementParticipantProgress | null;
  requirementProgressWorkingCount: number;
  requirementRoomSummary: RequirementRoomMissionSummary | null;
  taskPlanOverview: TaskPlanOverview | null;
  shouldAdvanceToNextPhase: boolean;
  shouldDispatchPublish: boolean;
  shouldDirectToTechDispatch: boolean;
  publishDispatchTargetAgentId: string | null;
  publishDispatchTargetLabel: string;
  requirementTeam: RequirementTeamView | null;
  workbenchHeadline: string;
  workbenchOwnerAgentId: string | null;
  workbenchOwnerLabel: string;
  workbenchStage: string;
  workbenchSummary: string;
  workbenchActionHint: string;
  workbenchStatusLabel: string;
  workbenchTone: FocusProgressTone;
  persistedWorkItem: WorkItemRecord | null;
  persistedConversationMission: ConversationMissionRecord | null;
  hasStableConversationWorkItem: boolean;
  shouldUsePersistedWorkItemPrimaryView: boolean;
  structuredTaskTitle: string | null;
};

export function resolveDisplaySurface(input: BuildChatMissionSurfaceInput): DisplaySurface {
  const stableWorkTitle =
    input.isRequirementBootstrapPending
      ? "正在恢复当前需求"
      : input.isFreshConversation
        ? "新的 CEO 对话已开始"
        : input.stableDisplayWorkItem?.title?.trim() ||
          input.stableDisplayWorkItem?.headline?.trim() ||
          (input.isGroup
            ? input.persistedWorkItem?.title?.trim() ||
              input.persistedWorkItem?.headline?.trim() ||
              input.groupTitle
            : null) ||
          null;

  return {
    headline: input.isRequirementBootstrapPending
      ? "正在恢复当前需求"
      : input.isFreshConversation
        ? "新的 CEO 对话已开始"
        : stableWorkTitle
          ? stableWorkTitle
          : input.stableDisplayPrimaryView?.headline ||
            (input.isCeoSession ? input.strategicDirectParticipantView?.headline : null) ||
            input.requirementOverview?.headline ||
            input.workbenchHeadline,
    ownerLabel: input.isRequirementBootstrapPending
      ? "系统"
      : input.isFreshConversation
        ? input.ceoLabel
        : input.stableDisplayPrimaryView?.ownerLabel ||
          (input.isCeoSession ? input.strategicDirectParticipantView?.ownerLabel : null) ||
          input.requirementOverview?.currentOwnerLabel ||
          input.workbenchOwnerLabel,
    stage: input.isRequirementBootstrapPending
      ? "正在同步公司会话"
      : input.isFreshConversation
        ? "等待你的新指令"
        : input.stableDisplayPrimaryView?.stage ||
          (input.isCeoSession ? input.strategicDirectParticipantView?.stage : null) ||
          input.requirementOverview?.currentStage ||
          input.workbenchStage,
    summary: input.isRequirementBootstrapPending
      ? "刷新后会先从公司范围的最新会话重建当前主线，避免先闪回旧章节再跳到新章节。"
      : input.isFreshConversation
        ? "这是一段新的空白对话，不会自动恢复旧任务。直接告诉 CEO 你现在的新需求即可。"
        : input.stableDisplayPrimaryView?.summary ||
          (input.isCeoSession ? input.strategicDirectParticipantView?.summary : null) ||
          input.requirementOverview?.summary ||
          input.workbenchSummary,
    actionHint: input.isRequirementBootstrapPending
      ? "稍等片刻；如果长时间没有恢复，再手动点“同步当前阻塞”。"
      : input.isFreshConversation
        ? "直接提这次的新需求；如果你是想继续旧任务，再去工作看板或运营大厅查看当前主线。"
        : input.stableDisplayPrimaryView?.actionHint ||
          (input.isCeoSession ? input.strategicDirectParticipantView?.actionHint : null) ||
          input.requirementOverview?.nextAction ||
          input.workbenchActionHint,
    statusLabel: input.isRequirementBootstrapPending
      ? "恢复中"
      : input.isFreshConversation
        ? "新会话"
        : input.stableDisplayPrimaryView?.statusLabel ||
          (input.isCeoSession ? input.strategicDirectParticipantView?.statusLabel : null) ||
          input.requirementCurrentParticipant?.statusLabel ||
          input.workbenchStatusLabel,
    tone: input.isRequirementBootstrapPending
      ? "slate"
      : input.isFreshConversation
        ? "slate"
        : input.stableDisplayPrimaryView?.tone ||
          (input.isCeoSession ? input.strategicDirectParticipantView?.tone : null) ||
          (input.requirementCurrentParticipant?.tone === "rose"
            ? "rose"
            : input.requirementCurrentParticipant?.tone === "amber"
              ? "amber"
              : input.requirementCurrentParticipant?.tone === "emerald"
                ? "emerald"
                : input.requirementCurrentParticipant?.tone === "blue" ||
                    input.requirementCurrentParticipant?.tone === "violet"
                  ? "indigo"
                  : input.workbenchTone),
  };
}

export function resolveEffectiveSurface(input: {
  display: DisplaySurface;
  isGroup: boolean;
  isFreshConversation: boolean;
  isRequirementBootstrapPending: boolean;
  requirementRoomSummary: RequirementRoomMissionSummary | null;
  stableDisplayPrimaryView: WorkItemPrimaryView | null;
  strategicDirectParticipantView: StrategicDirectParticipantView | null;
  shouldUseTaskPlanPrimaryView: boolean;
  taskPlanOverview: TaskPlanOverview | null;
  requirementOverview: RequirementExecutionOverview | null;
  workbenchOwnerAgentId: string | null;
  shouldDispatchPublish: boolean;
  shouldAdvanceToNextPhase: boolean;
  groupTitle: string;
}): EffectiveSurface {
  const effectiveOwnerAgentId =
    input.isGroup
      ? input.requirementRoomSummary?.ownerAgentId ?? null
      : input.stableDisplayPrimaryView?.ownerAgentId ??
        input.strategicDirectParticipantView?.ownerAgentId ??
        (input.shouldUseTaskPlanPrimaryView ? input.taskPlanOverview?.currentStep?.assigneeAgentId ?? null : null) ??
        input.requirementOverview?.currentOwnerAgentId ??
        input.workbenchOwnerAgentId;

  const effectiveOwnerLabel =
    input.isGroup
      ? input.requirementRoomSummary?.ownerLabel ?? "负责人待定"
      : input.shouldUseTaskPlanPrimaryView && input.taskPlanOverview?.currentStep
        ? input.taskPlanOverview.currentStep.assigneeLabel
        : input.display.ownerLabel;

  const effectiveStage =
    input.isGroup
      ? input.requirementRoomSummary?.stage ?? "需求团队房间"
      : input.shouldDispatchPublish
          ? "向 CTO 下发新版发布指令"
          : input.shouldUseTaskPlanPrimaryView && input.taskPlanOverview?.currentStep
            ? input.taskPlanOverview.currentStep.title
            : input.display.stage;

  const effectiveStatusLabel =
    input.isGroup
      ? input.requirementRoomSummary?.statusLabel ?? "待派发"
      : input.shouldDispatchPublish
          ? "待派发"
          : input.shouldAdvanceToNextPhase
            ? "待推进"
            : input.shouldUseTaskPlanPrimaryView
              ? input.taskPlanOverview?.currentStep?.status === "wip"
                ? "进行中"
                : "待处理"
              : input.display.statusLabel;

  const effectiveSummary =
    input.isGroup
      ? input.requirementRoomSummary?.summary ?? `当前团队房间：${input.groupTitle}`
      : input.shouldDispatchPublish
          ? "写手、审校、主编都已经完成本轮，当前只差 CEO 把新版终审通过结果正式转给 CTO。"
          : input.shouldAdvanceToNextPhase
            ? "重开准备动作已经完成，当前不该继续盯写手或冻结节点，应该由 CEO 发起新版审校 -> 终审 -> 发布链。"
            : input.shouldUseTaskPlanPrimaryView && input.taskPlanOverview?.currentStep
              ? input.taskPlanOverview.currentStep.status === "wip"
                ? `${input.taskPlanOverview.currentStep.assigneeLabel} 正在推进「${input.taskPlanOverview.currentStep.title}」这一步。`
                : `${input.taskPlanOverview.currentStep.assigneeLabel} 还没接住「${input.taskPlanOverview.currentStep.title}」这一步。`
              : input.display.summary;

  const effectiveActionHint =
    input.isGroup
      ? input.requirementRoomSummary?.actionHint ??
        "输入 @成员名 可以定向派发；不写 @ 默认发给当前 baton，必要时再切到群发。"
      : input.shouldDispatchPublish
          ? "现在通知 CTO 立即发布新版第 2 章，并要求他回传是否成功、发布链接和审核状态。"
          : input.shouldAdvanceToNextPhase
            ? "现在该由 CEO 继续推进：先把 ch02_clean.md 发给审校，再转主编终审，最后再让 CTO 发布。"
            : input.shouldUseTaskPlanPrimaryView && input.taskPlanOverview?.currentStep
              ? input.taskPlanOverview.currentStep.status === "wip"
                ? `继续跟进 ${input.taskPlanOverview.currentStep.assigneeLabel}，确认「${input.taskPlanOverview.currentStep.title}」有没有真实产物回传。`
                : `先打开 ${input.taskPlanOverview.currentStep.assigneeLabel} 会话，推进「${input.taskPlanOverview.currentStep.title}」。`
              : input.display.actionHint;

  const effectiveHeadline =
    input.isGroup
      ? input.requirementRoomSummary?.headline ?? `需求团队: ${input.groupTitle}`
      : input.isRequirementBootstrapPending
        ? "正在恢复当前需求"
        : input.isFreshConversation
          ? "等待你的新指令"
          : input.stableDisplayPrimaryView
            ? input.display.headline
            : input.shouldDispatchPublish
                ? "当前卡点在 CEO"
                : input.shouldAdvanceToNextPhase
                  ? "当前应由 CEO 发起下一阶段"
                  : input.shouldUseTaskPlanPrimaryView && input.taskPlanOverview?.currentStep
                    ? `当前流转到 ${input.taskPlanOverview.currentStep.assigneeLabel}`
                    : input.display.headline;

  const effectiveTone: FocusProgressTone =
    input.isGroup
      ? input.requirementRoomSummary?.tone ?? "slate"
      : input.isFreshConversation
        ? "slate"
        : input.shouldAdvanceToNextPhase || input.shouldUseTaskPlanPrimaryView
            ? "amber"
            : input.display.tone;

  return {
    ownerAgentId: effectiveOwnerAgentId,
    ownerLabel: effectiveOwnerLabel,
    stage: effectiveStage,
    statusLabel: effectiveStatusLabel,
    summary: effectiveSummary,
    actionHint: effectiveActionHint,
    headline: effectiveHeadline,
    tone: effectiveTone,
  };
}
