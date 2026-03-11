import type { Company, HandoffRecord, RequestRecord, TrackedTask } from "../../domain";
import { inferRequestTopicKey } from "./request-topic";
import { extractDeliverableHeading, isPlaceholderOrBridgeText } from "./report-classifier";

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

function normalizeTargetSet(targets: string[]): string {
  return [...new Set(targets)].sort().join(",");
}

function buildRequestThemeKey(request: Pick<RequestRecord, "topicKey" | "title" | "summary" | "responseSummary" | "responseDetails" | "handoffId" | "taskId" | "id">): string {
  const explicitTopic = request.topicKey ?? inferRequestTopicKey([
    request.title,
    request.summary,
    request.responseSummary,
    request.responseDetails,
  ]);
  if (explicitTopic) {
    return explicitTopic;
  }
  const heading = extractDeliverableHeading(
    [request.title, request.responseSummary, request.summary, request.responseDetails]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n"),
  );
  if (heading) {
    return `heading:${heading.toLowerCase()}`;
  }
  return request.handoffId ?? request.taskId ?? request.id;
}

function buildLogicalRequestKey(request: RequestRecord): string {
  return [
    request.sessionKey,
    request.fromAgentId ?? "unknown",
    normalizeTargetSet(request.toAgentIds),
    buildRequestThemeKey(request),
  ].join(":");
}

function requestStatusRank(status: RequestRecord["status"]): number {
  switch (status) {
    case "answered":
      return 4;
    case "blocked":
      return 3;
    case "acknowledged":
      return 2;
    case "pending":
      return 1;
    default:
      return 0;
  }
}

function requestSyncRank(syncSource: RequestRecord["syncSource"]): number {
  switch (syncSource) {
    case "event":
      return 3;
    case "normalized":
      return 2;
    case "history":
      return 1;
    default:
      return 0;
  }
}

function isInstructionLikeRequest(request: RequestRecord): boolean {
  const combined = [
    request.title,
    request.summary,
    request.responseSummary,
    request.responseDetails,
    ...(request.requiredItems ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();
  if (!combined) {
    return false;
  }

  return (
    /(^|\n)#\s*(?:CEO|CTO|COO|HR)\s*执行准则\b/u.test(combined) ||
    /(^|\n)#\s*Role:\s*(?:CEO|CTO|COO|HR)\b/i.test(combined) ||
    (/company-context\.json|当前 roster|委派硬规则|汇报给|最高负责人/u.test(combined) &&
      /执行准则|Role:/i.test(combined))
  );
}

function isNoiseRequest(request: RequestRecord): boolean {
  const texts = [
    request.title,
    request.summary,
    request.responseSummary,
    request.responseDetails,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return (
    isInstructionLikeRequest(request) ||
    (texts.length > 0 && texts.every((text) => isPlaceholderOrBridgeText(text)))
  );
}

function mergeRequests(existing: RequestRecord[], incoming: RequestRecord[]) {
  const byId = new Map<string, RequestRecord>();
  existing.filter((request) => !isNoiseRequest(request)).forEach((request) => {
    byId.set(request.id, request);
  });

  let requestsAdded = 0;
  let requestsUpdated = 0;
  incoming.filter((request) => !isNoiseRequest(request)).forEach((request) => {
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
  const byLogicalKey = new Map<string, RequestRecord[]>();
  requests.forEach((request) => {
    const key = buildLogicalRequestKey(request);
    const current = byLogicalKey.get(key);
    if (current) {
      current.push(request);
      return;
    }
    byLogicalKey.set(key, [request]);
  });

  const winnerByLogicalKey = new Map<string, RequestRecord>();
  byLogicalKey.forEach((group) => {
    const logicalKey = buildLogicalRequestKey(group[0]);
    const winner = [...group].sort((left, right) => {
      const byStatus = requestStatusRank(right.status) - requestStatusRank(left.status);
      if (byStatus !== 0) {
        return byStatus;
      }
      const bySync = requestSyncRank(right.syncSource) - requestSyncRank(left.syncSource);
      if (bySync !== 0) {
        return bySync;
      }
      return right.updatedAt - left.updatedAt;
    })[0];
    winnerByLogicalKey.set(logicalKey, winner);
  });

  let requestsSuperseded = 0;
  const nextRequests = requests.map((request) => {
    const winner = winnerByLogicalKey.get(buildLogicalRequestKey(request));
    if (!winner || winner.id === request.id) {
      return request;
    }
    if (request.status !== "superseded") {
      requestsSuperseded += 1;
    }
    return {
      ...request,
      status: "superseded" as const,
      updatedAt: Math.max(request.updatedAt, winner.updatedAt),
      responseSummary: winner.responseSummary ?? request.responseSummary,
      responseDetails: winner.responseDetails ?? request.responseDetails,
      responseMessageTs: winner.responseMessageTs ?? request.responseMessageTs,
    };
  });

  return { requests: nextRequests, requestsSuperseded };
}

function buildRequestTopic(request: Pick<RequestRecord, "topicKey" | "title" | "summary">): string | undefined {
  return request.topicKey ?? inferRequestTopicKey([request.title, request.summary]);
}

function requestMatchesHandoff(request: RequestRecord, handoff: HandoffRecord, handoffTopic: string | undefined) {
  if (request.handoffId === handoff.id) {
    return true;
  }
  const requestTopic = buildRequestTopic(request);
  if (request.sessionKey === handoff.sessionKey && requestTopic && requestTopic === handoffTopic) {
    return true;
  }
  if (request.sessionKey !== handoff.sessionKey) {
    return false;
  }
  if (!request.fromAgentId || !handoff.toAgentIds.includes(request.fromAgentId)) {
    return false;
  }
  if (!handoff.fromAgentId) {
    return true;
  }
  return request.toAgentIds.length === 0 || request.toAgentIds.includes(handoff.fromAgentId);
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
      .filter((request) => requestMatchesHandoff(request, handoff, handoffTopic))
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
