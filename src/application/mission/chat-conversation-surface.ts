import type { ChatMessage } from "../gateway";
import { parseDraftRequirementSignals } from "./draft-requirement";
import { normalizeTruthText } from "./message-truth";
import { buildChatRequirementState, type ChatRequirementState } from "./chat-requirement-state";
import { buildChatTaskPlanOverview, buildChatRequirementTeam } from "./chat-requirement-panel";
import { buildChatWorkItemState, type ChatWorkItemState } from "./chat-work-item-state";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import type { RequirementTeamView } from "../assignment/requirement-team";
import type { HandoffRecord, RequirementRoomRecord, RequestRecord } from "../../domain/delegation/types";
import type { Company } from "../../domain/org/types";
import type {
  ConversationStateRecord,
  RequirementAggregateRecord,
  TrackedTask,
  WorkItemRecord,
} from "../../domain/mission/types";

export type ChatDirectTurnSummary =
  | {
      state: "answered";
      questionText: string;
      questionPreview: string;
      replyText: string;
      replyPreview: string;
      replyIndex: number;
      repliedAt: number | null;
    }
  | {
      state: "waiting";
      questionText: string;
      questionPreview: string;
      replyText: null;
      replyPreview: null;
      replyIndex: null;
      repliedAt: null;
    };

export type RequirementProgressGroups = {
  working: ChatRequirementState["requirementOverview"] extends infer T
    ? T extends { participants: infer P }
      ? P extends Array<infer U>
        ? U[]
        : never
      : never
    : never;
  waiting: ChatRequirementState["requirementOverview"] extends infer T
    ? T extends { participants: infer P }
      ? P extends Array<infer U>
        ? U[]
        : never
      : never
    : never;
  completed: ChatRequirementState["requirementOverview"] extends infer T
    ? T extends { participants: infer P }
      ? P extends Array<infer U>
        ? U[]
        : never
      : never
    : never;
};

export type ChatConversationSurface = ChatRequirementState &
  ChatWorkItemState & {
    requirementProgressGroups: RequirementProgressGroups | null;
    latestDirectTurnSummary: ChatDirectTurnSummary | null;
    latestAssistantRequestsNewTask: boolean;
    ceoReplyExplicitlyRequestsNewTask: boolean;
    hasDirectConversationWorkSignal: boolean;
    preferredConversationWorkKey: string | null;
    taskPlanOverview: ReturnType<typeof buildChatTaskPlanOverview>;
    requirementTeam: RequirementTeamView | null;
  };

type BuildChatConversationSurfaceInput = {
  activeCompany: Company | null;
  activeConversationState: ConversationStateRecord | null;
  activeRequirementRoom: RequirementRoomRecord | null;
  activeRoomRecords: RequirementRoomRecord[];
  activeWorkItems: WorkItemRecord[];
  activeRequirementAggregates: RequirementAggregateRecord[];
  primaryRequirementId: string | null;
  companySessionSnapshots: RequirementSessionSnapshot[];
  requirementRoomSnapshots: RequirementSessionSnapshot[];
  requirementRoomSnapshotAgentIds: string[];
  requestPreview: RequestRecord[];
  handoffPreview: HandoffRecord[];
  structuredTaskPreview: TrackedTask | null;
  messages: ChatMessage[];
  currentTime: number;
  historyAgentId: string | null;
  sessionKey: string | null;
  productRoomId: string | null;
  groupTopicKey: string | null;
  groupWorkItemId: string | null;
  isGroup: boolean;
  isCeoSession: boolean;
  isFreshConversation: boolean;
  isRequirementBootstrapPending: boolean;
  isSummaryOpen: boolean;
  summaryPanelView: "owner" | "team" | "debug";
};

function extractTextFromChatMessage(message: ChatMessage | null | undefined): string {
  if (!message) {
    return "";
  }
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return message.content.trim();
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }
      if (block && typeof block === "object") {
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

function isSubstantiveConversationText(text: string | null | undefined): boolean {
  const normalized = text?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return false;
  }
  if (normalized.length < 4) {
    return false;
  }
  if (/^(hi|hello|ok|好的|收到|继续|嗯|yes|no)$/i.test(normalized)) {
    return false;
  }
  return true;
}

