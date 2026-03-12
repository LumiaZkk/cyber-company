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
  truncateText,
} from "./message-basics";
import type { DecisionTicketRecord } from "../../../domain/delegation/types";
import { readAssistantControlEnvelope } from "../../../domain/shared/assistant-control";
import {
  CHAT_UI_MESSAGE_LIMIT,
  type ChatBlock,
  type ChatDisplayItem,
  type ChatDisplayTier,
  type ChatNarrativeRole,
} from "./message-types";
import {
  parseCollaboratorReportMessage,
  readStructuredCollaborationMetadata,
} from "./message-reports";
import { isToolActivityMessage, isToolResultMessage, summarizeToolMessage } from "./message-tooling";

export { CHAT_UI_MESSAGE_LIMIT } from "./message-types";
export type {
  ChatBlock,
  ChatDisplayItem,
  ChatDisplayTier,
  ChatNarrativeRole,
} from "./message-types";
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

function dedupeAdjacentLines(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (result[result.length - 1] !== line) {
      result.push(line);
    }
  }
  return result;
}

function isWorkflowNoiseLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) {
    return false;
  }
  return /^(?:Dispatch ID|当前理解|建议下一步|是否可推进)[:：]/iu.test(normalized)
    || /^任务看板已更新/u.test(normalized)
    || /^来自\s+[A-Z][A-Za-z ]+$/u.test(normalized);
}

function splitNarrativeText(text: string): {
  primaryText: string;
  detailText: string | null;
} {
  const normalizedLines = dedupeAdjacentLines(
    text
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line, index, lines) => !(line.trim().length === 0 && lines[index - 1]?.trim().length === 0)),
  );
  const primaryLines: string[] = [];
  const detailLines: string[] = [];
  for (const line of normalizedLines) {
    if (isWorkflowNoiseLine(line)) {
      detailLines.push(line.trim());
      continue;
    }
    primaryLines.push(line);
  }
  return {
    primaryText: primaryLines.join("\n").trim(),
    detailText: detailLines.length > 0 ? detailLines.join("\n").trim() : null,
  };
}

function summarizeStatusText(text: string): string {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return text.trim();
  }
  return truncateText(firstLine, 96);
}

function isWorkflowStatusText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return /(?:^|[\s，。；;])(?:收到|已收到|已接单|已派单|已转达|处理中|已同步|已更新看板|开始评估|开始处理|立即评估|立即处理)/u.test(
    normalized,
  ) || /(?:让我更新任务看板|已向.+传达|转给\s*[A-Z]{2,6}|派发给\s*[A-Z]{2,6})/u.test(normalized);
}

function isSubstantiveUpdateText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  if (normalized.length >= 48) {
    return true;
  }
  return /(推荐|建议|结论|结果|风险|阻塞|确认|可行|不可行|优先|备选|支持|需要你|需你|是否可|账号|登录)/u.test(
    normalized,
  );
}

function isExecutiveFinalSummaryText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return /^(?:结论|总结|先同步给你|给你一个结论|目前结论|最终结论)[:：]/u.test(normalized)
    || /(?:建议下一步|需要你确认|请你确认|可推进)/u.test(normalized);
}

function isExecutiveBridgeText(message: ChatMessage, text: string): boolean {
  if (message.role !== "assistant") {
    return false;
  }
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return /(?:让我(?:更新|继续|检查|查看|确认|处理|同步)|我看到.+让我|收到.+回执.+让我)/u.test(
    normalized,
  ) && /[：:]$/.test(normalized);
}

function createThreadGroupKey(message: ChatMessage): string | null {
  const structured = readStructuredCollaborationMetadata(message);
  if (structured.dispatchId) {
    return structured.dispatchId;
  }
  if (structured.requestId) {
    return structured.requestId;
  }
  if (typeof message.roomSessionKey === "string" && message.roomSessionKey.trim().length > 0) {
    return message.roomSessionKey.trim();
  }
  const rawText = extractTextFromMessage(message) ?? "";
  const dispatchMatch = rawText.match(/dispatch=([^\s]+)/u) ?? rawText.match(/dispatch:\s*([^\s]+)/u);
  if (dispatchMatch?.[1]) {
    return dispatchMatch[1].trim();
  }
  if (typeof message.roomMessageId === "string" && message.roomMessageId.trim().length > 0) {
    return message.roomMessageId.trim();
  }
  return null;
}

