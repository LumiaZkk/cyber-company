import type { ChatMessage } from "../../../application/gateway";
import type { DraftRequirementRecord } from "../../../domain/mission/types";

function buildPromotionEventText(draftRequirement: DraftRequirementRecord): string | null {
  if (draftRequirement.state === "promoted_manual") {
    return "已转为需求主线，后续协作将在需求房和工作看板持续同步。";
  }
  if (draftRequirement.state === "promoted_auto") {
    if (draftRequirement.promotionReason === "task_board_detected") {
      return "检测到 CEO 已输出可执行任务板，系统已自动转为需求主线。";
    }
    return "检测到 CEO 已启动跨团队执行，系统已自动转为需求主线。";
  }
  if (draftRequirement.state === "active_requirement") {
    return "当前会话已绑定需求主线，后续协作将在需求房和工作看板持续同步。";
  }
  return null;
}

export function buildRequirementPromotionSystemMessages(input: {
  draftRequirement: DraftRequirementRecord | null;
}): ChatMessage[] {
  if (!input.draftRequirement) {
    return [];
  }

  const text = buildPromotionEventText(input.draftRequirement);
  if (!text) {
    return [];
  }

  return [
    {
      role: "system",
      text,
      timestamp: input.draftRequirement.updatedAt,
      promotionState: input.draftRequirement.state,
      promotionReason: input.draftRequirement.promotionReason ?? null,
      syntheticEventType: "requirement_promotion",
    },
  ];
}