function truncateText(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function sanitizeConversationText(text: string): string {
  return normalizeTruthText(text);
}

function replyExplicitlyRequestsNewTask(text: string | null | undefined): boolean {
  const raw = text?.trim() ?? "";
  if (!raw) {
    return false;
  }

  const structuredDraft = parseDraftRequirementSignals(raw);
  if (
    /##\s*📋\s*任务追踪/i.test(raw) ||
    (structuredDraft.summary && structuredDraft.nextAction)
  ) {
    return false;
  }

  const normalized = sanitizeConversationText(raw);
  return /(没有收到任何待办任务|没有进行中的工作流|请告诉我：)/.test(normalized);
}

function buildLatestDirectTurnSummary(
  messages: ChatMessage[],
  isGroup: boolean,
): ChatDirectTurnSummary | null {
  if (isGroup) {
    return null;
  }

  let latestUserIndex = -1;
  let latestUserText: string | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }
    const text = extractTextFromChatMessage(message);
    if (!text || !isSubstantiveConversationText(text)) {
      continue;
    }
    latestUserIndex = index;
    latestUserText = text;
    break;
  }

  if (latestUserIndex < 0 || !latestUserText) {
    return null;
  }

  for (let index = messages.length - 1; index > latestUserIndex; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") {
      continue;
    }
    const text = extractTextFromChatMessage(message);
    if (!text || !isSubstantiveConversationText(text)) {
      continue;
    }
    return {
      state: "answered",
      questionText: latestUserText,
      questionPreview: truncateText(sanitizeConversationText(latestUserText), 96),
      replyText: text,
      replyPreview: truncateText(sanitizeConversationText(text), 180),
      replyIndex: index,
      repliedAt: typeof message.timestamp === "number" ? message.timestamp : null,
    };
  }

  return {
    state: "waiting",
    questionText: latestUserText,
    questionPreview: truncateText(sanitizeConversationText(latestUserText), 96),
    replyText: null,
    replyPreview: null,
    replyIndex: null,
    repliedAt: null,
  };
}

function buildLatestAssistantRequestsNewTask(messages: ChatMessage[], isGroup: boolean): boolean {
  if (isGroup) {
    return false;
  }
  const latestAssistantText = [...messages]
    .reverse()
    .map((message) => (message?.role === "assistant" ? extractTextFromChatMessage(message) : ""))
    .find((text) => Boolean(text && text.trim().length > 0));
  return replyExplicitlyRequestsNewTask(latestAssistantText);
}

