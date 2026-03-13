import type { ArtifactRecord, SharedKnowledgeItem } from "../../../domain/artifact/types";
import type {
  CanonicalAgentStatusRecord,
  CanonicalAgentStatusHealthRecord,
  AgentRunRecord,
  AgentRuntimeRecord,
  AgentSessionRecord,
} from "../../../application/agent-runtime";
import type {
  DecisionTicketRecord,
  DispatchRecord,
  EscalationRecord,
  HandoffRecord,
  RequestRecord,
  RequirementRoomMessage,
  RequirementRoomRecord,
  RoomConversationBindingRecord,
  SupportRequestRecord,
} from "../../../domain/delegation/types";
import type {
  ConversationMissionRecord,
  RequirementAggregateRecord,
  RequirementEvidenceEvent,
  ConversationStateRecord,
  RoundRecord,
  TrackedTask,
  WorkItemRecord,
} from "../../../domain/mission/types";
import type { Company, CyberCompanyConfig } from "../../../domain/org/types";

export type { ArtifactRecord, SharedKnowledgeItem } from "../../../domain/artifact/types";
export type {
  CanonicalAgentStatusRecord,
  CanonicalAgentStatusHealthRecord,
  AgentRunRecord,
  AgentRuntimeRecord,
  AgentSessionRecord,
} from "../../../application/agent-runtime";
export type {
  DecisionTicketRecord,
  DispatchRecord,
  EscalationRecord,
  HandoffRecord,
  RequestRecord,
  RequirementRoomMessage,
  RequirementRoomRecord,
  RoomConversationBindingRecord,
  SupportRequestRecord,
} from "../../../domain/delegation/types";
export type {
  ConversationMissionRecord,
  RequirementAggregateRecord,
  RequirementEvidenceEvent,
  ConversationStateRecord,
  RoundRecord,
  TrackedTask,
  WorkItemRecord,
} from "../../../domain/mission/types";
export type { Company, CyberCompanyConfig } from "../../../domain/org/types";

export type CompanyBootstrapPhase = "idle" | "restoring" | "ready" | "missing" | "error";

