export type DispatchStatus =
  | "pending"
  | "sent"
  | "acknowledged"
  | "answered"
  | "blocked"
  | "superseded";

export type DispatchDeliveryState =
  | "unknown"
  | "pending"
  | "sent"
  | "delivered"
  | "acknowledged"
  | "answered"
  | "blocked"
  | "consumed"
  | "failed";

export type DispatchCheckoutState = "open" | "claimed" | "released";
export type DispatchReleaseReason = "answered" | "blocked" | "superseded";

export type RoomVisibility = "public" | "system" | "debug";

export type RoomMessageSource =
  | "user"
  | "owner_dispatch"
  | "member_reply"
  | "member_message"
  | "system";

export type RoomStatus = "active" | "paused" | "archived";
export type RequirementRoomScope =
  | "company"
  | "department"
  | "support_request"
  | "escalation"
  | "decision";

export interface ProviderConversationRef {
  providerId: string;
  conversationId: string;
  actorId?: string | null;
  nativeRoom?: boolean;
}

export interface DispatchRecord {
  id: string;
  workItemId: string;
  revision?: number;
  roomId?: string | null;
  title: string;
  summary: string;
  fromActorId?: string | null;
  targetActorIds: string[];
  status: DispatchStatus;
  deliveryState?: DispatchDeliveryState;
  sourceMessageId?: string;
  responseMessageId?: string;
  providerRunId?: string;
  topicKey?: string;
  latestEventId?: string;
  consumedAt?: number | null;
  consumerSessionKey?: string | null;
  checkoutState?: DispatchCheckoutState;
  checkoutActorId?: string | null;
  checkoutSessionKey?: string | null;
  checkedOutAt?: number | null;
  releasedAt?: number | null;
  releaseReason?: DispatchReleaseReason | null;
  syncSource?: "event" | "history";
  createdAt: number;
  updatedAt: number;
}

export interface RoomMessage {
  id: string;
  role: "user" | "assistant";
  roomId?: string;
  text?: string;
  content?: unknown;
  timestamp: number;
  senderAgentId?: string;
  senderLabel?: string;
  senderRole?: string;
  transport?: "company_report" | "sessions_send" | "inferred";
  reportStatus?: "acknowledged" | "answered" | "blocked";
  messageIntent?: "report" | "relay_notice" | "work_update" | "dispatch";
  metadata?: unknown;
  provenance?: Record<string, unknown>;
  visibility?: RoomVisibility;
  source?: RoomMessageSource;
  targetActorIds?: string[];
  audienceAgentIds?: string[];
  sourceSessionKey?: string;
  sourceRefs?: {
    providerMessageId?: string;
    providerRunId?: string;
    providerSessionKey?: string;
  };
}

export interface RoomRecord {
  id: string;
  companyId?: string;
  workItemId?: string;
  title: string;
  headline?: string;
  ownerActorId?: string | null;
  batonActorId?: string | null;
  memberActorIds: string[];
  status: RoomStatus;
  progress?: string;
  lastConclusionAt?: number | null;
  providerConversationRefs?: ProviderConversationRef[];
  transcript: RoomMessage[];
  createdAt: number;
  updatedAt: number;
}

export type RequirementRoomMessage = RoomMessage;

export interface RoomConversationBindingRecord extends ProviderConversationRef {
  roomId: string;
  updatedAt: number;
}

export interface RequirementRoomRecord extends RoomRecord {
  sessionKey: string;
  revision?: number;
  topicKey?: string;
  scope?: RequirementRoomScope;
  memberIds: string[];
  ownerAgentId?: string | null;
  lastSourceSyncAt?: number;
}

export type HandoffStatus = "pending" | "acknowledged" | "blocked" | "completed";

export interface HandoffRecord {
  id: string;
  sessionKey: string;
  taskId?: string;
  fromAgentId?: string;
  toAgentIds: string[];
  title: string;
  summary: string;
  status: HandoffStatus;
  checklist?: string[];
  missingItems?: string[];
  artifactUrls?: string[];
  artifactPaths?: string[];
  sourceMessageTs?: number;
  syncSource?: "event" | "history";
  createdAt: number;
  updatedAt: number;
}

export type RequestStatus =
  | "pending"
  | "acknowledged"
  | "answered"
  | "blocked"
  | "superseded";

export type RequestResolution = "pending" | "complete" | "partial" | "manual_takeover";

export interface RequestRecord {
  id: string;
  dispatchId?: string;
  sessionKey: string;
  topicKey?: string;
  taskId?: string;
  handoffId?: string;
  fromAgentId?: string;
  toAgentIds: string[];
  title: string;
  summary: string;
  status: RequestStatus;
  deliveryState?: DispatchDeliveryState;
  resolution: RequestResolution;
  requiredItems?: string[];
  responseSummary?: string;
  responseDetails?: string;
  eventId?: string;
  consumedAt?: number | null;
  consumerSessionKey?: string | null;
  sourceMessageTs?: number;
  responseMessageTs?: number;
  syncSource?: "event" | "history" | "normalized";
  transport?: "company_report" | "sessions_send" | "inferred";
  createdAt: number;
  updatedAt: number;
}

export type SupportRequestStatus =
  | "open"
  | "acknowledged"
  | "in_progress"
  | "fulfilled"
  | "blocked"
  | "cancelled";

export interface SupportRequestRecord {
  id: string;
  revision?: number;
  workItemId: string;
  parentWorkItemId?: string | null;
  requesterDepartmentId: string;
  targetDepartmentId: string;
  requestedByActorId: string;
  ownerActorId?: string | null;
  roomId?: string | null;
  summary: string;
  detail?: string;
  status: SupportRequestStatus;
  slaDueAt?: number | null;
  escalationId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type EscalationSourceType = "work_item" | "support_request" | "org_policy";
export type EscalationSeverity = "warning" | "critical";
export type EscalationStatus = "open" | "acknowledged" | "resolved" | "dismissed";

export interface EscalationRecord {
  id: string;
  revision?: number;
  sourceType: EscalationSourceType;
  sourceId: string;
  companyId: string;
  workItemId?: string | null;
  requesterDepartmentId?: string | null;
  targetActorId: string;
  reason: string;
  severity: EscalationSeverity;
  status: EscalationStatus;
  roomId?: string | null;
  decisionTicketId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type DecisionTicketType =
  | "budget"
  | "headcount"
  | "strategy"
  | "legal"
  | "priority_conflict"
  | "requirement_gate"
  | "requirement_change";
export type DecisionTicketStatus = "open" | "pending_human" | "resolved" | "cancelled";

export interface DecisionTicketOptionRecord {
  id: string;
  label: string;
  summary?: string | null;
}

export interface DecisionTicketRecord {
  id: string;
  companyId: string;
  revision?: number;
  sourceType: "escalation" | "requirement";
  sourceId: string;
  escalationId?: string | null;
  aggregateId?: string | null;
  workItemId?: string | null;
  sourceConversationId?: string | null;
  decisionOwnerActorId: string;
  decisionType: DecisionTicketType;
  summary: string;
  options: DecisionTicketOptionRecord[];
  requiresHuman: boolean;
  status: DecisionTicketStatus;
  resolution?: string | null;
  resolutionOptionId?: string | null;
  roomId?: string | null;
  createdAt: number;
  updatedAt: number;
}
