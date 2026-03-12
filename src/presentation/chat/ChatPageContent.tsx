import { UploadCloud } from "lucide-react";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCompanyShellCommands } from "../../application/company/shell";
import { buildRequirementRoomHrefFromRecord } from "../../application/delegation/room-routing";
import { buildRequirementRoomRecordSignature } from "../../application/delegation/room-routing";
import { type RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import {
  doesConversationWorkItemMatch,
} from "../../application/mission/chat-work-item-state";
import { buildRequirementCollaborationSurface } from "../../application/mission/requirement-collaboration-surface";
import { selectPrimaryRequirementProjection } from "../../application/mission/requirement-aggregate";
import { buildPrimaryRequirementSurface } from "../../application/mission/primary-requirement-surface";
import { backfillRequirementRoomRecord } from "../../application/mission/requirement-room-backfill";
import { buildRequirementDecisionResolutionMessage } from "../../application/mission/requirement-decision-ticket";
import { ChatAutoDispatchController } from "./components/ChatAutoDispatchController";
import { ChatComposerFooter } from "./components/ChatComposerFooter";
import { ChatConversationWorkItemSync } from "./components/ChatConversationWorkItemSync";
import { ChatMessageFeed } from "./components/ChatMessageFeed";
import { ChatMissionStrip } from "./components/ChatMissionStrip";
import { ChatRequirementDraftCard } from "./components/ChatRequirementDraftCard";
import { ChatSessionHeader } from "./components/ChatSessionHeader";
import { ChatSummaryPanel } from "./components/ChatSummaryPanel";
import { ChatSyncStatusBanner } from "./components/ChatSyncStatusBanner";
import { ChatWaitingBanner } from "./components/ChatWaitingBanner";
import { useChatConversationTruth } from "./hooks/useChatConversationTruth";
import { useChatCompanySnapshots } from "./hooks/useChatCompanySnapshots";
import { useChatCoordinationActions } from "./hooks/useChatCoordinationActions";
import { useChatDisplayState } from "./hooks/useChatDisplayState";
import { useChatPageSurface } from "./hooks/useChatPageSurface";
import { useChatSessionHistory } from "./hooks/useChatSessionHistory";
import { useChatPanelState } from "./hooks/useChatPanelState";
import { useChatSignalState } from "./hooks/useChatSignalState";
import { useChatSessionContext } from "./hooks/useChatSessionContext";
import { useChatWorkspaceViewModel } from "./hooks/useChatWorkspaceViewModel";
import { useChatCollaborationSurface } from "./hooks/useChatCollaborationSurface";
import { useChatConversationSurface } from "./hooks/useChatConversationSurface";
import { useChatDragAndDrop } from "./hooks/useChatDragAndDrop";
import { useChatFocusAction } from "./hooks/useChatFocusAction";
import { useChatHistoryActions } from "./hooks/useChatHistoryActions";
import { useChatGovernanceState } from "./hooks/useChatGovernanceState";
import { useChatMissionSurface } from "./hooks/useChatMissionSurface";
import { useChatSend } from "./hooks/useChatSend";
import { useChatSessionReset } from "./hooks/useChatSessionReset";
import { useChatUploads } from "./hooks/useChatUploads";
import { useChatWorkbench } from "./hooks/useChatWorkbench";
import type {
  WorkItemRecord,
} from "../../domain/mission/types";
import {
  type ChatMessage,
} from "../../application/gateway";
import { useGatewayStore } from "../../application/gateway";
import { AgentOps } from "../../application/org/employee-ops";
import { trackChatRequirementMetric } from "../../application/telemetry/chat-requirement-metrics";
import { toast } from "../../components/system/toast-store";
import {
  appendCompanyScopeToChatRoute,
  buildCompanyChatRoute,
} from "../../lib/chat-routes";
import { usePageVisibility } from "../../lib/use-page-visibility";
import { useChatClosedLoop } from "./hooks/useChatClosedLoop";
import { useChatActionSurface } from "./hooks/useChatActionSurface";
import { useChatPreviewPersistence } from "./hooks/useChatPreviewPersistence";
import { useChatRuntimeEffects } from "./hooks/useChatRuntimeEffects";
import { useChatRouteCompanyState } from "./hooks/useChatRouteCompanyState";
import { buildRequirementPromotionSystemMessages } from "./view-models/promotion-system-events";
import {
  clearLiveChatSession,
  type LiveChatSessionState,
  upsertLiveChatSession,
} from "../../application/chat/live-session-cache";
import type { EmployeeRef } from "../../domain/org/types";

const CHAT_RENDER_WINDOW_STEP = 80;
const EMPTY_EMPLOYEES: EmployeeRef[] = [];

export function ChatPageScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    config,
    activeCompany,
    authorityBackedState,
    activeRoomRecords,
    activeMissionRecords,
    activeConversationStates,
    activeWorkItems,
    activeRequirementAggregates,
    activeRequirementEvidence,
    activeDecisionTickets,
    primaryRequirementId,
    activeRoundRecords,
    activeDispatches,
    activeRoomBindings,
    updateCompany,
    upsertTask,
    upsertHandoff,
    upsertRequest,
    upsertRoomRecord,
    upsertRoundRecord,
    deleteRoundRecord,
    appendRoomMessages,
    ensureRequirementRoomForAggregate,
    upsertRoomConversationBindings,
    upsertMissionRecord,
    setConversationCurrentWorkKey,
    setConversationDraftRequirement,
    clearConversationState,
    upsertWorkItemRecord,
    upsertDecisionTicketRecord,
    upsertDispatchRecord,
    replaceDispatchRecords,
  } = useChatWorkspaceViewModel();
  const { switchCompany } = useCompanyShellCommands();
  const providerId = useGatewayStore((state) => state.providerId);
  const connected = useGatewayStore((state) => state.connected);
  const providerCapabilities = useGatewayStore((state) => state.capabilities);
  const providerManifest = useGatewayStore((state) => state.manifest);
  const isPageVisible = usePageVisibility();

  const [sessionMessages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [runningFocusActionId, setRunningFocusActionId] = useState<string | null>(null);
  const [recoveringCommunication, setRecoveringCommunication] = useState(false);
  const [sessionSyncStale, setSessionSyncStale] = useState(false);
  const [sessionSyncError, setSessionSyncError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState<string | null>(null);
  const streamTextRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const pendingGenerationStartedAtRef = useRef<number | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const companySessionSnapshotsRef = useRef<RequirementSessionSnapshot[]>([]);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const forceScrollOnNextUpdateRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const userScrollLockRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const lastEnsuredRequirementRoomRef = useRef<string | null>(null);
  const lockedScrollTopRef = useRef<number | null>(null);
  const lastSyncedRoomSignatureRef = useRef<string | null>(null);
  const lastTrackedDraftKeyRef = useRef<string | null>(null);
  const lastTrackedAutoPromotionRef = useRef<string | null>(null);
  const lastTrackedStaleRef = useRef<string | null>(null);
  const [composerPrefill, setComposerPrefill] = useState<{ id: string | number; text: string } | null>(null);
  const [decisionSubmittingOptionId, setDecisionSubmittingOptionId] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<{ mimeType: string; dataUrl: string }[]>([]);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const endRef = useRef<HTMLDivElement>(null);

  const updateStreamText = useCallback((value: string | null) => {
    streamTextRef.current = value;
    startTransition(() => {
      setStreamText(value);
    });
  }, []);

  const {
    agentId,
    archiveId,
    groupMembers,
    groupTitle,
    groupTopic,
    groupTopicKey,
    groupWorkItemId,
    historyAgentId,
    isArchiveView,
    isGroup,
    productRoomId,
    routeComposerPrefill,
    routeCompanyConflictMessage,
    routeRoomId,
    routeWorkItemId,
    companyRouteReady,
    activeRequirementRoom,
    activeConversationState,
    effectiveGroupSessionKey,
    messages,
    targetAgentId,
    conversationStateKey: groupConversationStateKey,
  } = useChatRouteCompanyState({
    authorityBackedState,
    config,
    activeCompanyId: activeCompany?.id ?? null,
    activeRoomRecords,
    activeConversationStates,
    activeRoomBindings,
    sessionMessages,
    switchCompany,
    navigate,
    location,
  });

  const restoreGeneratingState = useCallback(
    (liveSession: Pick<LiveChatSessionState, "runId" | "streamText" | "isGenerating" | "startedAt"> | null) => {
      activeRunIdRef.current = liveSession?.runId ?? null;
      setActiveRunId(liveSession?.runId ?? null);
      pendingGenerationStartedAtRef.current = liveSession?.startedAt ?? null;
      updateStreamText(liveSession?.streamText ?? null);
      setIsGenerating(Boolean(liveSession?.isGenerating));
    },
    [updateStreamText],
  );

  const clearGeneratingState = useCallback(
    (options?: { preserveRuntime?: boolean }) => {
      activeRunIdRef.current = null;
      setActiveRunId(null);
      pendingGenerationStartedAtRef.current = null;
      updateStreamText(null);
      setIsGenerating(false);
      if (!options?.preserveRuntime) {
        clearLiveChatSession(activeCompany?.id, sessionKey);
      }
    },
    [activeCompany?.id, sessionKey, updateStreamText],
  );

  const beginGeneratingState = useCallback(
    (
      startedAt: number,
      options?: { runId?: string | null; streamText?: string | null; persist?: boolean },
    ) => {
      const nextRunId = options && "runId" in options ? options.runId ?? null : activeRunIdRef.current;
      const nextStreamText =
        options && "streamText" in options ? options.streamText ?? null : streamTextRef.current;
      activeRunIdRef.current = nextRunId;
      setActiveRunId(nextRunId);
      pendingGenerationStartedAtRef.current = startedAt;
      updateStreamText(nextStreamText ?? null);
      setIsGenerating(true);
      if (options?.persist === false) {
        return;
      }
      upsertLiveChatSession(activeCompany?.id, sessionKey, {
        sessionKey: sessionKey ?? "",
        agentId: targetAgentId,
        runId: nextRunId,
        streamText: nextStreamText ?? null,
        isGenerating: true,
        startedAt,
        updatedAt: Date.now(),
      });
    },
    [activeCompany?.id, sessionKey, targetAgentId, updateStreamText],
  );
  const conversationStateKey = isGroup
    ? groupConversationStateKey
    : sessionKey ?? historyAgentId ?? targetAgentId ?? null;

  const {
    companySessionSnapshots,
    companySyncError,
    companySyncStale,
    setCompanySessionSnapshots,
    setHasBootstrappedCompanySync,
    setCompanySyncStale,
  } = useChatCompanySnapshots(activeCompany?.id ?? null);
  const {
    displayWindowSize,
    roomBroadcastMode,
    expandDisplayWindow,
    setRoomBroadcastMode,
  } = useChatDisplayState({
    agentId,
    archiveId,
    historyAgentId,
    productRoomId: routeRoomId ?? routeWorkItemId ?? null,
    sessionKey,
  });
  const {
    isHistoryMenuOpen,
    isSummaryOpen,
    isTechnicalSummaryOpen,
    summaryPanelView,
    setIsHistoryMenuOpen,
    setIsSummaryOpen,
    setIsTechnicalSummaryOpen,
    setSummaryPanelView,
    openSummaryPanel,
  } = useChatPanelState(sessionKey);
  const {
    recentAgentSessions,
    recentArchivedRounds,
    archiveHistoryNotice,
    historyLoading,
    incrementHistoryRefreshNonce,
    setRecentAgentSessions,
    setRecentArchivedRounds,
  } = useChatSessionHistory({
    connected,
    historyAgentId,
    isGroup,
    isHistoryMenuOpen,
    isArchiveView,
    sessionKey,
    supportsSessionHistory: providerCapabilities.sessionHistory,
    supportsSessionArchives: providerCapabilities.sessionArchives,
  });
  const {
    localProgressEvents,
    actionWatches,
    setLocalProgressEvents,
    setActionWatches,
    appendLocalProgressEvent,
  } = useChatSignalState(sessionKey);

  const {
    uploadingFile,
    processTextFileUpload,
    processImageFile,
    handleFileSelect,
  } = useChatUploads({
    isGroup,
    groupMembers,
    agentId,
    setComposerPrefill,
    setAttachments,
  });
  const { isDragging, handleDragOver, handleDragLeave, handleDrop } = useChatDragAndDrop({
    processTextFileUpload,
    processImageFile,
  });

  const isNearBottom = useCallback((element: HTMLElement | null): boolean => {
    if (!element) {
      return true;
    }
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    return distanceToBottom <= 120;
  }, []);

  const markScrollIntent = useCallback((mode: "preserve" | "follow" = "preserve") => {
    if (mode === "follow") {
      userScrollLockRef.current = false;
      shouldAutoScrollRef.current = true;
      forceScrollOnNextUpdateRef.current = true;
      lockedScrollTopRef.current = null;
      return;
    }

    shouldAutoScrollRef.current = isNearBottom(scrollContainerRef.current);
    forceScrollOnNextUpdateRef.current = false;
  }, [isNearBottom]);

  const setProgrammaticScrollLock = useCallback((locked: boolean) => {
    programmaticScrollRef.current = locked;
    if (locked) {
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    }
  }, []);

  useEffect(() => {
    companySessionSnapshotsRef.current = companySessionSnapshots;
  }, [companySessionSnapshots]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const supportsSessionHistory = providerCapabilities.sessionHistory;
  const supportsSessionArchiveRestore = providerCapabilities.sessionArchiveRestore;
  useEffect(() => {
    lastSyncedRoomSignatureRef.current = null;
  }, [activeCompany?.id, sessionKey, archiveId]);
  const lastRouteConflictRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routeCompanyConflictMessage || lastRouteConflictRef.current === routeCompanyConflictMessage) {
      return;
    }
    lastRouteConflictRef.current = routeCompanyConflictMessage;
    toast.error("聊天路由冲突", routeCompanyConflictMessage);
  }, [routeCompanyConflictMessage]);
  const {
    activeArchivedRound,
    ceoSurface,
    handoffPreview,
    historyRoundItems,
    historySessionPresentations,
    isCeoSession,
    isFreshConversation,
    isRequirementBootstrapPending,
    latestMessageTimestamp,
    localSlaFallbackAlerts,
    nextOpenTaskStepAgentId,
    nextOpenTaskStepLabel,
    orgAdvisor,
    previewTimestamp,
    productArchivedRounds,
    relatedSlaAlerts,
    requestHealth,
    requestPreview,
    requirementRoomMentionCandidates,
    requirementRoomSessionKeys,
    requirementRoomSessions,
    requirementRoomSnapshotAgentIds,
    requirementRoomSnapshots,
    requirementRoomTargetAgentIds,
    sessionExecution,
    structuredTaskPreview,
    summaryAlertCount,
    takeoverPack,
    targetEmployee: emp,
  } = useChatSessionContext({
    activeCompany,
    activeConversationState,
    activeRequirementRoom,
    activeRoomBindings,
    activeRoomRecords,
    activeRoundRecords,
    archiveHistoryNotice,
    archiveId,
    companySessionSnapshots,
    connected,
    currentTime,
    effectiveGroupSessionKey,
    groupMembers,
    groupTitle,
    groupWorkItemId,
    historyAgentId,
    isArchiveView,
    isGenerating,
    isGroup,
    loading,
    messages,
    recentAgentSessions,
    recentArchivedRounds,
    routeRoomId,
    sessionKey,
    streamText,
    targetAgentId,
  });
  const {
    currentConversationRequirementHint,
    preferredConversationTopicKey,
    requirementOverview,
    requirementProgressGroups,
    latestDirectTurnSummary,
    ceoReplyExplicitlyRequestsNewTask,
    preferredConversationWorkKey,
    previewConversationWorkItem,
    shouldPreferPreviewConversationWorkItem,
    persistedWorkItem,
    linkedRequirementRoom,
    effectiveRequirementRoom,
    roomBoundWorkItem,
    stableDisplayWorkItem,
    effectiveRequirementRoomSnapshots,
    hasStableConversationWorkItem,
    shouldUsePersistedWorkItemPrimaryView,
    stableDisplayPrimaryView,
    taskPlanOverview,
    requirementTeam,
  } = useChatConversationSurface({
    activeCompany,
    activeConversationState,
    activeRequirementRoom,
    activeRoomRecords,
    activeWorkItems,
    activeRequirementAggregates,
    primaryRequirementId,
    companySessionSnapshots,
    requirementRoomSnapshots,
    requirementRoomSnapshotAgentIds,
    requestPreview,
    handoffPreview,
    structuredTaskPreview,
    messages,
    currentTime,
    historyAgentId,
    sessionKey,
    productRoomId,
    groupTopicKey,
    groupWorkItemId,
    isGroup,
    isCeoSession,
    isFreshConversation,
    isRequirementBootstrapPending,
    isSummaryOpen,
    summaryPanelView,
  });
  const primaryRequirementProjection = useMemo(
    () =>
      selectPrimaryRequirementProjection({
        company: activeCompany,
        activeRequirementAggregates,
        primaryRequirementId,
        activeWorkItems,
        activeRoomRecords,
      }),
    [
      activeCompany,
      activeRequirementAggregates,
      activeRoomRecords,
      activeWorkItems,
      primaryRequirementId,
    ],
  );
  const primaryRequirementSurface = useMemo(
    () =>
      activeCompany
        ? buildPrimaryRequirementSurface({
            company: activeCompany,
            activeConversationStates,
            activeWorkItems,
            activeRequirementAggregates,
            activeRequirementEvidence,
            activeDecisionTickets,
            primaryRequirementId,
            activeRoomRecords,
            companySessions: [],
            companySessionSnapshots,
            currentTime,
            ceoAgentId:
              activeCompany.employees.find((employee) => employee.metaRole === "ceo")?.agentId ?? null,
          })
        : null,
    [
      activeCompany,
      activeConversationStates,
      activeDecisionTickets,
      activeRequirementAggregates,
      activeRequirementEvidence,
      activeRoomRecords,
      activeWorkItems,
      companySessionSnapshots,
      currentTime,
      primaryRequirementId,
    ],
  );
  const settledRequirementAggregate = primaryRequirementProjection.aggregate;
  const requirementCollaborationSurface = useMemo(
    () =>
      isGroup
        ? buildRequirementCollaborationSurface({
            company: activeCompany,
            surface: primaryRequirementSurface,
            roomMessages: messages,
          })
        : null,
    [activeCompany, isGroup, messages, primaryRequirementSurface],
  );
  const showSettledRequirementCard =
    !isArchiveView &&
    !isGroup &&
    isCeoSession &&
    Boolean(settledRequirementAggregate);
  const settledRequirementSummary =
    stableDisplayWorkItem?.displaySummary ??
    stableDisplayWorkItem?.summary ??
    requirementOverview?.summary ??
    settledRequirementAggregate?.summary ??
    "CEO 已经把这件事收敛成一条可推进的主线。";
  const settledRequirementNextAction =
    stableDisplayWorkItem?.displayNextAction ??
    stableDisplayWorkItem?.nextAction ??
    settledRequirementAggregate?.nextAction ??
    "进入需求中心继续推进。";
  const doesWorkItemMatchCurrentConversation = useCallback(
    (item: WorkItemRecord | null | undefined) =>
      doesConversationWorkItemMatch({
        item,
        preferredConversationTopicKey,
        preferredConversationWorkKey,
      }),
    [preferredConversationTopicKey, preferredConversationWorkKey],
  );
  const {
    focusSummary,
    isChapterExecutionRequirement,
    requirementTechParticipant,
    shouldAdvanceToNextPhase,
    shouldDirectToTechDispatch,
    shouldDispatchPublish,
    publishDispatchTargetAgentId,
    publishDispatchTargetLabel,
    hasTechnicalSummary,
    hasContextSummary,
    sessionProgressEvents,
  } = useChatGovernanceState({
    activeCompany,
    targetAgentId,
    targetRoleLabel: isGroup ? "多人协作会话" : emp?.role ?? "会话",
    isGroup,
    isCeoSession,
    isFreshConversation,
    sessionKey,
    summaryAlertCount,
    sessionExecution,
    structuredTaskPreview: structuredTaskPreview ?? null,
    requestPreview,
    handoffPreview,
    takeoverPack,
    ceoSurface: ceoSurface ?? null,
    alerts: [...relatedSlaAlerts, ...localSlaFallbackAlerts],
    requirementOverview,
    taskPlanOverview,
    messages,
  });
  const syncCompanyCommunication = useChatClosedLoop({
    activeCompany,
    previousSnapshotsRef: companySessionSnapshotsRef,
    setCompanySessionSnapshots,
    replaceDispatchRecords,
    updateCompany,
  });
  const {
    recentProgressEvents,
    latestProgressEvent,
    latestBlockingProgressEvent,
    currentTimelineItem,
    focusActions,
    collaborationLifecycle,
    summaryRecoveryAction,
  } = useChatCollaborationSurface({
    activeCompany,
    structuredTaskPreview,
    localProgressEvents,
    sessionProgressEvents,
    requestPreview,
    handoffPreview,
    previewTimestamp,
    takeoverPack,
    nextOpenTaskStepLabel,
    nextOpenTaskStepAgentId,
    targetAgentId,
    focusSummary,
    sessionKey,
    structuredTaskOwnerAgentId: structuredTaskPreview?.ownerAgentId ?? null,
    summaryAlertCount,
  });

  const {
    workbenchTone,
    workbenchOwnerAgentId,
    workbenchOwnerLabel,
    workbenchStage,
    workbenchStatusLabel,
    workbenchHeadline,
    workbenchSummary,
    workbenchActionHint,
    workbenchOpenAction,
  } = useChatWorkbench({
    activeCompany,
    latestBlockingProgressEvent,
    currentTimelineItem,
    focusSummary,
    latestProgressEvent,
    sessionExecutionActionable: sessionExecution.actionable,
    focusActions,
    targetAgentId,
  });
  const {
    strategicDirectParticipantView,
    persistedConversationMission,
    requirementRoomSummary,
    missionSurface,
  } = useChatMissionSurface({
    activeCompany,
    activeMissionRecords,
    sessionKey,
    productRoomId,
    groupTopicKey,
    effectiveRequirementRoom,
    roomBoundWorkItem,
    persistedWorkItem,
    groupTitle,
    messages,
    requirementRoomTargetAgentIds,
    requirementRoomSessionCount: requirementRoomSessions.length,
    targetAgentId,
    isGroup,
    isFreshConversation,
    isRequirementBootstrapPending,
    isCeoSession,
    isChapterExecutionRequirement,
    ceoLabel: emp?.nickname ?? "CEO",
    stableDisplayWorkItem,
    stableDisplayPrimaryView,
    requirementOverview,
    requirementProgressGroups,
    taskPlanOverview,
    shouldAdvanceToNextPhase,
    shouldDispatchPublish,
    shouldDirectToTechDispatch,
    publishDispatchTargetAgentId,
    publishDispatchTargetLabel,
    requirementTeam,
    workbenchHeadline,
    workbenchOwnerAgentId,
    workbenchOwnerLabel,
    workbenchStage,
    workbenchSummary,
    workbenchActionHint,
    workbenchStatusLabel,
    workbenchTone,
    hasStableConversationWorkItem,
    shouldUsePersistedWorkItemPrimaryView,
    structuredTaskTitle: structuredTaskPreview?.title ?? null,
  });
  const {
    shouldUseTaskPlanPrimaryView,
    effectiveOwnerAgentId,
    effectiveOwnerLabel,
    effectiveStepLabel,
    effectiveStage,
    effectiveStatusLabel,
    effectiveSummary,
    effectiveActionHint,
    effectiveHeadline,
    effectiveTone,
    displayPlanCurrentStep,
    canonicalNextBatonAgentId,
    canonicalNextBatonLabel,
    displayNextBatonLabel,
    displayNextBatonAgentId,
    missionIsCompleted,
    conversationMission,
    shouldPreferPersistedConversationMission,
    activeConversationMission,
  } = missionSurface;
  const {
    conversationMissionRecord,
    shouldPersistConversationTruth,
    conversationDraftRequirement,
  } = useChatConversationTruth({
    isGroup,
    isCeoSession,
    sessionKey,
    isArchiveView,
    isFreshConversation,
    isRequirementBootstrapPending,
    latestMessageTimestamp,
    effectiveRequirementRoom,
    requirementOverview,
    persistedWorkItem,
    persistedConversationMission,
    conversationMission,
    hasStableConversationWorkItem,
    shouldPreferPersistedConversationMission,
    groupTopicKey,
    productRoomId,
    effectiveOwnerAgentId,
    displayNextBatonAgentId,
    missionIsCompleted,
    activeCompany,
    authorityBackedState,
    activeRoomRecords,
    activeConversationState,
    requirementTeam: requirementTeam
      ? {
          title: requirementTeam.title,
          topicKey: requirementTeam.topicKey,
          memberIds: requirementTeam.memberIds,
          ownerAgentId: requirementTeam.ownerAgentId,
        }
      : null,
    groupWorkItemId,
    targetAgentId,
    effectiveRequirementRoomSnapshots,
    upsertMissionRecord,
    upsertWorkItemRecord,
    upsertRoomRecord,
    setConversationCurrentWorkKey,
    setConversationDraftRequirement,
    conversationStateKey,
    messages,
    structuredTaskPreview,
    previewConversationWorkItem,
    shouldPreferPreviewConversationWorkItem,
    ceoReplyExplicitlyRequestsNewTask,
    doesWorkItemMatchCurrentConversation,
    lastSyncedRoomSignatureRef,
  });
  const {
    detailActions,
    displayRequirementLifecycleSections,
    displayRequirementProgressGroups,
    headerStatusBadgeClass,
    primaryOpenAction,
    teamGroupRoute,
    currentConversationWorkItemId,
    currentConversationTopicKey,
    buildTeamAdjustmentAction,
  } = useChatActionSurface({
    activeCompany,
    activeRoomRecords,
    linkedRequirementRoom,
    stableDisplayWorkItem,
    stableDisplayPrimaryView,
    strategicDirectParticipantView,
    requirementOverview,
    requirementProgressGroups,
    requirementRoomSummary,
    requirementTeam,
    persistedWorkItem,
    conversationMissionRecord,
    groupWorkItemId,
    groupTopicKey,
    targetAgentId,
    sessionKey,
    isGroup,
    isCeoSession,
    isFreshConversation,
    isRequirementBootstrapPending,
    isSummaryOpen,
    summaryPanelView,
    currentTime,
    actionWatches,
    workbenchOpenAction,
    focusActions,
    summaryRecoveryAction,
    taskPlanOverview,
    displayPlanCurrentStep,
    canonicalNextBatonAgentId,
    canonicalNextBatonLabel,
    displayNextBatonLabel,
    displayNextBatonAgentId,
    missionIsCompleted,
    shouldUseTaskPlanPrimaryView,
    effectiveOwnerAgentId,
    effectiveOwnerLabel,
    effectiveStage,
    effectiveStatusLabel,
    effectiveSummary,
    effectiveActionHint,
    effectiveHeadline,
    effectiveTone,
    shouldAdvanceToNextPhase,
    shouldDispatchPublish,
    shouldDirectToTechDispatch,
    publishDispatchTargetAgentId,
    publishDispatchTargetLabel,
    requirementTechParticipant,
    focusSummaryOwnerRole: focusSummary.ownerRole,
  });
  const resolvedRequirementRoom = linkedRequirementRoom ?? primaryRequirementSurface?.room ?? null;
  const showRequirementTeamEntryResolved = Boolean(
    !isArchiveView &&
      !isGroup &&
      primaryRequirementSurface?.aggregateId,
  );
  const { handleCopyTakeoverPack, handleRecoverCommunication } = useChatCoordinationActions({
    takeoverPack: takeoverPack ? { operatorNote: takeoverPack.operatorNote } : null,
    activeCompanyId: activeCompany?.id ?? null,
    syncCompanyCommunication,
    appendLocalProgressEvent,
    setIsSummaryOpen,
    setRecoveringCommunication,
  });
  const handleFocusAction = useChatFocusAction({
    activeCompany,
    providerManifest,
    sessionKey,
    targetAgentId,
    currentConversationWorkItemId,
    currentConversationTopicKey,
    focusSummaryOwnerLabel: focusSummary.ownerLabel,
    isGroup,
    routeCompanyConflictMessage,
    appendLocalProgressEvent,
    upsertDispatchRecord,
    setActionWatches,
    setRunningFocusActionId,
    setIsSummaryOpen,
    handleCopyTakeoverPack,
    handleRecoverCommunication,
    navigateToHref: (href) => navigate(appendCompanyScopeToChatRoute(href, activeCompany?.id)),
  });
  const isSyncStale = companySyncStale || sessionSyncStale;
  const syncStaleDetail = sessionSyncError ?? companySyncError ?? null;
  const openRequirementRoom = useCallback(() => {
    if (activeCompany && primaryRequirementSurface?.aggregateId) {
      const ensuredRoom = ensureRequirementRoomForAggregate(primaryRequirementSurface.aggregateId);
      if (ensuredRoom) {
        navigate(buildRequirementRoomHrefFromRecord(ensuredRoom));
        return;
      }
    }
    if (resolvedRequirementRoom) {
      navigate(buildRequirementRoomHrefFromRecord(resolvedRequirementRoom));
      return;
    }
    if (teamGroupRoute) {
      navigate(teamGroupRoute);
      return;
    }
    openSummaryPanel("team");
  }, [
    activeCompany,
    ensureRequirementRoomForAggregate,
    navigate,
    openSummaryPanel,
    primaryRequirementSurface?.aggregateId,
    resolvedRequirementRoom,
    teamGroupRoute,
  ]);
  const shouldShowDraftCard = Boolean(
    !isArchiveView &&
      !authorityBackedState &&
      !isGroup &&
      isCeoSession &&
      conversationDraftRequirement &&
      !showSettledRequirementCard &&
      ["draft_ready", "awaiting_promotion_choice", "promoted_manual", "promoted_auto"].includes(
        conversationDraftRequirement.state,
      ),
  );
  const openRequirementDecisionTicket =
    !isArchiveView && (isGroup || isCeoSession)
      ? primaryRequirementSurface?.openDecisionTicket ?? null
      : null;
  const isStructuredRequirementDecisionPending = Boolean(
    openRequirementDecisionTicket?.requiresHuman,
  );
  const isLegacyRequirementDecisionPending = Boolean(
    !openRequirementDecisionTicket &&
      primaryRequirementSurface?.stageGateStatus === "waiting_confirmation",
  );
  const resolvedAuthorityOwnerLabel =
    primaryRequirementSurface?.ownerLabel ?? effectiveOwnerLabel;
  const resolvedAuthorityStepLabel =
    primaryRequirementSurface?.currentStep ?? effectiveStepLabel;
  const resolvedAuthoritySummary =
    primaryRequirementSurface?.summary ?? effectiveSummary;
  const resolvedAuthorityNextBatonLabel =
    primaryRequirementSurface?.nextBatonLabel ?? displayNextBatonLabel;
  const resolvedAuthorityNextBatonAgentId =
    primaryRequirementSurface?.nextBatonActorId ?? displayNextBatonAgentId;
  const isCurrentRoomPrimaryAction = Boolean(
    isGroup &&
      resolvedRequirementRoom &&
      primaryOpenAction?.href &&
      primaryOpenAction.href === buildRequirementRoomHrefFromRecord(resolvedRequirementRoom),
  );
  const isRequirementRoomPrimaryAction = Boolean(
    primaryOpenAction &&
      (/需求房间/.test(primaryOpenAction.label) || /需求团队/.test(primaryOpenAction.label)),
  );
  const displayRequirementHeadline =
    primaryRequirementSurface?.title ??
    (isGroup ? groupTitle : null) ??
    effectiveHeadline;
  const isManualConfirmationPending =
    isStructuredRequirementDecisionPending || isLegacyRequirementDecisionPending;
  const chatSurfaceHeadline = displayRequirementHeadline;
  const chatSurfaceStatusLabel = isStructuredRequirementDecisionPending
    ? "待你确认"
    : isLegacyRequirementDecisionPending
      ? "待确认"
      : effectiveStatusLabel;
  const chatSurfaceOwnerLabel = resolvedAuthorityOwnerLabel;
  const chatSurfaceStepLabel = isStructuredRequirementDecisionPending
    ? openRequirementDecisionTicket?.decisionType === "requirement_change"
      ? "需求变更待确认"
      : "待你确认下一步"
    : isLegacyRequirementDecisionPending
      ? "等待 CEO 补发结构化选项"
    : resolvedAuthorityStepLabel;
  const chatSurfaceStage = isStructuredRequirementDecisionPending
    ? "待你确认"
    : isLegacyRequirementDecisionPending
      ? "待确认"
      : resolvedAuthorityStepLabel;
  const chatSurfaceSummary = isStructuredRequirementDecisionPending
    ? openRequirementDecisionTicket?.summary ?? resolvedAuthoritySummary ?? settledRequirementSummary
    : isLegacyRequirementDecisionPending
      ? resolvedAuthoritySummary ?? "当前主线停在待确认状态，但这轮还没有可操作的结构化决策选项。"
    : resolvedAuthoritySummary;
  const chatSurfaceNextBatonLabel = isManualConfirmationPending ? "你" : resolvedAuthorityNextBatonLabel;
  const chatSurfaceNextBatonAgentId = isManualConfirmationPending ? null : resolvedAuthorityNextBatonAgentId;
  const chatSurfaceActionHint = isStructuredRequirementDecisionPending
    ? "请直接在对应 CEO 回复下方完成结构化决策。状态会以票据形式持久化，不再依赖聊天文本猜测。"
    : isLegacyRequirementDecisionPending
      ? "当前还没有可点选的决策票。只有 CEO 补发结构化决策后，消息下方才会出现选项按钮。"
      : effectiveActionHint;
  const chatSurfaceTone = isStructuredRequirementDecisionPending
    ? "amber"
    : isLegacyRequirementDecisionPending
      ? "slate"
      : effectiveTone;
  const chatSurfacePrimaryOpenAction =
    isStructuredRequirementDecisionPending ||
    isCurrentRoomPrimaryAction ||
    (isGroup && isRequirementRoomPrimaryAction)
      ? null
      : primaryOpenAction;
  const chatSurfaceSettledRequirementNextAction = isStructuredRequirementDecisionPending
    ? "请先完成当前待决策事项。"
    : isLegacyRequirementDecisionPending
      ? "请让 CEO 补发结构化决策选项后再继续。"
      : settledRequirementNextAction;
  const displayGroupTitle = isGroup
    ? primaryRequirementSurface?.title ?? groupTitle
    : groupTitle;
  const displayGroupSubtitle = isGroup
    ? [
        requirementCollaborationSurface?.phaseLabel
          ? `阶段：${requirementCollaborationSurface.phaseLabel}`
          : chatSurfaceStepLabel
            ? `阶段：${chatSurfaceStepLabel}`
            : null,
        requirementCollaborationSurface?.currentBlocker
          ? `当前卡点：${requirementCollaborationSurface.currentBlocker}`
          : null,
        requirementCollaborationSurface?.latestConclusionSummary ??
          primaryRequirementSurface?.latestReportSummary ??
          primaryRequirementSurface?.summary ??
          null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" · ") || "多人协作需求房"
    : null;
  const promotionActionLabel =
    !authorityBackedState &&
    conversationDraftRequirement &&
    ["draft_ready", "awaiting_promotion_choice"].includes(conversationDraftRequirement.state)
      ? "确认并转为需求"
      : null;
  const handlePromoteRequirementDraft = useCallback(() => {
    if (!conversationStateKey || !conversationDraftRequirement) {
      return;
    }
    setConversationDraftRequirement(conversationStateKey, {
      ...conversationDraftRequirement,
      state: "promoted_manual",
      promotionReason: "manual_confirmation",
      promotable: true,
      updatedAt: Date.now(),
    });
    trackChatRequirementMetric({
      companyId: activeCompany?.id ?? null,
      conversationId: conversationStateKey,
      requirementId: persistedWorkItem?.id ?? conversationMissionRecord?.id ?? null,
      name: "draft_requirement_promoted_manual",
    });
    toast.success("已转为需求", "后续会自动绑定需求房和工作看板。");
  }, [
    activeCompany?.id,
    conversationDraftRequirement,
    conversationMissionRecord?.id,
    conversationStateKey,
    persistedWorkItem?.id,
    setConversationDraftRequirement,
  ]);
  const handleContinueDraftChat = useCallback(() => {
    if (!conversationStateKey || !conversationDraftRequirement) {
      return;
    }
    setConversationDraftRequirement(conversationStateKey, {
      ...conversationDraftRequirement,
      state:
        conversationDraftRequirement.state === "draft_ready"
          ? "awaiting_promotion_choice"
          : conversationDraftRequirement.state,
      updatedAt: Date.now(),
    });
    trackChatRequirementMetric({
      companyId: activeCompany?.id ?? null,
      conversationId: conversationStateKey,
      requirementId: persistedWorkItem?.id ?? conversationMissionRecord?.id ?? null,
      name: "draft_requirement_continue_chat",
    });
  }, [
    activeCompany?.id,
    conversationDraftRequirement,
    conversationMissionRecord?.id,
    conversationStateKey,
    persistedWorkItem?.id,
    setConversationDraftRequirement,
  ]);
  const displayMessages = useMemo(
    () =>
      [...messages, ...buildRequirementPromotionSystemMessages({
        draftRequirement: conversationDraftRequirement,
      })].sort((left, right) => {
        const leftTimestamp = typeof left.timestamp === "number" ? left.timestamp : 0;
        const rightTimestamp = typeof right.timestamp === "number" ? right.timestamp : 0;
        if (leftTimestamp !== rightTimestamp) {
          return leftTimestamp - rightTimestamp;
        }
        if (left.role === right.role) {
          return 0;
        }
        return left.role === "system" ? 1 : -1;
      }),
    [conversationDraftRequirement, messages],
  );

  useEffect(() => {
    if (!conversationDraftRequirement || !shouldShowDraftCard) {
      return;
    }
    const draftKey = `${conversationStateKey ?? "none"}:${conversationDraftRequirement.updatedAt}:${conversationDraftRequirement.state}`;
    if (lastTrackedDraftKeyRef.current === draftKey) {
      return;
    }
    lastTrackedDraftKeyRef.current = draftKey;
    trackChatRequirementMetric({
      companyId: activeCompany?.id ?? null,
      conversationId: conversationStateKey,
      requirementId: persistedWorkItem?.id ?? conversationMissionRecord?.id ?? null,
      name: "draft_requirement_shown",
      metadata: {
        state: conversationDraftRequirement.state,
      },
    });
  }, [
    activeCompany?.id,
    conversationDraftRequirement,
    conversationMissionRecord?.id,
    conversationStateKey,
    persistedWorkItem?.id,
    shouldShowDraftCard,
  ]);

  useEffect(() => {
    if (!conversationDraftRequirement) {
      return;
    }
    if (
      !["promoted_auto", "active_requirement"].includes(conversationDraftRequirement.state) ||
      conversationDraftRequirement.promotionReason === "manual_confirmation"
    ) {
      return;
    }
    const promotionKey = `${conversationStateKey ?? "none"}:${conversationDraftRequirement.updatedAt}:${conversationDraftRequirement.promotionReason ?? "auto"}`;
    if (lastTrackedAutoPromotionRef.current === promotionKey) {
      return;
    }
    lastTrackedAutoPromotionRef.current = promotionKey;
    trackChatRequirementMetric({
      companyId: activeCompany?.id ?? null,
      conversationId: conversationStateKey,
      requirementId: persistedWorkItem?.id ?? conversationMissionRecord?.id ?? null,
      name: "draft_requirement_promoted_auto",
      metadata: {
        reason: conversationDraftRequirement.promotionReason ?? "auto",
      },
    });
  }, [
    activeCompany?.id,
    conversationDraftRequirement,
    conversationMissionRecord?.id,
    conversationStateKey,
    persistedWorkItem?.id,
  ]);

  useEffect(() => {
    if (!isSyncStale) {
      lastTrackedStaleRef.current = null;
      return;
    }
    const staleKey = `${conversationStateKey ?? "none"}:${syncStaleDetail ?? "stale"}`;
    if (lastTrackedStaleRef.current === staleKey) {
      return;
    }
    lastTrackedStaleRef.current = staleKey;
    trackChatRequirementMetric({
      companyId: activeCompany?.id ?? null,
      conversationId: conversationStateKey,
      requirementId: persistedWorkItem?.id ?? conversationMissionRecord?.id ?? null,
      name: "sync_stale_warning_shown",
      metadata: {
        detail: syncStaleDetail ?? "stale",
      },
    });
  }, [
    activeCompany?.id,
    conversationMissionRecord?.id,
    conversationStateKey,
    isSyncStale,
    persistedWorkItem?.id,
    syncStaleDetail,
  ]);

  useEffect(() => {
    setSessionSyncStale(false);
    setSessionSyncError(null);
  }, [activeCompany?.id, sessionKey]);

  useEffect(() => {
    if (
      !authorityBackedState ||
      !activeCompany ||
      !primaryRequirementSurface?.aggregateId ||
      primaryRequirementSurface.roomStatus === "ready"
    ) {
      return;
    }
    const ensureKey = `${activeCompany.id}:${primaryRequirementSurface.aggregateId}`;
    if (lastEnsuredRequirementRoomRef.current === ensureKey) {
      return;
    }
    lastEnsuredRequirementRoomRef.current = ensureKey;
    ensureRequirementRoomForAggregate(primaryRequirementSurface.aggregateId);
  }, [
    activeCompany,
    authorityBackedState,
    ensureRequirementRoomForAggregate,
    primaryRequirementSurface?.aggregateId,
    primaryRequirementSurface?.roomStatus,
  ]);

  useEffect(() => {
    if (!activeCompany || !primaryRequirementSurface?.aggregate || !resolvedRequirementRoom) {
      return;
    }
    const backfilledRoom = backfillRequirementRoomRecord({
      company: activeCompany,
      aggregate: primaryRequirementSurface.aggregate,
      workItem: primaryRequirementSurface.workItem,
      room: resolvedRequirementRoom,
      dispatches: activeDispatches,
      requests: activeCompany.requests ?? [],
      evidence: activeRequirementEvidence,
      snapshots: companySessionSnapshots.filter((snapshot) =>
        primaryRequirementSurface.roomMemberIds.includes(snapshot.agentId),
      ),
    });
    const existingSignature = buildRequirementRoomRecordSignature(resolvedRequirementRoom);
    const nextSignature = buildRequirementRoomRecordSignature(backfilledRoom);
    if (
      nextSignature === existingSignature ||
      nextSignature === lastSyncedRoomSignatureRef.current
    ) {
      return;
    }
    lastSyncedRoomSignatureRef.current = nextSignature;
    upsertRoomRecord(backfilledRoom);
  }, [
    activeCompany,
    activeDispatches,
    activeRequirementEvidence,
    companySessionSnapshots,
    primaryRequirementSurface,
    resolvedRequirementRoom,
    upsertRoomRecord,
  ]);

  useChatPreviewPersistence({
    activeCompanyId: activeCompany?.id ?? null,
    sessionKey,
    isArchiveView,
    handoffPreview,
    requestPreview,
    upsertHandoff,
    upsertRequest,
  });
  const {
    canShowSessionHistory,
    archiveSectionNotice,
    shouldRunCompanySync,
    companySyncIntervalMs,
    displayItems,
    hiddenDisplayItemCount,
    visibleDisplayItems,
    progressGroupSummary,
    latestProgressDisplay,
    actionWatchCards,
    hasActiveRun,
    teamMemberCards,
    emptyStateText,
  } = useChatPageSurface({
    authorityBackedState,
    isGroup,
    sessionKey,
    recentAgentSessionsLength: recentAgentSessions.length,
    historyRoundItemsLength: historyRoundItems.length,
    archiveHistoryNotice,
    hasActiveCompany: Boolean(activeCompany),
    connected,
    isPageVisible,
    isArchiveView,
    isSummaryOpen,
    actionWatches,
    isCeoSession,
    effectiveRequirementRoom,
    roomBoundWorkItem,
    persistedWorkItem,
    messages: displayMessages,
    displayWindowSize,
    displayRequirementProgressGroups,
    latestProgressEvent,
    runningFocusActionId,
    requirementTeam,
    buildTeamAdjustmentAction,
    isGenerating,
    streamText,
  });
  const deferredStreamText = useDeferredValue(streamText);
  const companyEmployees = activeCompany?.employees ?? EMPTY_EMPLOYEES;
  const chatSessionRuntime = useMemo(
    () => ({
      activeCompany,
      agentId,
      archiveId,
      activeArchivedRound,
      authorityBackedState,
      companyRouteReady,
      connected,
      routeCompanyConflictMessage,
      groupTopicKey,
      groupTitle,
      historyAgentId,
      isArchiveView,
      isGroup,
      providerId,
      persistedWorkItemStartedAt: persistedWorkItem?.startedAt,
      targetAgentId,
      effectiveOwnerAgentId,
      effectiveGroupSessionKey,
      effectiveRequirementRoom,
      effectiveRequirementRoomSnapshots,
      requirementRoomSessions,
      requirementRoomSessionKeys,
      requirementRoomTargetAgentIds,
      groupWorkItemId,
      sessionKey,
      productRoomId,
      activeRoomBindings,
      currentConversationWorkItemId,
      currentConversationTopicKey,
      lastSyncedRoomSignatureRef,
      streamTextRef,
      activeRunIdRef,
      pendingGenerationStartedAtRef,
      setActiveRunId,
      setLoading,
      setSessionSyncStale,
      setSessionKey,
      setMessages,
      setIsGenerating,
      updateStreamText,
      restoreGeneratingState,
      clearGeneratingState,
      upsertRoomRecord,
      upsertRoomConversationBindings,
      appendRoomMessages,
      upsertDispatchRecord,
      upsertTask,
    }),
    [
      activeArchivedRound,
      activeCompany,
      activeRoomBindings,
      agentId,
      archiveId,
      authorityBackedState,
      appendRoomMessages,
      companyRouteReady,
      connected,
      currentConversationTopicKey,
      currentConversationWorkItemId,
      clearGeneratingState,
      effectiveGroupSessionKey,
      effectiveOwnerAgentId,
      effectiveRequirementRoom,
      effectiveRequirementRoomSnapshots,
      groupTitle,
      groupTopicKey,
      groupWorkItemId,
      historyAgentId,
      isArchiveView,
      isGroup,
      productRoomId,
      providerId,
      persistedWorkItem?.startedAt,
      requirementRoomSessionKeys,
      requirementRoomSessions,
      requirementRoomTargetAgentIds,
      routeCompanyConflictMessage,
      restoreGeneratingState,
      sessionKey,
      setSessionSyncStale,
      setActiveRunId,
      targetAgentId,
      updateStreamText,
      upsertDispatchRecord,
      upsertRoomConversationBindings,
      upsertRoomRecord,
      upsertTask,
    ],
  );

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const pendingSince = pendingGenerationStartedAtRef.current;
    if (!pendingSince) {
      return;
    }

    const hasCompletedReply = messages.some((message) => {
      const timestamp = typeof message.timestamp === "number" ? message.timestamp : 0;
      return timestamp >= pendingSince && (message.role === "assistant" || message.role === "system");
    });

    if (!hasCompletedReply) {
      return;
    }

    const timer = window.setTimeout(() => {
      clearGeneratingState();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearGeneratingState, isGenerating, messages]);

  useChatRuntimeEffects({
    agentId,
    shouldRunCompanySync,
    companySyncIntervalMs,
    companySessionSnapshotsRef,
    setHasBootstrappedCompanySync,
    setCompanySyncStale,
    connected,
    isPageVisible,
    actionWatches,
    appendLocalProgressEvent,
    setActionWatches,
    syncCompanyCommunication,
    shouldAutoScrollRef,
    forceScrollOnNextUpdateRef,
    programmaticScrollRef,
    userScrollLockRef,
    lastScrollTopRef,
    lockedScrollTopRef,
    chatSessionRuntime,
  });

  useEffect(() => {
    if (userScrollLockRef.current && scrollContainerRef.current) {
      const lockedTop = lockedScrollTopRef.current;
      if (typeof lockedTop === "number" && Math.abs(scrollContainerRef.current.scrollTop - lockedTop) > 2) {
        setProgrammaticScrollLock(true);
        scrollContainerRef.current.scrollTop = lockedTop;
      }
      return;
    }

    if (forceScrollOnNextUpdateRef.current || (shouldAutoScrollRef.current && !userScrollLockRef.current)) {
      setProgrammaticScrollLock(true);
      endRef.current?.scrollIntoView({ behavior: "auto" });
      forceScrollOnNextUpdateRef.current = false;
      shouldAutoScrollRef.current = true;
    }
  }, [messages, setProgrammaticScrollLock, streamText]);

  const {
    handleClearSession,
    navigateToCurrentConversation,
    navigateToArchivedRound,
    resetConversationView,
  } = useChatSessionReset({
    sessionKey,
    messages,
    activeCompany,
    isArchiveView,
    currentConversationWorkItemId,
    isGroup,
    effectiveRequirementRoom,
    groupWorkItemId,
    activeConversationMission,
    persistedWorkItem,
    historyAgentId,
    currentActorAgentId: emp?.agentId ?? targetAgentId,
    currentActorLabel: emp?.nickname ?? "当前负责人",
    providerId,
    conversationStateKey,
    clearConversationState,
    upsertRoundRecord,
    setMessages,
    setLoading,
    setLocalProgressEvents,
    setActionWatches,
    setIsSummaryOpen,
    setIsTechnicalSummaryOpen,
    beginGeneratingState,
    clearGeneratingState,
    incrementHistoryRefreshNonce,
    navigate,
    pathname: location.pathname,
    search: location.search,
  });
  const {
    deletingHistorySessionKey,
    deletingArchiveId,
    restoringArchiveId,
    handleDeleteRecentSession,
    handleDeleteArchivedRound,
    handleRestoreArchivedRound,
  } = useChatHistoryActions({
    sessionKey,
    archiveId,
    historyAgentId,
    conversationStateKey,
    currentActorLabel: emp?.nickname ?? "当前负责人",
    supportsSessionArchiveRestore,
    productArchivedRounds,
    setRecentAgentSessions,
    setRecentArchivedRounds,
    deleteRoundRecord,
    setConversationCurrentWorkKey,
    incrementHistoryRefreshNonce,
    navigateToCurrentConversation,
    resetConversationView,
  });

  const handleSend = useChatSend({
    activeCompany,
    providerManifest,
    providerId,
    sessionKey,
    isArchiveView,
    isGroup,
    sending,
    routeCompanyConflictMessage,
    attachments,
    roomBroadcastMode,
    targetAgentId,
    displayNextBatonAgentId,
    requirementRoomTargetAgentIds,
    requirementTeamOwnerAgentId: requirementTeam?.ownerAgentId,
    effectiveRequirementRoom,
    currentConversationWorkItemId,
    currentConversationTopicKey,
    productRoomId,
    groupTitle,
    handleClearSession,
    markScrollIntent,
    beginGeneratingState,
    clearGeneratingState,
    setAttachments,
    setSending,
    setRoomBroadcastMode,
    setMessages,
    upsertRoomConversationBindings,
    upsertDispatchRecord,
    appendRoomMessages,
  });
  const handleResolveRequirementDecision = useCallback(
    async (optionId: string) => {
      if (!openRequirementDecisionTicket) {
        return;
      }
      const option =
        openRequirementDecisionTicket.options.find((candidate) => candidate.id === optionId) ?? null;
      if (!option) {
        return;
      }
      const timestamp = Date.now();
      setDecisionSubmittingOptionId(optionId);
      upsertDecisionTicketRecord({
        ...openRequirementDecisionTicket,
        status: "resolved",
        resolutionOptionId: option.id,
        resolution: option.summary ?? option.label,
        updatedAt: timestamp,
      });
      const resolutionMessage = buildRequirementDecisionResolutionMessage({
        ticket: openRequirementDecisionTicket,
        optionId: option.id,
      });
      if (resolutionMessage) {
        const sent = await handleSend(resolutionMessage);
        if (!sent) {
          toast.warning("已记录你的决策", "状态已更新，但通知 CEO/需求房失败了。你可以稍后重试发送。");
        }
      }
      setDecisionSubmittingOptionId(null);
    },
    [handleSend, openRequirementDecisionTicket, upsertDecisionTicketRecord],
  );

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">
        正在建立会话连接...
      </div>
    );
  }

  if (!agentId || (!emp && !isGroup)) {
    return <div className="p-8 text-center">未找到这个成员会话或对应的群聊</div>;
  }

  return (
    <div
      className="flex flex-col h-full bg-slate-50/50 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatConversationWorkItemSync
        activeCompany={activeCompany}
        authorityBackedState={authorityBackedState}
        conversationMissionRecord={conversationMissionRecord}
        conversationStateKey={conversationStateKey}
        effectiveRequirementRoom={effectiveRequirementRoom}
        persistedWorkItem={persistedWorkItem}
        productRoomId={productRoomId}
        requirementOverview={requirementOverview}
        sessionKey={sessionKey}
        shouldPersistConversationTruth={shouldPersistConversationTruth}
        upsertWorkItemRecord={upsertWorkItemRecord}
        setConversationCurrentWorkKey={setConversationCurrentWorkKey}
      />
      <ChatAutoDispatchController
        company={activeCompany}
        providerManifest={providerManifest}
        fromActorId={targetAgentId}
        workItemId={currentConversationWorkItemId}
        topicKey={currentConversationTopicKey}
        enabled={
          isCeoSession &&
          !isGroup &&
          !isArchiveView &&
          !isFreshConversation &&
          !isRequirementBootstrapPending &&
          !isManualConfirmationPending &&
          !routeCompanyConflictMessage
        }
        upsertDispatchRecord={upsertDispatchRecord}
        appendLocalProgressEvent={appendLocalProgressEvent}
        workTitle={effectiveHeadline}
        ownerLabel={effectiveOwnerLabel}
        summary={effectiveSummary}
        actionHint={effectiveActionHint}
        currentStep={displayPlanCurrentStep}
        nextBatonAgentId={chatSurfaceNextBatonAgentId}
        nextBatonLabel={chatSurfaceNextBatonLabel}
        shouldDispatchPublish={shouldDispatchPublish}
      />
      {/* 拖拽上传遮罩 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-indigo-500/10 backdrop-blur-[2px] border-4 border-dashed border-indigo-400 rounded-xl m-2 flex flex-col items-center justify-center transition-all pointer-events-none">
          <UploadCloud className="w-16 h-16 text-indigo-500 mb-4 animate-bounce" />
          <h3 className="text-2xl font-bold text-indigo-600 mb-2">松手以投送文件</h3>
          <p className="text-indigo-500/80">
            文件将被推送至 {isGroup ? "全体参会成员" : emp?.nickname} 的工作区
          </p>
        </div>
      )}
      <ChatSessionHeader
        isGroup={isGroup}
        groupTopic={groupTopic}
        groupTitle={displayGroupTitle}
        groupSubtitle={displayGroupSubtitle}
        emp={emp ?? null}
        isArchiveView={isArchiveView}
        showRequirementStatus={Boolean(requirementOverview || isRequirementBootstrapPending)}
        headerStatusBadgeClass={headerStatusBadgeClass}
        effectiveStatusLabel={chatSurfaceStatusLabel}
        sessionExecution={sessionExecution}
        sessionKey={sessionKey}
        connected={connected}
        isSyncStale={isSyncStale}
        historyLoading={historyLoading}
        canShowSessionHistory={canShowSessionHistory}
        isHistoryMenuOpen={isHistoryMenuOpen}
        setIsHistoryMenuOpen={setIsHistoryMenuOpen}
        archiveId={archiveId}
        sending={sending}
        isGenerating={isGenerating}
        supportsSessionHistory={supportsSessionHistory}
        supportsSessionArchiveRestore={supportsSessionArchiveRestore}
        recentAgentSessions={recentAgentSessions}
        historySessionPresentations={historySessionPresentations}
        historyRoundItems={historyRoundItems}
        archiveSectionNotice={archiveSectionNotice}
        deletingHistorySessionKey={deletingHistorySessionKey}
        deletingArchiveId={deletingArchiveId}
        restoringArchiveId={restoringArchiveId}
        activeArchivedRound={activeArchivedRound}
        activeRunId={activeRunId}
        onNavigateToCurrentConversation={navigateToCurrentConversation}
        onNavigateToRoute={navigate}
        onNavigateToArchivedRound={navigateToArchivedRound}
        onClearSession={handleClearSession}
        onDeleteRecentSession={handleDeleteRecentSession}
        onRestoreArchivedRound={handleRestoreArchivedRound}
        onDeleteArchivedRound={handleDeleteArchivedRound}
        onStopTask={(currentSessionKey, activeRunId) => AgentOps.stopTask(currentSessionKey, activeRunId)}
      />
      <ChatSyncStatusBanner
        visible={!isArchiveView && isSyncStale}
        detail={syncStaleDetail}
        retrying={recoveringCommunication}
        onRetry={() => void handleRecoverCommunication()}
      />

      {!isArchiveView ? (
        <>
          {conversationDraftRequirement ? (
            <ChatRequirementDraftCard
              visible={shouldShowDraftCard}
              draft={conversationDraftRequirement}
              onPromote={handlePromoteRequirementDraft}
              onContinueChat={handleContinueDraftChat}
            />
          ) : null}
          <ChatMissionStrip
            open={isSummaryOpen}
            onOpenChange={setIsSummaryOpen}
            showRequirementContextTag={Boolean(
              activeConversationMission || requirementOverview || isRequirementBootstrapPending,
            )}
            isGroup={isGroup}
            isRequirementBootstrapPending={isRequirementBootstrapPending}
            stableDisplayWorkItem={Boolean(stableDisplayWorkItem)}
            sessionExecution={sessionExecution}
            effectiveHeadline={chatSurfaceHeadline}
            effectiveTone={chatSurfaceTone}
            effectiveStatusLabel={chatSurfaceStatusLabel}
            effectiveOwnerLabel={chatSurfaceOwnerLabel}
            effectiveStepLabel={chatSurfaceStepLabel}
            effectiveStage={chatSurfaceStage}
            displayNextBatonLabel={chatSurfaceNextBatonLabel}
            collaborationSurface={requirementCollaborationSurface}
            missionIsCompleted={missionIsCompleted}
            sending={sending}
            isGenerating={isGenerating}
            primaryOpenAction={chatSurfacePrimaryOpenAction}
            promotionActionLabel={promotionActionLabel}
            showRequirementTeamEntry={showRequirementTeamEntryResolved}
            hasTeamGroupRoute={primaryRequirementSurface?.roomStatus === "ready"}
            showSettledRequirementSummary={showSettledRequirementCard}
            settledRequirementSummary={settledRequirementSummary}
            settledRequirementNextAction={chatSurfaceSettledRequirementNextAction}
            hasContextSummary={hasContextSummary}
            onClearSession={() => void handleClearSession()}
            onRunPrimaryAction={(action) => void handleFocusAction(action)}
            onRunPromotionAction={() => void handlePromoteRequirementDraft()}
            onOpenRequirementTeam={() => {
              trackChatRequirementMetric({
                companyId: activeCompany?.id ?? null,
                conversationId: conversationStateKey,
                requirementId: persistedWorkItem?.id ?? conversationMissionRecord?.id ?? null,
                name: "requirement_room_opened_from_ceo_chat",
              });
              openRequirementRoom();
            }}
            onOpenSummaryPanel={() => openSummaryPanel("owner")}
            summaryPanel={
              <ChatSummaryPanel
                open={isSummaryOpen}
                summaryPanelView={summaryPanelView}
                isGroup={isGroup}
                hasTechnicalSummary={hasTechnicalSummary}
                effectiveHeadline={chatSurfaceHeadline}
                headerStatusBadgeClass={headerStatusBadgeClass}
                effectiveStatusLabel={chatSurfaceStatusLabel}
                effectiveOwnerLabel={chatSurfaceOwnerLabel}
                requirementTeamBatonLabel={requirementTeam?.batonLabel ?? null}
                displayNextBatonLabel={chatSurfaceNextBatonLabel}
                effectiveStage={chatSurfaceStage}
                effectiveActionHint={chatSurfaceActionHint}
                onSummaryPanelViewChange={setSummaryPanelView}
                activeConversationMission={activeConversationMission}
                isRequirementBootstrapPending={isRequirementBootstrapPending}
                progressGroupSummary={progressGroupSummary}
                latestProgressDisplay={latestProgressDisplay}
                missionIsCompleted={missionIsCompleted}
                sending={sending}
                isGenerating={isGenerating}
                recentProgressEvents={recentProgressEvents}
                actionWatchCards={actionWatchCards}
                lifecycleSections={displayRequirementLifecycleSections ?? []}
                collaborationLifecycle={collaborationLifecycle}
                detailActions={detailActions}
                runningFocusActionId={runningFocusActionId}
                recoveringCommunication={recoveringCommunication}
                requirementTeam={requirementTeam}
                teamMemberCards={teamMemberCards}
                displayNextBatonAgentId={chatSurfaceNextBatonAgentId}
                targetAgentId={targetAgentId ?? null}
                teamGroupRoute={
                  showRequirementTeamEntryResolved
                    ? resolvedRequirementRoom
                      ? buildRequirementRoomHrefFromRecord(resolvedRequirementRoom)
                      : "__ensure__"
                    : null
                }
                primaryOpenAction={chatSurfacePrimaryOpenAction}
                summaryRecoveryAction={summaryRecoveryAction}
                isTechnicalSummaryOpen={isTechnicalSummaryOpen}
                takeoverPack={
                  takeoverPack
                    ? {
                        failureSummary: takeoverPack.failureSummary,
                        recommendedNextAction: takeoverPack.recommendedNextAction,
                      }
                    : null
                }
                structuredTaskPreview={
                  structuredTaskPreview
                    ? {
                        summary: structuredTaskPreview.summary ?? chatSurfaceSummary,
                        state: structuredTaskPreview.state ?? null,
                      }
                    : null
                }
                hasRequirementOverview={Boolean(requirementOverview)}
                effectiveSummary={chatSurfaceSummary}
                requestPreview={requestPreview}
                requestHealth={requestHealth}
                ceoSurface={ceoSurface}
                collaborationSurface={requirementCollaborationSurface}
                orgAdvisorSummary={orgAdvisor?.summary ?? null}
                handoffPreview={handoffPreview}
                summaryAlertCount={summaryAlertCount}
                relatedSlaAlertCount={relatedSlaAlerts.length}
                localSlaFallbackAlertCount={localSlaFallbackAlerts.length}
                onClearSession={() => void handleClearSession()}
                onRunAction={(action) => void handleFocusAction(action)}
                onNavigateToChat={(nextAgentId) =>
                  navigate(buildCompanyChatRoute(nextAgentId, activeCompany?.id))
                }
                onNavigateToTeamGroup={openRequirementRoom}
                onToggleTechnicalSummary={() => setIsTechnicalSummaryOpen((open) => !open)}
                onCopyTakeoverPack={handleCopyTakeoverPack}
              />
            }
          />

      {!isGroup && latestDirectTurnSummary?.state === "waiting" ? (
        <ChatWaitingBanner
          ownerLabel={emp?.nickname ?? "负责人"}
          questionPreview={latestDirectTurnSummary.questionPreview}
        />
      ) : null}
        </>
      ) : null}

      {/* Messages */}
      <main
        ref={scrollContainerRef}
        onWheelCapture={(event) => {
          if (event.deltaY < -2) {
            userScrollLockRef.current = true;
            shouldAutoScrollRef.current = false;
            forceScrollOnNextUpdateRef.current = false;
            lockedScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? null;
          }
        }}
        onScroll={(event) => {
          const currentTop = event.currentTarget.scrollTop;
          if (programmaticScrollRef.current) {
            lastScrollTopRef.current = currentTop;
            return;
          }
          const nearBottom = isNearBottom(event.currentTarget);
          const movingUp = currentTop < lastScrollTopRef.current - 4;
          const leftAutoFollowZone = !nearBottom && shouldAutoScrollRef.current;

          if (movingUp || leftAutoFollowZone) {
            userScrollLockRef.current = true;
            shouldAutoScrollRef.current = false;
            forceScrollOnNextUpdateRef.current = false;
            lockedScrollTopRef.current = currentTop;
          } else if (nearBottom) {
            userScrollLockRef.current = false;
            shouldAutoScrollRef.current = true;
            lockedScrollTopRef.current = null;
          } else if (userScrollLockRef.current) {
            lockedScrollTopRef.current = currentTop;
          }

          lastScrollTopRef.current = currentTop;
        }}
        className="flex-1 overflow-y-auto p-3 md:p-6 space-y-6"
      >
        <ChatMessageFeed
          hiddenDisplayItemCount={hiddenDisplayItemCount}
          renderWindowStep={CHAT_RENDER_WINDOW_STEP}
          displayItemsLength={displayItems.length}
          visibleDisplayItems={visibleDisplayItems}
          companyId={activeCompany?.id ?? null}
          employees={companyEmployees}
          isCeoSession={isCeoSession}
          isGroup={isGroup}
          groupTopic={groupTopic}
          emp={emp ?? null}
          effectiveOwnerAgentId={effectiveOwnerAgentId}
          requirementRoomSessionsLength={requirementRoomSessions.length}
          targetAgentId={targetAgentId}
          currentConversationRequirementTopicKey={currentConversationRequirementHint?.topicKey ?? null}
          requirementOverviewTopicKey={requirementOverview?.topicKey ?? null}
          conversationMissionRecordId={conversationMissionRecord?.id ?? null}
          persistedWorkItemId={persistedWorkItem?.id ?? null}
          groupWorkItemId={groupWorkItemId ?? null}
          openRequirementDecisionTicket={openRequirementDecisionTicket}
          showLegacyDecisionCard={false}
          decisionSubmittingOptionId={decisionSubmittingOptionId}
          hasActiveRun={hasActiveRun}
          streamText={deferredStreamText}
          isGenerating={isGenerating}
          emptyStateText={emptyStateText}
          onExpandDisplayWindow={expandDisplayWindow}
          onSelectDecisionOption={(optionId) => void handleResolveRequirementDecision(optionId)}
          onNavigateToRoute={navigate}
        />
        <div ref={endRef} />
      </main>

      {/* Input */}
      <ChatComposerFooter
        isArchiveView={isArchiveView}
        isGenerating={isGenerating}
        fileInputRef={fileInputRef}
        handleFileSelect={handleFileSelect}
        placeholder={
          isGroup
            ? "在需求团队房间里交流；输入 @成员名 定向派发，不写 @ 默认发给当前 baton / 负责人，切换“群发中”才会发给所有成员 (Enter 换行，Cmd/Ctrl+Enter 发送)..."
            : `向 ${emp?.nickname} 发送工作指令 (/new 新会话，Enter 换行，Cmd/Ctrl+Enter 发送)...`
        }
        sending={sending}
        uploadingFile={uploadingFile}
        attachments={attachments}
        roomBroadcastMode={roomBroadcastMode}
        requirementRoomMentionCandidates={isGroup ? requirementRoomMentionCandidates : undefined}
        composerPrefill={composerPrefill}
        routeComposerPrefill={routeComposerPrefill}
        setRoomBroadcastMode={setRoomBroadcastMode}
        setAttachments={setAttachments}
        processImageFile={processImageFile}
        handleSend={handleSend}
      />
    </div>
  );
}
