import type { ArtifactRecord } from "../../domain/artifact/types";
import type {
  DecisionTicketRecord,
  DispatchRecord,
  EscalationRecord,
  RequirementRoomRecord,
  RoomConversationBindingRecord,
  SupportRequestRecord,
} from "../../domain/delegation/types";
import type {
  ConversationMissionRecord,
  ConversationStateRecord,
  RequirementAggregateRecord,
  RequirementEvidenceEvent,
  RoundRecord,
  WorkItemRecord,
} from "../../domain/mission/types";
import type { Company, CyberCompanyConfig, Department } from "../../domain/org/types";
import type {
  CanonicalAgentStatusRecord,
  AgentRunRecord,
  AgentRuntimeRecord,
  AgentSessionRecord,
} from "../../application/agent-runtime";
import type {
  AgentListEntry,
  CostUsageSummary,
  ChatMessage,
  CompanyEvent,
  ProviderRuntimeEvent,
  GatewayModelChoice,
  GatewayModelsListParams,
  GatewaySessionRow,
  SessionsArchivesGetResult,
  SessionsArchivesListResult,
  SessionsArchivesRestoreResult,
  SessionsUsageResult,
} from "../gateway";

export const DEFAULT_AUTHORITY_URL = "http://127.0.0.1:18790";
export const AUTHORITY_PROVIDER_ID = "authority";

export type AuthorityExecutorStatus = {
  adapter: "single-executor-local" | "openclaw-bridge";
  state: "ready" | "degraded" | "blocked";
  provider: "none" | "openclaw";
  note: string;
};

export type AuthorityExecutorConnectionState =
  | "idle"
  | "connecting"
  | "ready"
  | "degraded"
  | "blocked";

export type AuthorityExecutorConfig = {
  type: "openclaw";
  openclaw: {
    url: string;
    tokenConfigured: boolean;
  };
  connectionState: AuthorityExecutorConnectionState;
  lastError: string | null;
  lastConnectedAt: number | null;
};

export type AuthorityExecutorConfigPatch = {
  openclaw?: {
    url?: string;
    token?: string | null;
  };
  reconnect?: boolean;
};

export type AuthorityGatewayConfigSnapshot = {
  path: string;
  exists: boolean;
  valid: boolean;
  hash?: string;
  config: Record<string, unknown>;
};

export type AuthorityCompanyRuntimeSnapshot = {
  companyId: string;
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
  activeAgentSessions?: AgentSessionRecord[];
  activeAgentRuns?: AgentRunRecord[];
  activeAgentRuntime?: AgentRuntimeRecord[];
  activeAgentStatuses?: CanonicalAgentStatusRecord[];
  updatedAt: number;
};

export type AuthorityBootstrapSnapshot = {
  config: CyberCompanyConfig | null;
  activeCompany: Company | null;
  runtime: AuthorityCompanyRuntimeSnapshot | null;
  executor: AuthorityExecutorStatus;
  executorConfig: AuthorityExecutorConfig;
  authority: {
    url: string;
    dbPath: string;
    connected: true;
  };
};

export type AuthorityHealthSnapshot = {
  ok: true;
  executor: AuthorityExecutorStatus;
  executorConfig: AuthorityExecutorConfig;
  authority: {
    dbPath: string;
    connected: true;
    startedAt: number;
    doctor: {
      status: "ready" | "degraded" | "blocked";
      schemaVersion: number | null;
      backupDir: string;
      backupCount: number;
      latestBackupAt: number | null;
      companyCount: number;
      runtimeCount: number;
      eventCount: number;
      latestRuntimeAt: number | null;
      latestEventAt: number | null;
      activeCompanyId: string | null;
      issues: string[];
    };
    preflight: {
      status: "ready" | "degraded" | "blocked";
      dataDir: string;
      backupDir: string;
      dbExists: boolean;
      schemaVersion: number | null;
      backupCount: number;
      latestBackupAt: number | null;
      notes: string[];
      warnings: string[];
      issues: string[];
    };
  };
};

export type AuthorityEvent =
  | {
      type:
        | "bootstrap.updated"
        | "company.updated"
        | "conversation.updated"
        | "requirement.updated"
        | "room.updated"
        | "dispatch.updated"
        | "artifact.updated"
        | "decision.updated"
        | "executor.status";
      companyId?: string | null;
      timestamp: number;
      payload?: Record<string, unknown>;
    }
  | {
      type: "chat";
      companyId?: string | null;
      timestamp: number;
      payload: {
        runId: string;
        sessionKey: string;
        seq: number;
        state: "delta" | "final" | "aborted" | "error";
        message?: ChatMessage;
        errorMessage?: string;
      };
    }
  | {
      type: "agent.runtime.updated";
      companyId?: string | null;
      timestamp: number;
      payload: {
        event: ProviderRuntimeEvent;
      };
    };

export type AuthorityCreateCompanyRequest = {
  companyName: string;
  templateId: string;
  blueprintText?: string;
};

export type AuthorityCreateCompanyResponse = {
  company: Company;
  config: CyberCompanyConfig;
  runtime: AuthorityCompanyRuntimeSnapshot;
};

export type AuthorityHireEmployeeInput = {
  role: string;
  description: string;
  nickname?: string;
  reportsTo?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  departmentKind?: Department["kind"];
  departmentColor?: string | null;
  makeDepartmentLead?: boolean;
  avatarJobId?: string;
  modelTier?: "standard" | "reasoning" | "ultra";
  traits?: string;
  budget?: number;
};

export type AuthorityHireEmployeeRequest = {
  companyId: string;
} & AuthorityHireEmployeeInput;

