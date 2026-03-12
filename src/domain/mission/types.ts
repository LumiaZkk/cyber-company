export type WorkItemStatus =
  | "draft"
  | "active"
  | "waiting_review"
  | "waiting_owner"
  | "completed"
  | "blocked"
  | "archived";

export type RequirementLifecycleState =
  | "draft"
  | "active"
  | "waiting_peer"
  | "waiting_owner"
  | "waiting_review"
  | "blocked"
  | "completed"
  | "archived";

export type RequirementAcceptanceStatus =
  | "not_requested"
  | "pending"
  | "accepted"
  | "rejected";

export type RequirementLifecyclePhase =
  | "pre_requirement"
  | "active_requirement"
  | "completed";

export type RequirementStageGateStatus = "none" | "waiting_confirmation" | "confirmed";

export type WorkItemKind = "strategic" | "execution" | "artifact";
export type WorkItemExecutionLevel = "company" | "department" | "individual";

export type WorkStepStatus = "pending" | "active" | "done" | "blocked" | "skipped";

export interface WorkStepRecord {
  id: string;
  title: string;
  assigneeActorId?: string | null;
  assigneeLabel: string;
  status: WorkStepStatus;
  completionCriteria?: string | null;
  detail?: string | null;
  updatedAt: number;
}

export interface ConversationMissionStepRecord {
  id: string;
  title: string;
  assigneeLabel: string;
  assigneeAgentId?: string | null;
  status: "done" | "wip" | "pending";
  statusLabel: string;
  detail?: string | null;
  isCurrent: boolean;
  isNext: boolean;
}

export interface ConversationMissionRecord {
  id: string;
  sessionKey: string;
  topicKey?: string;
  roomId?: string;
  startedAt?: number;
  promotionState?: RequirementPromotionState;
  promotionReason?: PromotionReason | null;
  lifecyclePhase: RequirementLifecyclePhase;
  stageGateStatus: RequirementStageGateStatus;
  title: string;
  statusLabel: string;
  progressLabel: string;
  ownerAgentId?: string | null;
  ownerLabel: string;
  currentStepLabel: string;
  nextAgentId?: string | null;
  nextLabel: string;
  summary: string;
  guidance: string;
  completed: boolean;
  updatedAt: number;
  planSteps: ConversationMissionStepRecord[];
}

export interface WorkItemRecord {
  id: string;
  workKey: string;
  kind: WorkItemKind;
  roundId: string;
  companyId: string;
  sessionKey?: string;
  topicKey?: string;
  sourceActorId?: string | null;
  sourceActorLabel?: string | null;
  sourceSessionKey?: string | null;
  sourceConversationId?: string | null;
  providerId?: string | null;
  title: string;
  goal: string;
  headline: string;
  displayStage: string;
  displaySummary: string;
  displayOwnerLabel: string;
  displayNextAction: string;
  status: WorkItemStatus;
  lifecyclePhase: RequirementLifecyclePhase;
  stageGateStatus: RequirementStageGateStatus;
  stageLabel: string;
  owningDepartmentId?: string | null;
  executionLevel?: WorkItemExecutionLevel;
  ownerActorId?: string | null;
  ownerLabel: string;
  batonActorId?: string | null;
  batonLabel: string;
  parentWorkItemId?: string | null;
  roomId?: string | null;
  artifactIds: string[];
  dispatchIds: string[];
  startedAt: number;
  updatedAt: number;
  completedAt?: number | null;
  summary: string;
  nextAction: string;
  steps: WorkStepRecord[];
  sourceMissionId?: string;
}

export interface RequirementAggregateRecord {
  id: string;
  companyId: string;
  topicKey: string | null;
  kind: "strategic" | "execution";
  primary: boolean;
  workItemId: string | null;
  roomId: string | null;
  ownerActorId: string | null;
  ownerLabel: string;
  lifecyclePhase: RequirementLifecyclePhase;
  stageGateStatus: RequirementStageGateStatus;
  stage: string;
  summary: string;
  nextAction: string;
  memberIds: string[];
  sourceConversationId: string | null;
  startedAt: number;
  updatedAt: number;
  revision: number;
  lastEvidenceAt: number | null;
  status: RequirementLifecycleState;
  acceptanceStatus: RequirementAcceptanceStatus;
  acceptanceNote?: string | null;
}

export interface RequirementEvidenceEvent {
  id: string;
  companyId: string;
  aggregateId: string | null;
  source: "gateway-chat" | "company-event" | "local-command" | "backfill";
  sessionKey: string | null;
  actorId: string | null;
  eventType: string;
  timestamp: number;
  payload: Record<string, unknown>;
  applied: boolean;
}

export interface DraftRequirementRecord {
  topicKey: string | null;
  topicText: string;
  summary: string;
  ownerActorId: string | null;
  ownerLabel: string;
  stage: string;
  nextAction: string;
  stageGateStatus?: RequirementStageGateStatus | null;
  state: RequirementPromotionState;
  promotionReason?: PromotionReason | null;
  promotable: boolean;
  updatedAt: number;
}

export interface ConversationStateRecord {
  companyId: string;
  conversationId: string;
  currentWorkKey?: string | null;
  currentWorkItemId?: string | null;
  currentRoundId?: string | null;
  draftRequirement?: DraftRequirementRecord | null;
  updatedAt: number;
}

export type RequirementPromotionState =
  | "chatting"
  | "draft_ready"
  | "awaiting_promotion_choice"
  | "promoted_manual"
  | "promoted_auto"
  | "active_requirement";

export type PromotionReason =
  | "manual_confirmation"
  | "multi_actor_dispatch"
  | "task_board_detected";

export type RoundMessageSnapshot = {
  role: "user" | "assistant" | "system" | "toolResult";
  text: string;
  timestamp: number;
};

export interface RoundRecord {
  id: string;
  companyId: string;
  workItemId?: string | null;
  roomId?: string | null;
  title: string;
  preview?: string | null;
  reason?: "new" | "reset" | "deleted" | "product";
  sourceActorId?: string | null;
  sourceActorLabel?: string | null;
  sourceSessionKey?: string | null;
  sourceConversationId?: string | null;
  providerArchiveId?: string | null;
  providerId?: string | null;
  messages: RoundMessageSnapshot[];
  archivedAt: number;
  restorable: boolean;
}

export type TaskStepStatus = "done" | "wip" | "pending";

export type TaskExecutionState =
  | "idle"
  | "running"
  | "waiting_input"
  | "waiting_peer"
  | "blocked_timeout"
  | "blocked_tool_failure"
  | "manual_takeover_required"
  | "completed"
  | "unknown";

export interface TaskStep {
  text: string;
  status: TaskStepStatus;
  assignee?: string;
}

export interface TrackedTask {
  id: string;
  title: string;
  sessionKey: string;
  agentId: string;
  steps: TaskStep[];
  createdAt: number;
  updatedAt: number;
  source?: "session" | "file";
  sourceAgentId?: string;
  ownerAgentId?: string;
  assigneeAgentIds?: string[];
  state?: TaskExecutionState;
  summary?: string;
  blockedReason?: string;
  takeoverSessionKey?: string;
  lastSyncedAt?: number;
}
