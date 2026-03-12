import {
  isInternalAssistantMonologueText,
  isSyntheticWorkflowPromptText,
  isTruthMirrorNoiseText,
  stripTruthInternalMonologue,
  stripTruthTaskTracker,
} from "../../../application/mission/message-truth";
import type { ChatMessage } from "../../../application/gateway";
import {
  dedupeVisibleChatMessages,
  extractTextFromMessage,
  normalizeMessage,
} from "./message-basics";
import type { DecisionTicketRecord } from "../../../domain/delegation/types";
import { readAssistantControlEnvelope } from "../../../domain/shared/assistant-control";
import { CHAT_UI_MESSAGE_LIMIT, type ChatBlock, type ChatDisplayItem } from "./message-types";
import { parseCollaboratorReportMessage } from "./message-reports";
import { isToolActivityMessage, isToolResultMessage, summarizeToolMessage } from "./message-tooling";

export { CHAT_UI_MESSAGE_LIMIT } from "./message-types";
export type { ChatBlock, ChatDisplayItem } from "./message-types";
export type { CollaboratorReportCardVM } from "./message-reports";
export {
  createChatMentionRegex,
  createComposerMentionBoundaryRegex,
  dedupeVisibleChatMessages,
  extractTextFromMessage,
  normalizeMessage,
  sanitizeConversationText,
  stripChatControlMetadata,
  truncateText,
} from "./message-basics";
export {
  describeToolName,
  isToolActivityMessage,
  isToolResultMessage,
  summarizeToolResultText,
} from "./message-tooling";

function isEphemeralConversationText(text: string): boolean {
  return /^\/new(?:\s|$)/i.test(text.trim());
}

function isSyntheticOutgoingDispatchLabel(message: ChatMessage, rawText: string | null): boolean {
  if (message.role !== "user" || !rawText) {
    return false;
  }
  if (message.roomMessageSource !== "owner_dispatch") {
    return false;
  }
  const normalized = rawText.trim();
  return /^(?:派给|发送给|转给)\s*[\p{L}\p{N}_-]+$/u.test(normalized);
}

