import type { DecisionTicketRecord } from "../../domain/delegation/types";

type RequirementDecisionIdentity = {
  aggregateId?: string | null;
  workItemId?: string | null;
  sourceConversationId?: string | null;
  roomId?: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function matchesRequirementIdentity(
  ticket: DecisionTicketRecord,
  identity: RequirementDecisionIdentity,
): boolean {
  const aggregateId = readString(identity.aggregateId);
  const workItemId = readString(identity.workItemId);
  const sourceConversationId = readString(identity.sourceConversationId);
  const roomId = readString(identity.roomId);

  return Boolean(
    (aggregateId && ticket.aggregateId === aggregateId) ||
      (workItemId && ticket.workItemId === workItemId) ||
      (sourceConversationId && ticket.sourceConversationId === sourceConversationId) ||
      (roomId && ticket.roomId === roomId) ||
      (aggregateId && ticket.sourceId === aggregateId) ||
      (workItemId && ticket.sourceId === workItemId) ||
      (sourceConversationId && ticket.sourceId === sourceConversationId),
  );
}

export function isOpenRequirementDecisionTicket(ticket: DecisionTicketRecord): boolean {
  return (
    ticket.sourceType === "requirement" &&
    (ticket.status === "open" || ticket.status === "pending_human")
  );
}

export function selectOpenRequirementDecisionTicket(input: {
  activeDecisionTickets: DecisionTicketRecord[];
  aggregateId?: string | null;
  workItemId?: string | null;
  sourceConversationId?: string | null;
  roomId?: string | null;
}): DecisionTicketRecord | null {
  return (
    [...input.activeDecisionTickets]
      .filter(isOpenRequirementDecisionTicket)
      .filter((ticket) => matchesRequirementIdentity(ticket, input))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
  );
}

export function selectLatestRequirementDecisionTicket(input: {
  activeDecisionTickets: DecisionTicketRecord[];
  aggregateId?: string | null;
  workItemId?: string | null;
  sourceConversationId?: string | null;
  roomId?: string | null;
}): DecisionTicketRecord | null {
  return (
    [...input.activeDecisionTickets]
      .filter((ticket) => ticket.sourceType === "requirement")
      .filter((ticket) => matchesRequirementIdentity(ticket, input))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
  );
}

export function buildRequirementDecisionTicketId(input: {
  sourceType: DecisionTicketRecord["sourceType"];
  sourceId: string;
  decisionType: DecisionTicketRecord["decisionType"];
}): string {
  if (input.sourceType === "escalation") {
    return `decision:${input.sourceId}`;
  }
  return `decision:requirement:${input.decisionType}:${input.sourceId}`;
}

export function buildRequirementDecisionResolutionMessage(input: {
  ticket: DecisionTicketRecord;
  optionId: string;
}): string | null {
  const option =
    input.ticket.options.find((candidate) => candidate.id === input.optionId) ?? null;
  if (!option) {
    return null;
  }
  if (input.ticket.decisionType === "requirement_change") {
    return `我已确认这次需求变更：${option.label}。请立即按这个决策更新当前范围、负责人、下一步和受影响任务，并在需求房同步。`;
  }
  return `我已做出决策：${option.label}。请立即按这个选择继续推进，并明确回我：1. 现在已启动哪一步 2. 当前负责人是谁 3. 下一次回传会给我什么结果。`;
}
