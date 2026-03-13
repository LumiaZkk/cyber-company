import { resolveStepAssigneeAgentId } from "../../application/assignment/chat-participants";
import { buildOrgAdvisorSnapshot } from "../../application/assignment/org-fit";
import {
  buildRequirementRoomSessions,
  searchRequirementRoomMentionCandidates,
} from "../../application/delegation/room-routing";
import { buildManualTakeoverPack } from "../../application/delegation/takeover-pack";
import { buildHandoffRecords } from "../../application/delegation/handoff-object";
import { buildRequestRecords } from "../../application/delegation/request-object";
import { summarizeRequestHealth } from "../../application/delegation/request-health";
import type { ChatMessage, GatewaySessionArchiveRow, GatewaySessionRow } from "../../application/gateway";
import { buildHistoryRoundItems } from "../../application/mission/history/round-history";
import {
  matchesProductRoundToActor,
  matchesProductRoundToRoom,
} from "../../application/mission/history/round-restore";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import { summarizeStepLabel } from "../../application/mission/conversation-work-item-view";
import { resolveExecutionState } from "../../application/mission/execution-state";
import { buildTaskObjectSnapshot } from "../../application/mission/task-object";
import { extractTaskTracker } from "../../application/mission/task-tracker";
import type { AgentRuntimeRecord } from "../agent-runtime";
import { buildCeoControlSurface } from "../../application/governance/ceo-control-surface";
import { evaluateSlaAlerts } from "../../application/governance/sla-rules";
import type {
  HandoffRecord,
  RequestRecord,
  RequirementRoomRecord,
  RoomConversationBindingRecord,
} from "../../domain/delegation/types";
import type { Company } from "../../domain/org/types";
import type {
  ConversationStateRecord,
  RoundRecord,
  TaskStep,
  TrackedTask,
} from "../../domain/mission/types";
import { resolveSessionPresentation } from "../../lib/chat-routes";

