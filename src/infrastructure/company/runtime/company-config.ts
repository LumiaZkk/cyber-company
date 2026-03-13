import {
  deleteCompanyCascade,
  saveCompanyConfig,
} from "../persistence/persistence";
import type {
  Company,
  CompanyRuntimeState,
  EscalationRecord,
  HandoffRecord,
  RequestRecord,
  SharedKnowledgeItem,
  SupportRequestRecord,
  TrackedTask,
} from "./types";
import { createEmptyProductState } from "./bootstrap";
import { hydrateAuthorityBootstrapCache, writeCachedAuthorityConfig, writeCachedAuthorityRuntimeSnapshot } from "../../authority/runtime-cache";
import { runtimeStateFromAuthorityBootstrap, runtimeStateFromAuthorityRuntimeSnapshot } from "../../authority/runtime-snapshot";
import {
  getAuthorityBootstrap,
  getAuthorityCompanyRuntime,
  switchAuthorityCompany,
} from "../../../application/gateway/authority-control";
import {
  isSupportRequestActive,
  normalizeSupportRequestRecord,
} from "../../../domain/delegation/support-request";

type RuntimeSet = (partial: Partial<CompanyRuntimeState>) => void;
type RuntimeGet = () => CompanyRuntimeState;

function upsertTimestampedRecord<T extends { id: string; updatedAt: number }>(
  existingItems: T[],
  incomingItem: T,
): T[] | null {
  const index = existingItems.findIndex((item) => item.id === incomingItem.id);
  if (index >= 0) {
    const existing = existingItems[index];
    if (incomingItem.updatedAt <= existing.updatedAt) {
      return null;
    }
    const next = [...existingItems];
    next[index] = { ...existing, ...incomingItem };
    return next;
  }
  return [...existingItems, incomingItem];
}

function filterOpenEscalations(escalations: EscalationRecord[] | null | undefined): EscalationRecord[] {
  return (escalations ?? []).filter(
    (item) => item.status === "open" || item.status === "acknowledged",
  );
}

export function buildCompanyConfigActions(
  set: RuntimeSet,
  get: RuntimeGet,
): Pick<
  CompanyRuntimeState,
  | "loadConfig"
  | "saveConfig"
  | "switchCompany"
  | "deleteCompany"
  | "updateCompany"
  | "upsertTask"
  | "upsertHandoff"
  | "upsertRequest"
  | "upsertSupportRequest"
  | "upsertKnowledgeItem"
  | "upsertSkillDefinition"
  | "upsertSkillRun"
  | "upsertCapabilityRequest"
  | "upsertCapabilityIssue"
