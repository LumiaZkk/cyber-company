import {
  buildTruthComparableText,
  normalizeTruthText,
  stripTruthControlMetadata,
  stripTruthInternalMonologue,
} from "../../../application/mission/message-truth";
import type { ChatMessage } from "../../../application/gateway";
import type { ChatBlock } from "./message-types";

export function createChatMentionRegex() {
  return /@([\p{L}\p{N}_-]+)/gu;
}

export function createComposerMentionBoundaryRegex() {
  return /(?:^|[\s,，。！？!?:：;；、()（）[\]{}"'“”‘’<>《》-])@([\p{L}\p{N}_-]*)$/u;
}

export function extractTextFromMessage(message: ChatMessage | undefined): string | null {
  if (!message) {
    return null;
  }
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text;
  }
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    return null;
  }
  const textBlocks = message.content
    .map((block) => (typeof block === "object" && block ? (block as ChatBlock) : null))
    .filter((block): block is ChatBlock => Boolean(block))
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim() ?? "")
    .filter((text) => text.length > 0);
  return textBlocks.length > 0 ? textBlocks.join("\n") : null;
}

export function normalizeMessage(raw: ChatMessage): ChatMessage {
  return {
    ...raw,
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
  };
}

function stripSyntheticDispatchAudienceTitle(message: ChatMessage, text: string): string {
  if (message.roomMessageSource !== "owner_dispatch") {
    return text;
  }
  return text
    .replace(/^(?:需求团队派单\s*·\s*[^\n]+|[^\n]+?\s*·\s*群发派单)\n+/u, "")
    .trim();
}

function normalizeChatDisplaySignature(message: ChatMessage): string {
  const rawText = extractTextFromMessage(message);
  const text = rawText ? stripSyntheticDispatchAudienceTitle(message, rawText) : null;
  if (!text) {
    return "";
  }
  return buildTruthComparableText(stripTruthInternalMonologue(text));
}

function resolveDisplayMessageSenderKey(message: ChatMessage): string {
  if (typeof message.senderAgentId === "string" && message.senderAgentId.trim().length > 0) {
    return `agent:${message.senderAgentId.trim()}`;
  }
  if (typeof message.provenance === "object" && message.provenance) {
    const provenance = message.provenance as Record<string, unknown>;
    if (typeof provenance.sourceActorId === "string" && provenance.sourceActorId.trim().length > 0) {
      return `agent:${provenance.sourceActorId.trim()}`;
    }
    if (typeof provenance.sourceSessionKey === "string" && provenance.sourceSessionKey.trim().length > 0) {
      return `session:${provenance.sourceSessionKey.trim()}`;
    }
  }
  if (typeof message.roomAgentId === "string" && message.roomAgentId.trim().length > 0) {
    return `room-agent:${message.roomAgentId.trim()}`;
  }
  return `role:${message.role}`;
}

function resolveDisplayConversationScopeKey(message: ChatMessage): string {
  if (typeof message.roomSessionKey === "string" && message.roomSessionKey.trim().length > 0) {
    return `room:${message.roomSessionKey.trim()}`;
  }
  if (typeof message.roomAgentId === "string" && message.roomAgentId.trim().length > 0) {
    return `room-agent:${message.roomAgentId.trim()}`;
  }
  return "direct";
}

function pickPreferredVisibleMessage(current: ChatMessage, incoming: ChatMessage): ChatMessage {
  const currentText = extractTextFromMessage(current) ?? "";
  const incomingText = extractTextFromMessage(incoming) ?? "";
  const currentScore =
    currentText.length +
    (Array.isArray(current.content) ? current.content.length * 10 : 0) +
    (current.senderAgentId ? 5 : 0);
  const incomingScore =
    incomingText.length +
    (Array.isArray(incoming.content) ? incoming.content.length * 10 : 0) +
    (incoming.senderAgentId ? 5 : 0);
  if (incomingScore > currentScore) {
    return incoming;
  }
  if (incomingScore === currentScore) {
    const currentTimestamp = typeof current.timestamp === "number" ? current.timestamp : 0;
    const incomingTimestamp = typeof incoming.timestamp === "number" ? incoming.timestamp : 0;
    if (incomingTimestamp >= currentTimestamp) {
      return incoming;
    }
  }
  return current;
}

export function dedupeVisibleChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  const recentBySemanticKey = new Map<string, { index: number; timestamp: number }>();

  for (const message of messages) {
    const currentText = normalizeChatDisplaySignature(message);
    const currentTimestamp = typeof message.timestamp === "number" ? message.timestamp : 0;
    if (currentText.length > 0) {
      const senderKey = resolveDisplayMessageSenderKey(message);
      const scopeKey = resolveDisplayConversationScopeKey(message);
      const semanticKey = `${scopeKey}::${message.role}::${senderKey}::${currentText}`;
      const userEchoKey = message.role === "user" ? `${scopeKey}::user-echo::${currentText}` : null;
      const ownerDispatchEchoKey =
        message.role === "user" && message.roomMessageSource === "owner_dispatch"
          ? `owner-dispatch::${currentText}`
          : null;
      const candidateKeys = [semanticKey, userEchoKey, ownerDispatchEchoKey].filter(
        (key): key is string => Boolean(key),
      );
      const dedupeWindowMs = message.role === "user" ? 120_000 : 5_000;
      const matchedEntry = candidateKeys
        .map((key) => recentBySemanticKey.get(key))
        .find(
          (entry) =>
            entry &&
            Math.abs(currentTimestamp - entry.timestamp) <= dedupeWindowMs &&
            entry.index >= 0 &&
            entry.index < result.length,
        );

      if (matchedEntry) {
        const current = result[matchedEntry.index]!;
        result[matchedEntry.index] = {
          ...pickPreferredVisibleMessage(current, message),
          roomAudienceAgentIds:
            Array.isArray(current.roomAudienceAgentIds) || Array.isArray(message.roomAudienceAgentIds)
              ? [
                  ...new Set(
                    [
                      ...(Array.isArray(current.roomAudienceAgentIds) ? current.roomAudienceAgentIds : []),
                      ...(Array.isArray(message.roomAudienceAgentIds) ? message.roomAudienceAgentIds : []),
                    ].map((agentId) => String(agentId)),
                  ),
                ]
              : message.roomAudienceAgentIds,
        };
        candidateKeys.forEach((key) =>
          recentBySemanticKey.set(key, {
            index: matchedEntry.index,
            timestamp: Math.max(currentTimestamp, matchedEntry.timestamp),
          }),
        );
        continue;
      }
    }

    result.push(message);
    if (currentText.length > 0) {
      const senderKey = resolveDisplayMessageSenderKey(message);
      const scopeKey = resolveDisplayConversationScopeKey(message);
      const semanticKey = `${scopeKey}::${message.role}::${senderKey}::${currentText}`;
      const nextEntry = { index: result.length - 1, timestamp: currentTimestamp };
      recentBySemanticKey.set(semanticKey, nextEntry);
      if (message.role === "user") {
        recentBySemanticKey.set(`${scopeKey}::user-echo::${currentText}`, nextEntry);
        if (message.roomMessageSource === "owner_dispatch") {
          recentBySemanticKey.set(`owner-dispatch::${currentText}`, nextEntry);
        }
      }
    }
  }

  return result;
}

export function stripChatControlMetadata(text: string): string {
  return stripTruthControlMetadata(text);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function truncateText(text: string, maxLength: number): string {
  const compact = collapseWhitespace(text);
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

export function sanitizeConversationText(text: string): string {
  return normalizeTruthText(text);
}
