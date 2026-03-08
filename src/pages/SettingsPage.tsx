import {
  ChevronDown,
  ChevronUp,
  Key,
  MessageCircle,
  Settings2,
  Server,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionFormDialog } from "../components/ui/action-form-dialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { useCompanyStore } from "../features/company/store";
import { gateway } from "../features/backend";
import type { GatewayModelChoice } from "../features/backend";
import { useGatewayStore } from "../features/gateway/store";
import { isOrgAutopilotEnabled } from "../features/org/org-advisor";
import { toast } from "../features/ui/toast-store";
import { formatTime } from "../lib/utils";

type JsonMap = Record<string, unknown>;

function stringifyPreview(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toModelRef(model: GatewayModelChoice) {
  return `${model.provider}/${model.id}`;
}

export function SettingsPage() {
  const { url, connected, token, connect, disconnect, modelsVersion, markModelsRefreshed } =
    useGatewayStore();
  const { config: companyConfig, activeCompany, switchCompany, loadConfig, updateCompany } = useCompanyStore();
  const previousModelsVersionRef = useRef(modelsVersion);

  const [status, setStatus] = useState<JsonMap | null>(null);
  const [channels, setChannels] = useState<JsonMap | null>(null);
  const [skills, setSkills] = useState<JsonMap | null>(null);
  const [configSnapshot, setConfigSnapshot] = useState<any>(null);
  const [availableModels, setAvailableModels] = useState<GatewayModelChoice[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const [telegramSaving, setTelegramSaving] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [providerKeyDialogOpen, setProviderKeyDialogOpen] = useState(false);
  const [providerKeyTarget, setProviderKeyTarget] = useState<string | null>(null);
  const [providerKeySaving, setProviderKeySaving] = useState(false);

  // For new provider
  const [addProviderDialogOpen, setAddProviderDialogOpen] = useState(false);
  const [addProviderSaving, setAddProviderSaving] = useState(false);

  // For syncing models
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [codexAuthorizing, setCodexAuthorizing] = useState(false);
  const [codexImporting, setCodexImporting] = useState(false);
  const [codexRefreshing, setCodexRefreshing] = useState(false);
  const [orgAutopilotSaving, setOrgAutopilotSaving] = useState(false);

  const companyCount = useMemo(() => companyConfig?.companies.length ?? 0, [companyConfig]);
  const codexModels = useMemo(
    () => availableModels.filter((model) => model.provider === "openai-codex"),
    [availableModels],
  );
  const orgAutopilotEnabled = activeCompany ? isOrgAutopilotEnabled(activeCompany) : false;

  const refreshAvailableModels = async () => {
    const modelsResult = await gateway.listModels();
    const nextModels = modelsResult.models ?? [];
    setAvailableModels(nextModels);
    return nextModels;
  };

  const syncCodexModelsToAllowlist = async (models: GatewayModelChoice[]) => {
    const codexModels = models.filter((model) => model.provider === "openai-codex");
    if (codexModels.length === 0) {
      return false;
    }

    const snapshot = await gateway.getConfigSnapshot();
    const hash = snapshot.hash;
    if (!hash) {
      return false;
    }

    const currentModels =
      (snapshot.config as { agents?: { defaults?: { models?: Record<string, unknown> } } })?.agents?.defaults
        ?.models ?? {};
    const nextModels = { ...currentModels };
    let changed = false;

    for (const model of codexModels) {
      const ref = toModelRef(model);
      if (!(ref in nextModels)) {
        nextModels[ref] = {};
        changed = true;
      }
    }

    if (!changed) {
      setConfigSnapshot(snapshot);
      return false;
    }

    await gateway.patchConfig(
      {
        agents: {
          defaults: {
            models: nextModels,
          },
        },
      },
      hash,
    );

    const updatedSnapshot = await gateway.getConfigSnapshot();
    setConfigSnapshot(updatedSnapshot);
    return true;
  };

  const refreshRuntime = async (quiet = false) => {
    if (!gateway.isConnected) return;
    try {
      setLoading(true);
      setError(null);
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
      if (!quiet) toast.info("运行时状态已刷新", "网关快照已同步。");
    } catch (runtimeError) {
      const message = runtimeError instanceof Error ? runtimeError.message : String(runtimeError);
      setError(message);
      if (!quiet) toast.error("刷新状态失败", message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportCodexAuth = async () => {
    setCodexImporting(true);
    try {
      const imported = await gateway.importCodexCliAuth();
      const refreshed = await gateway.refreshModels();
      await syncCodexModelsToAllowlist(refreshed.models ?? []);
      const nextModels = await refreshAvailableModels();
      const nextCodexModels = nextModels.filter((model) => model.provider === "openai-codex");
      markModelsRefreshed();
      toast.success(
        "Codex 授权已同步",
        `已导入 ${imported.profileId}，当前发现 ${nextCodexModels.length} 个 Codex 模型。`,
      );
    } catch (err: any) {
      toast.error("Codex 同步失败", err.message || String(err));
    } finally {
      setCodexImporting(false);
    }
  };

  const handleRefreshCodexModels = async () => {
    setCodexRefreshing(true);
    try {
      const refreshed = await gateway.refreshModels();
      await syncCodexModelsToAllowlist(refreshed.models ?? []);
      const nextModels = await refreshAvailableModels();
      const nextCodexModels = nextModels.filter((model) => model.provider === "openai-codex");
      markModelsRefreshed();
      toast.success("Codex 模型已刷新", `当前可用 ${nextCodexModels.length} 个 OpenAI Codex 模型。`);
    } catch (err: any) {
      toast.error("Codex 模型刷新失败", err.message || String(err));
    } finally {
      setCodexRefreshing(false);
    }
  };

  const handleStartCodexOAuth = async () => {
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
      toast.info(
        "Codex 授权已发起",
        "请在弹出的授权窗口完成登录。OpenAI 会通过本机 localhost 回调，完成后模型列表会自动刷新。",
      );

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
        const nextModels = await refreshAvailableModels();
        const nextCodexModels = nextModels.filter((model) => model.provider === "openai-codex");
        markModelsRefreshed();
        popup.close();
        toast.success(
          "Codex 授权成功",
          `已导入 ${status.profileId ?? "openai-codex"}，当前发现 ${nextCodexModels.length} 个 Codex 模型。`,
        );
        return;
      }

      throw new Error("等待 Codex 授权超时，请确认你已在弹窗中完成登录后重试。");
    } catch (err: any) {
      toast.error("无法发起 Codex 授权", err.message || String(err));
    } finally {
      setCodexAuthorizing(false);
    }
  };

  useEffect(() => {
    void refreshRuntime(true);
  }, [connected]);

  useEffect(() => {
    if (!connected || modelsVersion <= 0) {
      previousModelsVersionRef.current = modelsVersion;
      return;
    }
    if (previousModelsVersionRef.current === modelsVersion) {
      return;
    }
    previousModelsVersionRef.current = modelsVersion;
    void refreshRuntime(true);
  }, [connected, modelsVersion]);

  const handleTelegramSubmit = async (values: Record<string, string>) => {
    const botToken = (values.botToken ?? "").trim();
    if (!botToken || !configSnapshot?.hash) return;
    try {
      setTelegramSaving(true);
      await gateway.patchConfig(
        {
          channels: {
            telegram: { botToken, enabled: true },
          },
        },
        configSnapshot.hash,
      );
      toast.success("渠道配置已更新", "Telegram Bot Token 已挂载");
      setTelegramDialogOpen(false);
      void refreshRuntime(true);
    } catch (err: any) {
      toast.error("配置失败", err.message || String(err));
    } finally {
      setTelegramSaving(false);
    }
  };

  const updateProviderKey = (provider: string) => {
    setProviderKeyTarget(provider);
    setProviderKeyDialogOpen(true);
  };

  const onProviderKeySubmit = async (values: Record<string, string>) => {
    const key = values.apiKey;
    if (!key || !configSnapshot?.hash || !providerKeyTarget) return;

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
        configSnapshot.hash,
      );
      toast.success("鉴权更新", `${providerKeyTarget} 的 API Key 已更换`);
      void refreshRuntime(true);
      setProviderKeyDialogOpen(false);
    } catch (err: any) {
      toast.error("鉴权更新失败", err.message || String(err));
    } finally {
      setProviderKeySaving(false);
    }
  };

  const handleAddProviderSubmit = async (values: Record<string, string>) => {
    const name = values.providerName?.trim().toLowerCase();
    const key = values.apiKey?.trim();
    const baseUrl = values.baseUrl?.trim();

    if (!name || !key || !configSnapshot?.hash) return;

    setAddProviderSaving(true);
    try {
      const providerPayload: any = { apiKey: key };
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
        configSnapshot.hash,
      );
      toast.success("供应商已添加", `${name} 服务集装载成功。`);
      void refreshRuntime(true);
      setAddProviderDialogOpen(false);
    } catch (err: any) {
      toast.error("供应商添加失败", err.message || String(err));
    } finally {
      setAddProviderSaving(false);
    }
  };

  const handleSyncModels = async (providerName: string, pConfig: any) => {
    if (!pConfig.apiKey) {
      toast.error("无法同步", "请先配置该服务商的 API Key 再尝试同步。");
      return;
    }

    setSyncingProvider(providerName);
    try {
      // Basic heuristic for common base URLs
      let endpoint = "https://api.openai.com/v1/models";
      if (pConfig.baseUrl) {
        endpoint = pConfig.baseUrl.endsWith("/")
          ? `${pConfig.baseUrl}models`
          : `${pConfig.baseUrl}/models`;
      } else {
        if (providerName.includes("anthropic")) {
          throw new Error("Anthropic 官方未提供公开 Models 列举端点，除非通过兼容网关。");
        } else if (providerName.includes("deepseek")) {
          endpoint = "https://api.deepseek.com/models";
        }
      }

      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${pConfig.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      let modelList: string[] = [];

      if (Array.isArray(data.data)) {
        modelList = data.data.map((m: any) => m.id);
      } else if (Array.isArray(data)) {
        modelList = data.map((m: any) => m.id || m);
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
        configSnapshot.hash,
      );

      toast.success(
        "同步模型成功",
        `成功为主机 ${providerName} 登记了 ${modelList.length} 个模型。`,
      );
      void refreshRuntime(true);
    } catch (err: any) {
      toast.error("同步失败", err.message || String(err));
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleToggleOrgAutopilot = async () => {
    if (!activeCompany || orgAutopilotSaving) {
      return;
    }

    setOrgAutopilotSaving(true);
    try {
      const nextEnabled = !orgAutopilotEnabled;
      await updateCompany({
        orgSettings: {
          ...(activeCompany.orgSettings ?? {}),
          autoCalibrate: nextEnabled,
        },
      });
      toast.success(
        nextEnabled ? "组织自校准已开启" : "组织自校准已关闭",
        nextEnabled
          ? "系统会在发现组织结构不合理时自动完成校准。"
          : "后续组织调整将停留在建议模式，由你或 CEO 手动应用。",
      );
    } catch (error) {
      toast.error("更新失败", error instanceof Error ? error.message : String(error));
    } finally {
      setOrgAutopilotSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 lg:p-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">全局设置</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            统一化管理安全网关、算力配置、接入渠道与运营实体
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={connected ? "text-green-700 bg-green-50 border-green-300" : "text-slate-500"}
          >
            {connected ? "Gateway 已连接" : "Gateway 未连接"}
          </Badge>
          <Button variant="outline" onClick={() => void refreshRuntime()} disabled={loading}>
            获取最新编排
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="w-5 h-5 text-slate-500" />
              系统核心网关
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm bg-slate-50 p-3 rounded-lg border">
              <div className="text-slate-500 mb-1 text-xs font-bold tracking-wider">
                服务器通信端点
              </div>
              <div className="font-mono text-slate-400">****** (内部路由已屏蔽)</div>
              <div className="mt-2 text-slate-500 mb-1 text-xs font-bold tracking-wider">
                网关安全凭证
              </div>
              <div>{token ? "******** (签名已准入)" : "未挂载鉴权"}</div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => connect(url, token)}
                disabled={loading || connected}
              >
                重连
              </Button>
              <Button
                variant="outline"
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={disconnect}
                disabled={loading || !connected}
              >
                断开
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="w-5 h-5 text-slate-500" />
              业务线运营实体
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border">
              当前挂载了 <strong>{companyCount}</strong> 家注册公司。
              <br />
              运营视口聚焦于：
              <strong className="text-indigo-600">{activeCompany?.name ?? "无"}</strong>
            </div>
            <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto pr-2">
              {companyConfig?.companies.map((company) => (
                <button
                  key={company.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${company.id === companyConfig.activeCompanyId ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500" : "hover:bg-slate-50"}`}
                  onClick={() => switchCompany(company.id)}
                >
                  <span className="font-medium">
                    {company.icon} {company.name}
                  </span>
                  {company.id === companyConfig.activeCompanyId && (
                    <Badge className="scale-75 bg-indigo-500 text-white">Active</Badge>
                  )}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void loadConfig()}
              disabled={loading}
            >
              拉取注册表并校准当前参数
            </Button>
            {activeCompany && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">组织自校准</div>
                    <div className="mt-1 text-xs leading-5 text-slate-600">
                      开启后，系统会自动识别小团队直管、大团队设负责人的组织问题，并直接重整汇报链。
                    </div>
                    {activeCompany.orgSettings?.lastAutoCalibratedAt && (
                      <div className="mt-2 text-[11px] leading-5 text-slate-500">
                        最近一次自动校准：
                        {formatTime(activeCompany.orgSettings.lastAutoCalibratedAt)}
                        {activeCompany.orgSettings.lastAutoCalibrationActions?.length
                          ? ` · ${activeCompany.orgSettings.lastAutoCalibrationActions.join(" · ")}`
                          : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        orgAutopilotEnabled
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-500"
                      }
                    >
                      {orgAutopilotEnabled ? "已开启" : "已关闭"}
                    </Badge>
                    <Button
                      variant={orgAutopilotEnabled ? "outline" : "default"}
                      onClick={() => void handleToggleOrgAutopilot()}
                      disabled={orgAutopilotSaving}
                    >
                      {orgAutopilotSaving
                        ? "保存中..."
                        : orgAutopilotEnabled
                          ? "关闭自动调整"
                          : "开启自动调整"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {configSnapshot?.config && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-sm border-indigo-100 flex flex-col">
            <CardHeader className="bg-indigo-50/30 pb-4 border-b">
              <CardTitle className="flex items-center justify-between text-lg text-indigo-900 w-full">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-indigo-600" />
                  计算引擎资源栈
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-indigo-700 bg-white"
                  onClick={() => setAddProviderDialogOpen(true)}
                >
                  <Plus className="w-4 h-4" /> 添加供应商
                </Button>
              </CardTitle>
              <CardDescription>按需调集各类大语言模型，并配发 API 执行令牌</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 flex-1 overflow-y-auto max-h-80">
              <div className="p-3 rounded-xl border border-sky-100 bg-sky-50/60 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-[200px] flex-1">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      OpenAI Codex (OAuth)
                      <Badge className="bg-sky-600 text-white">推荐</Badge>
                      {codexModels.length > 0 && (
                        <span className="text-[10px] font-normal text-sky-600 bg-white px-1.5 py-0.5 rounded-full border border-sky-100">
                          {codexModels.length} Models
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      支持直接授权回调，也支持从当前网关主机的 <span className="font-mono">~/.codex/auth.json</span> 一键同步授权，无需手填 API Key。
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {codexModels.length > 0
                        ? `已发现 ${codexModels.length} 个可用 Codex 模型，可直接供员工编排使用。`
                        : "尚未发现可用 Codex 模型；完成直接授权或本地同步后会自动刷新模型目录。"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 text-xs bg-white text-sky-700 border border-sky-200 hover:bg-sky-100"
                      onClick={() => void handleStartCodexOAuth()}
                      disabled={codexAuthorizing || codexImporting || codexRefreshing || loading}
                    >
                      {codexAuthorizing ? "跳转中..." : "直接授权登录"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 text-xs bg-sky-600 text-white hover:bg-sky-700"
                      onClick={() => void handleImportCodexAuth()}
                      disabled={codexAuthorizing || codexImporting || codexRefreshing || loading}
                    >
                      {codexImporting ? "同步中..." : "同步本地 Codex 授权"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 px-0 bg-white text-slate-600 hover:text-sky-600 hover:bg-sky-100"
                      disabled={codexAuthorizing || codexImporting || codexRefreshing || loading}
                      onClick={() => void handleRefreshCodexModels()}
                      title="刷新 Codex 可用模型列表"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${codexRefreshing ? "animate-spin text-sky-600" : ""}`}
                      />
                    </Button>
                  </div>
                </div>
                {codexModels.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {codexModels.slice(0, 6).map((model) => (
                      <Badge key={`${model.provider}/${model.id}`} variant="outline" className="bg-white">
                        {model.name || model.id}
                      </Badge>
                    ))}
                    {codexModels.length > 6 && (
                      <Badge variant="outline" className="bg-white text-slate-500">
                        +{codexModels.length - 6}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {Object.entries(configSnapshot.config.models?.providers || {}).map(
                ([providerName, pConfig]: [string, any]) => (
                  <div
                    key={providerName}
                    className="flex items-center justify-between p-3 rounded-xl border bg-white shadow-sm flex-wrap gap-2"
                  >
                    <div className="flex-1 min-w-[120px]">
                      <div className="font-semibold text-sm capitalize flex items-center gap-2">
                        {providerName.split("-")[0]}
                        {Array.isArray(pConfig.models) && (
                          <span className="text-[10px] font-normal text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                            {pConfig.models.length} Models
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[180px]">
                        鉴权: {pConfig.apiKey ? "******(已登记)" : "尚未配置"}
                      </div>
                      {pConfig.baseUrl && (
                        <div
                          className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[180px]"
                          title={pConfig.baseUrl}
                        >
                          URL: {pConfig.baseUrl}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 w-8 px-0 bg-slate-50 text-slate-600 hover:text-indigo-600 hover:bg-slate-100"
                        disabled={syncingProvider === providerName}
                        onClick={() => handleSyncModels(providerName, pConfig)}
                        title="通过 API 同步平台最新模型列表"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${syncingProvider === providerName ? "animate-spin text-indigo-500" : ""}`}
                        />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                        onClick={() => updateProviderKey(providerName)}
                      >
                        更新密钥
                      </Button>
                    </div>
                  </div>
                ),
              )}
              {Object.keys(configSnapshot.config.models?.providers || {}).length === 0 && (
                <div className="text-sm text-slate-400 text-center py-4">无提货商数据</div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-emerald-100 flex flex-col">
            <CardHeader className="bg-emerald-50/30 pb-4 border-b">
              <CardTitle className="flex items-center gap-2 text-lg text-emerald-900">
                <MessageCircle className="w-5 h-5 text-emerald-600" />
                外网应用链路通信
              </CardTitle>
              <CardDescription>绑定后，赛博公司将接通对应该社交体系的外网全量消息</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 flex-1 overflow-y-auto max-h-80">
              <div className="flex items-center justify-between p-3 rounded-xl border bg-white shadow-sm">
                <div>
                  <div className="font-semibold text-sm flex items-center gap-2">
                    Telegram 机器人
                    {configSnapshot.config.channels?.telegram?.enabled && (
                      <Badge
                        variant="outline"
                        className="text-[9px] h-4 text-emerald-600 border-emerald-200 bg-emerald-50"
                      >
                        运行中
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Token:{" "}
                    {configSnapshot.config.channels?.telegram?.botToken
                      ? "******(已载入)"
                      : "未装载"}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  onClick={() => setTelegramDialogOpen(true)}
                >
                  配置 / 覆盖
                </Button>
              </div>

              {Object.entries(configSnapshot.config.channels || {})
                .filter(([k]) => k !== "telegram" && k !== "defaults" && k !== "modelByChannel")
                .map(([channelName]) => (
                  <div
                    key={channelName}
                    className="flex items-center justify-between p-3 rounded-xl border bg-white shadow-sm opacity-60"
                  >
                    <div>
                      <div className="font-semibold text-sm capitalize">{channelName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">暂不支持在此视图直接修改</div>
                    </div>
                    <Badge variant="outline">只读</Badge>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-12 border rounded-xl overflow-hidden bg-white shadow-sm">
        <button
          className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          <div>
            <h3 className="font-semibold text-slate-700">系统底层探针监测器</h3>
            <p className="text-xs text-slate-500 mt-1">
              仅供系统级排错与高级运维参考，包含各注册集群的心跳快照。
            </p>
          </div>
          {advancedOpen ? (
            <ChevronUp className="text-slate-400" />
          ) : (
            <ChevronDown className="text-slate-400" />
          )}
        </button>

        {advancedOpen && (
          <div className="p-4 border-t grid grid-cols-1 lg:grid-cols-3 gap-4 bg-slate-50/50">
            <Card className="shadow-none border-slate-200">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">网关心跳切片</CardTitle>
              </CardHeader>
              <CardContent className="p-0 border-t">
                <pre className="text-[10px] bg-slate-950 text-slate-300 p-3 overflow-auto h-64 rounded-b-lg m-0">
                  {stringifyPreview(status)}
                </pre>
              </CardContent>
            </Card>
            <Card className="shadow-none border-slate-200">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">外网联络站切片</CardTitle>
              </CardHeader>
              <CardContent className="p-0 border-t">
                <pre className="text-[10px] bg-slate-950 text-slate-300 p-3 overflow-auto h-64 rounded-b-lg m-0">
                  {stringifyPreview(channels)}
                </pre>
              </CardContent>
            </Card>
            <Card className="shadow-none border-slate-200">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">内核函数块切片</CardTitle>
              </CardHeader>
              <CardContent className="p-0 border-t">
                <pre className="text-[10px] bg-slate-950 text-slate-300 p-3 overflow-auto h-64 rounded-b-lg m-0">
                  {stringifyPreview(skills)}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <ActionFormDialog
        open={telegramDialogOpen}
        onOpenChange={setTelegramDialogOpen}
        title="打通 Telegram 通道"
        description="填入机器人令牌，赛博公司底层将即时接管 Telegram 流量通信并分发响应。"
        confirmLabel="装载配置并重启网络"
        busy={telegramSaving}
        fields={[
          {
            name: "botToken",
            label: "Bot Token",
            type: "password",
            required: true,
            placeholder: "例如: 123456789:ABCDE...",
          },
        ]}
        onSubmit={handleTelegramSubmit}
      />

      <ActionFormDialog
        open={providerKeyDialogOpen}
        onOpenChange={setProviderKeyDialogOpen}
        title={`更新 ${providerKeyTarget || ""} 鉴权密钥`}
        description="系统底层将更新此算力通道的 API Key。此操作仅替换配置，尚未生效至具体特工。"
        confirmLabel="装载专属密钥"
        busy={providerKeySaving}
        fields={[
          {
            name: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "例如: sk-xxxxxxxxxxxxxxxx",
          },
        ]}
        onSubmit={onProviderKeySubmit}
      />

      <ActionFormDialog
        open={addProviderDialogOpen}
        onOpenChange={setAddProviderDialogOpen}
        title="添加自定义模型供应商"
        description="系统底层将挂载新的算力连通渠道，支持兼容标准 OpenAI Base URL 的第三方提货商中转。"
        confirmLabel="注册集成通道"
        busy={addProviderSaving}
        fields={[
          {
            name: "providerName",
            label: "供应商标识 (Provider Name)",
            type: "text",
            required: true,
            placeholder: "例如: openai, openrouter, deepseek, ali...",
          },
          {
            name: "baseUrl",
            label: "代理端点 (Base URL) - 选填",
            type: "text",
            required: false,
            placeholder: "例如: https://api.deepseek.com/v1",
          },
          {
            name: "apiKey",
            label: "授权令牌 (API Key)",
            type: "password",
            required: true,
            placeholder: "例如: sk-xxxxxxxx",
          },
        ]}
        onSubmit={handleAddProviderSubmit}
      />
    </div>
  );
}
