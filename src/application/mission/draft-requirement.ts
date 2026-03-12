import { inferMissionTopicKey, inferRequestTopicKey } from "../delegation/request-topic";
import { normalizeTruthText } from "./message-truth";
import type { ChatMessage } from "../gateway";
import type {
  AssistantControlRequirementDraft,
  Company,
  ConversationStateRecord,
  DraftRequirementRecord,
  PromotionReason,
} from "../../domain";
import { readAssistantControlEnvelope } from "../../domain";

type ParsedDraftSignals = {
  summary: string | null;
  nextAction: string | null;
  canProceed: boolean | null;
  ownerLabel: string | null;
  stage: string | null;
  stageGateStatus: DraftRequirementRecord["stageGateStatus"];
};

const DRAFT_REQUIREMENT_LABELS = [
  "当前理解",
  "当前判断",
  "建议下一步",
  "下一步建议",
  "是否可推进",
  "当前负责人",
  "当前阶段",
] as const;

function extractTextFromMessage(message: ChatMessage | null | undefined): string {
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
          return record.text.trim();
        }
      }
      return "";
    })
    .filter((entry) => entry.length > 0)
    .join("\n")
    .trim();
}

function isSubstantiveUserText(text: string | null | undefined): boolean {
  const normalized = text?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized || normalized.length < 4) {
    return false;
  }
  return !/^(hi|hello|ok|好的|收到|继续|嗯|yes|no)$/i.test(normalized);
}

function isContinuationUserText(text: string | null | undefined): boolean {
  const normalized = text?.replace(/\s+/g, "").trim().toLowerCase() ?? "";
  if (!normalized) {
    return false;
  }

  return [
    /^继续([吧啊呀啦了]*)$/,
    /^继续[,，。；!！]?/,
    /^接着/,
    /^就按这个方向推进/,
    /^按这个方向推进/,
    /^按这个方向/,
    /^就按这个做/,
    /^照这个推进/,
    /^沿着这个方向推进/,
    /^那就推进/,
    /^可以开始推进/,
    /^goahead/,
    /^continue/,
    /^proceed/,
  ].some((pattern) => pattern.test(normalized));
}

