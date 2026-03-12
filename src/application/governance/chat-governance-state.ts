import {
  buildExecutionFocusSummary,
  formatAgentLabel,
  type ExecutionFocusSummary,
} from "./focus-summary";
import {
  buildSessionProgressEvents,
  type FocusProgressEvent,
} from "./chat-progress";
import type { ChatMessage } from "../gateway";
import type { CeoControlSurfaceSnapshot } from "./ceo-control-surface";
import type { RequirementExecutionOverview, RequirementParticipantProgress } from "../mission/requirement-overview";
import type { ResolvedExecutionState } from "../mission/execution-state";
import type { ManualTakeoverPack } from "../delegation/takeover-pack";
import type { TrackedTask } from "../../domain/mission/types";
import type { HandoffRecord, RequestRecord } from "../../domain/delegation/types";
import type { Company } from "../../domain/org/types";

type ChatFocusAlert = {
  summary: string;
  recommendedAction?: string;
  detail?: string;
};

type BuildChatGovernanceStateInput = {
  activeCompany: Company | null;
  targetAgentId: string | null;
  targetRoleLabel: string;
  isGroup: boolean;
  isCeoSession: boolean;
  isFreshConversation: boolean;
  sessionKey: string | null;
  summaryAlertCount: number;
  sessionExecution: ResolvedExecutionState;
  structuredTaskPreview: TrackedTask | null;
  requestPreview: RequestRecord[];
  handoffPreview: HandoffRecord[];
  takeoverPack: ManualTakeoverPack | null;
  ceoSurface: CeoControlSurfaceSnapshot | null;
  alerts: ChatFocusAlert[];
  requirementOverview: RequirementExecutionOverview | null;
  taskPlanOverview: {
    totalCount: number;
    doneCount: number;
    currentStep: { assigneeAgentId: string | null; title: string } | null;
  } | null;
  messages: ChatMessage[];
};

export type ChatGovernanceState = {
  focusSummary: ExecutionFocusSummary;
  isChapterExecutionRequirement: boolean;
  requirementWriterParticipant: RequirementParticipantProgress | null;
  requirementReviewParticipant: RequirementParticipantProgress | null;
  requirementEditorParticipant: RequirementParticipantProgress | null;
  requirementTechParticipant: RequirementParticipantProgress | null;
  shouldAdvanceToNextPhase: boolean;
  shouldDirectToTechDispatch: boolean;
  shouldDispatchPublish: boolean;
  publishDispatchTargetAgentId: string;
  publishDispatchTargetLabel: string;
  hasTechnicalSummary: boolean;
  hasContextSummary: boolean;
  sessionProgressEvents: FocusProgressEvent[];
};

function participantMatchesRole(
  participant: RequirementParticipantProgress | null | undefined,
  pattern: RegExp,
): boolean {
  if (!participant) {
    return false;
  }
  return pattern.test(`${participant.nickname} ${participant.role} ${participant.stage}`);
}

function isParticipantStepDone(statusLabel: string): boolean {
  return ["已确认", "已冻结待命", "已回复", "已交接", "已交付待下游"].includes(statusLabel);
}

function isCoordinatorWaitingStatus(statusLabel: string): boolean {
  return ["已冻结待命", "待接手", "待回复", "已接单", "已接单未推进"].includes(statusLabel);
}

