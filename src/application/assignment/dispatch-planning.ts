import type { Company, DispatchRecord } from "../../domain";
import { resolveDefaultDepartmentDispatchTarget } from "../org/department-autonomy";

type AutoDispatchStep = {
  id: string;
  title: string;
  assigneeAgentId?: string | null;
  assigneeLabel: string;
  detail?: string | null;
};

export type AutoDispatchPlan = {
  dispatchId: string;
  targetAgentId: string;
  targetLabel: string;
  title: string;
  summary: string;
  message: string;
  sourceStepId: string;
};

function resolveEmployeeLabel(company: Company, agentId: string): string {
  return company.employees.find((employee) => employee.agentId === agentId)?.nickname ?? agentId;
}

function hasExistingAutoDispatch(
  dispatches: DispatchRecord[],
  dispatchId: string,
): boolean {
  return dispatches.some((dispatch) => dispatch.id === dispatchId && dispatch.status !== "superseded");
}

export function shouldDelegateToNextBaton(stepTitle: string | null | undefined): boolean {
  const normalized = stepTitle?.trim() ?? "";
  if (!normalized) {
    return false;
  }
  return /通知|派发|转给|交给|下发/u.test(normalized);
}

export function buildAutoDispatchPlan(input: {
  company: Company | null | undefined;
  dispatches: DispatchRecord[];
  workItemId: string | null | undefined;
  currentActorId: string | null | undefined;
  workTitle: string;
  ownerLabel: string;
  summary: string;
  actionHint?: string | null;
  currentStep: AutoDispatchStep | null;
  nextBatonAgentId?: string | null;
  nextBatonLabel?: string | null;
  delegateToNextBaton?: boolean;
}): AutoDispatchPlan | null {
  const {
    company,
    currentActorId,
    currentStep,
    dispatches,
    workItemId,
    nextBatonAgentId,
    nextBatonLabel,
  } = input;
  if (!company || !workItemId || !currentActorId || !currentStep) {
    return null;
  }

  const preferredTargetAgentId =
    currentStep.assigneeAgentId && currentStep.assigneeAgentId !== currentActorId
      ? currentStep.assigneeAgentId
      : input.delegateToNextBaton && nextBatonAgentId && nextBatonAgentId !== currentActorId
        ? nextBatonAgentId
        : null;
  if (!preferredTargetAgentId) {
    return null;
  }

  const routedTarget =
    resolveDefaultDepartmentDispatchTarget({
      company,
      fromActorId: currentActorId,
      preferredTargetAgentId,
      explicitOverride: false,
    }) ?? {
      agentId: preferredTargetAgentId,
      label:
        preferredTargetAgentId === currentStep.assigneeAgentId
          ? currentStep.assigneeLabel
          : nextBatonLabel?.trim() || resolveEmployeeLabel(company, preferredTargetAgentId),
    };
  const targetLabel = routedTarget.label;
  const dispatchId = `dispatch:auto:${workItemId}:${currentStep.id}:${routedTarget.agentId}`;
  if (hasExistingAutoDispatch(dispatches, dispatchId)) {
    return null;
  }

  const summaryParts = [
    `当前需求：${input.workTitle}`,
    `负责人：${input.ownerLabel}`,
    `你当前需要接住的步骤：${currentStep.title}`,
    input.summary ? `当前判断：${input.summary}` : null,
    currentStep.detail ? `补充要求：${currentStep.detail}` : null,
    input.actionHint ? `下一步要求：${input.actionHint}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    dispatchId,
    targetAgentId: routedTarget.agentId,
    targetLabel,
    title: `自动派单 · ${targetLabel}`,
    summary: currentStep.title,
    sourceStepId: currentStep.id,
    message: [
      `现在主线卡在你这里。当前需求：${input.workTitle}`,
      `当前负责人：${input.ownerLabel}`,
      `你负责的步骤：${currentStep.title}`,
      ...(currentStep.detail ? [`补充要求：${currentStep.detail}`] : []),
      `当前判断：${summaryParts.slice(2).join("；")}`,
      "请直接开始，不要只汇报状态。请只回复：1. 你已经启动/完成了什么 2. 当前产出或结论 3. 如果仍阻塞，需要谁补什么。",
    ].join("\n"),
  };
}
