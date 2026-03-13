import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authorityControl from "../../../application/gateway/authority-control";
import { useAuthorityRuntimeSyncStore } from "../../authority/runtime-sync-store";
import { useCompanyRuntimeStore } from "./store";
import type { Company, DecisionTicketRecord } from "./types";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "小说创作工作室",
    description: "测试公司",
    icon: "🦞",
    template: "novel",
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo" },
      { agentId: "co-cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto" },
    ],
    quickPrompts: [],
    createdAt: 1,
    decisionTickets: [],
  };
}

function createDecisionTicket(
  overrides: Partial<DecisionTicketRecord> = {},
): DecisionTicketRecord {
  return {
    id: "decision:requirement:requirement_gate:topic:mission:alpha",
    companyId: "company-1",
    revision: 1,
    sourceType: "requirement",
    sourceId: "topic:mission:alpha",
    aggregateId: "topic:mission:alpha",
    workItemId: "topic:mission:alpha",
    sourceConversationId: "agent:co-ceo:main",
    decisionOwnerActorId: "co-ceo",
    decisionType: "requirement_gate",
    summary: "请确认是否继续推进当前需求。",
    options: [
      { id: "confirm", label: "确认推进" },
      { id: "pause", label: "暂停推进" },
    ],
    requiresHuman: true,
    status: "pending_human",
    resolution: null,
    resolutionOptionId: null,
    roomId: "workitem:topic:mission:alpha",
    createdAt: 3_000,
    updatedAt: 3_000,
    ...overrides,
  };
}

function createAuthorityDecisionSnapshot(ticket: DecisionTicketRecord | null) {
  return {
    companyId: "company-1",
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
    activeDecisionTickets: ticket ? [ticket] : [],
    updatedAt: ticket?.updatedAt ?? 4_000,
  };
}

describe("useCompanyRuntimeStore authority-backed decision tickets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      configurable: true,
      writable: true,
    });

    useAuthorityRuntimeSyncStore.setState({
      compatibilityPathEnabled: true,
      commandRoutes: ["decision.upsert", "decision.resolve", "decision.cancel", "decision.delete"],
      mode: "compatibility_snapshot",
      lastSnapshotUpdatedAt: null,
      lastAppliedSignature: null,
      lastAppliedSource: null,
      lastAppliedAt: null,
      lastPushAt: null,
      lastPullAt: null,
      lastCommandAt: null,
      pushCount: 0,
      pullCount: 0,
      commandCount: 0,
      lastError: null,
      lastErrorAt: null,
      lastErrorOperation: null,
    });

    useCompanyRuntimeStore.setState({
      config: null,
      activeCompany: createCompany(),
      authorityBackedState: true,
      activeRoomRecords: [],
      activeMissionRecords: [],
      activeConversationStates: [],
      activeRequirementAggregates: [],
      activeRequirementEvidence: [],
      activeWorkItems: [],
      activeRoundRecords: [],
      activeArtifacts: [],
      activeDispatches: [],
      activeRoomBindings: [],
      activeSupportRequests: [],
      activeEscalations: [],
      activeDecisionTickets: [],
      loading: false,
      error: null,
      bootstrapPhase: "ready",
    });
  });

  it("routes decision-ticket upserts through authority and applies the returned runtime", async () => {
    const ticket = createDecisionTicket();
    const upsertSpy = vi
      .spyOn(authorityControl, "upsertAuthorityDecisionTicket")
      .mockResolvedValue(createAuthorityDecisionSnapshot(ticket));

    useCompanyRuntimeStore.getState().upsertDecisionTicketRecord(ticket);

    await vi.waitFor(() => {
      expect(upsertSpy).toHaveBeenCalledWith({
        companyId: "company-1",
        ticket,
      });
      const state = useCompanyRuntimeStore.getState();
      expect(state.activeDecisionTickets).toEqual([ticket]);
      expect(state.activeCompany?.decisionTickets).toEqual([ticket]);
    });
  });

  it("routes decision-ticket deletion through authority", async () => {
    const ticket = createDecisionTicket();
    const deleteSpy = vi
      .spyOn(authorityControl, "deleteAuthorityDecisionTicket")
      .mockResolvedValue(createAuthorityDecisionSnapshot(null));

    useCompanyRuntimeStore.setState({
      activeDecisionTickets: [ticket],
      activeCompany: {
        ...createCompany(),
        decisionTickets: [ticket],
      },
    });

    useCompanyRuntimeStore.getState().deleteDecisionTicketRecord(ticket.id);

    await vi.waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith({
        companyId: "company-1",
        ticketId: ticket.id,
      });
      const state = useCompanyRuntimeStore.getState();
      expect(state.activeDecisionTickets).toEqual([]);
      expect(state.activeCompany?.decisionTickets).toEqual([]);
    });
  });

  it("routes decision-ticket resolution through authority", async () => {
    const ticket = createDecisionTicket();
    const resolvedTicket = createDecisionTicket({
      status: "resolved",
      revision: 2,
      resolutionOptionId: "confirm",
      resolution: "确认推进",
      updatedAt: 4_000,
    });
    const resolveSpy = vi
      .spyOn(authorityControl, "resolveAuthorityDecisionTicket")
      .mockResolvedValue(createAuthorityDecisionSnapshot(resolvedTicket));

    useCompanyRuntimeStore.setState({
      activeDecisionTickets: [ticket],
      activeCompany: {
        ...createCompany(),
        decisionTickets: [ticket],
      },
    });

    useCompanyRuntimeStore.getState().resolveDecisionTicket({
      ticketId: ticket.id,
      optionId: "confirm",
      resolution: "确认推进",
      timestamp: 4_000,
    });

    await vi.waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith({
        companyId: "company-1",
        ticketId: ticket.id,
        optionId: "confirm",
        resolution: "确认推进",
        timestamp: 4_000,
      });
      const state = useCompanyRuntimeStore.getState();
      expect(state.activeDecisionTickets).toEqual([resolvedTicket]);
      expect(state.activeCompany?.decisionTickets).toEqual([]);
    });
  });

  it("routes decision-ticket cancellation through authority", async () => {
    const ticket = createDecisionTicket();
    const cancelledTicket = createDecisionTicket({
      status: "cancelled",
      revision: 2,
      resolution: "暂缓处理",
      resolutionOptionId: null,
      updatedAt: 4_500,
    });
    const cancelSpy = vi
      .spyOn(authorityControl, "cancelAuthorityDecisionTicket")
      .mockResolvedValue(createAuthorityDecisionSnapshot(cancelledTicket));

    useCompanyRuntimeStore.setState({
      activeDecisionTickets: [ticket],
      activeCompany: {
        ...createCompany(),
        decisionTickets: [ticket],
      },
    });

    useCompanyRuntimeStore.getState().cancelDecisionTicket({
      ticketId: ticket.id,
      resolution: "暂缓处理",
      timestamp: 4_500,
    });

    await vi.waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledWith({
        companyId: "company-1",
        ticketId: ticket.id,
        resolution: "暂缓处理",
        timestamp: 4_500,
      });
      const state = useCompanyRuntimeStore.getState();
      expect(state.activeDecisionTickets).toEqual([cancelledTicket]);
      expect(state.activeCompany?.decisionTickets).toEqual([]);
    });
  });
});
