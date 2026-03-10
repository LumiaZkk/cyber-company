import { authorityClient } from "../../authority/client";
import {
  AUTHORITY_PROVIDER_ID,
  DEFAULT_AUTHORITY_URL,
  type AuthorityEvent,
} from "../../authority/contract";
import {
  createBackendCapabilities,
  type AgentControlSnapshot,
  type ActorRef,
  type AgentBackend,
  type BackendCloseInfo,
  type BackendEventFrame,
  type BackendHello,
  type CompanyEventsListResult,
  type ConversationKind,
  type ConversationRef,
  type GatewayAuthCodexOauthCallbackResult,
  type GatewayAuthCodexOauthStartResult,
  type GatewayAuthCodexOauthStatusResult,
  type GatewayAuthImportCodexCliResult,
  type ProviderMessage,
  type SessionsArchivesGetResult,
  type SessionsArchivesRestoreResult,
  type SessionsUsageResult,
} from "../runtime/types";

const authorityCapabilities = createBackendCapabilities({
  sessionHistory: true,
  sessionArchives: false,
  sessionArchiveRestore: false,
  cron: false,
  config: false,
  channelStatus: true,
  skillsStatus: true,
  agentFiles: true,
  agentModelOverride: false,
  agentSkillsOverride: false,
  usageInsights: false,
});

function toBackendEventFrame(event: AuthorityEvent): BackendEventFrame {
  return {
    type: "event",
    event: event.type,
    payload: event.type === "chat" ? event.payload : event.payload,
    seq: 0,
  };
}

function toHello(url: string): BackendHello {
  return {
    type: "hello-ok",
    protocol: 1,
    server: {
      version: "authority-v1",
      connId: url,
    },
    features: {
      methods: [],
      events: [
        "bootstrap.updated",
        "company.updated",
        "conversation.updated",
        "requirement.updated",
        "room.updated",
        "dispatch.updated",
        "artifact.updated",
        "executor.status",
        "chat",
      ],
    },
  };
}

class AuthorityBackendAdapter implements AgentBackend {
  readonly providerId = AUTHORITY_PROVIDER_ID;
  readonly capabilities = authorityCapabilities;
  private connected = false;
  private unsubscribeEvents: (() => void) | null = null;
  private subscriptions = new Map<string, Set<(payload: unknown) => void>>();
  private onEventHandler: ((event: BackendEventFrame) => void) | null = null;
  private onHelloHandler: ((hello: BackendHello) => void) | null = null;
  private onCloseHandler: ((info: BackendCloseInfo) => void) | null = null;

  get isConnected() {
    return this.connected;
  }

  connect(url: string) {
    authorityClient.setBaseUrl(url || DEFAULT_AUTHORITY_URL);
    this.disconnect();
    this.unsubscribeEvents = authorityClient.connectEvents({
      onOpen: () => {
        this.connected = true;
        this.onHelloHandler?.(toHello(authorityClient.url));
      },
      onClose: (event) => {
        this.connected = false;
        this.onCloseHandler?.({
          code: event.code,
          reason: event.reason,
        });
      },
      onMessage: (event) => {
        const frame = toBackendEventFrame(event);
        this.onEventHandler?.(frame);
        const exactHandlers = this.subscriptions.get(event.type);
        exactHandlers?.forEach((handler) =>
          handler(event.type === "chat" ? event.payload : event.payload ?? event),
        );
        const wildcardHandlers = this.subscriptions.get("*");
        wildcardHandlers?.forEach((handler) => handler(frame));
      },
    });
  }

  disconnect() {
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = null;
    this.connected = false;
  }

  async probeCapabilities() {
    await authorityClient.health();
    return this.capabilities;
  }

  async listActors(): Promise<ActorRef[]> {
    const result = await authorityClient.listActors();
    return result.agents.map((agent) => ({
      providerId: this.providerId,
      actorId: agent.id,
      label: agent.name,
      role: agent.identity?.name,
    }));
  }

  async ensureConversation(actorRef: ActorRef, kind: ConversationKind = "direct"): Promise<ConversationRef> {
    return {
      providerId: this.providerId,
      actorId: actorRef.actorId,
      kind,
      native: true,
      sourceKey: `agent:${actorRef.actorId}:main`,
      conversationId: `agent:${actorRef.actorId}:main`,
    };
  }

  async readConversation(conversationRef: ConversationRef, limit?: number) {
    const history = await authorityClient.getChatHistory(conversationRef.conversationId, limit);
    const messages: ProviderMessage[] = (history.messages ?? []).map((message, index) => ({
      id: `${conversationRef.conversationId}:${message.timestamp ?? Date.now()}:${index}`,
      role:
        message.role === "assistant"
          ? "assistant"
          : message.role === "system"
            ? "system"
            : "user",
      text: typeof message.text === "string" ? message.text : undefined,
      content: message.content,
      timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
      senderActorId: conversationRef.actorId ?? null,
      conversationId: conversationRef.conversationId,
    }));
    return {
      conversation: conversationRef,
      messages,
    };
  }

