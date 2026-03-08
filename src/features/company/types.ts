export interface CyberCompanyConfig {
  version: 1;
  companies: Company[];
  activeCompanyId: string;
  preferences: { theme: string; locale: string };
}

export interface Company {
  id: string;
  name: string; // "AI 内容工厂"
  description: string;
  icon: string; // emoji
  template: string; // 使用的模板 ID
  orgSettings?: CompanyOrgSettings;
  departments?: Department[];
  employees: EmployeeRef[];
  quickPrompts: QuickPrompt[];
  workspaceApps?: CompanyWorkspaceApp[];
  tasks?: TrackedTask[];
  handoffs?: HandoffRecord[];
  requests?: RequestRecord[];
  knowledgeItems?: SharedKnowledgeItem[];
  retrospectives?: RetrospectiveRecord[];
  createdAt: number;
}

export interface CompanyOrgSettings {
  autoCalibrate?: boolean;
  lastAutoCalibratedAt?: number;
  lastAutoCalibrationActions?: string[];
}

export interface Department {
  id: string;
  name: string;
  leadAgentId: string;
  color?: string;
  order?: number;
  archived?: boolean;
}

export interface EmployeeRef {
  agentId: string; // OpenClaw Agent ID
  nickname: string; // "小李"
  role: string; // "内容写手"
  isMeta: boolean; // 是否为 meta-agent
  metaRole?: "ceo" | "hr" | "cto" | "coo";
  reportsTo?: string; // 指向上级 agentId (如无则视为顶级节点)
  departmentId?: string;
  avatarJobId?: string; // Avatar Forge VRM 任务 ID
}

export interface QuickPrompt {
  label: string; // "写日报"
  icon: string;
  prompt: string; // 实际发送的内容
  targetAgentId: string;
}

export type CompanyWorkspaceAppKind =
  | "novel-reader"
  | "consistency-hub"
  | "cto-workbench"
  | "custom";

export type CompanyWorkspaceAppStatus = "ready" | "recommended" | "building";

export interface CompanyWorkspaceApp {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  kind: CompanyWorkspaceAppKind;
  status: CompanyWorkspaceAppStatus;
  ownerAgentId?: string;
}

export type WorkItemStatus =
  | "draft"
  | "active"
  | "waiting_review"
  | "waiting_owner"
  | "completed"
  | "blocked"
  | "archived";

export type WorkStepStatus = "pending" | "active" | "done" | "blocked" | "skipped";

export type DispatchStatus =
  | "pending"
  | "sent"
  | "acknowledged"
  | "answered"
  | "blocked"
  | "superseded";

export type ArtifactStatus = "draft" | "ready" | "superseded" | "archived";

export type RoomVisibility = "public" | "system" | "debug";
export type RoomMessageSource = "user" | "owner_dispatch" | "member_reply" | "system";
export type RoomStatus = "active" | "paused" | "archived";

export interface ProviderConversationRef {
  providerId: string;
  conversationId: string;
  actorId?: string | null;
  nativeRoom?: boolean;
}

export interface WorkStepRecord {
  id: string;
  title: string;
  assigneeActorId?: string | null;
  assigneeLabel: string;
  status: WorkStepStatus;
  completionCriteria?: string | null;
  detail?: string | null;
  updatedAt: number;
}

