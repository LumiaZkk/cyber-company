import type { Company, HandoffRecord, TrackedTask } from "../../domain";
import { DISPATCH_BUSINESS_ACK_REMINDER_MINUTES } from "../delegation/dispatch-policy";
import { getActiveHandoffs } from "../delegation/active-handoffs";

export type SlaAlertLevel = "warning" | "critical";
export type SlaAlertKind =
  | "task_waiting_too_long"
  | "task_blocked"
  | "task_manual_takeover"
  | "handoff_overdue"
  | "handoff_blocked";

export type SlaAlert = {
  id: string;
  kind: SlaAlertKind;
  level: SlaAlertLevel;
  title: string;
  summary: string;
  recommendedAction: string;
  escalateToAgentId?: string;
  taskId?: string;
  handoffId?: string;
  sessionKey?: string;
  ownerAgentId?: string;
  ageMinutes: number;
};

const WAITING_THRESHOLD_MINUTES = 15;
const HANDOFF_THRESHOLD_MINUTES = DISPATCH_BUSINESS_ACK_REMINDER_MINUTES;
const BLOCKED_THRESHOLD_MINUTES = 5;

function ageMinutes(updatedAt: number, now: number): number {
  return Math.max(0, Math.round((now - updatedAt) / 60000));
}

function resolveEscalationTarget(company: Company): string | undefined {
  return (
    company.employees.find((employee) => employee.metaRole === "ceo")?.agentId ??
    company.employees[0]?.agentId
  );
}

function alertForTask(task: TrackedTask, company: Company, now: number): SlaAlert[] {
  const updatedAt = task.lastSyncedAt ?? task.updatedAt ?? task.createdAt;
  const age = ageMinutes(updatedAt, now);
  const escalateToAgentId = resolveEscalationTarget(company);

  if (task.state === "manual_takeover_required") {
    return [
      {
        id: `sla:task:${task.id}:takeover`,
        kind: "task_manual_takeover",
        level: "critical",
        title: `任务需要人工接管: ${task.title}`,
        summary: task.blockedReason ?? task.summary ?? "当前任务已要求人工介入。",
        recommendedAction: "直接打开关联会话，复制接管包并指派人工执行。",
        escalateToAgentId,
        taskId: task.id,
        sessionKey: task.takeoverSessionKey ?? task.sessionKey,
        ownerAgentId: task.ownerAgentId ?? task.agentId,
        ageMinutes: age,
      },
    ];
  }

  if (
    (task.state === "blocked_timeout" || task.state === "blocked_tool_failure") &&
    age >= BLOCKED_THRESHOLD_MINUTES
  ) {
    return [
      {
        id: `sla:task:${task.id}:blocked`,
        kind: "task_blocked",
        level: "critical",
        title: `任务阻塞超过 ${BLOCKED_THRESHOLD_MINUTES} 分钟: ${task.title}`,
        summary: task.blockedReason ?? task.summary ?? "当前任务持续阻塞。",
        recommendedAction: "优先排障；如果短时间内无法恢复，升级为人工接管或重新分派。",
        escalateToAgentId,
        taskId: task.id,
        sessionKey: task.sessionKey,
        ownerAgentId: task.ownerAgentId ?? task.agentId,
        ageMinutes: age,
      },
    ];
  }

  if (
    (task.state === "waiting_input" || task.state === "waiting_peer") &&
    age >= WAITING_THRESHOLD_MINUTES
  ) {
    return [
      {
        id: `sla:task:${task.id}:waiting`,
        kind: "task_waiting_too_long",
        level: "warning",
        title: `任务等待超过 ${WAITING_THRESHOLD_MINUTES} 分钟: ${task.title}`,
        summary: task.summary ?? "当前任务等待输入或同事回复时间过长。",
        recommendedAction: "提醒责任人更新进度；必要时升级给 CEO 重新调度。",
        escalateToAgentId,
        taskId: task.id,
        sessionKey: task.sessionKey,
        ownerAgentId: task.ownerAgentId ?? task.agentId,
        ageMinutes: age,
      },
    ];
  }

  return [];
}

function alertForHandoff(handoff: HandoffRecord, company: Company, now: number): SlaAlert[] {
  const updatedAt = handoff.updatedAt ?? handoff.createdAt;
  const age = ageMinutes(updatedAt, now);
  const escalateToAgentId = resolveEscalationTarget(company);

  if (handoff.status === "blocked" && age >= BLOCKED_THRESHOLD_MINUTES) {
    return [
      {
        id: `sla:handoff:${handoff.id}:blocked`,
        kind: "handoff_blocked",
        level: "critical",
        title: `交接阻塞: ${handoff.title}`,
        summary:
          handoff.missingItems && handoff.missingItems.length > 0
            ? `缺失项: ${handoff.missingItems.join(" / ")}`
            : handoff.summary,
        recommendedAction: "补齐缺失项，或由 CEO 改派后续责任人。",
        escalateToAgentId,
        handoffId: handoff.id,
        sessionKey: handoff.sessionKey,
        ownerAgentId: handoff.fromAgentId,
        ageMinutes: age,
      },
    ];
  }

  if ((handoff.status === "pending" || handoff.status === "acknowledged") && age >= HANDOFF_THRESHOLD_MINUTES) {
    return [
      {
        id: `sla:handoff:${handoff.id}:overdue`,
        kind: "handoff_overdue",
        level: "warning",
        title: `交接超过 ${HANDOFF_THRESHOLD_MINUTES} 分钟未闭环: ${handoff.title}`,
        summary: handoff.summary,
        recommendedAction: "提醒接收方确认交接并回填缺失项。",
        escalateToAgentId,
        handoffId: handoff.id,
        sessionKey: handoff.sessionKey,
        ownerAgentId: handoff.fromAgentId,
        ageMinutes: age,
      },
    ];
  }

  return [];
}

export function evaluateSlaAlerts(company: Company, now = Date.now()): SlaAlert[] {
  const tasks = company.tasks ?? [];
  const handoffs = getActiveHandoffs(company.handoffs ?? []);

  return [
    ...tasks.flatMap((task) => alertForTask(task, company, now)),
    ...handoffs.flatMap((handoff) => alertForHandoff(handoff, company, now)),
  ].sort((left, right) => {
    if (left.level !== right.level) {
      return left.level === "critical" ? -1 : 1;
    }
    return right.ageMinutes - left.ageMinutes;
  });
}
