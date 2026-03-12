import { useMemo } from "react";
import { buildChatPageState } from "../../../application/chat/page-state";
import type { RequirementTeamMember, RequirementTeamView } from "../../../application/assignment/requirement-team";
import type { FocusProgressEvent } from "../../../application/governance/chat-progress";
import type { RequirementRoomRecord } from "../../../domain/delegation/types";
import type { WorkItemRecord } from "../../../domain/mission/types";
import { type ChatMessage } from "../../../application/gateway";
import { type FocusActionButton, type FocusActionWatch } from "../view-models/focus";
import { buildChatDisplayItems } from "../view-models/messages";
import {
  buildActionWatchCards,
  buildLatestProgressDisplay,
  buildProgressGroupSummary,
  buildTeamMemberCards,
  type RequirementProgressGroups,
} from "../view-models/summary-cards";

type UseChatPageSurfaceInput = {
  authorityBackedState: boolean;
  isGroup: boolean;
  sessionKey: string | null;
  recentAgentSessionsLength: number;
  historyRoundItemsLength: number;
  archiveHistoryNotice: string | null;
  hasActiveCompany: boolean;
  connected: boolean;
  isPageVisible: boolean;
  isArchiveView: boolean;
  isSummaryOpen: boolean;
  actionWatches: FocusActionWatch[];
  isCeoSession: boolean;
  effectiveRequirementRoom: RequirementRoomRecord | null;
  roomBoundWorkItem: WorkItemRecord | null;
  persistedWorkItem: WorkItemRecord | null;
  messages: ChatMessage[];
  displayWindowSize: number;
  displayRequirementProgressGroups: RequirementProgressGroups | null;
  latestProgressEvent: FocusProgressEvent | null;
  runningFocusActionId: string | null;
  requirementTeam: RequirementTeamView | null;
  buildTeamAdjustmentAction: (member: RequirementTeamMember) => FocusActionButton;
  isGenerating: boolean;
  streamText: string | null;
};

export function useChatPageSurface(input: UseChatPageSurfaceInput) {
  const pageState = useMemo(
    () =>
      buildChatPageState({
        authorityBackedState: input.authorityBackedState,
        isGroup: input.isGroup,
        sessionKey: input.sessionKey,
        recentAgentSessionsLength: input.recentAgentSessionsLength,
        historyRoundItemsLength: input.historyRoundItemsLength,
        archiveHistoryNotice: input.archiveHistoryNotice,
        hasActiveCompany: input.hasActiveCompany,
        connected: input.connected,
        isPageVisible: input.isPageVisible,
        isArchiveView: input.isArchiveView,
        isSummaryOpen: input.isSummaryOpen,
        actionWatchesLength: input.actionWatches.length,
        isCeoSession: input.isCeoSession,
        effectiveRequirementRoom: input.effectiveRequirementRoom,
        roomBoundWorkItem: input.roomBoundWorkItem,
        persistedWorkItem: input.persistedWorkItem,
      }),
    [
      input.actionWatches.length,
      input.archiveHistoryNotice,
      input.authorityBackedState,
      input.connected,
      input.effectiveRequirementRoom,
      input.hasActiveCompany,
      input.historyRoundItemsLength,
      input.isArchiveView,
      input.isCeoSession,
      input.isGroup,
      input.isPageVisible,
      input.isSummaryOpen,
      input.persistedWorkItem,
      input.recentAgentSessionsLength,
      input.roomBoundWorkItem,
      input.sessionKey,
    ],
  );

  const displayItems = useMemo(
    () => buildChatDisplayItems(input.messages),
    [input.messages],
  );
  const hiddenDisplayItemCount = Math.max(0, displayItems.length - input.displayWindowSize);
  const visibleDisplayItems = useMemo(
    () => (hiddenDisplayItemCount > 0 ? displayItems.slice(-input.displayWindowSize) : displayItems),
    [displayItems, hiddenDisplayItemCount, input.displayWindowSize],
  );

  const progressGroupSummary = useMemo(
    () => buildProgressGroupSummary(input.displayRequirementProgressGroups),
    [input.displayRequirementProgressGroups],
  );
  const latestProgressDisplay = useMemo(
    () => buildLatestProgressDisplay(input.latestProgressEvent),
    [input.latestProgressEvent],
  );
  const actionWatchCards = useMemo(
    () => buildActionWatchCards(input.actionWatches),
    [input.actionWatches],
  );
  const hasActiveRun = input.isGenerating || Boolean(input.streamText);
  const teamMemberCards = useMemo(
    () =>
      buildTeamMemberCards(
        input.requirementTeam,
        input.runningFocusActionId,
        input.buildTeamAdjustmentAction,
      ),
    [
      input.buildTeamAdjustmentAction,
      input.requirementTeam,
      input.runningFocusActionId,
    ],
  );

  return {
    ...pageState,
    displayItems,
    hiddenDisplayItemCount,
    visibleDisplayItems,
    progressGroupSummary,
    latestProgressDisplay,
    actionWatchCards,
    hasActiveRun,
    teamMemberCards,
  };
}
