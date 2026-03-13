import {
  gateway as openClawGateway,
  type CyberGateway,
} from "./client";
import {
  createBackendCapabilities,
  type ActorRef,
  type AgentBackend,
  type ConversationKind,
  type ConversationRef,
  type ProviderRuntimeEvent,
  type ProviderMessage,
} from "../runtime/types";
import {
  normalizeProviderRuntimeEvent,
  normalizeProviderSessionStatus,
} from "../../../application/agent-runtime";

const openClawCapabilities = createBackendCapabilities({
  sessionHistory: true,
  sessionArchives: true,
  sessionArchiveRestore: true,
  sessionStatus: true,
  agentLifecycle: true,
  toolLifecycle: true,
  processRuntime: false,
  presence: true,
  runtimeObservability: true,
  cron: true,
  config: true,
  channelStatus: true,
  skillsStatus: true,
  agentFiles: true,
  agentModelOverride: true,
  agentSkillsOverride: true,
  usageInsights: true,
});

// OpenClaw is just one backend implementation behind the app contract.
class OpenClawBackendAdapter implements AgentBackend {
  readonly providerId = "openclaw";
  readonly capabilities = openClawCapabilities;
  private readonly gateway: CyberGateway;

  constructor(gateway: CyberGateway) {
    this.gateway = gateway;
  }

  get isConnected() {
    return this.gateway.isConnected;
  }

  connect(url: string, token?: string) {
    this.gateway.connect(url, token);
  }

  disconnect() {
    this.gateway.disconnect();
  }

  async probeCapabilities() {
    return this.capabilities;
  }

  async listActors(): Promise<ActorRef[]> {
    const result = await this.gateway.listAgents();
    return (result.agents ?? []).map((agent) => ({
      providerId: this.providerId,
      actorId: agent.id,
      label: agent.name,
    }));
  }

  async ensureConversation(actorRef: ActorRef, kind: ConversationKind = "direct"): Promise<ConversationRef> {
    if (kind === "room") {
      return {
        providerId: this.providerId,
        conversationId: actorRef.actorId,
        actorId: actorRef.actorId,
        kind,
        native: true,
        sourceKey: actorRef.actorId,
      };
    }

    const result = await this.gateway.resolveSession(actorRef.actorId);
    return {
      providerId: this.providerId,
      conversationId: result.key,
      actorId: actorRef.actorId,
      kind,
      native: true,
      sourceKey: result.key,
    };
  }

