import { useEffect, useMemo, type MutableRefObject } from "react";
import {
  buildRequirementRoomRecordSignature,
} from "../../../application/delegation/room-routing";
import { buildConversationDraftRequirement } from "../../../application/mission/draft-requirement";
import {
  buildConversationMissionTruth,
  buildRequirementTeamRoomTruth,
  resolveConversationCurrentWorkSelection,
  shouldPersistPreviewConversationWorkItem,
  shouldResetConversationCurrentWork,
  type ConversationMissionView,
} from "../../../application/mission/conversation-truth";
import { areWorkItemRecordsEquivalent } from "../../../application/mission/work-item-equivalence";
import type { RequirementRoomRecord } from "../../../domain/delegation/types";
import type {
  ConversationStateRecord,
  ConversationMissionRecord,
  DraftRequirementRecord,
  TrackedTask,
  WorkItemRecord,
} from "../../../domain/mission/types";
import type { Company } from "../../../domain/org/types";
import type { RequirementExecutionOverview } from "../../../application/mission/requirement-overview";
import type { RequirementSessionSnapshot } from "../../../domain/mission/requirement-snapshot";
import type { ChatMessage } from "../../../application/gateway";

export function useChatConversationTruth(input: {
  isGroup: boolean;
  isCeoSession: boolean;
  sessionKey: string | null;
  isArchiveView: boolean;
  isFreshConversation: boolean;
  isRequirementBootstrapPending: boolean;
  latestMessageTimestamp: number;
  effectiveRequirementRoom: RequirementRoomRecord | null;
  requirementOverview: RequirementExecutionOverview | null;
  persistedWorkItem: WorkItemRecord | null;
  persistedConversationMission: ConversationMissionRecord | null;
  conversationMission: ConversationMissionView | null;
  hasStableConversationWorkItem: boolean;
  shouldPreferPersistedConversationMission: boolean;
  groupTopicKey: string | null | undefined;
  productRoomId: string | null;
  effectiveOwnerAgentId: string | null;
  displayNextBatonAgentId: string | null;
  missionIsCompleted: boolean;
  activeCompany: Company | null;
  authorityBackedState: boolean;
  activeRoomRecords: RequirementRoomRecord[];
  activeConversationState: ConversationStateRecord | null;
  requirementTeam:
    | {
        title: string;
        topicKey: string | null;
        memberIds: string[];
        ownerAgentId: string | null;
      }
    | null;
  groupWorkItemId: string | null;
  targetAgentId: string | null;
  effectiveRequirementRoomSnapshots: RequirementSessionSnapshot[];
  upsertMissionRecord: (mission: ConversationMissionRecord) => void;
  upsertWorkItemRecord: (workItem: WorkItemRecord) => void;
  upsertRoomRecord: (room: RequirementRoomRecord) => void;
  setConversationCurrentWorkKey: (
    conversationId: string,
    workKey: string | null,
    workItemId: string | null,
    roundId: string | null,
  ) => void;
  setConversationDraftRequirement: (
    conversationId: string,
    draftRequirement: ConversationStateRecord["draftRequirement"],
  ) => void;
  conversationStateKey: string | null;
  messages: ChatMessage[];
  structuredTaskPreview: TrackedTask | null;
  previewConversationWorkItem: WorkItemRecord | null;
  shouldPreferPreviewConversationWorkItem: boolean;
  ceoReplyExplicitlyRequestsNewTask: boolean;
  doesWorkItemMatchCurrentConversation: (workItem: WorkItemRecord) => boolean;
  lastSyncedRoomSignatureRef: MutableRefObject<string | null>;
}): {
  conversationMissionRecord: ConversationMissionRecord | null;
  shouldPersistConversationTruth: boolean;
  conversationDraftRequirement: DraftRequirementRecord | null;
} {
  const {
    isGroup,
    isCeoSession,
    sessionKey,
    isArchiveView,
    isFreshConversation,
    isRequirementBootstrapPending,
    latestMessageTimestamp,
    effectiveRequirementRoom,
    requirementOverview,
    persistedWorkItem,
    persistedConversationMission,
    conversationMission,
    hasStableConversationWorkItem,
    shouldPreferPersistedConversationMission,
    groupTopicKey,
    productRoomId,
    effectiveOwnerAgentId,
    displayNextBatonAgentId,
    missionIsCompleted,
    activeCompany,
    authorityBackedState,
    activeRoomRecords,
    activeConversationState,
    requirementTeam,
    groupWorkItemId,
    targetAgentId,
    effectiveRequirementRoomSnapshots,
    upsertMissionRecord,
    upsertWorkItemRecord,
    upsertRoomRecord,
    setConversationCurrentWorkKey,
    setConversationDraftRequirement,
    conversationStateKey,
    messages,
    structuredTaskPreview,
    previewConversationWorkItem,
    shouldPreferPreviewConversationWorkItem,
    ceoReplyExplicitlyRequestsNewTask,
    doesWorkItemMatchCurrentConversation,
    lastSyncedRoomSignatureRef,
  } = input;

  const nextDraftRequirement = useMemo(
    () =>
      buildConversationDraftRequirement({
        company: activeCompany,
        activeConversationState,
        messages,
        isGroup,
        isCeoSession,
        isArchiveView,
        hasRuntimePromotionSignal: Boolean(
          persistedWorkItem ||
            effectiveRequirementRoom ||
            activeConversationState?.currentWorkItemId ||
            activeConversationState?.currentWorkKey,
        ),
        hasMultiActorDispatchSignal: Boolean(requirementTeam && requirementTeam.memberIds.length >= 2),
        hasTaskBoardSignal: Boolean(
          (structuredTaskPreview && structuredTaskPreview.steps.length >= 2) ||
            previewConversationWorkItem ||
            activeConversationState?.currentWorkItemId ||
            activeConversationState?.currentWorkKey,
        ),
        hasRequirementTeamSignal: Boolean(requirementTeam && requirementTeam.memberIds.length >= 2),
      }),
    [
      activeCompany,
      activeConversationState,
      effectiveRequirementRoom,
      isArchiveView,
      isCeoSession,
      isGroup,
      messages,
      persistedWorkItem,
      previewConversationWorkItem,
      requirementTeam,
      structuredTaskPreview,
    ],
  );
  const allowConversationPersistence =
    isGroup ||
    !isCeoSession ||
    Boolean(persistedWorkItem || nextDraftRequirement);
  const authorityDraftRequirement =
    authorityBackedState ? activeConversationState?.draftRequirement ?? null : nextDraftRequirement;

  const conversationTruth = useMemo(
    () =>
      buildConversationMissionTruth({
        allowConversationPersistence,
        draftRequirement: authorityDraftRequirement
          ? {
              state: authorityDraftRequirement.state,
              promotionReason: authorityDraftRequirement.promotionReason ?? null,
              stageGateStatus: authorityDraftRequirement.stageGateStatus ?? null,
            }
          : null,
        isGroup,
        isCeoSession,
        sessionKey,
        isArchiveView,
        isFreshConversation,
        isRequirementBootstrapPending,
        latestMessageTimestamp,
        effectiveRequirementRoom,
        requirementOverview,
        persistedWorkItem,
        persistedConversationMission,
        conversationMission,
        hasStableConversationWorkItem,
        shouldPreferPersistedConversationMission,
        groupTopicKey,
        productRoomId,
        effectiveOwnerAgentId,
        displayNextBatonAgentId,
        missionIsCompleted,
      }),
    [
      authorityBackedState,
      authorityDraftRequirement,
      conversationMission,
      displayNextBatonAgentId,
      effectiveOwnerAgentId,
      effectiveRequirementRoom,
      groupTopicKey,
      hasStableConversationWorkItem,
      allowConversationPersistence,
      isArchiveView,
      isCeoSession,
      isFreshConversation,
      isGroup,
      isRequirementBootstrapPending,
      latestMessageTimestamp,
      missionIsCompleted,
      persistedConversationMission,
      persistedWorkItem,
      productRoomId,
      requirementOverview,
      sessionKey,
      shouldPreferPersistedConversationMission,
    ],
  );
  const {
    shouldPersistConversationTruth,
    conversationMissionRecord,
    conversationMissionRecordSignature,
  } = conversationTruth;
  const shouldPersistPreviewConversationWorkItemRecord = useMemo(
    () =>
      Boolean(
        previewConversationWorkItem &&
          (!persistedWorkItem ||
            !areWorkItemRecordsEquivalent(previewConversationWorkItem, persistedWorkItem)),
      ),
    [persistedWorkItem, previewConversationWorkItem],
  );
  const shouldPersistPreviewWorkItem = useMemo(
    () =>
      shouldPersistPreviewConversationWorkItem({
        shouldPersistConversationTruth,
        activeCompany,
        previewConversationWorkItem,
        shouldPreferPreviewConversationWorkItem,
      }) && shouldPersistPreviewConversationWorkItemRecord,
    [
      activeCompany,
      previewConversationWorkItem,
      shouldPersistConversationTruth,
      shouldPersistPreviewConversationWorkItemRecord,
      shouldPreferPreviewConversationWorkItem,
    ],
  );
  const nextRequirementTeamRoomRecord = useMemo(
    () =>
      authorityBackedState
        ? null
        : buildRequirementTeamRoomTruth({
            activeCompany,
            requirementTeam,
            isFreshConversation,
            isRequirementBootstrapPending,
            persistedWorkItem,
            groupWorkItemId,
            conversationMissionRecord,
            activeRoomRecords,
            effectiveOwnerAgentId,
            targetAgentId,
            effectiveRequirementRoomSnapshots,
          }),
    [
      activeCompany,
      activeRoomRecords,
      authorityBackedState,
      conversationMissionRecord,
      effectiveOwnerAgentId,
      effectiveRequirementRoomSnapshots,
      groupWorkItemId,
      isFreshConversation,
      isRequirementBootstrapPending,
      persistedWorkItem,
      requirementTeam,
      targetAgentId,
    ],
  );
  const shouldClearConversationCurrentWork = useMemo(
    () =>
      shouldResetConversationCurrentWork({
        conversationStateKey,
        ceoReplyExplicitlyRequestsNewTask,
        isArchiveView,
      }),
    [ceoReplyExplicitlyRequestsNewTask, conversationStateKey, isArchiveView],
  );
  const currentConversationWorkSelection = useMemo(
    () =>
      resolveConversationCurrentWorkSelection({
        conversationStateKey,
        persistedWorkItem,
        isArchiveView,
        isGroup,
        isCeoSession,
        previewConversationWorkItem,
        doesWorkItemMatchCurrentConversation,
      }),
    [
      conversationStateKey,
      doesWorkItemMatchCurrentConversation,
      isArchiveView,
      isCeoSession,
      isGroup,
      persistedWorkItem,
      previewConversationWorkItem,
    ],
  );

  useEffect(() => {
    if (
      authorityBackedState ||
      !conversationStateKey ||
      isGroup ||
      !isCeoSession ||
      isArchiveView
    ) {
      return;
    }
    setConversationDraftRequirement(conversationStateKey, nextDraftRequirement ?? null);
  }, [
    authorityBackedState,
    conversationStateKey,
    isArchiveView,
    isCeoSession,
    isGroup,
    nextDraftRequirement,
    setConversationDraftRequirement,
  ]);

  useEffect(() => {
    if (!shouldPersistConversationTruth || !conversationMissionRecord) {
      return;
    }
    upsertMissionRecord(conversationMissionRecord);
  }, [
    conversationMissionRecord,
    conversationMissionRecordSignature,
    upsertMissionRecord,
    shouldPersistConversationTruth,
  ]);

  useEffect(() => {
    if (
      authorityBackedState ||
      !shouldPersistPreviewWorkItem ||
      !previewConversationWorkItem
    ) {
      return;
    }
    upsertWorkItemRecord(previewConversationWorkItem);
    if (conversationStateKey) {
      setConversationCurrentWorkKey(
        conversationStateKey,
        previewConversationWorkItem.workKey,
        previewConversationWorkItem.id,
        previewConversationWorkItem.roundId,
      );
    }
  }, [
    activeCompany,
    authorityBackedState,
    conversationStateKey,
    previewConversationWorkItem,
    setConversationCurrentWorkKey,
    shouldPersistPreviewWorkItem,
    upsertWorkItemRecord,
  ]);

  useEffect(() => {
    if (!nextRequirementTeamRoomRecord) {
      return;
    }
    const nextRoomSignature = buildRequirementRoomRecordSignature(nextRequirementTeamRoomRecord);
    const existingRoom =
      activeRoomRecords.find(
        (room) =>
          room.id === nextRequirementTeamRoomRecord.id ||
          room.workItemId === nextRequirementTeamRoomRecord.workItemId,
      ) ?? null;
    const existingRoomSignature = buildRequirementRoomRecordSignature(existingRoom);

    if (
      nextRoomSignature === lastSyncedRoomSignatureRef.current ||
      (existingRoom && existingRoomSignature === nextRoomSignature)
    ) {
      return;
    }

    lastSyncedRoomSignatureRef.current = nextRoomSignature;
    upsertRoomRecord(nextRequirementTeamRoomRecord);
  }, [
    activeRoomRecords,
    lastSyncedRoomSignatureRef,
    nextRequirementTeamRoomRecord,
    upsertRoomRecord,
  ]);

  useEffect(() => {
    if (authorityBackedState) {
      return;
    }
    if (!shouldClearConversationCurrentWork || !conversationStateKey) {
      return;
    }
    setConversationCurrentWorkKey(conversationStateKey, null, null, null);
  }, [
    authorityBackedState,
    conversationStateKey,
    setConversationCurrentWorkKey,
    shouldClearConversationCurrentWork,
  ]);

  useEffect(() => {
    if (authorityBackedState) {
      return;
    }
    if (!conversationStateKey || !currentConversationWorkSelection) {
      return;
    }
    setConversationCurrentWorkKey(
      conversationStateKey,
      currentConversationWorkSelection.workKey,
      currentConversationWorkSelection.workItemId,
      currentConversationWorkSelection.roundId,
    );
  }, [
    authorityBackedState,
    conversationStateKey,
    currentConversationWorkSelection,
    setConversationCurrentWorkKey,
  ]);

  return {
    conversationMissionRecord,
    shouldPersistConversationTruth,
    conversationDraftRequirement: authorityDraftRequirement,
  };
}
