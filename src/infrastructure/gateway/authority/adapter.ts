import { authorityClient } from "../../authority/client";
import {
  AUTHORITY_PROVIDER_ID,
  DEFAULT_AUTHORITY_URL,
  type AuthorityBootstrapSnapshot,
  type AuthorityEvent,
  type AuthorityGatewayConfigSnapshot,
  type AuthorityModelsResponse,
} from "../../authority/contract";
import {
  createBackendCapabilities,
  type AgentControlSnapshot,
  type AgentsDeleteResult,
  type AgentsListResult,
  type ActorRef,
  type AgentBackend,
  type BackendCloseInfo,
  type BackendEventFrame,
  type BackendHello,
  type CompanyEventsListResult,
  type ConversationKind,
  type CostUsageSummary,
  type CronListResult,
  type ConversationRef,
  type GatewayAuthCodexOauthCallbackResult,
  type GatewayAuthCodexOauthStartResult,
  type GatewayAuthCodexOauthStatusResult,
  type GatewayAuthImportCodexCliResult,
  type GatewayModelsListParams,
  type ProviderMessage,
  type SessionsArchivesGetResult,
  type SessionsArchivesListResult,
  type SessionsArchivesRestoreResult,
  type SessionsListResult,
  type SessionsUsageResult,
} from "../runtime/types";

