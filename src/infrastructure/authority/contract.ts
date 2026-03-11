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
import type { Company, CyberCompanyConfig } from "../../domain/org/types";
import type {
  AgentListEntry,
  CostUsageSummary,
  ChatMessage,
  CompanyEvent,
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

export type AuthorityAppendRoomRequest = {
  companyId: string;
  room: RequirementRoomRecord;
};

export type AuthorityDispatchUpsertRequest = {
  companyId: string;
  dispatch: DispatchRecord;
};

export type AuthorityAppendCompanyEventRequest = {
  event: CompanyEvent;
};

export type AuthorityCompanyEventsResponse = {
  companyId: string;
  events: CompanyEvent[];
  nextCursor: string | null;
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
