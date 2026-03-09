import type { GatewaySessionRow } from "../features/backend";

export function parseAgentIdFromSessionKey(sessionKey: string): string | null {
  if (!sessionKey.startsWith("agent:")) {
    return null;
  }

  const parts = sessionKey.split(":");
  if (parts.length < 3) {
    return null;
  }

  const agentId = parts[1]?.trim();
  return agentId && agentId.length > 0 ? agentId : null;
}

export type LegacyConversationRoute = {
  isLegacyConversationRoute: boolean;
  legacyRouteSessionKey: string | null;
  legacyRouteActorId: string | null;
  isLegacyGroupRoute: boolean;
  legacyGroupTopic: string | null;
};

export function resolveLegacyConversationRoute(
  routeValue: string | null | undefined,
): LegacyConversationRoute {
  const normalized = routeValue?.trim() ?? "";
  if (!normalized || !normalized.includes(":")) {
    return {
      isLegacyConversationRoute: false,
      legacyRouteSessionKey: null,
      legacyRouteActorId: null,
      isLegacyGroupRoute: false,
      legacyGroupTopic: null,
    };
  }

  const legacyRouteSessionKey = normalized.split("?")[0] ?? null;
  const isLegacyGroupRoute = Boolean(
    legacyRouteSessionKey && legacyRouteSessionKey.includes(":group:"),
  );

  return {
    isLegacyConversationRoute: true,
    legacyRouteSessionKey,
    legacyRouteActorId: isLegacyGroupRoute ? null : parseAgentIdFromSessionKey(legacyRouteSessionKey ?? ""),
    isLegacyGroupRoute,
    legacyGroupTopic:
      isLegacyGroupRoute && legacyRouteSessionKey
        ? legacyRouteSessionKey.split(":group:")[1] ?? null
        : null,
  };
}

export function resolveSessionActorId(
  session: Pick<GatewaySessionRow, "key" | "actorId"> | string | null | undefined,
): string | null {
  if (!session) {
    return null;
  }
  if (typeof session === "string") {
    return parseAgentIdFromSessionKey(session);
  }
  if (typeof session.actorId === "string" && session.actorId.trim().length > 0) {
    return session.actorId.trim();
  }
  return parseAgentIdFromSessionKey(session.key);
}

export function resolveSessionUpdatedAt(session: GatewaySessionRow): number {
  return typeof session.updatedAt === "number" ? session.updatedAt : 0;
}

export function resolveSessionTitle(session: GatewaySessionRow): string {
  if (typeof session.derivedTitle === "string" && session.derivedTitle.trim().length > 0) {
    return session.derivedTitle;
  }
  if (typeof session.label === "string" && session.label.trim().length > 0) {
    return session.label;
  }
  if (typeof session.displayName === "string" && session.displayName.trim().length > 0) {
    return session.displayName;
  }
  return session.key;
}

export function isSessionActive(
  session: GatewaySessionRow,
  now: number,
  activeWindowMs = 2 * 60 * 1000,
): boolean {
  if (session.abortedLastRun) {
    return false;
  }

  const updatedAt = resolveSessionUpdatedAt(session);
  if (!updatedAt) {
    return false;
  }

  return now - updatedAt <= activeWindowMs;
}