export function extractNameFromMessage(text: string): string | null {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const patterns = [
    /^(?:hi|hello|hey|你好|您好)[,，!！\s]+([A-Za-z0-9_\-\u4e00-\u9fa5]{1,32})\b/i,
    /^([A-Za-z0-9_\-\u4e00-\u9fa5]{1,32})[,，:：]\s*/,
    /^我是\s*([A-Za-z0-9_\-\u4e00-\u9fa5]{1,32})\b/i,
    /^my name is\s+([A-Za-z0-9_\-\u4e00-\u9fa5]{1,32})\b/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export function isLikelyLegacyRelayUserMessage(message: ChatMessage, rawText: string | null): boolean {
  if (message.role !== "user" || !rawText) {
    return false;
  }
  if (message.roomSessionKey || message.roomAgentId) {
    return false;
  }
  const normalized = rawText.trim();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("需求团队房间") || normalized.includes("请继续推进") || normalized.includes("请回复")) {
    return true;
  }
  return /^@[\p{L}\p{N}_-]+/u.test(normalized);
}

export function sanitizeVisibleMessageText(text: string): string {
  return stripTruthInternalMonologue(stripTruthTaskTracker(text)).trim();
}

function stripSyntheticDispatchAudienceTitle(text: string): string {
  return text
    .replace(/^(?:需求团队派单\s*·\s*[^\n]+|[^\n]+?\s*·\s*群发派单)\n+/u, "")
    .trim();
}

function stripOwnerDispatchReceiptInstructions(text: string): string {
  return text
    .replace(/^(?:##\s*)?回执要求[\s\S]*$/u, "")
    .replace(/\n{2,}##\s*回执要求[\s\S]*$/u, "")
    .replace(/\n{2,}回执要求[\s\S]*$/u, "")
    .trim();
}

function stripDispatchTransportEnvelope(text: string): string {
  if (!/^\s*"?\[company_dispatch\]/u.test(text)) {
    return text;
  }
  let next = text.trim().replace(/^"+|"+$/g, "");
  next = next.replace(/^\[company_dispatch\]\s+(?:(?:[A-Za-z_]+)=[^\s]+\s+)*/u, "");
  next = next.replace(
    /^company_report\s+with\s+these\s+exact\s+ids\s+reportStateGuide=[^\s]+\s*/iu,
    "",
  );
  next = next.replace(/\s+任务：/u, "\n\n任务：");
  next = next.replace(
    /(?:^|\s+)请收到后回复\s+acknowledged\s+确认接单，完成后回复\s+answered\s+并提交结果。?/giu,
    "",
  );
  next = next.replace(/\s+dispatch:\s*dispatch:[^\s`"”]+/giu, "");
  next = next.replace(/\n{3,}/g, "\n\n").trim();
  return next;
}

function sanitizeDisplayMessageText(message: ChatMessage, text: string): string {
  let sanitized = sanitizeVisibleMessageText(text);
  if (!sanitized) {
    return "";
  }
  if (message.roomMessageSource === "owner_dispatch") {
    sanitized = stripSyntheticDispatchAudienceTitle(sanitized);
    sanitized = stripOwnerDispatchReceiptInstructions(sanitized);
  }
  sanitized = stripDispatchTransportEnvelope(sanitized);
  return sanitized.trim();
}

function detectDisplayTransportKind(text: string | null): "company_dispatch" | null {
  if (!text) {
    return null;
  }
  return /^\s*"?\[company_dispatch\]/u.test(text) ? "company_dispatch" : null;
}

function readChatMessageStableId(message: ChatMessage): string | null {
  const candidates = [
    message.roomMessageId,
    message.id,
    typeof message.provenance === "object" && message.provenance
      ? (message.provenance as Record<string, unknown>).providerMessageId
      : null,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function reserveDisplayItemId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }
  let suffix = 2;
  let nextId = `${baseId}:${suffix}`;
  while (usedIds.has(nextId)) {
    suffix += 1;
    nextId = `${baseId}:${suffix}`;
  }
  usedIds.add(nextId);
  return nextId;
}

function buildDisplayItemId(
  message: ChatMessage,
  kind: "message" | "report" | "tool",
  usedIds: Set<string>,
): string {
  const stableId = readChatMessageStableId(message);
  const baseId = stableId ? `${stableId}:${kind}` : `${message.timestamp ?? Date.now()}:${kind}`;
  return reserveDisplayItemId(baseId, usedIds);
}

export function normalizeChatBlockType(type?: string): string {
  if (!type) {
    return "";
  }
  if (type === "toolCall") {
    return "tool_call";
  }
  if (type === "toolResult") {
    return "tool_result";
  }
  return type
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function getChatBlocks(content: unknown): ChatBlock[] {
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .map((block) => (typeof block === "object" && block ? (block as ChatBlock) : null))
    .filter((block): block is ChatBlock => Boolean(block));
}

function sanitizeVisibleMessageContent(message: ChatMessage, content: unknown): unknown {
  if (!Array.isArray(content)) {
    return content;
  }

  const sanitized = getChatBlocks(content)
    .map((block) => {
      const type = normalizeChatBlockType(block.type);
      if (type === "text") {
        const sanitizedText = sanitizeDisplayMessageText(message, block.text ?? "");
        return sanitizedText
          ? {
              ...block,
              type: "text",
              text: sanitizedText,
            }
          : null;
      }
      if (type === "image") {
        return { ...block, type: "image" };
      }
      return null;
    })
    .filter(Boolean) as ChatBlock[];

  return sanitized;
}

export function buildVisibleChatMessage(message: ChatMessage): ChatMessage {
  const rawText = extractTextFromMessage(message);
  const normalizedText = sanitizeDisplayMessageText(message, rawText ?? "");
  const displayTransport = detectDisplayTransportKind(rawText);
  return {
    ...message,
    text: normalizedText || undefined,
    content: sanitizeVisibleMessageContent(message, message.content),
    ...(displayTransport ? { displayTransport } : {}),
  };
}

export function getRenderableMessageContent(content: unknown): unknown {
  if (!Array.isArray(content)) {
    return typeof content === "string" ? content : undefined;
  }
  const blocks = getChatBlocks(content).filter((block) => {
    const type = normalizeChatBlockType(block.type);
    return type === "text" || type === "image";
  });
  return blocks.length > 0 ? blocks : undefined;
}

export function shouldKeepVisibleChatMessage(message: ChatMessage): boolean {
  const rawText = extractTextFromMessage(message);
  const text = rawText ? sanitizeDisplayMessageText(message, rawText) : "";
  const visibleContent = sanitizeVisibleMessageContent(message, message.content);
  const renderableContent = getRenderableMessageContent(visibleContent);
  const renderableBlocks = Array.isArray(renderableContent) ? getChatBlocks(renderableContent) : [];
  const hasRenderableImage = renderableBlocks.some((block) => normalizeChatBlockType(block.type) === "image");
  const hasRenderableTextBlock = renderableBlocks.some(
    (block) => normalizeChatBlockType(block.type) === "text" && typeof block.text === "string" && block.text.trim().length > 0,
  );
  if (hasRenderableImage) {
    return true;
  }
  if (!text && !hasRenderableTextBlock) {
    return false;
  }
  if (isEphemeralConversationText(text)) {
    return false;
  }
  if (isSyntheticOutgoingDispatchLabel(message, rawText)) {
    return false;
  }
  if (isTruthMirrorNoiseText(text) || isSyntheticWorkflowPromptText(text) || isInternalAssistantMonologueText(text)) {
    return false;
  }
  if (isLikelyLegacyRelayUserMessage(message, rawText)) {
    return false;
  }
  return true;
}

export function limitChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-CHAT_UI_MESSAGE_LIMIT);
}

export function sanitizeVisibleChatFlow(messages: ChatMessage[]): ChatMessage[] {
  return limitChatMessages(
    dedupeVisibleChatMessages(messages.map(normalizeMessage))
      .map((message) => buildVisibleChatMessage(message))
      .filter((message) => shouldKeepVisibleChatMessage(message)),
  );
}

export function buildChatDisplayItems(
  messages: ChatMessage[],
  options?: { includeToolSummaries?: boolean; hideToolItems?: boolean },
): ChatDisplayItem[] {
  const includeToolSummaries = options?.hideToolItems ? false : (options?.includeToolSummaries ?? true);
  const sanitizedMessages = sanitizeVisibleChatFlow(messages);
  const usedDisplayItemIds = new Set<string>();
  if (!includeToolSummaries) {
    return sanitizedMessages.map((message) => ({
      kind: "message",
      id: buildDisplayItemId(message, "message", usedDisplayItemIds),
      message,
    }));
  }

  const displayItems: ChatDisplayItem[] = [];
  let pendingToolSummary: ChatDisplayItem | null = null;

  const flushToolSummary = () => {
    if (pendingToolSummary) {
      displayItems.push(pendingToolSummary);
      pendingToolSummary = null;
    }
  };

  for (const message of sanitizedMessages) {
    if (isToolActivityMessage(message) || isToolResultMessage(message)) {
      const summary = summarizeToolMessage(message);
      if (
        pendingToolSummary &&
        pendingToolSummary.kind === "tool" &&
        pendingToolSummary.title === summary.title &&
        pendingToolSummary.detail === summary.detail
      ) {
        const currentSummary: Extract<ChatDisplayItem, { kind: "tool" }> = pendingToolSummary;
        pendingToolSummary = {
          ...currentSummary,
          count: currentSummary.count + 1,
        };
      } else {
        flushToolSummary();
        pendingToolSummary = {
          kind: "tool",
          id: buildDisplayItemId(message, "tool", usedDisplayItemIds),
          title: summary.title,
          detail: summary.detail,
          tone: isToolResultMessage(message) ? "sky" : "slate",
          count: 1,
        };
      }
      continue;
    }

    const report = parseCollaboratorReportMessage(message);
    if (report) {
      flushToolSummary();
      displayItems.push({
        kind: "report",
        id: buildDisplayItemId(message, "report", usedDisplayItemIds),
        message,
        report,
      });
      continue;
    }

    flushToolSummary();
    displayItems.push({
      kind: "message",
      id: buildDisplayItemId(message, "message", usedDisplayItemIds),
      message,
    });
  }

  flushToolSummary();
  return displayItems;
}

function matchesDecisionIdentity(
  ticket: DecisionTicketRecord,
  message: ChatMessage,
): boolean {
  const decision = readAssistantControlEnvelope(message)?.decision;
  if (!decision || decision.type !== ticket.decisionType) {
    return false;
  }
  return Boolean(
    (ticket.aggregateId && decision.aggregateId && ticket.aggregateId === decision.aggregateId) ||
      (ticket.workItemId && decision.workItemId && ticket.workItemId === decision.workItemId) ||
      (ticket.sourceConversationId &&
        decision.sourceConversationId &&
        ticket.sourceConversationId === decision.sourceConversationId),
  );
}

function hasStructuredDecisionMessage(
  ticket: DecisionTicketRecord,
  message: ChatMessage,
): boolean {
  const decision = readAssistantControlEnvelope(message)?.decision;
  return Boolean(decision && decision.type === ticket.decisionType);
}

export function findInlineRequirementDecisionAnchorId(input: {
  displayItems: ChatDisplayItem[];
  openDecisionTicket?: DecisionTicketRecord | null;
  showLegacyPending?: boolean;
}): string | null {
  const assistantItems = input.displayItems.filter(
    (item): item is Extract<ChatDisplayItem, { kind: "message" | "report" }> =>
      (item.kind === "message" || item.kind === "report") && item.message.role === "assistant",
  );
  if (assistantItems.length === 0) {
    return null;
  }

  const openDecisionTicket = input.openDecisionTicket ?? null;
  if (openDecisionTicket) {
    const exactMatch =
      [...assistantItems]
        .reverse()
        .find((item) => matchesDecisionIdentity(openDecisionTicket, item.message)) ?? null;
    if (exactMatch) {
      return exactMatch.id;
    }
    const structuredMatch =
      [...assistantItems]
        .reverse()
        .find((item) => hasStructuredDecisionMessage(openDecisionTicket, item.message)) ?? null;
    if (structuredMatch) {
      return structuredMatch.id;
    }
  }

  if (!openDecisionTicket && !input.showLegacyPending) {
    return null;
  }

  return assistantItems[assistantItems.length - 1]?.id ?? null;
}

export function isSubstantiveConversationText(text: string): boolean {
  const sanitized = sanitizeVisibleMessageText(text);
  if (!sanitized) {
    return false;
  }
  if (isEphemeralConversationText(sanitized)) {
    return false;
  }
  if (
    isTruthMirrorNoiseText(sanitized) ||
    isSyntheticWorkflowPromptText(sanitized) ||
    isInternalAssistantMonologueText(sanitized)
  ) {
    return false;
  }
  return true;
}

export function stripTaskTrackerSection(text: string): string {
  return stripTruthTaskTracker(text).trim();
}