export function buildChatGovernanceState(
  input: BuildChatGovernanceStateInput,
): ChatGovernanceState {
  const focusSummary = buildExecutionFocusSummary({
    company: input.activeCompany,
    targetAgentId: input.targetAgentId,
    targetRoleLabel: input.targetRoleLabel,
    execution: input.sessionExecution,
    task: input.structuredTaskPreview,
    requests: input.requestPreview,
    handoffs: input.handoffPreview,
    takeoverPack: input.takeoverPack,
    ceoSurface: input.ceoSurface ?? undefined,
    alerts: input.alerts,
  });

  const isChapterExecutionRequirement = Boolean(input.requirementOverview?.topicKey?.startsWith("chapter:"));
  const shouldAdvanceToNextPhase = Boolean(
    isChapterExecutionRequirement &&
      input.taskPlanOverview &&
      input.taskPlanOverview.currentStep &&
      input.taskPlanOverview.currentStep.assigneeAgentId === input.targetAgentId &&
      /CEO/i.test(input.taskPlanOverview.currentStep.title) &&
      input.taskPlanOverview.doneCount >= Math.max(1, input.taskPlanOverview.totalCount - 1),
  );

  const requirementWriterParticipant =
    input.requirementOverview?.participants.find((participant) => participantMatchesRole(participant, /主笔|写手/i)) ??
    null;
  const requirementReviewParticipant =
    input.requirementOverview?.participants.find((participant) => participantMatchesRole(participant, /审校/i)) ??
    null;
  const requirementEditorParticipant =
    input.requirementOverview?.participants.find((participant) => participantMatchesRole(participant, /主编|质量总监|终审/i)) ??
    null;
  const requirementCompanyTechEmployee =
    input.activeCompany?.employees.find((employee) => employee.metaRole === "cto") ?? null;
  const requirementTechParticipant =
    (requirementCompanyTechEmployee
      ? input.requirementOverview?.participants.find(
          (participant) => participant.agentId === requirementCompanyTechEmployee.agentId,
        )
      : input.requirementOverview?.participants.find((participant) => participantMatchesRole(participant, /CTO|技术/i))) ??
    null;
  const hasRestartRewriteChainCompleted = Boolean(
    requirementWriterParticipant &&
      requirementReviewParticipant &&
      requirementEditorParticipant &&
      isParticipantStepDone(requirementWriterParticipant.statusLabel) &&
      isParticipantStepDone(requirementReviewParticipant.statusLabel) &&
      isParticipantStepDone(requirementEditorParticipant.statusLabel),
  );
  const shouldDirectToTechDispatch = Boolean(
    isChapterExecutionRequirement &&
      input.requirementOverview?.currentOwnerAgentId === input.targetAgentId &&
      hasRestartRewriteChainCompleted &&
      requirementTechParticipant &&
      isCoordinatorWaitingStatus(requirementTechParticipant.statusLabel),
  );
  const overviewShowsDispatch = Boolean(
    isChapterExecutionRequirement &&
      input.requirementOverview?.currentOwnerAgentId === input.targetAgentId &&
      /CTO|技术/i.test(input.requirementOverview?.currentStage ?? "") &&
      /发布/i.test(input.requirementOverview?.currentStage ?? ""),
  );
  const shouldDispatchPublish = Boolean(
    overviewShowsDispatch ||
      ((shouldAdvanceToNextPhase || shouldDirectToTechDispatch) &&
        hasRestartRewriteChainCompleted &&
        requirementTechParticipant &&
        isCoordinatorWaitingStatus(requirementTechParticipant.statusLabel)),
  );
  const publishDispatchTargetAgentId =
    requirementCompanyTechEmployee?.agentId ?? requirementTechParticipant?.agentId ?? "co-cto";
  const publishDispatchTargetLabel =
    requirementCompanyTechEmployee
      ? formatAgentLabel(input.activeCompany, requirementCompanyTechEmployee.agentId)
      : requirementTechParticipant?.nickname ?? "CTO";
  const hasTechnicalSummary =
    Boolean(input.takeoverPack) ||
    Boolean(input.structuredTaskPreview) ||
    Boolean(input.ceoSurface) ||
    input.handoffPreview.length > 0 ||
    input.requestPreview.length > 0 ||
    input.summaryAlertCount > 0;
  const hasContextSummary = !input.isFreshConversation && (Boolean(input.sessionKey) || hasTechnicalSummary);
  const sessionProgressEvents = buildSessionProgressEvents({
    messages: input.messages,
    company: input.activeCompany,
    ownerLabel: focusSummary.ownerLabel,
    includeOwnerAssistantEvents: input.isGroup,
  });

  return {
    focusSummary,
    isChapterExecutionRequirement,
    requirementWriterParticipant,
    requirementReviewParticipant,
    requirementEditorParticipant,
    requirementTechParticipant,
    shouldAdvanceToNextPhase,
    shouldDirectToTechDispatch,
    shouldDispatchPublish,
    publishDispatchTargetAgentId,
    publishDispatchTargetLabel,
    hasTechnicalSummary,
    hasContextSummary,
    sessionProgressEvents,
  };
}