  async sendTurn(
    conversationRef: ConversationRef,
    input: string,
    opts?: Parameters<AgentBackend["sendTurn"]>[2],
  ) {
    const actorId = conversationRef.actorId ?? conversationRef.conversationId.split(":")[1] ?? "";
    const bootstrap = await authorityClient.bootstrap();
    const companyId = bootstrap.activeCompany?.id ?? bootstrap.config?.activeCompanyId;
    if (!companyId) {
      throw new Error("No active company selected in authority.");
    }
    const result = await authorityClient.sendChat({
      companyId,
      actorId,
      sessionKey: conversationRef.conversationId,
      message: input,
      attachments: opts?.attachments,
    });
    return {
      run: {
        providerId: this.providerId,
        runId: result.runId,
        conversationId: result.sessionKey,
      },
      status: result.status,
    };
  }

  watchRuns(
    conversationRef: ConversationRef,
    handler: (event: BackendEventFrame) => void,
  ) {
    return this.subscribe("chat", (payload) => {
      const sessionKey =
        typeof payload === "object" && payload && "sessionKey" in payload
          ? String((payload as Record<string, unknown>).sessionKey ?? "")
          : "";
      if (sessionKey === conversationRef.conversationId) {
        handler({
          type: "event",
          event: "chat",
          payload,
          seq: 0,
        });
      }
    });
  }

  abortRun() {
    return Promise.resolve({ ok: false, aborted: 0, runIds: [] });
  }

