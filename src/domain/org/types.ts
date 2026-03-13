import type { SharedKnowledgeItem } from "../artifact/types";
import type {
  DecisionTicketRecord,
  EscalationRecord,
  HandoffRecord,
  RequestRecord,
  SupportRequestRecord,
} from "../delegation/types";
import type { TrackedTask } from "../mission/types";
import type { RetrospectiveRecord } from "../governance/types";
import type { ArtifactResourceType } from "../artifact/types";

export interface CyberCompanyConfig {
  version: 1;
  companies: Company[];
  activeCompanyId: string;
  preferences: { theme: string; locale: string };
}

export interface Company {
  id: string;
  name: string;
  description: string;
  icon: string;
  template: string;
  system?: CompanySystemMetadata;
  orgSettings?: CompanyOrgSettings;
  departments?: Department[];
  employees: EmployeeRef[];
  quickPrompts: QuickPrompt[];
  workspaceApps?: CompanyWorkspaceApp[];
  skillDefinitions?: SkillDefinition[];
  skillRuns?: SkillRunRecord[];
  capabilityRequests?: CapabilityRequestRecord[];
  capabilityIssues?: CapabilityIssueRecord[];
  tasks?: TrackedTask[];
  handoffs?: HandoffRecord[];
  requests?: RequestRecord[];
  supportRequests?: SupportRequestRecord[];
  escalations?: EscalationRecord[];
  decisionTickets?: DecisionTicketRecord[];
  knowledgeItems?: SharedKnowledgeItem[];
  retrospectives?: RetrospectiveRecord[];
  createdAt: number;
}

export interface CompanySystemMetadata {
  reserved?: boolean;
  kind?: "openclaw-main";
  mappedAgentId?: string;
}

export interface CompanyOrgSettings {
  autoCalibrate?: boolean;
  lastAutoCalibratedAt?: number;
  lastAutoCalibrationActions?: string[];
  autonomyPolicy?: CompanyAutonomyPolicy;
  autonomyState?: CompanyAutonomyState;
  collaborationPolicy?: CompanyCollaborationPolicy;
}

export interface CompanyAutonomyPolicy {
  autoApproveInternalReassignments?: boolean;
  autoApproveSupportRequests?: boolean;
  humanApprovalRequiredForLayoffs?: boolean;
  humanApprovalRequiredForDepartmentCreateRemove?: boolean;
  maxAutoHeadcountDelta?: number;
  maxAutoBudgetDelta?: number;
  supportSlaHours?: number;
  departmentBlockerEscalationHours?: number;
}

export interface CompanyDepartmentAutonomyCounter {
  departmentId: string;
  overloadStreak: number;
  underloadStreak: number;
  lastLoadScore: number;
  updatedAt: number;
}

export interface CompanyAutonomyState {
  lastEngineRunAt?: number;
  lastEngineActions?: string[];
  departmentCounters?: CompanyDepartmentAutonomyCounter[];
}

export interface CollaborationEdge {
  fromAgentId?: string;
  fromDepartmentId?: string;
  toAgentId?: string;
  toDepartmentId?: string;
}

export interface CompanyCollaborationPolicy {
  globalDispatchMetaRoles?: Array<NonNullable<EmployeeRef["metaRole"]>>;
  allowDepartmentLeadToDispatchWithinDepartment?: boolean;
  allowDepartmentLeadToDispatchToSupportLeads?: boolean;
  allowDepartmentLeadToDispatchToCeo?: boolean;
  allowDepartmentMembersWithinDepartment?: boolean;
  allowDepartmentMembersToManager?: boolean;
  explicitEdges?: CollaborationEdge[];
}

export interface Department {
  id: string;
  name: string;
  leadAgentId: string;
  kind?: "meta" | "support" | "business";
  color?: string;
  order?: number;
  missionPolicy?: "support_only" | "manager_delegated" | "direct_execution";
  archived?: boolean;
}

