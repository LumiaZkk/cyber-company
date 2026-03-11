import { buildRoomRecordIdFromWorkItem, pickWorkItemRecord } from "./work-item";
import { reconcileWorkItemRecord } from "./work-item-reconciler";
import { isReliableRequirementOverview } from "./work-item-signal";
import { isStrategicRequirementTopic } from "./requirement-kind";
import { buildWorkItemPrimaryView, type WorkItemPrimaryView } from "./conversation-work-item-view";
import type { RequirementExecutionOverview } from "./requirement-overview";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import type { Company } from "../../domain/org/types";
import type { RequirementRoomRecord } from "../../domain/delegation/types";
import type { WorkItemRecord } from "../../domain/mission/types";

type BuildChatWorkItemStateInput = {
  activeCompany: Company | null;
  activeRequirementRoom: RequirementRoomRecord | null;
  activeRoomRecords: RequirementRoomRecord[];
  activeWorkItems: WorkItemRecord[];
  canonicalWorkItems: WorkItemRecord[];
  requirementRoomSnapshots: RequirementSessionSnapshot[];
  requirementRoomSnapshotAgentIds: string[];
  companySessionSnapshots: RequirementSessionSnapshot[];
  rawConversationRequirementOverview: RequirementExecutionOverview | null;
  requirementOverview: RequirementExecutionOverview | null;
  effectiveStableConversationWorkItem: WorkItemRecord | null;
  latestStrategicCanonicalWorkItem: WorkItemRecord | null;
  latestOpenCanonicalWorkItem: WorkItemRecord | null;
  preferredConversationTopicKey: string | null;
  preferredConversationWorkKey: string | null;
  sessionKey: string | null;
  productRoomId: string | null;
  groupTopicKey: string | null;
  groupWorkItemId: string | null;
  isGroup: boolean;
  isCeoSession: boolean;
  isFreshConversation: boolean;
  isRequirementBootstrapPending: boolean;
  ceoReplyExplicitlyRequestsNewTask: boolean;
  hasDirectConversationWorkSignal: boolean;
  shouldReplaceLockedConversationWorkItem: boolean;
  shouldPreferStrategicOverviewOverStableConversationWorkItem: boolean;
};

export type ChatWorkItemState = {
  previewConversationWorkItem: WorkItemRecord | null;
  shouldPreferPreviewConversationWorkItem: boolean;
  shouldForcePreviewConversationWorkItem: boolean;
  persistedWorkItem: WorkItemRecord | null;
  linkedRequirementRoom: RequirementRoomRecord | null;
  effectiveRequirementRoom: RequirementRoomRecord | null;
  roomBoundWorkItem: WorkItemRecord | null;
  stableDisplayWorkItem: WorkItemRecord | null;
  effectiveRequirementRoomSnapshots: RequirementSessionSnapshot[];
  workItemPrimaryView: WorkItemPrimaryView | null;
  hasStableConversationWorkItem: boolean;
  shouldUsePersistedWorkItemPrimaryView: boolean;
  stableDisplayPrimaryView: WorkItemPrimaryView | null;
};

export function doesConversationWorkItemMatch(input: {
  item: WorkItemRecord | null | undefined;
  preferredConversationTopicKey: string | null;
  preferredConversationWorkKey: string | null;
}): boolean {
  if (!input.item) {
    return false;
  }
  if (!input.preferredConversationTopicKey) {
    return true;
  }
  return (
    input.item.topicKey === input.preferredConversationTopicKey ||
    input.item.workKey === input.preferredConversationWorkKey ||
    input.item.id === input.preferredConversationWorkKey
  );
}

