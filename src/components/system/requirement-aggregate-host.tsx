import { useEffect, useMemo, useRef } from "react";
import { parseChatEventPayload } from "../../application/delegation/chat-dispatch";
import { gateway, useGatewayStore } from "../../application/gateway";
import { useCompanyRuntimeStore } from "../../infrastructure/company/runtime/store";
import { resolveSessionActorId } from "../../lib/sessions";

function extractMessageText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const candidate = message as { text?: unknown; content?: unknown };
  if (typeof candidate.text === "string" && candidate.text.trim().length > 0) {
    return candidate.text.trim();
  }
  if (typeof candidate.content === "string" && candidate.content.trim().length > 0) {
    return candidate.content.trim();
  }
  if (!Array.isArray(candidate.content)) {
    return null;
  }
  const text = candidate.content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }
      if (block && typeof block === "object") {
        const record = block as Record<string, unknown>;
        if (record.type === "text" && typeof record.text === "string") {
          return record.text;
        }
      }
      return "";
    })
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

export function RequirementAggregateHost() {
  const connected = useGatewayStore((state) => state.connected);
  const activeCompany = useCompanyRuntimeStore((state) => state.activeCompany);
  const authorityBackedState = useCompanyRuntimeStore((state) => state.authorityBackedState);
  const ingestRequirementEvidence = useCompanyRuntimeStore((state) => state.ingestRequirementEvidence);
  const companyAgentIds = useMemo(
    () => new Set(activeCompany?.employees.map((employee) => employee.agentId) ?? []),
    [activeCompany],
  );
  const seenCompanyEventIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const lastSyncedCompanyEventAtRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (authorityBackedState || !connected || !activeCompany) {
      return;
    }

    const unsubscribe = gateway.subscribe("chat", (rawPayload) => {
      const payload = parseChatEventPayload(rawPayload);
      if (!payload) {
        return;
      }
      const actorId = resolveSessionActorId(payload.sessionKey);
      if (!actorId || !companyAgentIds.has(actorId)) {
        return;
      }
      ingestRequirementEvidence({
        id: `chat:${payload.runId || payload.sessionKey}:${payload.seq}:${payload.state}`,
        companyId: activeCompany.id,
        aggregateId: null,
        source: "gateway-chat",
        sessionKey: payload.sessionKey,
        actorId,
        eventType: `chat_${payload.state}`,
        timestamp:
          payload.message && typeof payload.message.timestamp === "number"
            ? payload.message.timestamp
            : Date.now(),
        payload: {
          runId: payload.runId,
          seq: payload.seq,
          state: payload.state,
          messageText: extractMessageText(payload.message),
          errorMessage: payload.errorMessage,
        },
        applied: false,
      });
    });

    return () => unsubscribe();
  }, [activeCompany, authorityBackedState, companyAgentIds, connected, ingestRequirementEvidence]);

  useEffect(() => {
    if (authorityBackedState || !connected || !activeCompany) {
      return;
    }

    const seenIds =
      seenCompanyEventIdsRef.current.get(activeCompany.id) ?? new Set<string>();
    seenCompanyEventIdsRef.current.set(activeCompany.id, seenIds);

    let cancelled = false;
    const syncCompanyEvents = async () => {
      try {
        const since = lastSyncedCompanyEventAtRef.current.get(activeCompany.id);
        let cursor: string | undefined;
        let nextLatestTimestamp = since ?? 0;

        do {
          const page = await gateway.listCompanyEvents({
            companyId: activeCompany.id,
            since,
            cursor,
            limit: 200,
          });
          if (cancelled) {
            return;
          }
          for (const event of page.events ?? []) {
            nextLatestTimestamp = Math.max(nextLatestTimestamp, event.createdAt);
            const evidenceId = `company-event:${event.eventId}`;
            if (seenIds.has(evidenceId)) {
              continue;
            }
            seenIds.add(evidenceId);
            ingestRequirementEvidence({
              id: evidenceId,
              companyId: activeCompany.id,
              aggregateId: event.workItemId ?? null,
              source: "company-event",
              sessionKey: event.sessionKey ?? null,
              actorId: event.fromActorId ?? null,
              eventType: event.kind,
              timestamp: event.createdAt,
              payload: {
                ...event.payload,
                dispatchId: event.dispatchId,
                parentDispatchId: event.parentDispatchId,
                workItemId: event.workItemId,
                topicKey: event.topicKey,
                roomId: event.roomId,
                fromActorId: event.fromActorId,
                targetActorId: event.targetActorId,
                providerRunId: event.providerRunId,
              },
              applied: false,
            });
          }
          cursor = page.nextCursor ?? undefined;
        } while (cursor && !cancelled);

        if (nextLatestTimestamp > 0) {
          lastSyncedCompanyEventAtRef.current.set(activeCompany.id, nextLatestTimestamp);
        }
      } catch (error) {
        console.warn("Failed to ingest requirement company events", error);
      }
    };

    void syncCompanyEvents();
    const timer = window.setInterval(() => void syncCompanyEvents(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeCompany, authorityBackedState, connected, ingestRequirementEvidence]);

  return null;
}
