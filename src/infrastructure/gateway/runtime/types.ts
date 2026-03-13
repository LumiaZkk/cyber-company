import type {
  AgentControlSnapshot,
  AgentsDeleteResult,
  AgentListEntry,
  AgentsListResult,
  ChatEventPayload,
  ChatMessage,
  CostUsageTotals,
  CostUsageSummary,
  CronJob,
  CronListResult,
  GatewaySessionArchiveRow,
  GatewaySessionRow,
  SessionCostSummary,
  SessionsArchivesGetResult,
  SessionsArchivesListResult,
  SessionsArchivesRestoreResult,
  SessionsListResult,
  SessionsUsageEntry,
  SessionsUsageResult,
} from "../openclaw/client";
import type { CompanyEvent, CompanyEventsListResult } from "../../../domain/delegation/events";
import type { GatewayEventFrame, GatewayHelloOk } from "../openclaw/browser-client";
import type {
  GatewayAuthCodexOauthCallbackResult,
  GatewayAuthCodexOauthStatusResult,
  GatewayAuthCodexOauthStartResult,
  GatewayAuthImportCodexCliResult,
  GatewayModelChoice,
  GatewayModelsListParams,
} from "../openclaw/types";

// App-level backend contract. The UI should depend on this surface instead of
// importing a concrete provider directly, so future agent backends only need an
// adapter that conforms to these methods and shapes.
export type BackendCapability =
  | "sessionHistory"
  | "sessionArchives"
  | "sessionArchiveRestore"
  | "sessionStatus"
  | "agentLifecycle"
  | "toolLifecycle"
  | "processRuntime"
  | "presence"
  | "runtimeObservability"
  | "cron"
  | "config"
  | "channelStatus"
  | "skillsStatus"
  | "agentFiles"
  | "agentModelOverride"
  | "agentSkillsOverride"
  | "usageInsights";

export type BackendCapabilities = Record<BackendCapability, boolean>;

const DEFAULT_BACKEND_CAPABILITIES: BackendCapabilities = {
  sessionHistory: false,
  sessionArchives: false,
  sessionArchiveRestore: false,
  sessionStatus: false,
  agentLifecycle: false,
  toolLifecycle: false,
  processRuntime: false,
  presence: false,
  runtimeObservability: false,
  cron: false,
  config: false,
  channelStatus: false,
  skillsStatus: false,
  agentFiles: false,
  agentModelOverride: false,
  agentSkillsOverride: false,
  usageInsights: false,
};

export function createBackendCapabilities(
  overrides: Partial<BackendCapabilities> = {},
): BackendCapabilities {
  return { ...DEFAULT_BACKEND_CAPABILITIES, ...overrides };
}

export type BackendHello = GatewayHelloOk;
export type BackendEventFrame = GatewayEventFrame;
export type BackendCloseInfo = {
  code: number;
  reason: string;
  error?: { code: string; message: string; details?: unknown };
};

export type ActorRef = {
  providerId: string;
  actorId: string;
  label?: string;
  role?: string;
  virtual?: boolean;
};

export type ConversationKind = "direct" | "room" | "system";

export type ConversationRef = {
  providerId: string;
  conversationId: string;
  actorId?: string | null;
  kind: ConversationKind;
  native?: boolean;
  sourceKey?: string | null;
};

export type ProviderMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text?: string;
  content?: unknown;
  timestamp: number;
  senderActorId?: string | null;
  conversationId?: string | null;
};

export type RunRef = {
  providerId: string;
  runId: string;
  conversationId?: string | null;
};

export type ProviderSessionState =
  | "unknown"
  | "idle"
  | "running"
  | "streaming"
  | "error"
  | "offline";

export type ProviderRunState =
  | "accepted"
  | "running"
  | "streaming"
  | "completed"
  | "aborted"
  | "error";

export type ProviderRuntimeStreamKind = "lifecycle" | "assistant" | "tool";

export type ProviderSessionStatus = {
  providerId: string;
  sessionKey: string;
  agentId?: string | null;
  state: ProviderSessionState;
  updatedAt?: number | null;
  lastMessageAt?: number | null;
  runId?: string | null;
  errorMessage?: string | null;
  raw?: unknown;
};

export type ProviderRuntimeEvent = {
  providerId: string;
  agentId?: string | null;
  sessionKey?: string | null;
  runId?: string | null;
  streamKind: ProviderRuntimeStreamKind;
  runState?: ProviderRunState | null;
  timestamp: number;
  errorMessage?: string | null;
  toolName?: string | null;
  raw?: unknown;
};

export type ArchiveRef = {
  providerId: string;
  archiveId: string;
  actorId?: string | null;
  conversationId?: string | null;
};

export type ArtifactLocator = {
  providerId: string;
  actorId?: string | null;
  path?: string | null;
  url?: string | null;
};

