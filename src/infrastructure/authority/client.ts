import type {
  AuthorityActorsResponse,
  AuthorityAppendRoomRequest,
  AuthorityAppendCompanyEventRequest,
  AuthorityArtifactDeleteRequest,
  AuthorityArtifactMirrorSyncRequest,
  AuthorityArtifactUpsertRequest,
  AuthorityDecisionTicketCancelRequest,
  AuthorityBootstrapSnapshot,
  AuthorityBatchHireEmployeesRequest,
  AuthorityBatchHireEmployeesResponse,
  AuthorityChatSendRequest,
  AuthorityChatSendResponse,
  AuthorityCollaborationScopeResponse,
  AuthorityCompanyEventsResponse,
  AuthorityCompanyRuntimeSnapshot,
  AuthorityCreateCompanyRequest,
  AuthorityCreateCompanyResponse,
  AuthorityDispatchDeleteRequest,
  AuthorityDispatchUpsertRequest,
  AuthorityDecisionTicketDeleteRequest,
  AuthorityDecisionTicketResolveRequest,
  AuthorityDecisionTicketUpsertRequest,
  AuthorityEvent,
  AuthorityExecutorConfig,
  AuthorityExecutorConfigPatch,
  AuthorityHealthSnapshot,
  AuthorityHireEmployeeRequest,
  AuthorityHireEmployeeResponse,
  AuthorityRequirementPromoteRequest,
  AuthorityRequirementTransitionRequest,
  AuthorityRoomDeleteRequest,
  AuthorityRoomBindingsUpsertRequest,
  AuthorityRuntimeSyncRequest,
  AuthoritySessionHistoryResponse,
  AuthoritySessionListResponse,
  AuthoritySwitchCompanyRequest,
} from "./contract";
import { DEFAULT_AUTHORITY_URL } from "./contract";

const AUTHORITY_URL_KEY = "cyber_company_authority_url";

function getStorage(): Pick<Storage, "getItem" | "setItem"> {
  if (
    typeof globalThis === "object" &&
    globalThis &&
    "localStorage" in globalThis &&
    typeof globalThis.localStorage?.getItem === "function" &&
    typeof globalThis.localStorage?.setItem === "function"
  ) {
    return globalThis.localStorage;
  }

  return {
    getItem: () => null,
    setItem: () => {},
  };
}

const storage = getStorage();

function normalizeBaseUrl(url?: string | null) {
  const trimmed = url?.trim();
  if (!trimmed) {
    return DEFAULT_AUTHORITY_URL;
  }
  return trimmed.replace(/\/+$/, "");
}

function buildWsUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.startsWith("https://")) {
    return `wss://${normalized.slice("https://".length)}/events`;
  }
  if (normalized.startsWith("http://")) {
    return `ws://${normalized.slice("http://".length)}/events`;
  }
  if (normalized.startsWith("ws://") || normalized.startsWith("wss://")) {
    return `${normalized.replace(/\/+$/, "")}/events`;
  }
  return `ws://${normalized}/events`;
}

