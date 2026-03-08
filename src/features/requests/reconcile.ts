import type { Company, HandoffRecord, RequestRecord, TrackedTask } from "../company/types";
import { inferRequestTopicKey } from "./topic";

export type CompanyRecoverySummary = {
  requestsAdded: number;
  requestsUpdated: number;
  requestsSuperseded: number;
  handoffsRecovered: number;
  tasksRecovered: number;
};

type ReconcileCompanyCommunicationResult = {
  companyPatch: Partial<Company>;
  summary: CompanyRecoverySummary;
};

function mergeRequests(existing: RequestRecord[], incoming: RequestRecord[]) {
  const byId = new Map<string, RequestRecord>();
  existing.forEach((request) => {
    byId.set(request.id, request);
  });

  let requestsAdded = 0;
  let requestsUpdated = 0;
  incoming.forEach((request) => {
    const current = byId.get(request.id);
    if (!current) {
      byId.set(request.id, request);
      requestsAdded += 1;
      return;
    }
    if (request.updatedAt > current.updatedAt) {
      byId.set(request.id, { ...current, ...request });
      requestsUpdated += 1;
    }
  });

  return {
    requests: [...byId.values()],
    requestsAdded,
    requestsUpdated,
  };
}

function supersedeRequests(requests: RequestRecord[]) {
  const latestAnsweredByTopic = new Map<string, RequestRecord>();
  requests.forEach((request) => {
    if (request.status !== "answered") {
      return;
    }
    const topicKey = request.topicKey ?? request.handoffId ?? request.taskId ?? request.id;
    const groupKey = `${request.sessionKey}:${topicKey}`;
    const current = latestAnsweredByTopic.get(groupKey);
    if (!current || request.updatedAt > current.updatedAt) {
      latestAnsweredByTopic.set(groupKey, request);
    }
  });

  let requestsSuperseded = 0;
  const nextRequests = requests.map((request) => {
    if (request.status === "answered" || request.status === "superseded") {
      return request;
    }
    const topicKey = request.topicKey ?? request.handoffId ?? request.taskId ?? request.id;
    const latestAnswered = latestAnsweredByTopic.get(`${request.sessionKey}:${topicKey}`);
    if (!latestAnswered || latestAnswered.updatedAt <= request.updatedAt) {
      return request;
    }
    requestsSuperseded += 1;
    return {
      ...request,
      status: "superseded" as const,
      updatedAt: latestAnswered.updatedAt,
      responseSummary: latestAnswered.responseSummary ?? request.responseSummary,
      responseMessageTs: latestAnswered.responseMessageTs ?? request.responseMessageTs,
    };
  });

  return { requests: nextRequests, requestsSuperseded };
}

function buildRequestTopic(request: Pick<RequestRecord, "topicKey" | "title" | "summary">): string | undefined {
  return request.topicKey ?? inferRequestTopicKey([request.title, request.summary]);
}

function reconcileHandoffs(handoffs: HandoffRecord[], requests: RequestRecord[]) {
  let handoffsRecovered = 0;
  const nextHandoffs = handoffs.map((handoff) => {
    const handoffTopic =
      inferRequestTopicKey([
        handoff.title,
        handoff.summary,
        ...(handoff.missingItems ?? []),
        ...(handoff.artifactPaths ?? []),
      ]) ?? undefined;
    const candidates = requests
      .filter((request) => {
        if (request.handoffId === handoff.id) {
          return true;
        }
        const requestTopic = buildRequestTopic(request);
        return request.sessionKey === handoff.sessionKey && requestTopic && requestTopic === handoffTopic;
      })
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const latest = candidates[0];
    if (!latest) {
      return handoff;
    }

    if (latest.status === "answered" && handoff.status !== "completed") {
      handoffsRecovered += 1;
      return {
        ...handoff,
        status: "completed" as const,
        updatedAt: latest.responseMessageTs ?? latest.updatedAt,
      };
    }

    if (latest.status === "acknowledged" && handoff.status === "pending") {
      handoffsRecovered += 1;
      return {
        ...handoff,
        status: "acknowledged" as const,
        updatedAt: latest.updatedAt,
      };
    }

    if (latest.status === "blocked" && handoff.status !== "blocked") {
      handoffsRecovered += 1;
      return {
        ...handoff,
        status: "blocked" as const,
        updatedAt: latest.updatedAt,
      };
    }

    return handoff;
  });

  return { handoffs: nextHandoffs, handoffsRecovered };
}

