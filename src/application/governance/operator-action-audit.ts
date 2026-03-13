import { gateway } from "../gateway";
import { createCompanyEvent, type CompanyEvent } from "../../domain/delegation/events";

export type OperatorActionAuditSurface =
  | "chat"
  | "board"
  | "requirement_center"
  | "lobby";

export type OperatorActionAuditName =
  | "blueprint_copy"
  | "communication_recovery"
  | "focus_action_dispatch"
  | "group_chat_route_open"
  | "knowledge_sync"
  | "takeover_pack_copy"
  | "quick_task_assign"
  | "employee_hire"
  | "employee_role_update"
  | "employee_fire";
export type OperatorActionAuditOutcome = "succeeded" | "failed";

export function buildOperatorActionAuditEvent(input: {
  companyId: string;
  action: OperatorActionAuditName;
  surface: OperatorActionAuditSurface;
  outcome: OperatorActionAuditOutcome;
  force?: boolean;
  actorId?: string | null;
  error?: string | null;
  requestsAdded?: number;
  requestsUpdated?: number;
  tasksRecovered?: number;
  handoffsRecovered?: number;
  details?: Record<string, unknown>;
  timestamp?: number;
}): CompanyEvent {
  return createCompanyEvent({
    companyId: input.companyId,
    kind: "operator_action_recorded",
    fromActorId: input.actorId?.trim() || "operator:local-user",
    createdAt: input.timestamp ?? Date.now(),
    payload: {
      action: input.action,
      surface: input.surface,
      outcome: input.outcome,
      force: Boolean(input.force),
      error: input.error ?? null,
      requestsAdded: input.requestsAdded ?? 0,
      requestsUpdated: input.requestsUpdated ?? 0,
      tasksRecovered: input.tasksRecovered ?? 0,
      handoffsRecovered: input.handoffsRecovered ?? 0,
      ...(input.details ?? {}),
    },
  });
}

export async function appendOperatorActionAuditEvent(input: {
  companyId: string;
  action: OperatorActionAuditName;
  surface: OperatorActionAuditSurface;
  outcome: OperatorActionAuditOutcome;
  force?: boolean;
  actorId?: string | null;
  error?: string | null;
  requestsAdded?: number;
  requestsUpdated?: number;
  tasksRecovered?: number;
  handoffsRecovered?: number;
  details?: Record<string, unknown>;
  timestamp?: number;
}) {
  try {
    await gateway.appendCompanyEvent(buildOperatorActionAuditEvent(input));
  } catch (error) {
    console.warn("Failed to append operator action audit event", error);
  }
}