export type AuthorityHireEmployeeResponse = {
  company: Company;
  config: CyberCompanyConfig;
  runtime: AuthorityCompanyRuntimeSnapshot;
  employee: Company["employees"][number];
  warnings: string[];
};

export type AuthorityBatchHireEmployeesRequest = {
  companyId: string;
  hires: AuthorityHireEmployeeInput[];
};

export type AuthorityBatchHireEmployeesResponse = {
  company: Company;
  config: CyberCompanyConfig;
  runtime: AuthorityCompanyRuntimeSnapshot;
  employees: Company["employees"][number][];
  warnings: string[];
};

export type AuthoritySwitchCompanyRequest = {
  companyId: string;
};

export type AuthorityRuntimeSyncRequest = {
  snapshot: AuthorityCompanyRuntimeSnapshot;
};

export type AuthorityChatSendRequest = {
  companyId: string;
  actorId: string;
  sessionKey?: string | null;
  message: string;
  timeoutMs?: number;
  attachments?: Array<{ type: string; mimeType: string; content: string }>;
};

export type AuthorityChatSendResponse = {
  runId: string;
  status: "started" | "in_flight";
  sessionKey: string;
};

export type AuthorityRequirementTransitionRequest = {
  companyId: string;
  aggregateId: string;
  changes: Partial<
    Omit<RequirementAggregateRecord, "id" | "companyId" | "primary" | "revision">
  >;
  timestamp?: number;
  source?: RequirementEvidenceEvent["source"];
};

export type AuthorityRequirementPromoteRequest = {
  companyId: string;
  aggregateId: string | null;
  timestamp?: number;
  source?: RequirementEvidenceEvent["source"];
};

export type AuthorityAppendRoomRequest = {
  companyId: string;
  room: RequirementRoomRecord;
};

export type AuthorityRoomDeleteRequest = {
  companyId: string;
  roomId: string;
};

export type AuthorityRoomBindingsUpsertRequest = {
  companyId: string;
  bindings: RoomConversationBindingRecord[];
};

export type AuthorityDispatchUpsertRequest = {
  companyId: string;
  dispatch: DispatchRecord;
};

export type AuthorityDispatchDeleteRequest = {
  companyId: string;
  dispatchId: string;
};

export type AuthorityArtifactUpsertRequest = {
  companyId: string;
  artifact: ArtifactRecord;
};

export type AuthorityArtifactDeleteRequest = {
  companyId: string;
  artifactId: string;
};

export type AuthorityArtifactMirrorSyncRequest = {
  companyId: string;
  artifacts: ArtifactRecord[];
  mirrorPrefix?: string;
};

export type AuthorityDecisionTicketUpsertRequest = {
  companyId: string;
  ticket: DecisionTicketRecord;
};

export type AuthorityDecisionTicketDeleteRequest = {
  companyId: string;
  ticketId: string;
};

export type AuthorityDecisionTicketResolveRequest = {
  companyId: string;
  ticketId: string;
  optionId?: string | null;
  resolution?: string | null;
  timestamp?: number;
};

export type AuthorityDecisionTicketCancelRequest = {
  companyId: string;
  ticketId: string;
  resolution?: string | null;
  timestamp?: number;
};

export type AuthorityAppendCompanyEventRequest = {
  event: CompanyEvent;
};

export type AuthorityCompanyEventsResponse = {
  companyId: string;
  events: CompanyEvent[];
  nextCursor: string | null;
};

export type AuthorityCollaborationActor = {
  agentId: string;
  nickname: string;
  role: string;
  metaRole: "ceo" | "hr" | "cto" | "coo" | null;
  isMeta: boolean;
  isDepartmentManager: boolean;
  departmentId: string | null;
  departmentName: string | null;
  departmentKind: "meta" | "support" | "business" | null;
};

export type AuthorityCollaborationTarget = AuthorityCollaborationActor & {
  reason:
    | "global_dispatch"
    | "department_peer"
    | "department_manager"
    | "support_lead"
    | "ceo"
    | "explicit_edge"
    | "report_chain"
    | "escalation";
};

export type AuthorityCollaborationScopeResponse = {
  company: {
    id: string;
    name?: string;
  };
  scopeVersion: number;
  generatedAt: number;
  self: AuthorityCollaborationActor;
  manager: AuthorityCollaborationActor | null;
  allowedDispatchTargets: AuthorityCollaborationTarget[];
  defaultReportChain: AuthorityCollaborationActor[];
  supportTargets: AuthorityCollaborationTarget[];
  escalationTargets: AuthorityCollaborationTarget[];
};

export type AuthoritySessionHistoryResponse = {
  sessionKey: string;
  sessionId: string;
  messages: ChatMessage[];
  thinkingLevel?: string;
};

export type AuthorityAgentFileRecord = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

export type AuthorityAgentFilesResponse = {
  agentId: string;
  workspace: string;
  files: AuthorityAgentFileRecord[];
};

export type AuthoritySessionListResponse = {
  ts: number;
  path: string;
  count: number;
  sessions: GatewaySessionRow[];
};

export type AuthorityActorsResponse = {
  agents: AgentListEntry[];
};

export type AuthorityModelsResponse = {
  models: GatewayModelChoice[];
};

export type AuthorityModelsListParams = GatewayModelsListParams;

export type AuthoritySessionArchivesListResponse = SessionsArchivesListResult;
export type AuthoritySessionArchiveGetResponse = SessionsArchivesGetResult;
export type AuthoritySessionArchiveRestoreResponse = SessionsArchivesRestoreResult;
export type AuthorityUsageCostResponse = CostUsageSummary;
export type AuthoritySessionsUsageResponse = SessionsUsageResult;
