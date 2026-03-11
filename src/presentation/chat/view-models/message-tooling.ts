import type { ChatMessage } from "../../../application/gateway";
import { extractTextFromMessage, truncateText } from "./message-basics";

export function isToolActivityMessage(message: ChatMessage): boolean {
  return Array.isArray(message.content)
    ? message.content.some((block) => {
        if (!block || typeof block !== "object") {
          return false;
        }
        const type = String((block as { type?: unknown }).type ?? "").toLowerCase();
        return type === "thinking" || type === "tool_call" || type === "tool_use";
      })
    : false;
}

function extractToolCallNames(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .map((block) => (typeof block === "object" && block ? (block as Record<string, unknown>) : null))
    .filter((block): block is Record<string, unknown> => Boolean(block))
    .filter((block) => {
      const type = String(block.type ?? "").toLowerCase();
      return type === "tool_call" || type === "tool_use";
    })
    .map((block) => (typeof block.name === "string" ? block.name : ""))
    .filter((name) => name.length > 0);
}

function extractMessageToolName(message: ChatMessage): string | null {
  return typeof message.toolName === "string" && message.toolName.trim().length > 0
    ? message.toolName.trim()
    : null;
}

function extractThinkingPreview(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }
  const thinkingBlock = content.find((block) => {
    if (!block || typeof block !== "object") {
      return false;
    }
    return String((block as { type?: unknown }).type ?? "").toLowerCase() === "thinking";
  }) as { thinking?: unknown; text?: unknown } | undefined;
  const rawText =
    typeof thinkingBlock?.thinking === "string"
      ? thinkingBlock.thinking
      : typeof thinkingBlock?.text === "string"
        ? thinkingBlock.text
        : null;
  return rawText ? truncateText(rawText, 120) : null;
}

function extractToolResultText(message: ChatMessage): string | null {
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text;
  }
  return extractTextFromMessage(message);
}

export function isToolResultMessage(message: ChatMessage): boolean {
  if (message.role === "toolResult") {
    return true;
  }
  return Array.isArray(message.content)
    ? message.content.some((block) => {
        if (!block || typeof block !== "object") {
          return false;
        }
        const type = String((block as { type?: unknown }).type ?? "").toLowerCase();
        return type === "tool_result";
      })
    : false;
}

export function describeToolName(rawName: string | null): string {
  if (!rawName) {
    return "工具";
  }
  const normalized = rawName.replace(/[_-]+/g, " ").trim();
  if (!normalized) {
    return "工具";
  }
  const lower = normalized.toLowerCase();
  if (lower === "read") return "读取文件";
  if (lower === "write") return "写入文件";
  if (lower === "edit") return "编辑文件";
  if (lower === "bash") return "运行命令";
  if (lower === "search") return "搜索";
  return normalized;
}

export function summarizeToolResultText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "已返回结果";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "已返回结构化结果";
  }
  return truncateText(trimmed, 140);
}

function buildToolActivitySummary(message: ChatMessage): { title: string; detail: string } {
  const toolNames = extractToolCallNames(message.content);
  const thinkingPreview = extractThinkingPreview(message.content);
  if (toolNames.length === 0) {
    return {
      title: "正在调用工具",
      detail: thinkingPreview ?? "正在推理并准备执行工具调用。",
    };
  }

  const distinctToolNames = [...new Set(toolNames)];
  return {
    title:
      distinctToolNames.length === 1
        ? `正在使用 ${describeToolName(distinctToolNames[0] ?? null)}`
        : `正在使用 ${distinctToolNames.length} 个工具`,
    detail:
      thinkingPreview ??
      distinctToolNames
        .slice(0, 3)
        .map((name) => describeToolName(name))
        .join("、"),
  };
}

function buildToolResultSummary(message: ChatMessage): { title: string; detail: string } {
  const toolNames = [...new Set([...extractToolCallNames(message.content), extractMessageToolName(message)].filter(Boolean))];
  const resultText = summarizeToolResultText(extractToolResultText(message) ?? "");
  const primaryTool = describeToolName(toolNames[0] ?? null);
  return {
    title: toolNames.length > 0 ? `${primaryTool} 已返回结果` : "工具结果",
    detail: resultText,
  };
}

export function summarizeToolMessage(message: ChatMessage): { title: string; detail: string } {
  return isToolResultMessage(message)
    ? buildToolResultSummary(message)
    : buildToolActivitySummary(message);
}
