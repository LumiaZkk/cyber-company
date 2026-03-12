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
