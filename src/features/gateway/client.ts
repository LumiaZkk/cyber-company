import { GatewayBrowserClient } from "./openclaw-gateway-client";
import type { GatewayEventFrame, GatewayHelloOk } from "./openclaw-gateway-client";
import type {
  GatewayAuthCodexOauthCallbackResult,
  GatewayAuthCodexOauthStatusResult,
  GatewayAuthCodexOauthStartResult,
  GatewayAuthImportCodexCliResult,
  GatewayModelChoice,
  GatewayModelsListParams,
} from "./types";

export type {
  GatewayAuthCodexOauthCallbackResult,
  GatewayAuthCodexOauthStatusResult,
  GatewayAuthCodexOauthStartResult,
  GatewayAuthImportCodexCliResult,
  GatewayModelChoice,
  GatewayModelsListParams,
} from "./types";

export interface GatewayAgentIdentity {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
}

export interface AgentListEntry {
  id: string;
  name?: string;
  identity?: GatewayAgentIdentity;
}

export interface AgentsListResult {
  defaultId: string;
  mainKey: string;
  scope: "per-sender" | "global";
  agents: AgentListEntry[];
}

export interface GatewaySessionRow {
  key: string;
  kind?: "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  updatedAt?: number | null;
  sessionId?: string;
  abortedLastRun?: boolean;
}

export interface GatewaySessionArchiveRow {
  id: string;
  fileName: string;
  reason: "reset" | "deleted" | "bak";
  archivedAt: number;
  title?: string;
  preview?: string;
}

export interface SessionsListResult {
  ts: number;
  path: string;
  count: number;
  sessions: GatewaySessionRow[];
}

export interface SessionsArchivesListResult {
  ts: number;
  agentId: string;
  archives: GatewaySessionArchiveRow[];
}

export interface SessionsArchivesGetResult {
  ok: true;
  agentId: string;
  archive: GatewaySessionArchiveRow;
  messages: ChatMessage[];
}

export interface SessionsArchivesRestoreResult {
  ok: true;
  key: string;
  restoredFrom: string;
  archivedCurrent: string[];
}

export type AgentControlSnapshot = {
  agentId: string;
  defaultModel: string | null;
  defaultSkills: string[] | null;
  modelOverride: string | null;
  skillsOverride: string[] | null;
};

export type CostUsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost?: number;
  outputCost?: number;
  cacheReadCost?: number;
  cacheWriteCost?: number;
  missingCostEntries?: number;
};

export type CostUsageSummary = {
  updatedAt: number;
  days: number;
  totals: CostUsageTotals;
};

export type SessionCostSummary = CostUsageTotals & {
  sessionId?: string;
  sessionFile?: string;
  firstActivity?: number;
  lastActivity?: number;
  durationMs?: number;
};

export type SessionsUsageEntry = {
  key: string;
  label?: string;
  sessionId?: string;
  updatedAt?: number;
  agentId?: string;
  usage: SessionCostSummary | null;
};

export type SessionsUsageResult = {
  updatedAt: number;
  startDate: string;
  endDate: string;
  sessions: SessionsUsageEntry[];
  totals: CostUsageTotals;
};

type GatewayConfigSnapshot = {
  path: string;
  exists: boolean;
  valid: boolean;
  hash?: string;
  config: Record<string, unknown>;
};

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "toolResult";
  content?: unknown;
  text?: string;
  timestamp?: number;
  [key: string]: unknown;
}

type GatewayCloseInfo = {
  code: number;
  reason: string;
  error?: { code: string; message: string; details?: unknown };
};

type SessionsListParams = {
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
};

type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

