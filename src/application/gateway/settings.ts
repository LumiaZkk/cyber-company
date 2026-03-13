import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompanyShellCommands, useCompanyShellQuery } from "../company/shell";
import { useOrgApp } from "../org";
import { isOrgAutopilotEnabled } from "../assignment/org-fit";
import { gateway, type GatewayModelChoice, useGatewayStore } from "./index";
import { useAuthorityRuntimeSyncStore } from "../../infrastructure/authority/runtime-sync-store";
import type { AuthorityHealthSnapshot } from "../../infrastructure/authority/contract";
import type { CompanyCollaborationPolicy } from "../../domain/org/types";
import {
  collectAuthorityGuidance,
  resolveAuthorityStorageState,
} from "./authority-health";
import {
  formatCodexRuntimeSyncDescription,
  reapplyCodexModelsToActiveSessions,
  syncCodexModelsToAllowlist,
} from "./codex-runtime";
import { patchAuthorityExecutorConfig } from "./authority-control";

type JsonMap = Record<string, unknown>;
export type GatewayDoctorLayerState = "ready" | "degraded" | "blocked";
export type GatewayDoctorLayer = {
  id: "gateway" | "authority" | "executor" | "runtime";
  label: string;
  state: GatewayDoctorLayerState;
  summary: string;
  detail: string;
  timestamp?: number | null;
};
export type GatewayDoctorBaseline = {
  overallState: GatewayDoctorLayerState;
  mode: "compatibility_snapshot" | "command_preferred";
  layers: GatewayDoctorLayer[];
  validationChecklist: string[];
  compatibilityPathEnabled: boolean;
  commandRoutes: string[];
  lastError: string | null;
};
export type GatewayConfigSnapshot = Awaited<ReturnType<typeof gateway.getConfigSnapshot>>;
export type GatewayProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
} & Record<string, unknown>;
export type GatewayTelegramConfig = { enabled?: boolean; botToken?: string } | null;

