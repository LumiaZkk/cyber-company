import type {
  ConversationStateRecord,
  DraftRequirementRecord,
  RequirementPromotionState,
} from "../../domain/mission/types";
import { parseAgentIdFromSessionKey } from "../../lib/sessions";

const BOARD_PRE_REQUIREMENT_STATES = new Set<RequirementPromotionState>([
  "draft_ready",
  "awaiting_promotion_choice",
  "promoted_manual",
  "promoted_auto",
]);

export function resolveBoardPreRequirementDraft(input: {
  activeConversationStates: ConversationStateRecord[];
  ceoAgentId: string | null;
}): DraftRequirementRecord | null {
  if (!input.ceoAgentId) {
    return null;
  }

  return (
    input.activeConversationStates
      .filter(
        (state) =>
          parseAgentIdFromSessionKey(state.conversationId) === input.ceoAgentId &&
          Boolean(state.draftRequirement) &&
          state.draftRequirement?.state &&
          BOARD_PRE_REQUIREMENT_STATES.has(state.draftRequirement.state),
      )
      .map((state) => state.draftRequirement)
      .filter((draft): draft is DraftRequirementRecord => Boolean(draft))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
  );
}

export function shouldShowBoardPreRequirementDraft(input: {
  trackedTaskCount: number;
  hasRequirementOverview: boolean;
  hasCurrentWorkItem: boolean;
  preRequirementDraft: DraftRequirementRecord | null;
}): boolean {
  return (
    input.trackedTaskCount <= 0 &&
    !input.hasRequirementOverview &&
    !input.hasCurrentWorkItem &&
    Boolean(input.preRequirementDraft)
  );
}
