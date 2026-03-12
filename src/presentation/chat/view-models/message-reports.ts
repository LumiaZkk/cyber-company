import {
  extractDeliverableHeading,
  inferReportTextStatus,
  inferReportTransport,
  summarizeReportText,
} from "../../../application/delegation/report-classifier";
import type { ChatMessage } from "../../../application/gateway";
import { extractTextFromMessage } from "./message-basics";

export type CollaboratorReportCardVM = {
  status: "acknowledged" | "answered" | "blocked";
  statusLabel: string;
  reportType: string;
  summary: string;
  detail: string | null;
  cleanText: string;
  showFullContent: boolean;
};

function stripReportProtocol(text: string): string {
  return text.replace(/^\[company_report:(?:acknowledged|answered|blocked)\](?:\s*dispatch=[^\s]+)?\s*/i, "").trim();
}

function inferReportType(text: string): string {
  if (/阻塞|失败|超时|无响应/i.test(text)) {
    return "阻塞回报";
  }
  if (/技术|架构|可行性|开发周期|方案/i.test(text)) {
    return "技术评估";
  }
  if (/组织|招聘|岗位|jd|编制/i.test(text)) {
    return "组织方案";
  }
  if (/渠道|平台|投放|分发|增长/i.test(text)) {
    return "渠道调研";
  }
  const heading = extractDeliverableHeading(text);
  if (heading) {
    return heading.replace(/^#+\s*/, "");
  }
  return "部门回执";
}

function extractReportDetail(text: string, summary: string): string | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const detail = lines.find((line) => line !== summary) ?? null;
  return detail && detail !== summary ? detail : null;
}

function shouldShowFullReportContent(text: string, summary: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed === summary.trim()) {
    return false;
  }
  if (trimmed.length >= 180) {
    return true;
  }
  return /(^|\n)(?:#{1,6}\s+|\|.+\||[-*]\s+|\d+\.\s+|```)/.test(trimmed);
}

function hasStructuredSource(message: ChatMessage): boolean {
  const provenance =
    typeof message.provenance === "object" && message.provenance
      ? (message.provenance as Record<string, unknown>)
      : null;
  return Boolean(
    (typeof message.roomAgentId === "string" && message.roomAgentId.trim().length > 0) ||
      (typeof message.senderAgentId === "string" && message.senderAgentId.trim().length > 0) ||
      (provenance && typeof provenance.sourceActorId === "string" && provenance.sourceActorId.trim().length > 0),
  );
}

export function parseCollaboratorReportMessage(
  message: ChatMessage,
): CollaboratorReportCardVM | null {
  const rawText = extractTextFromMessage(message)?.trim();
  if (!rawText) {
    return null;
  }
  if (/^\s*"?\[company_dispatch\]/iu.test(rawText)) {
    return null;
  }
  if (message.displayTransport === "company_dispatch") {
    return null;
  }

  const explicitStatusMatch = rawText.match(/^\[company_report:(acknowledged|answered|blocked)\]/i);
  const cleanText = stripReportProtocol(rawText) || rawText;
  const inferredStatus = explicitStatusMatch?.[1]?.toLowerCase() as CollaboratorReportCardVM["status"] | undefined;
  const derivedStatus = inferredStatus ?? inferReportTextStatus(cleanText);
  const transport = inferReportTransport(rawText);

  if (!derivedStatus) {
    return null;
  }
  if (!explicitStatusMatch && message.role !== "assistant") {
    return null;
  }
  if (transport !== "company_report" && !explicitStatusMatch && !hasStructuredSource(message)) {
    return null;
  }

  const summary = summarizeReportText(cleanText);
  return {
    status: derivedStatus,
    statusLabel:
      derivedStatus === "answered"
        ? "已提交"
        : derivedStatus === "acknowledged"
          ? "已接单"
          : "已阻塞",
    reportType: inferReportType(cleanText),
    summary,
    detail: extractReportDetail(cleanText, summary),
    cleanText,
    showFullContent: shouldShowFullReportContent(cleanText, summary),
  };
}
