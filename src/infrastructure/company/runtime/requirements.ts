import { createCompanyEvent } from "../../../domain/delegation/events";
import { gateway } from "../../../application/gateway";
import {
  buildRequirementWorkflowEvidence,
  resolveRequirementWorkflowEventKind,
  type RequirementWorkflowEventKind,
} from "../../../application/mission/requirement-workflow";
import {
  applyRequirementEvidenceToAggregates,
  reconcileRequirementAggregateState,
  sanitizeRequirementAggregateRecords,
} from "../../../application/mission/requirement-aggregate";
import {
  loadRequirementAggregateRecords,
  persistRequirementAggregateRecords,
} from "../persistence/requirement-aggregate-persistence";
import {
  loadRequirementEvidenceEvents,
  persistRequirementEvidenceEvents,
  sanitizeRequirementEvidenceEvents,
} from "../persistence/requirement-evidence-persistence";
import {
  applyAuthorityRuntimeCommandError,
  applyAuthorityRuntimeSnapshotToStore,
} from "../../authority/runtime-command";
import type {
  CompanyRuntimeState,
  RequirementAggregateRecord,
  RequirementEvidenceEvent,
  RuntimeGet,
  RuntimeSet,
} from "./types";
import { transitionAuthorityRequirement } from "../../../application/gateway/authority-control";

export function emitRequirementCompanyEvent(input: {
  companyId: string;
  kind: RequirementWorkflowEventKind;
  aggregate: RequirementAggregateRecord;
  actorId?: string | null;
}) {
  void gateway.appendCompanyEvent(
    createCompanyEvent({
      companyId: input.companyId,
      kind: input.kind,
      workItemId: input.aggregate.workItemId ?? undefined,
      topicKey: input.aggregate.topicKey ?? undefined,
      roomId: input.aggregate.roomId ?? undefined,
      fromActorId: input.actorId ?? input.aggregate.ownerActorId ?? "system:requirement-aggregate",
      targetActorId: input.aggregate.ownerActorId ?? undefined,
      sessionKey: input.aggregate.sourceConversationId ?? undefined,
      payload: {
        ownerActorId: input.aggregate.ownerActorId,
        ownerLabel: input.aggregate.ownerLabel,
        stage: input.aggregate.stage,
        summary: input.aggregate.summary,
        nextAction: input.aggregate.nextAction,
        memberIds: input.aggregate.memberIds,
        status: input.aggregate.status,
        stageGateStatus: input.aggregate.stageGateStatus,
        acceptanceStatus: input.aggregate.acceptanceStatus,
        acceptanceNote: input.aggregate.acceptanceNote ?? null,
        revision: input.aggregate.revision,
      },
    }),
  ).catch((error) => {
    console.warn("Failed to append requirement company event", error);
  });
}

export function persistActiveRequirementAggregates(
  companyId: string | null | undefined,
  aggregates: RequirementAggregateRecord[],
) {
  persistRequirementAggregateRecords(companyId, aggregates);
}

export function persistActiveRequirementEvidence(
  companyId: string | null | undefined,
  evidence: RequirementEvidenceEvent[],
) {
  persistRequirementEvidenceEvents(companyId, evidence);
}

export function loadPersistedRequirementRuntimeState(companyId: string) {
  return {
    loadedRequirementAggregates: loadRequirementAggregateRecords(companyId),
    loadedRequirementEvidence: loadRequirementEvidenceEvents(companyId),
  };
}

export function reconcileActiveRequirementState(input: {
  companyId: string;
  activeRequirementAggregates: RequirementAggregateRecord[];
  primaryRequirementId: string | null;
  activeConversationStates: CompanyRuntimeState["activeConversationStates"];
  activeWorkItems: CompanyRuntimeState["activeWorkItems"];
  activeRoomRecords: CompanyRuntimeState["activeRoomRecords"];
  activeRequirementEvidence: RequirementEvidenceEvent[];
}) {
  return reconcileRequirementAggregateState({
    companyId: input.companyId,
    existingAggregates: input.activeRequirementAggregates,
    primaryRequirementId: input.primaryRequirementId,
    activeConversationStates: input.activeConversationStates,
    activeWorkItems: input.activeWorkItems,
    activeRoomRecords: input.activeRoomRecords,
    activeRequirementEvidence: input.activeRequirementEvidence,
  });
}