export interface EmployeeRef {
  agentId: string;
  nickname: string;
  role: string;
  isMeta: boolean;
  metaRole?: "ceo" | "hr" | "cto" | "coo";
  reportsTo?: string;
  departmentId?: string;
  avatarJobId?: string;
}

export interface QuickPrompt {
  label: string;
  icon: string;
  prompt: string;
  targetAgentId: string;
}

export type CompanyWorkspaceAppKind =
  | "novel-reader"
  | "consistency-hub"
  | "knowledge-hub"
  | "cto-workbench"
  | "custom";

export type CompanyWorkspaceAppStatus = "ready" | "recommended" | "building";

export type CompanyWorkspaceAppSurface = "template" | "embedded";

export type CompanyWorkspaceAppTemplate =
  | "reader"
  | "consistency"
  | "knowledge"
  | "workbench"
  | "review-console"
  | "dashboard";

export interface CompanyWorkspaceAppEmbeddedPermissions {
  resources: "manifest-scoped";
  appState: "readwrite" | "readonly";
  companyWrites: "none";
  actions: "whitelisted" | "none";
}

export interface CompanyWorkspaceApp {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  kind: CompanyWorkspaceAppKind;
  status: CompanyWorkspaceAppStatus;
  ownerAgentId?: string;
  surface?: CompanyWorkspaceAppSurface;
  template?: CompanyWorkspaceAppTemplate;
  manifestArtifactId?: string | null;
  embeddedHostKey?: string | null;
  embeddedPermissions?: CompanyWorkspaceAppEmbeddedPermissions | null;
}

export type SkillDefinitionStatus = "draft" | "ready" | "degraded" | "retired";
export type SkillDefinitionTrigger = "app_action" | "workflow_step";
export type SkillRunTrigger = SkillDefinitionTrigger | "manual";
export type SkillRunStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface SkillDefinition {
  id: string;
  title: string;
  summary: string;
  ownerAgentId: string;
  status: SkillDefinitionStatus;
  entryPath: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  writesResourceTypes?: ArtifactResourceType[];
  allowedTriggers: SkillDefinitionTrigger[];
  smokeTest?: string | null;
  manifestActionIds?: string[];
  appIds?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SkillRunRecord {
  id: string;
  skillId: string;
  appId?: string | null;
  triggerType: SkillRunTrigger;
  triggerActionId?: string | null;
  triggerLabel?: string | null;
  requestedByActorId?: string | null;
  requestedByLabel?: string | null;
  status: SkillRunStatus;
  inputSummary?: string;
  outputArtifactIds?: string[];
  outputResourceTypes?: ArtifactResourceType[];
  errorMessage?: string | null;
  startedAt: number;
  completedAt?: number | null;
  updatedAt: number;
}

export type CapabilityRequestType = "tool" | "app" | "check" | "import";
export type CapabilityRequestStatus =
  | "open"
  | "triaged"
  | "building"
  | "ready"
  | "verified"
  | "closed";

export interface CapabilityRequestRecord {
  id: string;
  type: CapabilityRequestType;
  summary: string;
  detail?: string;
  requesterActorId?: string | null;
  requesterLabel?: string | null;
  requesterDepartmentId?: string | null;
  ownerActorId?: string | null;
  appId?: string | null;
  skillId?: string | null;
  status: CapabilityRequestStatus;
  createdAt: number;
  updatedAt: number;
}

export type CapabilityIssueType = "unavailable" | "runtime_error" | "bad_result";
export type CapabilityIssueStatus =
  | "open"
  | "acknowledged"
  | "fixing"
  | "ready_for_verify"
  | "verified"
  | "closed";

export interface CapabilityIssueRecord {
  id: string;
  type: CapabilityIssueType;
  summary: string;
  detail?: string;
  reporterActorId?: string | null;
  reporterLabel?: string | null;
  reporterDepartmentId?: string | null;
  ownerActorId?: string | null;
  appId?: string | null;
  skillId?: string | null;
  status: CapabilityIssueStatus;
  createdAt: number;
  updatedAt: number;
}