function createAuthorityUnavailableError(baseUrl: string, path: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return new Error(
    [
      `Authority 服务不可达（${normalizedBaseUrl}）。`,
      "公司配置、公司创建和本机权威源同步都依赖 authority。",
      "请先运行 `npm run dev`，或检查当前地址/端口是否正确。",
      `请求路径：${path}。`,
      `原始错误：${message}`,
    ].join(" "),
  );
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch (error) {
    throw createAuthorityUnavailableError(baseUrl, path, error);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function probeAuthorityHealth(baseUrl: string) {
  return requestJson<AuthorityHealthSnapshot>(baseUrl, "/health");
}

export class AuthorityClient {
  private baseUrl = normalizeBaseUrl(storage.getItem(AUTHORITY_URL_KEY));

  get url() {
    return this.baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = normalizeBaseUrl(url);
    storage.setItem(AUTHORITY_URL_KEY, this.baseUrl);
  }

  async health() {
    return probeAuthorityHealth(this.baseUrl);
  }

  async bootstrap() {
    return requestJson<AuthorityBootstrapSnapshot>(this.baseUrl, "/bootstrap");
  }

  async getExecutorConfig() {
    return requestJson<AuthorityExecutorConfig>(this.baseUrl, "/executor");
  }

  async patchExecutorConfig(body: AuthorityExecutorConfigPatch) {
    return requestJson<AuthorityExecutorConfig>(this.baseUrl, "/executor", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async requestGateway<T = unknown>(method: string, params?: unknown) {
    return requestJson<T>(this.baseUrl, "/gateway/request", {
      method: "POST",
      body: JSON.stringify({ method, params }),
    });
  }

  async createCompany(body: AuthorityCreateCompanyRequest) {
    return requestJson<AuthorityCreateCompanyResponse>(this.baseUrl, "/companies", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async hireEmployee(body: AuthorityHireEmployeeRequest) {
    return requestJson<AuthorityHireEmployeeResponse>(
      this.baseUrl,
      `/companies/${encodeURIComponent(body.companyId)}/employees`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async batchHireEmployees(body: AuthorityBatchHireEmployeesRequest) {
    return requestJson<AuthorityBatchHireEmployeesResponse>(
      this.baseUrl,
      `/companies/${encodeURIComponent(body.companyId)}/employees/batch`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async deleteCompany(companyId: string) {
    return requestJson<AuthorityBootstrapSnapshot>(this.baseUrl, `/companies/${encodeURIComponent(companyId)}`, {
      method: "DELETE",
    });
  }

  async switchCompany(body: AuthoritySwitchCompanyRequest) {
    return requestJson<AuthorityBootstrapSnapshot>(this.baseUrl, "/company/switch", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateConfig(config: AuthorityBootstrapSnapshot["config"]) {
    return requestJson<AuthorityBootstrapSnapshot>(this.baseUrl, "/config", {
      method: "PUT",
      body: JSON.stringify({ config }),
    });
  }

  async getRuntime(companyId: string) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(
      this.baseUrl,
      `/companies/${encodeURIComponent(companyId)}/runtime`,
    );
  }

  async syncRuntime(companyId: string, body: AuthorityRuntimeSyncRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(
      this.baseUrl,
      `/companies/${encodeURIComponent(companyId)}/runtime`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  }

  async sendChat(body: AuthorityChatSendRequest) {
    return requestJson<AuthorityChatSendResponse>(this.baseUrl, "/commands/chat.send", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async transitionRequirement(body: AuthorityRequirementTransitionRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(
      this.baseUrl,
      "/commands/requirement.transition",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async promoteRequirement(body: AuthorityRequirementPromoteRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(
      this.baseUrl,
      "/commands/requirement.promote",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async appendRoom(body: AuthorityAppendRoomRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/room.append", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async upsertRoomBindings(body: AuthorityRoomBindingsUpsertRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/room-bindings.upsert", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteRoom(body: AuthorityRoomDeleteRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/room.delete", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async upsertDispatch(body: AuthorityDispatchUpsertRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/dispatch.create", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteDispatch(body: AuthorityDispatchDeleteRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/dispatch.delete", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async upsertArtifact(body: AuthorityArtifactUpsertRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/artifact.upsert", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async syncArtifactMirrors(body: AuthorityArtifactMirrorSyncRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/artifact.sync-mirror", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteArtifact(body: AuthorityArtifactDeleteRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/artifact.delete", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async upsertDecisionTicket(body: AuthorityDecisionTicketUpsertRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/decision.upsert", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteDecisionTicket(body: AuthorityDecisionTicketDeleteRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/decision.delete", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async resolveDecisionTicket(body: AuthorityDecisionTicketResolveRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/decision.resolve", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async cancelDecisionTicket(body: AuthorityDecisionTicketCancelRequest) {
    return requestJson<AuthorityCompanyRuntimeSnapshot>(this.baseUrl, "/commands/decision.cancel", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async listCompanyEvents(companyId: string, cursor?: string | null, since?: number) {
    const search = new URLSearchParams();
    if (cursor) {
      search.set("cursor", cursor);
    }
    if (typeof since === "number") {
      search.set("since", String(since));
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return requestJson<AuthorityCompanyEventsResponse>(
      this.baseUrl,
      `/companies/${encodeURIComponent(companyId)}/events${suffix}`,
    );
  }

  async getCollaborationScope(companyId: string, agentId: string) {
    return requestJson<AuthorityCollaborationScopeResponse>(
      this.baseUrl,
      `/companies/${encodeURIComponent(companyId)}/collaboration-scope/${encodeURIComponent(agentId)}`,
    );
  }

  async appendCompanyEvent(body: AuthorityAppendCompanyEventRequest) {
    return requestJson<{ ok: true; event: AuthorityAppendCompanyEventRequest["event"] }>(
      this.baseUrl,
      "/commands/company-event.append",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async listActors() {
    return requestJson<AuthorityActorsResponse>(this.baseUrl, "/actors");
  }

  async listSessions(companyId?: string | null, agentId?: string | null) {
    const search = new URLSearchParams();
    if (companyId) {
      search.set("companyId", companyId);
    }
    if (agentId) {
      search.set("agentId", agentId);
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return requestJson<AuthoritySessionListResponse>(this.baseUrl, `/sessions${suffix}`);
  }

  async getChatHistory(sessionKey: string, limit?: number) {
    const search = new URLSearchParams();
    if (typeof limit === "number") {
      search.set("limit", String(limit));
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return requestJson<AuthoritySessionHistoryResponse>(
      this.baseUrl,
      `/sessions/${encodeURIComponent(sessionKey)}/history${suffix}`,
    );
  }

  async resetSession(sessionKey: string) {
    return requestJson<{ ok: true; key: string }>(
      this.baseUrl,
      `/sessions/${encodeURIComponent(sessionKey)}/reset`,
      {
        method: "POST",
      },
    );
  }

  async deleteSession(sessionKey: string) {
    return requestJson<{ ok: boolean; deleted: boolean }>(
      this.baseUrl,
      `/sessions/${encodeURIComponent(sessionKey)}`,
      {
        method: "DELETE",
      },
    );
  }

  async getAgentFile(agentId: string, name: string) {
    return requestJson<{
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
    }>(this.baseUrl, `/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(name)}`);
  }

  async listAgentFiles(agentId: string) {
    return requestJson<{
      agentId: string;
      workspace: string;
      files: Array<{
        name: string;
        path: string;
        missing: boolean;
        size?: number;
        updatedAtMs?: number;
        content?: string;
      }>;
    }>(this.baseUrl, `/agents/${encodeURIComponent(agentId)}/files`);
  }

  async setAgentFile(agentId: string, name: string, content: string) {
    return requestJson<{
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
    }>(this.baseUrl, `/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  connectEvents(handlers: {
    onOpen?: () => void;
    onClose?: (event: CloseEvent) => void;
    onMessage: (event: AuthorityEvent) => void;
  }) {
    const socket = new WebSocket(buildWsUrl(this.baseUrl));
    socket.addEventListener("open", () => handlers.onOpen?.());
    socket.addEventListener("close", (event) => handlers.onClose?.(event));
    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data ?? "")) as AuthorityEvent;
        handlers.onMessage(payload);
      } catch (error) {
        console.warn("Failed to parse authority event payload", error);
      }
    });
    return () => socket.close();
  }
}

export const authorityClient = new AuthorityClient();
