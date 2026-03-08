import type { Company, HandoffRecord, RequestRecord, TrackedTask } from "../company/types";
import type { RequirementExecutionOverview } from "./requirement-overview";
import type { SlaAlert } from "../sla/escalation-rules";
import { getActiveHandoffs, inferHandoffTopicKey } from "../handoffs/active-handoffs";
import { getActiveRequests } from "../requests/request-health";
import { requestTopicMatchesText } from "../requests/topic";

export type RequirementScope = {
  topicKey: string;
  title: string;
  tasks: TrackedTask[];
  requests: RequestRecord[];
  handoffs: HandoffRecord[];
  participantAgentIds: string[];
};

function matchesTopic(topicKey: string, values: Array<string | null | undefined>): boolean {
  const corpus = values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  if (!corpus) {
    return false;
  }
  return requestTopicMatchesText(topicKey, corpus);
}

function matchesTaskTopic(task: TrackedTask, topicKey: string): boolean {
  return matchesTopic(topicKey, [
    task.title,
    task.summary,
    task.blockedReason,
    ...task.steps.map((step) => step.text),
  ]);
}

function matchesRequestTopic(request: RequestRecord, topicKey: string): boolean {
  if (request.topicKey === topicKey) {
    return true;
  }
  return matchesTopic(topicKey, [request.title, request.summary, request.responseSummary]);
}

function matchesHandoffTopic(handoff: HandoffRecord, topicKey: string): boolean {
  if (inferHandoffTopicKey(handoff) === topicKey) {
    return true;
  }
  return matchesTopic(topicKey, [
    handoff.title,
    handoff.summary,
    ...(handoff.checklist ?? []),
    ...(handoff.missingItems ?? []),
    ...(handoff.artifactPaths ?? []),
  ]);
}

export function buildRequirementScope(
  company: Company,
  overview: RequirementExecutionOverview | null,
): RequirementScope | null {
  if (!overview) {
    return null;
  }

  const topicKey = overview.topicKey;
  const startedAt = overview.startedAt;
  const tasks = (company.tasks ?? []).filter(
    (task) => task.updatedAt >= startedAt && matchesTaskTopic(task, topicKey),
  );
  const requests = getActiveRequests(company.requests ?? []).filter((request) =>
    request.updatedAt >= startedAt && matchesRequestTopic(request, topicKey),
  );
  const handoffs = getActiveHandoffs(company.handoffs ?? []).filter((handoff) =>
    handoff.updatedAt >= startedAt && matchesHandoffTopic(handoff, topicKey),
  );

  const participantAgentIds = [
    ...overview.participants.map((participant) => participant.agentId),
    ...tasks.flatMap((task) => [
      task.agentId,
      task.ownerAgentId,
      ...(task.assigneeAgentIds ?? []),
    ]),
    ...requests.flatMap((request) => [request.fromAgentId, ...request.toAgentIds]),
    ...handoffs.flatMap((handoff) => [handoff.fromAgentId, ...handoff.toAgentIds]),
  ].filter((agentId, index, array): agentId is string => {
    return typeof agentId === "string" && array.indexOf(agentId) === index;
  });

  return {
    topicKey,
    title: overview.title,
    tasks,
    requests,
    handoffs,
    participantAgentIds,
  };
}

export function filterRequirementSlaAlerts(
  alerts: SlaAlert[],
  scope: RequirementScope | null,
): SlaAlert[] {
  if (!scope) {
    return alerts;
  }

  const taskIds = new Set(scope.tasks.map((task) => task.id));
  const handoffIds = new Set(scope.handoffs.map((handoff) => handoff.id));
  const sessionKeys = new Set([
    ...scope.tasks.map((task) => task.sessionKey),
    ...scope.handoffs.map((handoff) => handoff.sessionKey),
    ...scope.requests.map((request) => request.sessionKey),
  ]);
  const ownerAgentIds = new Set(scope.participantAgentIds);

  return alerts.filter((alert) => {
    if (alert.taskId && taskIds.has(alert.taskId)) {
      return true;
    }
    if (alert.handoffId && handoffIds.has(alert.handoffId)) {
      return true;
    }
    if (alert.sessionKey && sessionKeys.has(alert.sessionKey)) {
      return true;
    }
    if (alert.ownerAgentId && ownerAgentIds.has(alert.ownerAgentId)) {
      return true;
    }
    return false;
  });
}
