import type { ReactNode } from "react";
import type { GatewayDoctorLayerState } from "../../application/gateway/settings";
import { Badge } from "../../components/ui/badge";

type DiagnosisLayer = {
  id: string;
  label: string;
  state: GatewayDoctorLayerState;
  summary: string;
};

function stateTone(state: GatewayDoctorLayerState) {
  if (state === "ready") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (state === "blocked") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function ConnectionDiagnosisSummary(props: {
  state: GatewayDoctorLayerState;
  title: string;
  summary: string;
  detail?: string | null;
  steps?: string[];
  layers?: DiagnosisLayer[];
  actions?: ReactNode;
  variant?: "onboarding" | "steady";
}) {
  const { state, title, summary, detail, steps = [], layers = [], actions, variant = "steady" } = props;

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        variant === "onboarding" ? "border-slate-200 bg-slate-50/80" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-600">{summary}</div>
        </div>
        <Badge variant="outline" className={stateTone(state)}>
          {state}
        </Badge>
      </div>

      {layers.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {layers.map((layer) => (
            <Badge key={layer.id} variant="outline" className={stateTone(layer.state)}>
              {layer.label} · {layer.state}
            </Badge>
          ))}
        </div>
      ) : null}

      {detail ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
          {detail}
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="mt-3 space-y-1">
          {steps.map((step) => (
            <div key={step} className="text-xs text-slate-600">
              - {step}
            </div>
          ))}
        </div>
      ) : null}

      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
