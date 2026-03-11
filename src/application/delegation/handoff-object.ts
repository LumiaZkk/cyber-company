import type { Company, EmployeeRef, HandoffRecord, HandoffStatus, TrackedTask } from "../../domain";
import type { ChatMessage } from "../gateway";
import { isPlaceholderOrBridgeText } from "./report-classifier";

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
    .map((block: unknown) => {
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

function looksLikeWorkspaceInstructionDocument(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const hasExplicitMention = /@[a-zA-Z0-9_-]+/.test(trimmed);
  if (hasExplicitMention) {
    return false;
  }

  const headingCount = (trimmed.match(/^\s*#{1,6}\s+/gm) ?? []).length;
  const numberedLineCount = (trimmed.match(/^\s*\d+\.\s+/gm) ?? []).length;
  const bulletLineCount = (trimmed.match(/^\s*[-*]\s+/gm) ?? []).length;
  const looksLikePolicyDoc =
    /(^|\n)#\s*(?:CEO|CTO|COO|HR)\s*执行准则\b/u.test(trimmed) ||
    /(^|\n)#\s*Role:\s*(?:CEO|CTO|COO|HR)\b/i.test(trimmed) ||
    /(^|\n)##\s*(?:开场动作|委派硬规则|当前 roster)\b/u.test(trimmed) ||
    /company-context\.json|当前 roster|汇报给|最高负责人|严禁|委派硬规则/u.test(trimmed);

  return looksLikePolicyDoc && (headingCount >= 2 || numberedLineCount >= 4 || bulletLineCount >= 6);
}

export function isInstructionLikeHandoffRecord(handoff: Pick<HandoffRecord, "title" | "summary" | "checklist" | "missingItems">): boolean {
  return looksLikeWorkspaceInstructionDocument(
    [
      handoff.title,
      handoff.summary,
      ...(handoff.checklist ?? []),
      ...(handoff.missingItems ?? []),
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n"),
  );
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

const HANDOFF_DIRECTIVE_PATTERN =
  /交接|移交|转交|提交给|发给|发送给|同步给|抄送|回执汇报|任务追踪|请.{0,24}(?:处理|跟进|给出|制定|规划|完成|补齐|审校|review|发布|汇报|提交)/i;

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
      if (!text || isPlaceholderOrBridgeText(text) || looksLikeWorkspaceInstructionDocument(text)) {
        return null;
      }

      const toAgentIds = matchEmployees(text, company.employees).filter(
        (agentId) => agentId !== currentAgentId,
      );
      const looksLikeHandoff =
        toAgentIds.length > 0 && (HANDOFF_DIRECTIVE_PATTERN.test(text) || text.includes("任务追踪"));
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