function shouldPreferPreviewConversationWorkItem(input: {
  previewConversationWorkItem: WorkItemRecord | null;
  effectiveStableConversationWorkItem: WorkItemRecord | null;
  shouldPreferStrategicOverviewOverStableConversationWorkItem: boolean;
}): boolean {
  const {
    previewConversationWorkItem,
    effectiveStableConversationWorkItem,
    shouldPreferStrategicOverviewOverStableConversationWorkItem,
  } = input;
  if (!previewConversationWorkItem) {
    return false;
  }
  if (shouldPreferStrategicOverviewOverStableConversationWorkItem) {
    return true;
  }
  if (!effectiveStableConversationWorkItem) {
    return true;
  }

  const sameMainline =
    previewConversationWorkItem.id === effectiveStableConversationWorkItem.id ||
    previewConversationWorkItem.workKey === effectiveStableConversationWorkItem.workKey ||
    (previewConversationWorkItem.topicKey &&
      previewConversationWorkItem.topicKey === effectiveStableConversationWorkItem.topicKey);
  if (!sameMainline) {
    return false;
  }

  return (
    previewConversationWorkItem.title !== effectiveStableConversationWorkItem.title ||
    previewConversationWorkItem.headline !== effectiveStableConversationWorkItem.headline ||
    previewConversationWorkItem.displayStage !== effectiveStableConversationWorkItem.displayStage ||
    previewConversationWorkItem.displaySummary !== effectiveStableConversationWorkItem.displaySummary ||
    previewConversationWorkItem.displayOwnerLabel !== effectiveStableConversationWorkItem.displayOwnerLabel ||
    previewConversationWorkItem.displayNextAction !== effectiveStableConversationWorkItem.displayNextAction ||
    previewConversationWorkItem.ownerActorId !== effectiveStableConversationWorkItem.ownerActorId ||
    previewConversationWorkItem.batonActorId !== effectiveStableConversationWorkItem.batonActorId ||
    previewConversationWorkItem.status !== effectiveStableConversationWorkItem.status
  );
}

