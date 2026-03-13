import type {
  AgentBackend,
  BackendCloseInfo,
  BackendCore,
  BackendEventFrame,
  BackendHello,
  ConversationRef,
  ProviderMessage,
} from "./types";

function unsupported(method: string): never {
  throw new Error(`Backend method "${method}" is not supported by the active provider.`);
}

type BackendCoreExtras = Partial<
  Pick<
    AgentBackend,
    | "subscribe"
    | "onEvent"
    | "onHello"
    | "onClose"
    | "request"
    | "listAgents"
    | "listModels"
    | "refreshModels"
    | "startCodexOAuth"
    | "getCodexOAuthStatus"
    | "completeCodexOAuth"
    | "importCodexCliAuth"
    | "updateAgent"
    | "createAgent"
    | "deleteAgent"
    | "listAgentFiles"
    | "getAgentFile"
    | "setAgentFile"
    | "listSessions"
    | "resetSession"
    | "deleteSession"
    | "listSessionArchives"
    | "getSessionArchive"
    | "deleteSessionArchive"
    | "restoreSessionArchive"
    | "compactSession"
    | "resolveSession"
    | "getChatHistory"
    | "sendChatMessage"
    | "appendCompanyEvent"
    | "listCompanyEvents"
    | "listCron"
    | "addCron"
    | "updateCron"
    | "removeCron"
    | "setConfig"
    | "getChannelsStatus"
    | "getSkillsStatus"
    | "getHealth"
    | "getStatus"
    | "getSessionStatus"
    | "subscribeAgentRuntime"
    | "listProcesses"
    | "pollProcess"
    | "getConfigSnapshot"
    | "patchConfig"
    | "alignAgentSkillsToDefaults"
    | "getAgentControlSnapshot"
    | "setAgentModelOverride"
    | "setAgentSkillsOverride"
    | "getUsageCost"
    | "getSessionsUsage"
    | "abortChatRunsForSessionKeyWithPartials"
  >
>;

