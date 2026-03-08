import * as Dialog from "@radix-ui/react-dialog";
import { useMemo } from "react";
import { parseHrDepartmentPlan } from "../../lib/hr-dept-plan";
import { HrDepartmentPlanCard } from "../chat/HrDepartmentPlanCard";
import { Badge } from "./badge";
import { Button } from "./button";

export type HrPlanDialogState =
  | { status: "idle" }
  | { status: "waiting"; sessionKey: string; runId: string | null }
  | { status: "ready"; sessionKey: string; runId: string | null; rawText: string }
  | { status: "error"; sessionKey: string | null; runId: string | null; message: string };

type HrDepartmentPlanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: HrPlanDialogState;
  canApply: boolean;
  applyLabel?: string;
  busy?: boolean;
  onApply: () => void | Promise<void>;
};

function summarize(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "(empty)";
  }
  const lines = trimmed.split("\n").slice(0, 18).join("\n");
  return lines.length < trimmed.length ? `${lines}\n...` : lines;
}

export function HrDepartmentPlanDialog({
  open,
  onOpenChange,
  state,
  canApply,
  applyLabel = "应用 HR 方案",
  busy,
  onApply,
}: HrDepartmentPlanDialogProps) {
  const header = useMemo(() => {
    if (state.status === "waiting") {
      return { title: "等待 HR 输出方案", badge: "RUNNING" };
    }
    if (state.status === "ready") {
      return { title: "HR 方案已生成", badge: "READY" };
    }
    if (state.status === "error") {
      return { title: "HR 方案失败", badge: "ERROR" };
    }
    return { title: "HR 建部门", badge: "IDLE" };
  }, [state.status]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[95] bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[96] w-[min(94vw,56rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b bg-slate-50 px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-slate-900">
                {header.title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500">
                这一步由 HR agent 分析并输出结构化方案，前端仅负责校验并落盘到 company-config.json。
              </Dialog.Description>
            </div>
            <Badge variant="outline" className="text-[10px] bg-white">
              {header.badge}
            </Badge>
          </div>

          <div className="p-5">
            {state.status === "waiting" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <div className="font-semibold">正在等待 HR...</div>
                <div className="mt-1 text-xs text-slate-500 font-mono">
                  session: {state.sessionKey}
                  {state.runId ? ` · runId: ${state.runId}` : ""}
                </div>
              </div>
            ) : null}

            {state.status === "ready" ? (
              <div className="space-y-3">
                {(() => {
                  const plan = parseHrDepartmentPlan(state.rawText);
                  if (plan) {
                    return (
                      <div className="max-h-[60vh] overflow-y-auto w-full -mx-5 px-5 py-2 relative">
                        {/* 我们通过包装稍微限制和优化弹窗中这块卡片的宽和边距适配 */}
                        <div className="w-full flex justify-center">
                          <HrDepartmentPlanCard plan={plan} />
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-200 font-mono whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
                      {summarize(state.rawText)}
                    </div>
                  );
                })()}

                <div className="text-xs text-slate-500 pt-2 border-t">
                  你可以直接应用方案，或回到 HR 会话继续让 HR 调整再试。
                </div>
              </div>
            ) : null}

            {state.status === "error" ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
                {state.message}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t bg-slate-50 px-5 py-4">
            <div className="text-xs text-slate-500">
              {state.status === "ready" ? "建议：应用后回到组织图检查部门边界与汇报线。" : ""}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                关闭
              </Button>
              <Button onClick={() => void onApply()} disabled={busy || !canApply}>
                {busy ? "应用中..." : applyLabel}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
