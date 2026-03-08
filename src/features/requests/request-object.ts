import type { HandoffRecord, RequestRecord, TrackedTask } from "../company/types";
import { inferRequestTopicKey, requestTopicMatchesText } from "./topic";

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

const ACK_PATTERNS = [
  /收到/i,
  /已收到/i,
  /明白/i,
  /了解/i,
  /开始处理/i,
  /处理中/i,
  /已接手/i,
  /已开始/i,
  /立即执行/i,
  /待命/i,
];
const COMPLETE_PATTERNS = [
  /已完成/i,
  /完成交付/i,
  /任务完成/i,
  /交付完成/i,
  /发布成功/i,
  /审校报告/i,
  /review result/i,
  /汇总如下/i,
  /处理完毕/i,
  /是否.*[:：]\s*(?:\*\*)?(?:是|否)/i,
  /已冻结/i,
  /等待新指令/i,
  /标准是否就位/i,
  /检查重点是否明确/i,
];
const PARTIAL_PATTERNS = [/已更新/i, /已产出/i, /已提交/i, /已补充/i, /已处理/i];
const START_PATTERNS = [/是否已开始/i, /预计交稿时间/i, /新稿文件路径/i, /立即开始/i];
const BLOCKED_PATTERNS = [
  /人工接管/i,
  /手动接管/i,
  /manual takeover/i,
  /请(?:你|用户).{0,8}(?:执行|处理|发布|接管)/i,
  /\btimeout\b/i,
  /超时/i,
  /失联/i,
  /无响应/i,
  /缺失项/i,
  /未回复/i,
];

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

function summarizeText(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && line.length <= 160) ??
    text.trim().slice(0, 160)
  );
}

function hasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function countChecklistConfirmations(text: string): number {
  return [...text.matchAll(/是否[^:\n]{0,48}[:：]\s*(?:\*\*)?(?:是|否)/gi)].length;
}

export function buildRequestRecords(input: BuildRequestRecordsInput): RequestRecord[] {
  const orderedMessages = input.messages
    .map((message, index) => ({
      text: extractText(message),
      role: message.role,
      timestamp: normalizeTimestamp(message.timestamp, index + 1),
    }))
    .filter((message) => message.text.length > 0)
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

    const latestAnsweredMessage = [...relevantMessages].reverse().find((message) => {
      if (hasPattern(message.text, START_PATTERNS)) {
        return false;
      }
      return (
        hasPattern(message.text, COMPLETE_PATTERNS) ||
        hasPattern(message.text, PARTIAL_PATTERNS) ||
        countChecklistConfirmations(message.text) >= 2
      );
    });
    const latestBlockedMessage = [...relevantMessages].reverse().find((message) =>
      hasPattern(message.text, BLOCKED_PATTERNS),
    );
    const latestAckMessage = [...relevantMessages].reverse().find((message) =>
      hasPattern(message.text, ACK_PATTERNS) || hasPattern(message.text, START_PATTERNS),
    );

    let status: RequestRecord["status"];
    let resolution: RequestRecord["resolution"];
    let responseSummary: string | undefined;
    let responseMessageTs: number | undefined;

    if (handoff.status === "completed" || latestAnsweredMessage) {
      status = "answered";
      resolution =
        latestAnsweredMessage && hasPattern(latestAnsweredMessage.text, PARTIAL_PATTERNS)
          ? "partial"
          : "complete";
      responseSummary = summarizeText(latestAnsweredMessage?.text ?? handoff.summary);
      responseMessageTs = latestAnsweredMessage?.timestamp ?? handoff.updatedAt;
    } else if (handoff.status === "blocked" || latestBlockedMessage) {
      status = "blocked";
      resolution =
        latestBlockedMessage && /人工接管|手动接管|manual takeover|请(?:你|用户).{0,8}(?:执行|处理|发布|接管)/i.test(latestBlockedMessage.text)
          ? "manual_takeover"
          : "partial";
      responseSummary = summarizeText(latestBlockedMessage?.text ?? handoff.summary);
      responseMessageTs = latestBlockedMessage?.timestamp ?? handoff.updatedAt;
    } else if (handoff.status === "acknowledged" || latestAckMessage) {
      status = "acknowledged";
      resolution = "pending";
      responseSummary = summarizeText(latestAckMessage?.text ?? handoff.summary);
      responseMessageTs = latestAckMessage?.timestamp ?? handoff.updatedAt;
    } else {
      status = "pending";
      resolution = "pending";
    }

    const updatedAt =
      responseMessageTs ??
      handoff.updatedAt ??
      handoff.sourceMessageTs ??
      handoff.createdAt;

    return {
      id: `${handoff.id}:request`,
      sessionKey: input.sessionKey,
      topicKey,
      taskId: handoff.taskId ?? input.relatedTask?.id,
      handoffId: handoff.id,
      fromAgentId: handoff.fromAgentId,
      toAgentIds: handoff.toAgentIds,
      title: handoff.title,
      summary: handoff.summary,
      status,
      resolution,
      requiredItems:
        handoff.missingItems && handoff.missingItems.length > 0
          ? handoff.missingItems
          : handoff.checklist,
      responseSummary,
      sourceMessageTs: handoff.sourceMessageTs ?? handoff.createdAt,
      responseMessageTs,
      createdAt: handoff.createdAt,
      updatedAt,
    } satisfies RequestRecord;
  });
}
