import type { ReactNode } from "react";
import { Badge } from "../../components/ui/badge";

type ExecutiveSummaryTone = "neutral" | "success" | "warning" | "accent";

type ExecutiveSummaryItem = {
  id: string;
  label: string;
  value: string;
  tone?: ExecutiveSummaryTone;
};

function toneClass(tone: ExecutiveSummaryTone = "neutral") {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (tone === "accent") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }
  return "border-slate-200 bg-white text-slate-600";
}

export function ExecutiveSummaryStrip(props: {
  title: string;
  summary: string;
  items: ExecutiveSummaryItem[];
  footnote?: string | null;
  action?: ReactNode;
}) {
  const { title, summary, items, footnote, action } = props;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-600">{summary}</div>
        </div>
        {action}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item.id} variant="outline" className={toneClass(item.tone)}>
            {item.label} {item.value}
          </Badge>
        ))}
      </div>
      {footnote ? <div className="mt-3 text-xs leading-5 text-slate-500">{footnote}</div> : null}
    </div>
  );
}
