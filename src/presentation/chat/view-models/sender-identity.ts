import type { ChatMessage } from "../../../application/gateway";
import { describeToolName, extractNameFromMessage, extractTextFromMessage } from "./messages";
import type { Company, EmployeeRef } from "../../../domain/org/types";

export type SenderIdentity = {
  name: string;
  avatarSeed: string | undefined;
  isOutgoing: boolean;
  isRelayed: boolean;
  badgeLabel?: string;
  badgeTone?: "slate" | "indigo" | "amber";
  metaLabel?: string;
};

type GetChatSenderIdentityInput = {
  msg: ChatMessage;
  activeCompany?: Company | null;
  employeesByAgentId?: Map<string, EmployeeRef>;
  isGroup: boolean;
  isCeoSession?: boolean;
  groupTopic?: string | null;
  emp?: EmployeeRef | null;
  effectiveOwnerAgentId?: string | null;
  requirementRoomSessionsLength: number;
};

export function getChatSenderIdentity({
  msg,
  activeCompany,
  employeesByAgentId,
  isGroup,
  groupTopic,
  emp,
  effectiveOwnerAgentId,
  requirementRoomSessionsLength,
}: GetChatSenderIdentityInput): SenderIdentity {
  const rawText = extractTextFromMessage(msg);
  const provenance =
    typeof msg.provenance === "object" && msg.provenance
      ? (msg.provenance as Record<string, unknown>)
      : null;
  const sourceTool =
    provenance && typeof provenance.sourceTool === "string" ? provenance.sourceTool : null;
  const sourceAgentId =
    provenance && typeof provenance.sourceActorId === "string"
      ? provenance.sourceActorId
      : null;
  const sourcedEmployee =
    sourceAgentId
      ? employeesByAgentId?.get(sourceAgentId) ??
        (activeCompany
          ? activeCompany.employees.find((employee) => employee.agentId === sourceAgentId) ?? null
          : null)
      : null;

  const roomAgentId =
    typeof msg.roomAgentId === "string" && msg.roomAgentId.length > 0
      ? msg.roomAgentId
      : sourceAgentId;
  const roomEmployee =
    roomAgentId
      ? employeesByAgentId?.get(roomAgentId) ??
        (activeCompany
          ? activeCompany.employees.find((employee) => employee.agentId === roomAgentId) ?? null
          : null)
      : null;
  const roomSessionAgentId =
    typeof msg.roomAgentId === "string" && msg.roomAgentId.length > 0
      ? msg.roomAgentId
      : null;
  const roomSessionEmployee =
    roomSessionAgentId
      ? employeesByAgentId?.get(roomSessionAgentId) ??
        (activeCompany
          ? activeCompany.employees.find((employee) => employee.agentId === roomSessionAgentId) ?? null
          : null)
      : null;

  if (msg.role === "assistant" && isGroup && roomEmployee) {
    return {
      name: roomEmployee.nickname,
      avatarSeed: roomEmployee.agentId,
      isOutgoing: false,
      isRelayed: false,
      badgeLabel: roomEmployee.agentId === effectiveOwnerAgentId ? "当前负责人" : "团队成员",
      badgeTone: roomEmployee.agentId === effectiveOwnerAgentId ? "amber" : "indigo",
      metaLabel: roomEmployee.role,
    };
  }

  if (msg.role === "assistant") {
    return {
      name: isGroup ? "需求团队成员" : emp?.nickname || "Agent",
      avatarSeed: isGroup ? groupTopic || "group" : emp?.agentId,
      isOutgoing: false,
      isRelayed: false,
      metaLabel: isGroup ? "需求团队房间" : emp?.role,
    };
  }

  if (msg.role === "toolResult") {
    return {
      name: "系统",
      avatarSeed: "system",
      isOutgoing: false,
      isRelayed: false,
      badgeLabel: "工具回执",
      badgeTone: "indigo",
      metaLabel:
        typeof msg.toolName === "string" && msg.toolName.trim().length > 0
          ? describeToolName(msg.toolName.trim())
          : "系统回执",
    };
  }

  if (sourcedEmployee) {
    return {
      name: sourcedEmployee.nickname,
      avatarSeed: sourcedEmployee.agentId,
      isOutgoing: false,
      isRelayed: true,
      badgeLabel: sourceTool === "sessions_send" ? "协作回传" : "跨会话消息",
      badgeTone: "indigo",
      metaLabel: sourcedEmployee.role,
    };
  }

  if (!isGroup && msg.role === "user" && roomEmployee) {
    return {
      name: roomEmployee.nickname,
      avatarSeed: roomEmployee.agentId,
      isOutgoing: false,
      isRelayed: true,
      badgeLabel: "协作回传",
      badgeTone: "indigo",
      metaLabel: roomEmployee.role,
    };
  }

  if (isGroup && msg.role === "user" && roomSessionEmployee) {
    return {
      name: roomSessionEmployee.nickname,
      avatarSeed: roomSessionEmployee.agentId,
      isOutgoing: false,
      isRelayed: true,
      badgeLabel: "成员同步",
      badgeTone: "indigo",
      metaLabel: roomSessionEmployee.role,
    };
  }

  if (msg.role === "user" && !isGroup) {
    return {
      name: "我",
      avatarSeed: "me",
      isOutgoing: true,
      isRelayed: false,
    };
  }

  const extractedName = rawText ? extractNameFromMessage(rawText) : null;
  if (extractedName && msg.role === "user") {
    return {
      name: extractedName.length > 10 ? "同步转发" : extractedName,
      avatarSeed: extractedName,
      isOutgoing: false,
      isRelayed: true,
      badgeLabel: "同步转发",
      badgeTone: "amber",
      metaLabel: "跨会话消息",
    };
  }

  if (msg.role !== "user") {
    return {
      name: "系统",
      avatarSeed: "system",
      isOutgoing: false,
      isRelayed: false,
      badgeLabel: "系统消息",
      badgeTone: "indigo",
    };
  }

  return {
    name: "我",
    avatarSeed: "me",
    isOutgoing: true,
    isRelayed: false,
    metaLabel:
      isGroup && Array.isArray(msg.roomAudienceAgentIds) && msg.roomAudienceAgentIds.length > 0
        ? (() => {
            const labels = msg.roomAudienceAgentIds
              .map((agentId) => employeesByAgentId?.get(agentId)?.nickname)
              .filter((label): label is string => Boolean(label));
            if (labels.length === 0) {
              return "已发送到团队房间";
            }
            if (labels.length >= requirementRoomSessionsLength && requirementRoomSessionsLength > 0) {
              return "已发送给全体成员";
            }
            return `已发送给 ${labels.slice(0, 3).join("、")}${labels.length > 3 ? ` +${labels.length - 3}` : ""}`;
          })()
        : undefined,
  };
}
