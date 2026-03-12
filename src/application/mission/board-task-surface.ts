import { getActiveHandoffs } from "../delegation/active-handoffs";
import { summarizeRequestHealth } from "../delegation/request-health";
import { buildExecutionFocusSummary } from "../governance/focus-summary";
import { evaluateSlaAlerts } from "../governance/sla-rules";
import {
  buildStrategicBoardFocusSummary,
  buildStrategicWorkItemFocusSummary,
  summarizeTaskSteps,
  getTaskLane,
  getTaskSortWeight,
} from "./board-requirement-surface";
import { buildTaskObjectSnapshot } from "./task-object";
import { filterRequirementSlaAlerts, type RequirementScope } from "./requirement-scope";
import { resolveExecutionState, type ResolvedExecutionState } from "./execution-state";
import type { ManualTakeoverPack } from "../delegation/takeover-pack";
import type { SlaAlert } from "../governance/sla-rules";
import type { Company } from "../../domain/org/types";
import type { HandoffRecord, RequestRecord } from "../../domain/delegation/types";
import type { RequirementExecutionOverview } from "./requirement-overview";
import type { GatewaySessionRow } from "../gateway";
import type { TaskLane } from "../../domain/mission/task-lane";
import type { TaskStepSummary } from "../../domain/mission/task-step-summary";
import type { TrackedTask, WorkItemRecord } from "../../domain/mission/types";

export type BoardTaskItem = {
  task: TrackedTask;
  stepSummary: TaskStepSummary;
  execution: ResolvedExecutionState;
  lane: TaskLane;
  ownerLabel: string;
  takeoverPack: ManualTakeoverPack | null;
  focusSummary: ReturnType<typeof buildExecutionFocusSummary>;
};

export type BoardTaskSection = {
  key: Exclude<TaskLane, "done">;
  items: BoardTaskItem[];
};

export type BoardTaskSurface = {
  trackedTasks: TrackedTask[];
  taskSequence: BoardTaskItem[];
  activeTasks: TrackedTask[];
  archivedGroups: TrackedTask[];
  archivedTaskItems: BoardTaskItem[];
  totalSteps: number;
  doneSteps: number;
  wipSteps: number;
  globalPct: number;
  handoffRecords: HandoffRecord[];
  displayRequests: RequestRecord[];
  visibleTakeoverCount: number;
  visiblePendingHandoffs: HandoffRecord[];
  visibleSlaAlerts: SlaAlert[];
  visibleRequestHealth: ReturnType<typeof summarizeRequestHealth>;
  orderedTaskSections: BoardTaskSection[];
};

type BoardTaskSurfaceInput = {
  activeCompany: Company;
  companySessions: Array<GatewaySessionRow & { agentId: string }>;
  currentTime: number;
  fileTasks: TrackedTask[];
  sessionStates: Map<string, ResolvedExecutionState>;
  sessionTakeoverPacks: Map<string, ManualTakeoverPack>;
  requirementScope: RequirementScope | null;
  currentWorkItem: WorkItemRecord | null;
  activeWorkItem: WorkItemRecord | null;
  requirementOverview: RequirementExecutionOverview | null;
  strategicRequirementOverview: RequirementExecutionOverview | null;
  isStrategicRequirement: boolean;
  requirementSyntheticTask: TrackedTask | null;
};

function buildZeroRequestHealth(): ReturnType<typeof summarizeRequestHealth> {
  return {
    total: 0,
    active: 0,
    pending: 0,
    acknowledged: 0,
    blocked: 0,
    answered: 0,
    superseded: 0,
  };
}

