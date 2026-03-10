import type { StrategicDirectParticipantView } from "../assignment/chat-participants";
import type { RequirementTeamView } from "../assignment/requirement-team";
import type { RequirementRoomSummaryView } from "../delegation/chat-room-summary";
import type { FocusProgressTone, StageGateSnapshot } from "../governance/chat-progress";
import type { TaskPlanOverview } from "../mission/chat-mission-surface";
import type { WorkItemPrimaryView } from "../mission/conversation-work-item-view";
import type {
  RequirementExecutionOverview,
  RequirementParticipantProgress,
} from "../mission/requirement-overview";
import type { RequirementRoomRecord } from "../../domain/delegation/types";
import type { ConversationMissionRecord, WorkItemRecord } from "../../domain/mission/types";
import type { Company } from "../../domain/org/types";
import type { FocusActionButton, FocusActionWatch } from "./focus-actions";

export type RequirementProgressGroups = {
  working: RequirementParticipantProgress[];
  waiting: RequirementParticipantProgress[];
  completed: RequirementParticipantProgress[];
};

export type RequirementLifecycleSection = {
  id: string;
  title: string;
  summary: string;
  items: RequirementParticipantProgress[];
};

export type BuildChatActionSurfaceInput = {
  activeCompany: Company | null;
  activeRoomRecords: RequirementRoomRecord[];
  linkedRequirementRoom: RequirementRoomRecord | null;
  stableDisplayWorkItem: WorkItemRecord | null;
  stableDisplayPrimaryView: WorkItemPrimaryView | null;
  strategicDirectParticipantView: StrategicDirectParticipantView | null;
  requirementOverview: RequirementExecutionOverview | null;
  requirementProgressGroups: RequirementProgressGroups | null;
  requirementRoomSummary: RequirementRoomSummaryView | null;
  requirementTeam: RequirementTeamView | null;
  persistedWorkItem: WorkItemRecord | null;
  conversationMissionRecord: ConversationMissionRecord | null;
  groupWorkItemId: string | null;
  groupTopicKey: string | null;
  targetAgentId: string | null;
  sessionKey: string | null;
  isGroup: boolean;
  isCeoSession: boolean;
  isFreshConversation: boolean;
  isRequirementBootstrapPending: boolean;
  isSummaryOpen: boolean;
  summaryPanelView: "owner" | "team" | "debug";
  currentTime: number;
  actionWatches: FocusActionWatch[];
  workbenchOpenAction: FocusActionButton | null;
  focusActions: FocusActionButton[];
  summaryRecoveryAction: FocusActionButton | null;
  latestStageGate: StageGateSnapshot | null;
  taskPlanOverview: TaskPlanOverview | null;
  displayPlanCurrentStep: TaskPlanOverview["currentStep"];
  canonicalNextBatonAgentId: string | null;
  canonicalNextBatonLabel: string;
  displayNextBatonLabel: string;
  displayNextBatonAgentId: string | null;
  missionIsCompleted: boolean;
  shouldUseTaskPlanPrimaryView: boolean;
  effectiveOwnerAgentId: string | null;
  effectiveOwnerLabel: string;
  effectiveStage: string;
  effectiveStatusLabel: string;
  effectiveSummary: string;
  effectiveActionHint: string;
  effectiveHeadline: string;
  effectiveTone: FocusProgressTone;
  shouldAdvanceToNextPhase: boolean;
  shouldDispatchPublish: boolean;
  shouldDirectToTechDispatch: boolean;
  publishDispatchTargetAgentId: string | null;
  publishDispatchTargetLabel: string;
  requirementTechParticipant: RequirementParticipantProgress | null;
  focusSummaryOwnerRole: string | null;
};
