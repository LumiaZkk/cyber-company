function normalizeChapterId(raw: string): string {
  const normalized = raw.replace(/^0+/, "").trim();
  return normalized || "0";
}

function normalizeMissionSeed(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_>#()[\]{}-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashMissionSeed(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

export function inferMissionTopicKey(values: Array<string | null | undefined>): string | undefined {
  const corpus = values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  const normalized = normalizeMissionSeed(corpus);
  if (normalized.length < 12) {
    return undefined;
  }
  return `mission:${hashMissionSeed(normalized)}`;
}

export function inferRequestTopicKey(values: Array<string | null | undefined>): string | undefined {
  const corpus = values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");

  const chapterMatch =
    corpus.match(/第\s*(\d+)\s*章/) ??
    corpus.match(/\bCH\s*0?(\d+)\b/i) ??
    corpus.match(/(?:^|\/)(\d{2})-[^/\n]+\.md/i) ??
    corpus.match(/\bch0?(\d+)\.md\b/i);
  if (chapterMatch?.[1]) {
    return `chapter:${normalizeChapterId(chapterMatch[1])}`;
  }

  const artifactMatch = corpus.match(/([^/\n]+\.md)\b/i);
  if (artifactMatch?.[1]) {
    return `artifact:${artifactMatch[1].toLowerCase()}`;
  }

  return undefined;
}

export function requestTopicMatchesText(topicKey: string | undefined, text: string): boolean {
  if (!topicKey) {
    return true;
  }

  if (topicKey.startsWith("chapter:")) {
    const chapterId = topicKey.slice("chapter:".length);
    return (
      new RegExp(`第\\s*0?${chapterId}\\s*章`, "i").test(text) ||
      new RegExp(`\\bCH\\s*0?${chapterId}\\b`, "i").test(text) ||
      new RegExp(`(?:^|/)0?${chapterId}-[^/\\n]+\\.md`, "i").test(text) ||
      new RegExp(`\\bch0?${chapterId}\\.md\\b`, "i").test(text)
    );
  }

  if (topicKey.startsWith("artifact:")) {
    const artifact = topicKey.slice("artifact:".length).toLowerCase();
    return text.toLowerCase().includes(artifact);
  }

  if (topicKey.startsWith("mission:")) {
    return inferMissionTopicKey([text]) === topicKey;
  }

  return false;
}