function findLatestAnsweredTurn(messages: ChatMessage[]): {
  userText: string;
  userTimestamp: number;
  assistantMessage: ChatMessage;
  assistantText: string;
  assistantTimestamp: number;
} | null {
  for (let userIndex = messages.length - 1; userIndex >= 0; userIndex -= 1) {
    const userMessage = messages[userIndex];
    if (userMessage?.role !== "user") {
      continue;
    }
    const userText = extractTextFromMessage(userMessage);
    if (!isSubstantiveUserText(userText)) {
      continue;
    }
    for (let assistantIndex = messages.length - 1; assistantIndex > userIndex; assistantIndex -= 1) {
      const assistantMessage = messages[assistantIndex];
      if (assistantMessage?.role !== "assistant") {
        continue;
      }
      const assistantText = extractTextFromMessage(assistantMessage);
      if (!assistantText) {
        continue;
      }
      return {
        userText: normalizeTruthText(userText),
        userTimestamp:
          typeof userMessage.timestamp === "number" ? userMessage.timestamp : Date.now(),
        assistantMessage,
        assistantText,
        assistantTimestamp:
          typeof assistantMessage.timestamp === "number" ? assistantMessage.timestamp : Date.now(),
      };
    }
    return null;
  }
  return null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLabeledBlock(
  text: string,
  labels: string[],
  allLabels: readonly string[] = DRAFT_REQUIREMENT_LABELS,
): string | null {
  const patterns = labels.map((label) => `【${escapeRegex(label)}】|${escapeRegex(label)}[：:]`);
  const stopPatterns = allLabels.map(
    (label) => `【${escapeRegex(label)}】|${escapeRegex(label)}[：:]`,
  );
  const blockPattern = new RegExp(
    `(?:^|\\n)\\s*(?:${patterns.join("|")})\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:${stopPatterns.join(
      "|",
    )}))|$)`,
    "i",
  );
  const match = text.match(blockPattern);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function normalizeCanProceed(value: string | null): boolean | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  if (["是", "可", "可以", "yes", "true", "推进", "可推进"].some((token) => normalized.includes(token))) {
    return true;
  }
  if (
    ["否", "不", "不可", "不可以", "no", "false", "暂不可推进", "不能推进"].some((token) =>
      normalized.includes(token),
    )
  ) {
    return false;
  }
  return null;
}

function readStructuredDraftPayload(message: ChatMessage): AssistantControlRequirementDraft | null {
  return readAssistantControlEnvelope(message)?.requirementDraft ?? null;
}

export function parseDraftRequirementSignals(text: string): ParsedDraftSignals {
  const normalized = text.trim();
  const summary = extractLabeledBlock(normalized, ["当前理解", "当前判断"]);
  const nextAction = extractLabeledBlock(normalized, ["建议下一步", "下一步建议"]);
  const canProceed = normalizeCanProceed(extractLabeledBlock(normalized, ["是否可推进"]));
  const ownerLabel = extractLabeledBlock(normalized, ["当前负责人"]);
  const stage = extractLabeledBlock(normalized, ["当前阶段"]);

  return {
    summary,
    nextAction,
    canProceed,
    ownerLabel,
    stage,
    stageGateStatus: null,
  };
}

function inferTopicKey(text: string): string | null {
  return inferRequestTopicKey([text]) ?? inferMissionTopicKey([text]) ?? null;
}

function resolveCeoLabel(company: Company | null): { actorId: string | null; label: string } {
  const ceo = company?.employees.find((employee) => employee.metaRole === "ceo") ?? null;
  return {
    actorId: ceo?.agentId ?? null,
    label: ceo?.nickname ?? "CEO",
  };
}

function shouldPromoteFromFollowup(
  previousDraft: DraftRequirementRecord | null,
  nextDraft: Pick<
    DraftRequirementRecord,
    "topicKey" | "summary" | "ownerActorId" | "stage" | "nextAction"
  >,
): boolean {
  if (!previousDraft) {
    return false;
  }
  return (
    (previousDraft.topicKey && nextDraft.topicKey
      ? previousDraft.topicKey === nextDraft.topicKey
      : previousDraft.summary === nextDraft.summary) &&
    previousDraft.ownerActorId === nextDraft.ownerActorId &&
    previousDraft.stage === nextDraft.stage &&
    previousDraft.nextAction === nextDraft.nextAction
  );
}

function resolveAutoPromotionReason(input: {
  hasMultiActorDispatchSignal: boolean;
  hasTaskBoardSignal: boolean;
  hasRequirementTeamSignal: boolean;
}): PromotionReason | null {
  if (input.hasTaskBoardSignal) {
    return "task_board_detected";
  }
  if (input.hasMultiActorDispatchSignal || input.hasRequirementTeamSignal) {
    return "multi_actor_dispatch";
  }
  return null;
}

export function buildConversationDraftRequirement(input: {
  company: Company | null;
  activeConversationState: ConversationStateRecord | null;
  messages: ChatMessage[];
  isGroup: boolean;
  isCeoSession: boolean;
  isArchiveView: boolean;
  hasRuntimePromotionSignal: boolean;
  hasMultiActorDispatchSignal?: boolean;
  hasTaskBoardSignal?: boolean;
  hasRequirementTeamSignal?: boolean;
}): DraftRequirementRecord | null {
  if (input.isGroup || !input.isCeoSession || input.isArchiveView) {
    return null;
  }

  const latestTurn = findLatestAnsweredTurn(input.messages);
  if (!latestTurn) {
    return input.activeConversationState?.draftRequirement ?? null;
  }

  const structuredPayload = readStructuredDraftPayload(latestTurn.assistantMessage);
  if (!structuredPayload) {
    return input.activeConversationState?.draftRequirement ?? null;
  }

  const ceo = resolveCeoLabel(input.company);
  const previousDraft = input.activeConversationState?.draftRequirement ?? null;
  const shouldReusePreviousTopic = previousDraft && isContinuationUserText(latestTurn.userText);
  const nextDraftBase = {
    topicKey:
      structuredPayload.topicKey ??
      (shouldReusePreviousTopic ? previousDraft.topicKey : inferTopicKey(latestTurn.userText)),
    topicText: shouldReusePreviousTopic ? previousDraft.topicText : latestTurn.userText,
    summary: structuredPayload.summary,
    ownerActorId: structuredPayload.ownerActorId ?? ceo.actorId,
    ownerLabel: structuredPayload.ownerLabel?.trim() || ceo.label,
    stage: structuredPayload.stage?.trim() || "CEO 正在收敛目标和推进方式",
    nextAction: structuredPayload.nextAction,
    stageGateStatus:
      structuredPayload.stageGateStatus !== "none"
        ? structuredPayload.stageGateStatus
        : previousDraft?.stageGateStatus ?? null,
    updatedAt: latestTurn.assistantTimestamp,
  };
  const canProceed = structuredPayload.canProceed ?? true;
  const sameDraftChain = shouldPromoteFromFollowup(previousDraft, nextDraftBase);
  const autoPromotionReason = resolveAutoPromotionReason({
    hasMultiActorDispatchSignal: Boolean(input.hasMultiActorDispatchSignal),
    hasTaskBoardSignal: Boolean(input.hasTaskBoardSignal),
    hasRequirementTeamSignal: Boolean(input.hasRequirementTeamSignal),
  });

  let state: DraftRequirementRecord["state"] = "draft_ready";
  let promotionReason: DraftRequirementRecord["promotionReason"] = null;

  if (input.hasRuntimePromotionSignal) {
    state = "active_requirement";
    promotionReason =
      previousDraft?.promotionReason ?? autoPromotionReason ?? null;
  } else if (
    previousDraft?.state === "promoted_manual" &&
    (!canProceed || sameDraftChain)
  ) {
    state = "promoted_manual";
    promotionReason = "manual_confirmation";
  } else if (autoPromotionReason) {
    state = "promoted_auto";
    promotionReason = autoPromotionReason;
  } else if (
    previousDraft?.state === "promoted_auto" &&
    (!canProceed || sameDraftChain)
  ) {
    state = "promoted_auto";
    promotionReason = previousDraft.promotionReason ?? "multi_actor_dispatch";
  } else if (
    previousDraft?.state === "active_requirement" &&
    (!canProceed || sameDraftChain)
  ) {
    state = "active_requirement";
    promotionReason = previousDraft.promotionReason ?? null;
  } else if (
    previousDraft?.state === "draft_ready" &&
    canProceed &&
    sameDraftChain
  ) {
    state = "awaiting_promotion_choice";
  } else if (
    previousDraft?.state === "awaiting_promotion_choice" &&
    canProceed &&
    sameDraftChain
  ) {
    state = "awaiting_promotion_choice";
  }

  const promotable = ["promoted_manual", "promoted_auto", "active_requirement"].includes(state);

  return {
    ...nextDraftBase,
    state,
    promotionReason,
    promotable,
  };
}