export function buildChatConversationSurface(
  input: BuildChatConversationSurfaceInput,
): ChatConversationSurface {
  const requirementState = buildChatRequirementState({
    activeCompany: input.activeCompany,
    activeConversationState: input.activeConversationState,
    activeWorkItems: input.activeWorkItems,
    activeRequirementAggregates: input.activeRequirementAggregates,
    primaryRequirementId: input.primaryRequirementId,
    activeRoomRecords: input.activeRoomRecords,
    companySessionSnapshots: input.companySessionSnapshots,
    requestPreview: input.requestPreview,
    handoffPreview: input.handoffPreview,
    structuredTaskPreview: input.structuredTaskPreview,
    messages: input.messages,
    currentTime: input.currentTime,
    historyAgentId: input.historyAgentId,
    isGroup: input.isGroup,
    isCeoSession: input.isCeoSession,
    isFreshConversation: input.isFreshConversation,
    isRequirementBootstrapPending: input.isRequirementBootstrapPending,
  });

  const requirementProgressGroups =
    requirementState.requirementOverview && input.isSummaryOpen && input.summaryPanelView === "owner"
      ? {
          working: requirementState.requirementOverview.participants.filter((participant) =>
            ["已开工", "已开工未交付", "已阻塞", "待回复", "未回复"].includes(participant.statusLabel),
          ),
          waiting: requirementState.requirementOverview.participants.filter((participant) =>
            ["已就绪待稿", "待接手", "已交付待下游", "部分完成"].includes(participant.statusLabel),
          ),
          completed: requirementState.requirementOverview.participants.filter((participant) =>
            ["已确认", "已冻结待命", "已回复", "已交接"].includes(participant.statusLabel),
          ),
        }
      : null;

  const latestDirectTurnSummary = buildLatestDirectTurnSummary(input.messages, input.isGroup);
  const latestAssistantRequestsNewTask = buildLatestAssistantRequestsNewTask(input.messages, input.isGroup);
  const ceoReplyExplicitlyRequestsNewTask = Boolean(
    !input.isGroup &&
      input.isCeoSession &&
      (latestAssistantRequestsNewTask ||
        (latestDirectTurnSummary?.state === "answered" &&
          latestDirectTurnSummary.replyText &&
          replyExplicitlyRequestsNewTask(latestDirectTurnSummary.replyText))),
  );
  const hasDirectConversationWorkSignal = Boolean(
    !input.isGroup &&
      !ceoReplyExplicitlyRequestsNewTask &&
      (input.activeConversationState?.currentWorkKey ||
        requirementState.preferredConversationTopicKey ||
        requirementState.preferredConversationTopicText),
  );
  const preferredConversationWorkKey = requirementState.preferredConversationTopicKey
    ? `topic:${requirementState.preferredConversationTopicKey}`
    : null;

  const workItemState = buildChatWorkItemState({
    activeCompany: input.activeCompany,
    activeRequirementRoom: input.activeRequirementRoom,
    activeRoomRecords: input.activeRoomRecords,
    activeWorkItems: input.activeWorkItems,
    canonicalWorkItems: requirementState.canonicalWorkItems,
    requirementRoomSnapshots: input.requirementRoomSnapshots,
    requirementRoomSnapshotAgentIds: input.requirementRoomSnapshotAgentIds,
    companySessionSnapshots: input.companySessionSnapshots,
    rawConversationRequirementOverview: requirementState.rawConversationRequirementOverview,
    requirementOverview: requirementState.requirementOverview,
    effectiveStableConversationWorkItem: requirementState.effectiveStableConversationWorkItem,
    latestStrategicCanonicalWorkItem: requirementState.latestStrategicCanonicalWorkItem,
    latestOpenCanonicalWorkItem: requirementState.latestOpenCanonicalWorkItem,
    preferredConversationTopicKey: requirementState.preferredConversationTopicKey,
    preferredConversationWorkKey,
    sessionKey: input.sessionKey,
    productRoomId: input.productRoomId,
    groupTopicKey: input.groupTopicKey,
    groupWorkItemId: input.groupWorkItemId,
    isGroup: input.isGroup,
    isCeoSession: input.isCeoSession,
    isFreshConversation: input.isFreshConversation,
    isRequirementBootstrapPending: input.isRequirementBootstrapPending,
    ceoReplyExplicitlyRequestsNewTask,
    hasDirectConversationWorkSignal,
    shouldReplaceLockedConversationWorkItem: requirementState.shouldReplaceLockedConversationWorkItem,
    shouldPreferStrategicOverviewOverStableConversationWorkItem:
      requirementState.shouldPreferStrategicOverviewOverStableConversationWorkItem,
  });

  const taskPlanOverview = buildChatTaskPlanOverview({
    company: input.activeCompany,
    requirementOverview: requirementState.requirementOverview,
    structuredTaskPreview: input.structuredTaskPreview,
  });
  const shouldComputeTeamPanelDetails = input.isSummaryOpen && input.summaryPanelView === "team";
  const requirementTeam = buildChatRequirementTeam({
    company: input.activeCompany,
    requirementOverview: requirementState.requirementOverview,
    plan: taskPlanOverview,
    roomTranscript: shouldComputeTeamPanelDetails
      ? workItemState.effectiveRequirementRoom?.transcript
      : undefined,
    sessionSnapshots: shouldComputeTeamPanelDetails ? input.companySessionSnapshots : undefined,
    includeTimeline: shouldComputeTeamPanelDetails,
    includeArtifacts: shouldComputeTeamPanelDetails,
  });

  return {
    ...requirementState,
    ...workItemState,
    requirementProgressGroups,
    latestDirectTurnSummary,
    latestAssistantRequestsNewTask,
    ceoReplyExplicitlyRequestsNewTask,
    hasDirectConversationWorkSignal,
    preferredConversationWorkKey,
    taskPlanOverview,
    requirementTeam,
  };
}
