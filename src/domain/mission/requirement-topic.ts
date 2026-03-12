export function summarizeRequirementText(text: string, maxLength = 120): string {
  const compact = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

export function extractRequirementTitleFromInstruction(text: string): string | null {
  const match = text.match(/【([^】]+)】/);
  if (!match?.[1]) {
    return null;
  }
  return match[1]
    .split("｜")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .join(" · ");
}

export function deriveStrategicRequirementTitle(
  texts: Array<string | null | undefined>,
): string {
  const corpus = texts
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  if (!corpus) {
    return "当前战略任务";
  }

  const hasConsistency = /一致性|约束驱动|规则层|校验器|validator|rules\.yaml/i.test(corpus);
  const hasReader = /阅读系统|阅读预览|审阅|审稿|内部阅读|阅读页/i.test(corpus);
  const hasExecution = /开工任务单|执行方案|立项|MVP|里程碑|验收/i.test(corpus);
  const hasAiNovelSystem =
    (/全自动\s*AI\s*小说创作系统|AI\s*小说创作系统|小说创作系统|NovelCraft/i.test(corpus) ||
      (/小说创作|小说生成|网文创作/i.test(corpus) &&
        /自动发布|平台发布|选题|题材探索|去AI味|一致性|前后文不一致/i.test(corpus))) &&
    /小说|创作|发布|选题/i.test(corpus);
  const hasExplicitTeamBootstrap =
    /从头开始搭建\s*AI\s*小说创作团队|从头开始搭建小说创作团队|从头开始.*创作团队/i.test(
      corpus,
    );
  const hasTeamBootstrapSignals =
    /创作团队|组织架构|招聘JD|兼任方案|世界观架构师|伏笔管理员|去AI味专员|招聘|岗位|搭建.*团队|团队搭建|班底|质量提升专项|质量提升/i.test(
      corpus,
    ) && /小说|网文|创作/i.test(corpus);

  if (hasExplicitTeamBootstrap || hasTeamBootstrapSignals) {
    return "从头开始搭建 AI 小说创作团队";
  }
  if (hasAiNovelSystem) {
    return "全自动AI小说创作系统";
  }

  if (hasConsistency && hasReader) {
    return hasExecution ? "一致性底座与内部审阅系统执行方案" : "一致性底座与内部审阅系统";
  }
  if (hasConsistency) {
    return hasExecution ? "一致性技术方案与执行方案" : "一致性技术方案";
  }
  if (hasReader) {
    return hasExecution ? "小说阅读系统执行方案" : "小说阅读系统方案";
  }

  const titled = texts
    .map((value) => extractRequirementTitleFromInstruction(value ?? ""))
    .find((value) => typeof value === "string" && value.trim().length > 0);
  if (titled) {
    return titled;
  }

  return summarizeRequirementText(corpus, 28);
}

export function buildRequirementOverviewTitle(topicKey: string, hints: string[]): string {
  if (topicKey.startsWith("chapter:")) {
    const chapterId = topicKey.slice("chapter:".length);
    if (hints.some((hint) => /重写|从头|重开|重新完成/i.test(hint))) {
      return `重新完成第 ${chapterId} 章`;
    }
    return `第 ${chapterId} 章执行`;
  }

  if (topicKey.startsWith("mission:")) {
    return deriveStrategicRequirementTitle(hints);
  }

  const plainHint = hints.find(
    (hint) =>
      !hint.startsWith("chapter:") &&
      !hint.startsWith("artifact:") &&
      !hint.startsWith("mission:"),
  );
  return plainHint ? summarizeRequirementText(plainHint, 24) : "当前需求";
}

export function isRestartInstructionText(text: string): boolean {
  return /重写|从头开始|从头处理|重开|重新完成|重启/i.test(text);
}

export function isStrategicInstructionText(text: string): boolean {
  return /方案|系统|工具|实现|规划|优先级|业务流程|技术架构|阅读|团队|创作团队|组织|组织架构|招聘|岗位|搭建|班底|专项|质量提升|兼任方案|招聘JD|世界观架构师|伏笔管理员|去AI味专员/i.test(
    text,
  );
}