export function createAgentBackendFromCore(
  core: BackendCore,
  extras: BackendCoreExtras = {},
): AgentBackend {
  let eventHandler: ((event: BackendEventFrame) => void) | null = null;
  let helloHandler: ((hello: BackendHello) => void) | null = null;
  let closeHandler: ((info: BackendCloseInfo) => void) | null = null;

  const backend: AgentBackend = {
    providerId: core.providerId,
    get isConnected() {
      return core.isConnected;
    },
    get capabilities() {
      return core.capabilities;
    },
    connect: core.connect.bind(core),
    disconnect: core.disconnect.bind(core),
    probeCapabilities: core.probeCapabilities.bind(core),
    listActors: core.listActors.bind(core),
    ensureConversation: core.ensureConversation.bind(core),
    readConversation: core.readConversation.bind(core),
    sendTurn: core.sendTurn.bind(core),
    watchRuns: core.watchRuns?.bind(core),
    abortRun: core.abortRun?.bind(core),
    subscribe:
      extras.subscribe ??
      (() => {
        return () => {};
      }),
    onEvent:
      extras.onEvent ??
      ((handler) => {
        eventHandler = handler;
      }),
    onHello:
      extras.onHello ??
      ((handler) => {
        helloHandler = handler;
      }),
    onClose:
      extras.onClose ??
      ((handler) => {
        closeHandler = handler;
      }),
    request:
      extras.request ??
      (async () => unsupported("request")),
    listAgents:
      extras.listAgents ??
      (async () => {
        const actors = await core.listActors();
        return {
          defaultId: actors[0]?.actorId ?? "default",
          mainKey: actors[0]?.actorId ?? "default",
          scope: "global",
          agents: actors.map((actor) => ({
            id: actor.actorId,
            name: actor.label,
            identity: actor.label ? { name: actor.label } : undefined,
          })),
        };
      }),
    listModels:
      extras.listModels ??
      (async () => ({ models: [] })),
    refreshModels:
      extras.refreshModels ??
      (async () => ({ models: [] })),
    startCodexOAuth:
      extras.startCodexOAuth ??
      (async () => unsupported("startCodexOAuth")),
    getCodexOAuthStatus:
      extras.getCodexOAuthStatus ??
      (async () => unsupported("getCodexOAuthStatus")),
    completeCodexOAuth:
      extras.completeCodexOAuth ??
      (async () => unsupported("completeCodexOAuth")),
    importCodexCliAuth:
      extras.importCodexCliAuth ??
      (async () => unsupported("importCodexCliAuth")),
    updateAgent:
      extras.updateAgent ??
      (async () => unsupported("updateAgent")),
    createAgent:
      extras.createAgent ??
      (async () => unsupported("createAgent")),
    deleteAgent:
      extras.deleteAgent ??
      (async () => unsupported("deleteAgent")),
    listAgentFiles:
      extras.listAgentFiles ??
      (async (agentId) => ({ agentId, workspace: "", files: [] })),
    getAgentFile:
      extras.getAgentFile ??
      (async (agentId, name) => ({
        agentId,
        workspace: "",
        file: { name, path: "", missing: true },
      })),
    setAgentFile:
      extras.setAgentFile ??
      (async () => unsupported("setAgentFile")),
    listSessions:
      extras.listSessions ??
      (async () => ({ ts: Date.now(), path: "", count: 0, sessions: [] })),
    resetSession:
      extras.resetSession ??
      (async () => unsupported("resetSession")),
    deleteSession:
      extras.deleteSession ??
      (async () => unsupported("deleteSession")),
    listSessionArchives:
      extras.listSessionArchives ??
      (async (agentId) => ({ ts: Date.now(), agentId, archives: [] })),
    getSessionArchive:
      extras.getSessionArchive ??
      (async () => unsupported("getSessionArchive")),
    deleteSessionArchive:
      extras.deleteSessionArchive ??
      (async () => unsupported("deleteSessionArchive")),
    restoreSessionArchive:
      extras.restoreSessionArchive ??
      (async () => unsupported("restoreSessionArchive")),
    compactSession:
      extras.compactSession ??
      (async () => unsupported("compactSession")),
    resolveSession:
      extras.resolveSession ??
      (async (agentId) => {
        const actors = await core.listActors();
        const actor = actors.find((item) => item.actorId === agentId);
        if (!actor) {
          return { ok: false as const, key: "", error: `Unknown actor: ${agentId}` };
        }
        const conversation = await core.ensureConversation(actor, "direct");
        return { ok: true as const, key: conversation.conversationId };
      }),
    getChatHistory:
      extras.getChatHistory ??
      (async (sessionKey, limit) => {
        const conversation: ConversationRef = {
          providerId: core.providerId,
          conversationId: sessionKey,
          kind: "direct",
          native: false,
          sourceKey: sessionKey,
        };
        const history = await core.readConversation(conversation, limit);
        return {
          sessionKey,
          sessionId: sessionKey,
          messages: history.messages.map((message: ProviderMessage) => ({
            role: message.role,
            text: message.text,
            content: message.content,
            timestamp: message.timestamp,
          })),
        };
      }),
    sendChatMessage:
      extras.sendChatMessage ??
      (async (sessionKey, message, opts) => {
        const conversation: ConversationRef = {
          providerId: core.providerId,
          conversationId: sessionKey,
          kind: "direct",
          native: false,
          sourceKey: sessionKey,
        };
        const result = await core.sendTurn(conversation, message, {
          timeoutMs: opts?.timeoutMs,
          attachments: opts?.attachments,
        });
        return { runId: result.run.runId, status: result.status };
      }),
    appendCompanyEvent:
      extras.appendCompanyEvent ??
      (async () => unsupported("appendCompanyEvent")),
    listCompanyEvents:
      extras.listCompanyEvents ??
      (async () => unsupported("listCompanyEvents")),
    listCron:
      extras.listCron ??
      (async () => ({ jobs: [] })),
    addCron:
      extras.addCron ??
      (async () => unsupported("addCron")),
    updateCron:
      extras.updateCron ??
      (async () => unsupported("updateCron")),
    removeCron:
      extras.removeCron ??
      (async () => unsupported("removeCron")),
    getConfigSnapshot:
      extras.getConfigSnapshot ??
      (async () => unsupported("getConfigSnapshot")),
    setConfig:
      extras.setConfig ??
      (async () => unsupported("setConfig")),
    patchConfig:
      extras.patchConfig ??
      (async () => unsupported("patchConfig")),
    getChannelsStatus:
      extras.getChannelsStatus ??
      (async () => unsupported("getChannelsStatus")),
    getSkillsStatus:
      extras.getSkillsStatus ??
      (async () => unsupported("getSkillsStatus")),
    getHealth:
      extras.getHealth ??
      (async () => unsupported("getHealth")),
    getStatus:
      extras.getStatus ??
      (async () => unsupported("getStatus")),
    getSessionStatus:
      extras.getSessionStatus ??
      (async () => unsupported("getSessionStatus")),
    subscribeAgentRuntime:
      extras.subscribeAgentRuntime ??
      (() => {
        return () => {};
      }),
    listProcesses:
      extras.listProcesses,
    pollProcess:
      extras.pollProcess,
    alignAgentSkillsToDefaults:
      extras.alignAgentSkillsToDefaults ??
      (async () => unsupported("alignAgentSkillsToDefaults")),
    getAgentControlSnapshot:
      extras.getAgentControlSnapshot ??
      (async () => unsupported("getAgentControlSnapshot")),
    setAgentModelOverride:
      extras.setAgentModelOverride ??
      (async () => unsupported("setAgentModelOverride")),
    setAgentSkillsOverride:
      extras.setAgentSkillsOverride ??
      (async () => unsupported("setAgentSkillsOverride")),
    getUsageCost:
      extras.getUsageCost ??
      (async ({ days } = {}) => ({
        updatedAt: Date.now(),
        days: days ?? 30,
        totals: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          totalCost: 0,
        },
      })),
    getSessionsUsage:
      extras.getSessionsUsage ??
      (async ({ startDate, endDate } = {}) => ({
        updatedAt: Date.now(),
        startDate: startDate ?? new Date().toISOString().slice(0, 10),
        endDate: endDate ?? new Date().toISOString().slice(0, 10),
        sessions: [],
        totals: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          totalCost: 0,
        },
      })),
    abortChatRunsForSessionKeyWithPartials:
      extras.abortChatRunsForSessionKeyWithPartials ??
      (async () => unsupported("abortChatRunsForSessionKeyWithPartials")),
  };

  if (!extras.onEvent && core.watchRuns) {
    backend.onEvent = (handler) => {
      eventHandler = handler;
    };
  }

  void eventHandler;
  void helloHandler;
  void closeHandler;

  return backend;
}
