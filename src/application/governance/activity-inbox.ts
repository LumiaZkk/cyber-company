export type ActivityInboxState = "clear" | "watch" | "action_required";

export type ActivityInboxMetric = {
  label: string;
  value: string;
};

export type ActivityInboxSummary = {
  state: ActivityInboxState;
  badgeLabel: string;
  title: string;
  summary: string;
  detail: string;
  metrics: ActivityInboxMetric[];
};

type ActivityInboxInput = {
  scopeLabel: string;
  blockerCount?: number;
  requestCount?: number;
  handoffCount?: number;
  escalationCount?: number;
  pendingHumanDecisionCount?: number;
  manualTakeoverCount?: number;
};

function pluralizeCount(label: string, count: number) {
  return `${count} ${label}`;
}

export function buildActivityInboxSummary(input: ActivityInboxInput): ActivityInboxSummary {
  const blockerCount = Math.max(0, input.blockerCount ?? 0);
  const requestCount = Math.max(0, input.requestCount ?? 0);
  const handoffCount = Math.max(0, input.handoffCount ?? 0);
  const escalationCount = Math.max(0, input.escalationCount ?? 0);
  const pendingHumanDecisionCount = Math.max(0, input.pendingHumanDecisionCount ?? 0);
  const manualTakeoverCount = Math.max(0, input.manualTakeoverCount ?? 0);
  const unresolvedCoordinationCount = requestCount + handoffCount;
  const criticalAttentionCount =
    blockerCount + escalationCount + pendingHumanDecisionCount + manualTakeoverCount;

  if (pendingHumanDecisionCount > 0) {
    return {
      state: "action_required",
      badgeLabel: "需拍板",
      title: "先处理待拍板决策",
      summary: `${input.scopeLabel} 当前还有 ${pluralizeCount("条人类决策", pendingHumanDecisionCount)} 没有正式拍板，这会直接拖慢后续执行与交接闭环。`,
      detail:
        criticalAttentionCount - pendingHumanDecisionCount > 0
          ? `除此之外，还有 ${pluralizeCount("条执行异常", criticalAttentionCount - pendingHumanDecisionCount)} 正在堆积。建议先去运营大厅处理，再回到主线页继续推进。`
          : "建议先去运营大厅处理，再回到主线页继续推进。",
      metrics: [
        { label: "待拍板", value: String(pendingHumanDecisionCount) },
        { label: "接管", value: String(manualTakeoverCount) },
        { label: "升级", value: String(escalationCount + blockerCount) },
        { label: "待收口", value: String(unresolvedCoordinationCount) },
      ],
    };
  }

  if (manualTakeoverCount > 0 || escalationCount > 0 || blockerCount > 0) {
    return {
      state: "action_required",
      badgeLabel: "需介入",
      title: "先处理执行异常",
      summary: `${input.scopeLabel} 当前有 ${pluralizeCount("条需人工介入或升级的异常", manualTakeoverCount + escalationCount + blockerCount)}，继续堆积会把主线重新拉回排障。`,
      detail:
        unresolvedCoordinationCount > 0
          ? `另外还有 ${pluralizeCount("条请求或交接待收口", unresolvedCoordinationCount)}。建议先去运营大厅处理，再回到当前页面继续推进。`
          : "建议先去运营大厅处理，再回到当前页面继续推进。",
      metrics: [
        { label: "待拍板", value: String(pendingHumanDecisionCount) },
        { label: "接管", value: String(manualTakeoverCount) },
        { label: "升级", value: String(escalationCount + blockerCount) },
        { label: "待收口", value: String(unresolvedCoordinationCount) },
      ],
    };
  }

  if (unresolvedCoordinationCount > 0) {
    return {
      state: "watch",
      badgeLabel: "待收口",
      title: "还有协作闭环待收口",
      summary: `${input.scopeLabel} 当前还有 ${pluralizeCount("条请求或交接", unresolvedCoordinationCount)} 没有真正闭环，现在不一定阻塞，但如果继续累积，后面会把主线再次拉回排障。`,
      detail: "当前可以继续推进主线，但最好尽快把这些请求和交接收口，避免它们变成下一轮异常来源。",
      metrics: [
        { label: "待拍板", value: String(pendingHumanDecisionCount) },
        { label: "接管", value: String(manualTakeoverCount) },
        { label: "升级", value: String(escalationCount + blockerCount) },
        { label: "待收口", value: String(unresolvedCoordinationCount) },
      ],
    };
  }

  return {
    state: "clear",
    badgeLabel: "已收口",
    title: "当前没有新的运营异常",
    summary: `${input.scopeLabel} 当前没有待拍板决策、人工接管、升级异常或待收口的请求交接，可以继续把精力放在主线推进上。`,
    detail: "如果后续再出现超时、接管或需要人类拍板的动作，这条摘要会在各入口同步变成同一套提示。",
    metrics: [
      { label: "待拍板", value: String(pendingHumanDecisionCount) },
      { label: "接管", value: String(manualTakeoverCount) },
      { label: "升级", value: String(escalationCount + blockerCount) },
      { label: "待收口", value: String(unresolvedCoordinationCount) },
    ],
  };
}