type AgentFileGetResult = {
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

type AgentFileSetResult = {
  ok: true;
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type CronJob = {
  id: string;
  name: string;
  agentId?: string;
  enabled?: boolean;
  schedule?: {
    kind: string;
    expr?: string;
    everyMs?: number;
  };
  payload?: {
    kind: string;
    message?: string;
  };
  state?: {
    lastRunAtMs?: number;
    lastStatus?: string;
    nextRunAtMs?: number;
  };
};

export type CronListResult = {
  jobs?: CronJob[];
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
};

type ChatEventState = "delta" | "final" | "aborted" | "error";

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: ChatEventState;
  message?: ChatMessage;
  errorMessage?: string;
};

export type ChatSendAck = {
  runId: string;
  status: "started" | "in_flight";
};

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolvePrimaryModel(value: unknown): string | null {
  const direct = normalizeNonEmptyString(value);
  if (direct) {
    return direct;
  }
  if (!isRecord(value)) {
    return null;
  }
  return normalizeNonEmptyString(value.primary);
}

function isCostUsageTotals(value: unknown): value is CostUsageTotals {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.input === "number"
    && typeof value.output === "number"
    && typeof value.cacheRead === "number"
    && typeof value.cacheWrite === "number"
    && typeof value.totalTokens === "number"
    && typeof value.totalCost === "number"
  );
}

function isCostUsageSummary(value: unknown): value is CostUsageSummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.updatedAt === "number"
    && typeof value.days === "number"
    && isCostUsageTotals(value.totals)
  );
}

