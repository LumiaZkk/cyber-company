import { useGatewayStore } from "../../features/gateway/store";

export function GatewayStatusBanner() {
  const { connected, hasEverConnected, phase, error, url, token, connect, providerId, providers } =
    useGatewayStore();
  const currentProvider = providers.find((provider) => provider.id === providerId);

  if (connected || !hasEverConnected) {
    return null;
  }

  const isRetrying = phase === "reconnecting" || phase === "connecting";

  return (
    <div className="fixed left-0 right-0 top-0 z-[70] border-b border-amber-300 bg-amber-50/95 px-4 py-2 text-amber-900 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          <span className={`h-2.5 w-2.5 rounded-full ${isRetrying ? "animate-pulse bg-amber-500" : "bg-red-500"}`} />
          {isRetrying
            ? `${currentProvider?.label || "工作引擎"} 连接已断开，正在重连...`
            : `${currentProvider?.label || "工作引擎"} 连接中断`}
        </span>
        {error ? <span className="truncate text-xs opacity-80">{error}</span> : null}
        <button
          type="button"
          onClick={() => connect(url, token)}
          className="ml-auto rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          立即重试
        </button>
      </div>
    </div>
  );
}
