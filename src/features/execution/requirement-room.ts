import type {
  Company,
  ProviderConversationRef,
  RoomConversationBindingRecord,
  RequirementRoomMessage,
  RequirementRoomRecord,
} from "../company/types";
import type { ChatMessage } from "../backend";
import { parseAgentIdFromSessionKey } from "../../lib/sessions";
import { buildRoomRecordIdFromWorkItem } from "./work-item";

export type RequirementRoomSession = {
  agentId: string;
  label: string;
  role: string;
  sessionKey: string;
};

export type RequirementRoomMentionCandidate = {
  agentId: string;
  label: string;
  role: string;
};

const ROOM_MESSAGE_LIMIT = 120;

function createRoomMentionRegex() {
  return /@([\p{L}\p{N}_-]+)/gu;
}

function normalizeToken(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

function hashText(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

function normalizeChatBlockType(type?: string): string {
  if (!type) {
    return "";
  }
  if (type === "toolCall") {
    return "tool_call";
  }
  if (type === "toolResult") {
    return "tool_result";
  }
  return type
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function getChatBlocks(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .map((block) => (typeof block === "object" && block ? (block as Record<string, unknown>) : null))
    .filter((block): block is Record<string, unknown> => Boolean(block));
}

function extractTextFromMessage(message: ChatMessage | null | undefined): string {
  if (!message) {
    return "";
  }

  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text.trim();
  }

  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return message.content.trim();
  }

  return getChatBlocks(message.content)
    .filter((block) => normalizeChatBlockType(String(block.type ?? "")) === "text")
    .map((block) => (typeof block.text === "string" ? block.text.trim() : ""))
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();
}

function getRenderableMessageContent(message: ChatMessage): unknown {
  if (!Array.isArray(message.content)) {
    return typeof message.content === "string" ? message.content : undefined;
  }

  const renderable = getChatBlocks(message.content).filter((block) => {
    const type = normalizeChatBlockType(String(block.type ?? ""));
    return type === "text" || type === "image";
  });
  return renderable.length > 0 ? renderable : undefined;
}

function hasRenderableImage(message: ChatMessage): boolean {
  return getChatBlocks(message.content).some(
    (block) => normalizeChatBlockType(String(block.type ?? "")) === "image",
  );
}

function isToolOnlyAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") {
    return false;
  }
  if (extractTextFromMessage(message)) {
    return false;
  }
  return getChatBlocks(message.content).some((block) => {
    const type = normalizeChatBlockType(String(block.type ?? ""));
    return type === "tool_call" || type === "tool_result" || type === "thinking";
  });
}