const authorityCapabilities = createBackendCapabilities({
  sessionHistory: true,
  sessionArchives: false,
  sessionArchiveRestore: false,
  cron: true,
  config: true,
  channelStatus: true,
  skillsStatus: true,
  agentFiles: true,
  agentModelOverride: false,
  agentSkillsOverride: false,
  usageInsights: true,
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
      methods: ["authority.company.employee.hire"],
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
      timeoutMs: opts?.timeoutMs,
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

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (method === "authority.health") {
      return (await authorityClient.health()) as T;
    }
    if (method === "authority.bootstrap") {
      return (await authorityClient.bootstrap()) as T;
    }
    if (method === "authority.config.save") {
      const config =
        typeof params === "object" && params && "config" in params
          ? (params as { config: AuthorityBootstrapSnapshot["config"] }).config
          : null;
      if (!config) {
        throw new Error("authority.config.save requires a config payload.");
      }
      return (await authorityClient.updateConfig(config)) as T;
    }
    if (method === "authority.company.create") {
      return (await authorityClient.createCompany(params as Parameters<typeof authorityClient.createCompany>[0])) as T;
    }
    if (method === "authority.company.employee.hire") {
      return (await authorityClient.hireEmployee(
        params as Parameters<typeof authorityClient.hireEmployee>[0],
      )) as T;
    }
    if (method === "authority.company.delete") {
      const companyId =
        typeof params === "object" && params && "companyId" in params
          ? String((params as { companyId: string }).companyId ?? "")
          : "";
      if (!companyId) {
        throw new Error("authority.company.delete requires companyId.");
      }
      return (await authorityClient.deleteCompany(companyId)) as T;
    }
    if (method === "authority.company.switch") {
      return (await authorityClient.switchCompany(params as Parameters<typeof authorityClient.switchCompany>[0])) as T;
    }
    if (method === "authority.company.runtime.get") {
      const companyId =
        typeof params === "object" && params && "companyId" in params
          ? String((params as { companyId: string }).companyId ?? "")
          : "";
      if (!companyId) {
        throw new Error("authority.company.runtime.get requires companyId.");
      }
      return (await authorityClient.getRuntime(companyId)) as T;
    }
    if (method === "authority.company.runtime.sync") {
      const payload = params as { companyId: string; snapshot: AuthorityBootstrapSnapshot["runtime"] };
      if (!payload?.companyId || !payload.snapshot) {
        throw new Error("authority.company.runtime.sync requires companyId and snapshot.");
      }
      return (await authorityClient.syncRuntime(payload.companyId, { snapshot: payload.snapshot })) as T;
    }
    if (method === "authority.requirement.transition") {
      return (await authorityClient.transitionRequirement(
        params as Parameters<typeof authorityClient.transitionRequirement>[0],
      )) as T;
    }
    if (method === "authority.room.append") {
      return (await authorityClient.appendRoom(
        params as Parameters<typeof authorityClient.appendRoom>[0],
      )) as T;
    }
    if (method === "authority.room-bindings.upsert") {
      return (await authorityClient.upsertRoomBindings(
        params as Parameters<typeof authorityClient.upsertRoomBindings>[0],
      )) as T;
    }
    if (method === "authority.dispatch.create") {
      return (await authorityClient.upsertDispatch(
        params as Parameters<typeof authorityClient.upsertDispatch>[0],
      )) as T;
    }
    if (method === "authority.executor.get") {
      return (await authorityClient.getExecutorConfig()) as T;
    }
    if (method === "authority.executor.patch") {
      return (await authorityClient.patchExecutorConfig(params as Parameters<typeof authorityClient.patchExecutorConfig>[0])) as T;
    }
    return authorityClient.requestGateway<T>(method, params);
  }

  async listAgents(): Promise<AgentsListResult> {
    const result = await authorityClient.listActors();
    return {
      defaultId: result.agents[0]?.id ?? "ceo",
      mainKey: result.agents[0]?.id ?? "ceo",
      scope: "global" as const,
      agents: result.agents,
    };
  }

  async listModels(params?: GatewayModelsListParams): Promise<AuthorityModelsResponse> {
    return authorityClient.requestGateway<AuthorityModelsResponse>("models.list", params ?? {});
  }

  async refreshModels(): Promise<AuthorityModelsResponse> {
    return authorityClient.requestGateway<AuthorityModelsResponse>("models.refresh", {});
  }

  async startCodexOAuth(): Promise<GatewayAuthCodexOauthStartResult> {
    return authorityClient.requestGateway("auth.codexOauthStart", {});
  }

  async getCodexOAuthStatus(state: string): Promise<GatewayAuthCodexOauthStatusResult> {
    return authorityClient.requestGateway("auth.codexOauthStatus", { state });
  }

  async completeCodexOAuth(params: {
    code: string;
    state: string;
  }): Promise<GatewayAuthCodexOauthCallbackResult> {
    return authorityClient.requestGateway("auth.codexOauthCallback", params);
  }

  async importCodexCliAuth(): Promise<GatewayAuthImportCodexCliResult> {
    return authorityClient.requestGateway("auth.importCodexCli", {});
  }

  async updateAgent(
    params: { agentId: string; name?: string; workspace?: string; model?: string; avatar?: string },
  ): Promise<{ ok: true; agentId: string }> {
    return authorityClient.requestGateway<{ ok: true; agentId: string }>("agents.update", params);
  }

  async createAgent(name: string): Promise<{ ok: true; agentId: string; name: string; workspace: string }> {
    return authorityClient.requestGateway<{ ok: true; agentId: string; name: string; workspace: string }>("agents.create", {
      name,
      workspace: `~/.openclaw/workspaces/${name}`,
    });
  }

  async deleteAgent(agentId: string, opts?: { deleteFiles?: boolean; purgeState?: boolean }): Promise<AgentsDeleteResult> {
    return authorityClient.requestGateway<AgentsDeleteResult>("agents.delete", {
      agentId,
      deleteFiles: opts?.deleteFiles ?? true,
      purgeState: opts?.purgeState ?? true,
    });
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

  listSessions(opts?: Parameters<AgentBackend["listSessions"]>[0]): Promise<SessionsListResult> {
    return authorityClient.requestGateway<SessionsListResult>("sessions.list", opts ?? {});
  }

  async resetSession(sessionKey: string) {
    return authorityClient.resetSession(sessionKey);
  }

  async deleteSession(sessionKey: string) {
    return authorityClient.deleteSession(sessionKey);
  }

  async listSessionArchives(agentId: string, limit?: number): Promise<SessionsArchivesListResult> {
    return authorityClient.requestGateway<SessionsArchivesListResult>("sessions.archives.list", {
      agentId,
      ...(typeof limit === "number" ? { limit } : {}),
    });
  }

  async getSessionArchive(
    _agentId: string,
    _archiveId: string,
    _limit?: number,
  ): Promise<SessionsArchivesGetResult> {
    return authorityClient.requestGateway<SessionsArchivesGetResult>("sessions.archives.get", {
      agentId: _agentId,
      archiveId: _archiveId,
      ...(typeof _limit === "number" ? { limit: _limit } : {}),
    });
  }

  async deleteSessionArchive(agentId: string, archiveId: string): Promise<{ ok: boolean; removed: boolean }> {
    return authorityClient.requestGateway<{ ok: boolean; removed: boolean }>("sessions.archives.delete", { agentId, archiveId });
  }

  async restoreSessionArchive(
    _agentId: string,
    _archiveId: string,
    _key: string,
  ): Promise<SessionsArchivesRestoreResult> {
    return authorityClient.requestGateway<SessionsArchivesRestoreResult>("sessions.archives.restore", {
      agentId: _agentId,
      archiveId: _archiveId,
      key: _key,
    });
  }

  async compactSession(sessionKey: string, maxLines?: number): Promise<{ ok: boolean; compacted: boolean }> {
    return authorityClient.requestGateway<{ ok: boolean; compacted: boolean }>("sessions.compact", {
      key: sessionKey,
      ...(typeof maxLines === "number" ? { maxLines } : {}),
    });
  }

  async resolveSession(agentId: string): Promise<{ ok: boolean; key: string; error?: string }> {
    return {
      ok: true as const,
      key: `agent:${agentId}:main`,
    };
  }

  getChatHistory(sessionKey: string, limit?: number) {
    return authorityClient.getChatHistory(sessionKey, limit);
  }

  sendChatMessage(
    sessionKey: string,
    message: string,
    opts?: {
      timeoutMs?: number;
      attachments?: Array<{ type: string; mimeType: string; content: string }>;
    },
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
          timeoutMs: opts?.timeoutMs,
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

  async listCron(): Promise<CronListResult> {
    return authorityClient.requestGateway<CronListResult>("cron.list", {});
  }

  async addCron(job: Record<string, unknown>) {
    return authorityClient.requestGateway("cron.add", job);
  }

  async updateCron(jobId: string, patch: Record<string, unknown>) {
    return authorityClient.requestGateway("cron.update", { jobId, patch });
  }

  async removeCron(id: string) {
    const response = await authorityClient.requestGateway<{ ok: boolean }>("cron.remove", { id });
    return response.ok;
  }

  async getUsageCost({ days = 30 } = {}): Promise<CostUsageSummary> {
    return authorityClient.requestGateway<CostUsageSummary>("usage.cost", { days });
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
    return authorityClient.requestGateway<SessionsUsageResult>("sessions.usage", {
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
  }

  async getChannelsStatus(): Promise<Record<string, unknown>> {
    return authorityClient.requestGateway<Record<string, unknown>>("channels.status", {});
  }

  async getSkillsStatus(agentId?: string): Promise<Record<string, unknown>> {
    return authorityClient.requestGateway<Record<string, unknown>>("skills.status", agentId ? { agentId } : {});
  }

  getHealth() {
    return authorityClient.health();
  }

  getStatus() {
    return authorityClient.health();
  }

  getConfigSnapshot(): Promise<AuthorityGatewayConfigSnapshot> {
    return authorityClient.requestGateway<AuthorityGatewayConfigSnapshot>("config.get", {});
  }

  setConfig(config: Record<string, unknown>, baseHash: string) {
    return authorityClient.requestGateway("config.set", {
      raw: JSON.stringify(config, null, 2),
      baseHash,
    });
  }

  patchConfig(patch: Record<string, unknown>, baseHash: string) {
    return authorityClient.requestGateway("config.patch", {
      raw: JSON.stringify(patch, null, 2),
      baseHash,
    });
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
