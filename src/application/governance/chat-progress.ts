import type { Company } from "../../domain/org/types";
import type { ChatMessage } from "../gateway";
import { formatAgentLabel } from "./focus-summary";

export type FocusProgressTone = "slate" | "emerald" | "amber" | "rose" | "indigo";

export type FocusProgressEvent = {
  id: string;
  timestamp: number;
  actorLabel: string;
  title: string;
  summary: string;
  detail?: string;
  tone: FocusProgressTone;
  source: "session" | "local";
  category: "receipt" | "status";
  actorAgentId?: string;
};

function normalizeChatBlockType(type?: string): string {
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

function getChatBlocks(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .map((block) => (typeof block === "object" && block ? (block as Record<string, unknown>) : null))
    .filter((block): block is Record<string, unknown> => Boolean(block));
}

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
  return getChatBlocks(message.content)
    .filter((block) => normalizeChatBlockType(String(block.type ?? "")) === "text")
    .map((block) => (typeof block.text === "string" ? block.text.trim() : ""))
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();
}

function isToolMessage(message: ChatMessage): boolean {
  if (message.role === "toolResult") {
    return true;
  }
  return getChatBlocks(message.content).some((block) => {
    const type = normalizeChatBlockType(String(block.type ?? ""));
    return type === "tool_call" || type === "tool_result" || type === "thinking";
  });
}

function getMessageProvenance(message: ChatMessage): Record<string, unknown> | null {
  return typeof message.provenance === "object" && message.provenance
    ? (message.provenance as Record<string, unknown>)
    : null;
}

function resolveProgressActorAgentId(message: ChatMessage): string | null {
  if (typeof message.senderAgentId === "string" && message.senderAgentId.trim().length > 0) {
    return message.senderAgentId.trim();
  }
  if (typeof message.roomAgentId === "string" && message.roomAgentId.trim().length > 0) {
    return message.roomAgentId.trim();
  }
  const provenance = getMessageProvenance(message);
  return provenance && typeof provenance.sourceActorId === "string" && provenance.sourceActorId.trim().length > 0
    ? provenance.sourceActorId.trim()
    : null;
}

function stripChatControlMetadata(text: string): string {
  return text.replace(/<!--\s*chat-control:[\s\S]*?-->/gi, "").trim();
}

function stripTaskTrackerSection(text: string): string {
  return text.replace(/##\s*📋\s*任务追踪[\s\S]*?(?=\n##\s|$)/i, "").trim();
}

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function isInternalAssistantMonologueText(text: string): boolean {
  return /(^|\n)\s*(internal|思考过程|chain of thought|cot)\s*[:：]/i.test(text);
}

function extractBracketSection(text: string, label: string): string | null {
  const match = text.match(new RegExp(`【${label}】([\\s\\S]*?)(?=\\n\\s*【|$)`));
  const value = match?.[1]?.trim();
  return value ? value : null;
}

export function summarizeProgressText(text: string): { title: string; summary: string; detail?: string } | null {
  const cleaned = stripTaskTrackerSection(stripChatControlMetadata(text));
  if (!cleaned || cleaned === "ANNOUNCE_SKIP" || isInternalAssistantMonologueText(text)) {
    return null;
  }

  const currentStatus = extractBracketSection(cleaned, "当前状态");
  const nextStep = extractBracketSection(cleaned, "下一步进展");
  if (currentStatus) {
    return {
      title: "状态已更新",
      summary: truncateText(currentStatus, 140),
      detail: nextStep ? truncateText(nextStep, 180) : undefined,
    };
  }

  const line1 = cleaned.match(/^1\.\s*(.+)$/m)?.[1]?.trim();
  const line2 = cleaned.match(/^2\.\s*(.+)$/m)?.[1]?.trim();
  const line3 = cleaned.match(/^3\.\s*(.+)$/m)?.[1]?.trim();
  const line4 = cleaned.match(/^4\.\s*(.+)$/m)?.[1]?.trim();

  if (line1 === "是" && line2 === "是") {
    return {
      title: "已收到明确结果",
      summary: "终审已通过，并已准予继续下一步。",
      detail: line3 ? truncateText(line3, 180) : undefined,
    };
  }

  if (line1 === "否" || /未进入审核|未成功|失败/.test(cleaned)) {
    return {
      title: "已收到失败回传",
      summary: truncateText(`发布未成功${line3 ? `，${line3}` : ""}`, 140),
      detail: line4 ? truncateText(line4, 180) : undefined,
    };
  }

  if (/待命/.test(cleaned) && /不执行发布/.test(cleaned)) {
    return {
      title: "收到待命回复",
      summary: "对方仍按旧口径待命，尚未切换到最新指令。",
    };
  }

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("```"));
  if (lines.length === 0) {
    return null;
  }

  return {
    title: "收到新进展",
    summary: truncateText(lines[0], 140),
    detail: lines[1] ? truncateText(lines[1], 180) : undefined,
  };
}

export function resolveProgressTone(text: string): FocusProgressTone {
  if (/未成功|失败|阻塞|错误|未进入审核|不执行/.test(text)) {
    return "rose";
  }
  if (/待命|等待|待回复|未切换|待处理/.test(text)) {
    return "amber";
  }
  if (/已发送|已下发|正在|执行|处理中|同步中/.test(text)) {
    return "indigo";
  }
  if (/已完成|已通过|已收到|成功|已同步|已复制/.test(text)) {
    return "emerald";
  }
  return "slate";
}

export function formatLifecycleEventTitle(event: FocusProgressEvent): string {
  if (event.source === "local") {
    return event.title.replace(/^已发送：/, "").replace(/^已同步：/, "");
  }
  return event.title.replace(/^目标会话新进展：/, "");
}

export function formatLifecycleEventSummary(event: FocusProgressEvent): string {
  const combined = [event.summary, event.detail].filter((value): value is string => Boolean(value)).join(" ");
  return truncateText(combined || event.summary, 220);
}

export function buildSessionProgressEvents(input: {
  messages: ChatMessage[];
  company: Company | null | undefined;
  ownerLabel: string;
  includeOwnerAssistantEvents?: boolean;
}): FocusProgressEvent[] {
  const events: Array<FocusProgressEvent | null> = input.messages.map((message, index) => {
      if (isToolMessage(message)) {
        return null;
      }
      const actorAgentId = resolveProgressActorAgentId(message);
      const isOwnerAssistantMessage = message.role === "assistant" && !actorAgentId;
      if (isOwnerAssistantMessage && input.includeOwnerAssistantEvents === false) {
        return null;
      }
      if (message.role === "user" && !actorAgentId) {
        return null;
      }

      const text = extractTextFromMessage(message);
      if (!text) {
        return null;
      }

      const summary = summarizeProgressText(text);
      if (!summary) {
        return null;
      }

      const actorLabel =
        actorAgentId
          ? formatAgentLabel(input.company, actorAgentId)
          : input.ownerLabel;
      const timestamp = typeof message.timestamp === "number" ? message.timestamp : Date.now() + index;

      return {
        id: `${message.role}:${timestamp}:${index}`,
        timestamp,
        actorLabel,
        title: actorAgentId ? "协作者状态回传" : "目标会话新进展",
        summary: summary.summary,
        detail: summary.detail,
        tone: resolveProgressTone([summary.summary, summary.detail].filter(Boolean).join(" ")),
        source: "session",
        category: "status",
        actorAgentId: actorAgentId ?? undefined,
      } satisfies FocusProgressEvent;
    });
  return events.filter((event): event is FocusProgressEvent => event !== null);
}
