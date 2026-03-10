import { memo, useMemo } from "react";
import {
  buildAutoDispatchPlan,
  shouldDelegateToNextBaton,
} from "../../../application/assignment/dispatch-planning";
import type { ProviderManifest } from "../../../application/gateway";
import type { FocusProgressEvent } from "../../../application/governance/chat-progress";
import { useConversationDispatches } from "../../../application/mission";
import type { TaskPlanOverview } from "../../../application/mission/chat-mission-surface";
import { useChatAutoDispatch } from "../hooks/useChatAutoDispatch";
import type { DispatchRecord } from "../../../domain/delegation/types";
import type { Company } from "../../../domain/org/types";

type ChatAutoDispatchControllerProps = {
  company: Company | null;
  providerManifest: ProviderManifest;
  fromActorId: string | null;
  workItemId: string | null;
  topicKey?: string | null;
  enabled: boolean;
  upsertDispatchRecord: (dispatch: DispatchRecord) => void;
  appendLocalProgressEvent: (event: Omit<FocusProgressEvent, "source">) => void;
  workTitle: string;
  ownerLabel: string;
  summary: string;
  actionHint: string;
  currentStep: TaskPlanOverview["currentStep"];
  nextBatonAgentId: string | null;
  nextBatonLabel: string;
  shouldDispatchPublish: boolean;
};

export const ChatAutoDispatchController = memo(function ChatAutoDispatchController(
  input: ChatAutoDispatchControllerProps,
) {
  const activeDispatches = useConversationDispatches();
  const autoDispatchPlan = useMemo(
    () =>
      buildAutoDispatchPlan({
        company: input.company,
        dispatches: activeDispatches,
        workItemId: input.workItemId,
        currentActorId: input.fromActorId,
        workTitle: input.workTitle,
        ownerLabel: input.ownerLabel,
        summary: input.summary,
        actionHint: input.actionHint,
        currentStep: input.currentStep
          ? {
              id: input.currentStep.id,
              title: input.currentStep.title,
              assigneeAgentId: input.currentStep.assigneeAgentId,
              assigneeLabel: input.currentStep.assigneeLabel,
              detail: input.currentStep.detail ?? null,
            }
          : null,
        nextBatonAgentId: input.nextBatonAgentId,
        nextBatonLabel: input.nextBatonLabel,
        delegateToNextBaton:
          input.shouldDispatchPublish || shouldDelegateToNextBaton(input.currentStep?.title),
      }),
    [
      activeDispatches,
      input.actionHint,
      input.company,
      input.currentStep,
      input.fromActorId,
      input.nextBatonAgentId,
      input.nextBatonLabel,
      input.ownerLabel,
      input.shouldDispatchPublish,
      input.summary,
      input.workItemId,
      input.workTitle,
    ],
  );

  useChatAutoDispatch({
    plan: autoDispatchPlan,
    company: input.company,
    providerManifest: input.providerManifest,
    fromActorId: input.fromActorId,
    workItemId: input.workItemId,
    topicKey: input.topicKey,
    enabled: input.enabled,
    upsertDispatchRecord: input.upsertDispatchRecord,
    appendLocalProgressEvent: input.appendLocalProgressEvent,
  });

  return null;
});
