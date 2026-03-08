import type { CeoControlSurfaceSnapshot } from "../ceo/control-surface";
import type { Company, HandoffRecord, RequestRecord, TrackedTask } from "../company/types";
import type { ManualTakeoverPack } from "./takeover-pack";
import type { ResolvedExecutionState } from "./state";

type FocusAlertLike = {
  summary: string;
  recommendedAction?: string;
  detail?: string;
};

export type ExecutionFocusSummary = {
  headline: string;
  ownerLabel: string;
  ownerRole: string;
  collaboratorLabel?: string;
  currentWork: string;
  blockReason?: string;
  nextStep: string;
  userAction?: string;
  detailHint?: string;
};

function findEmployee(company: Company | null | undefined, agentId: string | null | undefined) {
  if (!company || !agentId) {
    return null;
  }
  return company.employees.find((employee) => employee.agentId === agentId) ?? null;
}

export function formatAgentLabel(company: Company | null | undefined, agentId: string | null | undefined): string {
  if (!agentId) {
    return "当前节点";
  }
  return findEmployee(company, agentId)?.nickname ?? agentId;
}

export function formatAgentRole(company: Company | null | undefined, agentId: string | null | undefined): string | null {
  return findEmployee(company, agentId)?.role ?? null;
}

export function formatAgentList(company: Company | null | undefined, agentIds: string[]): string {
  const labels = agentIds.map((agentId) => formatAgentLabel(company, agentId));
  return [...new Set(labels)].join("、");
}

export function formatRequestStatusLabel(status: RequestRecord["status"]): string {
  switch (status) {
    case "pending":
      return "待答";
    case "acknowledged":
      return "已接单";
    case "answered":
      return "已回复";
    case "blocked":
      return "已阻塞";
    case "superseded":
      return "已替代";
  }
}

export function formatRequestResolutionLabel(resolution: RequestRecord["resolution"]): string {
  switch (resolution) {
    case "pending":
      return "待完成";
    case "complete":
      return "已完成";
    case "partial":
      return "部分完成";
    case "manual_takeover":
      return "需接管";
  }
}

function pickPrimaryRequest(requests: RequestRecord[]): RequestRecord | null {
  const priority: Record<RequestRecord["status"], number> = {
    blocked: 0,
    pending: 1,
    acknowledged: 2,
    answered: 3,
    superseded: 4,
  };

  return (
    [...requests].sort((left, right) => {
      const byPriority = priority[left.status] - priority[right.status];
      if (byPriority !== 0) {
        return byPriority;
      }
      return right.updatedAt - left.updatedAt;
    })[0] ?? null
  );
}

function pickPrimaryHandoff(handoffs: HandoffRecord[]): HandoffRecord | null {
  const priority: Record<HandoffRecord["status"], number> = {
    blocked: 0,
    pending: 1,
    acknowledged: 2,
    completed: 3,
  };

  return (
    [...handoffs].sort((left, right) => {
      const byPriority = priority[left.status] - priority[right.status];
      if (byPriority !== 0) {
        return byPriority;
      }
      return right.updatedAt - left.updatedAt;
    })[0] ?? null
  );
}

