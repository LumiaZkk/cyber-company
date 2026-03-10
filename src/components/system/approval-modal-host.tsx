import { useEffect, useMemo, useState } from "react";
import { gateway, useGatewayStore } from "../../application/gateway";
import {
  parseExecApprovalRequested,
  parseExecApprovalResolved,
  useApprovalStore,
} from "./approval-store";
import {
  isApprovalAudioReady,
  playApprovalArrivalTone,
  setupApprovalAudioUnlock,
} from "./approval-sound";
import { AgentOps, type ApprovalDecision } from "../../lib/agent-ops";
import { toast } from "./toast-store";

type GatewayEventEnvelope = {
  event: string;
  payload?: unknown;
};

function isGatewayEventEnvelope(value: unknown): value is GatewayEventEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { event?: unknown };
  return typeof candidate.event === "string";
}

export function ApprovalModalHost() {
  const queue = useApprovalStore((state) => state.queue);
  const busy = useApprovalStore((state) => state.busy);
  const error = useApprovalStore((state) => state.error);
  const enqueue = useApprovalStore((state) => state.enqueue);
  const remove = useApprovalStore((state) => state.remove);
  const setBusy = useApprovalStore((state) => state.setBusy);
  const setError = useApprovalStore((state) => state.setError);
  const hello = useGatewayStore((state) => state.hello);
  const [audioNoticeShown, setAudioNoticeShown] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setupApprovalAudioUnlock();

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = gateway.subscribe("*", (raw) => {
      if (!isGatewayEventEnvelope(raw)) {
        return;
      }

      if (raw.event === "exec.approval.requested") {
        const entry = parseExecApprovalRequested(raw.payload);
        if (!entry) {
          return;
        }
        enqueue(entry);
        toast.approval("收到新的执行审批", entry.request.command);
        void playApprovalArrivalTone().then((played) => {
          if (!played && !audioNoticeShown && !isApprovalAudioReady()) {
            toast.info("审批声音未激活", "点击页面任意位置后可启用审批声音提醒。");
            setAudioNoticeShown(true);
          }
        });
        return;
      }

      if (raw.event === "exec.approval.resolved") {
        const resolved = parseExecApprovalResolved(raw.payload);
        if (!resolved) {
          return;
        }
        remove(resolved.id);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [audioNoticeShown, enqueue, remove]);

  const active = queue[0];
  const canResolve = useMemo(() => {
    const methods = hello?.features?.methods;
    return Array.isArray(methods) && methods.includes("exec.approval.resolve");
  }, [hello]);

  if (!active) {
    return null;
  }

  const secondsLeft = Math.max(0, Math.ceil((active.expiresAtMs - now) / 1000));

  const handleDecision = async (decision: ApprovalDecision) => {
    setBusy(true);
    setError(null);
    try {
      await AgentOps.resolveApproval(active.id, decision);
      remove(active.id);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/55 px-4 py-8 backdrop-blur-sm">
      <div className="mx-auto mt-8 w-[min(92vw,48rem)] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">🛡️ 执行审批请求</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            {secondsLeft}s 后过期
          </span>
        </div>

        <div className="space-y-3 text-sm text-slate-700">
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">命令</div>
            <pre className="overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-green-300">{active.request.command}</pre>
          </div>

          {active.request.security ? (
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">风险说明</div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                {active.request.security}
              </div>
            </div>
          ) : null}

          {active.request.cwd ? (
            <div className="text-xs text-slate-500">工作目录: {active.request.cwd}</div>
          ) : null}

          {!canResolve ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              当前 Gateway 未开放 <code>exec.approval.resolve</code>，此页面只能查看审批请求，无法直接提交决策。
              请升级 Gateway 或在支持审批的控制端完成处理。
            </div>
          ) : null}

          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div> : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {!canResolve ? (
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => remove(active.id)}
            >
              暂时隐藏
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void handleDecision("allow-once");
            }}
            disabled={busy || !canResolve}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            ✅ 允许一次
          </button>
          <button
            type="button"
            onClick={() => {
              void handleDecision("deny");
            }}
            disabled={busy || !canResolve}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            ❌ 拒绝
          </button>
          <button
            type="button"
            onClick={() => {
              void handleDecision("allow-always");
            }}
            disabled={busy || !canResolve}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            🔓 始终信任
          </button>
        </div>
      </div>
    </div>
  );
}