function normalizeCostUsageSummary(value: unknown): CostUsageSummary | null {
  if (isCostUsageSummary(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (isCostUsageSummary(value.result)) {
    return value.result;
  }

  if (isCostUsageSummary(value.payload)) {
    return value.payload;
  }

  return null;
}

function normalizeSkillList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : [];
}

function isSameSkillList(current: unknown, expected: string[]): boolean {
  if (!Array.isArray(current) || current.length !== expected.length) {
    return false;
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (typeof current[index] !== "string" || current[index] !== expected[index]) {
      return false;
    }
  }

  return true;
}

function resolveAgentConfigEntry(
  list: unknown[],
  agentId: string,
): { index: number; entry: Record<string, unknown> } {
  for (let index = 0; index < list.length; index += 1) {
    const candidate = list[index];
    if (!isRecord(candidate)) {
      continue;
    }
    const id = normalizeNonEmptyString(candidate.id);
    if (id === agentId) {
      return { index, entry: candidate };
    }
  }

  throw new Error(`Agent "${agentId}" not found in config list.`);
}

export class CyberGateway {
  public client: GatewayBrowserClient | null = null;
  private onEventHandler: ((event: GatewayEventFrame) => void) | null = null;
  private onHelloHandler: ((hello: GatewayHelloOk) => void) | null = null;
  private onCloseHandler: ((info: GatewayCloseInfo) => void) | null = null;
  private eventListeners = new Map<string, Set<(payload: unknown) => void>>();

  constructor() {
    this.onEventHandler = (event) => {
      const handlers = this.eventListeners.get(event.event);
      handlers?.forEach((handler) => handler(event.payload));
      const wildcardHandlers = this.eventListeners.get("*");
      wildcardHandlers?.forEach((handler) => handler(event));
    };
  }

  subscribe(eventType: string, handler: (payload: unknown) => void) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)?.add(handler);
    return () => {
      this.eventListeners.get(eventType)?.delete(handler);
    };
  }

  connect(url: string, token?: string) {
    this.client?.stop();

    this.client = new GatewayBrowserClient({
      url,
      token,
      clientName: "openclaw-control-ui",
      onHello: (hello) => {
        this.onHelloHandler?.(hello);
      },
      onEvent: (event) => {
        this.onEventHandler?.(event);
      },
      onClose: (info) => {
        this.onCloseHandler?.(info);
      },
    });

    this.client.start();
  }

  disconnect() {
    this.client?.stop();
    this.client = null;
  }

  get isConnected() {
    return this.client?.connected ?? false;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.client) {
      return Promise.reject(new Error("gateway not connected"));
    }
    return this.client.request<T>(method, params);
  }

  onEvent(handler: (event: GatewayEventFrame) => void) {
    this.onEventHandler = handler;
  }

  onHello(handler: (hello: GatewayHelloOk) => void) {
    this.onHelloHandler = handler;
  }

  onClose(handler: (info: GatewayCloseInfo) => void) {
    this.onCloseHandler = handler;
  }

  async listAgents(): Promise<AgentsListResult> {
    return this.client!.request<AgentsListResult>("agents.list", {});
  }

  async listModels(params?: GatewayModelsListParams): Promise<{ models: GatewayModelChoice[] }> {
    return this.client!.request<{ models: GatewayModelChoice[] }>("models.list", params ?? {});
  }

  async refreshModels(): Promise<{ models: GatewayModelChoice[] }> {
    return this.client!.request<{ models: GatewayModelChoice[] }>("models.refresh", {});
  }

  async startCodexOAuth(): Promise<GatewayAuthCodexOauthStartResult> {
    return this.client!.request<GatewayAuthCodexOauthStartResult>("auth.codexOauthStart", {});
  }

  async getCodexOAuthStatus(state: string): Promise<GatewayAuthCodexOauthStatusResult> {
    return this.client!.request<GatewayAuthCodexOauthStatusResult>("auth.codexOauthStatus", { state });
  }

  async completeCodexOAuth(params: {
    code: string;
    state: string;
  }): Promise<GatewayAuthCodexOauthCallbackResult> {
    return this.client!.request<GatewayAuthCodexOauthCallbackResult>("auth.codexOauthCallback", params);
  }

  async importCodexCliAuth(): Promise<GatewayAuthImportCodexCliResult> {
    return this.client!.request<GatewayAuthImportCodexCliResult>("auth.importCodexCli", {});
  }

  async updateAgent(params: {
    agentId: string;
    name?: string;
    workspace?: string;
    model?: string;
    avatar?: string;
  }): Promise<{ ok: true; agentId: string }> {
    return this.client!.request<{ ok: true; agentId: string }>("agents.update", params);
  }

  async createAgent(
    name: string,
  ): Promise<{ ok: true; agentId: string; name: string; workspace: string }> {
    return this.client!.request("agents.create", {
      name,
      workspace: `~/.openclaw/workspaces/${name}`,
    });
  }

  async listAgentFiles(
    agentId: string,
  ): Promise<{ agentId: string; workspace: string; files: AgentFileEntry[] }> {
    return this.client!.request("agents.files.list", { agentId });
  }

  async getAgentFile(agentId: string, name: string): Promise<AgentFileGetResult> {
    return this.client!.request("agents.files.get", { agentId, name });
  }

  async setAgentFile(agentId: string, name: string, content: string): Promise<AgentFileSetResult> {
    return this.client!.request("agents.files.set", { agentId, name, content });
  }

  async listSessions(opts?: SessionsListParams): Promise<SessionsListResult> {
    return this.client!.request("sessions.list", opts ?? {});
  }

  async resetSession(
    sessionKey: string,
    reason?: "new" | "reset",
  ): Promise<{ ok: true; key: string }> {
    return this.client!.request("sessions.reset", {
      key: sessionKey,
      ...(reason ? { reason } : {}),
    });
  }

  async deleteSession(sessionKey: string): Promise<{ ok: boolean; deleted: boolean }> {
    return this.client!.request("sessions.delete", { key: sessionKey });
  }

  async listSessionArchives(
    agentId: string,
    limit?: number,
  ): Promise<SessionsArchivesListResult> {
    return this.client!.request("sessions.archives.list", {
      agentId,
      ...(typeof limit === "number" ? { limit } : {}),
    });
  }

  async getSessionArchive(
    agentId: string,
    archiveId: string,
    limit?: number,
  ): Promise<SessionsArchivesGetResult> {
    const result = await this.client!.request<{
      ok: true;
      agentId: string;
      archive: GatewaySessionArchiveRow;
      messages?: ChatMessage[];
    }>("sessions.archives.get", {
      agentId,
      archiveId,
      ...(typeof limit === "number" ? { limit } : {}),
    });
    return {
      ok: true,
      agentId: result.agentId,
      archive: result.archive,
      messages: Array.isArray(result.messages) ? result.messages : [],
    };
  }

  async deleteSessionArchive(
    agentId: string,
    archiveId: string,
  ): Promise<{ ok: boolean; removed: boolean }> {
    return this.client!.request("sessions.archives.delete", {
      agentId,
      archiveId,
    });
  }

  async restoreSessionArchive(
    agentId: string,
    archiveId: string,
    key: string,
  ): Promise<SessionsArchivesRestoreResult> {
    return this.client!.request("sessions.archives.restore", {
      agentId,
      archiveId,
      key,
    });
  }

  async compactSession(
    sessionKey: string,
    maxLines: number = 400,
  ): Promise<{ ok: boolean; compacted: boolean }> {
    return this.client!.request("sessions.compact", { key: sessionKey, maxLines });
  }

  async resolveSession(agentId: string): Promise<{ ok: boolean; key: string; error?: string }> {
    const defaultKey = `agent:${agentId}:main`;

    try {
      return await this.client!.request<{ ok: boolean; key: string }>("sessions.resolve", {
        key: defaultKey,
      });
    } catch (error) {
      return { ok: true, key: defaultKey, error: stringifyError(error) };
    }
  }

  async getChatHistory(
    sessionKey: string,
    limit?: number,
  ): Promise<{
    sessionKey?: string;
    sessionId?: string;
    messages: ChatMessage[];
    thinkingLevel?: string;
  }> {
    const result = await this.client!.request<{
      sessionKey?: string;
      sessionId?: string;
      messages?: ChatMessage[];
      thinkingLevel?: string;
    }>("chat.history", { sessionKey, limit });

    return {
      sessionKey: result.sessionKey,
      sessionId: result.sessionId,
      messages: Array.isArray(result.messages) ? result.messages : [],
      thinkingLevel: result.thinkingLevel,
    };
  }

  async sendChatMessage(
    sessionKey: string,
    message: string,
    opts?: {
      timeoutMs?: number;
      attachments?: Array<{ type: string; mimeType: string; content: string }>;
    },
  ) {
    return this.client!.request<ChatSendAck>("chat.send", {
      sessionKey,
      message,
      deliver: false,
      ...(opts?.attachments ? { attachments: opts.attachments } : {}),
      ...(typeof opts?.timeoutMs === "number" ? { timeoutMs: opts.timeoutMs } : {}),
      idempotencyKey: crypto.randomUUID(),
    });
  }

  async listCron(): Promise<CronListResult> {
    return this.client!.request("cron.list", {});
  }

  async addCron(job: Record<string, unknown>) {
    return this.client!.request("cron.add", job);
  }

  async updateCron(jobId: string, patch: Record<string, unknown>) {
    return this.client!.request("cron.update", { jobId, patch });
  }

  public async removeCron(id: string): Promise<boolean> {
    const res = await this.client!.request<{ ok: boolean }>("cron.remove", { id });
    return res.ok;
  }

  public async getUsageCost(params?: { days?: number }): Promise<CostUsageSummary> {
    const res = await this.client!.request<unknown>("usage.cost", params || {});
    const summary = normalizeCostUsageSummary(res);
    if (!summary) {
      throw new Error("Failed to load usage cost");
    }
    return summary;
  }

  async getSessionsUsage(params?: {
    key?: string;
    startDate?: string;
    endDate?: string;
    mode?: "utc" | "gateway" | "specific";
    utcOffset?: string;
    limit?: number;
    includeContextWeight?: boolean;
  }): Promise<SessionsUsageResult> {
    return this.client!.request<SessionsUsageResult>("sessions.usage", params ?? {});
  }

  async getChannelsStatus() {
    return this.client!.request<Record<string, unknown>>("channels.status", {});
  }

  async getSkillsStatus(agentId?: string) {
    return this.client!.request<Record<string, unknown>>(
      "skills.status",
      agentId ? { agentId } : {},
    );
  }

  async getHealth() {
    return this.client!.request<Record<string, unknown>>("health", {});
  }

  async getStatus() {
    return this.client!.request<Record<string, unknown>>("status", {});
  }

  async getConfigSnapshot(): Promise<GatewayConfigSnapshot> {
    return this.client!.request<GatewayConfigSnapshot>("config.get", {});
  }

  async setConfig(config: Record<string, unknown>, baseHash: string) {
    return this.client!.request("config.set", {
      raw: JSON.stringify(config, null, 2),
      baseHash,
    });
  }

  async patchConfig(patch: Record<string, unknown>, baseHash: string) {
    return this.client!.request("config.patch", {
      raw: JSON.stringify(patch, null, 2),
      baseHash,
    });
  }

  async alignAgentSkillsToDefaults(
    agentIds: string[],
  ): Promise<{ updated: number; defaultSkills: string[] | null }> {
    const targetIds = new Set(agentIds.map((id) => id.trim()).filter((id) => id.length > 0));

    if (targetIds.size === 0) {
      return { updated: 0, defaultSkills: null };
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const snapshot = await this.getConfigSnapshot();
      if (!snapshot.valid) {
        throw new Error("Gateway config is invalid; cannot align agent skills.");
      }

      const hash = typeof snapshot.hash === "string" ? snapshot.hash.trim() : "";
      if (!hash) {
        throw new Error("Gateway config hash is missing; cannot align agent skills.");
      }

      if (!isRecord(snapshot.config)) {
        throw new Error("Gateway config payload is malformed; cannot align agent skills.");
      }

      const config = structuredClone(snapshot.config);
      const agents = isRecord(config.agents) ? { ...config.agents } : {};
      const defaults = isRecord(agents.defaults) ? agents.defaults : {};
      const defaultSkills = normalizeSkillList(defaults.skills);
      const list = Array.isArray(agents.list) ? agents.list : [];

      let updated = 0;
      const nextList = list.map((entry) => {
        if (!isRecord(entry)) {
          return entry;
        }
        const id = typeof entry.id === "string" ? entry.id.trim() : "";
        if (!id || !targetIds.has(id)) {
          return entry;
        }

        const nextEntry: Record<string, unknown> = { ...entry };
        if (defaultSkills) {
          if (!isSameSkillList(nextEntry.skills, defaultSkills)) {
            nextEntry.skills = [...defaultSkills];
            updated += 1;
          }
        } else if (Object.prototype.hasOwnProperty.call(nextEntry, "skills")) {
          delete nextEntry.skills;
          updated += 1;
        }

        return nextEntry;
      });

      if (updated === 0) {
        return { updated: 0, defaultSkills: defaultSkills ?? null };
      }

      const nextConfig: Record<string, unknown> = {
        ...config,
        agents: {
          ...agents,
          list: nextList,
        },
      };

      try {
        await this.setConfig(nextConfig, hash);
        return { updated, defaultSkills: defaultSkills ?? null };
      } catch (error) {
        const isLastAttempt = attempt === 1;
        if (isLastAttempt) {
          throw error;
        }
      }
    }

    return { updated: 0, defaultSkills: null };
  }

  async getAgentControlSnapshot(agentId: string): Promise<AgentControlSnapshot> {
    const normalizedAgentId = normalizeNonEmptyString(agentId);
    if (!normalizedAgentId) {
      throw new Error("agentId is required.");
    }

    const snapshot = await this.getConfigSnapshot();
    if (!snapshot.valid) {
      throw new Error("Gateway config is invalid; cannot inspect agent controls.");
    }
    if (!isRecord(snapshot.config)) {
      throw new Error("Gateway config payload is malformed; cannot inspect agent controls.");
    }

    const agents = isRecord(snapshot.config.agents) ? snapshot.config.agents : {};
    const defaults = isRecord(agents.defaults) ? agents.defaults : {};
    const list = Array.isArray(agents.list) ? agents.list : [];
    const { entry } = resolveAgentConfigEntry(list, normalizedAgentId);

    return {
      agentId: normalizedAgentId,
      defaultModel: resolvePrimaryModel(defaults.model),
      defaultSkills: normalizeSkillList(defaults.skills) ?? null,
      modelOverride: resolvePrimaryModel(entry.model),
      skillsOverride: normalizeSkillList(entry.skills) ?? null,
    };
  }

  async setAgentModelOverride(
    agentId: string,
    model: string | null,
  ): Promise<{ updated: boolean; modelOverride: string | null }> {
    const normalizedAgentId = normalizeNonEmptyString(agentId);
    if (!normalizedAgentId) {
      throw new Error("agentId is required.");
    }

    const nextModel = normalizeNonEmptyString(model);

    if (nextModel) {
      const current = await this.getAgentControlSnapshot(normalizedAgentId);
      if (current.modelOverride === nextModel) {
        return { updated: false, modelOverride: nextModel };
      }

      await this.updateAgent({ agentId: normalizedAgentId, model: nextModel });
      return { updated: true, modelOverride: nextModel };
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const snapshot = await this.getConfigSnapshot();
      if (!snapshot.valid) {
        throw new Error("Gateway config is invalid; cannot update agent model.");
      }

      const hash = typeof snapshot.hash === "string" ? snapshot.hash.trim() : "";
      if (!hash) {
        throw new Error("Gateway config hash is missing; cannot update agent model.");
      }

      if (!isRecord(snapshot.config)) {
        throw new Error("Gateway config payload is malformed; cannot update agent model.");
      }

      const config = structuredClone(snapshot.config);
      const agents = isRecord(config.agents) ? { ...config.agents } : {};
      const list = Array.isArray(agents.list) ? [...agents.list] : [];
      const { index, entry } = resolveAgentConfigEntry(list, normalizedAgentId);
      const nextEntry: Record<string, unknown> = { ...entry };

      let changed = false;
      if (Object.prototype.hasOwnProperty.call(nextEntry, "model")) {
        delete nextEntry.model;
        changed = true;
      }

      if (!changed) {
        return { updated: false, modelOverride: nextModel };
      }

      list[index] = nextEntry;
      const nextConfig: Record<string, unknown> = {
        ...config,
        agents: {
          ...agents,
          list,
        },
      };

      try {
        await this.setConfig(nextConfig, hash);
        return { updated: true, modelOverride: nextModel };
      } catch (error) {
        if (attempt === 1) {
          throw error;
        }
      }
    }

    return { updated: false, modelOverride: nextModel };
  }

  async setAgentSkillsOverride(
    agentId: string,
    skills: string[] | null,
  ): Promise<{ updated: boolean; skillsOverride: string[] | null }> {
    const normalizedAgentId = normalizeNonEmptyString(agentId);
    if (!normalizedAgentId) {
      throw new Error("agentId is required.");
    }

    const nextSkills =
      skills === null
        ? null
        : Array.from(
            new Set(skills.map((entry) => entry.trim()).filter((entry) => entry.length > 0)),
          );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const snapshot = await this.getConfigSnapshot();
      if (!snapshot.valid) {
        throw new Error("Gateway config is invalid; cannot update agent skills.");
      }

      const hash = typeof snapshot.hash === "string" ? snapshot.hash.trim() : "";
      if (!hash) {
        throw new Error("Gateway config hash is missing; cannot update agent skills.");
      }

      if (!isRecord(snapshot.config)) {
        throw new Error("Gateway config payload is malformed; cannot update agent skills.");
      }

      const config = structuredClone(snapshot.config);
      const agents = isRecord(config.agents) ? { ...config.agents } : {};
      const list = Array.isArray(agents.list) ? [...agents.list] : [];
      const { index, entry } = resolveAgentConfigEntry(list, normalizedAgentId);
      const nextEntry: Record<string, unknown> = { ...entry };

      let changed = false;
      if (nextSkills === null) {
        if (Object.prototype.hasOwnProperty.call(nextEntry, "skills")) {
          delete nextEntry.skills;
          changed = true;
        }
      } else if (!isSameSkillList(nextEntry.skills, nextSkills)) {
        nextEntry.skills = [...nextSkills];
        changed = true;
      }

      if (!changed) {
        return { updated: false, skillsOverride: nextSkills };
      }

      list[index] = nextEntry;
      const nextConfig: Record<string, unknown> = {
        ...config,
        agents: {
          ...agents,
          list,
        },
      };

      try {
        await this.setConfig(nextConfig, hash);
        return { updated: true, skillsOverride: nextSkills };
      } catch (error) {
        if (attempt === 1) {
          throw error;
        }
      }
    }

    return { updated: false, skillsOverride: nextSkills };
  }

  async abortChatRunsForSessionKeyWithPartials(
    sessionKey: string,
    runId?: string,
  ): Promise<{ ok: boolean; aborted: number; runIds: string[] }> {
    if (!this.client) {
      throw new Error("Gateway 尚未连接，无法执行此操作");
    }
    const result = await this.client.request("chat.abort", {
      sessionKey,
      ...(runId ? { runId } : {}),
    });
    return result as { ok: boolean; aborted: number; runIds: string[] };
  }
}

export const gateway = new CyberGateway();
