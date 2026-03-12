import type {
  RequirementLifecyclePhase,
  RequirementPromotionState,
  RequirementStageGateStatus,
  WorkItemStatus,
} from "../../domain/mission/types";

export function isStableDraftRequirementState(
  state: RequirementPromotionState | null | undefined,
): boolean {
  return Boolean(
    state &&
      [
        "draft_ready",
        "awaiting_promotion_choice",
        "promoted_manual",
        "promoted_auto",
        "active_requirement",
      ].includes(state),
  );
}

export function normalizeRequirementStageGateStatus(
  value: unknown,
): RequirementStageGateStatus {
  if (value === "waiting_confirmation" || value === "confirmed") {
    return value;
  }
  return "none";
}

export function resolveRequirementStageGateStatus(input: {
  explicitStageGateStatus?: unknown;
  draftStageGateStatus?: unknown;
  promotionState?: RequirementPromotionState | null;
  completed?: boolean;
}): RequirementStageGateStatus {
  if (input.completed) {
    return "confirmed";
  }
  const explicit = normalizeRequirementStageGateStatus(input.explicitStageGateStatus);
  if (explicit !== "none") {
    return explicit;
  }
  const draftStageGate = normalizeRequirementStageGateStatus(input.draftStageGateStatus);
  if (draftStageGate !== "none") {
    return draftStageGate;
  }
  if (input.promotionState === "active_requirement") {
    return "confirmed";
  }
  return "none";
}

export function resolveRequirementLifecyclePhase(input: {
  explicitLifecyclePhase?: RequirementLifecyclePhase | null;
  stageGateStatus?: RequirementStageGateStatus | null;
  promotionState?: RequirementPromotionState | null;
  workItemStatus?: WorkItemStatus | null;
  completed?: boolean;
  hasExecutionSignal?: boolean;
}): RequirementLifecyclePhase {
  if (input.explicitLifecyclePhase) {
    return input.explicitLifecyclePhase;
  }
  if (
    input.completed ||
    input.workItemStatus === "completed" ||
    input.workItemStatus === "archived"
  ) {
    return "completed";
  }
  if (
    input.stageGateStatus === "waiting_confirmation" ||
    input.promotionState === "draft_ready" ||
    input.promotionState === "awaiting_promotion_choice"
  ) {
    return "pre_requirement";
  }
  if (input.promotionState === "active_requirement") {
    return "active_requirement";
  }
  if (
    input.promotionState === "promoted_manual" ||
    input.promotionState === "promoted_auto"
  ) {
    return input.stageGateStatus === "confirmed"
      ? "active_requirement"
      : "pre_requirement";
  }
  if (input.workItemStatus === "draft") {
    return "pre_requirement";
  }
  if (input.hasExecutionSignal) {
    return "active_requirement";
  }
  return "pre_requirement";
}
