import type { HandoffRecord, RequestRecord, TrackedTask } from "../../domain";
import { inferRequestTopicKey, requestTopicMatchesText } from "./request-topic";
import {
  inferReportTransport,
  isFormalAckText,
  isFormalAnswerText,
  isFormalBlockedText,
  isPlaceholderOrBridgeText,
  summarizeReportText,
} from "./report-classifier";

type MessageLike = {
  role?: unknown;
  text?: unknown;
  content?: unknown;
  timestamp?: unknown;
};

type BuildRequestRecordsInput = {
  messages: MessageLike[];
  handoffs: HandoffRecord[];
  sessionKey: string;
  relatedTask?: TrackedTask | null;
};

function extractText(message: MessageLike): string {
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

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function buildRequestRecords(input: BuildRequestRecordsInput): RequestRecord[] {
  const orderedMessages = input.messages
    .map((message, index) => ({
      text: extractText(message),
      role: message.role,
      timestamp: normalizeTimestamp(message.timestamp, index + 1),
    }))
    .filter((message) => message.text.length > 0 && !isPlaceholderOrBridgeText(message.text))
    .sort((left, right) => left.timestamp - right.timestamp);

  return input.handoffs.map((handoff) => {
    const topicKey =
      inferRequestTopicKey([
        handoff.title,
        handoff.summary,
        ...(handoff.missingItems ?? []),
        ...(handoff.artifactPaths ?? []),
      ]) ?? undefined;
    const laterMessages = orderedMessages.filter((message) => message.timestamp > handoff.createdAt);
    const relevantMessages = laterMessages.filter((message) =>
      requestTopicMatchesText(topicKey, message.text),
    );

    const latestAnsweredMessage = [...relevantMessages].reverse().find((message) =>
      isFormalAnswerText(message.text),
    );
    const latestBlockedMessage = [...relevantMessages].reverse().find((message) =>
      isFormalBlockedText(message.text),
    );
    const latestAckMessage = [...relevantMessages].reverse().find((message) =>
      isFormalAckText(message.text),
    );

    let status: RequestRecord["status"];
    let deliveryState: RequestRecord["deliveryState"];
    let resolution: RequestRecord["resolution"];
    let responseSummary: string | undefined;
    let responseDetails: string | undefined;
    let responseMessageTs: number | undefined;
    let transport: RequestRecord["transport"];

    if (handoff.status === "completed" || latestAnsweredMessage) {
      status = "answered";
      deliveryState = "answered";
      resolution = latestAnsweredMessage ? "complete" : "partial";
      responseSummary = summarizeReportText(latestAnsweredMessage?.text ?? handoff.summary);
      responseDetails = latestAnsweredMessage?.text;
      responseMessageTs = latestAnsweredMessage?.timestamp ?? handoff.updatedAt;
      transport = inferReportTransport(latestAnsweredMessage?.text ?? handoff.summary);
    } else if (handoff.status === "blocked" || latestBlockedMessage) {
      status = "blocked";
      deliveryState = "blocked";
      resolution =
        latestBlockedMessage && /人工接管|手动接管|manual takeover|请(?:你|用户).{0,8}(?:执行|处理|发布|接管)/i.test(latestBlockedMessage.text)
          ? "manual_takeover"
          : "partial";
      responseSummary = summarizeReportText(latestBlockedMessage?.text ?? handoff.summary);
      responseDetails = latestBlockedMessage?.text;
      responseMessageTs = latestBlockedMessage?.timestamp ?? handoff.updatedAt;
      transport = inferReportTransport(latestBlockedMessage?.text ?? handoff.summary);
    } else if (handoff.status === "acknowledged" || latestAckMessage) {
      status = "acknowledged";
      deliveryState = "acknowledged";
      resolution = "pending";
      responseSummary = summarizeReportText(latestAckMessage?.text ?? handoff.summary);
      responseDetails = latestAckMessage?.text;
      responseMessageTs = latestAckMessage?.timestamp ?? handoff.updatedAt;
      transport = inferReportTransport(latestAckMessage?.text ?? handoff.summary);
    } else {
      status = "pending";
      deliveryState = "delivered";
      resolution = "pending";
      transport = "inferred";
    }

    const updatedAt =
      responseMessageTs ??
      handoff.updatedAt ??
      handoff.sourceMessageTs ??
      handoff.createdAt;

    return {
      id: `${handoff.id}:request`,
      dispatchId: handoff.id.startsWith("handoff:dispatch:")
        ? handoff.id.slice("handoff:".length)
        : undefined,
      sessionKey: input.sessionKey,
      topicKey,
      taskId: handoff.taskId ?? input.relatedTask?.id,
      handoffId: handoff.id,
      fromAgentId: handoff.fromAgentId,
      toAgentIds: handoff.toAgentIds,
      title: handoff.title,
      summary: handoff.summary,
      status,
      deliveryState,
      resolution,
      requiredItems:
        handoff.missingItems && handoff.missingItems.length > 0
          ? handoff.missingItems
          : handoff.checklist,
      responseSummary,
      responseDetails,
      consumedAt:
        status === "answered" || status === "blocked"
          ? responseMessageTs ?? updatedAt
          : null,
      consumerSessionKey:
        handoff.fromAgentId?.trim()
          ? `agent:${handoff.fromAgentId.trim()}:main`
          : null,
      sourceMessageTs: handoff.sourceMessageTs ?? handoff.createdAt,
      responseMessageTs,
      transport,
      createdAt: handoff.createdAt,
      updatedAt,
    } satisfies RequestRecord;
  });
}
