import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import type { ResolvedExecutionState } from "../features/execution/state";

type ExecutionStateBadgeProps = {
  status: ResolvedExecutionState;
  compact?: boolean;
  className?: string;
};

const TONE_STYLES: Record<ResolvedExecutionState["tone"], string> = {
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  red: "bg-red-50 text-red-700 border-red-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
};

const DOT_STYLES: Record<ResolvedExecutionState["tone"], string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
};

export function ExecutionStateBadge(props: ExecutionStateBadgeProps) {
  const { status, compact = false, className } = props;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border px-2 py-1 font-medium",
        compact ? "text-[10px]" : "text-xs",
        TONE_STYLES[status.tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_STYLES[status.tone])} />
      {status.label}
    </Badge>
  );
}