export type ProviderRuntimeStrategy = "native-multi-actor" | "virtual-actor" | "single-executor";
export type ProviderStorageStrategy = "provider-files" | "product-store";
export type ProviderArchiveStrategy = "provider-archives" | "product-archives";
export type ProviderRoomStrategy = "native-room" | "product-room";

export type ProviderManifest = {
  providerId: string;
  capabilities: BackendCapabilities;
  actorStrategy: ProviderRuntimeStrategy;
  storageStrategy: ProviderStorageStrategy;
  archiveStrategy: ProviderArchiveStrategy;
  roomStrategy: ProviderRoomStrategy;
  notes: string[];
};

export interface BackendCore {
  readonly providerId: string;
  readonly isConnected: boolean;
  readonly capabilities: BackendCapabilities;

  connect(url: string, token?: string): void;
  disconnect(): void;
  probeCapabilities(): Promise<BackendCapabilities>;
  listActors(): Promise<ActorRef[]>;
  ensureConversation(actorRef: ActorRef, kind?: ConversationKind): Promise<ConversationRef>;
  readConversation(
    conversationRef: ConversationRef,
    limit?: number,
  ): Promise<{ conversation: ConversationRef; messages: ProviderMessage[] }>;
  sendTurn(
    conversationRef: ConversationRef,
    input: string,
    opts?: {
      timeoutMs?: number;
      attachments?: Array<{ type: string; mimeType: string; content: string }>;
      targetActorIds?: string[];
    },
  ): Promise<{ run: RunRef; status: "started" | "in_flight" }>;
  watchRuns?(
    conversationRef: ConversationRef,
    handler: (event: BackendEventFrame) => void,
  ): () => void;
  abortRun?(run: RunRef): Promise<{ ok: boolean; aborted: number; runIds: string[] }>;
  getSessionStatus?(sessionKey: string): Promise<ProviderSessionStatus>;
  subscribeAgentRuntime?(handler: (event: ProviderRuntimeEvent) => void): () => void;
}

export interface AgentBackend extends BackendCore {
  subscribe(eventType: string, handler: (payload: unknown) => void): () => void;
  onEvent(handler: (event: BackendEventFrame) => void): void;
  onHello(handler: (hello: BackendHello) => void): void;
  onClose(handler: (info: BackendCloseInfo) => void): void;
  request<T = unknown>(method: string, params?: unknown): Promise<T>;

