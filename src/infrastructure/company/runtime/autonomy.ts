import type { CompanyRuntimeState } from "./types";
import {
  isSupportRequestActive,
  normalizeSupportRequestRecord,
} from "../../../domain/delegation/support-request";

type RuntimeSet = (partial: Partial<CompanyRuntimeState>) => void;
type RuntimeGet = () => CompanyRuntimeState;

function sortByUpdatedAt<T extends { updatedAt: number }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.updatedAt - left.updatedAt);
}

function upsertRecord<T extends { id: string; updatedAt: number }>(
  records: T[],
  record: T,
): T[] | null {
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    if (record.updatedAt <= records[index]!.updatedAt) {
      return null;
    }
    const next = [...records];
    next[index] = record;
    return sortByUpdatedAt(next);
  }
  return sortByUpdatedAt([...records, record]);
}

export function buildAutonomyActions(
  set: RuntimeSet,
  get: RuntimeGet,
): Pick<
  CompanyRuntimeState,
  | "replaceSupportRequestRecords"
  | "deleteSupportRequestRecord"
  | "upsertEscalationRecord"
  | "replaceEscalationRecords"
  | "deleteEscalationRecord"
  | "upsertDecisionTicketRecord"
  | "replaceDecisionTicketRecords"
  | "deleteDecisionTicketRecord"
> {
  return {
    replaceSupportRequestRecords: (requests) => {
      const normalized = sortByUpdatedAt(requests.map(normalizeSupportRequestRecord));
      const activeCompany = get().activeCompany;
      set({
        activeSupportRequests: normalized,
        activeCompany: activeCompany
          ? {
              ...activeCompany,
              supportRequests: normalized.filter(isSupportRequestActive),
            }
          : activeCompany,
      });
    },

    deleteSupportRequestRecord: (requestId) => {
      const { activeSupportRequests, activeCompany } = get();
      const next = activeSupportRequests.filter((request) => request.id !== requestId);
      set({
        activeSupportRequests: next,
        activeCompany: activeCompany
          ? {
              ...activeCompany,
              supportRequests: next.filter(isSupportRequestActive),
            }
          : activeCompany,
      });
    },

    upsertEscalationRecord: (escalation) => {
      const { activeEscalations, activeCompany } = get();
      const next = upsertRecord(activeEscalations, escalation);
      if (!next) {
        return;
      }
      set({
        activeEscalations: next,
        activeCompany: activeCompany
          ? {
              ...activeCompany,
              escalations: next.filter((item) => item.status === "open" || item.status === "acknowledged"),
            }
          : activeCompany,
      });
    },

    replaceEscalationRecords: (escalations) => {
      const sorted = sortByUpdatedAt(escalations);
      const activeCompany = get().activeCompany;
      set({
        activeEscalations: sorted,
        activeCompany: activeCompany
          ? {
              ...activeCompany,
              escalations: sorted.filter((item) => item.status === "open" || item.status === "acknowledged"),
            }
          : activeCompany,
      });
    },

    deleteEscalationRecord: (escalationId) => {
      const { activeEscalations, activeCompany } = get();
      const next = activeEscalations.filter((escalation) => escalation.id !== escalationId);
      set({
        activeEscalations: next,
        activeCompany: activeCompany
          ? {
              ...activeCompany,
              escalations: next.filter((item) => item.status === "open" || item.status === "acknowledged"),
            }
          : activeCompany,
      });
    },

    upsertDecisionTicketRecord: (ticket) => {
      const { activeDecisionTickets, activeCompany } = get();
      const next = upsertRecord(activeDecisionTickets, ticket);
      if (!next) {
        return;
      }
      set({
        activeDecisionTickets: next,
        activeCompany: activeCompany
          ? {
              ...activeCompany,
              decisionTickets: next.filter((item) => item.status === "open" || item.status === "pending_human"),
            }
          : activeCompany,
      });
    },

    replaceDecisionTicketRecords: (tickets) => {
      const sorted = sortByUpdatedAt(tickets);
      const activeCompany = get().activeCompany;
      set({
        activeDecisionTickets: sorted,
        activeCompany: activeCompany
          ? {
              ...activeCompany,
              decisionTickets: sorted.filter((item) => item.status === "open" || item.status === "pending_human"),
            }
          : activeCompany,
      });
    },

    deleteDecisionTicketRecord: (ticketId) => {
      const { activeDecisionTickets, activeCompany } = get();
      const next = activeDecisionTickets.filter((ticket) => ticket.id !== ticketId);
      set({
        activeDecisionTickets: next,
        activeCompany: activeCompany
          ? {
              ...activeCompany,
              decisionTickets: next.filter((item) => item.status === "open" || item.status === "pending_human"),
            }
          : activeCompany,
      });
    },
  };
}
