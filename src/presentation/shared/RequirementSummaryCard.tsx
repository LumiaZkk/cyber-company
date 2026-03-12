import type { ReactNode } from "react";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";

type RequirementSummaryVariant = "summary" | "execution";

function getVariantCopy(variant: RequirementSummaryVariant) {
  if (variant === "execution") {
    return {
      eyebrow: "主线执行摘要",
      tone: "border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm",
      hint: "这里只保留主线执行顺序需要的信息，验收和完整排障留在需求中心与运营大厅。",
    };
  }
  return {
    eyebrow: "当前主线摘要",
    tone: "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white shadow-sm",
    hint: "这里只保留当前主线的最小事实，完整任务顺序和异常恢复分别留给看板与运营大厅。",
  };
}

export function RequirementSummaryCard(props: {
  visible: boolean;
  variant: RequirementSummaryVariant;
  title: string;
  currentStep: string;
  summary: string;
  owner: string;
  stage: string;
  nextStep: string;
  note?: string | null;
  actions?: ReactNode;
}) {
  const { visible, variant, title, currentStep, summary, owner, stage, nextStep, note, actions } = props;
  if (!visible) {
    return null;
  }

  const copy = getVariantCopy(variant);

  return (
    <Card className={copy.tone}>
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.4fr,1fr,auto] lg:items-center">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-500">
            {copy.eyebrow}
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-950">{title}</div>
          <div className="mt-2 text-sm leading-6 text-slate-700">{currentStep}</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">{summary}</div>
          <div className="mt-3 text-xs leading-5 text-slate-500">{note || copy.hint}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              当前负责人
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{owner}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">当前环节：{stage}</div>
          </div>
          <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              下一步
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-800">{nextStep}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {variant === "summary" ? (
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
              唯一主线
            </Badge>
          ) : (
            <Badge variant="outline" className="border-indigo-200 bg-white text-indigo-700">
              执行视图
            </Badge>
          )}
          {actions}
        </div>
      </CardContent>
    </Card>
  );
}
