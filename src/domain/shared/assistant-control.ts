import type { RequirementStageGateStatus } from "../mission/types";

export type AssistantControlDecisionType = "requirement_gate" | "requirement_change";

export interface AssistantControlDecisionOption {
  id: string;
  label: string;
  summary?: string | null;
}

export interface AssistantControlRequirementDraft {
  summary: string;
  nextAction: string;
  ownerActorId?: string | null;
  ownerLabel?: string | null;
  stage?: string | null;
  topicKey?: string | null;
  canProceed?: boolean | null;
  stageGateStatus: RequirementStageGateStatus;
}

export interface AssistantControlDecision {
  key: string;
  type: AssistantControlDecisionType;
  summary: string;
  options: AssistantControlDecisionOption[];
  requiresHuman: true;
  aggregateId?: string | null;
  workItemId?: string | null;
  sourceConversationId?: string | null;
}

export interface AssistantControlEnvelopeV1 {
  version: 1;
  requirementDraft?: AssistantControlRequirementDraft;
  decision?: AssistantControlDecision;
}

type AssistantControlCarrier = Record<string, unknown> & {
  metadata?: unknown;
  requirementDraft?: unknown;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStageGateStatus(value: unknown): RequirementStageGateStatus {
  return value === "waiting_confirmation" || value === "confirmed" ? value : "none";
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "是", "可以", "可推进"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0", "否", "不可以", "不可推进"].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeDecisionOptions(value: unknown): AssistantControlDecisionOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const options: AssistantControlDecisionOption[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const record = entry as Record<string, unknown>;
    const id = readString(record.id);
    const label = readString(record.label);
    if (!id || !label) {
      return;
    }
    options.push({
      id,
      label,
      summary: readString(record.summary),
    });
  });
  return options;
}

function normalizeRequirementDraft(
  value: unknown,
): AssistantControlRequirementDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const summary = readString(record.summary);
  const nextAction = readString(record.nextAction);
  if (!summary || !nextAction) {
    return null;
  }
  return {
    summary,
    nextAction,
    ownerActorId: readString(record.ownerActorId),
    ownerLabel: readString(record.ownerLabel),
    stage: readString(record.stage),
    topicKey: readString(record.topicKey),
    canProceed: normalizeBoolean(record.canProceed),
    stageGateStatus: normalizeStageGateStatus(record.stageGateStatus),
  };
}

function normalizeDecision(value: unknown): AssistantControlDecision | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const key = readString(record.key);
  const summary = readString(record.summary);
  const type = readString(record.type);
  const options = normalizeDecisionOptions(record.options);
  if (
    !key ||
    !summary ||
    (type !== "requirement_gate" && type !== "requirement_change") ||
    options.length === 0
  ) {
    return null;
  }
  return {
    key,
    type,
    summary,
    options,
    requiresHuman: true,
    aggregateId: readString(record.aggregateId),
    workItemId: readString(record.workItemId),
    sourceConversationId: readString(record.sourceConversationId),
  };
}

function normalizeControlEnvelope(value: unknown): AssistantControlEnvelopeV1 | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const version = record.version;
  if (version !== 1) {
    return null;
  }
  const requirementDraft = normalizeRequirementDraft(record.requirementDraft);
  const decision = normalizeDecision(record.decision);
  if (!requirementDraft && !decision) {
    return null;
  }
  return {
    version: 1,
    ...(requirementDraft ? { requirementDraft } : {}),
    ...(decision ? { decision } : {}),
  };
}

export function readAssistantControlEnvelope(
  message: AssistantControlCarrier | null | undefined,
): AssistantControlEnvelopeV1 | null {
  if (!message) {
    return null;
  }
  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null;
  const control = normalizeControlEnvelope(metadata?.control);
  if (control) {
    return control;
  }
  const legacyRequirementDraft = normalizeRequirementDraft(
    metadata?.requirementDraft ?? message.requirementDraft,
  );
  if (!legacyRequirementDraft) {
    return null;
  }
  return {
    version: 1,
    requirementDraft: legacyRequirementDraft,
  };
}