export interface CompanyRuntimeState {
  config: CyberCompanyConfig | null;
  activeCompany: Company | null;
  authorityBackedState: boolean;
  activeRoomRecords: RequirementRoomRecord[];
  activeMissionRecords: ConversationMissionRecord[];
  activeConversationStates: ConversationStateRecord[];
  activeWorkItems: WorkItemRecord[];
  activeRequirementAggregates: RequirementAggregateRecord[];
  activeRequirementEvidence: RequirementEvidenceEvent[];
  primaryRequirementId: string | null;
  activeRoundRecords: RoundRecord[];
  activeArtifacts: ArtifactRecord[];
  activeDispatches: DispatchRecord[];
  activeRoomBindings: RoomConversationBindingRecord[];
  activeSupportRequests: SupportRequestRecord[];
  activeEscalations: EscalationRecord[];
  activeDecisionTickets: DecisionTicketRecord[];
  activeAgentSessions: AgentSessionRecord[];
  activeAgentRuns: AgentRunRecord[];
  activeAgentRuntime: AgentRuntimeRecord[];
  activeAgentStatuses: CanonicalAgentStatusRecord[];
  activeAgentStatusHealth: CanonicalAgentStatusHealthRecord;
  loading: boolean;
  error: string | null;
  bootstrapPhase: CompanyBootstrapPhase;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  switchCompany: (id: string) => void;
  deleteCompany: (id: string) => Promise<void>;
  retryCompanyProvisioning: (id: string) => Promise<void>;
  updateCompany: (company: Partial<Company>) => Promise<void>;
  upsertTask: (task: TrackedTask) => Promise<void>;
  upsertHandoff: (handoff: HandoffRecord) => Promise<void>;
  upsertRequest: (request: RequestRecord) => Promise<void>;
  upsertSupportRequest: (request: SupportRequestRecord) => Promise<void>;
  replaceSupportRequestRecords: (requests: SupportRequestRecord[]) => void;
  deleteSupportRequestRecord: (requestId: string) => void;
  upsertEscalationRecord: (escalation: EscalationRecord) => void;
  replaceEscalationRecords: (escalations: EscalationRecord[]) => void;
  deleteEscalationRecord: (escalationId: string) => void;
  upsertDecisionTicketRecord: (ticket: DecisionTicketRecord) => void;
  resolveDecisionTicket: (input: {
    ticketId: string;
    optionId?: string | null;
    resolution?: string | null;
    timestamp?: number;
  }) => void;
  cancelDecisionTicket: (input: {
    ticketId: string;
    resolution?: string | null;
    timestamp?: number;
  }) => void;
  replaceDecisionTicketRecords: (tickets: DecisionTicketRecord[]) => void;
  deleteDecisionTicketRecord: (ticketId: string) => void;
  upsertKnowledgeItem: (knowledgeItem: SharedKnowledgeItem) => Promise<void>;
  upsertSkillDefinition: (skill: CompanySkillDefinition) => Promise<void>;
  upsertSkillRun: (skillRun: CompanySkillRun) => Promise<void>;
  upsertCapabilityRequest: (request: CompanyCapabilityRequest) => Promise<void>;
  upsertCapabilityIssue: (issue: CompanyCapabilityIssue) => Promise<void>;
  upsertCapabilityAuditEvent: (event: CompanyCapabilityAuditEvent) => Promise<void>;
  upsertRoomRecord: (room: RequirementRoomRecord) => void;
  appendRoomMessages: (
    roomId: string,
    messages: RequirementRoomMessage[],
    meta?: Partial<Omit<RequirementRoomRecord, "id" | "transcript">>,
  ) => void;
  ensureRequirementRoomForAggregate: (aggregateId: string) => RequirementRoomRecord | null;
  upsertRoomConversationBindings: (bindings: RoomConversationBindingRecord[]) => void;
  deleteRoomRecord: (roomId: string) => void;
  upsertMissionRecord: (mission: ConversationMissionRecord) => void;
  deleteMissionRecord: (missionId: string) => void;
  setConversationCurrentWorkKey: (
    conversationId: string,
    workKey: string | null,
    workItemId?: string | null,
    roundId?: string | null,
  ) => void;
  setConversationDraftRequirement: (
    conversationId: string,
    draftRequirement: ConversationStateRecord["draftRequirement"],
  ) => void;
  clearConversationState: (conversationId: string) => void;
  upsertWorkItemRecord: (workItem: WorkItemRecord) => void;
  deleteWorkItemRecord: (workItemId: string) => void;
  setPrimaryRequirement: (aggregateId: string | null) => void;
  applyRequirementTransition: (transition: {
    aggregateId: string;
    changes: Partial<
      Omit<RequirementAggregateRecord, "id" | "companyId" | "primary" | "revision">
    >;
    timestamp?: number;
    source?: RequirementEvidenceEvent["source"];
  }) => void;
  ingestRequirementEvidence: (event: RequirementEvidenceEvent) => void;
  upsertRoundRecord: (round: RoundRecord) => void;
  deleteRoundRecord: (roundId: string) => void;
  upsertArtifactRecord: (artifact: ArtifactRecord) => void;
  syncArtifactMirrorRecords: (artifacts: ArtifactRecord[], mirrorPrefix?: string) => void;
  deleteArtifactRecord: (artifactId: string) => void;
  upsertDispatchRecord: (dispatch: DispatchRecord) => void;
  replaceDispatchRecords: (dispatches: DispatchRecord[]) => void;
  deleteDispatchRecord: (dispatchId: string) => void;
}

export type RuntimeSet = (partial: Partial<CompanyRuntimeState>) => void;
export type RuntimeGet = () => CompanyRuntimeState;

type CompanySkillDefinition = NonNullable<Company["skillDefinitions"]>[number];
type CompanySkillRun = NonNullable<Company["skillRuns"]>[number];
type CompanyCapabilityRequest = NonNullable<Company["capabilityRequests"]>[number];
type CompanyCapabilityIssue = NonNullable<Company["capabilityIssues"]>[number];
type CompanyCapabilityAuditEvent = NonNullable<Company["capabilityAuditEvents"]>[number];