  subscribe(eventType: string, handler: (payload: unknown) => void) {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType)?.add(handler);
    return () => {
      this.subscriptions.get(eventType)?.delete(handler);
    };
  }

  onEvent(handler: (event: BackendEventFrame) => void) {
    this.onEventHandler = handler;
  }

  onHello(handler: (hello: BackendHello) => void) {
    this.onHelloHandler = handler;
  }

  onClose(handler: (info: BackendCloseInfo) => void) {
    this.onCloseHandler = handler;
  }

  async request<T = unknown>(method: string): Promise<T> {
    if (method === "authority.health") {
      return (await authorityClient.health()) as T;
    }
    throw new Error(`Authority backend does not support request("${method}").`);
  }

  async listAgents() {
    const result = await authorityClient.listActors();
    return {
      defaultId: result.agents[0]?.id ?? "ceo",
      mainKey: result.agents[0]?.id ?? "ceo",
      scope: "global" as const,
      agents: result.agents,
    };
  }

  async listModels() {
    return { models: [] };
  }

  async refreshModels() {
    return { models: [] };
  }

  async startCodexOAuth(): Promise<GatewayAuthCodexOauthStartResult> {
    throw new Error("Codex OAuth is managed by the authority executor, not the browser client.");
  }

  async getCodexOAuthStatus(_state: string): Promise<GatewayAuthCodexOauthStatusResult> {
    void _state;
    return {
      status: "error",
      expiresAtMs: Date.now(),
      errorMessage: "Codex OAuth is managed by the authority executor, not the browser client.",
    };
  }

  async completeCodexOAuth(_params: {
    code: string;
    state: string;
  }): Promise<GatewayAuthCodexOauthCallbackResult> {
    void _params;
    throw new Error("Codex OAuth is managed by the authority executor.");
  }

  async importCodexCliAuth(): Promise<GatewayAuthImportCodexCliResult> {
    throw new Error("Codex CLI import is managed by the authority executor.");
  }

  async updateAgent(params: { agentId: string }) {
    return { ok: true as const, agentId: params.agentId };
  }

  async createAgent(name: string) {
    return { ok: true as const, agentId: name, name, workspace: `authority://${name}` };
  }

  async deleteAgent(agentId: string) {
    return { ok: true as const, agentId };
  }

  listAgentFiles(agentId: string) {
    return authorityClient.listAgentFiles(agentId);
  }

  getAgentFile(agentId: string, name: string) {
    return authorityClient.getAgentFile(agentId, name);
  }

  setAgentFile(agentId: string, name: string, content: string) {
    return authorityClient.setAgentFile(agentId, name, content);
  }

  listSessions(opts?: { agentId?: string | null }) {
    return authorityClient.listSessions(undefined, opts?.agentId);
  }

  async resetSession(sessionKey: string) {
    return authorityClient.resetSession(sessionKey);
  }

  async deleteSession(sessionKey: string) {
    return authorityClient.deleteSession(sessionKey);
  }

  async listSessionArchives(agentId: string) {
    return { ts: Date.now(), agentId, archives: [] };
  }

  async getSessionArchive(
    _agentId: string,
    _archiveId: string,
    _limit?: number,
  ): Promise<SessionsArchivesGetResult> {
    void _agentId;
    void _archiveId;
    void _limit;
    throw new Error("Authority v1 does not support session archives.");
  }

  async deleteSessionArchive() {
    return { ok: false, removed: false };
  }

  async restoreSessionArchive(
    _agentId: string,
    _archiveId: string,
    _key: string,
  ): Promise<SessionsArchivesRestoreResult> {
    void _agentId;
    void _archiveId;
    void _key;
    throw new Error("Authority v1 does not support archive restore.");
  }

  async compactSession() {
    return { ok: false, compacted: false };
  }

  async resolveSession(agentId: string) {
    return { ok: true as const, key: `agent:${agentId}:main` };
  }

  getChatHistory(sessionKey: string, limit?: number) {
    return authorityClient.getChatHistory(sessionKey, limit);
  }

  sendChatMessage(
    sessionKey: string,
    message: string,
    opts?: { attachments?: Array<{ type: string; mimeType: string; content: string }> },
  ) {
    const actorId = sessionKey.split(":")[1] ?? "";
    return authorityClient
      .bootstrap()
      .then((bootstrap) => {
        const companyId = bootstrap.activeCompany?.id ?? bootstrap.config?.activeCompanyId;
        if (!companyId) {
          throw new Error("No active company selected in authority.");
        }
        return authorityClient.sendChat({
          companyId,
          actorId,
          sessionKey,
          message,
          attachments: opts?.attachments,
        });
      });
  }

  async appendCompanyEvent(event: Parameters<AgentBackend["appendCompanyEvent"]>[0]) {
    return authorityClient.appendCompanyEvent({ event });
  }

  listCompanyEvents(params: {
    companyId: string;
    since?: number;
    cursor?: string;
    limit?: number;
  }): Promise<CompanyEventsListResult> {
    return authorityClient.listCompanyEvents(params.companyId, params.cursor, params.since).then((result) => ({
      companyId: result.companyId,
      ok: true as const,
      events: result.events as CompanyEventsListResult["events"],
      nextCursor: result.nextCursor,
    }));
  }

  async listCron() {
    return { jobs: [] };
  }

  async addCron() {
    throw new Error("Authority v1 does not expose browser-side cron management.");
  }

  async updateCron() {
    throw new Error("Authority v1 does not expose browser-side cron management.");
  }

  async removeCron() {
    return false;
  }

  async getUsageCost({ days = 30 } = {}) {
    return {
      updatedAt: Date.now(),
      days,
      totals: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        totalCost: 0,
      },
    };
  }

  async getSessionsUsage({
    startDate,
    endDate,
  }: {
    key?: string;
    startDate?: string;
    endDate?: string;
    mode?: "utc" | "gateway" | "specific";
    utcOffset?: string;
    limit?: number;
    includeContextWeight?: boolean;
  } = {}): Promise<SessionsUsageResult> {
    const today = new Date().toISOString().slice(0, 10);
    return {
      updatedAt: Date.now(),
      startDate: startDate ?? today,
      endDate: endDate ?? today,
      sessions: [],
      totals: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        totalCost: 0,
      },
    };
  }

  async getChannelsStatus() {
    const health = await authorityClient.health();
    return {
      authority: "online",
      executor: health.executor.state,
      provider: health.executor.provider,
    };
  }

  async getSkillsStatus() {
    return {
      authority: "native",
    };
  }

  getHealth() {
    return authorityClient.health();
  }

  getStatus() {
    return authorityClient.health();
  }

  async getConfigSnapshot() {
    const bootstrap = await authorityClient.bootstrap();
    return {
      path: "authority://config",
      exists: Boolean(bootstrap.config),
      valid: true,
      hash: bootstrap.config ? String(bootstrap.config.companies.length) : undefined,
      config: (bootstrap.config ?? {}) as Record<string, unknown>,
    };
  }

  async setConfig() {
    throw new Error("Authority config is managed through company commands.");
  }

  async patchConfig() {
    throw new Error("Authority config is managed through company commands.");
  }

  async alignAgentSkillsToDefaults(agentIds: string[]) {
    return { updated: 0, defaultSkills: agentIds.length > 0 ? [] : null };
  }

  async getAgentControlSnapshot(agentId: string): Promise<AgentControlSnapshot> {
    return {
      agentId,
      defaultModel: null,
      defaultSkills: null,
      modelOverride: null,
      skillsOverride: null,
    };
  }

  async setAgentModelOverride(_agentId: string, model: string | null) {
    return { updated: false, modelOverride: model };
  }

  async setAgentSkillsOverride(_agentId: string, skills: string[] | null) {
    return { updated: false, skillsOverride: skills ?? null };
  }

  async abortChatRunsForSessionKeyWithPartials() {
    return { ok: false, aborted: 0, runIds: [] };
  }
}

export const authorityBackend = new AuthorityBackendAdapter();
