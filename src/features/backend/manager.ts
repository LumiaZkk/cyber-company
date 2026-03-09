import {
  backendProviders,
  getDefaultBackendProviderId,
  type BackendProviderDefinition,
  type BackendProviderMeta,
} from "./providers";
import type {
  AgentBackend,
  ActorRef,
  BackendCloseInfo,
  BackendEventFrame,
  BackendHello,
  ConversationKind,
  ConversationRef,
  RunRef,
} from "./types";

type EventSubscription = {
  eventType: string;
  handler: (payload: unknown) => void;
  unsubscribe: (() => void) | null;
};

export class BackendManager implements AgentBackend {
  private activeProviderId: string;
  private onEventHandler: ((event: BackendEventFrame) => void) | null = null;
  private onHelloHandler: ((hello: BackendHello) => void) | null = null;
  private onCloseHandler: ((info: BackendCloseInfo) => void) | null = null;
  private readonly subscriptions = new Set<EventSubscription>();
  private readonly providers: BackendProviderDefinition[];

  constructor(providers: BackendProviderDefinition[]) {
    this.providers = providers;
    this.activeProviderId =
      providers.find((provider) => provider.id === getDefaultBackendProviderId())?.id
      ?? providers[0]?.id
      ?? getDefaultBackendProviderId();
    for (const provider of providers) {
      provider.backend.onEvent((event) => {
        if (provider.id === this.activeProviderId) {
          this.onEventHandler?.(event);
        }
      });
      provider.backend.onHello((hello) => {
        if (provider.id === this.activeProviderId) {
          this.onHelloHandler?.(hello);
        }
      });
      provider.backend.onClose((info) => {
        if (provider.id === this.activeProviderId) {
          this.onCloseHandler?.(info);
        }
      });
    }
  }

  get providerId() {
    return this.activeProviderId;
  }

  get isConnected() {
    return this.currentBackend.isConnected;
  }

  get capabilities() {
    return this.currentBackend.capabilities;
  }

  get currentProvider() {
    return (
      this.providers.find((provider) => provider.id === this.activeProviderId)
      ?? this.providers[0]
    );
  }

  private get currentBackend(): AgentBackend {
    return this.currentProvider.backend;
  }

  listProviders(): BackendProviderMeta[] {
    return this.providers.map(({ backend: _backend, ...provider }) => provider);
  }