export function buildRequirementLocalEvidence(input: {
  companyId: string;
  eventType: RequirementWorkflowEventKind;
  aggregate: RequirementAggregateRecord;
  previousAggregate: RequirementAggregateRecord | null;
  actorId?: string | null;
  timestamp: number;
  source?: RequirementEvidenceEvent["source"];
}): RequirementEvidenceEvent {
  return buildRequirementWorkflowEvidence(input);
}

export function appendRequirementLocalEvidence(input: {
  companyId: string;
  evidence: RequirementEvidenceEvent[];
  eventType: RequirementWorkflowEventKind;
  aggregate: RequirementAggregateRecord;
  previousAggregate: RequirementAggregateRecord | null;
  actorId?: string | null;
  timestamp: number;
  source?: RequirementEvidenceEvent["source"];
}) {
  return sanitizeRequirementEvidenceEvents(input.companyId, [
    buildRequirementLocalEvidence({
      companyId: input.companyId,
      eventType: input.eventType,
      aggregate: input.aggregate,
      previousAggregate: input.previousAggregate,
      actorId: input.actorId,
      timestamp: input.timestamp,
      source: input.source,
    }),
    ...input.evidence,
  ]);
}

export function buildRequirementActions(
  set: RuntimeSet,
  get: RuntimeGet,
): Pick<
  CompanyRuntimeState,
  "setPrimaryRequirement" | "applyRequirementTransition" | "ingestRequirementEvidence"
