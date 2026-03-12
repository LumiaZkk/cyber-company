import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, HardDrive, Terminal, RotateCw } from "lucide-react";
import { useGatewayStore } from "../../application/gateway";
import { toast } from "../../components/system/toast-store";
import { ConnectionDiagnosisSummary } from "../shared/ConnectionDiagnosisSummary";

type GatewayStoreSnapshot = ReturnType<typeof useGatewayStore.getState>;

type ConnectFormProps = Pick<
  GatewayStoreSnapshot,
  | "providers"
  | "connect"
  | "connecting"
  | "error"
  | "connectError"
  | "phase"
  | "reconnectAttempts"
  | "lastCloseReason"
  | "manifest"
> & {
  currentProvider: GatewayStoreSnapshot["providers"][number] | undefined;
  savedUrl: string;
  savedToken: string;
};

function ConnectForm({
  providers,
  connect,
  connecting,
  error,
  connectError,
  phase,
  reconnectAttempts,
  lastCloseReason,
  manifest,
  currentProvider,
  savedUrl,
  savedToken,
}: ConnectFormProps) {
  const [url, setUrl] = useState(savedUrl || currentProvider?.defaultUrl || "");
  const [token, setToken] = useState(savedToken || "");
  const authorityOnly = providers.length <= 1;

  const handleConnect = (event: React.FormEvent) => {
    event.preventDefault();
    if (!url) {
      return;
    }
    connect(url, token);
  };

  const isFailed = phase === "failed";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="mb-4 space-y-1 text-sm">
          <div className="font-semibold text-slate-900">连接工作引擎</div>
          <p className="text-slate-500">
            浏览器现在只连接 Authority 控制面，由 Authority 统一持有权威源并代理下游 OpenClaw。
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 md:p-7">
          <form onSubmit={handleConnect} className="space-y-5">
            <div>
              {authorityOnly ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  <div className="font-medium text-slate-900">控制面入口</div>
                  <div className="mt-1">{currentProvider?.label || "Authority"}</div>
                  {currentProvider?.description ? (
                    <p className="mt-1 text-xs text-slate-500">{currentProvider.description}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="font-medium text-slate-800">执行器能力快照</div>
                <div className="mt-1">
                  运行模式：{manifest.actorStrategy} · 房间：{manifest.roomStrategy} · 归档：
                  {manifest.archiveStrategy} · 存储：{manifest.storageStrategy}
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-slate-500 sm:grid-cols-2">
                  <div>历史会话：{manifest.capabilities.sessionHistory ? "原生" : "产品降级"}</div>
                  <div>归档：{manifest.capabilities.sessionArchives ? "原生" : "产品归档"}</div>
                  <div>文件区：{manifest.capabilities.agentFiles ? "原生" : "产品产物库"}</div>
                  <div>多 Agent：{manifest.actorStrategy === "native-multi-actor" ? "原生" : "虚拟角色"}</div>
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
                  onChange={(event) => setUrl(event.target.value)}
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
                  onChange={(event) => setToken(event.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow sm:text-sm outline-none"
                  placeholder={currentProvider?.tokenPlaceholder || ""}
                />
              </div>
            </div>

            {error && !isFailed ? (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100 flex items-start gap-2">
                <div className="mt-0.5">⚠️</div>
                <div className="flex-1 break-words">
                  <div className="font-medium">{connectError?.title || "连接失败"}</div>
                  <div className="mt-1">{connectError?.message || error}</div>
                </div>
              </div>
            ) : null}

            {isFailed ? (
              <ConnectionDiagnosisSummary
                variant="onboarding"
                state="blocked"
                title={`${connectError?.title || "自动重连已停止"}（已重试 ${reconnectAttempts} 次）`}
                summary={
                  connectError?.message || "系统已经停止自动重连，请根据错误类型修正配置后再重试。"
                }
                detail={connectError?.debug || lastCloseReason || null}
                steps={
                  connectError?.steps?.length
                    ? connectError.steps
                    : [
                        "确认 authority daemon 正在运行",
                        `检查控制面地址是否正确（当前默认 ${currentProvider?.defaultUrl || "http://127.0.0.1:18790"}）`,
                        "如果 authority 开启了鉴权，确认 Token 输入无误",
                        "如果 authority 已连接但聊天仍失败，再检查设置页里的 OpenClaw 执行后端状态",
                        "检查本机与目标地址网络可达（防火墙/端口）",
                      ]
                }
                actions={
                  <button
                    type="button"
                    onClick={() => connect(url, token)}
                    disabled={connecting}
                    className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    重试连接
                  </button>
                }
              />
            ) : null}

            <button
              type="submit"
              disabled={connecting}
              className={`w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white transition-colors ${
                connecting ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {connecting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
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
              如果还没启动 Authority，请先运行{" "}
              <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-600">
                {currentProvider.connectHint}
              </code>
            </>
          ) : (
            "请先启动 Authority 控制面，再回来连接。"
          )}
        </p>
      </div>
    </div>
  );
}

export function ConnectPresentationPage() {
  const {
    providerId,
    providers,
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

  useEffect(() => {
    if (connected) {
      toast.success("连接成功", `${currentProvider?.label || "Authority"} 已连接，正在进入公司选择。`);
      navigate("/select");
    }
  }, [connected, currentProvider?.label, navigate]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    if (phase === "failed" && previousPhase !== "failed") {
      toast.error(
        connectError?.title || "自动重连失败",
        connectError?.message || "请检查 Authority 地址、Token 或 daemon 服务状态。",
      );
    }
    previousPhaseRef.current = phase;
  }, [connectError, phase]);

  return (
    <ConnectForm
      key={`${providerId}:${savedUrl}:${savedToken}`}
      providers={providers}
      connect={connect}
      connecting={connecting}
      error={error}
      connectError={connectError}
      phase={phase}
      reconnectAttempts={reconnectAttempts}
      lastCloseReason={lastCloseReason}
      manifest={manifest}
      currentProvider={currentProvider}
      savedUrl={savedUrl}
      savedToken={savedToken}
    />
  );
}
