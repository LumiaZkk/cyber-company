export type ChatRequirementMetricName =
  | "draft_requirement_shown"
  | "draft_requirement_continue_chat"
  | "draft_requirement_promoted_manual"
  | "draft_requirement_promoted_auto"
  | "requirement_room_opened_from_ceo_chat"
  | "board_fallback_rendered_from_task_board"
  | "sync_stale_warning_shown";

type ChatRequirementMetricEvent = {
  id: string;
  companyId: string;
  conversationId: string | null;
  requirementId: string | null;
  name: ChatRequirementMetricName;
  timestamp: number;
  metadata?: Record<string, string | number | boolean | null>;
};

const MAX_EVENTS = 200;

function buildStorageKey(companyId: string) {
  return `cyber-company:chat-requirement-metrics:${companyId}`;
}

function loadEvents(companyId: string): ChatRequirementMetricEvent[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(buildStorageKey(companyId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function trackChatRequirementMetric(input: {
  companyId: string | null | undefined;
  conversationId: string | null;
  requirementId: string | null;
  name: ChatRequirementMetricName;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  if (!input.companyId || typeof window === "undefined") {
    return;
  }
  const nextEvent: ChatRequirementMetricEvent = {
    id: crypto.randomUUID(),
    companyId: input.companyId,
    conversationId: input.conversationId,
    requirementId: input.requirementId,
    name: input.name,
    timestamp: Date.now(),
    metadata: input.metadata,
  };
  try {
    window.localStorage.setItem(
      buildStorageKey(input.companyId),
      JSON.stringify([nextEvent, ...loadEvents(input.companyId)].slice(0, MAX_EVENTS)),
    );
  } catch {
    // Best-effort only.
  }
}