  setActiveProvider(providerId: string) {
    const nextProvider =
      this.providers.find((provider) => provider.id === providerId)
      ?? this.providers[0];
    if (!nextProvider || nextProvider.id === this.activeProviderId) {
      return;
    }
    const previousBackend = this.currentBackend;
    previousBackend.disconnect();
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe?.();
      subscription.unsubscribe = null;
    }
    this.activeProviderId = nextProvider.id;
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe = this.currentBackend.subscribe(
        subscription.eventType,
        subscription.handler,
      );
    }
  }

  connect(url: string, token?: string): void {
    this.currentBackend.connect(url, token);
  }

  disconnect(): void {
    this.currentBackend.disconnect();
  }

  probeCapabilities() {
    return this.currentBackend.probeCapabilities();
  }

  listActors(): Promise<ActorRef[]> {
    return this.currentBackend.listActors();
  }

  ensureConversation(actorRef: ActorRef, kind?: ConversationKind): Promise<ConversationRef> {
    return this.currentBackend.ensureConversation(actorRef, kind);
  }

  readConversation(conversationRef: ConversationRef, limit?: number) {
    return this.currentBackend.readConversation(conversationRef, limit);
  }

  sendTurn(
    conversationRef: ConversationRef,
    input: string,
    opts?: Parameters<AgentBackend["sendTurn"]>[2],
  ) {
    return this.currentBackend.sendTurn(conversationRef, input, opts);
  }

  watchRuns(
    conversationRef: ConversationRef,
    handler: (event: BackendEventFrame) => void,
  ): () => void {
    return this.currentBackend.watchRuns
      ? this.currentBackend.watchRuns(conversationRef, handler)
      : () => {};
  }

  abortRun(run: RunRef) {
    if (!this.currentBackend.abortRun) {
      return Promise.resolve({ ok: false, aborted: 0, runIds: [] });
    }
    return this.currentBackend.abortRun(run);
  }

  subscribe(eventType: string, handler: (payload: unknown) => void): () => void {
    const subscription: EventSubscription = {
      eventType,
      handler,
      unsubscribe: this.currentBackend.subscribe(eventType, handler),
    };
    this.subscriptions.add(subscription);
    return () => {
      subscription.unsubscribe?.();
      this.subscriptions.delete(subscription);
    };
  }

  onEvent(handler: (event: BackendEventFrame) => void): void {
    this.onEventHandler = handler;
  }

  onHello(handler: (hello: BackendHello) => void): void {
    this.onHelloHandler = handler;
  }

  onClose(handler: (info: BackendCloseInfo) => void): void {
    this.onCloseHandler = handler;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    return this.currentBackend.request<T>(method, params);
  }

  appendCompanyEvent(event: Parameters<AgentBackend["appendCompanyEvent"]>[0]) {
    return this.currentBackend.appendCompanyEvent(event);
  }

  listCompanyEvents(params: Parameters<AgentBackend["listCompanyEvents"]>[0]) {
    return this.currentBackend.listCompanyEvents(params);
  }

  listAgents() {
    return this.currentBackend.listAgents();
  }

  listModels(params?: Parameters<AgentBackend["listModels"]>[0]) {
    return this.currentBackend.listModels(params);
  }

  refreshModels() {
    return this.currentBackend.refreshModels();
  }

  startCodexOAuth() {
    return this.currentBackend.startCodexOAuth();
  }

  getCodexOAuthStatus(state: string) {
    return this.currentBackend.getCodexOAuthStatus(state);
  }

  completeCodexOAuth(params: Parameters<AgentBackend["completeCodexOAuth"]>[0]) {
    return this.currentBackend.completeCodexOAuth(params);
  }

  importCodexCliAuth() {
    return this.currentBackend.importCodexCliAuth();
  }

  updateAgent(params: Parameters<AgentBackend["updateAgent"]>[0]) {
    return this.currentBackend.updateAgent(params);
  }

  createAgent(name: string) {
    return this.currentBackend.createAgent(name);
  }

  deleteAgent(agentId: string, opts?: Parameters<AgentBackend["deleteAgent"]>[1]) {
    return this.currentBackend.deleteAgent(agentId, opts);
  }

  listAgentFiles(agentId: string) {
    return this.currentBackend.listAgentFiles(agentId);
  }

  getAgentFile(agentId: string, name: string) {
    return this.currentBackend.getAgentFile(agentId, name);
  }

  setAgentFile(agentId: string, name: string, content: string) {
    return this.currentBackend.setAgentFile(agentId, name, content);
  }

  listSessions(opts?: Parameters<AgentBackend["listSessions"]>[0]) {
    return this.currentBackend.listSessions(opts);
  }

  resetSession(sessionKey: string, reason?: "new" | "reset") {
    return this.currentBackend.resetSession(sessionKey, reason);
  }

  deleteSession(sessionKey: string) {
    return this.currentBackend.deleteSession(sessionKey);
  }

  listSessionArchives(agentId: string, limit?: number) {
    return this.currentBackend.listSessionArchives(agentId, limit);
  }

  getSessionArchive(agentId: string, archiveId: string, limit?: number) {
    return this.currentBackend.getSessionArchive(agentId, archiveId, limit);
  }

  deleteSessionArchive(agentId: string, archiveId: string) {
    return this.currentBackend.deleteSessionArchive(agentId, archiveId);
  }

  restoreSessionArchive(agentId: string, archiveId: string, key: string) {
    return this.currentBackend.restoreSessionArchive(agentId, archiveId, key);
  }

  compactSession(sessionKey: string, maxLines?: number) {
    return this.currentBackend.compactSession(sessionKey, maxLines);
  }

  resolveSession(agentId: string) {
    return this.currentBackend.resolveSession(agentId);
  }

  getChatHistory(sessionKey: string, limit?: number) {
    return this.currentBackend.getChatHistory(sessionKey, limit);
  }

  sendChatMessage(
    sessionKey: string,
    message: string,
    opts?: Parameters<AgentBackend["sendChatMessage"]>[2],
  ) {
    return this.currentBackend.sendChatMessage(sessionKey, message, opts);
  }

  listCron() {
    return this.currentBackend.listCron();
  }

  addCron(job: Record<string, unknown>) {
    return this.currentBackend.addCron(job);
  }

  updateCron(jobId: string, patch: Record<string, unknown>) {
    return this.currentBackend.updateCron(jobId, patch);
  }

  removeCron(id: string) {
    return this.currentBackend.removeCron(id);
  }

  getUsageCost(params?: { days?: number }) {
    return this.currentBackend.getUsageCost(params);
  }

  getSessionsUsage(params?: Parameters<AgentBackend["getSessionsUsage"]>[0]) {
    return this.currentBackend.getSessionsUsage(params);
  }

  getChannelsStatus() {
    return this.currentBackend.getChannelsStatus();
  }

  getSkillsStatus(agentId?: string) {
    return this.currentBackend.getSkillsStatus(agentId);
  }

  getHealth() {
    return this.currentBackend.getHealth();
  }

  getStatus() {
    return this.currentBackend.getStatus();
  }

  getConfigSnapshot() {
    return this.currentBackend.getConfigSnapshot();
  }

  setConfig(config: Record<string, unknown>, baseHash: string) {
    return this.currentBackend.setConfig(config, baseHash);
  }

  patchConfig(patch: Record<string, unknown>, baseHash: string) {
    return this.currentBackend.patchConfig(patch, baseHash);
  }

  alignAgentSkillsToDefaults(agentIds: string[]) {
    return this.currentBackend.alignAgentSkillsToDefaults(agentIds);
  }

  getAgentControlSnapshot(agentId: string) {
    return this.currentBackend.getAgentControlSnapshot(agentId);
  }

  setAgentModelOverride(agentId: string, model: string | null) {
    return this.currentBackend.setAgentModelOverride(agentId, model);
  }

  setAgentSkillsOverride(agentId: string, skills: string[] | null) {
    return this.currentBackend.setAgentSkillsOverride(agentId, skills);
  }

  abortChatRunsForSessionKeyWithPartials(sessionKey: string, runId?: string) {
    return this.currentBackend.abortChatRunsForSessionKeyWithPartials(sessionKey, runId);
  }
}

export const backendManager = new BackendManager(backendProviders);
