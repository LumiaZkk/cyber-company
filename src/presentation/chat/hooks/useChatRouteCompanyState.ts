import { useEffect, useMemo } from "react";
import type { Location, NavigateFunction } from "react-router-dom";
import { useChatRouteContext } from "../route/useChatRouteContext";
import { toast } from "../../../components/system/toast-store";
import {
  appendCompanyScopeToChatRoute,
  findCompaniesByAgentId,
} from "../../../lib/chat-routes";
import { buildRoomRecordIdFromWorkItem } from "../../../application/mission/work-item";
import { convertRequirementRoomRecordToChatMessages } from "../../../application/delegation/room-routing";
import type { ChatMessage } from "../../../application/gateway";
import type { CyberCompanyConfig } from "../../../domain/org/types";
import type { RoomConversationBindingRecord, RequirementRoomRecord } from "../../../domain/delegation/types";
import type { ConversationStateRecord } from "../../../domain/mission/types";

export function useChatRouteCompanyState(input: {
  config: CyberCompanyConfig | null;
  activeCompanyId: string | null;
  activeRoomRecords: RequirementRoomRecord[];
  activeConversationStates: ConversationStateRecord[];
  activeRoomBindings: RoomConversationBindingRecord[];
  sessionMessages: ChatMessage[];
  switchCompany: (companyId: string) => void;
  navigate: NavigateFunction;
  location: Location;
}) {
  const route = useChatRouteContext();
  const {
    searchParams,
    isGroup,
    routeRoomId,
    targetAgentId,
    historyAgentId,
    groupTopic,
    routeCompanyId,
    groupMembers,
    routeGroupTopicKey,
    routeWorkItemId,
    isInvalidLegacyRoute,
  } = route;
  const {
    config,
    activeCompanyId,
    activeRoomRecords,
    activeConversationStates,
    activeRoomBindings,
    sessionMessages,
    switchCompany,
    navigate,
    location,
  } = input;

  const routeState = location.state as { prefillText?: string; prefillId?: string | number } | null;
  const routeComposerPrefill = useMemo(() => {
    const prefillText = routeState?.prefillText?.trim();
    return prefillText
      ? {
          id: routeState?.prefillId ?? `${location.key}:prefill`,
          text: prefillText,
        }
      : null;
  }, [location.key, routeState?.prefillId, routeState?.prefillText]);

  useEffect(() => {
    if (!routeComposerPrefill) {
      return;
    }
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    });
  }, [location.hash, location.pathname, location.search, navigate, routeComposerPrefill]);

  useEffect(() => {
    if (!isInvalidLegacyRoute) {
      return;
    }
    toast.error("旧聊天路由已废弃", "请改用 /chat/:agentId 或 /chat/room:<roomId>?cid=... 新路由。");
    navigate(routeCompanyId ? `/ops?cid=${routeCompanyId}` : "/ops", { replace: true });
  }, [navigate, isInvalidLegacyRoute, routeCompanyId]);

  const routeAgentCompanies = useMemo(
    () => findCompaniesByAgentId(config, targetAgentId),
    [config, targetAgentId],
  );
  const resolvedRouteCompanyId = useMemo(() => {
    if (routeCompanyId) {
      return config?.companies.some((company) => company.id === routeCompanyId) ? routeCompanyId : null;
    }
    if (!isGroup && routeAgentCompanies.length === 1) {
      return routeAgentCompanies[0]?.id ?? null;
    }
    return null;
  }, [config?.companies, isGroup, routeAgentCompanies, routeCompanyId]);

  const routeCompanyConflictMessage = useMemo(() => {
    if (routeCompanyId && !resolvedRouteCompanyId) {
      return `聊天路由引用了不存在的公司：${routeCompanyId}`;
    }
    if (!routeCompanyId && !isGroup && targetAgentId && routeAgentCompanies.length > 1) {
      return `员工 ${targetAgentId} 同时存在于多个公司，当前路由缺少公司作用域，已阻止发送以避免串线。`;
    }
    return null;
  }, [isGroup, resolvedRouteCompanyId, routeAgentCompanies.length, routeCompanyId, targetAgentId]);

  const companyRouteReady = !resolvedRouteCompanyId || activeCompanyId === resolvedRouteCompanyId;

  useEffect(() => {
    if (!resolvedRouteCompanyId || activeCompanyId === resolvedRouteCompanyId) {
      return;
    }
    switchCompany(resolvedRouteCompanyId);
  }, [activeCompanyId, resolvedRouteCompanyId, switchCompany]);

  const rawGroupTitle =
    searchParams.get("title")?.trim() ||
    (groupTopic
      ? groupTopic
          .replace(/-[a-z0-9]{6}$/i, "")
          .replace(/-/g, " ")
          .trim()
      : null) ||
    "需求团队";

  const activeRequirementRoom = useMemo(
    () =>
      isGroup
        ? activeRoomRecords.find(
            (room) =>
              (routeRoomId && room.id === routeRoomId) ||
              (routeWorkItemId && room.workItemId === routeWorkItemId),
          ) ?? null
        : null,
    [activeRoomRecords, isGroup, routeRoomId, routeWorkItemId],
  );

  const messages = useMemo(
    () => (isGroup ? convertRequirementRoomRecordToChatMessages(activeRequirementRoom) : sessionMessages),
    [activeRequirementRoom, isGroup, sessionMessages],
  );

  const groupTitle = activeRequirementRoom?.title ?? rawGroupTitle;
  const groupTopicKey = activeRequirementRoom?.topicKey ?? routeGroupTopicKey;
  const groupWorkItemId = activeRequirementRoom?.workItemId ?? routeWorkItemId;
  const productRoomId = useMemo(
    () =>
      isGroup
        ? activeRequirementRoom?.id ??
          routeRoomId ??
          (groupWorkItemId ? buildRoomRecordIdFromWorkItem(groupWorkItemId) : null)
        : null,
    [activeRequirementRoom?.id, groupWorkItemId, isGroup, routeRoomId],
  );

  const effectiveGroupSessionKey =
    activeRequirementRoom?.sessionKey ??
    activeRoomBindings.find(
      (binding) =>
        binding.roomId === productRoomId &&
        typeof binding.conversationId === "string" &&
        binding.conversationId.trim().length > 0,
    )?.conversationId ??
    null;

  const conversationStateKey = isGroup ? productRoomId : null;
  const activeConversationState = useMemo(
    () =>
      conversationStateKey
        ? activeConversationStates.find((record) => record.conversationId === conversationStateKey) ?? null
        : null,
    [activeConversationStates, conversationStateKey],
  );

  return {
    ...route,
    groupMembers,
    historyAgentId,
    routeComposerPrefill,
    routeAgentCompanies,
    resolvedRouteCompanyId,
    routeCompanyConflictMessage,
    companyRouteReady,
    activeRequirementRoom,
    messages,
    groupTitle,
    groupTopicKey,
    groupWorkItemId,
    productRoomId,
    effectiveGroupSessionKey,
    conversationStateKey,
    activeConversationState,
    navigateToCompanyScopedHref: (href: string) =>
      navigate(appendCompanyScopeToChatRoute(href, resolvedRouteCompanyId ?? activeCompanyId)),
  };
}