function reconcileTasks(tasks: TrackedTask[], requests: RequestRecord[], now: number) {
  let tasksRecovered = 0;
  const nextTasks = tasks.map((task) => {
    const linkedRequests = requests
      .filter((request) => request.taskId === task.id || request.sessionKey === task.sessionKey)
      .sort((left, right) => right.updatedAt - left.updatedAt);
    if (linkedRequests.length === 0) {
      return task;
    }

    const latestAnswered = linkedRequests.find((request) => request.status === "answered");
    const latestBlocked = linkedRequests.find((request) => request.status === "blocked");
    const taskIsBlocked =
      task.state === "blocked_timeout" ||
      task.state === "blocked_tool_failure" ||
      task.state === "manual_takeover_required" ||
      task.state === "waiting_peer" ||
      task.state === "waiting_input";

    if (
      latestAnswered &&
      (!latestBlocked || latestAnswered.updatedAt >= latestBlocked.updatedAt) &&
      (taskIsBlocked || Boolean(task.blockedReason))
    ) {
      tasksRecovered += 1;
      const allStepsDone = task.steps.length > 0 && task.steps.every((step) => step.status === "done");
      return {
        ...task,
        state: allStepsDone ? ("completed" as const) : ("running" as const),
        summary:
          latestAnswered.responseSummary ??
          "系统已收到新的响应，当前链路可以继续向下一阶段推进。",
        blockedReason: undefined,
        takeoverSessionKey: undefined,
        updatedAt: Math.max(task.updatedAt, latestAnswered.responseMessageTs ?? latestAnswered.updatedAt),
        lastSyncedAt: now,
      };
    }

    if (
      latestBlocked &&
      (!latestAnswered || latestBlocked.updatedAt > latestAnswered.updatedAt) &&
      task.state !== "manual_takeover_required"
    ) {
      tasksRecovered += 1;
      return {
        ...task,
        state:
          latestBlocked.resolution === "manual_takeover"
            ? ("manual_takeover_required" as const)
            : ("blocked_timeout" as const),
        summary: latestBlocked.responseSummary ?? task.summary,
        blockedReason: latestBlocked.responseSummary ?? task.blockedReason,
        takeoverSessionKey:
          latestBlocked.resolution === "manual_takeover" ? task.sessionKey : task.takeoverSessionKey,
        updatedAt: Math.max(task.updatedAt, latestBlocked.updatedAt),
        lastSyncedAt: now,
      };
    }

    return task;
  });

  return { tasks: nextTasks, tasksRecovered };
}

export function reconcileCompanyCommunication(
  company: Company,
  discoveredRequests: RequestRecord[],
  now = Date.now(),
): ReconcileCompanyCommunicationResult {
  const existingRequests = company.requests ?? [];
  const mergeResult = mergeRequests(existingRequests, discoveredRequests);
  const supersededResult = supersedeRequests(mergeResult.requests);
  const handoffResult = reconcileHandoffs(company.handoffs ?? [], supersededResult.requests);
  const taskResult = reconcileTasks(company.tasks ?? [], supersededResult.requests, now);

  return {
    companyPatch: {
      requests: supersededResult.requests,
      handoffs: handoffResult.handoffs,
      tasks: taskResult.tasks,
    },
    summary: {
      requestsAdded: mergeResult.requestsAdded,
      requestsUpdated: mergeResult.requestsUpdated,
      requestsSuperseded: supersededResult.requestsSuperseded,
      handoffsRecovered: handoffResult.handoffsRecovered,
      tasksRecovered: taskResult.tasksRecovered,
    },
  };
}