export interface DispatchRecord {
  id: string;
  workItemId: string;
  roomId?: string | null;
  title: string;
  summary: string;
  fromActorId?: string | null;
  targetActorIds: string[];
  status: DispatchStatus;
  sourceMessageId?: string;
  responseMessageId?: string;
  providerRunId?: string;
  topicKey?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ArtifactRecord {
  id: string;
  workItemId?: string | null;
  title: string;
  kind: string;
  status: ArtifactStatus;
  ownerActorId?: string | null;
  providerId?: string | null;
  sourceActorId?: string | null;
  sourceName?: string | null;
  sourcePath?: string;
  sourceUrl?: string;
  summary?: string;
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
  ownerActorId?: string | null;
  memberActorIds: string[];
  status: RoomStatus;
  providerConversationRefs?: ProviderConversationRef[];
  transcript: RoomMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface RequirementRoomMessage extends RoomMessage {}

export interface RoomConversationBindingRecord extends ProviderConversationRef {
  roomId: string;
  updatedAt: number;
}

export interface RequirementRoomRecord extends RoomRecord {
  sessionKey: string;
  topicKey?: string;
  memberIds: string[];
  ownerAgentId?: string | null;
  lastSourceSyncAt?: number;
}

export interface ConversationMissionStepRecord {
  id: string;
  title: string;
  assigneeLabel: string;
  assigneeAgentId?: string | null;
  status: "done" | "wip" | "pending";
  statusLabel: string;
  detail?: string | null;
  isCurrent: boolean;
  isNext: boolean;
}

export interface ConversationMissionRecord {
  id: string;
  sessionKey: string;
  topicKey?: string;
  roomId?: string;
  startedAt?: number;
  title: string;
  statusLabel: string;
  progressLabel: string;
  ownerAgentId?: string | null;
  ownerLabel: string;
  currentStepLabel: string;
  nextAgentId?: string | null;
  nextLabel: string;
  summary: string;
  guidance: string;
  completed: boolean;
  updatedAt: number;
  planSteps: ConversationMissionStepRecord[];
}

export interface WorkItemRecord {
  id: string;
  companyId: string;
  sessionKey?: string;
  topicKey?: string;
  title: string;
  goal: string;
  status: WorkItemStatus;
  stageLabel: string;
  ownerActorId?: string | null;
  ownerLabel: string;
  batonActorId?: string | null;
  batonLabel: string;
  roomId?: string | null;
  artifactIds: string[];
  dispatchIds: string[];
  startedAt: number;
  updatedAt: number;
  completedAt?: number | null;
  summary: string;
  nextAction: string;
  steps: WorkStepRecord[];
  sourceMissionId?: string;
}

export type RoundMessageSnapshot = {
  role: "user" | "assistant" | "system" | "toolResult";
  text: string;
  timestamp: number;
};

export interface RoundRecord {
  id: string;
  companyId: string;
  workItemId?: string | null;
  roomId?: string | null;
  title: string;
  preview?: string | null;
  reason?: "new" | "reset" | "deleted" | "product";
  sourceActorId?: string | null;
  sourceActorLabel?: string | null;
  sourceSessionKey?: string | null;
  sourceConversationId?: string | null;
  providerArchiveId?: string | null;
  providerId?: string | null;
  messages: RoundMessageSnapshot[];
  archivedAt: number;
  restorable: boolean;
}

export type TaskStepStatus = "done" | "wip" | "pending";
export type TaskExecutionState =
  | "idle"
  | "running"
  | "waiting_input"
  | "waiting_peer"
  | "blocked_timeout"
  | "blocked_tool_failure"
  | "manual_takeover_required"
  | "completed"
  | "unknown";

export interface TaskStep {
  text: string;
  status: TaskStepStatus;
  assignee?: string; // @角色名
}

export interface TrackedTask {
  id: string; // 唯一 ID (基于 sessionKey hash)
  title: string; // 任务标题
  sessionKey: string; // 关联的 session key
  agentId: string; // 发起/负责的 agent
  steps: TaskStep[];
  createdAt: number;
  updatedAt: number;
  source?: "session" | "file"; // 任务来源: session=会话解析, file=文件解析
  sourceAgentId?: string; // 文件来源时对应的 agentId (用于跳转)
  ownerAgentId?: string;
  assigneeAgentIds?: string[];
  state?: TaskExecutionState;
  summary?: string;
  blockedReason?: string;
  takeoverSessionKey?: string;
  lastSyncedAt?: number;
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
  sessionKey: string;
  topicKey?: string;
  taskId?: string;
  handoffId?: string;
  fromAgentId?: string;
  toAgentIds: string[];
  title: string;
  summary: string;
  status: RequestStatus;
  resolution: RequestResolution;
  requiredItems?: string[];
  responseSummary?: string;
  sourceMessageTs?: number;
  responseMessageTs?: number;
  createdAt: number;
  updatedAt: number;
}

export type SharedKnowledgeKind =
  | "canon"
  | "responsibility"
  | "roadmap"
  | "workflow"
  | "foreshadow";

export type SharedKnowledgeStatus = "active" | "watch" | "draft";

export interface SharedKnowledgeItem {
  id: string;
  kind: SharedKnowledgeKind;
  title: string;
  summary: string;
  details?: string;
  ownerAgentIds?: string[];
  source?: "seeded" | "derived" | "manual" | "imported";
  status: SharedKnowledgeStatus;
  updatedAt: number;
}

export interface RetrospectiveRecord {
  id: string;
  periodLabel: string;
  summary: string;
  wins: string[];
  risks: string[];
  actionItems: string[];
  generatedAt: number;
}
