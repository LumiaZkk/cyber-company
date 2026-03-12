import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { FocusProgressEvent } from "../../../application/governance/chat-progress";
import type { RequirementSessionSnapshot } from "../../../domain/mission/requirement-snapshot";
import { useChatActionWatchSync } from "./useChatActionWatchSync";
import { useChatCompanySync } from "./useChatCompanySync";
import { useChatSessionRuntime, type ChatSessionRuntimeInput } from "./useChatSessionRuntime";
import type { FocusActionWatch } from "../view-models/focus";

type UseChatRuntimeEffectsInput = {
  agentId: string | null;
  shouldRunCompanySync: boolean;
  companySyncIntervalMs: number;
  companySessionSnapshotsRef: MutableRefObject<RequirementSessionSnapshot[]>;
  setHasBootstrappedCompanySync: (value: boolean) => void;
  setCompanySyncStale: (value: boolean, error?: string | null) => void;
  connected: boolean;
  isPageVisible: boolean;
  actionWatches: FocusActionWatch[];
  appendLocalProgressEvent: (event: Omit<FocusProgressEvent, "source">) => void;
  setActionWatches: Dispatch<SetStateAction<FocusActionWatch[]>>;
  syncCompanyCommunication: (options?: { force?: boolean }) => Promise<unknown>;
  shouldAutoScrollRef: MutableRefObject<boolean>;
  forceScrollOnNextUpdateRef: MutableRefObject<boolean>;
  programmaticScrollRef: MutableRefObject<boolean>;
  userScrollLockRef: MutableRefObject<boolean>;
  lastScrollTopRef: MutableRefObject<number>;
  lockedScrollTopRef: MutableRefObject<number | null>;
  chatSessionRuntime: ChatSessionRuntimeInput;
};

export function useChatRuntimeEffects(input: UseChatRuntimeEffectsInput) {
  const {
    agentId,
    shouldAutoScrollRef,
    forceScrollOnNextUpdateRef,
    programmaticScrollRef,
    userScrollLockRef,
    lastScrollTopRef,
    lockedScrollTopRef,
  } = input;

  useChatCompanySync({
    shouldRun: input.shouldRunCompanySync,
    intervalMs: input.companySyncIntervalMs,
    companySessionSnapshotsRef: input.companySessionSnapshotsRef,
    syncCompanyCommunication: input.syncCompanyCommunication,
    setHasBootstrappedCompanySync: input.setHasBootstrappedCompanySync,
    setCompanySyncStale: input.setCompanySyncStale,
  });

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    forceScrollOnNextUpdateRef.current = true;
    programmaticScrollRef.current = false;
    userScrollLockRef.current = false;
    lastScrollTopRef.current = 0;
    lockedScrollTopRef.current = null;
  }, [
    agentId,
    forceScrollOnNextUpdateRef,
    lastScrollTopRef,
    lockedScrollTopRef,
    programmaticScrollRef,
    shouldAutoScrollRef,
    userScrollLockRef,
  ]);

  useChatActionWatchSync({
    connected: input.connected,
    isPageVisible: input.isPageVisible,
    actionWatches: input.actionWatches,
    appendLocalProgressEvent: input.appendLocalProgressEvent,
    setActionWatches: input.setActionWatches,
    syncCompanyCommunication: input.syncCompanyCommunication,
  });

  useChatSessionRuntime(input.chatSessionRuntime);
}