function extractAuthorityHealth(value: JsonMap | null): AuthorityHealthSnapshot | null {
  if (!value) {
    return null;
  }
  const candidate = value as Partial<AuthorityHealthSnapshot>;
  if (!candidate.executor || !candidate.executorConfig || !candidate.authority) {
    return null;
  }
  return candidate as AuthorityHealthSnapshot;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function foldLayerStates(states: GatewayDoctorLayerState[]): GatewayDoctorLayerState {
  if (states.includes("blocked")) {
    return "blocked";
  }
  if (states.includes("degraded")) {
    return "degraded";
  }
  return "ready";
}

async function refreshAvailableModels() {
  const modelsResult = await gateway.listModels();
  return modelsResult.models ?? [];
}

export function useGatewaySettingsQuery() {
  const { connected, error: gatewayError, modelsVersion, phase, token, url } = useGatewayStore();
  const { config: companyConfig, activeCompany } = useCompanyShellQuery();
  const previousModelsVersionRef = useRef(modelsVersion);
  const runtimeSync = useAuthorityRuntimeSyncStore();

  const [status, setStatus] = useState<JsonMap | null>(null);
  const [channels, setChannels] = useState<JsonMap | null>(null);
  const [skills, setSkills] = useState<JsonMap | null>(null);
  const [configSnapshot, setConfigSnapshot] = useState<GatewayConfigSnapshot | null>(null);
  const [availableModels, setAvailableModels] = useState<GatewayModelChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshRuntime = useCallback(async () => {
    if (!gateway.isConnected) {
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const [statusResult, channelsResult, skillsResult, snapshotResult, modelsResult] = await Promise.all([
        gateway.getStatus(),
        gateway.getChannelsStatus(),
        gateway.getSkillsStatus(),
        gateway.getConfigSnapshot(),
        gateway.listModels(),
      ]);
      setStatus(statusResult);
      setChannels(channelsResult);
      setSkills(skillsResult);
      setConfigSnapshot(snapshotResult);
      setAvailableModels(modelsResult.models ?? []);
      return {
        status: statusResult,
        channels: channelsResult,
        skills: skillsResult,
        configSnapshot: snapshotResult,
        availableModels: modelsResult.models ?? [],
      };
    } catch (runtimeError) {
      const message = runtimeError instanceof Error ? runtimeError.message : String(runtimeError);
      setError(message);
      throw runtimeError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!connected) {
      return;
    }
    void refreshRuntime().catch(() => undefined);
  }, [connected, refreshRuntime]);

  useEffect(() => {
    if (!connected || modelsVersion <= 0) {
      previousModelsVersionRef.current = modelsVersion;
      return;
    }
    if (previousModelsVersionRef.current === modelsVersion) {
      return;
    }
    previousModelsVersionRef.current = modelsVersion;
    void refreshRuntime().catch(() => undefined);
  }, [connected, modelsVersion, refreshRuntime]);

  const companyCount = useMemo(() => companyConfig?.companies.length ?? 0, [companyConfig]);
  const codexModels = useMemo(
    () => availableModels.filter((model) => model.provider === "openai-codex"),
    [availableModels],
  );
  const orgAutopilotEnabled = activeCompany ? isOrgAutopilotEnabled(activeCompany) : false;
  const providerConfigs = ((configSnapshot?.config as { models?: { providers?: Record<string, GatewayProviderConfig> } })
    ?.models?.providers ?? {}) as Record<string, GatewayProviderConfig>;
  const telegramConfig = ((configSnapshot?.config as {
    channels?: { telegram?: { enabled?: boolean; botToken?: string } };
  })?.channels?.telegram ?? null) as GatewayTelegramConfig;
  const authorityHealth = useMemo(() => extractAuthorityHealth(status), [status]);
  const executorStatus = authorityHealth?.executor ?? null;
  const executorConfig = authorityHealth?.executorConfig ?? null;
  const doctorBaseline = useMemo<GatewayDoctorBaseline>(() => {
    const gatewayLayer: GatewayDoctorLayer = connected
      ? {
          id: "gateway",
          label: "Gateway",
          state: "ready",
          summary: "浏览器已连上当前后端。",
          detail: `当前阶段：${phase}。`,
        }
      : {
          id: "gateway",
          label: "Gateway",
          state: gatewayError ? "blocked" : "degraded",
          summary: gatewayError ? "浏览器与后端当前未连通。" : "浏览器尚未建立稳定连接。",
          detail: gatewayError ?? `当前阶段：${phase}。`,
        };

    const authorityLayer: GatewayDoctorLayer = authorityHealth
      ? {
          id: "authority",
          label: "Authority",
          state: resolveAuthorityStorageState(authorityHealth),
          summary:
            collectAuthorityGuidance(authorityHealth, 1)[0] ??
            "Authority 本地权威源在线，doctor 与 preflight 已通过。",
          detail:
            `${authorityHealth.authority.dbPath} · schema v${
              authorityHealth.authority.doctor.schemaVersion ?? "?"
            } · backups ${authorityHealth.authority.doctor.backupCount}`
            + (
              authorityHealth.authority.doctor.latestBackupAt
                ? ` · latest ${new Date(authorityHealth.authority.doctor.latestBackupAt).toLocaleString("zh-CN", {
                    hour12: false,
                  })}`
                : ""
            ),
          timestamp: authorityHealth.authority.startedAt,
        }
      : {
          id: "authority",
          label: "Authority",
          state: connected ? "degraded" : "blocked",
          summary: connected ? "还没拿到 Authority 健康快照。" : "Authority 健康信息不可用。",
          detail: "请先重连 Gateway 或刷新运行时。",
        };

    const executorLayer: GatewayDoctorLayer = {
      id: "executor",
      label: "Executor",
      state: executorStatus?.state ?? "blocked",
      summary: executorStatus?.note ?? "下游执行器状态未知。",
      detail:
        executorConfig?.openclaw.url ??
        executorConfig?.lastError ??
        "尚未检测到可用执行器地址。",
      timestamp: executorConfig?.lastConnectedAt ?? null,
    };

    const runtimeLayerState: GatewayDoctorLayerState =
      runtimeSync.lastError
        ? "degraded"
        : runtimeSync.commandCount > 0 || runtimeSync.pushCount > 0 || runtimeSync.pullCount > 0
          ? "ready"
          : "degraded";
    const runtimeLayer: GatewayDoctorLayer = {
      id: "runtime",
      label: "Runtime",
      state: runtimeLayerState,
      summary:
        runtimeSync.mode === "command_preferred"
          ? "主线开始优先走 command 写入。"
          : "当前仍保留 snapshot 兼容同步。",
      detail:
        runtimeSync.lastError ??
        `push ${runtimeSync.pushCount} / pull ${runtimeSync.pullCount} / command ${runtimeSync.commandCount}`,
      timestamp:
        runtimeSync.lastCommandAt ??
        runtimeSync.lastPullAt ??
        runtimeSync.lastPushAt ??
        null,
    };

    return {
      overallState: foldLayerStates([
        gatewayLayer.state,
        authorityLayer.state,
        executorLayer.state,
        runtimeLayer.state,
      ]),
      mode: runtimeSync.mode,
      layers: [gatewayLayer, authorityLayer, executorLayer, runtimeLayer],
      validationChecklist: [
        "单 tab 正常推进一条 requirement",
        "刷新后主线不漂移",
        "断连重连后状态不回退",
        "晚到 control message 不会把主线改乱",
        "authority / gateway / executor 异常能分层定位",
      ],
      compatibilityPathEnabled: runtimeSync.compatibilityPathEnabled,
      commandRoutes: runtimeSync.commandRoutes,
      lastError: runtimeSync.lastError,
    };
  }, [authorityHealth, connected, executorConfig, executorStatus, gatewayError, phase, runtimeSync]);

  return {
    url,
    token,
    connected,
    companyConfig,
    activeCompany,
    status,
    channels,
    skills,
    configSnapshot,
    loading,
    error,
    companyCount,
    codexModels,
    orgAutopilotEnabled,
    providerConfigs,
    telegramConfig,
    authorityHealth,
    doctorBaseline,
    executorStatus,
    executorConfig,
    refreshRuntime,
  };
}

export type GatewaySettingsQueryResult = ReturnType<typeof useGatewaySettingsQuery>;

export function useGatewaySettingsCommands(input: {
  activeCompany: ReturnType<typeof useCompanyShellQuery>["activeCompany"];
  configSnapshot: GatewayConfigSnapshot | null;
  orgAutopilotEnabled: boolean;
  refreshRuntime: () => Promise<unknown>;
}) {
  const { url, token, connect, disconnect, markModelsRefreshed } = useGatewayStore();
  const { switchCompany, loadConfig } = useCompanyShellCommands();
  const { updateCompany } = useOrgApp();

  const [telegramSaving, setTelegramSaving] = useState(false);
  const [providerKeySaving, setProviderKeySaving] = useState(false);
  const [addProviderSaving, setAddProviderSaving] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [codexAuthorizing, setCodexAuthorizing] = useState(false);
  const [codexImporting, setCodexImporting] = useState(false);
  const [codexRefreshing, setCodexRefreshing] = useState(false);
  const [executorSaving, setExecutorSaving] = useState(false);
  const [orgAutopilotSaving, setOrgAutopilotSaving] = useState(false);
  const [collaborationPolicySaving, setCollaborationPolicySaving] = useState(false);

  const reconnectGateway = useCallback(() => {
    connect(url, token);
  }, [connect, token, url]);

  const handleImportCodexAuth = useCallback(async () => {
    setCodexImporting(true);
    try {
      const imported = await gateway.importCodexCliAuth();
      const refreshed = await gateway.refreshModels();
      await syncCodexModelsToAllowlist(refreshed.models ?? []);
      const reapplyResult = await reapplyCodexModelsToActiveSessions();
      const nextModels = await refreshAvailableModels();
      const nextCodexModels = nextModels.filter((model) => model.provider === "openai-codex");
      markModelsRefreshed();
      await input.refreshRuntime();
      return {
        title: "Codex 授权已同步",
        description:
          `已导入 ${imported.profileId}，当前发现 ${nextCodexModels.length} 个 Codex 模型。`
          + formatCodexRuntimeSyncDescription(reapplyResult),
      };
    } finally {
      setCodexImporting(false);
    }
  }, [input, markModelsRefreshed]);

  const handleRefreshCodexModels = useCallback(async () => {
    setCodexRefreshing(true);
    try {
      const refreshed = await gateway.refreshModels();
      await syncCodexModelsToAllowlist(refreshed.models ?? []);
      const reapplyResult = await reapplyCodexModelsToActiveSessions();
      const nextModels = await refreshAvailableModels();
      const nextCodexModels = nextModels.filter((model) => model.provider === "openai-codex");
      markModelsRefreshed();
      await input.refreshRuntime();
      return {
        title: "Codex 模型已刷新",
        description:
          `当前可用 ${nextCodexModels.length} 个 OpenAI Codex 模型。`
          + formatCodexRuntimeSyncDescription(reapplyResult),
      };
    } finally {
      setCodexRefreshing(false);
    }
  }, [input, markModelsRefreshed]);

  const handleStartCodexOAuth = useCallback(async () => {
    setCodexAuthorizing(true);
    try {
      const started = await gateway.startCodexOAuth();
      const popup = window.open(
        started.authUrl,
        "cyber-company-codex-oauth",
        "popup=yes,width=540,height=760,resizable=yes,scrollbars=yes",
      );
      if (!popup) {
        throw new Error("浏览器拦截了授权弹窗，请允许当前站点弹窗后重试。");
      }
      popup.focus();

      while (Date.now() < started.expiresAtMs) {
        await sleep(1200);
        const status = await gateway.getCodexOAuthStatus(started.state);
        if (status.status === "pending") {
          continue;
        }
        if (status.status === "error") {
          throw new Error(status.errorMessage ?? "Codex OAuth 失败，请重试。");
        }

        const refreshed = await gateway.refreshModels();
        await syncCodexModelsToAllowlist(refreshed.models ?? []);
        const reapplyResult = await reapplyCodexModelsToActiveSessions();
        const nextModels = await refreshAvailableModels();
        const nextCodexModels = nextModels.filter((model) => model.provider === "openai-codex");
        markModelsRefreshed();
        popup.close();
        await input.refreshRuntime();
        return {
          title: "Codex 授权成功",
          description:
            `已导入 ${status.profileId ?? "openai-codex"}，当前发现 ${nextCodexModels.length} 个 Codex 模型。`
            + formatCodexRuntimeSyncDescription(reapplyResult),
        };
      }

      throw new Error("等待 Codex 授权超时，请确认你已在弹窗中完成登录后重试。");
    } finally {
      setCodexAuthorizing(false);
    }
  }, [input, markModelsRefreshed]);

  const handleTelegramSubmit = useCallback(async (values: Record<string, string>) => {
    const botToken = (values.botToken ?? "").trim();
    if (!botToken || !input.configSnapshot?.hash) {
      return null;
    }

    setTelegramSaving(true);
    try {
      await gateway.patchConfig(
        {
          channels: {
            telegram: { botToken, enabled: true },
          },
        },
        input.configSnapshot.hash,
      );
      await input.refreshRuntime();
      return { title: "渠道配置已更新", description: "Telegram Bot Token 已挂载" };
    } finally {
      setTelegramSaving(false);
    }
  }, [input]);

  const onProviderKeySubmit = useCallback(async (providerKeyTarget: string | null, values: Record<string, string>) => {
    const key = values.apiKey?.trim();
    if (!key || !input.configSnapshot?.hash || !providerKeyTarget) {
      return null;
    }

    setProviderKeySaving(true);
    try {
      await gateway.patchConfig(
        {
          models: {
            providers: {
              [providerKeyTarget]: { apiKey: key },
            },
          },
        },
        input.configSnapshot.hash,
      );
      await input.refreshRuntime();
      return { title: "鉴权更新", description: `${providerKeyTarget} 的 API Key 已更换` };
    } finally {
      setProviderKeySaving(false);
    }
  }, [input]);

  const handleAddProviderSubmit = useCallback(async (values: Record<string, string>) => {
    const name = values.providerName?.trim().toLowerCase();
    const key = values.apiKey?.trim();
    const baseUrl = values.baseUrl?.trim();

    if (!name || !key || !input.configSnapshot?.hash) {
      return null;
    }

    setAddProviderSaving(true);
    try {
      const providerPayload: GatewayProviderConfig = { apiKey: key };
      if (baseUrl) {
        providerPayload.baseUrl = baseUrl;
      }
      await gateway.patchConfig(
        {
          models: {
            providers: {
              [name]: providerPayload,
            },
          },
        },
        input.configSnapshot.hash,
      );
      await input.refreshRuntime();
      return { title: "供应商已添加", description: `${name} 服务集装载成功。` };
    } finally {
      setAddProviderSaving(false);
    }
  }, [input]);

  const handleSyncModels = useCallback(async (providerName: string, providerConfig: GatewayProviderConfig) => {
    if (!providerConfig.apiKey) {
      throw new Error("请先配置该服务商的 API Key 再尝试同步。");
    }
    const configHash = input.configSnapshot?.hash;
    if (!configHash) {
      throw new Error("当前没有可用的配置快照，请先刷新运行时。");
    }

    setSyncingProvider(providerName);
    try {
      let endpoint = "https://api.openai.com/v1/models";
      if (providerConfig.baseUrl) {
        endpoint = providerConfig.baseUrl.endsWith("/")
          ? `${providerConfig.baseUrl}models`
          : `${providerConfig.baseUrl}/models`;
      } else if (providerName.includes("anthropic")) {
        throw new Error("Anthropic 官方未提供公开 Models 列举端点，除非通过兼容网关。");
      } else if (providerName.includes("deepseek")) {
        endpoint = "https://api.deepseek.com/models";
      }

      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${providerConfig.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data: unknown = await res.json();
      let modelList: string[] = [];
      if (data && typeof data === "object" && Array.isArray((data as { data?: unknown[] }).data)) {
        modelList = (data as { data: Array<{ id?: unknown }> }).data
          .map((model) => (typeof model.id === "string" ? model.id : ""))
          .filter((modelId) => modelId.length > 0);
      } else if (Array.isArray(data)) {
        modelList = data
          .map((model) => {
            if (typeof model === "string") {
              return model;
            }
            if (model && typeof model === "object" && typeof (model as { id?: unknown }).id === "string") {
              return (model as { id: string }).id;
            }
            return "";
          })
          .filter((modelId) => modelId.length > 0);
      } else {
        throw new Error("无法解析上游厂商返回的模型数据格式。");
      }

      if (modelList.length === 0) {
        throw new Error("同步成功但没有发现任何模型可用。");
      }

      await gateway.patchConfig(
        {
          models: {
            providers: {
              [providerName]: { models: modelList },
            },
          },
        },
        configHash,
      );
      await input.refreshRuntime();
      return {
        title: "同步模型成功",
        description: `成功为主机 ${providerName} 登记了 ${modelList.length} 个模型。`,
      };
    } finally {
      setSyncingProvider(null);
    }
  }, [input]);

  const handleToggleOrgAutopilot = useCallback(async () => {
    if (!input.activeCompany || orgAutopilotSaving) {
      return null;
    }

    setOrgAutopilotSaving(true);
    try {
      const nextEnabled = !input.orgAutopilotEnabled;
      await updateCompany({
        orgSettings: {
          ...(input.activeCompany.orgSettings ?? {}),
          autoCalibrate: nextEnabled,
        },
      });
      return {
        title: nextEnabled ? "组织自校准已开启" : "组织自校准已关闭",
        description: nextEnabled
          ? "系统会在发现组织结构不合理时自动完成校准。"
          : "后续组织调整将停留在建议模式，由你或 CEO 手动应用。",
      };
    } finally {
      setOrgAutopilotSaving(false);
    }
  }, [input.activeCompany, input.orgAutopilotEnabled, orgAutopilotSaving, updateCompany]);

  const handleExecutorConfigSubmit = useCallback(async (values: Record<string, string>) => {
    const openclawUrl = values.openclawUrl?.trim();
    if (!openclawUrl) {
      return null;
    }

    setExecutorSaving(true);
    try {
      await patchAuthorityExecutorConfig({
        openclaw: {
          url: openclawUrl,
          ...(values.openclawToken?.trim() ? { token: values.openclawToken.trim() } : {}),
        },
        reconnect: true,
      });
      await input.refreshRuntime();
      return {
        title: "执行后端已更新",
        description: "Authority 已保存并重连下游 OpenClaw。",
      };
    } finally {
      setExecutorSaving(false);
    }
  }, [input]);

  const handleExecutorReconnect = useCallback(async () => {
    setExecutorSaving(true);
    try {
      await patchAuthorityExecutorConfig({ reconnect: true });
      await input.refreshRuntime();
      return {
        title: "执行后端已重连",
        description: "Authority 已向下游 OpenClaw 发起重连。",
      };
    } finally {
      setExecutorSaving(false);
    }
  }, [input]);

  const handleUpdateCollaborationPolicy = useCallback(
    async (collaborationPolicy: CompanyCollaborationPolicy) => {
      if (!input.activeCompany || collaborationPolicySaving) {
        return null;
      }

      setCollaborationPolicySaving(true);
      try {
        await updateCompany({
          orgSettings: {
            ...(input.activeCompany.orgSettings ?? {}),
            collaborationPolicy,
          },
        });
        return {
          title: "协作策略已更新",
          description: `已保存默认协作规则，并维护 ${collaborationPolicy.explicitEdges?.length ?? 0} 条显式协作边。`,
        };
      } finally {
        setCollaborationPolicySaving(false);
      }
    },
    [collaborationPolicySaving, input.activeCompany, updateCompany],
  );

  return {
    switchCompany,
    loadConfig,
    reconnectGateway,
    disconnectGateway: disconnect,
    handleImportCodexAuth,
    handleRefreshCodexModels,
    handleStartCodexOAuth,
    handleTelegramSubmit,
    onProviderKeySubmit,
    handleAddProviderSubmit,
    handleSyncModels,
    handleExecutorConfigSubmit,
    handleExecutorReconnect,
    handleToggleOrgAutopilot,
    handleUpdateCollaborationPolicy,
    telegramSaving,
    providerKeySaving,
    addProviderSaving,
    syncingProvider,
    codexAuthorizing,
    codexImporting,
    codexRefreshing,
    executorSaving,
    orgAutopilotSaving,
    collaborationPolicySaving,
  };
}

export type GatewaySettingsCommandsResult = ReturnType<typeof useGatewaySettingsCommands>;
