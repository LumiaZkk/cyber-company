import { Badge } from "../../components/ui/badge";
import type { ActivityInboxSummary } from "../../application/governance/activity-inbox";

export function ActivityInboxStrip(props: {
  summary: ActivityInboxSummary;
  title?: string;
}) {
  const { summary, title = "活动摘要" } = props;

  const styles = {
    clear: {
      container: "border-emerald-200 bg-emerald-50/70 text-emerald-950",
      badge: "border-emerald-200 bg-emerald-100 text-emerald-800",
      metric: "text-emerald-900",
      detail: "text-emerald-900/80",
    },
    watch: {
      container: "border-amber-200 bg-amber-50/70 text-amber-950",
      badge: "border-amber-200 bg-amber-100 text-amber-800",
      metric: "text-amber-900",
      detail: "text-amber-900/80",
    },
    action_required: {
      container: "border-rose-200 bg-rose-50/70 text-rose-950",
      badge: "border-rose-200 bg-rose-100 text-rose-800",
      metric: "text-rose-900",
      detail: "text-rose-900/80",
    },
  }[summary.state];

  return (
    <div className={`rounded-2xl border px-4 py-4 ${styles.container}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium">{title}</div>
            <Badge variant="outline" className={styles.badge}>
              {summary.badgeLabel}
            </Badge>
          </div>
          <div className="mt-2 text-sm font-semibold leading-6">{summary.title}</div>
          <div className="mt-1 text-sm leading-6">{summary.summary}</div>
          <div className={`mt-2 text-xs leading-5 ${styles.detail}`}>{summary.detail}</div>
        </div>
        <div className="grid min-w-[240px] grid-cols-2 gap-3">
          {summary.metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-white/70 bg-white/70 px-3 py-2 shadow-sm">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{metric.label}</div>
              <div className={`mt-1 text-sm font-semibold ${styles.metric}`}>{metric.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
