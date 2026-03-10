import type {
  Company,
  EmployeeRef,
  RoomConversationBindingRecord,
  RequirementRoomRecord,
} from "../../domain";
import { dedupeAgentIds, sortRequirementRoomMemberIds } from "../assignment/room-members";
import { buildRoomRecordIdFromWorkItem } from "../mission/work-item";
import { appendCompanyScopeToChatRoute } from "../../lib/chat-routes";

export type RequirementRoomSession = {
  agentId: string;
  label: string;
  role: string;
  sessionKey: string;
};

type RequirementRoomRouteInput = {
  companyId: string;
  employees: EmployeeRef[];
  memberIds: string[];
  topic: string;
  topicKey?: string | null;
  workItemId?: string | null;
  preferredInitiatorAgentId?: string | null;
  existingRooms?: RequirementRoomRecord[] | null;
};

function normalizeRoomTopicKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeRoomTitle(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function buildRoomMemberSignature(memberIds: string[]): string {
  return sortRequirementRoomMemberIds(memberIds).join(",");
}

function buildStableGroupSuffix(topic: string, memberIds: string[]): string {
  const seed = `${topic.trim().toLowerCase()}|${[...memberIds].sort().join(",")}`;
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36).padStart(6, "0").slice(-6);
}

function sanitizeTopicId(topic: string): string {
  return (
    topic
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "task-group"
  );
}

function buildRequirementRoomRouteCore(input: RequirementRoomRouteInput): string | null {
  const uniqueMembers = dedupeAgentIds(input.memberIds).sort();
  if (uniqueMembers.length < 2) {
    return null;
  }

  const ceoAgentId = input.employees.find((employee) => employee.metaRole === "ceo")?.agentId;
  const initiatorAgentId =
    ceoAgentId ||
    input.preferredInitiatorAgentId?.trim() ||
    input.employees[0]?.agentId;
  if (!initiatorAgentId) {
    return null;
  }

  const normalizedTopicKey = normalizeRoomTopicKey(input.topicKey);
  const normalizedTitle = normalizeRoomTitle(input.topic);
  const requestedMemberSignature = buildRoomMemberSignature(uniqueMembers);
  const matchingRoom = [...(input.existingRooms ?? [])]
    .filter((room) => {
      if (input.workItemId?.trim()) {
        return room.workItemId === input.workItemId.trim();
      }
      if (normalizedTopicKey) {
        return normalizeRoomTopicKey(room.topicKey) === normalizedTopicKey;
      }
      const roomTitle = normalizeRoomTitle(room.title);
      return roomTitle.length > 0 && roomTitle === normalizedTitle;
    })
    .sort((left, right) => {
      const leftMembers = buildRoomMemberSignature(left.memberIds);
      const rightMembers = buildRoomMemberSignature(right.memberIds);
      const leftExact = Number(leftMembers === requestedMemberSignature);
      const rightExact = Number(rightMembers === requestedMemberSignature);
      if (leftExact !== rightExact) {
        return rightExact - leftExact;
      }
      return right.updatedAt - left.updatedAt;
    })[0];

  if (matchingRoom) {
    return buildRequirementRoomHrefFromRecord(matchingRoom);
  }

  const roomId = input.workItemId?.trim()
    ? buildRoomRecordIdFromWorkItem(input.workItemId.trim())
    : `room:${sanitizeTopicId(normalizedTopicKey ?? input.topic)}-${buildStableGroupSuffix(
        `${input.companyId}|${normalizedTopicKey ?? input.topic}`,
        [initiatorAgentId, ...uniqueMembers],
      )}`;
  const params = new URLSearchParams();
  params.set("m", uniqueMembers.join(","));
  params.set("title", input.topic.trim() || "需求团队");
  if (normalizedTopicKey) {
    params.set("tk", normalizedTopicKey);
  }
  if (input.workItemId?.trim()) {
    params.set("wi", input.workItemId.trim());
  }

  return appendCompanyScopeToChatRoute(
    `/chat/${encodeURIComponent(`room:${roomId}`)}?${params.toString()}`,
    input.companyId,
  );
}

export function buildRequirementRoomRoute(input: {
  company: Company;
  memberIds: string[];
  topic: string;
  topicKey?: string | null;
  workItemId?: string | null;
  preferredInitiatorAgentId?: string | null;
  existingRooms?: RequirementRoomRecord[] | null;
}): string | null {
  return buildRequirementRoomRouteCore({
    companyId: input.company.id,
    employees: input.company.employees,
    memberIds: input.memberIds,
    topic: input.topic,
    topicKey: input.topicKey,
    workItemId: input.workItemId,
    preferredInitiatorAgentId: input.preferredInitiatorAgentId,
    existingRooms: input.existingRooms,
  });
}

export function buildRequirementRoomRouteFromCompanyContext(input: RequirementRoomRouteInput): string | null {
  return buildRequirementRoomRouteCore(input);
}

export function buildRequirementRoomHrefFromRecord(room: RequirementRoomRecord): string {
  return appendCompanyScopeToChatRoute(
    `/chat/${encodeURIComponent(`room:${room.id}`)}`,
    room.companyId,
  );
}

export function buildRequirementRoomSessions(input: {
  company: Company | null | undefined;
  room?: RequirementRoomRecord | null | undefined;
  bindings?: RoomConversationBindingRecord[] | null | undefined;
  targetSessionKey: string | null;
  memberIds: string[];
}): RequirementRoomSession[] {
  const { company, targetSessionKey } = input;
  if (!company) {
    return [];
  }
  const order = new Map(company.employees.map((employee, index) => [employee.agentId, index]));

  const providerSessions = (input.bindings ?? [])
    .map((ref) => {
      const agentId = ref.actorId?.trim();
      if (!agentId) {
        return null;
      }
      const employee = company.employees.find((item) => item.agentId === agentId);
      if (!employee) {
        return null;
      }
      return {
        agentId,
        label: employee.nickname,
        role: employee.role,
        sessionKey: ref.conversationId,
      } satisfies RequirementRoomSession;
    })
    .filter((session): session is RequirementRoomSession => Boolean(session));
  if (providerSessions.length > 0) {
    const allowed = new Set(dedupeAgentIds(input.memberIds));
    return providerSessions
      .filter((session) => allowed.size === 0 || allowed.has(session.agentId))
      .sort(
        (left, right) =>
          (order.get(left.agentId) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.agentId) ?? Number.MAX_SAFE_INTEGER),
      );
  }

  if (!targetSessionKey || !targetSessionKey.includes(":group:")) {
    return [];
  }

  const groupId = targetSessionKey.split(":group:")[1]?.split("?")[0]?.trim();
  if (!groupId) {
    return [];
  }

  const targetAgentId =
    input.room?.ownerActorId?.trim() ||
    input.room?.ownerAgentId?.trim() ||
    input.memberIds[0]?.trim() ||
    null;
  const allMemberIds = dedupeAgentIds([targetAgentId, ...input.memberIds]);

  return allMemberIds
    .map((agentId) => {
      const employee = company.employees.find((item) => item.agentId === agentId);
      if (!employee) {
        return null;
      }
      return {
        agentId,
        label: employee.nickname,
        role: employee.role,
        sessionKey: agentId === targetAgentId ? targetSessionKey : `agent:${agentId}:group:${groupId}`,
      } satisfies RequirementRoomSession;
    })
    .filter((session): session is RequirementRoomSession => Boolean(session))
    .sort(
      (left, right) =>
        (order.get(left.agentId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.agentId) ?? Number.MAX_SAFE_INTEGER),
    );
}