function overrideDisplayText(message: ChatMessage, nextText: string): ChatMessage {
  const trimmedText = nextText.trim();
  const nextMessage: ChatMessage = {
    ...message,
    text: trimmedText || undefined,
  };
  const renderableContent = getRenderableMessageContent(message.content);
  if (Array.isArray(renderableContent)) {
    const nextBlocks: ChatBlock[] = [];
    let insertedText = false;
    for (const block of renderableContent) {
      const type = normalizeChatBlockType(block.type);
      if (type === "text") {
        if (!insertedText && trimmedText) {
          nextBlocks.push({ ...block, type: "text", text: trimmedText });
          insertedText = true;
        }
        continue;
      }
      nextBlocks.push(block);
    }
    if (!insertedText && trimmedText) {
      nextBlocks.unshift({ type: "text", text: trimmedText });
    }
    nextMessage.content = nextBlocks;
  }
  return nextMessage;
}

type DisplayClassification = {
  displayTier: Exclude<ChatDisplayTier, "hidden"> | "hidden";
  narrativeRole: ChatNarrativeRole;
  detailContent?: string | null;
  threadGroupKey?: string | null;
  displayText?: string | null;
};

function classifyReportDisplayItem(
  message: ChatMessage,
  report: ReturnType<typeof parseCollaboratorReportMessage>,
): DisplayClassification {
  if (!report) {
    return {
      displayTier: "hidden",
      narrativeRole: "system_noise",
    };
  }
  const split = splitNarrativeText(report.cleanText);
  const summaryText = report.summary || split.primaryText;
  const detailContent =
    report.showFullContent || split.detailText || report.detail
      ? [split.detailText, report.showFullContent ? report.cleanText : report.detail]
          .filter((part): part is string => Boolean(part && part.trim()))
          .join("\n\n")
          .trim() || null
      : null;
  const acknowledgedHasDecisionSignal = /(推荐|建议|结论|结果|风险|阻塞|确认|需要你|需你|可行|不可行|支持|备选)/u.test(
    summaryText,
  );
  if (report.status === "acknowledged" && !acknowledgedHasDecisionSignal) {
    return {
      displayTier: "status",
      narrativeRole: "workflow_status",
      detailContent,
      threadGroupKey: createThreadGroupKey(message),
      displayText: summarizeStatusText(summaryText || report.summary),
    };
  }
  return {
    displayTier: report.status === "blocked" ? "main" : "main",
    narrativeRole: report.status === "answered" ? "member_update" : "workflow_status",
    detailContent,
    threadGroupKey: createThreadGroupKey(message),
    displayText: summaryText || report.summary,
  };
}

