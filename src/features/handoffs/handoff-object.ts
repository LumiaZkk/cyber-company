import type { Company, EmployeeRef, HandoffRecord, HandoffStatus, TrackedTask } from "../company/types";
import type { ChatMessage } from "../backend";

const URL_REGEX = /https?:\/\/[^\s<>"'`）)]+/g;
const FILE_PATH_REGEX =
  /(?:\/(?:Users|tmp|var|home)\/[^\s`"'|]+|(?:\.{1,2}\/)[^\s`"'|]+|\/[^\s`"'|]+?\.(?:md|txt|json|csv|png|jpg|jpeg|pdf))/g;

function extractText(message: ChatMessage): string {
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim()) {
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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function matchEmployees(text: string, employees: EmployeeRef[]): string[] {
  const directMentions = [...text.matchAll(/@([a-zA-Z0-9_-]+)/g)].map((match) => match[1]);
  const namedMentions = employees
    .filter(
      (employee) =>
        text.includes(employee.nickname) ||
        text.includes(employee.role) ||
        (employee.metaRole && text.toLowerCase().includes(employee.metaRole.toLowerCase())),
    )
    .map((employee) => employee.agentId);
  return unique(
    [...directMentions, ...namedMentions].filter((candidate) =>
      employees.some((employee) => employee.agentId === candidate),
    ),
  );
}

function collectChecklist(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        /^[-*]\s+/.test(line) ||
        /^\d+\.\s+/.test(line) ||
        /^第?\d+\s*[.、]/.test(line) ||
        line.includes("步骤"),
    )
    .slice(0, 8)
    .map((line) => line.replace(/^[-*]\s+/, "").trim());
}

function resolveStatus(text: string): HandoffStatus {
  if (/缺失|未提供|待确认|阻塞|blocked/i.test(text)) {
    return "blocked";
  }
  if (/已完成|完成交接|已交付|已提交|完成/i.test(text)) {
    return "completed";
  }
  if (/已确认|确认收到|已接收|ack/i.test(text)) {
    return "acknowledged";
  }
  return "pending";
}

function resolveTitle(text: string): string {
  const bracket = text.match(/【([^】]+)】/);
  if (bracket?.[1]) {
    return bracket[1].trim();
  }
  const line = text
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.length > 0 && item.length <= 80);
  return line ?? "交接记录";
}

function resolveMissingItems(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /待|未|缺|missing/i.test(line) && line.length <= 120)
    .slice(0, 5);
}

export function buildHandoffRecords(params: {
  sessionKey: string;
  messages: ChatMessage[];
  company: Company;
  currentAgentId?: string | null;
  relatedTask?: TrackedTask | null;
}): HandoffRecord[] {
  const { messages, company, sessionKey, currentAgentId, relatedTask } = params;

  const records: Array<HandoffRecord | null> = messages.map((message, index) => {
      const text = extractText(message);
      if (!text) {
        return null;
      }

      const toAgentIds = matchEmployees(text, company.employees).filter(
        (agentId) => agentId !== currentAgentId,
      );
      const looksLikeHandoff =
        toAgentIds.length > 0 &&
        (/交接|移交|转交|请.*处理|请.*跟进|提交给|发给|交付|review|审校|发布|汇报/i.test(text) ||
          text.includes("任务追踪"));
      if (!looksLikeHandoff) {
        return null;
      }

      const urls = unique(text.match(URL_REGEX) ?? []);
      const artifactPaths = unique(text.match(FILE_PATH_REGEX) ?? []);
      const checklist = collectChecklist(text);
      const missingItems = resolveMissingItems(text);
      const title = resolveTitle(text);
      const summaryLine =
        text
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0 && line.length <= 140 && line !== title) ?? title;
      const createdAt = typeof message.timestamp === "number" ? message.timestamp : Date.now();

      const handoff: HandoffRecord = {
        id: `${sessionKey}:handoff:${createdAt}:${index}`,
        sessionKey,
        taskId: relatedTask?.id,
        fromAgentId: currentAgentId ?? undefined,
        toAgentIds,
        title,
        summary: summaryLine,
        status: resolveStatus(text),
        checklist: checklist.length > 0 ? checklist : undefined,
        missingItems: missingItems.length > 0 ? missingItems : undefined,
        artifactUrls: urls.length > 0 ? urls : undefined,
        artifactPaths: artifactPaths.length > 0 ? artifactPaths : undefined,
        sourceMessageTs: typeof message.timestamp === "number" ? message.timestamp : undefined,
        createdAt,
        updatedAt: createdAt,
      };
      return handoff;
    });

  return records.filter((record): record is HandoffRecord => record !== null);
}