export function buildChatWorkItemState(input: BuildChatWorkItemStateInput): ChatWorkItemState {
  const previewConversationWorkItem =
    input.activeCompany &&
    !input.isGroup &&
    !input.ceoReplyExplicitlyRequestsNewTask &&
    isReliableRequirementOverview(input.rawConversationRequirementOverview ?? input.requirementOverview)
      ? reconcileWorkItemRecord({
          companyId: input.activeCompany.id,
          company: input.activeCompany,
          existingWorkItem: input.effectiveStableConversationWorkItem,
          overview: input.rawConversationRequirementOverview ?? input.requirementOverview,
          fallbackSessionKey: input.sessionKey,
          fallbackRoomId: input.productRoomId,
        })
      : null;

  const shouldPreferPreview = shouldPreferPreviewConversationWorkItem({
    previewConversationWorkItem,
    effectiveStableConversationWorkItem: input.effectiveStableConversationWorkItem,
    shouldPreferStrategicOverviewOverStableConversationWorkItem:
      input.shouldPreferStrategicOverviewOverStableConversationWorkItem,
  });
  const shouldForcePreview = Boolean(
    !input.isGroup &&
      input.isCeoSession &&
      previewConversationWorkItem &&
      isStrategicRequirementTopic(previewConversationWorkItem.topicKey) &&
      (!input.effectiveStableConversationWorkItem ||
        !doesConversationWorkItemMatch({
          item: input.effectiveStableConversationWorkItem,
          preferredConversationTopicKey: input.preferredConversationTopicKey,
          preferredConversationWorkKey: input.preferredConversationWorkKey,
        }) ||
        input.effectiveStableConversationWorkItem.kind !== "strategic" ||
        shouldPreferPreview ||
        input.shouldPreferStrategicOverviewOverStableConversationWorkItem ||
        input.shouldReplaceLockedConversationWorkItem),
  );

  const persistedWorkItem = (() => {
    if (input.ceoReplyExplicitlyRequestsNewTask) {
      return null;
    }
    if (previewConversationWorkItem && (shouldForcePreview || shouldPreferPreview)) {
      return previewConversationWorkItem;
    }
    if (
      input.effectiveStableConversationWorkItem &&
      (!input.isCeoSession ||
        input.isGroup ||
        doesConversationWorkItemMatch({
          item: input.effectiveStableConversationWorkItem,
          preferredConversationTopicKey: input.preferredConversationTopicKey,
          preferredConversationWorkKey: input.preferredConversationWorkKey,
        }))
    ) {
      return input.effectiveStableConversationWorkItem;
    }

    const matched = pickWorkItemRecord({
      items: input.canonicalWorkItems,
      sessionKey: input.sessionKey,
      roomId: input.productRoomId,
      topicKey: input.requirementOverview?.topicKey ?? input.groupTopicKey ?? null,
      startedAt: input.requirementOverview?.startedAt ?? input.activeRequirementRoom?.createdAt ?? null,
    });
    if (
      matched &&
      !(
        input.shouldPreferStrategicOverviewOverStableConversationWorkItem &&
        matched.kind === "execution"
      ) &&
      (!input.isCeoSession ||
        input.isGroup ||
        doesConversationWorkItemMatch({
          item: matched,
          preferredConversationTopicKey: input.preferredConversationTopicKey,
          preferredConversationWorkKey: input.preferredConversationWorkKey,
        }))
    ) {
      return matched;
    }
    if (previewConversationWorkItem) {
      return previewConversationWorkItem;
    }
    if (!input.isGroup && input.isCeoSession) {
      if (input.ceoReplyExplicitlyRequestsNewTask || !input.hasDirectConversationWorkSignal) {
        return null;
      }
      const compatibleFallback =
        [input.latestStrategicCanonicalWorkItem, input.latestOpenCanonicalWorkItem].find((item) =>
          doesConversationWorkItemMatch({
            item,
            preferredConversationTopicKey: input.preferredConversationTopicKey,
            preferredConversationWorkKey: input.preferredConversationWorkKey,
          }),
        ) ?? null;
      return input.shouldReplaceLockedConversationWorkItem
        ? compatibleFallback
        : compatibleFallback ?? input.latestStrategicCanonicalWorkItem ?? input.latestOpenCanonicalWorkItem;
    }
    return input.latestOpenCanonicalWorkItem;
  })();

  const linkedRequirementRoom =
    persistedWorkItem
      ? input.activeRoomRecords.find(
          (room) =>
            room.id === persistedWorkItem.roomId ||
            room.workItemId === persistedWorkItem.id ||
            room.id === buildRoomRecordIdFromWorkItem(persistedWorkItem.id),
        ) ?? null
      : null;
  const effectiveRequirementRoom = input.activeRequirementRoom ?? linkedRequirementRoom ?? null;
  const roomBoundWorkItem =
    effectiveRequirementRoom?.workItemId
      ? input.activeWorkItems.find(
          (item) =>
            item.id === effectiveRequirementRoom.workItemId ||
            item.workKey === effectiveRequirementRoom.workItemId,
        ) ?? null
      : null;
  const stableDisplayWorkItem =
    input.isGroup || input.isFreshConversation || input.isRequirementBootstrapPending
      ? null
      : persistedWorkItem ?? roomBoundWorkItem ?? null;

  const effectiveRequirementRoomSnapshots = (() => {
    if (!input.isGroup) {
      return input.requirementRoomSnapshots;
    }
    const augmentedActorIds = new Set(input.requirementRoomSnapshotAgentIds);
    if (persistedWorkItem?.ownerActorId) {
      augmentedActorIds.add(persistedWorkItem.ownerActorId);
    }
    if (persistedWorkItem?.batonActorId) {
      augmentedActorIds.add(persistedWorkItem.batonActorId);
    }
    if (augmentedActorIds.size === input.requirementRoomSnapshotAgentIds.length) {
      return input.requirementRoomSnapshots;
    }
    return input.companySessionSnapshots
      .filter((snapshot) => augmentedActorIds.has(snapshot.agentId))
      .sort((left, right) => left.updatedAt - right.updatedAt);
  })();

  const workItemPrimaryView =
    !input.isGroup && !input.isFreshConversation && !input.isRequirementBootstrapPending
      ? buildWorkItemPrimaryView({
          company: input.activeCompany,
          workItem: stableDisplayWorkItem,
        })
      : null;
  const hasStableConversationWorkItem = Boolean(!input.isGroup && stableDisplayWorkItem);
  const shouldUsePersistedWorkItemPrimaryView = hasStableConversationWorkItem;
  const stableDisplayPrimaryView =
    !input.isGroup &&
    !input.isFreshConversation &&
    !input.isRequirementBootstrapPending &&
    workItemPrimaryView &&
    stableDisplayWorkItem
      ? workItemPrimaryView
      : null;

  return {
    previewConversationWorkItem,
    shouldPreferPreviewConversationWorkItem: shouldPreferPreview,
    shouldForcePreviewConversationWorkItem: shouldForcePreview,
    persistedWorkItem,
    linkedRequirementRoom,
    effectiveRequirementRoom,
    roomBoundWorkItem,
    stableDisplayWorkItem,
    effectiveRequirementRoomSnapshots,
    workItemPrimaryView,
    hasStableConversationWorkItem,
    shouldUsePersistedWorkItemPrimaryView,
    stableDisplayPrimaryView,
  };
}
