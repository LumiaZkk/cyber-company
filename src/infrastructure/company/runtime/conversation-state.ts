import { persistConversationStateRecords } from "../persistence/conversation-state-persistence";
import {
  appendRequirementLocalEvidence,
  emitRequirementCompanyEvent,
  persistActiveRequirementAggregates,
  persistActiveRequirementEvidence,
  reconcileActiveRequirementState,
} from "./requirements";
import type { CompanyRuntimeState, ConversationStateRecord, RuntimeGet, RuntimeSet } from "./types";

export function persistActiveConversationStates(
  companyId: string | null | undefined,
  states: ConversationStateRecord[],
) {
  persistConversationStateRecords(companyId, states);
}

export function areConversationStateRecordsEquivalent(
  left: ConversationStateRecord,
  right: ConversationStateRecord,
): boolean {
  return (
    left.companyId === right.companyId &&
    left.conversationId === right.conversationId &&
    (left.currentWorkKey ?? null) === (right.currentWorkKey ?? null) &&
    (left.currentWorkItemId ?? null) === (right.currentWorkItemId ?? null) &&
    (left.currentRoundId ?? null) === (right.currentRoundId ?? null) &&
    JSON.stringify(left.draftRequirement ?? null) === JSON.stringify(right.draftRequirement ?? null)
  );
}

export function buildConversationStateActions(
  set: RuntimeSet,
  get: RuntimeGet,
): Pick<
  CompanyRuntimeState,
  "setConversationCurrentWorkKey" | "setConversationDraftRequirement" | "clearConversationState"
> {
  function upsertConversationStateRecord(
    conversationId: string,
    nextRecordPartial: Partial<ConversationStateRecord>,
  ) {
    const {
      activeCompany,
      activeConversationStates,
      activeRequirementAggregates,
      activeRequirementEvidence,
      activeRoomRecords,
      activeWorkItems,
      primaryRequirementId,
    } = get();
    if (!activeCompany || !conversationId) {
      return false;
    }

    const nextRecord: ConversationStateRecord = {
      companyId: activeCompany.id,
      conversationId,
      updatedAt: Date.now(),
      ...nextRecordPartial,
    };
    const next = [...activeConversationStates];
    const index = next.findIndex((record) => record.conversationId === conversationId);
    if (index >= 0) {
      const existing = next[index]!;
      const merged: ConversationStateRecord = {
        ...existing,
        ...nextRecord,
        companyId: activeCompany.id,
      };
      if (areConversationStateRecordsEquivalent(existing, merged)) {
        return false;
      }
      next[index] = merged;
    } else {
      next.push({
        ...nextRecord,
        currentWorkKey: nextRecord.currentWorkKey ?? null,
        currentWorkItemId: nextRecord.currentWorkItemId ?? null,
        currentRoundId: nextRecord.currentRoundId ?? null,
        draftRequirement: nextRecord.draftRequirement ?? null,
      });
    }
    const sorted = next.sort((left, right) => right.updatedAt - left.updatedAt);
    const reconciledRequirements = reconcileActiveRequirementState({
      companyId: activeCompany.id,
      activeRequirementAggregates,
      primaryRequirementId,
      activeConversationStates: sorted,
      activeWorkItems,
      activeRoomRecords,
      activeRequirementEvidence,
    });
    const previousPrimaryAggregate =
      primaryRequirementId
        ? activeRequirementAggregates.find((aggregate) => aggregate.id === primaryRequirementId) ?? null
        : null;
    const nextPrimaryAggregate =
      reconciledRequirements.primaryRequirementId
        ? reconciledRequirements.activeRequirementAggregates.find(
            (aggregate) => aggregate.id === reconciledRequirements.primaryRequirementId,
          ) ?? null
        : null;
    const nextEvidence =
      nextPrimaryAggregate && reconciledRequirements.primaryRequirementId !== primaryRequirementId
        ? appendRequirementLocalEvidence({
            companyId: activeCompany.id,
            evidence: activeRequirementEvidence,
            eventType: "requirement_promoted",
            aggregate: nextPrimaryAggregate,
            previousAggregate: previousPrimaryAggregate,
            actorId: nextPrimaryAggregate.ownerActorId,
            timestamp: nextRecord.updatedAt,
            source: "backfill",
          })
        : activeRequirementEvidence;
    set({
      activeConversationStates: sorted,
      activeRequirementAggregates: reconciledRequirements.activeRequirementAggregates,
      activeRequirementEvidence: nextEvidence,
      primaryRequirementId: reconciledRequirements.primaryRequirementId,
    });
    persistActiveConversationStates(activeCompany.id, sorted);
    persistActiveRequirementAggregates(activeCompany.id, reconciledRequirements.activeRequirementAggregates);
    if (nextEvidence !== activeRequirementEvidence) {
      persistActiveRequirementEvidence(activeCompany.id, nextEvidence);
    }
    if (nextPrimaryAggregate && reconciledRequirements.primaryRequirementId !== primaryRequirementId) {
      emitRequirementCompanyEvent({
        companyId: activeCompany.id,
        kind: "requirement_promoted",
        aggregate: nextPrimaryAggregate,
        actorId: nextPrimaryAggregate.ownerActorId,
        previousAggregate: previousPrimaryAggregate,
        source: "backfill",
      });
    }
    return true;
  }

  return {
    setConversationCurrentWorkKey: (conversationId, workKey, workItemId, roundId) => {
      upsertConversationStateRecord(conversationId, {
        currentWorkKey: workKey ?? null,
        currentWorkItemId: workItemId ?? null,
        currentRoundId: roundId ?? null,
      });
    },

    setConversationDraftRequirement: (conversationId, draftRequirement) => {
      upsertConversationStateRecord(conversationId, {
        draftRequirement: draftRequirement ?? null,
      });
    },

    clearConversationState: (conversationId) => {
      const {
        activeCompany,
        activeConversationStates,
        activeRequirementAggregates,
        activeRequirementEvidence,
        activeRoomRecords,
        activeWorkItems,
        primaryRequirementId,
      } = get();
      if (!activeCompany || !conversationId) {
        return;
      }
      const next = activeConversationStates.filter((record) => record.conversationId !== conversationId);
      if (next.length === activeConversationStates.length) {
        return;
      }
      const reconciledRequirements = reconcileActiveRequirementState({
        companyId: activeCompany.id,
        activeRequirementAggregates,
        primaryRequirementId,
        activeConversationStates: next,
        activeWorkItems,
        activeRoomRecords,
        activeRequirementEvidence,
      });
      set({
        activeConversationStates: next,
        activeRequirementAggregates: reconciledRequirements.activeRequirementAggregates,
        primaryRequirementId: reconciledRequirements.primaryRequirementId,
      });
      persistActiveConversationStates(activeCompany.id, next);
      persistActiveRequirementAggregates(activeCompany.id, reconciledRequirements.activeRequirementAggregates);
    },
  };
}
