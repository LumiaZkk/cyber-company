const SYNTHETIC_WORKFLOW_PATTERNS = [
  /^现在主线卡在你这里。当前需求：/u,
  /^最新结果已经回传，请你现在直接继续推进。/u,
  /^请优先回复[「“"].+[」”]/u,
  /^请不要停留在状态汇报，直接继续推进当前链路。/u,
  /^需求团队房间《.+》本轮已经收到回执。/u,
  /^先不要直接进入下一阶段。请你基于当前结果/u,
  /^写手、审校、主编都已经完成新版流程。现在不要再汇总现状/u,
  /^重开准备动作已经完成。现在不要再总结现状/u,
  /^现在不要再汇总现状，直接把/u,
];

const MIRROR_NOISE_PATTERNS = [
  /^任务追踪已同步到顶部/u,
  /^这是一条上一轮的会话切换提示/u,
  /^当前已显示产品侧归档轮次/u,
  /^【当前状态】\s*-\s*活跃会话数/u,
  /^活跃会话数[:：]/u,
  /^系统健康度[:：]/u,
  /^continue where you left off\. the previous model attempt failed or timed out\.?$/i,
];

const INTERNAL_ASSISTANT_MONOLOGUE_PATTERNS = [
  /^\s*i(?:'m| am)\s+the\s+ceo\b/i,
  /^\*{0,2}reviewing\s+[a-z0-9_.-]+(?:\.md)?\*{0,2}\b/i,
  /^\*{0,2}checking task status\*{0,2}\b/i,
  /^\*{0,2}updating task status\*{0,2}\b/i,
  /^reviewing\s+[a-z0-9_.-]+(?:\.md)?\b/i,
  /\bi need to review my [a-z0-9_.-]+(?:\.md)?\b/i,
  /\bi need to check (?:the )?(?:current|task) status\b/i,
  /\bi need to (?:send|review|confirm|organize|report|follow up|get back on track)\b/i,
  /\blet me (?:check|review|send|organize|confirm|reply|continue|see)\b/i,
  /\bi should (?:follow up|reply|check|review|give|confirm|continue)\b/i,
  /\bi have already reported\b/i,
  /\blet me check (?:my identity|the current status|whether|what|which|the workspace)\b/i,
  /\bthe boss is now asking\b/i,
  /\bi need to get back on track\b/i,
  /\bi should not do the actual work myself\b/i,
  /\bi don't handle specific production work myself\b/i,
  /\bmy core value lies in decomposing, directing, and accepting results\b/i,
  /\bi translate the boss'?s grand vision into milestone tasks\b/i,
  /\bi must include a task tracking checklist with every reply\b/i,
  /\bi must never cross the line by doing the actual work myself\b/i,
  /^【当前状态】\s*我是\s*(?:赛博公司\s*)?(?:CEO|CTO|COO|HR)[^。！？!?\n]{0,160}(?:我不下场干活|我只负责)/u,
  /^【当前状态】[\s\S]{0,200}最高决策与调度枢纽[\s\S]{0,120}(?:我不下场干活|我只负责)/u,
  /^【当前状态】[\s\S]{0,200}我只做四件事：[\s\S]{0,120}拆任务[→\-]/u,
];

const LEADING_MONOLOGUE_PREFIX_PATTERNS = [
  /^\*{0,2}reviewing\s+[^*\n]+(?:\*{0,2})?\s*/i,
  /^\*{0,2}checking task status\*{0,2}\s*/i,
  /^\*{0,2}updating task status\*{0,2}\s*/i,
];

export function stripTruthControlMetadata(text: string): string {
  return text
    .replace(/^Sender \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\s*/i, "")
    .replace(/\bANNOUNCE_SKIP\b/g, "")
    .trim();
}

export function stripTruthTaskTracker(text: string): string {
  return text.replace(/##\s*📋\s*任务追踪[\s\S]*?(?=\n\s*(?:【|##)\s*|$)/i, "").trim();
}

function looksLikeInternalAssistantMonologue(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }
  return INTERNAL_ASSISTANT_MONOLOGUE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function stripTruthInternalMonologue(text: string): string {
  const cleaned = stripTruthControlMetadata(text);
  if (!cleaned) {
    return "";
  }

  for (const pattern of LEADING_MONOLOGUE_PREFIX_PATTERNS) {
    if (pattern.test(cleaned)) {
      const stripped = cleaned.replace(pattern, "").trim();
      if (stripped.length > 0) {
        return stripped;
      }
    }
  }

  const closeThinkIndex = cleaned.lastIndexOf("</think>");
  if (closeThinkIndex >= 0) {
    const suffix = cleaned.slice(closeThinkIndex + "</think>".length).trim();
    if (suffix.length > 0) {
      return suffix;
    }
  }

  const markerCandidates = [
    cleaned.indexOf("【当前状态】"),
    cleaned.indexOf("【下一步进展】"),
    cleaned.search(/##\s*📋\s*任务追踪/i),
  ].filter((index) => index > 0);

  const earliestMarker = markerCandidates.length > 0 ? Math.min(...markerCandidates) : -1;
  if (earliestMarker > 0) {
    return cleaned.slice(earliestMarker).trim();
  }

  return looksLikeInternalAssistantMonologue(cleaned) ? "" : cleaned.trim();
}

export function normalizeTruthText(text: string): string {
  return stripTruthTaskTracker(stripTruthInternalMonologue(text))
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTruthComparableText(text: string): string {
  return normalizeTruthText(stripTruthControlMetadata(text))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function areTruthTextsEquivalent(left: string, right: string): boolean {
  const normalizedLeft = buildTruthComparableText(left);
  const normalizedRight = buildTruthComparableText(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight;
}

export function isInternalAssistantMonologueText(text: string): boolean {
  const cleaned = stripTruthControlMetadata(text);
  if (!cleaned) {
    return false;
  }
  return stripTruthInternalMonologue(cleaned).length === 0;
}

export function isSyntheticWorkflowPromptText(text: string): boolean {
  const normalized = normalizeTruthText(text);
  if (!normalized) {
    return false;
  }
  return SYNTHETIC_WORKFLOW_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isTruthMirrorNoiseText(text: string): boolean {
  const normalized = normalizeTruthText(text);
  if (!normalized) {
    return false;
  }
  return MIRROR_NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
}