> {
  return {
    setPrimaryRequirement: (aggregateId) => {
      const {
        activeCompany,
        activeRequirementAggregates,
        activeRequirementEvidence,
        primaryRequirementId,
      } = get();
      if (!activeCompany) {
        return;
      }

      const nextPrimaryRequirementId =
        aggregateId && activeRequirementAggregates.some((record) => record.id === aggregateId)
          ? aggregateId
          : null;
      const nextAggregates = sanitizeRequirementAggregateRecords(
        activeRequirementAggregates,
        nextPrimaryRequirementId,
      );
      const promotedAggregate =
        nextPrimaryRequirementId
          ? nextAggregates.find((aggregate) => aggregate.id === nextPrimaryRequirementId) ?? null
          : null;
      const previousAggregate =
        primaryRequirementId
          ? activeRequirementAggregates.find((aggregate) => aggregate.id === primaryRequirementId) ?? null
          : null;
      const nextEvidence =
        promotedAggregate && nextPrimaryRequirementId !== primaryRequirementId
          ? appendRequirementLocalEvidence({
              companyId: activeCompany.id,
              evidence: activeRequirementEvidence,
              eventType: "requirement_promoted",
              aggregate: promotedAggregate,
              previousAggregate,
              actorId: promotedAggregate.ownerActorId,
              timestamp: Date.now(),
            })
          : activeRequirementEvidence;
      set({
        activeRequirementAggregates: nextAggregates,
        activeRequirementEvidence: nextEvidence,
        primaryRequirementId: nextPrimaryRequirementId,
      });
      persistActiveRequirementAggregates(activeCompany.id, nextAggregates);
      if (nextEvidence !== activeRequirementEvidence) {
        persistActiveRequirementEvidence(activeCompany.id, nextEvidence);
      }
      if (promotedAggregate && nextPrimaryRequirementId !== primaryRequirementId) {
        emitRequirementCompanyEvent({
          companyId: activeCompany.id,
          kind: "requirement_promoted",
          aggregate: promotedAggregate,
        });
      }
    },

    applyRequirementTransition: (transition) => {
      const {
        activeCompany,
        authorityBackedState,
        activeRequirementAggregates,
        activeRequirementEvidence,
        primaryRequirementId,
      } = get();
      if (!activeCompany) {
        return;
      }

      const target = activeRequirementAggregates.find((aggregate) => aggregate.id === transition.aggregateId);
      if (!target) {
        return;
      }

      if (authorityBackedState) {
        void transitionAuthorityRequirement({
          companyId: activeCompany.id,
          aggregateId: transition.aggregateId,
          changes: transition.changes,
          timestamp: transition.timestamp,
          source: transition.source,
        })
          .then((snapshot) => {
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "requirement.transition",
              set,
              get,
            });
          })
          .catch((error) => {
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to transition requirement through authority",
            });
          });
        return;
      }

      const nextAggregates = sanitizeRequirementAggregateRecords(
        activeRequirementAggregates.map((aggregate) => {
          if (aggregate.id !== transition.aggregateId) {
            return aggregate;
          }
          return {
            ...aggregate,
            ...transition.changes,
            companyId: activeCompany.id,
            primary: aggregate.id === primaryRequirementId,
            revision: aggregate.revision + 1,
            updatedAt: Math.max(
              aggregate.updatedAt,
              transition.timestamp ?? Date.now(),
              transition.changes.updatedAt ?? 0,
            ),
            lastEvidenceAt:
              transition.changes.lastEvidenceAt ??
              transition.timestamp ??
              aggregate.lastEvidenceAt ??
              null,
          };
        }),
        primaryRequirementId,
      );

      const nextAggregate =
        nextAggregates.find((aggregate) => aggregate.id === transition.aggregateId) ?? null;
      const timestamp = transition.timestamp ?? Date.now();
      const kind = nextAggregate
        ? resolveRequirementWorkflowEventKind({
            previousAggregate: target,
            nextAggregate,
            changes: transition.changes,
          })
        : null;
      const nextEvidence =
        nextAggregate && kind
          ? appendRequirementLocalEvidence({
              companyId: activeCompany.id,
              evidence: activeRequirementEvidence,
              eventType: kind,
              aggregate: nextAggregate,
              previousAggregate: target,
              actorId: transition.changes.ownerActorId ?? target.ownerActorId,
              timestamp,
              source: transition.source,
            })
          : activeRequirementEvidence;

      set({
        activeRequirementAggregates: nextAggregates,
        activeRequirementEvidence: nextEvidence,
      });
      persistActiveRequirementAggregates(activeCompany.id, nextAggregates);
      if (nextEvidence !== activeRequirementEvidence) {
        persistActiveRequirementEvidence(activeCompany.id, nextEvidence);
      }
      if (nextAggregate && kind) {
        emitRequirementCompanyEvent({
          companyId: activeCompany.id,
          kind,
          aggregate: nextAggregate,
          actorId: transition.changes.ownerActorId ?? target.ownerActorId,
        });
      }
    },

    ingestRequirementEvidence: (event) => {
      const {
        activeCompany,
        activeRequirementAggregates,
        activeRequirementEvidence,
        activeRoomRecords,
        primaryRequirementId,
      } = get();
      if (!activeCompany) {
        return;
      }

      const normalizedEvent: RequirementEvidenceEvent = {
        ...event,
        companyId: activeCompany.id,
        aggregateId: event.aggregateId?.trim() || null,
        sessionKey: event.sessionKey?.trim() || null,
        actorId: event.actorId?.trim() || null,
        payload: event.payload ?? {},
        applied: Boolean(event.applied),
      };
      const nextEvidence = sanitizeRequirementEvidenceEvents(activeCompany.id, [
        normalizedEvent,
        ...activeRequirementEvidence,
      ]);

      const applied = applyRequirementEvidenceToAggregates({
        company: activeCompany,
        activeConversationStates: get().activeConversationStates,
        activeRequirementAggregates,
        activeRoomRecords,
        activeWorkItems: get().activeWorkItems,
        primaryRequirementId,
        event: normalizedEvent,
      });
      const updatedEvidence = nextEvidence.map((entry) =>
        entry.id === normalizedEvent.id
          ? {
              ...entry,
              aggregateId: applied.aggregateId ?? entry.aggregateId,
              applied: applied.applied,
            }
          : entry,
      );

      set({
        activeRequirementAggregates: applied.activeRequirementAggregates,
        activeRequirementEvidence: updatedEvidence,
        primaryRequirementId: applied.primaryRequirementId,
      });
      persistActiveRequirementEvidence(activeCompany.id, updatedEvidence);
      persistActiveRequirementAggregates(activeCompany.id, applied.activeRequirementAggregates);
    },
  };
}