function classifyMessageDisplayItem(message: ChatMessage): DisplayClassification {
  const structured = readStructuredCollaborationMetadata(message);
  const text = extractTextFromMessage(message)?.trim() ?? "";
  const split = splitNarrativeText(text);
  const primaryText = split.primaryText;
  const detailContent = split.detailText;
  const threadGroupKey = createThreadGroupKey(message);

  if (message.displayTransport === "company_dispatch") {
    return {
      displayTier: "detail",
      narrativeRole: "system_noise",
      detailContent: primaryText || detailContent,
      threadGroupKey,
      displayText: summarizeStatusText(primaryText || "查看派单详情"),
    };
  }

  if (!primaryText) {
    return {
      displayTier: detailContent ? "detail" : "hidden",
      narrativeRole: "system_noise",
      detailContent,
      threadGroupKey,
      displayText: detailContent ? "查看协作详情" : null,
    };
  }

  if (structured.intent === "relay_notice") {
    return {
      displayTier: "detail",
      narrativeRole: "system_noise",
      detailContent: primaryText,
      threadGroupKey,
      displayText: "协作回传详情",
    };
  }

  if (message.role === "user") {
    return {
      displayTier: "main",
      narrativeRole: "user_prompt",
      detailContent,
      threadGroupKey,
      displayText: primaryText,
    };
  }

  if (isWorkflowStatusText(primaryText) && !isSubstantiveUpdateText(primaryText)) {
    return {
      displayTier: "status",
      narrativeRole: "workflow_status",
      detailContent,
      threadGroupKey,
      displayText: summarizeStatusText(primaryText),
    };
  }

  if (isExecutiveBridgeText(message, primaryText)) {
    return {
      displayTier: "status",
      narrativeRole: "workflow_status",
      detailContent,
      threadGroupKey,
      displayText: summarizeStatusText(primaryText),
    };
  }

  if (isExecutiveFinalSummaryText(primaryText)) {
    return {
      displayTier: "main",
      narrativeRole: "final_summary",
      detailContent,
      threadGroupKey,
      displayText: primaryText,
    };
  }

  return {
    displayTier: "main",
    narrativeRole:
      typeof message.roomAgentId === "string" && message.roomAgentId.trim().length > 0
        ? "member_update"
        : "executive_reply",
    detailContent,
    threadGroupKey,
    displayText: primaryText,
  };
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

function resolveDisplayActorKey(message: ChatMessage): string {
  if (typeof message.senderAgentId === "string" && message.senderAgentId.trim().length > 0) {
    return `agent:${message.senderAgentId.trim()}`;
  }
  if (typeof message.roomAgentId === "string" && message.roomAgentId.trim().length > 0) {
    return `agent:${message.roomAgentId.trim()}`;
  }
  if (typeof message.provenance === "object" && message.provenance) {
    const provenance = message.provenance as Record<string, unknown>;
    if (typeof provenance.sourceActorId === "string" && provenance.sourceActorId.trim().length > 0) {
      return `agent:${provenance.sourceActorId.trim()}`;
    }
  }
  return `role:${message.role}`;
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
    const items: ChatDisplayItem[] = [];
    for (const message of sanitizedMessages) {
      const classification = classifyMessageDisplayItem(message);
      if (classification.displayTier === "hidden") {
        continue;
      }
      const nextMessage =
        classification.displayText && classification.displayText !== extractTextFromMessage(message)
          ? overrideDisplayText(message, classification.displayText)
          : message;
      items.push({
        kind: "message",
        id: buildDisplayItemId(nextMessage, "message", usedDisplayItemIds),
        message: nextMessage,
        displayTier: classification.displayTier,
        narrativeRole: classification.narrativeRole,
        detailContent: classification.detailContent ?? null,
        threadGroupKey: classification.threadGroupKey ?? null,
      });
    }
    return items;
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
      const classification = classifyReportDisplayItem(message, report);
      if (classification.displayTier === "hidden") {
        continue;
      }
      const nextMessage =
        classification.displayText && classification.displayText !== extractTextFromMessage(message)
          ? overrideDisplayText(message, classification.displayText)
          : message;
      flushToolSummary();
      displayItems.push({
        kind: "report",
        id: buildDisplayItemId(nextMessage, "report", usedDisplayItemIds),
        message: nextMessage,
        report: {
          ...report,
          summary: classification.displayText ?? report.summary,
        },
        displayTier: classification.displayTier,
        narrativeRole: classification.narrativeRole,
        detailContent: classification.detailContent ?? null,
        threadGroupKey: classification.threadGroupKey ?? null,
      });
      continue;
    }

    const classification = classifyMessageDisplayItem(message);
    if (classification.displayTier === "hidden") {
      continue;
    }
    const nextMessage =
      classification.displayText && classification.displayText !== extractTextFromMessage(message)
        ? overrideDisplayText(message, classification.displayText)
        : message;
    flushToolSummary();
    displayItems.push({
      kind: "message",
      id: buildDisplayItemId(nextMessage, "message", usedDisplayItemIds),
      message: nextMessage,
      displayTier: classification.displayTier,
      narrativeRole: classification.narrativeRole,
      detailContent: classification.detailContent ?? null,
      threadGroupKey: classification.threadGroupKey ?? null,
    });
  }

  flushToolSummary();
  return compactStructuredDisplayItems(displayItems);
}

function compactStructuredDisplayItems(displayItems: ChatDisplayItem[]): ChatDisplayItem[] {
  const sessionsSendReportKeys = new Set<string>();
  const relayNoticeByActorTimestamp = new Map<string, string>();
  displayItems.forEach((item) => {
    if (item.kind !== "report" || item.report.transport !== "sessions_send") {
      return;
    }
    const timestamp = typeof item.message.timestamp === "number" ? item.message.timestamp : 0;
    sessionsSendReportKeys.add(`${resolveDisplayActorKey(item.message)}:${timestamp}`);
  });

  const compactedItems: ChatDisplayItem[] = displayItems.map((item): ChatDisplayItem => {
    if (item.kind !== "message") {
      return item;
    }
    const timestamp = typeof item.message.timestamp === "number" ? item.message.timestamp : 0;
    const actorTimestampKey = `${resolveDisplayActorKey(item.message)}:${timestamp}`;
    if (
      item.message.role !== "user" &&
      sessionsSendReportKeys.has(actorTimestampKey)
    ) {
      const originalText = extractTextFromMessage(item.message) ?? item.detailContent ?? null;
      if (originalText?.trim()) {
        relayNoticeByActorTimestamp.set(actorTimestampKey, originalText.trim());
      }
      return {
        ...item,
        message: overrideDisplayText(item.message, "协作回传详情"),
        displayTier: "detail",
        narrativeRole: "system_noise",
        detailContent: originalText,
      };
    }
    return item;
  });

  return compactedItems.filter((item) => {
    if (item.kind !== "report" || item.report.transport !== "sessions_send") {
      return true;
    }
    const timestamp = typeof item.message.timestamp === "number" ? item.message.timestamp : 0;
    const actorTimestampKey = `${resolveDisplayActorKey(item.message)}:${timestamp}`;
    const relayNotice = relayNoticeByActorTimestamp.get(actorTimestampKey);
    if (!relayNotice) {
      return true;
    }
    return item.report.summary.trim() !== relayNotice;
  });
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