function normalizeRequirementRoomText(text: string): string {
  return text
    .replace(/^Sender \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeAgentIds(agentIds: Array<string | null | undefined>): string[] {
  return [...new Set(agentIds.map((agentId) => agentId?.trim()).filter((agentId): agentId is string => Boolean(agentId)))];
}

function normalizeRoomTopicKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeRoomTitle(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function isProductRoomSessionKey(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? "";
  return normalized.startsWith("room:") || normalized.startsWith("workitem:");
}

function buildRoomMemberSignature(memberIds: string[]): string {
  return dedupeAgentIds(memberIds).sort().join(",");
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

function resolveEmployeeByToken(
  company: Company,
  token: string,
  allowedAgentIds?: Set<string>,
): string | null {
  const normalized = normalizeToken(token);
  if (!normalized) {
    return null;
  }

  const candidates = company.employees.filter((employee) =>
    allowedAgentIds ? allowedAgentIds.has(employee.agentId) : true,
  );

  const exact = candidates.find((employee) => {
    const nickname = employee.nickname.trim().toLowerCase();
    const role = employee.role.trim().toLowerCase();
    const agentId = employee.agentId.trim().toLowerCase();
    return agentId === normalized || nickname === normalized || role === normalized;
  });
  if (exact) {
    return exact.agentId;
  }

  const fuzzy = candidates.find((employee) => {
    const nickname = employee.nickname.trim().toLowerCase();
    const role = employee.role.trim().toLowerCase();
    return nickname.includes(normalized) || normalized.includes(nickname) || role.includes(normalized);
  });
  return fuzzy?.agentId ?? null;
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
  const uniqueMembers = dedupeAgentIds(input.memberIds).sort();
  if (uniqueMembers.length < 2) {
    return null;
  }

  const ceoAgentId = input.company.employees.find((employee) => employee.metaRole === "ceo")?.agentId;
  const initiatorAgentId =
    ceoAgentId ||
    input.preferredInitiatorAgentId?.trim() ||
    input.company.employees[0]?.agentId;
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
        `${input.company.id}|${normalizedTopicKey ?? input.topic}`,
        [initiatorAgentId, ...uniqueMembers],
      )}`;
  const sessionKey = `room:${roomId}`;
  const params = new URLSearchParams();
  params.set("m", uniqueMembers.join(","));
  params.set("title", input.topic.trim() || "需求团队");
  if (normalizedTopicKey) {
    params.set("tk", normalizedTopicKey);
  }
  if (input.workItemId?.trim()) {
    params.set("wi", input.workItemId.trim());
  }
  params.set("sk", sessionKey);

  return `/chat/${encodeURIComponent(`room:${roomId}`)}?${params.toString()}`;
}

export function buildRequirementRoomHrefFromRecord(room: RequirementRoomRecord): string {
  const params = new URLSearchParams();
  const memberIds = dedupeAgentIds(room.memberIds);
  if (memberIds.length > 0) {
    params.set("m", memberIds.join(","));
  }
  params.set("title", room.title.trim() || "需求团队");
  const topicKey = normalizeRoomTopicKey(room.topicKey);
  if (topicKey) {
    params.set("tk", topicKey);
  }
  if (room.workItemId?.trim()) {
    params.set("wi", room.workItemId.trim());
  }
  params.set("sk", room.sessionKey);
  return `/chat/${encodeURIComponent(`room:${room.id}`)}?${params.toString()}`;
}

export function buildRequirementRoomSessions(input: {
  company: Company | null | undefined;
  room?: RequirementRoomRecord | null | undefined;
  bindings?: RoomConversationBindingRecord[] | null | undefined;
  targetSessionKey: string | null;
  memberIds: string[];
}): RequirementRoomSession[] {
  const { company, room, targetSessionKey } = input;
  if (!company) {
    return [];
  }
  const order = new Map(company.employees.map((employee, index) => [employee.agentId, index]));

  const providerSessions = (input.bindings ?? room?.providerConversationRefs ?? [])
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
      .sort((left, right) => (order.get(left.agentId) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.agentId) ?? Number.MAX_SAFE_INTEGER));
  }

  if (!targetSessionKey || !targetSessionKey.includes(":group:")) {
    return [];
  }

  const groupId = targetSessionKey.split(":group:")[1]?.split("?")[0]?.trim();
  if (!groupId) {
    return [];
  }

  const targetAgentId = parseAgentIdFromSessionKey(targetSessionKey);
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
    .sort((left, right) => (order.get(left.agentId) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.agentId) ?? Number.MAX_SAFE_INTEGER));
}

export function resolveRequirementRoomMentionTargets(input: {
  text: string;
  company: Company | null | undefined;
  memberIds: string[];
}): string[] {
  const { company, text } = input;
  if (!company) {
    return [];
  }

  const allowedAgentIds = new Set(dedupeAgentIds(input.memberIds));
  const mentionedTargets = [...text.matchAll(createRoomMentionRegex())]
    .map((match) => resolveEmployeeByToken(company, match[1] ?? "", allowedAgentIds))
    .filter((agentId): agentId is string => Boolean(agentId));

  return dedupeAgentIds(mentionedTargets);
}

export function searchRequirementRoomMentionCandidates(input: {
  company: Company | null | undefined;
  memberIds: string[];
  query: string;
}): RequirementRoomMentionCandidate[] {
  const { company, query } = input;
  if (!company) {
    return [];
  }

  const normalizedQuery = normalizeToken(query);
  const allowedAgentIds = new Set(dedupeAgentIds(input.memberIds));

  return company.employees
    .filter((employee) => allowedAgentIds.has(employee.agentId))
    .map((employee) => ({
      agentId: employee.agentId,
      label: employee.nickname,
      role: employee.role,
      score: (() => {
        if (!normalizedQuery) {
          return 1;
        }
        const values = [employee.nickname, employee.role, employee.agentId].map(normalizeToken);
        if (values.some((value) => value === normalizedQuery)) {
          return 4;
        }
        if (values.some((value) => value.startsWith(normalizedQuery))) {
          return 3;
        }
        if (values.some((value) => value.includes(normalizedQuery))) {
          return 2;
        }
        return 0;
      })(),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, "zh-Hans-CN"))
    .slice(0, 6)
    .map(({ score: _score, ...candidate }) => candidate);
}

export function annotateRequirementRoomMessage(input: {
  message: ChatMessage;
  sessionKey: string;
  agentId: string;
  ownerAgentId?: string | null;
}): ChatMessage | null {
  const normalized: ChatMessage = {
    ...input.message,
    timestamp: typeof input.message.timestamp === "number" ? input.message.timestamp : Date.now(),
  };

  if (normalized.role === "system" || normalized.role === "toolResult" || isToolOnlyAssistantMessage(normalized)) {
    return null;
  }

  const normalizedText = normalizeRequirementRoomText(extractTextFromMessage(normalized));
  if (!normalizedText && !hasRenderableImage(normalized)) {
    return null;
  }
  if (normalizedText === "ANNOUNCE_SKIP" || normalizedText === "NO_REPLY") {
    return null;
  }

  const roomMessage: ChatMessage = {
    ...normalized,
    roomSessionKey: input.sessionKey,
  };

  if (normalized.role === "assistant") {
    const provenance =
      typeof normalized.provenance === "object" && normalized.provenance
        ? (normalized.provenance as Record<string, unknown>)
        : {};
    roomMessage.roomAgentId = input.agentId;
    roomMessage.provenance = {
      ...provenance,
      sourceSessionKey:
        typeof provenance.sourceSessionKey === "string" ? provenance.sourceSessionKey : input.sessionKey,
    };
  }

  if (normalized.role === "user") {
    // 成员 session 里的 user 消息通常只是房间派发指令的落地回声，不是成员自己的结论。
    // 房间真相源应该保留 owner 发出的房间消息，以及成员 assistant 的回传结果。
    if (input.ownerAgentId && input.agentId !== input.ownerAgentId) {
      return null;
    }
    roomMessage.roomAudienceAgentIds = [input.agentId];
  }

  return roomMessage;
}

function buildRoomMessageId(input: {
  role: RequirementRoomMessage["role"];
  sessionKey: string;
  agentId?: string | null;
  timestamp: number;
  text: string;
  audienceAgentIds?: string[];
}): string {
  return [
    input.role,
    input.sessionKey,
    input.agentId ?? "room",
    input.timestamp,
    hashText(`${input.text}|${(input.audienceAgentIds ?? []).join(",")}`),
  ].join(":");
}

function toRequirementRoomMessage(input: {
  message: ChatMessage;
  sessionKey: string;
  agentId: string;
  roomId?: string;
  company?: Company | null;
  ownerAgentId?: string | null;
}): RequirementRoomMessage | null {
  const annotated = annotateRequirementRoomMessage(input);
  if (!annotated) {
    return null;
  }

  const text = extractTextFromMessage(annotated);
  const timestamp = typeof annotated.timestamp === "number" ? annotated.timestamp : Date.now();
  const senderEmployee = input.company?.employees.find((employee) => employee.agentId === input.agentId) ?? null;
  const audienceAgentIds =
    annotated.role === "user" && Array.isArray(annotated.roomAudienceAgentIds)
      ? dedupeAgentIds(annotated.roomAudienceAgentIds.map((agentId) => String(agentId)))
      : undefined;

  return {
    id: buildRoomMessageId({
      role: annotated.role === "assistant" ? "assistant" : "user",
      sessionKey: input.sessionKey,
      agentId: annotated.role === "assistant" ? input.agentId : null,
      timestamp,
      text,
      audienceAgentIds,
    }),
    roomId: input.roomId,
    role: annotated.role === "assistant" ? "assistant" : "user",
    text: text || undefined,
    content: getRenderableMessageContent(annotated),
    timestamp,
    visibility: "public",
    source: annotated.role === "assistant" ? "member_reply" : "user",
    senderAgentId: annotated.role === "assistant" ? input.agentId : undefined,
    senderLabel: annotated.role === "assistant" ? senderEmployee?.nickname : undefined,
    senderRole: annotated.role === "assistant" ? senderEmployee?.role : undefined,
    targetActorIds: audienceAgentIds,
    audienceAgentIds,
    sourceSessionKey: input.sessionKey,
    sourceRefs: {
      providerSessionKey: input.sessionKey,
    },
  };
}

function mergeRoomAudience(messages: RequirementRoomMessage[]): string[] {
  return dedupeAgentIds(messages.flatMap((message) => message.audienceAgentIds ?? []));
}

export function mergeRequirementRoomTranscript(
  messages: RequirementRoomMessage[],
): RequirementRoomMessage[] {
  const sorted = [...messages].sort((left, right) => left.timestamp - right.timestamp);
  const result: RequirementRoomMessage[] = [];

  for (const message of sorted) {
    const textSignature = normalizeRequirementRoomText(message.text ?? "");
    const last = result[result.length - 1];

    if (
      last &&
      message.role === "user" &&
      last.role === "user" &&
      textSignature.length > 0 &&
      textSignature === normalizeRequirementRoomText(last.text ?? "") &&
      Math.abs(message.timestamp - last.timestamp) <= 5_000
    ) {
      last.audienceAgentIds = mergeRoomAudience([last, message]);
      continue;
    }

    if (
      last &&
      message.role === "assistant" &&
      last.role === "assistant" &&
      message.senderAgentId === last.senderAgentId &&
      textSignature.length > 0 &&
      textSignature === normalizeRequirementRoomText(last.text ?? "") &&
      Math.abs(message.timestamp - last.timestamp) <= 4_000
    ) {
      continue;
    }

    result.push(message);
  }

  return result.slice(-ROOM_MESSAGE_LIMIT);
}

export function buildRequirementRoomRecord(input: {
  companyId?: string;
  workItemId?: string | null;
  sessionKey: string;
  title: string;
  memberIds: string[];
  ownerAgentId?: string | null;
  topicKey?: string | null;
  transcript?: RequirementRoomMessage[];
  createdAt?: number;
  updatedAt?: number;
  lastSourceSyncAt?: number;
  providerId?: string;
  providerConversationRefs?: ProviderConversationRef[];
}): RequirementRoomRecord {
  const now = input.updatedAt ?? Date.now();
  const workItemId = input.workItemId?.trim() || undefined;
  const roomId = workItemId ? buildRoomRecordIdFromWorkItem(workItemId) : input.sessionKey;
  const providerConversationRefs =
    input.providerConversationRefs ??
    (input.providerId && !isProductRoomSessionKey(input.sessionKey)
      ? [
          {
            providerId: input.providerId,
            conversationId: input.sessionKey,
            actorId: parseAgentIdFromSessionKey(input.sessionKey),
            nativeRoom: input.sessionKey.includes(":group:"),
          },
        ]
      : []);
  return {
    id: roomId,
    companyId: input.companyId,
    workItemId,
    sessionKey: input.sessionKey,
    title: input.title.trim() || "需求团队",
    topicKey: normalizeRoomTopicKey(input.topicKey) ?? undefined,
    ownerActorId: input.ownerAgentId ?? null,
    memberActorIds: dedupeAgentIds(input.memberIds),
    status: "active",
    providerConversationRefs,
    memberIds: dedupeAgentIds(input.memberIds),
    ownerAgentId: input.ownerAgentId ?? null,
    transcript: mergeRequirementRoomTranscript(input.transcript ?? []),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    lastSourceSyncAt: input.lastSourceSyncAt,
  };
}

export function buildRequirementRoomRecordFromSessions(input: {
  company: Company | null | undefined;
  companyId?: string;
  workItemId?: string | null;
  sessionKey: string;
  title: string;
  memberIds: string[];
  ownerAgentId?: string | null;
  topicKey?: string | null;
  seedTranscript?: RequirementRoomMessage[];
  sessions: Array<{ sessionKey: string; agentId: string; messages: ChatMessage[] }>;
  providerId?: string;
}): RequirementRoomRecord {
  const transcript = mergeRequirementRoomTranscript([
    ...(input.seedTranscript ?? []),
    ...input.sessions.flatMap((session) =>
      session.messages
        .map((message) =>
          toRequirementRoomMessage({
            message,
            sessionKey: session.sessionKey,
            agentId: session.agentId,
            roomId: input.workItemId?.trim()
              ? buildRoomRecordIdFromWorkItem(input.workItemId.trim())
              : input.sessionKey,
            company: input.company,
            ownerAgentId: input.ownerAgentId,
          }),
        )
        .filter((message): message is RequirementRoomMessage => Boolean(message)),
      ),
  ]);

  const latestTimestamp = transcript.reduce((latest, message) => Math.max(latest, message.timestamp), 0);
  const effectiveUpdatedAt = latestTimestamp || Date.now();

  return buildRequirementRoomRecord({
    companyId: input.companyId ?? input.company?.id,
    workItemId: input.workItemId,
    sessionKey: input.sessionKey,
    title: input.title,
    memberIds: input.memberIds,
    ownerAgentId: input.ownerAgentId,
    topicKey: input.topicKey,
    transcript,
    updatedAt: effectiveUpdatedAt,
    lastSourceSyncAt: latestTimestamp || undefined,
    providerId: input.providerId,
  });
}

export function mergeRequirementRoomRecordFromSessions(input: {
  company: Company | null | undefined;
  room: RequirementRoomRecord | null | undefined;
  companyId?: string;
  workItemId?: string | null;
  sessionKey: string;
  title: string;
  memberIds: string[];
  ownerAgentId?: string | null;
  topicKey?: string | null;
  sessions: Array<{ sessionKey: string; agentId: string; messages: ChatMessage[] }>;
  providerId?: string;
}): RequirementRoomRecord {
  const existingRoom = input.room ?? null;
  const syncFloor = Math.max(0, (existingRoom?.lastSourceSyncAt ?? 0) - 5_000);
  const incomingMessages = input.sessions.flatMap((session) =>
    session.messages
      .filter((message) => {
        const timestamp = typeof message.timestamp === "number" ? message.timestamp : 0;
        return timestamp <= 0 || timestamp >= syncFloor;
      })
      .map((message) =>
        toRequirementRoomMessage({
          message,
          sessionKey: session.sessionKey,
          agentId: session.agentId,
          roomId:
            existingRoom?.workItemId ?? input.workItemId
              ? buildRoomRecordIdFromWorkItem((existingRoom?.workItemId ?? input.workItemId)!.trim())
              : input.sessionKey,
          company: input.company,
          ownerAgentId: existingRoom?.ownerAgentId ?? input.ownerAgentId,
        }),
      )
      .filter((message): message is RequirementRoomMessage => Boolean(message)),
  );
  const transcript = mergeRequirementRoomTranscript([
    ...(existingRoom?.transcript ?? []),
    ...incomingMessages,
  ]);
  const latestSourceTimestamp = incomingMessages.reduce(
    (latest, message) => Math.max(latest, message.timestamp),
    existingRoom?.lastSourceSyncAt ?? 0,
  );
  const updatedAt = transcript.reduce(
    (latest, message) => Math.max(latest, message.timestamp),
    existingRoom?.updatedAt ?? Date.now(),
  );

  return buildRequirementRoomRecord({
    companyId: input.companyId ?? input.company?.id ?? existingRoom?.companyId,
    workItemId: existingRoom?.workItemId ?? input.workItemId,
    sessionKey: input.sessionKey,
    title: existingRoom?.title ?? input.title,
    memberIds: dedupeAgentIds([...(existingRoom?.memberIds ?? []), ...input.memberIds]),
    ownerAgentId: existingRoom?.ownerAgentId ?? input.ownerAgentId,
    topicKey: existingRoom?.topicKey ?? input.topicKey,
    transcript,
    createdAt: existingRoom?.createdAt,
    updatedAt,
    lastSourceSyncAt: latestSourceTimestamp || existingRoom?.lastSourceSyncAt,
    providerId: input.providerId,
  });
}

export function buildRoomConversationBindingsFromSessions(input: {
  roomId: string;
  providerId?: string | null;
  sessions: Array<{ sessionKey: string; agentId: string }>;
  updatedAt?: number;
}): RoomConversationBindingRecord[] {
  const providerId = input.providerId ?? "unknown";
  const updatedAt = input.updatedAt ?? Date.now();
  return input.sessions.map((session) => ({
    roomId: input.roomId,
    providerId,
    conversationId: session.sessionKey,
    actorId: session.agentId,
    nativeRoom: session.sessionKey.includes(":group:"),
    updatedAt,
  }));
}

export function appendRequirementRoomMessages(input: {
  room: RequirementRoomRecord;
  messages: RequirementRoomMessage[];
  meta?: Partial<Omit<RequirementRoomRecord, "id" | "sessionKey" | "transcript" | "createdAt">>;
}): RequirementRoomRecord {
  const latestTimestamp = input.messages.reduce(
    (latest, message) => Math.max(latest, message.timestamp),
    input.room.updatedAt,
  );

  return {
    ...input.room,
    ...input.meta,
    memberIds: dedupeAgentIds([...(input.room.memberIds ?? []), ...(input.meta?.memberIds ?? [])]),
    topicKey: normalizeRoomTopicKey(input.meta?.topicKey) ?? input.room.topicKey,
    transcript: mergeRequirementRoomTranscript([...input.room.transcript, ...input.messages]),
    updatedAt: latestTimestamp,
    lastSourceSyncAt: input.meta?.lastSourceSyncAt ?? input.room.lastSourceSyncAt,
  };
}

export function createOutgoingRequirementRoomMessage(input: {
  roomId?: string;
  sessionKey: string;
  text: string;
  audienceAgentIds: string[];
  timestamp?: number;
}): RequirementRoomMessage {
  const timestamp = input.timestamp ?? Date.now();
  return {
    id: buildRoomMessageId({
      role: "user",
      sessionKey: input.sessionKey,
      timestamp,
      text: input.text,
      audienceAgentIds: input.audienceAgentIds,
    }),
    roomId: input.roomId,
    role: "user",
    text: input.text,
    content: [{ type: "text", text: input.text }],
    timestamp,
    visibility: "public",
    source: "user",
    targetActorIds: dedupeAgentIds(input.audienceAgentIds),
    audienceAgentIds: dedupeAgentIds(input.audienceAgentIds),
    sourceSessionKey: input.sessionKey,
    sourceRefs: {
      providerSessionKey: input.sessionKey,
    },
  };
}

export function createIncomingRequirementRoomMessage(input: {
  company: Company | null | undefined;
  message: ChatMessage;
  sessionKey: string;
  agentId: string;
  roomId?: string;
  ownerAgentId?: string | null;
}): RequirementRoomMessage | null {
  return toRequirementRoomMessage(input);
}

export function convertRequirementRoomRecordToChatMessages(
  room: RequirementRoomRecord | null | undefined,
): ChatMessage[] {
  if (!room) {
    return [];
  }

  return room.transcript.map((message) => ({
    role: message.role,
    text: message.text,
    content: message.content,
    timestamp: message.timestamp,
    roomAgentId: message.senderAgentId,
    roomAudienceAgentIds: message.audienceAgentIds,
    roomSessionKey: message.sourceSessionKey ?? room.sessionKey,
  }));
}

function normalizeRoomAudienceIds(value: unknown): string[] {
  return Array.isArray(value)
    ? dedupeAgentIds(value.map((agentId) => String(agentId)))
    : [];
}

function roomAudienceIdsEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeRoomAudienceIds(left);
  const normalizedRight = normalizeRoomAudienceIds(right);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((agentId, index) => agentId === normalizedRight[index]);
}

export function areRequirementRoomChatMessagesEqual(
  left: ChatMessage[],
  right: ChatMessage[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }
    return (
      message.role === other.role &&
      extractTextFromMessage(message) === extractTextFromMessage(other) &&
      (typeof message.timestamp === "number" ? message.timestamp : 0) ===
        (typeof other.timestamp === "number" ? other.timestamp : 0) &&
      (message.roomAgentId ?? null) === (other.roomAgentId ?? null) &&
      (message.roomSessionKey ?? null) === (other.roomSessionKey ?? null) &&
      roomAudienceIdsEqual(message.roomAudienceAgentIds, other.roomAudienceAgentIds)
    );
  });
}

function mergeAudienceIds(messages: ChatMessage[]): string[] {
  return dedupeAgentIds(
    messages.flatMap((message) =>
      Array.isArray(message.roomAudienceAgentIds)
        ? message.roomAudienceAgentIds.map((agentId) => String(agentId))
        : [],
    ),
  );
}

export function dedupeRequirementRoomMessages(messages: ChatMessage[]): ChatMessage[] {
  const sorted = [...messages].sort(
    (left, right) => (typeof left.timestamp === "number" ? left.timestamp : 0) - (typeof right.timestamp === "number" ? right.timestamp : 0),
  );
  const result: ChatMessage[] = [];

  for (const message of sorted) {
    const textSignature = normalizeRequirementRoomText(extractTextFromMessage(message));
    const timestamp = typeof message.timestamp === "number" ? message.timestamp : 0;
    const last = result[result.length - 1];

    if (
      last &&
      message.role === "user" &&
      last.role === "user" &&
      textSignature === normalizeRequirementRoomText(extractTextFromMessage(last)) &&
      Math.abs(timestamp - (typeof last.timestamp === "number" ? last.timestamp : 0)) <= 5_000
    ) {
      last.roomAudienceAgentIds = mergeAudienceIds([last, message]);
      continue;
    }

    if (
      last &&
      message.role === "assistant" &&
      last.role === "assistant" &&
      message.roomAgentId === last.roomAgentId &&
      textSignature.length > 0 &&
      textSignature === normalizeRequirementRoomText(extractTextFromMessage(last)) &&
      Math.abs(timestamp - (typeof last.timestamp === "number" ? last.timestamp : 0)) <= 4_000
    ) {
      continue;
    }

    result.push(message);
  }

  return result;
}

export function mergeRequirementRoomMessages(input: {
  ownerAgentId?: string | null;
  sessions: Array<{ sessionKey: string; agentId: string; messages: ChatMessage[] }>;
}): ChatMessage[] {
  const transcript = mergeRequirementRoomTranscript(
    input.sessions.flatMap((session) =>
      session.messages
        .map((message) =>
          createIncomingRequirementRoomMessage({
            company: null,
            message,
            sessionKey: session.sessionKey,
            agentId: session.agentId,
            ownerAgentId: input.ownerAgentId,
          }),
        )
        .filter((message): message is RequirementRoomMessage => Boolean(message)),
    ),
  );

  return convertRequirementRoomRecordToChatMessages({
    id: "temp-room",
    sessionKey: "temp-room",
    title: "需求团队",
    memberIds: [],
    memberActorIds: [],
    status: "active",
    transcript,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
