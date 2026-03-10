import { describe, expect, it } from "vitest";
import {
  areTruthTextsEquivalent,
  isInternalAssistantMonologueText,
  isSyntheticWorkflowPromptText,
  isTruthMirrorNoiseText,
  stripTruthInternalMonologue,
} from "./message-truth";

describe("isTruthMirrorNoiseText", () => {
  it("filters task-tracker mirror hints from visible message flows", () => {
    expect(isTruthMirrorNoiseText("任务追踪已同步到顶部“本次需求执行 / 协作生命周期”，正文里不再重复展开。")).toBe(true);
  });

  it("filters mirrored session health status noise", () => {
    expect(isTruthMirrorNoiseText("【当前状态】 - 活跃会话数：2 个 - 系统健康度：⚠️ 部分受阻")).toBe(true);
  });

  it("filters continuation mirror prompts from visible message flows", () => {
    expect(isTruthMirrorNoiseText("Continue where you left off. The previous model attempt failed or timed out.")).toBe(true);
  });

  it("treats workflow forcing prompts as synthetic orchestration noise", () => {
    expect(
      isSyntheticWorkflowPromptText(
        "请不要停留在状态汇报，直接继续推进当前链路。当前情况：CEO 正在收口。当前卡点：暂无明确阻塞。下一步：整合 CTO 与 COO 方案。",
      ),
    ).toBe(true);
  });

  it("does not hide substantive assistant replies", () => {
    expect(isTruthMirrorNoiseText("请让 CTO 先输出一致性技术方案，再由 CEO 给最终执行优先级。")).toBe(false);
  });

  it("treats normalized mirror copies as the same visible truth", () => {
    expect(
      areTruthTextsEquivalent(
        "【当前状态】 请让 CTO 先输出一致性技术方案。",
        "【当前状态】\n请让 CTO 先输出一致性技术方案。",
      ),
    ).toBe(true);
  });

  it("strips leading reviewing prefixes from round previews", () => {
    expect(
      areTruthTextsEquivalent(
        "**Reviewing SOUL.md** 我是赛博公司 CEO，负责拆解、派单、验收、汇报。",
        "我是赛博公司 CEO，负责拆解、派单、验收、汇报。",
      ),
    ).toBe(true);
  });

  it("keeps only the structured final answer when current-status marker exists", () => {
    expect(
      stripTruthInternalMonologue(
        "I need to check the task status first. Let me see.【当前状态】Day 1 已完成，进入 Day 2。",
      ),
    ).toBe("【当前状态】Day 1 已完成，进入 Day 2。");
  });

  it("filters plain internal English self-talk without a final answer marker", () => {
    expect(
      isInternalAssistantMonologueText(
        "I need to check the task status and see who should be responsible.",
      ),
    ).toBe(true);
  });

  it("filters role restatement monologue that does not contain a final answer marker", () => {
    expect(
      isInternalAssistantMonologueText(
        "I'm the CEO of Cyber Company. My core value lies in decomposing, directing, and accepting results. I don't handle specific production work myself.",
      ),
    ).toBe(true);
  });

  it("drops leading english self-talk when a structured answer follows later in the same reply", () => {
    expect(
      stripTruthInternalMonologue(
        "Great! Both CTO and COO have submitted their Day 1 deliverables. I need to update the task status and report to the boss.【当前状态】Day 1 产物已全部到齐。",
      ),
    ).toBe("【当前状态】Day 1 产物已全部到齐。");
  });

  it("filters long ceo self-definition text even when it starts with first-person role restatement", () => {
    expect(
      isInternalAssistantMonologueText(
        "I'm the CEO of Cyber Company, serving as the highest decision-making and dispatching hub. I translate the boss's grand vision into milestone tasks. I must include a task tracking checklist with every reply.",
      ),
    ).toBe(true);
  });

  it("filters Chinese role self-definition monologue", () => {
    expect(
      isInternalAssistantMonologueText(
        "【当前状态】我是 赛博公司 CEO，最高决策与调度枢纽。我不下场干活，只负责拆解、派单、验收、汇报。",
      ),
    ).toBe(true);
  });
});