function extractTextFromMessage(message?: ChatMessage | null): string {
  if (!message) {
    return "";
  }
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((block) => {
        if (typeof block === "string") {
          return block;
        }
        if (block && typeof block === "object" && !Array.isArray(block)) {
          const record = block as Record<string, unknown>;
          if (record.type === "text" && typeof record.text === "string") {
            return record.text;
          }
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

function uniqueTaskList(tasks: TrackedTask[]): TrackedTask[] {
  const byId = new Map<string, TrackedTask>();
  tasks.forEach((task) => {
    byId.set(task.id, task);
  });
  return [...byId.values()];
}

function uniqueHandoffList(handoffs: HandoffRecord[]): HandoffRecord[] {
  const byId = new Map<string, HandoffRecord>();
  handoffs.forEach((handoff) => {
    byId.set(handoff.id, handoff);
  });
  return [...byId.values()];
}

function uniqueRequestList(requests: RequestRecord[]): RequestRecord[] {
  const byId = new Map<string, RequestRecord>();
  requests.forEach((request) => {
    const current = byId.get(request.id);
    if (!current || request.updatedAt >= current.updatedAt) {
      byId.set(request.id, request);
    }
  });
  return [...byId.values()];
}

function deriveConversationTopicKey(input: {
  activeConversationState: ConversationStateRecord | null;
  activeRequirementRoom: RequirementRoomRecord | null;
  groupWorkItemId: string | null;
}): string | null {
  if (input.activeRequirementRoom?.topicKey?.trim()) {
    return input.activeRequirementRoom.topicKey.trim();
  }
  if (input.activeConversationState?.draftRequirement?.topicKey?.trim()) {
    return input.activeConversationState.draftRequirement.topicKey.trim();
  }
  const currentWorkKey = input.activeConversationState?.currentWorkKey?.trim() ?? "";
  if (currentWorkKey.startsWith("topic:")) {
    return currentWorkKey.slice("topic:".length).trim() || null;
  }
  return input.groupWorkItemId?.trim() ?? null;
}

type ChatFallbackAlert = {
  detail: string;
  id: string;
  summary: string;
  title: string;
};

export type BuildChatSessionContextInput = {
  activeCompany: Company | null;
  activeConversationState: ConversationStateRecord | null;
  activeAgentRuntime?: AgentRuntimeRecord[] | null;
  activeRequirementRoom: RequirementRoomRecord | null;
  activeRoomBindings: RoomConversationBindingRecord[];
  activeRoomRecords: RequirementRoomRecord[];
  activeRoundRecords: RoundRecord[];
  archiveHistoryNotice: string | null;
  archiveId: string | null;
  companySessionSnapshots: RequirementSessionSnapshot[];
  connected: boolean;
  currentTime: number;
  effectiveGroupSessionKey: string | null;
  groupMembers: string[];
  groupTitle: string;
  groupWorkItemId: string | null;
  historyAgentId: string | null;
  isArchiveView: boolean;
  isGenerating: boolean;
  isGroup: boolean;
  loading: boolean;
  messages: ChatMessage[];
  recentAgentSessions: GatewaySessionRow[];
  recentArchivedRounds: GatewaySessionArchiveRow[];
  routeRoomId: string | null;
  sessionKey: string | null;
  streamText: string | null;
  targetAgentId: string | null;
};

export function buildChatSessionContext(input: BuildChatSessionContextInput) {
  const activeAgentRuntime = input.activeAgentRuntime ?? [];
  const targetAgentRuntime =
    (input.targetAgentId
      ? activeAgentRuntime.find((runtime) => runtime.agentId === input.targetAgentId) ?? null
      : null);
  const requirementRoomTargetAgentIds = [
    ...new Set(
      (
        input.activeRequirementRoom?.memberIds?.length
          ? input.activeRequirementRoom.memberIds
          : input.groupMembers
      ).filter(Boolean),
    ),
  ];

  const productArchivedRounds = (() => {
    if (input.isGroup) {
      return input.activeRoundRecords
        .filter((round) =>
          matchesProductRoundToRoom({
            round,
            roomId: input.activeRequirementRoom?.id ?? input.routeRoomId,
            workItemId: input.groupWorkItemId,
          }),
        )
        .sort((left, right) => right.archivedAt - left.archivedAt);
    }
    if (!input.historyAgentId) {
      return [];
    }
    return input.activeRoundRecords
      .filter((round) => matchesProductRoundToActor(round, input.historyAgentId))
      .sort((left, right) => right.archivedAt - left.archivedAt);
  })();

  const activeArchivedRound = input.archiveId
    ? productArchivedRounds.find((round) => round.id === input.archiveId) ?? null
    : null;

  const historyRoundItems = buildHistoryRoundItems({
    productRounds: productArchivedRounds,
    providerRounds: input.isGroup ? [] : input.recentArchivedRounds,
  }).slice(0, 16);

  const requirementRoomSessions = input.isGroup
    ? buildRequirementRoomSessions({
        company: input.activeCompany,
        room: input.activeRequirementRoom,
        bindings: input.activeRequirementRoom
          ? input.activeRoomBindings.filter((binding) => binding.roomId === input.activeRequirementRoom!.id)
          : [],
        targetSessionKey: input.effectiveGroupSessionKey,
        memberIds: requirementRoomTargetAgentIds,
      })
    : [];

  const requirementRoomSessionKeys = new Set(
    requirementRoomSessions.map((session) => session.sessionKey),
  );

  const requirementRoomSnapshotAgentIds = [
    ...new Set(
      [
        ...requirementRoomTargetAgentIds,
        input.activeRequirementRoom?.ownerActorId ?? input.activeRequirementRoom?.ownerAgentId ?? null,
        input.activeRequirementRoom?.batonActorId ?? null,
        input.targetAgentId ?? null,
      ].filter((value): value is string => Boolean(value && value.trim())),
    ),
  ].sort();

  const requirementRoomSnapshots =
    input.isGroup && requirementRoomSnapshotAgentIds.length > 0
      ? input.companySessionSnapshots
          .filter((snapshot) => requirementRoomSnapshotAgentIds.includes(snapshot.agentId))
          .sort((left, right) => left.updatedAt - right.updatedAt)
      : [];

  const requirementRoomMentionCandidates = searchRequirementRoomMentionCandidates({
    company: input.activeCompany,
    memberIds: requirementRoomTargetAgentIds,
    query: "",
  });

  const targetEmployee =
    input.activeCompany?.employees.find((employee) => employee.agentId === input.targetAgentId) ?? null;

  const historySessionPresentations = new Map(
    input.recentAgentSessions.map((session) => [
      session.key,
      resolveSessionPresentation({
        session,
        companyId: input.activeCompany?.id,
        rooms: input.activeRoomRecords,
        bindings: input.activeRoomBindings,
        employees: input.activeCompany?.employees ?? [],
      }),
    ]),
  );

  const isCeoSession = targetEmployee?.metaRole === "ceo";
  const isFreshConversation = Boolean(
    isCeoSession &&
      !input.isGroup &&
      !input.isArchiveView &&
      input.sessionKey &&
      !input.loading &&
      input.messages.length === 0 &&
      !input.isGenerating &&
      !input.streamText,
  );
  const isRequirementBootstrapPending = Boolean(
    isCeoSession &&
      !input.isGroup &&
      !input.isArchiveView &&
      input.activeCompany &&
      input.connected &&
      input.messages.length === 0 &&
      !isFreshConversation &&
      !input.activeConversationState?.currentWorkKey,
  );

  const latestTracker =
    [...input.messages]
      .reverse()
      .map((message) => {
        const text = extractTextFromMessage(message);
        return text ? extractTaskTracker(text) : null;
      })
      .find((tracker): tracker is ReturnType<typeof extractTaskTracker> extends infer T ? Exclude<T, null> : never =>
        Array.isArray(tracker) && tracker.length > 0,
      ) ?? null;

  const latestTaskSteps: TaskStep[] | undefined = latestTracker?.map((item) => ({
    text: item.text,
    status: item.status,
  }));

  const latestMessageTimestamp = input.messages.reduce((latest, message) => {
    const timestamp = typeof message.timestamp === "number" ? message.timestamp : 0;
    return Math.max(latest, timestamp);
  }, 0);
  const previewTimestamp = latestMessageTimestamp || 1;

  const sessionExecution = resolveExecutionState({
    agentRuntime: targetAgentRuntime,
    evidenceTexts: [
      ...input.messages
        .slice(-8)
        .map((message) => extractTextFromMessage(message))
        .filter((text): text is string => Boolean(text)),
      input.streamText,
    ],
    taskSteps: latestTaskSteps,
    isGenerating: input.isGenerating,
    fallbackState: input.sessionKey ? "idle" : "unknown",
  });

  const takeoverPack =
    input.sessionKey && sessionExecution.state === "manual_takeover_required"
      ? buildManualTakeoverPack({
          messages: input.messages,
          sessionKey: input.sessionKey,
          ownerLabel: input.isGroup
            ? `需求团队: ${input.groupTitle}`
            : targetEmployee?.nickname || input.targetAgentId || "未知成员",
          fallbackTitle: input.isGroup
            ? `需求团队: ${input.groupTitle}`
            : targetEmployee?.nickname || "人工接管任务",
        })
      : null;

  const structuredTaskPreview =
    latestTaskSteps && input.sessionKey && input.activeCompany
      ? buildTaskObjectSnapshot({
          task: {
            id: input.sessionKey.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40),
            title: input.isGroup
              ? `需求团队: ${input.groupTitle}`
              : targetEmployee?.nickname || "任务摘要",
            sessionKey: input.sessionKey,
            agentId: input.targetAgentId || input.sessionKey,
            steps: latestTaskSteps,
            createdAt: previewTimestamp,
            updatedAt: previewTimestamp,
          },
          company: input.activeCompany,
          execution: sessionExecution,
          takeoverPack,
          now: previewTimestamp,
        })
      : null;

  const nextOpenTaskStep = structuredTaskPreview?.steps.find((step) => step.status !== "done") ?? null;
  const nextOpenTaskStepLabel = summarizeStepLabel(nextOpenTaskStep ?? undefined);
  const nextOpenTaskStepAgentId =
    input.activeCompany && nextOpenTaskStep
      ? resolveStepAssigneeAgentId(nextOpenTaskStep, input.activeCompany.employees)
      : null;

  const localHandoffPreview =
    input.activeCompany && input.sessionKey
      ? buildHandoffRecords({
          sessionKey: input.sessionKey,
          messages: input.messages.slice(-12),
          company: input.activeCompany,
          currentAgentId: input.targetAgentId,
          relatedTask: structuredTaskPreview ?? null,
        })
      : [];

  const localRequestPreview =
    input.sessionKey && localHandoffPreview.length > 0
      ? buildRequestRecords({
          sessionKey: input.sessionKey,
          handoffs: localHandoffPreview,
          messages: input.messages.slice(-16),
          relatedTask: structuredTaskPreview ?? null,
        })
      : [];

  const conversationTopicKey = deriveConversationTopicKey({
    activeConversationState: input.activeConversationState,
    activeRequirementRoom: input.activeRequirementRoom,
    groupWorkItemId: input.groupWorkItemId,
  });
  const conversationWorkItemId =
    input.activeConversationState?.currentWorkItemId ??
    input.activeRequirementRoom?.workItemId ??
    input.groupWorkItemId ??
    null;
  const companyHandoffPreview = (input.activeCompany?.handoffs ?? []).filter((handoff) => {
    const matchesAgent =
      handoff.sessionKey === input.sessionKey ||
      handoff.fromAgentId === input.targetAgentId ||
      handoff.toAgentIds.includes(input.targetAgentId ?? "");
    if (!matchesAgent) {
      return false;
    }
    if (conversationWorkItemId && handoff.taskId === conversationWorkItemId) {
      return true;
    }
    if (conversationTopicKey) {
      const haystack = `${handoff.title}\n${handoff.summary}\n${(handoff.checklist ?? []).join("\n")}\n${(handoff.missingItems ?? []).join("\n")}`;
      return haystack.includes(conversationTopicKey);
    }
    return true;
  });
  const companyRequestPreview = (input.activeCompany?.requests ?? []).filter((request) => {
    const matchesAgent =
      request.sessionKey === input.sessionKey ||
      request.fromAgentId === input.targetAgentId ||
      request.toAgentIds.includes(input.targetAgentId ?? "");
    if (!matchesAgent) {
      return false;
    }
    if (conversationWorkItemId && request.taskId === conversationWorkItemId) {
      return true;
    }
    if (conversationTopicKey && request.topicKey === conversationTopicKey) {
      return true;
    }
    return !conversationWorkItemId && !conversationTopicKey;
  });
  const handoffPreview = uniqueHandoffList([
    ...companyHandoffPreview,
    ...localHandoffPreview,
  ]).sort((left, right) => right.updatedAt - left.updatedAt);
  const requestPreview = uniqueRequestList([
    ...companyRequestPreview,
    ...localRequestPreview,
  ]).sort((left, right) => right.updatedAt - left.updatedAt);

  const requestHealth = summarizeRequestHealth(requestPreview);
  const ceoSurface =
    input.activeCompany && targetEmployee?.metaRole === "ceo"
      ? buildCeoControlSurface({ company: input.activeCompany })
      : null;
  const orgAdvisor =
    input.activeCompany && targetEmployee?.metaRole === "ceo"
      ? buildOrgAdvisorSnapshot(input.activeCompany)
      : null;

  const relatedSlaAlerts =
    input.activeCompany && input.sessionKey
      ? evaluateSlaAlerts({
          ...input.activeCompany,
          tasks: uniqueTaskList([
            ...(input.activeCompany.tasks ?? []),
            ...(structuredTaskPreview ? [structuredTaskPreview] : []),
          ]),
          handoffs: uniqueHandoffList([...(input.activeCompany.handoffs ?? []), ...handoffPreview]),
        }).filter((alert) => alert.sessionKey === input.sessionKey)
      : [];

  const localSlaFallbackAlerts: ChatFallbackAlert[] =
    input.sessionKey && relatedSlaAlerts.length === 0
      ? [
          ...(sessionExecution.state === "manual_takeover_required"
            ? [
                {
                  id: `${input.sessionKey}:local-takeover`,
                  title: "当前会话已进入人工接管 SLA",
                  summary: sessionExecution.summary,
                  detail: "建议立刻复制接管包并由人工继续执行。",
                },
              ]
            : []),
          ...handoffPreview
            .filter((handoff) => (handoff.missingItems?.length ?? 0) > 0)
            .slice(0, 2)
            .map((handoff) => ({
              id: `${handoff.id}:local-handoff`,
              title: `交接缺失项: ${handoff.title}`,
              summary: handoff.summary,
              detail: `缺失 ${handoff.missingItems?.length ?? 0} 项，建议优先补齐。`,
            })),
        ]
      : [];

  const summaryAlertCount = relatedSlaAlerts.length + localSlaFallbackAlerts.length;

  return {
    activeArchivedRound,
    ceoSurface,
    handoffPreview,
    historyRoundItems,
    historySessionPresentations,
    isCeoSession,
    isFreshConversation,
    isRequirementBootstrapPending,
    latestMessageTimestamp,
    latestTaskSteps,
    localSlaFallbackAlerts,
    nextOpenTaskStepAgentId,
    nextOpenTaskStepLabel,
    orgAdvisor,
    previewTimestamp,
    productArchivedRounds,
    relatedSlaAlerts,
    requestHealth,
    requestPreview,
    requirementRoomMentionCandidates,
    requirementRoomSessionKeys,
    requirementRoomSessions,
    requirementRoomSnapshotAgentIds,
    requirementRoomSnapshots,
    requirementRoomTargetAgentIds,
    sessionExecution,
    structuredTaskPreview,
    summaryAlertCount,
    takeoverPack,
    targetEmployee,
  };
}