export function buildBoardTaskSurface(input: BoardTaskSurfaceInput): BoardTaskSurface {
  const {
    activeCompany,
    companySessions,
    currentTime,
    fileTasks,
    sessionStates,
    sessionTakeoverPacks,
    requirementScope,
    currentWorkItem,
    activeWorkItem,
    requirementOverview,
    strategicRequirementOverview,
    isStrategicRequirement,
    requirementSyntheticTask,
  } = input;

  const getEmpName = (agentId: string) => {
    const employee = activeCompany.employees.find((item) => item.agentId === agentId);
    return employee ? employee.nickname : agentId;
  };

  const storeTasks = activeCompany.tasks ?? [];
  const storeTaskIds = new Set(storeTasks.map((task) => task.id));
  const mergedFileTasks = fileTasks.filter((task) => !storeTaskIds.has(task.id));
  const mergedTrackedTasks = [...storeTasks, ...mergedFileTasks]
    .map((task) => {
      const linkedSession = companySessions.find((session) => session.key === task.sessionKey);
      const fallbackDone =
        task.steps.length > 0 && task.steps.every((step) => step.status === "done")
          ? "completed"
          : task.steps.some((step) => step.status === "wip")
            ? "running"
            : "idle";
      const execution =
        sessionStates.get(task.sessionKey) ??
        resolveExecutionState({
          session: linkedSession,
          taskSteps: task.steps,
          fallbackState: fallbackDone,
          now: currentTime,
        });
      return buildTaskObjectSnapshot({
        task,
        company: activeCompany,
        execution,
        takeoverPack: sessionTakeoverPacks.get(task.sessionKey),
        now: currentTime,
      });
    })
    .sort((left, right) => {
      const weightDiff = getTaskSortWeight(left.state) - getTaskSortWeight(right.state);
      if (weightDiff !== 0) {
        return weightDiff;
      }

      const leftSummary = summarizeTaskSteps(left.steps);
      const rightSummary = summarizeTaskSteps(right.steps);
      if (leftSummary.pendingCount !== rightSummary.pendingCount) {
        return rightSummary.pendingCount - leftSummary.pendingCount;
      }

      return right.updatedAt - left.updatedAt;
    });

  const scopedTrackedTasks =
    requirementScope && requirementScope.tasks.length > 0
      ? mergedTrackedTasks.filter((task) =>
          requirementScope.tasks.some((scopedTask) => scopedTask.id === task.id),
        )
      : [];
  const shouldUseWorkItemPrimaryView = Boolean(currentWorkItem && requirementSyntheticTask);
  const primaryRequirementTasks = requirementSyntheticTask ? [requirementSyntheticTask] : [];
  const supplementalRequirementTasks =
    scopedTrackedTasks.length > 0
      ? scopedTrackedTasks
      : mergedTrackedTasks.filter((task) => task.source === "file");
  const trackedTasks = (
    shouldUseWorkItemPrimaryView
      ? [...primaryRequirementTasks, ...supplementalRequirementTasks]
      : requirementOverview && isStrategicRequirement && requirementSyntheticTask
        ? [...primaryRequirementTasks, ...supplementalRequirementTasks]
        : requirementOverview && scopedTrackedTasks.length === 0 && requirementSyntheticTask
          ? [...primaryRequirementTasks, ...supplementalRequirementTasks]
          : requirementOverview
            ? scopedTrackedTasks.length > 0
              ? scopedTrackedTasks
              : mergedTrackedTasks
            : mergedTrackedTasks
  ).filter(
    (task, index, items): task is TrackedTask =>
      Boolean(task) && items.findIndex((candidate) => candidate?.id === task?.id) === index,
  );

  const totalSteps = trackedTasks.reduce((total, task) => total + task.steps.length, 0);
  const doneSteps = trackedTasks.reduce(
    (total, task) => total + task.steps.filter((step) => step.status === "done").length,
    0,
  );
  const wipSteps = trackedTasks.reduce(
    (total, task) => total + task.steps.filter((step) => step.status === "wip").length,
    0,
  );
  const globalPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const activeTasks = trackedTasks.filter((task) => {
    const total = task.steps.length;
    const done = task.steps.filter((step) => step.status === "done").length;
    return total === 0 || done < total;
  });
  const archivedGroups = trackedTasks.filter((task) => {
    const total = task.steps.length;
    const done = task.steps.filter((step) => step.status === "done").length;
    return total > 0 && done === total;
  });

  const rawHandoffRecords = getActiveHandoffs(activeCompany.handoffs ?? []);
  const handoffRecords = currentWorkItem ? requirementScope?.handoffs ?? rawHandoffRecords : [];
  const pendingHandoffs = handoffRecords.filter((handoff) => handoff.status !== "completed");
  const rawSlaAlerts = currentWorkItem ? evaluateSlaAlerts(activeCompany, currentTime) : [];
  const slaAlerts = filterRequirementSlaAlerts(rawSlaAlerts, requirementScope);
  const displayRequests = currentWorkItem
    ? requirementScope?.requests ?? (activeCompany.requests ?? [])
    : [];
  const requestHealth = summarizeRequestHealth(displayRequests);
  const visibleTakeoverCount = isStrategicRequirement ? 0 : sessionTakeoverPacks.size;
  const visiblePendingHandoffs = isStrategicRequirement ? [] : pendingHandoffs;
  const visibleSlaAlerts = isStrategicRequirement ? [] : slaAlerts;
  const visibleRequestHealth = isStrategicRequirement ? buildZeroRequestHealth() : requestHealth;

  const buildBoardTaskItem = (task: TrackedTask): BoardTaskItem => {
    const stepSummary = summarizeTaskSteps(task.steps);
    const isStrategicSyntheticTask = Boolean(
      isStrategicRequirement &&
        requirementSyntheticTask &&
        task.id === requirementSyntheticTask.id,
    );
    const execution = isStrategicSyntheticTask
      ? resolveExecutionState({
          fallbackState:
            task.state ??
            (stepSummary.doneCount === stepSummary.total ? "completed" : "running"),
          taskSteps: task.steps,
        })
      : resolveExecutionState({
          fallbackState:
            task.state ??
            (stepSummary.doneCount === stepSummary.total
              ? "completed"
              : stepSummary.wipCount > 0
                ? "running"
                : "idle"),
          evidenceTexts: [task.blockedReason, task.summary],
          taskSteps: task.steps,
        });
    const relatedHandoffs = isStrategicSyntheticTask
      ? []
      : handoffRecords.filter(
          (handoff) => handoff.taskId === task.id || handoff.sessionKey === task.sessionKey,
        );
    const relatedRequests = isStrategicSyntheticTask
      ? []
      : displayRequests.filter(
          (request) =>
            request.taskId === task.id ||
            request.sessionKey === task.sessionKey ||
            request.handoffId === relatedHandoffs[0]?.id,
        );
    const relatedAlerts = isStrategicSyntheticTask
      ? []
      : slaAlerts.filter(
          (alert) => alert.taskId === task.id || alert.sessionKey === task.sessionKey,
        );
    const focusSummary =
      isStrategicSyntheticTask
        ? strategicRequirementOverview
          ? buildStrategicBoardFocusSummary(strategicRequirementOverview)
          : activeWorkItem
            ? buildStrategicWorkItemFocusSummary(activeWorkItem)
            : buildExecutionFocusSummary({
                company: activeCompany,
                targetAgentId: task.ownerAgentId ?? task.agentId,
                targetRoleLabel: "战略主线",
                execution,
                task,
                requests: [],
                handoffs: [],
                takeoverPack: null,
                alerts: [],
              })
        : buildExecutionFocusSummary({
            company: activeCompany,
            targetAgentId: task.ownerAgentId ?? task.agentId,
            targetRoleLabel: "任务",
            execution,
            task,
            requests: relatedRequests,
            handoffs: relatedHandoffs,
            takeoverPack: sessionTakeoverPacks.get(task.sessionKey) ?? null,
            alerts: relatedAlerts,
          });

    return {
      task,
      stepSummary,
      execution,
      lane: isStrategicSyntheticTask ? "active" : getTaskLane(task.state ?? execution.state),
      ownerLabel: getEmpName(task.ownerAgentId || task.agentId),
      takeoverPack: isStrategicSyntheticTask ? null : sessionTakeoverPacks.get(task.sessionKey) ?? null,
      focusSummary,
    };
  };

  const prioritizedActiveTasks = activeTasks.map(buildBoardTaskItem);
  const archivedTaskItems = archivedGroups.map(buildBoardTaskItem);

  const orderedTaskSections: BoardTaskSection[] = [
    {
      key: "critical",
      items: prioritizedActiveTasks.filter((item) => item.lane === "critical"),
    },
    {
      key: "needs_input",
      items: prioritizedActiveTasks.filter((item) => item.lane === "needs_input"),
    },
    {
      key: "handoff",
      items: prioritizedActiveTasks.filter((item) => item.lane === "handoff"),
    },
    {
      key: "active",
      items: prioritizedActiveTasks.filter((item) => item.lane === "active"),
    },
    {
      key: "queued",
      items: prioritizedActiveTasks.filter((item) => item.lane === "queued"),
    },
  ];

  return {
    trackedTasks,
    taskSequence: prioritizedActiveTasks,
    activeTasks,
    archivedGroups,
    archivedTaskItems,
    totalSteps,
    doneSteps,
    wipSteps,
    globalPct,
    handoffRecords,
    displayRequests,
    visibleTakeoverCount,
    visiblePendingHandoffs,
    visibleSlaAlerts,
    visibleRequestHealth,
    orderedTaskSections,
  };
}
