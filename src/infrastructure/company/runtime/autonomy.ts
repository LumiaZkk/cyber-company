import {
  deleteAuthorityDecisionTicket,
  upsertAuthorityDecisionTicket,
} from "../../../application/gateway/authority-control";
import type { CompanyRuntimeState } from "./types";
import {
  applyAuthorityRuntimeCommandError,
  applyAuthorityRuntimeSnapshotToStore,
} from "../../authority/runtime-command";
import {
  isSupportRequestActive,
  normalizeSupportRequestRecord,
} from "../../../domain/delegation/support-request";

type RuntimeSet = (partial: Partial<CompanyRuntimeState>) => void;
type RuntimeGet = () => CompanyRuntimeState;

function sortByUpdatedAt<T extends { updatedAt: number }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.updatedAt - left.updatedAt);
}

function normalizeRevision(value: number | null | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1;
}

function upsertRecord<T extends { id: string; updatedAt: number; revision?: number }>(
  records: T[],
  record: T,
): T[] | null {
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    const existing = records[index]!;
    const existingRevision = normalizeRevision(existing.revision);
    const nextRevision = normalizeRevision(record.revision);
    if (
      nextRevision < existingRevision ||
      (nextRevision === existingRevision && record.updatedAt <= existing.updatedAt)
    ) {
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
      const { activeDecisionTickets, activeCompany, authorityBackedState } = get();
      const normalizedTicket = {
        ...ticket,
        companyId: ticket.companyId ?? activeCompany?.id ?? "",
        revision: normalizeRevision(ticket.revision),
        createdAt: ticket.createdAt || Date.now(),
        updatedAt: ticket.updatedAt || Date.now(),
      };
      if (authorityBackedState && activeCompany) {
        void upsertAuthorityDecisionTicket({
          companyId: activeCompany.id,
          ticket: normalizedTicket,
        })
          .then((snapshot) => {
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "decision.upsert",
              set,
              get,
            });
          })
          .catch((error) => {
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to upsert decision ticket through authority",
            });
          });
        return;
      }
      const next = upsertRecord(activeDecisionTickets, {
        ...normalizedTicket,
      });
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
      const sorted = sortByUpdatedAt(
        tickets.map((ticket) => ({
          ...ticket,
          revision: normalizeRevision(ticket.revision),
        })),
      );
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
      const { activeDecisionTickets, activeCompany, authorityBackedState } = get();
      if (authorityBackedState && activeCompany) {
        void deleteAuthorityDecisionTicket({
          companyId: activeCompany.id,
          ticketId,
        })
          .then((snapshot) => {
            applyAuthorityRuntimeSnapshotToStore({
              operation: "command",
              snapshot,
              route: "decision.delete",
              set,
              get,
            });
          })
          .catch((error) => {
            applyAuthorityRuntimeCommandError({
              error,
              set,
              fallbackMessage: "Failed to delete decision ticket through authority",
            });
          });
        return;
      }
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
