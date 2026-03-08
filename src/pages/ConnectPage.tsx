import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, HardDrive, Terminal, RotateCw, Wrench } from "lucide-react";
import { useGatewayStore } from "../features/gateway/store";
import { toast } from "../features/ui/toast-store";

export function ConnectPage() {
  const {
    providerId,
    providers,
    setProvider,
    connect,
    connected,
    connecting,
    error,
    connectError,
    phase,
    reconnectAttempts,
    lastCloseReason,
    manifest,
    url: savedUrl,
    token: savedToken,
  } = useGatewayStore();
  const navigate = useNavigate();
  const previousPhaseRef = useRef(phase);
  const currentProvider = providers.find((provider) => provider.id === providerId) ?? providers[0];

  const [url, setUrl] = useState(savedUrl || currentProvider?.defaultUrl || "");
  const [token, setToken] = useState(savedToken || "");

  useEffect(() => {
    if (connected) {
      toast.success("连接成功", "Gateway 已连接，正在进入公司选择。");
      navigate("/select");
    }
  }, [connected, navigate]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    if (phase === "failed" && previousPhase !== "failed") {
      toast.error(
        connectError?.title || "自动重连失败",
        connectError?.message || "请检查地址、Token 或 Gateway 服务状态。",
      );
    }
    previousPhaseRef.current = phase;
  }, [connectError, phase]);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {return;}
    connect(url, token);
  };

  useEffect(() => {
    setUrl(savedUrl || currentProvider?.defaultUrl || "");
    setToken(savedToken || "");
  }, [currentProvider?.defaultUrl, savedToken, savedUrl]);

  const isFailed = phase === "failed";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="mb-4 space-y-1 text-sm">
          <div className="font-semibold text-slate-900">连接工作引擎</div>
          <p className="text-slate-500">
            通过统一协议接入 Agent 后端。当前使用 {currentProvider?.label || "工作引擎"}。
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 md:p-7">
          <form onSubmit={handleConnect} className="space-y-5">
            <div>
              <label htmlFor="backend-provider" className="block text-sm font-medium text-slate-700 mb-1">
                后端提供方
              </label>
              <select
                id="backend-provider"
                value={providerId}
                onChange={(e) => setProvider(e.target.value)}
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow sm:text-sm outline-none bg-white"
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
              {currentProvider?.description ? (
                <p className="mt-1 text-xs text-slate-500">{currentProvider.description}</p>
              ) : null}
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="font-medium text-slate-800">Provider Bootstrap</div>
                <div className="mt-1">
                  运行模式：{manifest.actorStrategy} · 房间：{manifest.roomStrategy} · 归档：{manifest.archiveStrategy}
                </div>
                {manifest.notes.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {manifest.notes.map((note) => (
                      <li key={note}>- {note}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2">当前后端能力完整，系统将优先使用原生能力。</div>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="gateway-url" className="block text-sm font-medium text-slate-700 mb-1">
                {currentProvider?.urlLabel || "服务地址"}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <HardDrive className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="gateway-url"
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow sm:text-sm outline-none"
                  placeholder={currentProvider?.defaultUrl || ""}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="gateway-token" className="block text-sm font-medium text-slate-700 mb-1">
                {currentProvider?.tokenLabel || "访问令牌"}{" "}
                <span className="text-slate-400 font-normal">
                  ({currentProvider?.tokenOptional === false ? "必填" : "可选"})
                </span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Terminal className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="gateway-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow sm:text-sm outline-none"
                  placeholder={currentProvider?.tokenPlaceholder || ""}
                />
              </div>
            </div>

            {error && !isFailed && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100 flex items-start gap-2">
                <div className="mt-0.5">⚠️</div>
                <div className="flex-1 break-words">
                  <div className="font-medium">{connectError?.title || "连接失败"}</div>
                  <div className="mt-1">{connectError?.message || error}</div>
                </div>
              </div>
            )}

            {isFailed ? (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex items-center gap-2 font-semibold">
                  <Wrench className="h-4 w-4" />
                  {connectError?.title || "自动重连已停止"}（已重试 {reconnectAttempts} 次）
                </div>
                <div className="text-xs leading-5 opacity-90">
                  {connectError?.message || "系统已经停止自动重连，请根据错误类型修正配置后再重试。"}
                </div>
                {connectError?.steps?.length ? (
                  <ul className="space-y-1 text-xs">
                    {connectError.steps.map((step) => (
                      <li key={step}>- {step}</li>
                    ))}
                  </ul>
                ) : null}
                {connectError?.debug || lastCloseReason ? (
                  <div className="text-xs opacity-70">最后错误：{connectError?.debug || lastCloseReason}</div>
                ) : null}
                {!connectError?.steps?.length ? (
                  <ul className="space-y-1 text-xs">
                    {[
                      "确认本地或远程 Gateway 进程正在运行",
                      "检查 Gateway URL 是否正确（本地默认 ws://localhost:18789）",
                      "如果启用了鉴权，确认 Token 输入无误",
                      "检查本机与目标地址网络可达（防火墙/端口）",
                    ].map((step) => (
                      <li key={step}>- {step}</li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  onClick={() => connect(url, token)}
                  disabled={connecting}
                  className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  重试连接
                </button>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={connecting}
              className={`w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white transition-colors
                ${connecting ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}
              `}
            >
              {connecting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  连接中...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  建立连接
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          {currentProvider?.connectHint ? (
            <>
              如果还没启动当前后端，请先运行{" "}
              <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-600">
                {currentProvider.connectHint}
              </code>
            </>
          ) : (
            "请先启动后端工作引擎，再回来连接。"
          )}
        </p>
      </div>
    </div>
  );
}