export function buildExecutionFocusSummary(input: {
  company: Company | null | undefined;
  targetAgentId?: string | null;
  targetRoleLabel: string;
  execution: ResolvedExecutionState;
  task: TrackedTask | null;
  requests: RequestRecord[];
  handoffs: HandoffRecord[];
  takeoverPack: ManualTakeoverPack | null;
  ceoSurface?: CeoControlSurfaceSnapshot | null;
  alerts?: FocusAlertLike[];
}): ExecutionFocusSummary {
  const {
    company,
    targetAgentId,
    targetRoleLabel,
    execution,
    task,
    requests,
    handoffs,
    takeoverPack,
    ceoSurface,
    alerts = [],
  } = input;

  const ownerAgentId = task?.ownerAgentId ?? targetAgentId ?? task?.agentId ?? null;
  const ownerLabel = formatAgentLabel(company, ownerAgentId);
  const ownerRole = formatAgentRole(company, ownerAgentId) ?? targetRoleLabel;
  const primaryRequest = pickPrimaryRequest(requests);
  const primaryHandoff = pickPrimaryHandoff(handoffs);
  const collaboratorAgentId = primaryRequest?.toAgentIds[0] ?? primaryHandoff?.toAgentIds[0] ?? null;
  const collaboratorLabel = collaboratorAgentId
    ? formatAgentLabel(company, collaboratorAgentId)
    : undefined;

  let headline = execution.label;
  let currentWork = execution.summary;
  let blockReason = task?.blockedReason;
  let nextStep = execution.actionable ? "优先处理当前阻塞。" : "等待当前链路继续推进。";
  let userAction: string | undefined;
  let detailHint: string | undefined;

  if (takeoverPack) {
    headline = "当前需要人工接管";
    currentWork = `${ownerLabel} 这条链路已经无法自动闭环。`;
    blockReason = takeoverPack.failureSummary;
    nextStep = takeoverPack.recommendedNextAction;
    userAction = "你现在可以复制接管包，手动继续把这条链路跑完。";
  } else if (primaryRequest) {
    const targetLabel = collaboratorLabel ?? "相关同事";
    if (primaryRequest.status === "blocked") {
      headline = `${targetLabel} 这一步卡住了`;
      currentWork = `${ownerLabel} 发出的协作请求没有顺利闭环：${primaryRequest.title}`;
      blockReason =
        primaryRequest.responseSummary ??
        primaryRequest.requiredItems?.[0] ??
        primaryRequest.summary;
      nextStep = `先让 ${targetLabel} 补齐结果，再回到 ${ownerLabel} 继续下一步。`;
      userAction = "你现在可以催办、重发，或直接人工接管。";
    } else if (primaryRequest.status === "acknowledged") {
      headline = `${targetLabel} 正在处理`;
      currentWork = `${targetLabel} 已经接单，正在处理：${primaryRequest.title}`;
      detailHint = primaryRequest.responseSummary;
      nextStep = `等 ${targetLabel} 回复后，由 ${ownerLabel} 继续推进。`;
    } else if (primaryRequest.status === "pending") {
      headline = `正在等 ${targetLabel} 回复`;
      currentWork = `${ownerLabel} 已把任务交给 ${targetLabel}：${primaryRequest.title}`;
      detailHint =
        primaryRequest.requiredItems && primaryRequest.requiredItems.length > 0
          ? `待返回 ${primaryRequest.requiredItems.length} 项结果`
          : undefined;
      nextStep = `收到 ${targetLabel} 的回复后，会自动继续。`;
    } else if (primaryRequest.status === "answered") {
      headline = `${targetLabel} 已回复`;
      currentWork = `${targetLabel} 已经给出结果：${primaryRequest.title}`;
      detailHint = primaryRequest.responseSummary;
      nextStep = `现在要由 ${ownerLabel} 接住这条结果并继续下一步。`;
    }
  } else if (primaryHandoff && primaryHandoff.status !== "completed") {
    const targetLabel = collaboratorLabel ?? "相关同事";
    if (primaryHandoff.status === "blocked") {
      headline = `${targetLabel} 的交接卡住了`;
      currentWork = `${ownerLabel} 发出的交接没有顺利完成：${primaryHandoff.title}`;
      blockReason = primaryHandoff.missingItems?.[0] ?? primaryHandoff.summary;
      nextStep = `先补齐交接缺失项，再让 ${targetLabel} 继续处理。`;
    } else if (primaryHandoff.status === "acknowledged") {
      headline = `${targetLabel} 已接手`;
      currentWork = `${targetLabel} 已接手当前交接：${primaryHandoff.title}`;
      detailHint = primaryHandoff.summary;
      nextStep = `等待 ${targetLabel} 回交结果。`;
    } else {
      headline = `正在等 ${targetLabel} 接手`;
      currentWork = `${ownerLabel} 已把任务转交给 ${targetLabel}：${primaryHandoff.title}`;
      detailHint = primaryHandoff.summary;
      nextStep = `等 ${targetLabel} 确认接手后继续。`;
    }
  } else if (task) {
    currentWork = task.summary ?? `${ownerLabel} 正在推进当前任务。`;
    if (task.state === "waiting_peer" && collaboratorLabel) {
      headline = `正在等 ${collaboratorLabel}`;
      nextStep = `等 ${collaboratorLabel} 回复后，再回到 ${ownerLabel} 继续。`;
    } else if (task.state === "completed") {
      headline = `${ownerLabel} 这一步已完成`;
      nextStep = ceoSurface?.topActions[0]
        ? `${ceoSurface.topActions[0].actionLabel}：${ceoSurface.topActions[0].title}`
        : "当前节点已完成，等待下一步指令。";
    }
  }

  if (!blockReason && alerts.length > 0) {
    blockReason = alerts[0]?.summary;
  }
  if (!userAction && execution.state === "waiting_input") {
    userAction = "你现在需要补充材料、确认结果，或继续给出下一步指令。";
  }
  if (!detailHint && alerts.length > 0) {
    detailHint = alerts[0]?.recommendedAction ?? alerts[0]?.detail;
  }

  return {
    headline,
    ownerLabel,
    ownerRole,
    collaboratorLabel,
    currentWork,
    blockReason,
    nextStep,
    userAction,
    detailHint,
  };
}
