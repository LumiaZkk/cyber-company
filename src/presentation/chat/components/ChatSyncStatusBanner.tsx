import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "../../../components/ui/button";

export function ChatSyncStatusBanner(input: {
  visible: boolean;
  detail?: string | null;
  retrying?: boolean;
  onRetry: () => void;
}) {
  if (!input.visible) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50/80 px-4 py-3">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 text-sm text-amber-900 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">同步异常，当前状态可能过期</div>
            <div className="text-xs text-amber-800">
              {input.detail?.trim() || "页面当前内容基于上次成功同步的快照。"}
            </div>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
          onClick={input.onRetry}
          disabled={Boolean(input.retrying)}
        >
          <RefreshCcw className="mr-2 h-3.5 w-3.5" />
          {input.retrying ? "重新同步中..." : "重新同步当前主线"}
        </Button>
      </div>
    </div>
  );
}
