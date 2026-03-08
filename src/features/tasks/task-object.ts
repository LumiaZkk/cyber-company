import type { Company, EmployeeRef, TrackedTask, TaskExecutionState, TaskStep } from "../company/types";
import type { ResolvedExecutionState } from "../execution/state";
import type { ManualTakeoverPack } from "../execution/takeover-pack";

type BuildTaskObjectInput = {
  task: TrackedTask;
  company: Company;
  execution: ResolvedExecutionState;
  takeoverPack?: ManualTakeoverPack | null;
  now?: number;
};

function normalizeAssigneeToken(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

function resolveEmployeeByToken(employees: EmployeeRef[], token: string): EmployeeRef | null {
  const normalizedToken = normalizeAssigneeToken(token);
  if (!normalizedToken) {
    return null;
  }

  return (
    employees.find((employee) => {
      const nickname = employee.nickname.trim().toLowerCase();
      const role = employee.role.trim().toLowerCase();
      const agentId = employee.agentId.trim().toLowerCase();
      return (
        agentId === normalizedToken ||
        nickname === normalizedToken ||
        role === normalizedToken ||
        nickname.includes(normalizedToken) ||
        normalizedToken.includes(nickname)
      );
    }) ?? null
  );
}

function collectAssigneeAgentIds(steps: TaskStep[], employees: EmployeeRef[]): string[] {
  const ids = new Set<string>();

  for (const step of steps) {
    const tokens = [
      step.assignee,
      ...(step.text.match(/@([a-zA-Z0-9_-]+)/g) ?? []),
    ].filter((token): token is string => Boolean(token));

    for (const token of tokens) {
      const employee = resolveEmployeeByToken(employees, token);
      if (employee) {
        ids.add(employee.agentId);
      }
    }
  }

  return [...ids];
}

export function buildTaskObjectSnapshot(input: BuildTaskObjectInput): TrackedTask {
  const { task, company, execution, takeoverPack } = input;
  const assigneeAgentIds = collectAssigneeAgentIds(task.steps, company.employees);
  const ownerAgentId = task.ownerAgentId ?? task.agentId;

  return {
    ...task,
    ownerAgentId,
    assigneeAgentIds,
    state: execution.state as TaskExecutionState,
    summary:
      takeoverPack?.recommendedNextAction ??
      execution.summary ??
      task.summary ??
      "当前任务暂无额外摘要。",
    blockedReason: execution.actionable ? execution.summary : undefined,
    takeoverSessionKey:
      takeoverPack?.sourceSessionKey ??
      (execution.state === "manual_takeover_required" ? task.sessionKey : undefined),
    lastSyncedAt: input.now ?? Date.now(),
  };
}
