import type { GatewaySessionRow } from "../features/backend";
import type { Company, CyberCompanyConfig } from "../features/company/types";
import type {
  RequirementRoomRecord,
  RoomConversationBindingRecord,
} from "../features/company/types";
import { resolveSessionActorId, resolveSessionTitle } from "./sessions";

type EmployeeIdentity = {
  agentId: string;
  nickname: string;
  role: string;
};

type ConversationPresentationInput = {
  sessionKey?: string | null;
  actorId?: string | null;
  displayName?: string | null;
  label?: string | null;
  companyId?: string | null;
  rooms?: RequirementRoomRecord[];
  bindings?: RoomConversationBindingRecord[];
  employees?: EmployeeIdentity[];
};

export function buildCompanyChatRoute(
  chatId: string,
  companyId?: string | null,
): string {
  const route = `/chat/${encodeURIComponent(chatId)}`;
  return appendCompanyScopeToChatRoute(route, companyId);
}

export function appendCompanyScopeToChatRoute(
  route: string,
  companyId?: string | null,
): string {
  const normalizedCompanyId = companyId?.trim();
  if (!normalizedCompanyId) {
    return route;
  }

  const [pathname, search = ""] = route.split("?", 2);
  const params = new URLSearchParams(search);
  params.set("cid", normalizedCompanyId);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function findCompaniesByAgentId(
  config: CyberCompanyConfig | null | undefined,
  agentId: string | null | undefined,
): Company[] {
  const normalizedAgentId = agentId?.trim();
  if (!config || !normalizedAgentId) {
    return [];
  }

  return config.companies.filter((company) =>
    company.employees.some((employee) => employee.agentId === normalizedAgentId),
  );
}

function resolveBoundRoomId(input: ConversationPresentationInput): string | null {
  const sessionKey = input.sessionKey?.trim();
  if (!sessionKey) {
    return null;
  }

  const boundRoomId =
    input.bindings?.find((binding) => binding.conversationId === sessionKey)?.roomId ??
    null;

  return boundRoomId?.trim() || null;
}

export function resolveConversationPresentation(
  input: ConversationPresentationInput,
): { title: string; route: string } {
  const { rooms = [], employees = [] } = input;
  const roomId = resolveBoundRoomId(input);
  const room = roomId ? rooms.find((candidate) => candidate.id === roomId) ?? null : null;
  if (room) {
    return {
      title: room.title,
      route: buildCompanyChatRoute(`room:${room.id}`, input.companyId ?? room.companyId),
    };
  }

  const actorId =
    input.actorId?.trim() ||
    resolveSessionActorId(
      input.sessionKey
        ? {
            key: input.sessionKey,
            actorId: input.actorId ?? null,
          }
        : null,
    );
  if (actorId) {
    const employee = employees.find((candidate) => candidate.agentId === actorId) ?? null;
    return {
      title:
        employee?.nickname ??
        input.displayName?.trim() ??
        input.label?.trim() ??
        actorId,
      route: buildCompanyChatRoute(actorId, input.companyId),
    };
  }

  const fallbackTitle =
    input.displayName?.trim() ||
    input.label?.trim() ||
    "未知会话";

  return {
    title: fallbackTitle,
    route: input.sessionKey
      ? buildCompanyChatRoute(input.sessionKey, input.companyId)
      : buildCompanyChatRoute(fallbackTitle, input.companyId),
  };
}

export function resolveSessionPresentation(input: {
  session: GatewaySessionRow;
  companyId?: string | null;
  rooms?: RequirementRoomRecord[];
  bindings?: RoomConversationBindingRecord[];
  employees?: EmployeeIdentity[];
}): { title: string; route: string } {
  const { session } = input;
  return resolveConversationPresentation({
    sessionKey: session.key,
    actorId: resolveSessionActorId(session),
    displayName: session.displayName,
    label: resolveSessionTitle(session),
    companyId: input.companyId,
    rooms: input.rooms,
    bindings: input.bindings,
    employees: input.employees,
  });
}
