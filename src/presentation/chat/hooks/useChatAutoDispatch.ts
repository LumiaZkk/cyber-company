import { useEffect, useRef } from "react";
import type { AutoDispatchPlan } from "../../../application/assignment/dispatch-planning";
import { executeAutoDispatchPlan } from "../../../application/delegation/chat-auto-dispatch";
import type { ProviderManifest } from "../../../application/gateway";
import type { FocusProgressEvent } from "../../../application/governance/chat-progress";
import type { DispatchRecord } from "../../../domain/delegation/types";
import type { Company } from "../../../domain/org/types";

export function useChatAutoDispatch(input: {
  plan: AutoDispatchPlan | null;
  company: Company | null;
  providerManifest: ProviderManifest;
  fromActorId: string | null;
  workItemId: string | null;
  topicKey?: string | null;
  enabled: boolean;
  upsertDispatchRecord: (dispatch: DispatchRecord) => void;
  appendLocalProgressEvent: (event: FocusProgressEvent) => void;
}) {
  const inFlightRef = useRef<Set<string>>(new Set());
  const {
    plan,
    company,
    providerManifest,
    fromActorId,
    workItemId,
    topicKey,
    enabled,
    upsertDispatchRecord,
    appendLocalProgressEvent,
  } = input;

  useEffect(() => {
    if (
      !enabled ||
      !plan ||
      !company ||
      !fromActorId ||
      !workItemId
    ) {
      return;
    }

    if (inFlightRef.current.has(plan.dispatchId)) {
      return;
    }

    inFlightRef.current.add(plan.dispatchId);
    void (async () => {
      try {
        const result = await executeAutoDispatchPlan({
          company,
          providerManifest,
          plan,
          fromActorId,
          workItemId,
          topicKey,
        });
        upsertDispatchRecord(result.dispatch);
        appendLocalProgressEvent(result.progressEvent);
      } finally {
        inFlightRef.current.delete(plan.dispatchId);
      }
    })();
  }, [
    appendLocalProgressEvent,
    company,
    enabled,
    fromActorId,
    plan,
    providerManifest,
    topicKey,
    upsertDispatchRecord,
    workItemId,
  ]);
}