> {
  return {
    loadConfig: async () => {
      set({ loading: true, error: null, bootstrapPhase: "restoring" });
      try {
        const bootstrap = await getAuthorityBootstrap();
        hydrateAuthorityBootstrapCache(bootstrap);
        if (bootstrap.config) {
          const state = runtimeStateFromAuthorityBootstrap(bootstrap);
          set({
            ...state,
            loading: false,
            bootstrapPhase: bootstrap.activeCompany ? "ready" : "missing",
          });
          return;
        }
        set({
          config: null,
          activeCompany: null,
          authorityBackedState: false,
          activeRoomRecords: [],
          activeMissionRecords: [],
          activeConversationStates: [],
          activeWorkItems: [],
          activeRequirementAggregates: [],
          activeRequirementEvidence: [],
          primaryRequirementId: null,
          activeRoundRecords: [],
          activeArtifacts: [],
          activeDispatches: [],
          activeRoomBindings: [],
          activeSupportRequests: [],
          activeEscalations: [],
          activeDecisionTickets: [],
          loading: false,
          bootstrapPhase: "missing",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({
          error: message,
          authorityBackedState: false,
          activeRoomRecords: [],
          activeMissionRecords: [],
          activeConversationStates: [],
          activeWorkItems: [],
          activeRequirementAggregates: [],
          activeRequirementEvidence: [],
          primaryRequirementId: null,
          activeRoundRecords: [],
          activeArtifacts: [],
          activeDispatches: [],
          activeRoomBindings: [],
          activeSupportRequests: [],
          activeEscalations: [],
          activeDecisionTickets: [],
          loading: false,
          bootstrapPhase: "error",
        });
      }
    },

    saveConfig: async () => {
      const { config } = get();
      if (!config) {
        return;
      }

      set({ loading: true, error: null });
      try {
        const success = await saveCompanyConfig(config);
        if (!success) {
          set({ error: "Failed to persist configuration" });
        }
        set({ loading: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ error: message, loading: false });
      }
    },

    switchCompany: (id: string) => {
      const { config } = get();
      if (!config) {
        return;
      }

      const company = config.companies.find((c) => c.id === id);
      if (!company) {
        return;
      }

      const newConfig = { ...config, activeCompanyId: id };
      writeCachedAuthorityConfig(newConfig);
      void switchAuthorityCompany(id)
        .then((bootstrap) => {
          hydrateAuthorityBootstrapCache(bootstrap);
          const nextState = runtimeStateFromAuthorityBootstrap(bootstrap);
          set({
            ...nextState,
            loading: false,
            bootstrapPhase: bootstrap.activeCompany ? "ready" : "missing",
          });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message, loading: false });
        });
      set({
        config: newConfig,
        activeCompany: company,
        ...runtimeStateFromAuthorityRuntimeSnapshot(null),
        authorityBackedState: true,
        bootstrapPhase: "ready",
      });
    },

    deleteCompany: async (id: string) => {
      const { config } = get();
      if (!config) {
        return;
      }

      set({ loading: true, error: null });
      try {
        const nextConfig = await deleteCompanyCascade(config, id);
        const nextActiveCompany =
          nextConfig?.companies.find((company) => company.id === nextConfig.activeCompanyId) ?? null;
        const nextRuntime = nextActiveCompany
          ? runtimeStateFromAuthorityRuntimeSnapshot(
              await getAuthorityCompanyRuntime(nextActiveCompany.id),
            )
          : createEmptyProductState();
        if (nextActiveCompany) {
          writeCachedAuthorityRuntimeSnapshot({
            companyId: nextActiveCompany.id,
            ...nextRuntime,
            updatedAt: Date.now(),
          });
        }

        set({
          config: nextConfig,
          activeCompany: nextActiveCompany,
          ...nextRuntime,
          loading: false,
          bootstrapPhase: nextActiveCompany ? "ready" : "missing",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ error: message, loading: false });
        throw error;
      }
    },

    updateCompany: async (updates: Partial<Company>) => {
      const { config, activeCompany } = get();
      if (!config || !activeCompany) {
        return;
      }

      const newCompany = { ...activeCompany, ...updates };
      const newCompanies = config.companies.map((c) => (c.id === activeCompany.id ? newCompany : c));
      set({ config: { ...config, companies: newCompanies }, activeCompany: newCompany });
      await get().saveConfig();
    },

    upsertTask: async (task: TrackedTask) => {
      const { activeCompany } = get();
      if (!activeCompany) {
        return;
      }
      const existingTasks = activeCompany.tasks ?? [];
      const index = existingTasks.findIndex((item) => item.sessionKey === task.sessionKey);
      const nextTasks =
        index >= 0
          ? (() => {
              const existing = existingTasks[index];
              if (task.updatedAt <= existing.updatedAt) {
                return null;
              }
              const next = [...existingTasks];
              next[index] = { ...existing, ...task };
              return next;
            })()
          : [...existingTasks, task];
      if (!nextTasks) {
        return;
      }
      await get().updateCompany({ tasks: nextTasks });
    },

    upsertHandoff: async (handoff: HandoffRecord) => {
      const { activeCompany } = get();
      if (!activeCompany) {
        return;
      }
      const nextHandoffs = upsertTimestampedRecord(activeCompany.handoffs ?? [], handoff);
      if (!nextHandoffs) {
        return;
      }
      await get().updateCompany({ handoffs: nextHandoffs });
    },

    upsertRequest: async (request: RequestRecord) => {
      const { activeCompany } = get();
      if (!activeCompany) {
        return;
      }
      const nextRequests = upsertTimestampedRecord(activeCompany.requests ?? [], request);
      if (!nextRequests) {
        return;
      }
      await get().updateCompany({ requests: nextRequests });
    },

    upsertSupportRequest: async (request: SupportRequestRecord) => {
      const { activeCompany } = get();
      if (!activeCompany) {
        return;
      }
      const normalizedRequest = normalizeSupportRequestRecord(request);
      const nextRequests = upsertTimestampedRecord(
        get().activeSupportRequests,
        normalizedRequest,
      );
      if (!nextRequests) {
        return;
      }
      set({
        activeSupportRequests: nextRequests,
        activeCompany: {
          ...activeCompany,
          supportRequests: nextRequests.filter(isSupportRequestActive),
        },
      });
      await get().updateCompany({
        supportRequests: nextRequests.filter(isSupportRequestActive),
        escalations: filterOpenEscalations(get().activeEscalations),
        decisionTickets: get().activeDecisionTickets.filter(
          (ticket) => ticket.status === "open" || ticket.status === "pending_human",
        ),
      });
    },

    upsertKnowledgeItem: async (knowledgeItem: SharedKnowledgeItem) => {
      const { activeCompany } = get();
      if (!activeCompany) {
        return;
      }
      const nextItems = upsertTimestampedRecord(activeCompany.knowledgeItems ?? [], knowledgeItem);
      if (!nextItems) {
        return;
      }
      await get().updateCompany({ knowledgeItems: nextItems });
    },

    upsertSkillDefinition: async (skill) => {
      const { activeCompany } = get();
      if (!activeCompany) {
        return;
      }
      const nextSkills = upsertTimestampedRecord(activeCompany.skillDefinitions ?? [], skill);
      if (!nextSkills) {
        return;
      }
      await get().updateCompany({ skillDefinitions: nextSkills });
    },

    upsertSkillRun: async (skillRun) => {
      const { activeCompany } = get();
      if (!activeCompany) {
        return;
      }
      const nextSkillRuns = upsertTimestampedRecord(activeCompany.skillRuns ?? [], skillRun);
      if (!nextSkillRuns) {
        return;
      }
      await get().updateCompany({ skillRuns: nextSkillRuns });
    },

    upsertCapabilityRequest: async (request) => {
      const { activeCompany } = get();
      if (!activeCompany) {
        return;
      }
      const nextRequests = upsertTimestampedRecord(activeCompany.capabilityRequests ?? [], request);
      if (!nextRequests) {
        return;
      }
      await get().updateCompany({ capabilityRequests: nextRequests });
    },

    upsertCapabilityIssue: async (issue) => {
      const { activeCompany } = get();
      if (!activeCompany) {
        return;
      }
      const nextIssues = upsertTimestampedRecord(activeCompany.capabilityIssues ?? [], issue);
      if (!nextIssues) {
        return;
      }
      await get().updateCompany({ capabilityIssues: nextIssues });
    },
  };
}
