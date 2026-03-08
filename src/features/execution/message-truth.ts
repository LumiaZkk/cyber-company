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

export function stripTruthControlMetadata(text: string): string {
  return text
    .replace(/^Sender \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\s*/i, "")
    .replace(/\bANNOUNCE_SKIP\b/g, "")
    .trim();
}

export function stripTruthTaskTracker(text: string): string {
  return text.replace(/##\s*📋\s*任务追踪[\s\S]*?(?=\n\s*(?:【|##)\s*|$)/i, "").trim();
}

export function normalizeTruthText(text: string): string {
  return stripTruthTaskTracker(stripTruthControlMetadata(text))
    .replace(/\s+/g, " ")
    .trim();
}

export function isSyntheticWorkflowPromptText(text: string): boolean {
  const normalized = normalizeTruthText(text);
  if (!normalized) {
    return false;
  }
  return SYNTHETIC_WORKFLOW_PATTERNS.some((pattern) => pattern.test(normalized));
}
