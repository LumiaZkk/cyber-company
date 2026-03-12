import { ArrowRight, MessageSquareMore, Users } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import type { DraftRequirementRecord } from "../../../domain/mission/types";

function resolveStatusLabel(state: DraftRequirementRecord["state"]) {
  if (state === "promoted_manual") {
    return "已转为需求";
  }
  if (state === "promoted_auto") {
    return "已自动升级";
  }
  if (state === "active_requirement") {
    return "已进入主线";
  }
  if (state === "draft_ready") {
    return "草案已生成";
  }
  return "等待你确认";
}

export function ChatRequirementDraftCard(input: {
  visible: boolean;
  draft: DraftRequirementRecord;
  onPromote: () => void;
  onContinueChat: () => void;
}) {
  if (!input.visible) {
    return null;
  }

  const showActions = ["draft_ready", "awaiting_promotion_choice"].includes(input.draft.state);

  return (
    <div className="px-3 pt-3 md:px-6">
      <Card className="border-amber-200/80 bg-gradient-to-br from-white via-amber-50/50 to-white shadow-sm">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.35fr,1fr,auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                需求草案
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {resolveStatusLabel(input.draft.state)}
              </span>
            </div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{input.draft.summary}</div>
            <div className="mt-2 text-sm leading-6 text-slate-700">{input.draft.nextAction}</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                当前负责人
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{input.draft.ownerLabel}</div>
            </div>
            <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                当前阶段
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-800">{input.draft.stage}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {showActions ? (
              <>
                <Button onClick={input.onPromote}>
                  <Users className="mr-2 h-4 w-4" />
                  确认并转为需求
                </Button>
                <Button variant="outline" onClick={input.onContinueChat}>
                  <MessageSquareMore className="mr-2 h-4 w-4" />
                  继续只聊天
                </Button>
              </>
            ) : (
              <Button variant="outline" disabled>
                已记录当前主线
              </Button>
            )}
            <Button variant="ghost" className="text-slate-600" onClick={input.onContinueChat}>
              查看并继续收敛
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
