import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { gateway } from "../features/backend";
import { useGatewayStore } from "../features/gateway/store";
import { toast } from "../features/ui/toast-store";

type CallbackPhase = "connecting" | "authorizing" | "success" | "error";

export function CodexOAuthCallbackPage() {
  const navigate = useNavigate();
  const completedRef = useRef(false);
  const { connected, connecting, bootstrapAutoConnect, markModelsRefreshed } = useGatewayStore();
  const [phase, setPhase] = useState<CallbackPhase>("connecting");
  const [message, setMessage] = useState("正在连接网关并完成 Codex 授权...");
  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  useEffect(() => {
    bootstrapAutoConnect();
  }, [bootstrapAutoConnect]);

  const clearCallbackQuery = useCallback(() => {
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  useEffect(() => {
    if (completedRef.current || !connected) {
      return;
    }

    const providerError = params.get("error");
    if (providerError) {
      completedRef.current = true;
      const detail = params.get("error_description") || providerError;
      clearCallbackQuery();
      setPhase("error");
      setMessage(`OpenAI 返回授权错误：${detail}`);
      return;
    }

    const code = params.get("code")?.trim();
    const state = params.get("state")?.trim();
    if (!code || !state) {
      completedRef.current = true;
      clearCallbackQuery();
      setPhase("error");
      setMessage("回调参数不完整，缺少 code 或 state。请返回设置页重新发起授权。");
      return;
    }

    completedRef.current = true;
    setPhase("authorizing");
    setMessage("正在写入 Codex OAuth 凭据并刷新模型目录...");

    void (async () => {
      try {
        const completed = await gateway.completeCodexOAuth({ code, state });
        const refreshed = await gateway.refreshModels();
        const codexCount = (refreshed.models ?? []).filter((model) => model.provider === "openai-codex")
          .length;
        markModelsRefreshed();
        clearCallbackQuery();
        setPhase("success");
        setMessage(`授权已完成，已导入 ${completed.profileId}，当前发现 ${codexCount} 个 Codex 模型。`);
        toast.success("Codex 授权成功", `已同步 ${codexCount} 个可用模型。`);

        if (window.opener) {
          setTimeout(() => {
            window.opener?.focus();
            window.close();
          }, 1200);
        }
      } catch (err) {
        clearCallbackQuery();
        setPhase("error");
        setMessage(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [clearCallbackQuery, connected, markModelsRefreshed, params]);

  const icon = (() => {
    switch (phase) {
      case "success":
        return <CheckCircle2 className="h-10 w-10 text-emerald-600" />;
      case "error":
        return <ShieldAlert className="h-10 w-10 text-rose-600" />;
      default:
        return <Loader2 className="h-10 w-10 animate-spin text-sky-600" />;
    }
  })();

  const title =
    phase === "success"
      ? "Codex 授权完成"
      : phase === "error"
        ? "Codex 授权失败"
        : connecting || !connected
          ? "正在连接网关"
          : "正在完成授权";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg shadow-lg border-sky-100">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-200">
            {icon}
          </div>
          <div className="space-y-2">
            <CardTitle className="text-xl text-slate-900">{title}</CardTitle>
            <CardDescription>
              OpenAI Codex (OAuth) 回调页会把授权结果写回网关，并刷新可用模型目录。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-white px-4 py-3 text-sm text-slate-700">{message}</div>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => navigate("/settings", { replace: true })}>
              返回设置
            </Button>
            {window.opener && (
              <Button variant="secondary" onClick={() => window.close()}>
                关闭窗口
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
