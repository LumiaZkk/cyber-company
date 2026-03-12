import { AlertCircle, GitBranch, ListTodo } from "lucide-react";
import type { DecisionTicketRecord } from "../../../domain/delegation/types";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

type ChatDecisionTicketCardProps = {
  ticket: DecisionTicketRecord | null;
  legacyPending: boolean;
  submittingOptionId?: string | null;
  disabled?: boolean;
  onSelectOption?: ((optionId: string) => Promise<unknown> | void) | null;
};

export function ChatDecisionTicketCard(input: ChatDecisionTicketCardProps) {
  const {
    ticket,
    legacyPending,
    submittingOptionId = null,
    disabled = false,
    onSelectOption = null,
  } = input;

  if (!ticket && !legacyPending) {
    return null;
  }

  const isLegacyNotice = !ticket && legacyPending;
  const isRequirementChange = ticket?.decisionType === "requirement_change";
  const title = ticket
    ? isRequirementChange
      ? "需求变更待确认"
      : "待你决策"
    : "当前暂无可操作决策选项";
  const summary = ticket
    ? ticket.summary
    : "这条主线还停在待确认状态，但本轮没有结构化决策票据，所以这里暂时不会出现可点击选项。";

  return (
    <div
      className={cn(
        "mt-3 w-full max-w-2xl rounded-2xl p-3 text-slate-900 shadow-sm",
        isLegacyNotice
          ? "border border-slate-200 bg-slate-50/90"
          : "border border-amber-200 bg-amber-50/80",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium",
            isLegacyNotice
              ? "border-slate-200 text-slate-700"
              : "border-amber-200 text-amber-800",
          )}
        >
          {title}
        </span>
        {ticket ? (
          <span className="rounded-full border border-amber-100 bg-amber-100/60 px-2 py-0.5 text-[11px] text-amber-700">
            结构化决策
          </span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
            兼容提醒
          </span>
        )}
      </div>
      <div className="mt-3 flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 rounded-full bg-white p-2",
            isLegacyNotice
              ? "border border-slate-200 text-slate-500"
              : "border border-amber-200 text-amber-700",
          )}
        >
          {ticket ? (
            isRequirementChange ? (
              <GitBranch className="h-4 w-4" />
            ) : (
              <ListTodo className="h-4 w-4" />
            )
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-6 text-slate-900">{summary}</div>
          <div className="mt-1 text-xs leading-5 text-slate-600">
            {ticket
              ? "请直接在这里完成本次决策，系统会按票据结果持久化主线状态。"
              : "只有 CEO 补发带 metadata.control 的结构化决策后，这里才会出现可操作按钮。当前不会再从聊天正文里猜选项。"}
          </div>
        </div>
      </div>
      {ticket && ticket.options.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {ticket.options.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-auto min-h-8 max-w-full border-amber-300 bg-white px-3 py-2 text-left text-xs text-amber-950 hover:bg-amber-100",
                submittingOptionId === option.id && "opacity-70",
              )}
              onClick={() => void onSelectOption?.(option.id)}
              disabled={disabled || submittingOptionId === option.id}
            >
              <span className="block font-medium">
                {submittingOptionId === option.id ? "处理中..." : option.label}
              </span>
              {option.summary ? (
                <span className="mt-0.5 block whitespace-normal text-[11px] leading-5 text-slate-600">
                  {option.summary}
                </span>
              ) : null}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
