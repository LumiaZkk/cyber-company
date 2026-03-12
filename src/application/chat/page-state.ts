import { isVisibleRequirementRoomMessage } from "../delegation/room-routing";
import type { RequirementRoomRecord } from "../../domain/delegation/types";
import type { WorkItemRecord } from "../../domain/mission/types";

export type ChatPageStateInput = {
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
  actionWatchesLength: number;
  isCeoSession: boolean;
  effectiveRequirementRoom: RequirementRoomRecord | null;
  roomBoundWorkItem: WorkItemRecord | null;
  persistedWorkItem: WorkItemRecord | null;
};

export type ChatPageState = {
  canShowSessionHistory: boolean;
  archiveSectionNotice: string | null;
  shouldRunCompanySync: boolean;
  companySyncIntervalMs: number;
  emptyStateText: string;
};

const COMPANY_SYNC_FALLBACK_INTERVAL_MS = 5 * 60 * 1000;

export function buildChatPageState(input: ChatPageStateInput): ChatPageState {
  const canShowSessionHistory =
    !input.isGroup &&
    Boolean(
      input.sessionKey ||
        input.recentAgentSessionsLength > 0 ||
        input.historyRoundItemsLength > 0 ||
        input.archiveHistoryNotice,
    );

  const archiveSectionNotice =
    input.historyRoundItemsLength > 0 && input.archiveHistoryNotice
      ? `当前已显示已归档轮次。${input.archiveHistoryNotice}`
      : input.archiveHistoryNotice;

  const shouldRunCompanySync = Boolean(
    !input.authorityBackedState &&
      input.hasActiveCompany &&
      input.connected &&
      input.isPageVisible &&
      !input.isArchiveView,
  );
  const companySyncIntervalMs = COMPANY_SYNC_FALLBACK_INTERVAL_MS;

  const hasRequirementRoomActivity = Boolean(
    (input.effectiveRequirementRoom?.transcript.some((message) => isVisibleRequirementRoomMessage(message)) ??
      false) ||
      input.effectiveRequirementRoom?.lastConclusionAt ||
      (input.effectiveRequirementRoom?.progress && input.effectiveRequirementRoom.progress !== "0 条可见消息"),
  );
  const displayWorkItem = input.roomBoundWorkItem ?? input.persistedWorkItem;

  const emptyStateText =
    input.isGroup && (hasRequirementRoomActivity || Boolean(displayWorkItem))
      ? displayWorkItem?.displaySummary ||
        displayWorkItem?.displayNextAction ||
        "这间需求团队房间已经绑定到当前主线任务，继续在这里 @成员推进即可。"
      : "作为老板，请下达您的第一项指示";

  return {
    canShowSessionHistory,
    archiveSectionNotice,
    shouldRunCompanySync,
    companySyncIntervalMs,
    emptyStateText,
  };
}