  listAgents(): Promise<AgentsListResult>;
  listModels(params?: GatewayModelsListParams): Promise<{ models: GatewayModelChoice[] }>;
  refreshModels(): Promise<{ models: GatewayModelChoice[] }>;
  startCodexOAuth(): Promise<GatewayAuthCodexOauthStartResult>;
  getCodexOAuthStatus(state: string): Promise<GatewayAuthCodexOauthStatusResult>;
  completeCodexOAuth(params: {
    code: string;
    state: string;
  }): Promise<GatewayAuthCodexOauthCallbackResult>;
  importCodexCliAuth(): Promise<GatewayAuthImportCodexCliResult>;
  updateAgent(params: {
    agentId: string;
    name?: string;
    workspace?: string;
    model?: string;
    avatar?: string;
  }): Promise<{ ok: true; agentId: string }>;
  createAgent(name: string): Promise<{ ok: true; agentId: string; name: string; workspace: string }>;
  deleteAgent(
    agentId: string,
    opts?: { deleteFiles?: boolean; purgeState?: boolean },
  ): Promise<AgentsDeleteResult>;
  listAgentFiles(agentId: string): Promise<{ agentId: string; workspace: string; files: Array<{
    name: string;
    path: string;
    missing: boolean;
    size?: number;
    updatedAtMs?: number;
    content?: string;
  }> }>;
  getAgentFile(agentId: string, name: string): Promise<{
    agentId: string;
    workspace: string;
    file: {
      name: string;
      path: string;
      missing: boolean;
      size?: number;
      updatedAtMs?: number;
      content?: string;
    };
  }>;
  setAgentFile(agentId: string, name: string, content: string): Promise<{
    ok: true;
    agentId: string;
    workspace: string;
    file: {
      name: string;
      path: string;
      missing: boolean;
      size?: number;
      updatedAtMs?: number;
      content?: string;
    };
  }>;
  listSessions(opts?: {
    limit?: number;
    activeMinutes?: number;
    includeGlobal?: boolean;
    includeUnknown?: boolean;
    includeDerivedTitles?: boolean;
    includeLastMessage?: boolean;
    label?: string;
    spawnedBy?: string;
    agentId?: string;
    search?: string;
  }): Promise<SessionsListResult>;
  resetSession(sessionKey: string, reason?: "new" | "reset"): Promise<{ ok: true; key: string }>;
  deleteSession(sessionKey: string): Promise<{ ok: boolean; deleted: boolean }>;
  listSessionArchives(agentId: string, limit?: number): Promise<SessionsArchivesListResult>;
  getSessionArchive(agentId: string, archiveId: string, limit?: number): Promise<SessionsArchivesGetResult>;
  deleteSessionArchive(agentId: string, archiveId: string): Promise<{ ok: boolean; removed: boolean }>;
  restoreSessionArchive(
    agentId: string,
    archiveId: string,
    key: string,
  ): Promise<SessionsArchivesRestoreResult>;
  compactSession(sessionKey: string, maxLines?: number): Promise<{ ok: boolean; compacted: boolean }>;
  resolveSession(agentId: string): Promise<{ ok: boolean; key: string; error?: string }>;
  getChatHistory(sessionKey: string, limit?: number): Promise<{
    sessionKey?: string;
    sessionId?: string;
    messages: ChatMessage[];
    thinkingLevel?: string;
  }>;
  sendChatMessage(
    sessionKey: string,
    message: string,
    opts?: {
      timeoutMs?: number;
      attachments?: Array<{ type: string; mimeType: string; content: string }>;
    },
  ): Promise<{ runId: string; status: "started" | "in_flight" }>;
  appendCompanyEvent(event: CompanyEvent): Promise<{ ok: true; event: CompanyEvent }>;
  listCompanyEvents(params: {
    companyId: string;
    since?: number;
    cursor?: string;
    limit?: number;
  }): Promise<CompanyEventsListResult>;
  listCron(): Promise<CronListResult>;
  addCron(job: Record<string, unknown>): Promise<unknown>;
  updateCron(jobId: string, patch: Record<string, unknown>): Promise<unknown>;
  removeCron(id: string): Promise<boolean>;
  getUsageCost(params?: { days?: number }): Promise<CostUsageSummary>;
  getSessionsUsage(params?: {
    key?: string;
    startDate?: string;
    endDate?: string;
    mode?: "utc" | "gateway" | "specific";
    utcOffset?: string;
    limit?: number;
    includeContextWeight?: boolean;
  }): Promise<SessionsUsageResult>;
  getChannelsStatus(): Promise<Record<string, unknown>>;
  getSkillsStatus(agentId?: string): Promise<Record<string, unknown>>;
  getHealth(): Promise<Record<string, unknown>>;
  getStatus(): Promise<Record<string, unknown>>;
  getSessionStatus(sessionKey: string): Promise<ProviderSessionStatus>;
  subscribeAgentRuntime(handler: (event: ProviderRuntimeEvent) => void): () => void;
  listProcesses?(sessionKey?: string): Promise<unknown>;
  pollProcess?(id: string): Promise<unknown>;
  getConfigSnapshot(): Promise<{
    path: string;
    exists: boolean;
    valid: boolean;
    hash?: string;
    config: Record<string, unknown>;
  }>;
  setConfig(config: Record<string, unknown>, baseHash: string): Promise<unknown>;
  patchConfig(patch: Record<string, unknown>, baseHash: string): Promise<unknown>;
  alignAgentSkillsToDefaults(
    agentIds: string[],
  ): Promise<{ updated: number; defaultSkills: string[] | null }>;
  getAgentControlSnapshot(agentId: string): Promise<AgentControlSnapshot>;
  setAgentModelOverride(
    agentId: string,
    model: string | null,
  ): Promise<{ updated: boolean; modelOverride: string | null }>;
  setAgentSkillsOverride(
    agentId: string,
    skills: string[] | null,
  ): Promise<{ updated: boolean; skillsOverride: string[] | null }>;
  abortChatRunsForSessionKeyWithPartials(
    sessionKey: string,
    runId?: string,
  ): Promise<{ ok: boolean; aborted: number; runIds: string[] }>;
}

export type {
  AgentControlSnapshot,
  AgentsDeleteResult,
  AgentListEntry,
  AgentsListResult,
  ChatEventPayload,
  ChatMessage,
  CompanyEvent,
  CompanyEventsListResult,
  CostUsageTotals,
  CostUsageSummary,
  CronJob,
  CronListResult,
  GatewayAuthCodexOauthCallbackResult,
  GatewayAuthCodexOauthStatusResult,
  GatewayAuthCodexOauthStartResult,
  GatewayAuthImportCodexCliResult,
  GatewayModelChoice,
  GatewayModelsListParams,
  GatewaySessionArchiveRow,
  GatewaySessionRow,
  SessionCostSummary,
  SessionsArchivesGetResult,
  SessionsArchivesListResult,
  SessionsArchivesRestoreResult,
  SessionsListResult,
  SessionsUsageEntry,
  SessionsUsageResult,
};