  async readConversation(conversationRef: ConversationRef, limit?: number) {
    const history = await this.gateway.getChatHistory(conversationRef.conversationId, limit);
    const messages: ProviderMessage[] = (history.messages ?? []).map((message) => ({
      id: `${conversationRef.conversationId}:${message.timestamp ?? Date.now()}:${message.role}`,
      role:
        message.role === "assistant"
          ? "assistant"
          : message.role === "system"
            ? "system"
            : "user",
      text: message.text,
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
    const result = await this.gateway.sendChatMessage(conversationRef.conversationId, input, {
      timeoutMs: opts?.timeoutMs,
      attachments: opts?.attachments,
    });
    return {
      run: {
        providerId: this.providerId,
        runId: result.runId,
        conversationId: conversationRef.conversationId,
      },
      status: result.status,
    };
  }

  watchRuns(
    conversationRef: ConversationRef,
    handler: Parameters<NonNullable<AgentBackend["watchRuns"]>>[1],
  ) {
    return this.gateway.subscribe("chat", (payload) => {
      const sessionKey =
        typeof payload === "object" && payload && "sessionKey" in payload
          ? String((payload as Record<string, unknown>).sessionKey ?? "")
          : "";
      if (sessionKey === conversationRef.conversationId) {
        handler(payload as Parameters<typeof handler>[0]);
      }
    });
  }

  abortRun(run: Parameters<NonNullable<AgentBackend["abortRun"]>>[0]) {
    if (!run.conversationId) {
      return Promise.resolve({ ok: false, aborted: 0, runIds: [] });
    }
    return this.gateway.abortChatRunsForSessionKeyWithPartials(run.conversationId, run.runId);
  }

  subscribe(eventType: string, handler: (payload: unknown) => void) {
    return this.gateway.subscribe(eventType, handler);
  }

  onEvent(handler: Parameters<CyberGateway["onEvent"]>[0]) {
    this.gateway.onEvent(handler);
  }

  onHello(handler: Parameters<CyberGateway["onHello"]>[0]) {
    this.gateway.onHello(handler);
  }

  onClose(handler: Parameters<CyberGateway["onClose"]>[0]) {
    this.gateway.onClose(handler);
  }

  request<T = unknown>(method: string, params?: unknown) {
    return this.gateway.request<T>(method, params);
  }

  listAgents() {
    return this.gateway.listAgents();
  }

  listModels(params?: Parameters<CyberGateway["listModels"]>[0]) {
    return this.gateway.listModels(params);
  }

  refreshModels() {
    return this.gateway.refreshModels();
  }

  startCodexOAuth() {
    return this.gateway.startCodexOAuth();
  }

  getCodexOAuthStatus(state: string) {
    return this.gateway.getCodexOAuthStatus(state);
  }

  completeCodexOAuth(params: Parameters<CyberGateway["completeCodexOAuth"]>[0]) {
    return this.gateway.completeCodexOAuth(params);
  }

  importCodexCliAuth() {
    return this.gateway.importCodexCliAuth();
  }

  updateAgent(params: Parameters<CyberGateway["updateAgent"]>[0]) {
    return this.gateway.updateAgent(params);
  }

  createAgent(name: string) {
    return this.gateway.createAgent(name);
  }

  deleteAgent(agentId: string, opts?: Parameters<CyberGateway["deleteAgent"]>[1]) {
    return this.gateway.deleteAgent(agentId, opts);
  }

  listAgentFiles(agentId: string) {
    return this.gateway.listAgentFiles(agentId);
  }

  getAgentFile(agentId: string, name: string) {
    return this.gateway.getAgentFile(agentId, name);
  }

  setAgentFile(agentId: string, name: string, content: string) {
    return this.gateway.setAgentFile(agentId, name, content);
  }

  listSessions(opts?: Parameters<CyberGateway["listSessions"]>[0]) {
    return this.gateway.listSessions(opts);
  }

  resetSession(sessionKey: string, reason?: "new" | "reset") {
    return this.gateway.resetSession(sessionKey, reason);
  }

  deleteSession(sessionKey: string) {
    return this.gateway.deleteSession(sessionKey);
  }

  listSessionArchives(agentId: string, limit?: number) {
    return this.gateway.listSessionArchives(agentId, limit);
  }

  getSessionArchive(agentId: string, archiveId: string, limit?: number) {
    return this.gateway.getSessionArchive(agentId, archiveId, limit);
  }

  deleteSessionArchive(agentId: string, archiveId: string) {
    return this.gateway.deleteSessionArchive(agentId, archiveId);
  }

  restoreSessionArchive(agentId: string, archiveId: string, key: string) {
    return this.gateway.restoreSessionArchive(agentId, archiveId, key);
  }

  compactSession(sessionKey: string, maxLines?: number) {
    return this.gateway.compactSession(sessionKey, maxLines);
  }

  resolveSession(agentId: string) {
    return this.gateway.resolveSession(agentId);
  }

  getChatHistory(sessionKey: string, limit?: number) {
    return this.gateway.getChatHistory(sessionKey, limit);
  }

  sendChatMessage(
    sessionKey: string,
    message: string,
    opts?: Parameters<CyberGateway["sendChatMessage"]>[2],
  ) {
    return this.gateway.sendChatMessage(sessionKey, message, opts);
  }

  appendCompanyEvent(event: Parameters<CyberGateway["appendCompanyEvent"]>[0]) {
    return this.gateway.appendCompanyEvent(event);
  }

  listCompanyEvents(params: Parameters<CyberGateway["listCompanyEvents"]>[0]) {
    return this.gateway.listCompanyEvents(params);
  }

  listCron() {
    return this.gateway.listCron();
  }

  addCron(job: Record<string, unknown>) {
    return this.gateway.addCron(job);
  }

  updateCron(jobId: string, patch: Record<string, unknown>) {
    return this.gateway.updateCron(jobId, patch);
  }

  removeCron(id: string) {
    return this.gateway.removeCron(id);
  }

  getUsageCost(params?: { days?: number }) {
    return this.gateway.getUsageCost(params);
  }

  getSessionsUsage(params?: Parameters<CyberGateway["getSessionsUsage"]>[0]) {
    return this.gateway.getSessionsUsage(params);
  }

  getChannelsStatus() {
    return this.gateway.getChannelsStatus();
  }

  getSkillsStatus(agentId?: string) {
    return this.gateway.getSkillsStatus(agentId);
  }

  getHealth() {
    return this.gateway.getHealth();
  }

  getStatus() {
    return this.gateway.getStatus();
  }

  async getSessionStatus(sessionKey: string) {
    const result = await this.gateway.request("session_status", { sessionKey });
    return normalizeProviderSessionStatus(this.providerId, sessionKey, result);
  }

  subscribeAgentRuntime(handler: (event: ProviderRuntimeEvent) => void) {
    return this.gateway.subscribe("agent", (payload) => {
      const normalized = normalizeProviderRuntimeEvent(this.providerId, payload);
      if (normalized) {
        handler(normalized);
      }
    });
  }

  getConfigSnapshot() {
    return this.gateway.getConfigSnapshot();
  }

  setConfig(config: Record<string, unknown>, baseHash: string) {
    return this.gateway.setConfig(config, baseHash);
  }

  patchConfig(patch: Record<string, unknown>, baseHash: string) {
    return this.gateway.patchConfig(patch, baseHash);
  }

  alignAgentSkillsToDefaults(agentIds: string[]) {
    return this.gateway.alignAgentSkillsToDefaults(agentIds);
  }

  getAgentControlSnapshot(agentId: string) {
    return this.gateway.getAgentControlSnapshot(agentId);
  }

  setAgentModelOverride(agentId: string, model: string | null) {
    return this.gateway.setAgentModelOverride(agentId, model);
  }

  setAgentSkillsOverride(agentId: string, skills: string[] | null) {
    return this.gateway.setAgentSkillsOverride(agentId, skills);
  }

  abortChatRunsForSessionKeyWithPartials(sessionKey: string, runId?: string) {
    return this.gateway.abortChatRunsForSessionKeyWithPartials(sessionKey, runId);
  }
}

export const openClawBackend = new OpenClawBackendAdapter(openClawGateway);
