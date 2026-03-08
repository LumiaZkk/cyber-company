import type { ChatMessage } from "../backend";
import { resolveExecutionState } from "./state";

export type ManualTakeoverPack = {
  title: string;
  ownerLabel: string;
  sourceSessionKey: string;
  failureSummary: string;
  lastSuccessfulStep: string | null;
  failedStep: string | null;
  recommendedNextAction: string;
  urls: string[];
  filePaths: string[];
  operatorNote: string;
};

const URL_REGEX = /https?:\/\/[^\s<>"'`）)]+/g;
const FILE_PATH_REGEX =
  /(?:\/(?:Users|tmp|var|home)\/[^\s`"'|]+|(?:\.{1,2}\/)[^\s`"'|]+|\/[^\s`"'|]+?\.(?:md|txt|json|csv|png|jpg|jpeg|pdf))/g;

const FAILURE_PATTERNS = [/超时/i, /\btimeout\b/i, /失败/i, /丢失/i, /失联/i, /无响应/i];
const SUCCESS_PATTERNS = [/✅/, /成功/i, /已打开/i, /已准备/i, /已生成/i, /已完成/i];
const NEXT_ACTION_PATTERNS = [
  /请(?:你|用户).{0,10}(?:执行|处理|发布|接管)/i,
  /下一步/i,
  /请手动/i,
  /点击发布/i,
  /粘贴正文/i,
  /填写章节信息/i,
];

type BuildTakeoverPackInput = {
  messages: ChatMessage[];
  sessionKey: string;
  ownerLabel: string;
  fallbackTitle: string;
};

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

function toLines(texts: string[]): string[] {
  return texts
    .flatMap((text) => text.split("\n"))
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        line !== "---" &&
        !/^```/.test(line) &&
        !/^\|(?:[-\s|:]+)\|?$/.test(line),
    );
}

function isStructuredNoise(line: string): boolean {
  return (
    line.length === 0 ||
    line.startsWith("{") ||
    line.startsWith("}") ||
    line.startsWith('"') ||
    /^"\w+/.test(line) ||
    /^\|/.test(line)
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function findLine(
  lines: string[],
  patterns: RegExp[],
  options?: { allowStructuredNoise?: boolean },
): string | null {
  for (const line of lines) {
    if (!options?.allowStructuredNoise && isStructuredNoise(line)) {
      continue;
    }
    if (patterns.some((pattern) => pattern.test(line))) {
      return line;
    }
  }
  return null;
}

function findMatchedSnippet(texts: string[], patterns: RegExp[]): string | null {
  for (const text of texts) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match?.[0]?.trim();
      if (value) {
        return value;
      }
    }
  }
  return null;
}

function resolveTitle(texts: string[], lines: string[], fallbackTitle: string): string {
  const bracketTitle = findMatchedSnippet(texts, [/【[^】]{1,80}】/]);
  if (bracketTitle) {
    return bracketTitle;
  }

  const takeoverTitle = lines.find(
    (line) =>
      !isStructuredNoise(line) &&
      (line.includes("手动") || line.includes("接管") || line.includes("指引")) &&
      line.length <= 180,
  );
  if (takeoverTitle) {
    return takeoverTitle.replace(/^#+\s*/, "").trim();
  }

  const titleLine = lines.find(
    (line) =>
      !isStructuredNoise(line) &&
      (line.startsWith("#") || line.startsWith("【") || line.startsWith("第 ")) &&
      line.length <= 80 &&
      !FAILURE_PATTERNS.some((pattern) => pattern.test(line)),
  );

  if (!titleLine) {
    return fallbackTitle;
  }

  return titleLine.replace(/^#+\s*/, "").replace(/^【|】$/g, "").trim();
}

function collectMatches(texts: string[], regex: RegExp): string[] {
  return unique(
    texts.flatMap((text) => {
      const matches = text.match(regex);
      return matches ? matches.map((item) => item.replace(/[，。；,)]+$/, "")) : [];
    }),
  );
}

export function buildManualTakeoverPack(
  input: BuildTakeoverPackInput,
): ManualTakeoverPack | null {
  const texts = input.messages.map((message) => extractText(message)).filter((text) => text.length > 0);
  if (texts.length === 0) {
    return null;
  }

  const execution = resolveExecutionState({
    evidenceTexts: texts,
  });
  if (execution.state !== "manual_takeover_required") {
    return null;
  }

  const latestFirstLines = toLines([...texts].reverse());
  const chronologicalLines = toLines(texts);

  const urls = collectMatches(texts, URL_REGEX);
  const filePaths = collectMatches(texts, FILE_PATH_REGEX);

  const failureSummary =
    findLine(latestFirstLines, [/标签页持续丢失/i, /操作失败/i, /技术障碍/i, ...FAILURE_PATTERNS]) ??
    execution.summary ??
    "当前链路需要人工接管。";
  const lastSuccessfulStep = findLine(latestFirstLines, SUCCESS_PATTERNS);
  const failedStep =
    findLine(latestFirstLines, [/标签页持续丢失/i, /操作失败/i, /技术障碍/i, ...FAILURE_PATTERNS]) ??
    failureSummary;
  const recommendedNextAction =
    findMatchedSnippet([...texts].reverse(), [
      /请用户执行[^。！!\n]+[。！!]?/i,
      /请手动[^。！!\n]+[。！!]?/i,
      /发布完成后[^。！!\n]+[。！!]?/i,
    ]) ??
    findLine(
      latestFirstLines,
      [/请(?:你|用户).{0,12}(?:执行|处理|发布|接管)/i, /请手动/i, /发布完成后/i],
    ) ??
    findLine(latestFirstLines, NEXT_ACTION_PATTERNS) ??
    (urls.length > 0 ? `打开 ${urls[0]} 并按线程说明继续手动处理。` : "打开原会话，按最新说明继续手动处理。");
  const title = resolveTitle(texts, chronologicalLines, input.fallbackTitle);

  const operatorParts = [
    `任务：${title}`,
    `负责人：${input.ownerLabel}`,
    `失败摘要：${failureSummary}`,
    failedStep ? `失败步骤：${failedStep}` : null,
    lastSuccessfulStep ? `最后成功一步：${lastSuccessfulStep}` : null,
    `下一步：${recommendedNextAction}`,
    urls.length > 0 ? `相关 URL：${urls.join(" , ")}` : null,
    filePaths.length > 0 ? `相关文件：${filePaths.join(" , ")}` : null,
    `源会话：${input.sessionKey}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");

  return {
    title,
    ownerLabel: input.ownerLabel,
    sourceSessionKey: input.sessionKey,
    failureSummary,
    lastSuccessfulStep,
    failedStep,
    recommendedNextAction,
    urls,
    filePaths,
    operatorNote: operatorParts,
  };
}
