import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import {
  buildManagedExecutorFiles,
  buildManagedExecutorFilesForCompany,
  listDesiredManagedExecutorAgents,
  resolveManagedExecutorProvisioningState,
  planManagedExecutorReconcile,
} from "./company-executor-sync";
import { CompanyOpsEngine } from "./company-ops-engine";
import {
  deleteCompanyStrongConsistency,
  removeManagedExecutorCompanyWorkspace,
  StrongCompanyDeleteError,
  waitForExecutorAgentsAbsent,
} from "./company-delete";
import { runAgentWorkspaceEntry } from "./agent-file-runner";
import { buildCompanyWorkspaceBootstrap } from "./company-workspace-bootstrap";
import {
  AUTHORITY_SCHEMA_VERSION,
  readAuthorityDoctorSnapshot,
  readAuthorityPreflightSnapshot,
} from "./ops";
import {
  mergeAuthorityControlledRuntimeSlices,
  reconcileAuthorityRequirementRuntime,
  runtimeRequirementControlChanged,
} from "./requirement-control-runtime";
import { createManagedFileMirrorQueue } from "./managed-file-mirror";
import { createOpenClawExecutorBridge } from "./openclaw-bridge";
import { resolveLocalOpenClawGatewayToken } from "./openclaw-local-auth";
import {
  repairAgentSessionsFromDispatches,
  reconcileDispatchesFromCompanyEvents,
  resolveSessionStatusCapabilityState,
  type SessionStatusCapabilityState,
} from "./runtime-authority";
import { parseCompanyBlueprint } from "../../../src/application/company/blueprint";
import { buildCollaborationContextSnapshot } from "../../../src/application/company/collaboration-context";
import {
  applyProviderSessionStatusToAgentRuntime,
  applyProviderRuntimeEvent,
  buildCanonicalAgentStatusProjection,
  buildCanonicalAgentStatusHealth,
  buildAgentRuntimeProjection,
  buildAgentSessionRecordsFromSessions,
  normalizeProviderRuntimeEvent,
  normalizeProviderSessionStatus,
  reconcileAgentSessionExecutionContext,
  type AgentRunRecord,
} from "../../../src/application/agent-runtime";
import {
  buildRoomConversationBindingKey,
  mergeRoomConversationBindings,
} from "../../../src/application/delegation/room-records";
import {
  buildRequirementWorkflowEvidence,
  buildRequirementWorkflowEvidencePayload,
  resolveRequirementWorkflowEventKind,
} from "../../../src/application/mission/requirement-workflow";
import {
  buildRoomRecordIdFromWorkItem,
  buildWorkItemRecordFromMission,
} from "../../../src/application/mission/work-item";
import { areWorkItemRecordsEquivalent } from "../../../src/application/mission/work-item-equivalence";
import { isArtifactRequirementTopic } from "../../../src/application/mission/requirement-kind";
import { reconcileWorkItemRecord } from "../../../src/application/mission/work-item-reconciler";
import { buildAuthorityHealthGuidance } from "../../../src/infrastructure/authority/health-guidance";
import { buildAuthorityExecutorReadinessChecks } from "../../../src/infrastructure/authority/executor-readiness";
import {
  reconcileRequirementAggregateState,
  sanitizeRequirementAggregateRecords,
} from "../../../src/application/mission/requirement-aggregate";
import { diffRequirementAggregateMaterialFields } from "../../../src/application/mission/requirement-aggregate-diff";
import { COMPANY_TEMPLATES } from "../../../src/application/company/templates";
import { normalizeWorkItemDepartmentOwnership } from "../../../src/application/org/department-autonomy";
import { sanitizeWorkItemRecords } from "../../../src/infrastructure/company/persistence/work-item-persistence";
import { areConversationStateRecordsEquivalent } from "../../../src/infrastructure/company/runtime/conversation-state";
import { isSameMissionRecord } from "../../../src/infrastructure/company/runtime/missions";
import { reconcileStoredWorkItems } from "../../../src/infrastructure/company/runtime/work-items";
import { normalizeEscalationRecord } from "../../../src/domain/delegation/escalation";
import { isSupportRequestActive, normalizeSupportRequestRecord } from "../../../src/domain/delegation/support-request";
import { createCompanyEvent, type CompanyEvent } from "../../../src/domain/delegation/events";
import { normalizeApprovalRecord, sortApprovals } from "../../../src/domain/governance/approval";
import type {
  DecisionTicketRecord,
  DispatchRecord,
  EscalationRecord,
  RequirementRoomRecord,
  RoomConversationBindingRecord,
  SupportRequestRecord,
} from "../../../src/domain/delegation/types";
import type { ArtifactRecord } from "../../../src/domain/artifact/types";
import type { ApprovalRecord } from "../../../src/domain/governance/types";
import type {
  ConversationMissionRecord,
  ConversationStateRecord,
  RequirementAggregateRecord,
  RequirementEvidenceEvent,
  RoundRecord,
  WorkItemRecord,
} from "../../../src/domain/mission/types";
import { buildDefaultOrgSettings } from "../../../src/domain/org/autonomy-policy";
import {
  planHiredEmployeesBatch,
} from "../../../src/domain/org/hiring";
import {
  buildDefaultMainCompany,
  isReservedSystemCompany,
} from "../../../src/domain/org/system-company";
import type { Company, CyberCompanyConfig, Department, EmployeeRef, QuickPrompt } from "../../../src/domain/org/types";
import type {
  AuthorityAppendCompanyEventRequest,
  AuthorityAppendRoomRequest,
  AuthorityAgentFileRunRequest,
  AuthorityAgentFileRunResponse,
  AuthorityAgentFilesResponse,
  AuthorityApprovalMutationResponse,
  AuthorityApprovalRequest,
  AuthorityApprovalResolveRequest,
  AuthorityBootstrapSnapshot,
  AuthorityBatchHireEmployeesRequest,
  AuthorityBatchHireEmployeesResponse,
  AuthorityChatSendRequest,
  AuthorityChatSendResponse,
  AuthorityCollaborationScopeResponse,
  AuthorityCompanyEventsResponse,
  AuthorityCompanyRuntimeSnapshot,
  AuthorityConversationStateDeleteRequest,
  AuthorityConversationStateUpsertRequest,
  AuthorityCreateCompanyRequest,
  AuthorityCreateCompanyResponse,
  AuthorityRetryCompanyProvisioningResponse,
  AuthorityArtifactDeleteRequest,
  AuthorityArtifactMirrorSyncRequest,
  AuthorityArtifactUpsertRequest,
  AuthorityDecisionTicketCancelRequest,
  AuthorityDecisionTicketDeleteRequest,
  AuthorityDecisionTicketResolveRequest,
  AuthorityDecisionTicketUpsertRequest,
  AuthorityDispatchDeleteRequest,
  AuthorityDispatchUpsertRequest,
  AuthorityEvent,
  AuthorityExecutorConfig,
  AuthorityExecutorCapabilitySnapshot,
  AuthorityExecutorConfigPatch,
  AuthorityExecutorStatus,
  AuthorityHealthSnapshot,
  AuthorityHireEmployeeInput,
  AuthorityHireEmployeeRequest,
  AuthorityHireEmployeeResponse,
  AuthorityMissionDeleteRequest,
  AuthorityMissionUpsertRequest,
  AuthorityRequirementPromoteRequest,
  AuthorityRequirementTransitionRequest,
  AuthorityRoundDeleteRequest,
  AuthorityRoundUpsertRequest,
  AuthorityRoomDeleteRequest,
  AuthorityRoomBindingsUpsertRequest,
  AuthorityRuntimeSyncRequest,
  AuthoritySessionHistoryResponse,
  AuthoritySessionListResponse,
  AuthoritySwitchCompanyRequest,
  AuthorityWorkItemDeleteRequest,
  AuthorityWorkItemUpsertRequest,
} from "../../../src/infrastructure/authority/contract";
import type { ChatMessage } from "../../../src/infrastructure/gateway/openclaw/sessions";
import type { ProviderRuntimeEvent } from "../../../src/infrastructure/gateway/runtime/types";
import { sanitizeRequirementEvidenceEvents } from "../../../src/infrastructure/company/persistence/requirement-evidence-persistence";

type StoredChatMessage = {
  role: "user" | "assistant" | "system" | "toolResult";
  content?: unknown;
  text?: string;
  timestamp?: number;
  [key: string]: unknown;
};

type RuntimeSliceTables =
  | "missions"
  | "conversation_states"
  | "work_items"
  | "requirement_aggregates"
  | "requirement_evidence"
  | "rooms"
  | "rounds"
  | "artifacts"
  | "dispatches"
  | "room_bindings"
  | "support_requests"
  | "escalations"
  | "decision_tickets";

const AUTHORITY_PORT = Number.parseInt(process.env.CYBER_COMPANY_AUTHORITY_PORT ?? "18790", 10);
const DATA_DIR = path.join(os.homedir(), ".cyber-company", "authority");
const DB_PATH = path.join(DATA_DIR, "authority.sqlite");
const DEFAULT_OPENCLAW_URL = "ws://localhost:18789";
const EXECUTOR_PROVIDER_ID = "openclaw";
let syncAuthorityAgentFileMirror:
  | ((file: { agentId: string; name: string; content: string }) => void)
  | null = null;
let sessionStatusCapabilityState: SessionStatusCapabilityState = "unknown";
let sessionStatusUnsupportedLogged = false;

const EMPTY_RUNTIME = (companyId: string): AuthorityCompanyRuntimeSnapshot => ({
  companyId,
  activeRoomRecords: [],
  activeMissionRecords: [],
  activeConversationStates: [],
  activeWorkItems: [],
  activeRequirementAggregates: [],
  activeRequirementEvidence: [],
  primaryRequirementId: null,
  activeRoundRecords: [],
  activeArtifacts: [],
  activeDispatches: [],
  activeRoomBindings: [],
  activeSupportRequests: [],
  activeEscalations: [],
  activeDecisionTickets: [],
  activeAgentSessions: [],
  activeAgentRuns: [],
  activeAgentRuntime: [],
  activeAgentStatuses: [],
  activeAgentStatusHealth: {
    source: "authority",
    coverage: "authority_partial",
    coveredAgentCount: 0,
    expectedAgentCount: 0,
    missingAgentIds: [],
    isComplete: false,
    generatedAt: Date.now(),
    note: "Authority runtime has not projected canonical agent statuses yet.",
  },
  updatedAt: Date.now(),
});

type StoredExecutorConfig = {
  type: "openclaw";
  openclaw: {
    url: string;
    token?: string;
  };
  connectionState?: AuthorityExecutorConfig["connectionState"];
  lastError?: string | null;
  lastConnectedAt?: number | null;
};

type ManagedExecutorAgentRow = {
  agentId: string;
  companyId: string | null;
  desiredPresent: boolean;
  updatedAt: number;
};

function createDefaultStoredExecutorConfig(): StoredExecutorConfig {
  return {
    type: "openclaw",
    openclaw: {
      url: DEFAULT_OPENCLAW_URL,
      token: "",
    },
    connectionState: "idle",
    lastError: null,
    lastConnectedAt: null,
  };
}

function sanitizeStoredExecutorConfig(value: unknown): StoredExecutorConfig {
  if (!value || typeof value !== "object") {
    return createDefaultStoredExecutorConfig();
  }
  const candidate = value as Partial<StoredExecutorConfig>;
  return {
    type: "openclaw",
    openclaw: {
      url:
        typeof candidate.openclaw?.url === "string" && candidate.openclaw.url.trim().length > 0
          ? candidate.openclaw.url.trim()
          : DEFAULT_OPENCLAW_URL,
      token: typeof candidate.openclaw?.token === "string" ? candidate.openclaw.token : "",
    },
    connectionState:
      candidate.connectionState === "idle" ||
      candidate.connectionState === "connecting" ||
      candidate.connectionState === "ready" ||
      candidate.connectionState === "degraded" ||
      candidate.connectionState === "blocked"
        ? candidate.connectionState
        : "idle",
    lastError:
      typeof candidate.lastError === "string" || candidate.lastError === null
        ? candidate.lastError ?? null
        : null,
    lastConnectedAt:
      typeof candidate.lastConnectedAt === "number" ? candidate.lastConnectedAt : null,
  };
}

function isPresent<T>(value: T | null | undefined | false): value is T {
  return Boolean(value);
}

function shallowJsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function updateSessionStatusCapability(outcome: "success" | "error", error?: unknown) {
  const previous = sessionStatusCapabilityState;
  sessionStatusCapabilityState = resolveSessionStatusCapabilityState({
    current: previous,
    outcome,
    error,
  });
  if (
    sessionStatusCapabilityState === "unsupported" &&
    previous !== "unsupported" &&
    !sessionStatusUnsupportedLogged
  ) {
    sessionStatusUnsupportedLogged = true;
    console.warn(
      "OpenClaw executor does not support session_status; Authority runtime repair will stay lifecycle/chat-driven.",
    );
  }
}

function buildExecutorCapabilitySnapshot(
  executor: AuthorityExecutorStatus,
): AuthorityExecutorCapabilitySnapshot {
  const sessionStatus =
    executor.state === "ready"
      ? sessionStatusCapabilityState
      : ("unknown" as const);
  const notes: string[] = [];
  if (sessionStatus === "unsupported") {
    notes.push("下游执行器不提供 session_status，Authority 会退回 lifecycle/chat 驱动的运行态修复。");
  } else if (sessionStatus === "unknown" && executor.state === "ready") {
    notes.push("Authority 尚未确认 session_status 能力，首次探测后会自动切换到真实边界。");
  }

  return {
    sessionStatus,
    processRuntime: "unsupported",
    notes,
  };
}

function normalizeDecisionTicketRevision(value: number | null | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1;
}

function normalizeApprovalRevision(value: number | null | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1;
}

function normalizeDecisionTicketRecord(
  companyId: string,
  ticket: DecisionTicketRecord,
): DecisionTicketRecord {
  return {
    ...ticket,
    companyId,
    revision: normalizeDecisionTicketRevision(ticket.revision),
    createdAt: ticket.createdAt || Date.now(),
    updatedAt: ticket.updatedAt || Date.now(),
  };
}

function decisionTicketMaterialChanged(
  existing: DecisionTicketRecord,
  next: DecisionTicketRecord,
): boolean {
  return (
    existing.sourceType !== next.sourceType ||
    existing.sourceId !== next.sourceId ||
    (existing.escalationId ?? null) !== (next.escalationId ?? null) ||
    (existing.aggregateId ?? null) !== (next.aggregateId ?? null) ||
    (existing.workItemId ?? null) !== (next.workItemId ?? null) ||
    (existing.sourceConversationId ?? null) !== (next.sourceConversationId ?? null) ||
    existing.decisionOwnerActorId !== next.decisionOwnerActorId ||
    existing.decisionType !== next.decisionType ||
    existing.summary !== next.summary ||
    !shallowJsonEqual(existing.options, next.options) ||
    existing.requiresHuman !== next.requiresHuman ||
    existing.status !== next.status ||
    (existing.resolution ?? null) !== (next.resolution ?? null) ||
    (existing.resolutionOptionId ?? null) !== (next.resolutionOptionId ?? null) ||
    (existing.roomId ?? null) !== (next.roomId ?? null)
  );
}

function approvalMaterialChanged(existing: ApprovalRecord, next: ApprovalRecord): boolean {
  return (
    existing.scope !== next.scope ||
    existing.actionType !== next.actionType ||
    existing.status !== next.status ||
    existing.summary !== next.summary ||
    (existing.detail ?? null) !== (next.detail ?? null) ||
    (existing.requestedByActorId ?? null) !== (next.requestedByActorId ?? null) ||
    (existing.requestedByLabel ?? null) !== (next.requestedByLabel ?? null) ||
    (existing.targetActorId ?? null) !== (next.targetActorId ?? null) ||
    (existing.targetLabel ?? null) !== (next.targetLabel ?? null) ||
    !shallowJsonEqual(existing.payload ?? {}, next.payload ?? {}) ||
    (existing.resolution ?? null) !== (next.resolution ?? null) ||
    (existing.decidedByActorId ?? null) !== (next.decidedByActorId ?? null) ||
    (existing.decidedByLabel ?? null) !== (next.decidedByLabel ?? null) ||
    (existing.resolvedAt ?? null) !== (next.resolvedAt ?? null)
  );
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function truncate(input: string, max = 80) {
  return input.length <= max ? input : `${input.slice(0, max - 1)}…`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeCompany(company: Company): Company {
  return {
    ...company,
    orgSettings: buildDefaultOrgSettings(company.orgSettings),
    approvals: sortApprovals(company.approvals ?? []),
    supportRequests: (company.supportRequests ?? [])
      .map(normalizeSupportRequestRecord)
      .filter(isSupportRequestActive),
    escalations: (company.escalations ?? [])
      .map(normalizeEscalationRecord)
      .filter(
      (item) => item.status === "open" || item.status === "acknowledged",
      ),
    decisionTickets: (company.decisionTickets ?? []).filter(
      (item) => item.status === "open" || item.status === "pending_human",
    ),
  };
}

function normalizeRuntimeSnapshot(
  company: Company | null | undefined,
  snapshot: AuthorityCompanyRuntimeSnapshot,
): AuthorityCompanyRuntimeSnapshot {
  const normalizeRevision = (value: number | null | undefined) =>
    Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1;
  return {
    ...snapshot,
    activeWorkItems: snapshot.activeWorkItems.map((workItem) =>
      normalizeWorkItemDepartmentOwnership({
        company,
        workItem,
      }),
    ),
    activeRoomRecords: (snapshot.activeRoomRecords ?? []).map((room) => ({
      ...room,
      revision: normalizeRevision(room.revision),
    })),
    activeArtifacts: (snapshot.activeArtifacts ?? []).map((artifact) => ({
      ...artifact,
      revision: normalizeRevision(artifact.revision),
    })),
    activeDispatches: (snapshot.activeDispatches ?? []).map((dispatch) => ({
      ...dispatch,
      revision: normalizeRevision(dispatch.revision),
    })),
    activeSupportRequests: (snapshot.activeSupportRequests ?? []).map(normalizeSupportRequestRecord),
    activeEscalations: (snapshot.activeEscalations ?? []).map(normalizeEscalationRecord),
    activeDecisionTickets: (snapshot.activeDecisionTickets ?? []).map((ticket) => ({
      ...ticket,
      revision: normalizeRevision(ticket.revision),
    })),
    activeAgentSessions: [...(snapshot.activeAgentSessions ?? [])].sort(
      (left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0),
    ),
    activeAgentRuns: [...(snapshot.activeAgentRuns ?? [])].sort(
      (left, right) => right.lastEventAt - left.lastEventAt,
    ),
    activeAgentRuntime: [...(snapshot.activeAgentRuntime ?? [])].sort((left, right) =>
      left.agentId.localeCompare(right.agentId),
    ),
    activeAgentStatuses: [...(snapshot.activeAgentStatuses ?? [])].sort((left, right) =>
      left.agentId.localeCompare(right.agentId),
    ),
    activeAgentStatusHealth: snapshot.activeAgentStatusHealth
      ? {
          ...snapshot.activeAgentStatusHealth,
          missingAgentIds: [...snapshot.activeAgentStatusHealth.missingAgentIds].sort((left, right) =>
            left.localeCompare(right),
          ),
        }
      : null,
  };
}

function normalizeExecutorRunState(value: unknown): AgentRunRecord["state"] | null {
  switch (value) {
    case "accepted":
    case "running":
    case "streaming":
    case "completed":
    case "aborted":
    case "error":
      return value;
    case "started":
      return "accepted";
    default:
      return null;
  }
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAgentAlreadyExistsError(error: unknown) {
  return stringifyError(error).includes("already exists");
}

function buildEmployeeBootstrapFile(input: AuthorityHireEmployeeInput & { agentId: string }) {
  const lines = [
    `# ${input.nickname?.trim() || input.role.trim()}`,
    "",
    `## Role`,
    input.role.trim(),
    "",
    `## Responsibilities`,
    input.description.trim(),
  ];

  if (input.traits?.trim()) {
    lines.push("", "## Traits", input.traits.trim());
  }
  if (typeof input.budget === "number") {
    lines.push("", "## Budget", `Daily budget target: ${input.budget} USD`);
  }
  if (input.modelTier) {
    lines.push("", "## Model Tier", input.modelTier);
  }

  lines.push("", "## Reporting", "Follow company dispatch and use `company_report` for structured status replies.");
  return {
    agentId: input.agentId,
    name: "ROLE.md",
    content: lines.join("\n"),
  };
}

function isAgentNotFoundError(error: unknown) {
  const message = stringifyError(error);
  return (
    message.includes("not found")
    || message.includes("unknown agent id")
    || message.includes("unknown agent")
  );
}

function isLegacyAgentsDeletePurgeStateError(error: unknown) {
  const message = stringifyError(error);
  return (
    message.includes("invalid agents.delete params") &&
    message.includes("unexpected property") &&
    message.includes("purgeState")
  );
}

function sendJson(response: import("node:http").ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendError(response: import("node:http").ServerResponse, status: number, message: string) {
  sendJson(response, status, { error: message });
}

function setCorsHeaders(response: import("node:http").ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJsonBody<T>(request: import("node:http").IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
}

type GatewayProxyRequest = {
  method: string;
  params?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ageMs(timestamp: number | null | undefined, now: number): number {
  return Math.max(0, now - (timestamp ?? 0));
}

function toPublicExecutorConfig(config: StoredExecutorConfig): AuthorityExecutorConfig {
  return {
    type: "openclaw",
    openclaw: {
      url: config.openclaw.url,
      tokenConfigured: Boolean(config.openclaw.token?.trim() || resolveLocalOpenClawGatewayToken()),
    },
    connectionState: config.connectionState ?? "idle",
    lastError: config.lastError ?? null,
    lastConnectedAt: config.lastConnectedAt ?? null,
  };
}

class AuthorityRepository {
  private readonly db: DatabaseSync;
  private readonly startedAt = Date.now();

  constructor(private readonly dbPath: string) {
    mkdirSync(DATA_DIR, { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initSchema();
  }

  getHealth(input?: {
    executor: AuthorityExecutorStatus;
    executorConfig: AuthorityExecutorConfig;
    executorCapabilities: AuthorityExecutorCapabilitySnapshot;
  }): AuthorityHealthSnapshot {
    const executorConfig = input?.executorConfig ?? toPublicExecutorConfig(this.loadExecutorConfig());
    const executor =
      input?.executor ??
      {
        adapter: "openclaw-bridge",
        state:
          executorConfig.connectionState === "ready"
            ? "ready"
            : executorConfig.connectionState === "blocked"
              ? "blocked"
              : "degraded",
        provider: executorConfig.connectionState === "ready" ? "openclaw" : "none",
        note:
          executorConfig.connectionState === "ready"
            ? "Authority 已接入 OpenClaw。"
            : executorConfig.lastError ?? "Authority 尚未接入 OpenClaw。",
      };
    const doctor = readAuthorityDoctorSnapshot({ dbPath: this.dbPath });
    const preflight = readAuthorityPreflightSnapshot({ dbPath: this.dbPath });
    const guidance = buildAuthorityHealthGuidance({
      doctor,
      preflight,
      executor,
    });
    return {
      ok: true,
      executor,
      executorConfig,
      executorCapabilities: input?.executorCapabilities ?? buildExecutorCapabilitySnapshot(executor),
      executorReadiness: buildAuthorityExecutorReadinessChecks({
        executor,
        executorConfig,
        executorCapabilities: input?.executorCapabilities ?? buildExecutorCapabilitySnapshot(executor),
      }),
      authority: {
        dbPath: this.dbPath,
        connected: true,
        startedAt: this.startedAt,
        doctor: {
          status: doctor.status,
          schemaVersion: doctor.schemaVersion,
          integrityStatus: doctor.integrityStatus,
          integrityMessage: doctor.integrityMessage,
          backupDir: doctor.backupDir,
          backupCount: doctor.backupCount,
          latestBackupAt: doctor.latestBackupAt,
          companyCount: doctor.companyCount,
          runtimeCount: doctor.runtimeCount,
          eventCount: doctor.eventCount,
          latestRuntimeAt: doctor.latestRuntimeAt,
          latestEventAt: doctor.latestEventAt,
          activeCompanyId: doctor.activeCompanyId,
          issues: doctor.issues,
        },
        preflight: {
          status: preflight.status,
          dataDir: preflight.dataDir,
          backupDir: preflight.backupDir,
          dbExists: preflight.dbExists,
          schemaVersion: preflight.schemaVersion,
          integrityStatus: preflight.integrityStatus,
          integrityMessage: preflight.integrityMessage,
          backupCount: preflight.backupCount,
          latestBackupAt: preflight.latestBackupAt,
          notes: preflight.notes,
          warnings: preflight.warnings,
          issues: preflight.issues,
        },
        guidance,
      },
    };
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        company_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        lead_agent_id TEXT,
        color TEXT,
        sort_order INTEGER,
        archived INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS employees (
        agent_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        role TEXT NOT NULL,
        is_meta INTEGER NOT NULL DEFAULT 0,
        meta_role TEXT,
        reports_to TEXT,
        department_id TEXT,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runtimes (
        company_id TEXT PRIMARY KEY,
        snapshot_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversations (
        session_key TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        actor_id TEXT,
        kind TEXT NOT NULL,
        label TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        session_key TEXT NOT NULL,
        role TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_files (
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (agent_id, name)
      );
      CREATE TABLE IF NOT EXISTS conversation_states (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS requirement_aggregates (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS requirement_evidence (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS room_bindings (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS support_requests (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS escalations (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decision_tickets (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dispatches (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rounds (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS event_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        company_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS executor_configs (
        id TEXT PRIMARY KEY,
        adapter TEXT NOT NULL,
        config_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS executor_runs (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        session_key TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS managed_executor_agents (
        agent_id TEXT PRIMARY KEY,
        company_id TEXT,
        desired_present INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
    `);
    this.writeMetadata("schemaVersion", String(AUTHORITY_SCHEMA_VERSION));

    const countRow = this.db.prepare("SELECT COUNT(*) as count FROM executor_configs").get() as
      | { count?: number }
      | undefined;
    if (!countRow?.count) {
      this.db.prepare(
        "INSERT INTO executor_configs (id, adapter, config_json, updated_at) VALUES (?, ?, ?, ?)",
      ).run(
        "default",
        "openclaw-bridge",
        JSON.stringify(createDefaultStoredExecutorConfig()),
        Date.now(),
      );
    }
  }

  private readMetadata(key: string) {
    const row = this.db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as
      | { value?: string }
      | undefined;
    return row?.value ?? null;
  }

  private writeMetadata(key: string, value: string) {
    this.db.prepare(`
      INSERT INTO metadata (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  private getActiveCompanyId() {
    return this.readMetadata("activeCompanyId");
  }

  private setActiveCompanyId(companyId: string | null) {
    this.writeMetadata("activeCompanyId", companyId ?? "");
  }

  loadExecutorConfig(): StoredExecutorConfig {
    const row = this.db.prepare("SELECT config_json FROM executor_configs WHERE id = ?").get("default") as
      | { config_json?: string }
      | undefined;
    return sanitizeStoredExecutorConfig(parseJson(row?.config_json, createDefaultStoredExecutorConfig()));
  }

  saveExecutorConfig(config: StoredExecutorConfig): StoredExecutorConfig {
    const normalized = sanitizeStoredExecutorConfig(config);
    this.db.prepare(`
      INSERT INTO executor_configs (id, adapter, config_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        adapter = excluded.adapter,
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
    `).run("default", "openclaw-bridge", JSON.stringify(normalized), Date.now());
    return normalized;
  }

  private readStoredConfig(): CyberCompanyConfig | null {
    const rows = this.db.prepare("SELECT company_json FROM companies ORDER BY created_at ASC").all() as Array<{
      company_json: string;
    }>;
    if (rows.length === 0) {
      return null;
    }
    const companies = rows
      .map((row) => parseJson<Company | null>(row.company_json, null))
      .map((company) => (company ? normalizeCompany(company) : null))
      .filter(isPresent);
    if (companies.length === 0) {
      return null;
    }
    const activeCompanyId =
      this.getActiveCompanyId() && companies.some((company) => company.id === this.getActiveCompanyId())
        ? this.getActiveCompanyId()!
        : companies[0]!.id;
    return {
      version: 1,
      companies,
      activeCompanyId,
      preferences: { theme: "classic", locale: "zh-CN" },
    };
  }

  loadConfig(): CyberCompanyConfig | null {
    const stored = this.readStoredConfig();
    if (stored) {
      return stored;
    }
    const defaultCompany = this.ensureDefaultMainCompany();
    return {
      version: 1,
      companies: [defaultCompany],
      activeCompanyId: defaultCompany.id,
      preferences: { theme: "classic", locale: "zh-CN" },
    };
  }

  private loadCompanyById(companyId: string): Company | null {
    const row = this.db.prepare("SELECT company_json FROM companies WHERE id = ?").get(companyId) as
      | { company_json?: string }
      | undefined;
    const company = parseJson<Company | null>(row?.company_json, null);
    return company ? normalizeCompany(company) : null;
  }

  private refreshManagedContextFiles(companyId: string, runtime: AuthorityCompanyRuntimeSnapshot) {
    const company = this.loadCompanyById(companyId);
    if (!company) {
      return;
    }
    for (const file of buildManagedExecutorFilesForCompany(company, {
      activeWorkItems: runtime.activeWorkItems,
      activeSupportRequests: runtime.activeSupportRequests,
      activeEscalations: runtime.activeEscalations,
      activeDecisionTickets: runtime.activeDecisionTickets,
    })) {
      const saved = this.setAgentFile(file.agentId, file.name, file.content);
      if (!saved.changed) {
        continue;
      }
      syncAuthorityAgentFileMirror?.({
        agentId: file.agentId,
        name: file.name,
        content: file.content,
      });
    }
  }

  listManagedExecutorAgents(): ManagedExecutorAgentRow[] {
    const rows = this.db.prepare(`
      SELECT agent_id, company_id, desired_present, updated_at
      FROM managed_executor_agents
      ORDER BY updated_at ASC, agent_id ASC
    `).all() as Array<{
      agent_id: string;
      company_id: string | null;
      desired_present: number;
      updated_at: number;
    }>;
    return rows.map((row) => ({
      agentId: row.agent_id,
      companyId: row.company_id ?? null,
      desiredPresent: row.desired_present === 1,
      updatedAt: row.updated_at,
    }));
  }

  private upsertManagedExecutorAgent(input: {
    agentId: string;
    companyId: string | null;
    desiredPresent: boolean;
  }) {
    this.db.prepare(`
      INSERT INTO managed_executor_agents (agent_id, company_id, desired_present, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        company_id = excluded.company_id,
        desired_present = excluded.desired_present,
        updated_at = excluded.updated_at
    `).run(
      input.agentId,
      input.companyId,
      input.desiredPresent ? 1 : 0,
      Date.now(),
    );
  }

  clearManagedExecutorAgent(agentId: string) {
    this.db.prepare("DELETE FROM managed_executor_agents WHERE agent_id = ?").run(agentId);
  }

  clearManagedExecutorAgentsForCompany(companyId: string) {
    this.db.prepare("DELETE FROM managed_executor_agents WHERE company_id = ?").run(companyId);
  }

  syncManagedExecutorAgentTargets(
    previousConfig: CyberCompanyConfig | null,
    nextConfig: CyberCompanyConfig | null,
  ) {
    const previousTargets = new Map(
      listDesiredManagedExecutorAgents(previousConfig).map((target) => [target.agentId, target] as const),
    );
    const nextTargets = new Map(
      listDesiredManagedExecutorAgents(nextConfig).map((target) => [target.agentId, target] as const),
    );
    const currentTargets = new Map(
      this.listManagedExecutorAgents().map((row) => [row.agentId, row] as const),
    );

    for (const target of nextTargets.values()) {
      this.upsertManagedExecutorAgent({
        agentId: target.agentId,
        companyId: target.companyId,
        desiredPresent: true,
      });
    }

    const absentIds = new Set<string>();
    for (const row of currentTargets.values()) {
      if (row.desiredPresent && !nextTargets.has(row.agentId)) {
        absentIds.add(row.agentId);
      }
    }
    for (const target of previousTargets.values()) {
      if (!nextTargets.has(target.agentId)) {
        absentIds.add(target.agentId);
      }
    }

    for (const agentId of absentIds) {
      this.upsertManagedExecutorAgent({
        agentId,
        companyId: currentTargets.get(agentId)?.companyId ?? previousTargets.get(agentId)?.companyId ?? null,
        desiredPresent: false,
      });
    }
  }

  ensureManagedExecutorAgentInventory() {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM managed_executor_agents").get() as
      | { count?: number }
      | undefined;
    if ((row?.count ?? 0) > 0) {
      return;
    }
    this.syncManagedExecutorAgentTargets(null, this.readStoredConfig());
  }

  private ensureDefaultMainCompany(): Company {
    const defaultTemplate = buildDefaultMainCompany();
    const existing = this.loadCompanyById(defaultTemplate.id);
    if (existing) {
      return existing;
    }

    const { company, agentFiles } = buildDefaultMainCompanyDefinition();
    this.saveConfig({
      version: 1,
      companies: [company],
      activeCompanyId: company.id,
      preferences: { theme: "classic", locale: "zh-CN" },
    });
    for (const file of agentFiles) {
      this.setAgentFile(file.agentId, file.name, file.content);
    }
    return company;
  }

  private replaceCompanyTables(company: Company) {
    this.db.prepare("DELETE FROM departments WHERE company_id = ?").run(company.id);
    this.db.prepare("DELETE FROM employees WHERE company_id = ?").run(company.id);
    for (const department of company.departments ?? []) {
      this.db.prepare(`
        INSERT INTO departments (id, company_id, name, lead_agent_id, color, sort_order, archived, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company_id = excluded.company_id,
          name = excluded.name,
          lead_agent_id = excluded.lead_agent_id,
          color = excluded.color,
          sort_order = excluded.sort_order,
          archived = excluded.archived,
          payload_json = excluded.payload_json
      `).run(
        department.id,
        company.id,
        department.name,
        department.leadAgentId ?? null,
        department.color ?? null,
        department.order ?? null,
        department.archived ? 1 : 0,
        JSON.stringify(department),
      );
    }
    for (const employee of company.employees) {
      this.db.prepare(`
        INSERT INTO employees (agent_id, company_id, nickname, role, is_meta, meta_role, reports_to, department_id, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_id) DO UPDATE SET
          company_id = excluded.company_id,
          nickname = excluded.nickname,
          role = excluded.role,
          is_meta = excluded.is_meta,
          meta_role = excluded.meta_role,
          reports_to = excluded.reports_to,
          department_id = excluded.department_id,
          payload_json = excluded.payload_json
      `).run(
        employee.agentId,
        company.id,
        employee.nickname,
        employee.role,
        employee.isMeta ? 1 : 0,
        employee.metaRole ?? null,
        employee.reportsTo ?? null,
        employee.departmentId ?? null,
        JSON.stringify(employee),
      );
    }
  }

  private syncManagedCompanyFiles(config: CyberCompanyConfig | null) {
    const runtimeByCompanyId = new Map(
      (config?.companies ?? []).map((company) => [company.id, this.loadRuntime(company.id)] as const),
    );
    for (const file of buildManagedExecutorFiles(config, runtimeByCompanyId)) {
      this.setAgentFile(file.agentId, file.name, file.content);
    }
  }

  saveConfig(config: CyberCompanyConfig) {
    const previousConfig = this.readStoredConfig();
    const existingCompanyRows = this.db.prepare("SELECT id FROM companies").all() as Array<{ id: string }>;
    const nextIds = new Set(config.companies.map((company) => company.id));
    for (const row of existingCompanyRows) {
      if (!nextIds.has(row.id)) {
        this.deleteCompanyData(row.id);
      }
    }

    for (const rawCompany of config.companies) {
      const company = normalizeCompany(rawCompany);
      this.db.prepare(`
        INSERT INTO companies (id, name, company_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          company_json = excluded.company_json,
          updated_at = excluded.updated_at
      `).run(
        company.id,
        company.name,
        JSON.stringify(company),
        company.createdAt,
        Date.now(),
      );
      this.replaceCompanyTables(company);
      const currentRuntime = this.loadRuntime(company.id);
      this.saveRuntime({
        ...currentRuntime,
        companyId: company.id,
        activeSupportRequests:
          currentRuntime.activeSupportRequests.length > 0
            ? currentRuntime.activeSupportRequests
            : (company.supportRequests ?? []).map(normalizeSupportRequestRecord),
        activeEscalations:
          currentRuntime.activeEscalations.length > 0
            ? currentRuntime.activeEscalations
            : company.escalations ?? [],
        activeDecisionTickets:
          currentRuntime.activeDecisionTickets.length > 0
            ? currentRuntime.activeDecisionTickets
            : company.decisionTickets ?? [],
      });
    }

    this.syncManagedCompanyFiles(config);
    this.setActiveCompanyId(config.companies.length > 0 ? config.activeCompanyId : null);
    this.syncManagedExecutorAgentTargets(previousConfig, config);
  }

  private deleteCompanyData(companyId: string) {
    const employeeIds = this.db.prepare("SELECT agent_id FROM employees WHERE company_id = ?").all(companyId) as Array<{
      agent_id: string;
    }>;
    const tables = [
      "companies",
      "departments",
      "employees",
      "runtimes",
      "conversations",
      "conversation_messages",
      "conversation_states",
      "work_items",
      "requirement_aggregates",
      "requirement_evidence",
      "rooms",
      "room_bindings",
      "support_requests",
      "escalations",
      "decision_tickets",
      "dispatches",
      "rounds",
      "artifacts",
      "missions",
      "event_log",
      "executor_runs",
    ] as const;
    for (const table of tables) {
      const column =
        table === "companies"
          ? "id"
          : table === "conversations"
            ? "company_id"
            : table === "conversation_messages"
              ? "company_id"
              : "company_id";
      this.db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(companyId);
    }
    for (const employeeId of employeeIds) {
      this.db.prepare("DELETE FROM agent_files WHERE agent_id = ?").run(employeeId.agent_id);
    }
  }

  deleteCompany(companyId: string) {
    const currentConfig = this.loadConfig();
    const company = currentConfig?.companies.find((entry) => entry.id === companyId) ?? this.loadCompanyById(companyId);
    if (isReservedSystemCompany(company)) {
      throw new Error("系统默认公司不可删除。");
    }
    if (!currentConfig || !currentConfig.companies.some((entry) => entry.id === companyId)) {
      return;
    }

    const nextCompanies = currentConfig.companies.filter((entry) => entry.id !== companyId);
    if (nextCompanies.length === 0) {
      this.deleteCompanyData(companyId);
      this.syncManagedExecutorAgentTargets(currentConfig, null);
      this.setActiveCompanyId(null);
      return;
    }

    this.saveConfig({
      ...currentConfig,
      companies: nextCompanies,
      activeCompanyId:
        currentConfig.activeCompanyId === companyId
          ? nextCompanies[0]!.id
          : currentConfig.activeCompanyId,
    });
  }

  getBootstrap(input?: {
    executor: AuthorityExecutorStatus;
    executorConfig: AuthorityExecutorConfig;
    executorCapabilities: AuthorityExecutorCapabilitySnapshot;
  }): AuthorityBootstrapSnapshot {
    const health = this.getHealth(input);
    const config = this.loadConfig();
    const activeCompany =
      config?.companies.find((company) => company.id === config.activeCompanyId) ?? null;
    const runtime = activeCompany ? this.loadRuntime(activeCompany.id) : null;
    return {
      config,
      activeCompany,
      runtime,
      executor: health.executor,
      executorConfig: health.executorConfig,
      executorCapabilities: health.executorCapabilities,
      executorReadiness: health.executorReadiness,
      authority: {
        url: `http://127.0.0.1:${AUTHORITY_PORT}`,
        dbPath: this.dbPath,
        connected: true,
      },
    };
  }

  switchCompany(companyId: string) {
    const config = this.loadConfig();
    if (!config || !config.companies.some((company) => company.id === companyId)) {
      throw new Error(`Unknown company: ${companyId}`);
    }
    this.setActiveCompanyId(companyId);
  }

  requestApproval(input: AuthorityApprovalRequest): AuthorityApprovalMutationResponse {
    const config = this.loadConfig();
    if (!config) {
      throw new Error("Authority 尚未加载公司配置。");
    }
    const company = config.companies.find((item) => item.id === input.companyId) ?? null;
    if (!company) {
      throw new Error(`Unknown company: ${input.companyId}`);
    }

    const now = input.timestamp ?? Date.now();
    const candidate: ApprovalRecord = normalizeApprovalRecord({
      id: crypto.randomUUID(),
      companyId: company.id,
      revision: 1,
      scope: input.scope,
      actionType: input.actionType,
      status: "pending",
      summary: input.summary,
      detail: input.detail ?? null,
      requestedByActorId: input.requestedByActorId ?? "operator:local-user",
      requestedByLabel: input.requestedByLabel ?? "当前操作者",
      targetActorId: input.targetActorId ?? null,
      targetLabel: input.targetLabel ?? null,
      payload: input.payload ?? {},
      requestedAt: now,
      resolution: null,
      decidedByActorId: null,
      decidedByLabel: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    });

    const existingPending =
      (company.approvals ?? []).find((record) => {
        const normalized = normalizeApprovalRecord(record);
        return (
          normalized.status === "pending" &&
          normalized.scope === candidate.scope &&
          normalized.actionType === candidate.actionType &&
          (normalized.targetActorId ?? null) === (candidate.targetActorId ?? null) &&
          shallowJsonEqual(normalized.payload ?? {}, candidate.payload ?? {})
        );
      }) ?? null;

    if (existingPending) {
      return {
        bootstrap: this.getBootstrap(),
        approval: normalizeApprovalRecord(existingPending),
      };
    }

    const nextCompany = normalizeCompany({
      ...company,
      approvals: sortApprovals([candidate, ...(company.approvals ?? [])]),
    });
    const nextConfig: CyberCompanyConfig = {
      ...config,
      companies: config.companies.map((item) => (item.id === company.id ? nextCompany : item)),
    };
    this.saveConfig(nextConfig);
    this.appendCompanyEvent(
      createCompanyEvent({
        companyId: company.id,
        kind: "approval_record_upserted",
        fromActorId: candidate.requestedByActorId ?? "operator:local-user",
        targetActorId: candidate.targetActorId ?? undefined,
        createdAt: candidate.updatedAt,
        payload: {
          approvalId: candidate.id,
          revision: normalizeApprovalRevision(candidate.revision),
          scope: candidate.scope,
          actionType: candidate.actionType,
          status: candidate.status,
          summary: candidate.summary,
          detail: candidate.detail ?? null,
          requestedByLabel: candidate.requestedByLabel ?? null,
          targetLabel: candidate.targetLabel ?? null,
          payload: candidate.payload ?? {},
        },
      }),
    );
    return {
      bootstrap: this.getBootstrap(),
      approval: candidate,
    };
  }

  resolveApproval(input: AuthorityApprovalResolveRequest): AuthorityApprovalMutationResponse {
    const config = this.loadConfig();
    if (!config) {
      throw new Error("Authority 尚未加载公司配置。");
    }
    const company = config.companies.find((item) => item.id === input.companyId) ?? null;
    if (!company) {
      throw new Error(`Unknown company: ${input.companyId}`);
    }
    const existing = (company.approvals ?? []).find((record) => record.id === input.approvalId) ?? null;
    if (!existing) {
      throw new Error(`Unknown approval: ${input.approvalId}`);
    }
    const normalizedExisting = normalizeApprovalRecord(existing);
    if (normalizedExisting.status !== "pending") {
      return {
        bootstrap: this.getBootstrap(),
        approval: normalizedExisting,
      };
    }

    const resolvedAt = input.timestamp ?? Date.now();
    const candidate = normalizeApprovalRecord({
      ...normalizedExisting,
      status: input.decision,
      resolution: input.resolution ?? normalizedExisting.resolution ?? null,
      decidedByActorId: input.decidedByActorId ?? "operator:local-user",
      decidedByLabel: input.decidedByLabel ?? "当前操作者",
      resolvedAt,
      updatedAt: resolvedAt,
      revision: normalizeApprovalRevision(normalizedExisting.revision) + 1,
    });
    const nextApproval = approvalMaterialChanged(normalizedExisting, candidate)
      ? candidate
      : normalizedExisting;

    const nextCompany = normalizeCompany({
      ...company,
      approvals: sortApprovals(
        (company.approvals ?? []).map((record) =>
          record.id === nextApproval.id ? nextApproval : normalizeApprovalRecord(record),
        ),
      ),
    });
    const nextConfig: CyberCompanyConfig = {
      ...config,
      companies: config.companies.map((item) => (item.id === company.id ? nextCompany : item)),
    };
    this.saveConfig(nextConfig);
    this.appendCompanyEvent(
      createCompanyEvent({
        companyId: company.id,
        kind: input.decision === "approved" ? "approval_resolved" : "approval_rejected",
        fromActorId: nextApproval.decidedByActorId ?? "operator:local-user",
        targetActorId: nextApproval.targetActorId ?? undefined,
        createdAt: nextApproval.updatedAt,
        payload: {
          approvalId: nextApproval.id,
          revision: normalizeApprovalRevision(nextApproval.revision),
          scope: nextApproval.scope,
          actionType: nextApproval.actionType,
          status: nextApproval.status,
          summary: nextApproval.summary,
          detail: nextApproval.detail ?? null,
          resolution: nextApproval.resolution ?? null,
          requestedByLabel: nextApproval.requestedByLabel ?? null,
          decidedByLabel: nextApproval.decidedByLabel ?? null,
          targetLabel: nextApproval.targetLabel ?? null,
          payload: nextApproval.payload ?? {},
        },
      }),
    );
    return {
      bootstrap: this.getBootstrap(),
      approval: nextApproval,
    };
  }

  private buildRuntimeSnapshotFromTables(
    companyId: string,
    company: Company | null,
  ): AuthorityCompanyRuntimeSnapshot {
    const aggregates = this.readPayloadTable<RequirementAggregateRecord>("requirement_aggregates", companyId);
    return this.computeAgentRuntimeSnapshot(
      companyId,
      normalizeRuntimeSnapshot(company, {
        companyId,
        activeMissionRecords: this.readPayloadTable<ConversationMissionRecord>("missions", companyId),
        activeConversationStates: this.readPayloadTable<ConversationStateRecord>("conversation_states", companyId),
        activeWorkItems: this.readPayloadTable<WorkItemRecord>("work_items", companyId),
        activeRequirementAggregates: aggregates,
        activeRequirementEvidence: this.readPayloadTable<RequirementEvidenceEvent>("requirement_evidence", companyId),
        activeRoomRecords: this.readPayloadTable<RequirementRoomRecord>("rooms", companyId),
        activeRoundRecords: this.readPayloadTable<RoundRecord>("rounds", companyId),
        activeArtifacts: this.readPayloadTable<ArtifactRecord>("artifacts", companyId),
        activeDispatches: this.readPayloadTable<DispatchRecord>("dispatches", companyId),
        activeRoomBindings: this.readPayloadTable<RoomConversationBindingRecord>("room_bindings", companyId),
        activeSupportRequests: this.readPayloadTable<SupportRequestRecord>("support_requests", companyId),
        activeEscalations: this.readPayloadTable<EscalationRecord>("escalations", companyId),
        activeDecisionTickets: this.readPayloadTable<DecisionTicketRecord>("decision_tickets", companyId),
        activeAgentSessions: [],
        activeAgentRuns: [],
        activeAgentRuntime: [],
        activeAgentStatuses: [],
        activeAgentStatusHealth: null,
        primaryRequirementId: aggregates.find((aggregate) => aggregate.primary)?.id ?? null,
        updatedAt: Date.now(),
      }),
    );
  }

  findCompanyIdByAgentId(agentId: string): string | null {
    const row = this.db.prepare("SELECT company_id FROM employees WHERE agent_id = ?").get(agentId) as
      | { company_id?: string | null }
      | undefined;
    return row?.company_id ?? null;
  }

  private getCompanyAgentIdsForRuntime(companyId: string): string[] {
    const company = this.loadCompanyById(companyId);
    return company?.employees.map((employee) => employee.agentId) ?? [];
  }

  private readActiveExecutorRuns(companyId: string): AgentRunRecord[] {
    const rows = this.db.prepare(`
      SELECT id, actor_id, session_key, status, started_at, finished_at, payload_json
      FROM executor_runs
      WHERE company_id = ?
      ORDER BY started_at DESC
    `).all(companyId) as Array<{
      id: string;
      actor_id: string;
      session_key: string;
      status: string;
      started_at: number;
      finished_at?: number | null;
      payload_json?: string;
    }>;

    return rows
      .map((row) => {
        const payload = parseJson<Record<string, unknown>>(row.payload_json, {});
        const state = normalizeExecutorRunState(row.status);
        if (!state || state === "completed" || state === "aborted" || state === "error") {
          return null;
        }
        return {
          runId: row.id,
          agentId: row.actor_id,
          sessionKey: row.session_key,
          providerId: EXECUTOR_PROVIDER_ID,
          state,
          startedAt: row.started_at,
          lastEventAt: readNumber(payload.lastEventAt) ?? row.finished_at ?? row.started_at,
          endedAt: row.finished_at ?? null,
          streamKindsSeen: ["lifecycle"],
          toolNamesSeen: [],
          error: readString(payload.errorMessage),
        } satisfies AgentRunRecord;
      })
      .filter(isPresent)
      .sort((left, right) => right.lastEventAt - left.lastEventAt);
  }

  private computeAgentRuntimeSnapshot(
    companyId: string,
    snapshot: AuthorityCompanyRuntimeSnapshot,
    overrides?: {
      activeAgentSessions?: AuthorityCompanyRuntimeSnapshot["activeAgentSessions"];
      activeAgentRuns?: AuthorityCompanyRuntimeSnapshot["activeAgentRuns"];
    },
  ): AuthorityCompanyRuntimeSnapshot {
    const company = this.loadCompanyById(companyId);
    const normalizedCompany = company ? normalizeCompany(company) : null;
    const activeAgentSessions = reconcileAgentSessionExecutionContext({
      sessions: [...(overrides?.activeAgentSessions ?? snapshot.activeAgentSessions ?? [])].sort(
        (left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0),
      ),
      dispatches: snapshot.activeDispatches ?? [],
    });
    const activeAgentRuns = [...(overrides?.activeAgentRuns ?? this.readActiveExecutorRuns(companyId))]
      .filter((run) => run.state !== "completed" && run.state !== "aborted" && run.state !== "error")
      .sort((left, right) => right.lastEventAt - left.lastEventAt);
    const activeAgentRuntime = buildAgentRuntimeProjection({
      providerId: EXECUTOR_PROVIDER_ID,
      agentIds: this.getCompanyAgentIdsForRuntime(companyId),
      sessions: activeAgentSessions,
      runs: activeAgentRuns,
    });
    const activeAgentStatuses = normalizedCompany
      ? buildCanonicalAgentStatusProjection({
          company: normalizedCompany,
          activeWorkItems: snapshot.activeWorkItems,
          activeDispatches: snapshot.activeDispatches,
          activeSupportRequests: snapshot.activeSupportRequests,
          activeEscalations: snapshot.activeEscalations,
          activeAgentRuntime,
          activeAgentSessions,
          now: Date.now(),
        })
      : [];
    return {
      ...snapshot,
      companyId,
      activeAgentSessions,
      activeAgentRuns,
      activeAgentRuntime,
      activeAgentStatuses,
      activeAgentStatusHealth: buildCanonicalAgentStatusHealth({
        company: normalizedCompany,
        statuses: activeAgentStatuses,
        source: "authority",
        generatedAt: Date.now(),
        note: normalizedCompany
          ? null
          : "Authority could not load the current company while projecting canonical agent statuses.",
      }),
    };
  }

  updateRuntimeFromSessionList(
    companyId: string,
    sessions: Parameters<typeof buildAgentSessionRecordsFromSessions>[0]["sessions"],
  ) {
    const runtime = this.loadRuntime(companyId);
    const nextSessions = buildAgentSessionRecordsFromSessions({
      existing: runtime.activeAgentSessions ?? [],
      providerId: EXECUTOR_PROVIDER_ID,
      sessions,
    });
    return this.saveRuntime(
      this.computeAgentRuntimeSnapshot(companyId, runtime, {
        activeAgentSessions: nextSessions,
      }),
    );
  }

  applyRuntimeSessionStatus(companyId: string, status: ReturnType<typeof normalizeProviderSessionStatus>) {
    const runtime = this.loadRuntime(companyId);
    const next = applyProviderSessionStatusToAgentRuntime({
      sessions: runtime.activeAgentSessions ?? [],
      runs: runtime.activeAgentRuns ?? [],
      status,
    });
    return this.saveRuntime(
      this.computeAgentRuntimeSnapshot(companyId, runtime, {
        activeAgentSessions: next.sessions,
        activeAgentRuns: next.runs,
      }),
    );
  }

  applyRuntimeEvent(companyId: string, event: ProviderRuntimeEvent) {
    const runtime = this.loadRuntime(companyId);
    const next = applyProviderRuntimeEvent({
      sessions: runtime.activeAgentSessions ?? [],
      runs: runtime.activeAgentRuns ?? [],
      event,
    });
    return this.saveRuntime(
      this.computeAgentRuntimeSnapshot(companyId, runtime, {
        activeAgentSessions: next.sessions,
        activeAgentRuns: next.runs,
      }),
    );
  }

  private readStoredRuntime(companyId: string): {
    company: Company | null;
    snapshot: AuthorityCompanyRuntimeSnapshot;
    exists: boolean;
  } {
    const company = this.loadCompanyById(companyId);
    const row = this.db.prepare("SELECT snapshot_json FROM runtimes WHERE company_id = ?").get(companyId) as
      | { snapshot_json?: string }
      | undefined;
    if (row?.snapshot_json) {
      return {
        company,
        snapshot: normalizeRuntimeSnapshot(
          company,
          parseJson<AuthorityCompanyRuntimeSnapshot>(row.snapshot_json, EMPTY_RUNTIME(companyId)),
        ),
        exists: true,
      };
    }

    return {
      company,
      snapshot: this.buildRuntimeSnapshotFromTables(companyId, company),
      exists: false,
    };
  }

  private reconcileRuntimeForRead(input: {
    company: Company | null;
    snapshot: AuthorityCompanyRuntimeSnapshot;
  }): {
    runtime: AuthorityCompanyRuntimeSnapshot;
    changed: boolean;
  } {
    const normalized = normalizeRuntimeSnapshot(input.company, input.snapshot);
    const runtimeAfterEvents = this.replayCompanyEventsIntoRuntime(
      input.snapshot.companyId,
      input.company,
      normalized,
    );
    const eventReplayChanged = !shallowJsonEqual(normalized.activeDispatches, runtimeAfterEvents.activeDispatches)
      || !shallowJsonEqual(normalized.activeAgentSessions ?? [], runtimeAfterEvents.activeAgentSessions ?? []);
    const reconciled = reconcileAuthorityRequirementRuntime({
      company: input.company,
      runtime: runtimeAfterEvents,
    });
    const requirementRuntimeChanged = runtimeRequirementControlChanged(runtimeAfterEvents, reconciled.runtime);
    const runtimeAfterRequirementControl = requirementRuntimeChanged ? reconciled.runtime : runtimeAfterEvents;
    const runtimeWithAgentProjection = this.computeAgentRuntimeSnapshot(
      input.snapshot.companyId,
      runtimeAfterRequirementControl,
    );
    const changed =
      eventReplayChanged ||
      requirementRuntimeChanged ||
      !shallowJsonEqual(runtimeAfterRequirementControl.activeAgentSessions, runtimeWithAgentProjection.activeAgentSessions) ||
      !shallowJsonEqual(runtimeAfterRequirementControl.activeAgentRuns, runtimeWithAgentProjection.activeAgentRuns) ||
      !shallowJsonEqual(runtimeAfterRequirementControl.activeAgentRuntime, runtimeWithAgentProjection.activeAgentRuntime) ||
      !shallowJsonEqual(runtimeAfterRequirementControl.activeAgentStatuses, runtimeWithAgentProjection.activeAgentStatuses);
    return {
      runtime: runtimeWithAgentProjection,
      changed,
    };
  }

  loadRuntime(companyId: string): AuthorityCompanyRuntimeSnapshot {
    const stored = this.readStoredRuntime(companyId);
    return this.reconcileRuntimeForRead({
      company: stored.company,
      snapshot: stored.snapshot,
    }).runtime;
  }

  repairRuntimeIfNeeded(companyId: string): AuthorityCompanyRuntimeSnapshot {
    const stored = this.readStoredRuntime(companyId);
    const reconciled = this.reconcileRuntimeForRead({
      company: stored.company,
      snapshot: stored.snapshot,
    });
    if (!stored.exists || reconciled.changed) {
      const nextRuntime = this.saveRuntime(reconciled.runtime);
      this.appendRuntimeRepairEvent({
        companyId,
        timestamp: Date.now(),
        storedRuntimeExisted: stored.exists,
        reconciledChanged: reconciled.changed,
        runtime: nextRuntime,
      });
      return nextRuntime;
    }
    return reconciled.runtime;
  }

  private readPayloadTable<T>(table: RuntimeSliceTables, companyId: string): T[] {
    const rows = this.db.prepare(`SELECT payload_json FROM ${table} WHERE company_id = ? ORDER BY updated_at DESC`).all(companyId) as Array<{
      payload_json: string;
    }>;
    return rows.map((row) => parseJson<T | null>(row.payload_json, null)).filter(isPresent);
  }

  private replacePayloadTable<T extends object>(table: RuntimeSliceTables, companyId: string, records: T[]) {
    this.db.prepare(`DELETE FROM ${table} WHERE company_id = ?`).run(companyId);
    for (const record of records) {
      const recordMeta = record as { id?: string; updatedAt?: number };
      const id =
        typeof recordMeta.id === "string"
          ? recordMeta.id
          : table === "conversation_states"
            ? (record as ConversationStateRecord).conversationId
            : table === "room_bindings"
              ? buildRoomConversationBindingKey(record as RoomConversationBindingRecord)
              : crypto.randomUUID();
      const updatedAt =
        typeof recordMeta.updatedAt === "number"
          ? recordMeta.updatedAt
          : Date.now();
      this.db.prepare(`
        INSERT INTO ${table} (id, company_id, updated_at, payload_json)
        VALUES (?, ?, ?, ?)
      `).run(id, companyId, updatedAt, JSON.stringify(record));
    }
  }

  saveRuntime(snapshot: AuthorityCompanyRuntimeSnapshot) {
    const company = this.loadCompanyById(snapshot.companyId);
    const runtimeWithAgentProjection = this.computeAgentRuntimeSnapshot(snapshot.companyId, snapshot, {
      activeAgentSessions: snapshot.activeAgentSessions,
      activeAgentRuns: snapshot.activeAgentRuns,
    });
    const reconciled = reconcileAuthorityRequirementRuntime({
      company,
      runtime: normalizeRuntimeSnapshot(company, {
        ...runtimeWithAgentProjection,
        updatedAt: Date.now(),
      }),
    });
    const normalized = this.computeAgentRuntimeSnapshot(
      snapshot.companyId,
      normalizeRuntimeSnapshot(company, {
        ...reconciled.runtime,
        updatedAt: Date.now(),
      }),
      {
        activeAgentSessions: reconciled.runtime.activeAgentSessions,
        activeAgentRuns: reconciled.runtime.activeAgentRuns,
      },
    );
    this.replacePayloadTable("missions", snapshot.companyId, normalized.activeMissionRecords);
    this.replacePayloadTable("conversation_states", snapshot.companyId, normalized.activeConversationStates);
    this.replacePayloadTable("work_items", snapshot.companyId, normalized.activeWorkItems);
    this.replacePayloadTable("requirement_aggregates", snapshot.companyId, normalized.activeRequirementAggregates);
    this.replacePayloadTable("requirement_evidence", snapshot.companyId, normalized.activeRequirementEvidence);
    this.replacePayloadTable("rooms", snapshot.companyId, normalized.activeRoomRecords);
    this.replacePayloadTable("rounds", snapshot.companyId, normalized.activeRoundRecords);
    this.replacePayloadTable("artifacts", snapshot.companyId, normalized.activeArtifacts);
    this.replacePayloadTable("dispatches", snapshot.companyId, normalized.activeDispatches);
    this.replacePayloadTable("room_bindings", snapshot.companyId, normalized.activeRoomBindings);
    this.replacePayloadTable("support_requests", snapshot.companyId, normalized.activeSupportRequests);
    this.replacePayloadTable("escalations", snapshot.companyId, normalized.activeEscalations);
    this.replacePayloadTable("decision_tickets", snapshot.companyId, normalized.activeDecisionTickets);
    this.db.prepare(`
      INSERT INTO runtimes (company_id, snapshot_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(company_id) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        updated_at = excluded.updated_at
    `).run(snapshot.companyId, JSON.stringify(normalized), normalized.updatedAt);
    this.refreshManagedContextFiles(snapshot.companyId, normalized);
    return normalized;
  }

  listActors() {
    const activeCompanyId = this.getActiveCompanyId();
    const rows = activeCompanyId
      ? (this.db.prepare("SELECT payload_json FROM employees WHERE company_id = ? ORDER BY is_meta DESC, nickname ASC").all(activeCompanyId) as Array<{
          payload_json: string;
        }>)
      : (this.db.prepare("SELECT payload_json FROM employees ORDER BY nickname ASC").all() as Array<{
          payload_json: string;
        }>);
    const employees = rows
      .map((row) => parseJson<EmployeeRef | null>(row.payload_json, null))
      .filter(isPresent);
    return {
      agents: employees.map((employee) => ({
        id: employee.agentId,
        name: employee.nickname,
        identity: {
          name: employee.role,
        },
      })),
    };
  }

  private ensureConversationRow(companyId: string, actorId: string, sessionKey: string) {
    const existing = this.db.prepare("SELECT session_key FROM conversations WHERE session_key = ?").get(sessionKey) as
      | { session_key?: string }
      | undefined;
    if (existing?.session_key) {
      return;
    }
    this.db.prepare(`
      INSERT INTO conversations (session_key, company_id, actor_id, kind, label, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionKey, companyId, actorId, "direct", actorId, Date.now());
  }

  private appendConversationMessage(companyId: string, sessionKey: string, message: StoredChatMessage) {
    this.db.prepare(`
      INSERT INTO conversation_messages (id, company_id, session_key, role, timestamp, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      companyId,
      sessionKey,
      message.role,
      message.timestamp ?? Date.now(),
      JSON.stringify(message),
    );
    this.db.prepare(`
      INSERT INTO conversations (session_key, company_id, actor_id, kind, label, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET
        updated_at = excluded.updated_at
    `).run(sessionKey, companyId, sessionKey.split(":")[1] ?? null, "direct", sessionKey.split(":")[1] ?? null, message.timestamp ?? Date.now());
  }

  listSessions(companyId?: string | null, agentId?: string | null): AuthoritySessionListResponse {
    const clauses: string[] = [];
    const args: Array<string> = [];
    if (companyId) {
      clauses.push("company_id = ?");
      args.push(companyId);
    }
    if (agentId) {
      clauses.push("actor_id = ?");
      args.push(agentId);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT session_key, actor_id, kind, label, updated_at
      FROM conversations
      ${where}
      ORDER BY updated_at DESC
    `).all(...args) as Array<{
      session_key: string;
      actor_id?: string | null;
      kind?: string | null;
      label?: string | null;
      updated_at?: number | null;
    }>;
    const latestPreviewStmt = this.db.prepare(`
      SELECT payload_json
      FROM conversation_messages
      WHERE session_key = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    const sessions = rows.map((row) => {
      const previewRow = latestPreviewStmt.get(row.session_key) as { payload_json?: string } | undefined;
      const latest = previewRow?.payload_json ? parseJson<StoredChatMessage>(previewRow.payload_json, { role: "system" }) : null;
      const kind: "direct" | "group" = row.kind === "group" ? "group" : "direct";
      return {
        key: row.session_key,
        actorId: row.actor_id ?? null,
        kind,
        label: row.label ?? row.actor_id ?? row.session_key,
        displayName: row.label ?? row.actor_id ?? row.session_key,
        derivedTitle: row.label ?? row.actor_id ?? row.session_key,
        lastMessagePreview: truncate(typeof latest?.text === "string" ? latest.text : ""),
        updatedAt: row.updated_at ?? Date.now(),
      };
    });
    return {
      ts: Date.now(),
      path: this.dbPath,
      count: sessions.length,
      sessions,
    };
  }

  getChatHistory(sessionKey: string, limit = 80): AuthoritySessionHistoryResponse {
    const rows = this.db.prepare(`
      SELECT payload_json
      FROM conversation_messages
      WHERE session_key = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(sessionKey, limit) as Array<{ payload_json: string }>;
    const messages = rows
      .map((row) => parseJson<StoredChatMessage>(row.payload_json, { role: "system" }))
      .reverse();
    return {
      sessionKey,
      sessionId: sessionKey,
      messages,
    };
  }

  resetSession(sessionKey: string) {
    this.db.prepare("DELETE FROM conversation_messages WHERE session_key = ?").run(sessionKey);
    this.db.prepare("UPDATE conversations SET updated_at = ? WHERE session_key = ?").run(Date.now(), sessionKey);
    return { ok: true as const, key: sessionKey };
  }

  deleteSession(sessionKey: string) {
    this.db.prepare("DELETE FROM conversation_messages WHERE session_key = ?").run(sessionKey);
    const deleted = this.db.prepare("DELETE FROM conversations WHERE session_key = ?").run(sessionKey).changes > 0;
    return { ok: true, deleted };
  }

  listAgentFiles(agentId: string) {
    const rows = this.db.prepare(`
      SELECT name, content, updated_at
      FROM agent_files
      WHERE agent_id = ?
      ORDER BY name ASC
    `).all(agentId) as Array<{ name: string; content: string; updated_at: number }>;
    return {
      agentId,
      workspace: `authority://${agentId}`,
      files: rows.map((row) => ({
        name: row.name,
        path: `authority://${agentId}/${row.name}`,
        missing: false,
        size: row.content.length,
        updatedAtMs: row.updated_at,
        content: row.content,
      })),
    };
  }

  getAgentFile(agentId: string, name: string) {
    const row = this.db.prepare(`
      SELECT content, updated_at
      FROM agent_files
      WHERE agent_id = ? AND name = ?
    `).get(agentId, name) as { content?: string; updated_at?: number } | undefined;
    return {
      agentId,
      workspace: `authority://${agentId}`,
      file: row
        ? {
            name,
            path: `authority://${agentId}/${name}`,
            missing: false,
            size: row.content?.length ?? 0,
            updatedAtMs: row.updated_at,
            content: row.content,
          }
        : {
            name,
            path: `authority://${agentId}/${name}`,
            missing: true,
          },
    };
  }

  setAgentFile(agentId: string, name: string, content: string) {
    const existing = this.db.prepare(`
      SELECT content, updated_at
      FROM agent_files
      WHERE agent_id = ? AND name = ?
    `).get(agentId, name) as { content?: string; updated_at?: number } | undefined;
    if (existing?.content === content) {
      return {
        ok: true as const,
        changed: false as const,
        agentId,
        workspace: `authority://${agentId}`,
        file: {
          name,
          path: `authority://${agentId}/${name}`,
          missing: false,
          size: content.length,
          updatedAtMs: existing.updated_at ?? Date.now(),
          content,
        },
      };
    }
    const updatedAt = Date.now();
    this.db.prepare(`
      INSERT INTO agent_files (agent_id, name, content, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(agent_id, name) DO UPDATE SET
        content = excluded.content,
        updated_at = excluded.updated_at
    `).run(agentId, name, content, updatedAt);
    return {
      ok: true as const,
      changed: true as const,
      agentId,
      workspace: `authority://${agentId}`,
      file: {
        name,
        path: `authority://${agentId}/${name}`,
        missing: false,
        size: content.length,
        updatedAtMs: updatedAt,
        content,
      },
    };
  }

  hasCompany(companyId: string): boolean {
    return Boolean(this.loadCompanyById(companyId));
  }

  getCompanyAgentIds(companyId?: string | null): string[] {
    const targetCompanyId = companyId ?? this.getActiveCompanyId();
    if (!targetCompanyId) {
      return [];
    }
    const rows = this.db.prepare("SELECT agent_id FROM employees WHERE company_id = ?").all(targetCompanyId) as Array<{
      agent_id: string;
    }>;
    return rows.map((row) => row.agent_id);
  }

  getConversationContext(sessionKey: string): { companyId: string; actorId: string | null } | null {
    const row = this.db.prepare(`
      SELECT company_id, actor_id
      FROM conversations
      WHERE session_key = ?
    `).get(sessionKey) as
      | { company_id?: string; actor_id?: string | null }
      | undefined;
    if (!row?.company_id) {
      return null;
    }
    return {
      companyId: row.company_id,
      actorId: row.actor_id ?? null,
    };
  }

  beginChatDispatch(input: AuthorityChatSendRequest) {
    const sessionKey = input.sessionKey?.trim() || `agent:${input.actorId}:main`;
    const now = Date.now();
    this.ensureConversationRow(input.companyId, input.actorId, sessionKey);
    this.appendConversationMessage(input.companyId, sessionKey, {
      role: "user",
      text: input.message,
      content: [{ type: "text", text: input.message }],
      timestamp: now,
    });
    return { sessionKey, now };
  }

  createExecutorRun(input: {
    runId: string;
    companyId: string;
    actorId: string;
    sessionKey: string;
    startedAt?: number;
    payload?: Record<string, unknown>;
  }) {
    this.db.prepare(`
      INSERT INTO executor_runs (id, company_id, actor_id, session_key, status, started_at, finished_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.runId,
      input.companyId,
      input.actorId,
      input.sessionKey,
      "accepted",
      input.startedAt ?? Date.now(),
      null,
      JSON.stringify({
        ...(input.payload ?? {}),
        lastEventAt: input.startedAt ?? Date.now(),
      }),
    );
  }

  updateExecutorRun(
    runId: string,
    status: AgentRunRecord["state"],
    payload?: Record<string, unknown>,
  ) {
    const existing = this.db.prepare("SELECT payload_json FROM executor_runs WHERE id = ?").get(runId) as
      | { payload_json?: string }
      | undefined;
    const terminal = status === "completed" || status === "error" || status === "aborted";
    const timestamp = Date.now();
    const nextPayload = {
      ...parseJson<Record<string, unknown>>(existing?.payload_json, {}),
      ...(payload ?? {}),
      lastEventAt: timestamp,
    };
    this.db.prepare(`
      UPDATE executor_runs
      SET status = ?, finished_at = ?, payload_json = ?
      WHERE id = ?
    `).run(status, terminal ? timestamp : null, JSON.stringify(nextPayload), runId);
  }

  appendAssistantMessage(sessionKey: string, message: StoredChatMessage) {
    const context = this.getConversationContext(sessionKey);
    if (!context) {
      return null;
    }
    this.appendConversationMessage(context.companyId, sessionKey, message);
    return context;
  }

  applyAssistantControlMessage(sessionKey: string, message: StoredChatMessage) {
    const context = this.getConversationContext(sessionKey);
    if (!context) {
      return {
        context: null,
        changed: false,
        violations: [] as string[],
      };
    }
    const currentRuntime = this.loadRuntime(context.companyId);
    const reconciled = reconcileAuthorityRequirementRuntime({
      company: this.loadCompanyById(context.companyId),
      runtime: currentRuntime,
      controlUpdate: {
        sessionKey,
        message: message as unknown as ChatMessage,
        timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
      },
    });
    const changed = runtimeRequirementControlChanged(currentRuntime, reconciled.runtime);
    if (changed) {
      this.saveRuntime(reconciled.runtime);
    }
    return {
      context,
      changed,
      violations: reconciled.violations,
    };
  }

  appendCompanyEvent(event: CompanyEvent) {
    this.db.prepare(`
      INSERT INTO event_log (event_id, company_id, kind, timestamp, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(event.eventId, event.companyId, event.kind, event.createdAt, JSON.stringify(event));
    const runtimeChanged = this.reconcileDelegationEventLog(event.companyId);
    return { ok: true as const, event, runtimeChanged };
  }

  private readAllCompanyEvents(companyId: string): CompanyEvent[] {
    const rows = this.db.prepare(`
      SELECT payload_json
      FROM event_log
      WHERE company_id = ?
      ORDER BY seq ASC
    `).all(companyId) as Array<{ payload_json: string }>;
    return rows
      .map((row) => parseJson<CompanyEvent | null>(row.payload_json, null))
      .filter(isPresent);
  }

  private replayCompanyEventsIntoRuntime(
    companyId: string,
    company: Company | null,
    runtime: AuthorityCompanyRuntimeSnapshot,
  ): AuthorityCompanyRuntimeSnapshot {
    if (!company) {
      return runtime;
    }
    const nextEvents = this.readAllCompanyEvents(companyId);
    const nextDispatches = reconcileDispatchesFromCompanyEvents({
      company,
      events: nextEvents,
      existingDispatches: runtime.activeDispatches,
    });
    const nextSessions = repairAgentSessionsFromDispatches({
      sessions: runtime.activeAgentSessions ?? [],
      runs: runtime.activeAgentRuns ?? [],
      dispatches: nextDispatches,
    });
    const dispatchesChanged = !shallowJsonEqual(runtime.activeDispatches, nextDispatches);
    const sessionsChanged = !shallowJsonEqual(runtime.activeAgentSessions ?? [], nextSessions);
    return dispatchesChanged || sessionsChanged
      ? {
          ...runtime,
          activeDispatches: nextDispatches,
          activeAgentSessions: nextSessions,
        }
      : runtime;
  }

  private reconcileDelegationEventLog(companyId: string): boolean {
    const company = this.loadCompanyById(companyId);
    if (!company) {
      return false;
    }
    const runtime = this.loadRuntime(companyId);
    const replayed = this.replayCompanyEventsIntoRuntime(companyId, company, runtime);
    if (shallowJsonEqual(runtime, replayed)) {
      return false;
    }
    this.saveRuntime({
      ...runtime,
      ...replayed,
    });
    return true;
  }

  appendDecisionTicketEvent(input: {
    companyId: string;
    kind:
      | "decision_record_upserted"
      | "decision_record_deleted"
      | "decision_resolved"
      | "decision_cancelled";
    ticket: DecisionTicketRecord;
    timestamp: number;
  }) {
    const actorId = input.ticket.decisionOwnerActorId?.trim() || "system:decision-ticket";
    return this.appendCompanyEvent(
      createCompanyEvent({
        companyId: input.companyId,
        kind: input.kind,
        workItemId: input.ticket.workItemId ?? undefined,
        roomId: input.ticket.roomId ?? undefined,
        fromActorId: actorId,
        targetActorId: actorId,
        sessionKey: input.ticket.sourceConversationId ?? undefined,
        createdAt: input.timestamp,
        payload: {
          ticketId: input.ticket.id,
          sourceType: input.ticket.sourceType,
          sourceId: input.ticket.sourceId,
          escalationId: input.ticket.escalationId ?? null,
          aggregateId: input.ticket.aggregateId ?? null,
          decisionType: input.ticket.decisionType,
          summary: input.ticket.summary,
          requiresHuman: input.ticket.requiresHuman,
          status: input.ticket.status,
          resolution: input.ticket.resolution ?? null,
          resolutionOptionId: input.ticket.resolutionOptionId ?? null,
          revision: normalizeDecisionTicketRevision(input.ticket.revision),
        },
      }),
    );
  }

  appendDispatchAuditEvent(input: {
    companyId: string;
    kind: "dispatch_record_upserted" | "dispatch_record_deleted";
    dispatch: DispatchRecord;
    timestamp: number;
  }) {
    const actorId = input.dispatch.fromActorId?.trim() || "system:dispatch-record";
    return this.appendCompanyEvent(
      createCompanyEvent({
        companyId: input.companyId,
        kind: input.kind,
        dispatchId: input.dispatch.id,
        workItemId: input.dispatch.workItemId,
        topicKey: input.dispatch.topicKey ?? undefined,
        roomId: input.dispatch.roomId ?? undefined,
        fromActorId: actorId,
        targetActorId: input.dispatch.targetActorIds[0] ?? undefined,
        sessionKey: input.dispatch.consumerSessionKey ?? undefined,
        providerRunId: input.dispatch.providerRunId ?? undefined,
        createdAt: input.timestamp,
        payload: {
          title: input.dispatch.title,
          summary: input.dispatch.summary,
          status: input.dispatch.status,
          deliveryState: input.dispatch.deliveryState ?? null,
          checkoutState: input.dispatch.checkoutState ?? null,
          checkoutActorId: input.dispatch.checkoutActorId ?? null,
          checkoutSessionKey: input.dispatch.checkoutSessionKey ?? null,
          checkedOutAt: input.dispatch.checkedOutAt ?? null,
          releasedAt: input.dispatch.releasedAt ?? null,
          releaseReason: input.dispatch.releaseReason ?? null,
          fromActorId: input.dispatch.fromActorId ?? null,
          targetActorIds: input.dispatch.targetActorIds,
          sourceMessageId: input.dispatch.sourceMessageId ?? null,
          responseMessageId: input.dispatch.responseMessageId ?? null,
          latestEventId: input.dispatch.latestEventId ?? null,
          revision:
            Number.isFinite(input.dispatch.revision) && Number(input.dispatch.revision) > 0
              ? Math.floor(Number(input.dispatch.revision))
              : 1,
        },
      }),
    );
  }

  appendRoomAuditEvent(input: {
    companyId: string;
    kind: "room_record_upserted" | "room_record_deleted";
    room: RequirementRoomRecord;
    timestamp: number;
  }) {
    const actorId =
      input.room.ownerActorId?.trim() || input.room.ownerAgentId?.trim() || "system:room-record";
    return this.appendCompanyEvent(
      createCompanyEvent({
        companyId: input.companyId,
        kind: input.kind,
        workItemId: input.room.workItemId ?? undefined,
        topicKey: input.room.topicKey ?? undefined,
        roomId: input.room.id,
        fromActorId: actorId,
        targetActorId: input.room.batonActorId ?? undefined,
        sessionKey: input.room.sessionKey,
        createdAt: input.timestamp,
        payload: {
          title: input.room.title,
          headline: input.room.headline ?? null,
          status: input.room.status,
          progress: input.room.progress ?? null,
          scope: input.room.scope ?? null,
          memberIds: input.room.memberIds,
          memberActorIds: input.room.memberActorIds,
          transcriptCount: input.room.transcript.length,
          lastMessageAt:
            input.room.transcript.length > 0
              ? Math.max(...input.room.transcript.map((message) => message.timestamp))
              : null,
          revision:
            Number.isFinite(input.room.revision) && Number(input.room.revision) > 0
              ? Math.floor(Number(input.room.revision))
              : 1,
        },
      }),
    );
  }

  appendRoomBindingsAuditEvent(input: {
    companyId: string;
    bindings: RoomConversationBindingRecord[];
    timestamp: number;
  }) {
    const bindings = input.bindings;
    return this.appendCompanyEvent(
      createCompanyEvent({
        companyId: input.companyId,
        kind: "room_bindings_upserted",
        roomId: bindings.length === 1 ? bindings[0]?.roomId : undefined,
        fromActorId: "system:room-bindings",
        createdAt: input.timestamp,
        payload: {
          bindingCount: bindings.length,
          roomIds: [...new Set(bindings.map((binding) => binding.roomId).filter(Boolean))],
          providerIds: [...new Set(bindings.map((binding) => binding.providerId).filter(Boolean))],
          conversationIds: bindings.map((binding) => binding.conversationId),
          actorIds: bindings
            .map((binding) => binding.actorId)
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
        },
      }),
    );
  }

  appendArtifactAuditEvent(input: {
    companyId: string;
    kind: "artifact_record_upserted" | "artifact_record_deleted";
    artifact: ArtifactRecord;
    timestamp: number;
  }) {
    const actorId =
      input.artifact.ownerActorId?.trim() ||
      input.artifact.sourceActorId?.trim() ||
      "system:artifact-record";
    return this.appendCompanyEvent(
      createCompanyEvent({
        companyId: input.companyId,
        kind: input.kind,
        workItemId: input.artifact.workItemId ?? undefined,
        fromActorId: actorId,
        createdAt: input.timestamp,
        payload: {
          artifactId: input.artifact.id,
          title: input.artifact.title,
          kindLabel: input.artifact.kind,
          status: input.artifact.status,
          ownerActorId: input.artifact.ownerActorId ?? null,
          providerId: input.artifact.providerId ?? null,
          sourceActorId: input.artifact.sourceActorId ?? null,
          sourceName: input.artifact.sourceName ?? null,
          sourcePath: input.artifact.sourcePath ?? null,
          sourceUrl: input.artifact.sourceUrl ?? null,
          summary: input.artifact.summary ?? null,
          revision:
            Number.isFinite(input.artifact.revision) && Number(input.artifact.revision) > 0
              ? Math.floor(Number(input.artifact.revision))
              : 1,
        },
      }),
    );
  }

  appendArtifactMirrorSyncEvent(input: {
    companyId: string;
    mirrorPrefix: string;
    artifacts: ArtifactRecord[];
    timestamp: number;
  }) {
    return this.appendCompanyEvent(
      createCompanyEvent({
        companyId: input.companyId,
        kind: "artifact_mirror_synced",
        fromActorId: "system:artifact-mirror",
        createdAt: input.timestamp,
        payload: {
          mirrorPrefix: input.mirrorPrefix,
          artifactCount: input.artifacts.length,
          artifactIds: input.artifacts.map((artifact) => artifact.id),
          workItemIds: [...new Set(input.artifacts.map((artifact) => artifact.workItemId).filter(Boolean))],
        },
      }),
    );
  }

  appendRuntimeRepairEvent(input: {
    companyId: string;
    timestamp: number;
    storedRuntimeExisted: boolean;
    reconciledChanged: boolean;
    runtime: AuthorityCompanyRuntimeSnapshot;
  }) {
    return this.appendCompanyEvent(
      createCompanyEvent({
        companyId: input.companyId,
        kind: "runtime_repaired",
        fromActorId: "system:authority-repair",
        createdAt: input.timestamp,
        payload: {
          storedRuntimeExisted: input.storedRuntimeExisted,
          reconciledChanged: input.reconciledChanged,
          primaryRequirementId: input.runtime.primaryRequirementId,
          requirementCount: input.runtime.activeRequirementAggregates.length,
          roomCount: input.runtime.activeRoomRecords.length,
          dispatchCount: input.runtime.activeDispatches.length,
          artifactCount: input.runtime.activeArtifacts.length,
          decisionTicketCount: input.runtime.activeDecisionTickets.length,
        },
      }),
    );
  }

  listCompanyEvents(companyId: string, cursor?: string | null, since?: number): AuthorityCompanyEventsResponse {
    const clauses = ["company_id = ?"];
    const args: Array<string | number> = [companyId];
    if (cursor) {
      clauses.push("seq > ?");
      args.push(Number.parseInt(cursor, 10) || 0);
    }
    if (typeof since === "number") {
      clauses.push("timestamp >= ?");
      args.push(since);
    }
    const rows = this.db.prepare(`
      SELECT seq, payload_json
      FROM event_log
      WHERE ${clauses.join(" AND ")}
      ORDER BY seq ASC
      LIMIT 200
    `).all(...args) as Array<{ seq: number; payload_json: string }>;
    const events = rows
      .map((row) => parseJson<CompanyEvent | null>(row.payload_json, null))
      .filter(isPresent);
    return {
      companyId,
      events,
      nextCursor: rows.length > 0 ? String(rows[rows.length - 1]!.seq) : cursor ?? null,
    };
  }

  getCollaborationScope(companyId: string, agentId: string): AuthorityCollaborationScopeResponse {
    const company = this.loadCompanyById(companyId);
    if (!company) {
      throw new Error(`Unknown company: ${companyId}`);
    }
    return buildCollaborationContextSnapshot({
      company,
      agentId,
    });
  }

  transitionRequirement(input: AuthorityRequirementTransitionRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const previousAggregate =
      runtime.activeRequirementAggregates.find((aggregate) => aggregate.id === input.aggregateId) ?? null;
    if (!previousAggregate) {
      throw new Error(`Unknown requirement aggregate: ${input.aggregateId}`);
    }
    const timestamp = input.timestamp ?? Date.now();
    const nextAggregates = runtime.activeRequirementAggregates.map((aggregate) => {
      if (aggregate.id !== input.aggregateId) {
        return aggregate;
      }
      const nextLastEvidenceAt =
        input.changes.lastEvidenceAt ??
        timestamp ??
        aggregate.lastEvidenceAt ??
        null;
      const nextAggregateBase: RequirementAggregateRecord = {
        ...aggregate,
        ...input.changes,
        updatedAt: aggregate.updatedAt,
        revision: aggregate.revision,
        lastEvidenceAt: nextLastEvidenceAt,
      };
      const changedFields = diffRequirementAggregateMaterialFields(aggregate, nextAggregateBase);
      if (changedFields.length === 0 && nextLastEvidenceAt === (aggregate.lastEvidenceAt ?? null)) {
        return aggregate;
      }
      return {
        ...nextAggregateBase,
        updatedAt:
          changedFields.length > 0
            ? Math.max(aggregate.updatedAt, timestamp, input.changes.updatedAt ?? 0)
            : aggregate.updatedAt,
        revision: changedFields.length > 0 ? aggregate.revision + 1 : aggregate.revision,
      };
    });
    const nextAggregate =
      nextAggregates.find((aggregate) => aggregate.id === input.aggregateId) ?? null;
    const nextEvidence =
      nextAggregate && nextAggregate.revision !== previousAggregate.revision
        ? sanitizeRequirementEvidenceEvents(input.companyId, [
            buildRequirementWorkflowEvidence({
              companyId: input.companyId,
              eventType: resolveRequirementWorkflowEventKind({
                previousAggregate,
                nextAggregate,
                changes: input.changes,
              }),
              aggregate: nextAggregate,
              previousAggregate,
              actorId: input.changes.ownerActorId ?? previousAggregate.ownerActorId,
              timestamp,
              source: input.source,
              changes: input.changes,
            }),
            ...runtime.activeRequirementEvidence,
          ])
        : runtime.activeRequirementEvidence;
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeRequirementAggregates: nextAggregates,
      activeRequirementEvidence: nextEvidence,
      primaryRequirementId:
        nextAggregates.find((aggregate) => aggregate.primary)?.id ?? runtime.primaryRequirementId,
    });
    if (nextAggregate) {
      this.appendCompanyEvent(
        createCompanyEvent({
          companyId: input.companyId,
          kind: resolveRequirementWorkflowEventKind({
            previousAggregate,
            nextAggregate,
            changes: input.changes,
          }),
          workItemId: nextAggregate.workItemId ?? undefined,
          topicKey: nextAggregate.topicKey ?? undefined,
          roomId: nextAggregate.roomId ?? undefined,
          fromActorId:
            input.changes.ownerActorId ??
            previousAggregate.ownerActorId ??
            "system:requirement-aggregate",
          targetActorId: nextAggregate.ownerActorId ?? undefined,
          sessionKey: nextAggregate.sourceConversationId ?? undefined,
          payload: buildRequirementWorkflowEvidencePayload({
            previousAggregate,
            nextAggregate,
            source: input.source,
            changes: input.changes,
          }),
        }),
      );
    }
    return nextRuntime;
  }

  promoteRequirement(input: AuthorityRequirementPromoteRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const nextPrimaryRequirementId =
      input.aggregateId && runtime.activeRequirementAggregates.some((aggregate) => aggregate.id === input.aggregateId)
        ? input.aggregateId
        : null;
    const previousPrimaryRequirementId = runtime.primaryRequirementId;
    const previousAggregate =
      previousPrimaryRequirementId
        ? runtime.activeRequirementAggregates.find((aggregate) => aggregate.id === previousPrimaryRequirementId) ?? null
        : null;
    const nextAggregates = sanitizeRequirementAggregateRecords(
      runtime.activeRequirementAggregates.map((aggregate) =>
        aggregate.id === nextPrimaryRequirementId
          ? {
              ...aggregate,
              updatedAt: aggregate.updatedAt,
            }
          : aggregate,
      ),
      nextPrimaryRequirementId,
    );
    const nextAggregate =
      nextPrimaryRequirementId
        ? nextAggregates.find((aggregate) => aggregate.id === nextPrimaryRequirementId) ?? null
        : null;
    const timestamp = input.timestamp ?? Date.now();
    const nextEvidence =
      nextAggregate && nextPrimaryRequirementId !== previousPrimaryRequirementId
        ? sanitizeRequirementEvidenceEvents(input.companyId, [
            buildRequirementWorkflowEvidence({
              companyId: input.companyId,
              eventType: "requirement_promoted",
              aggregate: nextAggregate,
              previousAggregate,
              actorId: nextAggregate.ownerActorId ?? previousAggregate?.ownerActorId,
              timestamp,
              source: input.source,
            }),
            ...runtime.activeRequirementEvidence,
          ])
        : runtime.activeRequirementEvidence;
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeRequirementAggregates: nextAggregates,
      activeRequirementEvidence: nextEvidence,
      primaryRequirementId: nextPrimaryRequirementId,
    });
    if (nextAggregate && nextPrimaryRequirementId !== previousPrimaryRequirementId) {
      this.appendCompanyEvent(
        createCompanyEvent({
          companyId: input.companyId,
          kind: "requirement_promoted",
          workItemId: nextAggregate.workItemId ?? undefined,
          topicKey: nextAggregate.topicKey ?? undefined,
          roomId: nextAggregate.roomId ?? undefined,
          fromActorId:
            nextAggregate.ownerActorId ??
            previousAggregate?.ownerActorId ??
            "system:requirement-aggregate",
          targetActorId: nextAggregate.ownerActorId ?? undefined,
          sessionKey: nextAggregate.sourceConversationId ?? undefined,
          payload: buildRequirementWorkflowEvidencePayload({
            previousAggregate,
            nextAggregate,
            source: input.source,
          }),
        }),
      );
    }
    return nextRuntime;
  }

  upsertRoom(input: AuthorityAppendRoomRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const nextRooms = [
      input.room,
      ...runtime.activeRoomRecords.filter((room) => room.id !== input.room.id),
    ];
    const nextRuntime = this.saveRuntime({ ...runtime, activeRoomRecords: nextRooms });
    const nextRoom = nextRuntime.activeRoomRecords.find((room) => room.id === input.room.id) ?? null;
    if (nextRoom) {
      this.appendRoomAuditEvent({
        companyId: input.companyId,
        kind: "room_record_upserted",
        room: nextRoom,
        timestamp: nextRoom.updatedAt,
      });
    }
    return nextRuntime;
  }

  deleteRoom(input: AuthorityRoomDeleteRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const deletedRoom = runtime.activeRoomRecords.find((room) => room.id === input.roomId) ?? null;
    const nextRooms = runtime.activeRoomRecords.filter((room) => room.id !== input.roomId);
    const nextBindings = runtime.activeRoomBindings.filter((binding) => binding.roomId !== input.roomId);
    const nextWorkItems = reconcileStoredWorkItems({
      company: this.loadCompanyById(input.companyId),
      companyId: input.companyId,
      workItems: runtime.activeWorkItems,
      rooms: nextRooms,
      artifacts: runtime.activeArtifacts,
      dispatches: runtime.activeDispatches,
      targetWorkItemIds: [deletedRoom?.workItemId],
      targetRoomIds: [input.roomId],
      targetTopicKeys: [deletedRoom?.topicKey],
    });
    const reconciledRequirements = reconcileRequirementAggregateState({
      companyId: input.companyId,
      existingAggregates: runtime.activeRequirementAggregates,
      primaryRequirementId: runtime.primaryRequirementId,
      activeConversationStates: runtime.activeConversationStates,
      activeWorkItems: nextWorkItems,
      activeRoomRecords: nextRooms,
      activeRequirementEvidence: runtime.activeRequirementEvidence,
    });
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeRoomRecords: nextRooms,
      activeRoomBindings: nextBindings,
      activeWorkItems: nextWorkItems,
      activeRequirementAggregates: reconciledRequirements.activeRequirementAggregates,
      primaryRequirementId: reconciledRequirements.primaryRequirementId,
    });
    if (deletedRoom) {
      this.appendRoomAuditEvent({
        companyId: input.companyId,
        kind: "room_record_deleted",
        room: deletedRoom,
        timestamp: Date.now(),
      });
    }
    return nextRuntime;
  }

  upsertRoomBindings(input: AuthorityRoomBindingsUpsertRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const nextBindings = mergeRoomConversationBindings({
      existing: runtime.activeRoomBindings,
      incoming: input.bindings,
    });
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeRoomBindings: nextBindings,
    });
    if (input.bindings.length > 0) {
      this.appendRoomBindingsAuditEvent({
        companyId: input.companyId,
        bindings: input.bindings,
        timestamp: Date.now(),
      });
    }
    return nextRuntime;
  }

  upsertRound(input: AuthorityRoundUpsertRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const nextRounds = [
      {
        ...input.round,
        companyId: input.companyId,
      },
      ...runtime.activeRoundRecords.filter((round) => round.id !== input.round.id),
    ];
    return this.saveRuntime({
      ...runtime,
      activeRoundRecords: nextRounds,
    });
  }

  deleteRound(input: AuthorityRoundDeleteRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const nextRounds = runtime.activeRoundRecords.filter((round) => round.id !== input.roundId);
    if (nextRounds.length === runtime.activeRoundRecords.length) {
      return runtime;
    }
    return this.saveRuntime({
      ...runtime,
      activeRoundRecords: nextRounds,
    });
  }

  upsertMission(input: AuthorityMissionUpsertRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const nextMissions = [...runtime.activeMissionRecords];
    const index = nextMissions.findIndex((mission) => mission.id === input.mission.id);
    const normalizedMission = {
      ...input.mission,
      companyId: input.companyId,
    };
    if (index >= 0) {
      const existing = nextMissions[index]!;
      const merged = { ...existing, ...normalizedMission };
      if (isSameMissionRecord(existing, merged)) {
        return runtime;
      }
      if (normalizedMission.updatedAt <= existing.updatedAt) {
        return runtime;
      }
      nextMissions[index] = merged;
    } else {
      nextMissions.push(normalizedMission);
    }

    const sortedMissions = [...nextMissions].sort((left, right) => right.updatedAt - left.updatedAt);
    const roomIdFromBinding =
      normalizedMission.roomId
        ? runtime.activeRoomBindings.find((binding) => binding.conversationId === normalizedMission.roomId)?.roomId
          ?? null
        : null;
    const matchingRoom =
      runtime.activeRoomRecords.find(
        (room) => room.id === normalizedMission.roomId || room.workItemId === normalizedMission.id,
      )
      ?? (roomIdFromBinding
        ? runtime.activeRoomRecords.find((room) => room.id === roomIdFromBinding) ?? null
        : null);
    const existingWorkItem =
      runtime.activeWorkItems.find((item) => item.id === normalizedMission.id)
      ?? runtime.activeWorkItems.find((item) => item.sourceMissionId === normalizedMission.id)
      ?? null;
    const nextWorkItem =
      normalizedMission.topicKey && isArtifactRequirementTopic(normalizedMission.topicKey)
        ? null
        : reconcileWorkItemRecord({
            companyId: input.companyId,
            company: this.loadCompanyById(input.companyId),
            existingWorkItem,
            mission: normalizedMission,
            room: matchingRoom,
            fallbackSessionKey: normalizedMission.sessionKey,
            fallbackRoomId: matchingRoom?.id ?? normalizedMission.roomId ?? null,
          })
          ?? buildWorkItemRecordFromMission({
            companyId: input.companyId,
            mission: normalizedMission,
            room: matchingRoom,
          });
    const nextWorkItems = [...runtime.activeWorkItems];
    if (nextWorkItem) {
      const workItemIndex = nextWorkItems.findIndex((item) => item.id === nextWorkItem.id);
      if (workItemIndex >= 0) {
        const existingLinked = nextWorkItems[workItemIndex]!;
        if (nextWorkItem.updatedAt > existingLinked.updatedAt) {
          nextWorkItems[workItemIndex] = {
            ...existingLinked,
            ...nextWorkItem,
            roomId: nextWorkItem.roomId ?? existingLinked.roomId,
            artifactIds:
              nextWorkItem.artifactIds.length > 0 ? nextWorkItem.artifactIds : existingLinked.artifactIds,
            dispatchIds:
              nextWorkItem.dispatchIds.length > 0 ? nextWorkItem.dispatchIds : existingLinked.dispatchIds,
          };
        }
      } else {
        nextWorkItems.push(nextWorkItem);
      }
    }

    return this.saveRuntime({
      ...runtime,
      activeMissionRecords: sortedMissions,
      activeWorkItems: sanitizeWorkItemRecords(nextWorkItems),
    });
  }

  deleteMission(input: AuthorityMissionDeleteRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const nextMissions = runtime.activeMissionRecords.filter((mission) => mission.id !== input.missionId);
    if (nextMissions.length === runtime.activeMissionRecords.length) {
      return runtime;
    }
    return this.saveRuntime({
      ...runtime,
      activeMissionRecords: nextMissions,
    });
  }

  upsertConversationState(input: AuthorityConversationStateUpsertRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const index = runtime.activeConversationStates.findIndex(
      (record) => record.conversationId === input.conversationId,
    );
    const timestamp = input.timestamp ?? Date.now();
    const nextRecord: ConversationStateRecord = index >= 0
      ? {
          ...runtime.activeConversationStates[index]!,
          ...input.changes,
          companyId: input.companyId,
          conversationId: input.conversationId,
          updatedAt: Math.max(runtime.activeConversationStates[index]!.updatedAt, timestamp),
        }
      : {
          companyId: input.companyId,
          conversationId: input.conversationId,
          currentWorkKey: input.changes.currentWorkKey ?? null,
          currentWorkItemId: input.changes.currentWorkItemId ?? null,
          currentRoundId: input.changes.currentRoundId ?? null,
          draftRequirement: input.changes.draftRequirement ?? null,
          updatedAt: timestamp,
        };
    if (index >= 0 && areConversationStateRecordsEquivalent(runtime.activeConversationStates[index]!, nextRecord)) {
      return runtime;
    }
    const nextConversationStates = [...runtime.activeConversationStates];
    if (index >= 0) {
      nextConversationStates[index] = nextRecord;
    } else {
      nextConversationStates.push(nextRecord);
    }
    return this.saveRuntime({
      ...runtime,
      activeConversationStates: nextConversationStates.sort((left, right) => right.updatedAt - left.updatedAt),
    });
  }

  deleteConversationState(input: AuthorityConversationStateDeleteRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const nextConversationStates = runtime.activeConversationStates.filter(
      (record) => record.conversationId !== input.conversationId,
    );
    if (nextConversationStates.length === runtime.activeConversationStates.length) {
      return runtime;
    }
    return this.saveRuntime({
      ...runtime,
      activeConversationStates: nextConversationStates,
    });
  }

  upsertWorkItem(input: AuthorityWorkItemUpsertRequest) {
    const runtime = this.loadRuntime(input.companyId);
    if (input.workItem.topicKey && isArtifactRequirementTopic(input.workItem.topicKey)) {
      return runtime;
    }
    const nextWorkItems = [...runtime.activeWorkItems];
    const index = nextWorkItems.findIndex((item) => item.id === input.workItem.id);
    const normalizedWorkItem = {
      ...input.workItem,
      companyId: input.companyId,
      roomId: input.workItem.roomId ?? buildRoomRecordIdFromWorkItem(input.workItem.id),
    };
    if (index >= 0) {
      const existing = nextWorkItems[index]!;
      const merged = {
        ...existing,
        ...normalizedWorkItem,
        artifactIds:
          normalizedWorkItem.artifactIds.length > 0 ? normalizedWorkItem.artifactIds : existing.artifactIds,
        dispatchIds:
          normalizedWorkItem.dispatchIds.length > 0 ? normalizedWorkItem.dispatchIds : existing.dispatchIds,
        sourceActorId: normalizedWorkItem.sourceActorId ?? existing.sourceActorId ?? null,
        sourceActorLabel: normalizedWorkItem.sourceActorLabel ?? existing.sourceActorLabel ?? null,
        sourceSessionKey: normalizedWorkItem.sourceSessionKey ?? existing.sourceSessionKey ?? null,
        sourceConversationId:
          normalizedWorkItem.sourceConversationId ?? existing.sourceConversationId ?? null,
        providerId: normalizedWorkItem.providerId ?? existing.providerId ?? null,
        updatedAt: Math.max(existing.updatedAt, normalizedWorkItem.updatedAt),
      };
      if (areWorkItemRecordsEquivalent(existing, merged)) {
        return runtime;
      }
      nextWorkItems[index] = merged;
    } else {
      nextWorkItems.push(normalizedWorkItem);
    }

    const sortedWorkItems = sanitizeWorkItemRecords(nextWorkItems);
    const nextRooms = runtime.activeRoomRecords.map((room) =>
      room.workItemId === normalizedWorkItem.id || room.id === normalizedWorkItem.roomId
        ? {
            ...room,
            companyId: room.companyId ?? input.companyId,
            workItemId: normalizedWorkItem.id,
            ownerActorId: normalizedWorkItem.ownerActorId ?? room.ownerActorId ?? room.ownerAgentId ?? null,
            ownerAgentId: normalizedWorkItem.ownerActorId ?? room.ownerAgentId ?? null,
            status: normalizedWorkItem.status === "archived" ? "archived" : room.status ?? "active",
          }
        : room,
    );

    return this.saveRuntime({
      ...runtime,
      activeWorkItems: sortedWorkItems,
      activeRoomRecords: nextRooms,
    });
  }

  deleteWorkItem(input: AuthorityWorkItemDeleteRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const nextWorkItems = runtime.activeWorkItems.filter((item) => item.id !== input.workItemId);
    if (nextWorkItems.length === runtime.activeWorkItems.length) {
      return runtime;
    }
    return this.saveRuntime({
      ...runtime,
      activeWorkItems: nextWorkItems,
    });
  }

  upsertDispatch(input: AuthorityDispatchUpsertRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const nextDispatches = [
      input.dispatch,
      ...runtime.activeDispatches.filter((dispatch) => dispatch.id !== input.dispatch.id),
    ];
    const nextWorkItems = reconcileStoredWorkItems({
      company: this.loadCompanyById(input.companyId),
      companyId: input.companyId,
      workItems: runtime.activeWorkItems,
      rooms: runtime.activeRoomRecords,
      artifacts: runtime.activeArtifacts,
      dispatches: nextDispatches,
      targetWorkItemIds: [input.dispatch.workItemId],
      targetRoomIds: [input.dispatch.roomId],
      targetTopicKeys: [input.dispatch.topicKey],
    });
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeWorkItems: nextWorkItems,
      activeDispatches: nextDispatches,
    });
    const nextDispatch = nextRuntime.activeDispatches.find((dispatch) => dispatch.id === input.dispatch.id) ?? null;
    if (nextDispatch) {
      this.appendDispatchAuditEvent({
        companyId: input.companyId,
        kind: "dispatch_record_upserted",
        dispatch: nextDispatch,
        timestamp: nextDispatch.updatedAt,
      });
    }
    return nextRuntime;
  }

  deleteDispatch(input: AuthorityDispatchDeleteRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const deletedDispatch = runtime.activeDispatches.find((dispatch) => dispatch.id === input.dispatchId) ?? null;
    const nextDispatches = runtime.activeDispatches.filter((dispatch) => dispatch.id !== input.dispatchId);
    const nextWorkItems = reconcileStoredWorkItems({
      company: this.loadCompanyById(input.companyId),
      companyId: input.companyId,
      workItems: runtime.activeWorkItems,
      rooms: runtime.activeRoomRecords,
      artifacts: runtime.activeArtifacts,
      dispatches: nextDispatches,
      targetWorkItemIds: [deletedDispatch?.workItemId],
      targetRoomIds: [deletedDispatch?.roomId],
      targetTopicKeys: [deletedDispatch?.topicKey],
    });
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeWorkItems: nextWorkItems,
      activeDispatches: nextDispatches,
    });
    if (deletedDispatch) {
      this.appendDispatchAuditEvent({
        companyId: input.companyId,
        kind: "dispatch_record_deleted",
        dispatch: deletedDispatch,
        timestamp: Date.now(),
      });
    }
    return nextRuntime;
  }

  upsertArtifact(input: AuthorityArtifactUpsertRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const normalizedArtifact = {
      ...input.artifact,
      updatedAt: input.artifact.updatedAt || Date.now(),
      createdAt: input.artifact.createdAt || Date.now(),
    };
    const nextArtifacts = [
      normalizedArtifact,
      ...runtime.activeArtifacts.filter((artifact) => artifact.id !== normalizedArtifact.id),
    ].sort((left, right) => right.updatedAt - left.updatedAt);
    const nextWorkItems = reconcileStoredWorkItems({
      company: this.loadCompanyById(input.companyId),
      companyId: input.companyId,
      workItems: runtime.activeWorkItems,
      rooms: runtime.activeRoomRecords,
      artifacts: nextArtifacts,
      dispatches: runtime.activeDispatches,
      targetWorkItemIds: [normalizedArtifact.workItemId],
    });
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeArtifacts: nextArtifacts,
      activeWorkItems: nextWorkItems,
    });
    const nextArtifact = nextRuntime.activeArtifacts.find((artifact) => artifact.id === normalizedArtifact.id) ?? null;
    if (nextArtifact) {
      this.appendArtifactAuditEvent({
        companyId: input.companyId,
        kind: "artifact_record_upserted",
        artifact: nextArtifact,
        timestamp: nextArtifact.updatedAt,
      });
    }
    return nextRuntime;
  }

  syncArtifactMirrors(input: AuthorityArtifactMirrorSyncRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const mirrorPrefix = input.mirrorPrefix ?? "workspace:";
    const preserved = runtime.activeArtifacts.filter((artifact) => !artifact.id.startsWith(mirrorPrefix));
    const mergedById = new Map<string, ArtifactRecord>();
    for (const artifact of preserved) {
      mergedById.set(artifact.id, artifact);
    }
    const normalizedIncoming = input.artifacts.map((artifact) => ({
      ...artifact,
      updatedAt: artifact.updatedAt || Date.now(),
      createdAt: artifact.createdAt || Date.now(),
    }));
    for (const artifact of normalizedIncoming) {
      const existing = mergedById.get(artifact.id);
      if (!existing) {
        mergedById.set(artifact.id, artifact);
        continue;
      }
      mergedById.set(artifact.id, {
        ...existing,
        ...artifact,
        summary: artifact.summary ?? existing.summary,
        content: artifact.content ?? existing.content,
      });
    }
    const nextArtifacts = [...mergedById.values()].sort((left, right) => right.updatedAt - left.updatedAt);
    const nextWorkItems = reconcileStoredWorkItems({
      company: this.loadCompanyById(input.companyId),
      companyId: input.companyId,
      workItems: runtime.activeWorkItems,
      rooms: runtime.activeRoomRecords,
      artifacts: nextArtifacts,
      dispatches: runtime.activeDispatches,
      targetWorkItemIds: normalizedIncoming.map((artifact) => artifact.workItemId),
    });
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeArtifacts: nextArtifacts,
      activeWorkItems: nextWorkItems,
    });
    if (normalizedIncoming.length > 0) {
      this.appendArtifactMirrorSyncEvent({
        companyId: input.companyId,
        mirrorPrefix,
        artifacts: normalizedIncoming,
        timestamp: Date.now(),
      });
    }
    return nextRuntime;
  }

  deleteArtifact(input: AuthorityArtifactDeleteRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const deletedArtifact = runtime.activeArtifacts.find((artifact) => artifact.id === input.artifactId) ?? null;
    const nextArtifacts = runtime.activeArtifacts.filter((artifact) => artifact.id !== input.artifactId);
    const nextWorkItems = reconcileStoredWorkItems({
      company: this.loadCompanyById(input.companyId),
      companyId: input.companyId,
      workItems: runtime.activeWorkItems,
      rooms: runtime.activeRoomRecords,
      artifacts: nextArtifacts,
      dispatches: runtime.activeDispatches,
      targetWorkItemIds: [deletedArtifact?.workItemId],
    });
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeArtifacts: nextArtifacts,
      activeWorkItems: nextWorkItems,
    });
    if (deletedArtifact) {
      this.appendArtifactAuditEvent({
        companyId: input.companyId,
        kind: "artifact_record_deleted",
        artifact: deletedArtifact,
        timestamp: Date.now(),
      });
    }
    return nextRuntime;
  }

  upsertDecisionTicket(input: AuthorityDecisionTicketUpsertRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const normalizedTicket = normalizeDecisionTicketRecord(input.companyId, input.ticket);
    const existing =
      runtime.activeDecisionTickets.find((ticket) => ticket.id === normalizedTicket.id) ?? null;
    const nextTicket =
      existing
        ? (() => {
            const candidate = normalizeDecisionTicketRecord(input.companyId, {
              ...existing,
              ...normalizedTicket,
            });
            const existingRevision = normalizeDecisionTicketRevision(existing.revision);
            const requestedRevision = normalizeDecisionTicketRevision(normalizedTicket.revision);
            const candidateRevision = decisionTicketMaterialChanged(existing, candidate)
              ? Math.max(existingRevision, requestedRevision) + 1
              : Math.max(existingRevision, requestedRevision);
            if (
              candidateRevision < existingRevision ||
              (candidateRevision === existingRevision && candidate.updatedAt <= existing.updatedAt)
            ) {
              return existing;
            }
            return {
              ...candidate,
              revision: candidateRevision,
            };
          })()
        : normalizedTicket;
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeDecisionTickets: [
        nextTicket,
        ...runtime.activeDecisionTickets.filter((ticket) => ticket.id !== nextTicket.id),
      ].sort((left, right) => right.updatedAt - left.updatedAt),
    });
    if (!existing || nextTicket !== existing) {
      this.appendDecisionTicketEvent({
        companyId: input.companyId,
        kind: "decision_record_upserted",
        ticket: nextTicket,
        timestamp: nextTicket.updatedAt,
      });
    }
    return nextRuntime;
  }

  resolveDecisionTicket(input: AuthorityDecisionTicketResolveRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const existing = runtime.activeDecisionTickets.find((ticket) => ticket.id === input.ticketId) ?? null;
    if (!existing) {
      throw new Error(`Unknown decision ticket: ${input.ticketId}`);
    }
    const option =
      input.optionId != null
        ? existing.options.find((candidate) => candidate.id === input.optionId) ?? null
        : null;
    const updatedAt = Math.max(existing.updatedAt, input.timestamp ?? Date.now());
    const resolution = input.resolution ?? option?.summary ?? option?.label ?? existing.resolution ?? null;
    const resolutionOptionId = option?.id ?? input.optionId ?? null;
    if (
      existing.status === "resolved" &&
      (existing.resolution ?? null) === resolution &&
      (existing.resolutionOptionId ?? null) === resolutionOptionId &&
      updatedAt <= existing.updatedAt
    ) {
      return runtime;
    }
    const nextTickets = runtime.activeDecisionTickets
      .map((ticket) =>
        ticket.id === input.ticketId
          ? {
              ...ticket,
              status: "resolved" as const,
              resolution,
              resolutionOptionId,
              revision: normalizeDecisionTicketRevision(ticket.revision) + 1,
              updatedAt,
            }
          : ticket,
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeDecisionTickets: nextTickets,
    });
    const nextTicket = nextTickets.find((ticket) => ticket.id === input.ticketId) ?? null;
    if (nextTicket) {
      this.appendDecisionTicketEvent({
        companyId: input.companyId,
        kind: "decision_resolved",
        ticket: nextTicket,
        timestamp: updatedAt,
      });
    }
    return nextRuntime;
  }

  cancelDecisionTicket(input: AuthorityDecisionTicketCancelRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const existing = runtime.activeDecisionTickets.find((ticket) => ticket.id === input.ticketId) ?? null;
    if (!existing) {
      throw new Error(`Unknown decision ticket: ${input.ticketId}`);
    }
    const updatedAt = Math.max(existing.updatedAt, input.timestamp ?? Date.now());
    const resolution = input.resolution ?? existing.resolution ?? null;
    if (
      existing.status === "cancelled" &&
      (existing.resolution ?? null) === resolution &&
      updatedAt <= existing.updatedAt
    ) {
      return runtime;
    }
    const nextTickets = runtime.activeDecisionTickets
      .map((ticket) =>
        ticket.id === input.ticketId
          ? {
              ...ticket,
              status: "cancelled" as const,
              resolution,
              resolutionOptionId: null,
              revision: normalizeDecisionTicketRevision(ticket.revision) + 1,
              updatedAt,
            }
          : ticket,
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeDecisionTickets: nextTickets,
    });
    const nextTicket = nextTickets.find((ticket) => ticket.id === input.ticketId) ?? null;
    if (nextTicket) {
      this.appendDecisionTicketEvent({
        companyId: input.companyId,
        kind: "decision_cancelled",
        ticket: nextTicket,
        timestamp: updatedAt,
      });
    }
    return nextRuntime;
  }

  deleteDecisionTicket(input: AuthorityDecisionTicketDeleteRequest) {
    const runtime = this.loadRuntime(input.companyId);
    const deletedTicket = runtime.activeDecisionTickets.find((ticket) => ticket.id === input.ticketId) ?? null;
    const nextRuntime = this.saveRuntime({
      ...runtime,
      activeDecisionTickets: runtime.activeDecisionTickets.filter((ticket) => ticket.id !== input.ticketId),
    });
    if (deletedTicket) {
      this.appendDecisionTicketEvent({
        companyId: input.companyId,
        kind: "decision_record_deleted",
        ticket: deletedTicket,
        timestamp: Date.now(),
      });
    }
    return nextRuntime;
  }

}

function buildCompanyDefinition(input: AuthorityCreateCompanyRequest): {
  company: Company;
  runtime: AuthorityCompanyRuntimeSnapshot;
  agentFiles: Array<{ agentId: string; name: string; content: string }>;
} {
  const blueprint = input.blueprintText ? parseCompanyBlueprint(input.blueprintText) : null;
  const template =
    COMPANY_TEMPLATES.find((entry) => entry.id === (blueprint?.template ?? input.templateId)) ??
    COMPANY_TEMPLATES.find((entry) => entry.id === "blank") ??
    COMPANY_TEMPLATES[0];
  const companyId = crypto.randomUUID();
  const companyName = input.companyName.trim() || blueprint?.sourceCompanyName || "新公司";
  const namespace = `${slugify(companyName)}-${companyId.slice(0, 6)}`;

  const departments: Department[] = [
    {
      id: crypto.randomUUID(),
      name: "管理中枢",
      leadAgentId: `${namespace}-ceo`,
      kind: "meta",
      color: "slate",
      order: 0,
      missionPolicy: "manager_delegated",
    },
    {
      id: crypto.randomUUID(),
      name: "人力资源部",
      leadAgentId: `${namespace}-hr`,
      kind: "support",
      color: "rose",
      order: 1,
      missionPolicy: "support_only",
    },
    {
      id: crypto.randomUUID(),
      name: "技术部",
      leadAgentId: `${namespace}-cto`,
      kind: "support",
      color: "indigo",
      order: 2,
      missionPolicy: "support_only",
    },
    {
      id: crypto.randomUUID(),
      name: "运营部",
      leadAgentId: `${namespace}-coo`,
      kind: "support",
      color: "emerald",
      order: 3,
      missionPolicy: "support_only",
    },
  ];
  const deptByName = new Map(departments.map((department) => [department.name, department.id] as const));
  const employees: EmployeeRef[] = [
    {
      agentId: `${namespace}-ceo`,
      nickname: "CEO",
      role: "Chief Executive Officer",
      isMeta: true,
      metaRole: "ceo",
      departmentId: deptByName.get("管理中枢"),
    },
    {
      agentId: `${namespace}-hr`,
      nickname: "HR",
      role: "Human Resources Director",
      isMeta: true,
      metaRole: "hr",
      reportsTo: `${namespace}-ceo`,
      departmentId: deptByName.get("人力资源部"),
    },
    {
      agentId: `${namespace}-cto`,
      nickname: "CTO",
      role: "Chief Technology Officer",
      isMeta: true,
      metaRole: "cto",
      reportsTo: `${namespace}-ceo`,
      departmentId: deptByName.get("技术部"),
    },
    {
      agentId: `${namespace}-coo`,
      nickname: "COO",
      role: "Chief Operating Officer",
      isMeta: true,
      metaRole: "coo",
      reportsTo: `${namespace}-ceo`,
      departmentId: deptByName.get("运营部"),
    },
  ];

  const reportsToMap: Record<string, string> = {
    ceo: `${namespace}-ceo`,
    hr: `${namespace}-hr`,
    cto: `${namespace}-cto`,
    coo: `${namespace}-coo`,
  };

  if (blueprint) {
    const blueprintIdMap = new Map<string, string>();
    blueprintIdMap.set("meta:ceo", `${namespace}-ceo`);
    blueprintIdMap.set("meta:hr", `${namespace}-hr`);
    blueprintIdMap.set("meta:cto", `${namespace}-cto`);
    blueprintIdMap.set("meta:coo", `${namespace}-coo`);

    for (const employee of blueprint.employees.filter((entry) => !entry.isMeta)) {
      const agentId = `${namespace}-${slugify(employee.nickname || employee.role)}-${employees.length}`;
      blueprintIdMap.set(employee.blueprintId, agentId);
      employees.push({
        agentId,
        nickname: employee.nickname,
        role: employee.role,
        isMeta: false,
        reportsTo: employee.reportsToBlueprintId ? blueprintIdMap.get(employee.reportsToBlueprintId) ?? reportsToMap.ceo : reportsToMap.ceo,
        departmentId: employee.departmentName ? deptByName.get(employee.departmentName) : undefined,
      });
    }

    for (const department of blueprint.departments) {
      if (deptByName.has(department.name)) {
        continue;
      }
      const nextDepartment: Department = {
        id: crypto.randomUUID(),
        name: department.name,
        leadAgentId: department.leadBlueprintId ? blueprintIdMap.get(department.leadBlueprintId) ?? reportsToMap.coo : reportsToMap.coo,
        kind: "business",
        color: department.color,
        order: department.order,
        missionPolicy: "manager_delegated",
      };
      departments.push(nextDepartment);
      deptByName.set(nextDepartment.name, nextDepartment.id);
    }
  } else {
    for (const employee of template?.employees ?? []) {
      const reportsTo = employee.reportsToRole ? reportsToMap[employee.reportsToRole] : reportsToMap.ceo;
      employees.push({
        agentId: `${namespace}-${slugify(employee.nickname || employee.role)}-${employees.length}`,
        nickname: employee.nickname,
        role: employee.role,
        isMeta: false,
        reportsTo,
        departmentId: departments.find((department) => department.leadAgentId === reportsTo)?.id,
      });
    }
  }

  const quickPrompts: QuickPrompt[] = blueprint
    ? blueprint.quickPrompts.map((prompt) => ({
        label: prompt.label,
        icon: prompt.icon,
        prompt: prompt.prompt,
        targetAgentId: employees[0]?.agentId ?? reportsToMap.ceo,
      }))
    : [];

  const baseCompany: Company = {
    id: companyId,
    name: companyName,
    description: blueprint?.description || template?.description || "",
    icon: blueprint?.icon || template?.icon || "🏢",
    template: blueprint?.template || template?.id || "blank",
    orgSettings: buildDefaultOrgSettings({ autoCalibrate: true }),
    departments,
    employees,
    quickPrompts,
    knowledgeItems: blueprint?.knowledgeItems ?? [],
    createdAt: Date.now(),
  };

  const bootstrap = buildCompanyWorkspaceBootstrap(normalizeCompany(baseCompany));
  return {
    company: normalizeCompany(bootstrap.company),
    runtime: bootstrap.runtime,
    agentFiles: buildManagedExecutorFilesForCompany(normalizeCompany(bootstrap.company)),
  };
}

async function hireCompanyEmployeesStrongConsistency(input: {
  companyId: string;
  hires: AuthorityHireEmployeeInput[];
}): Promise<AuthorityBatchHireEmployeesResponse> {
  const currentConfig = repository.loadConfig();
  if (!currentConfig) {
    throw new Error("当前没有可用的公司配置。");
  }

  const currentCompany = currentConfig.companies.find((company) => company.id === input.companyId) ?? null;
  if (!currentCompany) {
    throw new Error(`Unknown company: ${input.companyId}`);
  }

  const planned = planHiredEmployeesBatch(currentCompany, input.hires);
  const nextConfig: CyberCompanyConfig = {
    ...currentConfig,
    companies: currentConfig.companies.map((company) =>
      company.id === input.companyId ? planned.company : company,
    ),
    activeCompanyId:
      currentConfig.activeCompanyId === input.companyId ? input.companyId : currentConfig.activeCompanyId,
  };

  await runManagedExecutorMutation(async () => {
    repository.saveConfig(nextConfig);
    try {
      await ensureManagedCompanyExecutorProvisioned(
        planned.company,
        repository.loadRuntime(planned.company.id),
        input.hires.length > 1 ? "company.employee.batch_hire" : "company.employee.hire",
      );
      for (const hire of planned.hires) {
        const bootstrapFile = buildEmployeeBootstrapFile({
          ...input.hires[hire.inputIndex],
          agentId: hire.employee.agentId,
        });
        repository.setAgentFile(bootstrapFile.agentId, bootstrapFile.name, bootstrapFile.content);
        await syncAgentFileToExecutor(bootstrapFile);
      }
    } catch (error) {
      for (const hire of [...planned.hires].reverse()) {
        try {
          await deleteManagedAgentFromExecutor(hire.employee.agentId);
          repository.clearManagedExecutorAgent(hire.employee.agentId);
        } catch {
          // Best-effort rollback for partially provisioned hires.
        }
      }
      repository.saveConfig(currentConfig);
      throw error;
    }
  });

  return {
    company:
      repository.loadConfig()?.companies.find((company) => company.id === input.companyId) ?? planned.company,
    config: repository.loadConfig() ?? nextConfig,
    runtime: repository.loadRuntime(input.companyId),
    warnings: planned.warnings,
    employees: planned.hires
      .toSorted((left, right) => left.inputIndex - right.inputIndex)
      .map((hire) => hire.employee),
  };
}

async function hireCompanyEmployeeStrongConsistency(input: AuthorityHireEmployeeRequest): Promise<AuthorityHireEmployeeResponse> {
  const batch = await hireCompanyEmployeesStrongConsistency({
    companyId: input.companyId,
    hires: [input],
  });
  const [employee] = batch.employees;
  if (!employee) {
    throw new Error("招聘结果缺少新员工记录。");
  }
  return {
    ...batch,
    employee,
  };
}

function buildDefaultMainCompanyDefinition(): {
  company: Company;
  agentFiles: Array<{ agentId: string; name: string; content: string }>;
} {
  const company = buildDefaultMainCompany();

  return {
    company,
    agentFiles: buildManagedExecutorFilesForCompany(company),
  };
}

const repository = new AuthorityRepository(DB_PATH);
repository.ensureManagedExecutorAgentInventory();
for (const company of repository.loadConfig()?.companies ?? []) {
  try {
    repository.repairRuntimeIfNeeded(company.id);
  } catch (error) {
    console.warn(`Authority startup runtime repair failed for ${company.id}.`, error);
  }
}
const companyOpsEngine = new CompanyOpsEngine(
  {
    loadConfig: () => repository.loadConfig(),
    saveConfig: (config) => repository.saveConfig(config),
    loadRuntime: (companyId) => repository.loadRuntime(companyId),
    saveRuntime: (runtime) => repository.saveRuntime(runtime),
    appendCompanyEvent: (event) => repository.appendCompanyEvent(event),
  },
  {
    onCompanyChanged: (companyId) => {
      broadcast({ type: "bootstrap.updated", companyId, timestamp: Date.now() });
      broadcast({ type: "company.updated", companyId, timestamp: Date.now() });
    },
    onRuntimeChanged: (companyId) => {
      broadcast({ type: "company.updated", companyId, timestamp: Date.now() });
    },
  },
);
const executorBridge = createOpenClawExecutorBridge(repository.loadExecutorConfig(), {
  resolveFallbackToken: () => resolveLocalOpenClawGatewayToken(),
});
const managedFileMirrorQueue = createManagedFileMirrorQueue((file) =>
  executorBridge.request("agents.files.set", file)
);
let lastExecutorConnectionState = executorBridge.snapshot().connectionState;
syncAuthorityAgentFileMirror = (file) => {
  void syncAgentFileToExecutor(file).catch((error) => {
    if (isAgentNotFoundError(error)) {
      void queueManagedExecutorSync(`agent-file-miss:${file.agentId}`);
      return;
    }
    console.warn(`Failed to mirror ${file.name} to executor for ${file.agentId}`, error);
  });
};
const sockets = new Set<WebSocket>();

function broadcast(event: AuthorityEvent) {
  const encoded = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(encoded);
    }
  }
}

function getExecutorSnapshot() {
  const current = repository.loadExecutorConfig();
  const bridgeSnapshot = executorBridge.snapshot();
  const stored = repository.saveExecutorConfig({
    ...current,
    openclaw: {
      url: bridgeSnapshot.openclaw.url,
      token: current.openclaw.token ?? "",
    },
    connectionState: bridgeSnapshot.connectionState,
    lastError: bridgeSnapshot.lastError,
    lastConnectedAt: bridgeSnapshot.lastConnectedAt,
  });
  const executorStatus = executorBridge.status();
  const executor =
    sessionStatusCapabilityState === "unsupported" && executorStatus.state === "ready"
      ? {
          ...executorStatus,
          note: `${executorStatus.note} 当前 OpenClaw 未提供 session_status，Authority 已降级为 lifecycle/chat 修复。`,
        }
      : executorStatus;
  return {
    executor,
    executorConfig: toPublicExecutorConfig(stored),
    executorCapabilities: buildExecutorCapabilitySnapshot(executor),
  };
}

function buildHealthSnapshot() {
  return repository.getHealth(getExecutorSnapshot());
}

function buildBootstrapSnapshot() {
  return repository.getBootstrap(getExecutorSnapshot());
}

function broadcastExecutorStatus() {
  const snapshot = getExecutorSnapshot();
  broadcast({
    type: "executor.status",
    timestamp: Date.now(),
    payload: {
      executor: snapshot.executor,
      executorConfig: snapshot.executorConfig,
    },
  });
}

function normalizeChatPayload(payload: unknown): Extract<AuthorityEvent, { type: "chat" }>["payload"] | null {
  if (!isRecord(payload)) {
    return null;
  }
  const runId = readString(payload.runId);
  const sessionKey = readString(payload.sessionKey);
  const state = readString(payload.state);
  if (!runId || !sessionKey || !state) {
    return null;
  }
  if (state !== "delta" && state !== "final" && state !== "aborted" && state !== "error") {
    return null;
  }
  return {
    runId,
    sessionKey,
    seq: readNumber(payload.seq) ?? 0,
    state,
    message: payload.message as Extract<AuthorityEvent, { type: "chat" }>["payload"]["message"],
    errorMessage: readString(payload.errorMessage) ?? undefined,
  };
}

function buildRuntimeEventFromChatPayload(input: {
  payload: Extract<AuthorityEvent, { type: "chat" }>["payload"];
  agentId?: string | null;
}): ProviderRuntimeEvent {
  return {
    providerId: EXECUTOR_PROVIDER_ID,
    agentId: input.agentId ?? null,
    sessionKey: input.payload.sessionKey,
    runId: input.payload.runId,
    streamKind: input.payload.state === "delta" ? "assistant" : "lifecycle",
    runState:
      input.payload.state === "delta"
        ? "streaming"
        : input.payload.state === "final"
          ? "completed"
          : input.payload.state === "error"
            ? "error"
            : "aborted",
    timestamp: input.payload.message?.timestamp ?? Date.now(),
    errorMessage: input.payload.errorMessage ?? null,
    raw: input.payload,
  };
}

function broadcastAgentRuntimeEvent(companyId: string | null, event: ProviderRuntimeEvent) {
  broadcast({
    type: "agent.runtime.updated",
    companyId,
    timestamp: event.timestamp,
    payload: {
      event,
    },
  });
}

async function syncAgentFileToExecutor(input: { agentId: string; name: string; content: string }) {
  return managedFileMirrorQueue.sync(input);
}

async function deleteManagedAgentFromExecutor(agentId: string) {
  try {
    await executorBridge.request("agents.delete", {
      agentId,
      deleteFiles: true,
      purgeState: true,
    });
  } catch (error) {
    if (isLegacyAgentsDeletePurgeStateError(error)) {
      await executorBridge.request("agents.delete", {
        agentId,
        deleteFiles: true,
      });
      return;
    }
    throw error;
  }

  const remainingAgentIds = await waitForExecutorAgentsAbsent({
    agentIds: [agentId],
    listExecutorAgentIds,
    timeoutMs: EXECUTOR_AGENT_VISIBILITY_TIMEOUT_MS,
    pollMs: EXECUTOR_AGENT_VISIBILITY_POLL_MS,
  });
  if (remainingAgentIds.size > 0) {
    throw new Error(`OpenClaw agent ${agentId} 在删除后仍可见。`);
  }
}

type ExecutorAgentsListResult = {
  agents?: Array<{ id?: string }>;
};

const EXECUTOR_AGENT_VISIBILITY_TIMEOUT_MS = 15_000;
const EXECUTOR_AGENT_VISIBILITY_POLL_MS = 200;
const EXECUTOR_AGENT_CREATE_ATTEMPTS = 2;

let managedExecutorMutationTail: Promise<void> = Promise.resolve();
let managedExecutorSyncPromise: Promise<void> | null = null;
let managedExecutorSyncQueued = false;

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runManagedExecutorMutation<T>(task: () => Promise<T>) {
  const previous = managedExecutorMutationTail.catch(() => {});
  let releaseCurrent!: () => void;
  managedExecutorMutationTail = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  return previous.then(task).finally(() => {
    releaseCurrent();
  });
}

async function listExecutorAgentIds() {
  const listed = await executorBridge.request<ExecutorAgentsListResult>("agents.list", {});
  return new Set(
    (listed.agents ?? []).map((agent) => readString(agent.id)).filter(isPresent),
  );
}

async function waitForExecutorAgentsVisible(agentIds: string[]) {
  if (agentIds.length === 0) {
    return new Set<string>();
  }

  const remaining = new Set(agentIds);
  const deadline = Date.now() + EXECUTOR_AGENT_VISIBILITY_TIMEOUT_MS;

  while (remaining.size > 0 && Date.now() < deadline) {
    try {
      const existingAgentIds = await listExecutorAgentIds();
      for (const agentId of remaining) {
        if (existingAgentIds.has(agentId)) {
          remaining.delete(agentId);
        }
      }
      if (remaining.size === 0) {
        return existingAgentIds;
      }
    } catch {
      // Keep polling until timeout so transient list failures do not abort reconcile.
    }

    await delay(EXECUTOR_AGENT_VISIBILITY_POLL_MS);
  }

  try {
    return await listExecutorAgentIds();
  } catch {
    return new Set<string>();
  }
}

function buildStandaloneCompanyConfig(company: Company): CyberCompanyConfig {
  return {
    version: 1,
    companies: [company],
    activeCompanyId: company.id,
    preferences: { theme: "classic", locale: "zh-CN" },
  };
}

function listManagedProvisioningAgentIds(company: Company) {
  return listDesiredManagedExecutorAgents(buildStandaloneCompanyConfig(company)).map((target) => target.agentId);
}

function updateCompanyExecutorProvisioning(input: {
  companyId: string;
  state: "ready" | "degraded" | "blocked";
  pendingAgentIds?: string[];
  lastError?: string | null;
  activeCompanyId?: string | null;
  updatedAt?: number;
}) {
  const currentConfig = repository.loadConfig();
  if (!currentConfig) {
    return null;
  }
  let nextCompany: Company | null = null;
  const nextConfig: CyberCompanyConfig = {
    ...currentConfig,
    activeCompanyId: input.activeCompanyId ?? currentConfig.activeCompanyId,
    companies: currentConfig.companies.map((company) => {
      if (company.id !== input.companyId) {
        return company;
      }
      nextCompany = normalizeCompany({
        ...company,
        system: {
          ...(company.system ?? {}),
          executorProvisioning: {
            state: input.state,
            pendingAgentIds: input.pendingAgentIds && input.pendingAgentIds.length > 0 ? input.pendingAgentIds : [],
            lastError: input.lastError ?? null,
            updatedAt: input.updatedAt ?? Date.now(),
          },
        },
      });
      return nextCompany;
    }),
  };
  if (!nextCompany) {
    return null;
  }
  repository.saveConfig(nextConfig);
  return nextCompany;
}

function resolveProvisioningFailureState() {
  return executorBridge.status().state === "ready" ? "degraded" : "blocked";
}

function groupManagedFilesByAgent(files: Array<{ agentId: string; name: string; content: string }>) {
  const grouped = new Map<string, Array<{ agentId: string; name: string; content: string }>>();
  for (const file of files) {
    const current = grouped.get(file.agentId);
    if (current) {
      current.push(file);
      continue;
    }
    grouped.set(file.agentId, [file]);
  }
  return grouped;
}

async function ensureExecutorAgentVisible(
  target: { agentId: string; workspace: string },
  reason: string,
) {
  for (let attempt = 1; attempt <= EXECUTOR_AGENT_CREATE_ATTEMPTS; attempt += 1) {
    try {
      const existingAgentIds = await listExecutorAgentIds();
      if (existingAgentIds.has(target.agentId)) {
        return;
      }
    } catch {
      // Fall through and retry create below.
    }

    try {
      await executorBridge.request("agents.create", {
        name: target.agentId,
        workspace: target.workspace,
      });
    } catch (error) {
      if (!isAgentAlreadyExistsError(error)) {
        throw error;
      }
    }

    const visibleAgentIds = await waitForExecutorAgentsVisible([target.agentId]);
    if (visibleAgentIds.has(target.agentId)) {
      return;
    }
  }

  throw new Error(
    `OpenClaw agent ${target.agentId} 在创建后仍不可见（${reason}）。`,
  );
}

async function syncManagedFilesForAgent(
  agentId: string,
  files: Array<{ agentId: string; name: string; content: string }>,
  reason: string,
) {
  for (const file of files) {
    try {
      await syncAgentFileToExecutor(file);
    } catch (error) {
      throw new Error(
        `无法同步 ${file.name} 到 ${agentId}（${reason}）：${stringifyError(error)}`,
      );
    }
  }
}

async function ensureManagedCompanyExecutorProvisioned(
  company: Company,
  runtime: AuthorityCompanyRuntimeSnapshot,
  reason: string,
) {
  if (executorBridge.status().state !== "ready") {
    throw new Error("Authority 尚未连接到 OpenClaw，无法确认 agent 已创建。");
  }

  const targets = listDesiredManagedExecutorAgents(buildStandaloneCompanyConfig(company));
  const filesByAgent = groupManagedFilesByAgent(
    buildManagedExecutorFilesForCompany(company, {
      activeWorkItems: runtime.activeWorkItems,
      activeSupportRequests: runtime.activeSupportRequests,
      activeEscalations: runtime.activeEscalations,
      activeDecisionTickets: runtime.activeDecisionTickets,
    }),
  );

  for (const target of targets) {
    await ensureExecutorAgentVisible(target, reason);
    await syncManagedFilesForAgent(target.agentId, filesByAgent.get(target.agentId) ?? [], reason);
  }
}

async function ensureManagedCompanyExecutorProvisionedBestEffort(
  company: Company,
  runtime: AuthorityCompanyRuntimeSnapshot,
  reason: string,
) {
  if (executorBridge.status().state !== "ready") {
    throw new Error("Authority 尚未连接到 OpenClaw，无法确认 agent 已创建。");
  }

  const targets = listDesiredManagedExecutorAgents(buildStandaloneCompanyConfig(company));
  const filesByAgent = groupManagedFilesByAgent(
    buildManagedExecutorFilesForCompany(company, {
      activeWorkItems: runtime.activeWorkItems,
      activeSupportRequests: runtime.activeSupportRequests,
      activeEscalations: runtime.activeEscalations,
      activeDecisionTickets: runtime.activeDecisionTickets,
    }),
  );

  let visibleAgentIds = new Set<string>();
  try {
    visibleAgentIds = await listExecutorAgentIds();
  } catch {
    visibleAgentIds = new Set<string>();
  }

  for (const target of targets) {
    if (visibleAgentIds.has(target.agentId)) {
      continue;
    }
    try {
      await executorBridge.request("agents.create", {
        name: target.agentId,
        workspace: target.workspace,
      });
    } catch (error) {
      if (!isAgentAlreadyExistsError(error)) {
        throw error;
      }
    }
  }

  try {
    visibleAgentIds = await listExecutorAgentIds();
  } catch {
    visibleAgentIds = new Set<string>();
  }

  const missingTargets = targets.filter((target) => !visibleAgentIds.has(target.agentId));
  if (missingTargets.length > 0) {
    throw new Error(
      `OpenClaw agent ${missingTargets[0]!.agentId} 在创建后暂未可见（${reason}）。`,
    );
  }

  for (const target of targets) {
    await syncManagedFilesForAgent(target.agentId, filesByAgent.get(target.agentId) ?? [], reason);
  }
}

async function reconcileManagedExecutorState(reason: string) {
  if (executorBridge.status().state !== "ready") {
    return [];
  }

  let existingAgentIds = new Set<string>();
  try {
    existingAgentIds = await listExecutorAgentIds();
  } catch (error) {
    console.warn(`Failed to list OpenClaw agents during Authority reconcile (${reason}).`, error);
  }

  const currentConfig = repository.loadConfig();
  if (!currentConfig) {
    return [];
  }
  const reconcilePlan = planManagedExecutorReconcile({
    trackedAgents: repository.listManagedExecutorAgents(),
    desiredTargets: listDesiredManagedExecutorAgents(currentConfig),
    existingAgentIds,
  });

  for (const agentId of reconcilePlan.deleteAgentIds) {
    try {
      await deleteManagedAgentFromExecutor(agentId);
      repository.clearManagedExecutorAgent(agentId);
      existingAgentIds.delete(agentId);
    } catch (error) {
      if (isAgentNotFoundError(error)) {
        repository.clearManagedExecutorAgent(agentId);
        existingAgentIds.delete(agentId);
        continue;
      }
      console.warn(`Failed to delete managed OpenClaw agent ${agentId} (${reason}).`, error);
    }
  }

  const createdAgentIds: string[] = [];
  for (const target of reconcilePlan.createTargets) {
    try {
      await executorBridge.request("agents.create", {
        name: target.agentId,
        workspace: target.workspace,
      });
      createdAgentIds.push(target.agentId);
    } catch (error) {
      if (isAgentAlreadyExistsError(error)) {
        existingAgentIds.add(target.agentId);
        continue;
      }
      console.warn(`Failed to create managed OpenClaw agent ${target.agentId} (${reason}).`, error);
    }
  }

  if (createdAgentIds.length > 0) {
    existingAgentIds = await waitForExecutorAgentsVisible(createdAgentIds);
    const stillMissing = createdAgentIds.filter((agentId) => !existingAgentIds.has(agentId));
    if (stillMissing.length > 0) {
      console.warn(
        `Managed OpenClaw agent(s) not yet visible after create (${reason}): ${stillMissing.join(", ")}`,
      );
    }
  }

  const runtimeByCompanyId = new Map(
    (currentConfig?.companies ?? []).map((company) => [company.id, repository.loadRuntime(company.id)] as const),
  );
  const managedFiles = buildManagedExecutorFiles(currentConfig, runtimeByCompanyId).filter((file) =>
    existingAgentIds.has(file.agentId),
  );
  const fileResults = await Promise.allSettled(managedFiles.map((file) => syncAgentFileToExecutor(file)));
  const failures = fileResults.filter((result) => result.status === "rejected");
  const fileSyncFailedAgentIds = new Set<string>();
  fileResults.forEach((result, index) => {
    if (result.status === "rejected") {
      const agentId = managedFiles[index]?.agentId;
      if (agentId) {
        fileSyncFailedAgentIds.add(agentId);
      }
    }
  });
  if (failures.length > 0) {
    console.warn(`Failed to mirror ${failures.length} managed company file(s) to OpenClaw executor (${reason}).`);
  }

  const changedCompanyIds: string[] = [];
  for (const company of currentConfig.companies) {
    const nextProvisioning = resolveManagedExecutorProvisioningState({
      company,
      visibleAgentIds: existingAgentIds,
      bridgeState: executorBridge.status().state,
      fileSyncFailedAgentIds,
    });
    const previousProvisioning = company.system?.executorProvisioning;
    const pendingChanged =
      (previousProvisioning?.pendingAgentIds ?? []).join("\n") !== (nextProvisioning.pendingAgentIds ?? []).join("\n");
    if (
      previousProvisioning?.state !== nextProvisioning.state ||
      (previousProvisioning?.lastError ?? null) !== nextProvisioning.lastError ||
      pendingChanged
    ) {
      updateCompanyExecutorProvisioning({
        companyId: company.id,
        state: nextProvisioning.state,
        pendingAgentIds: nextProvisioning.pendingAgentIds,
        lastError: nextProvisioning.lastError,
        updatedAt: nextProvisioning.updatedAt,
      });
      changedCompanyIds.push(company.id);
    }
  }

  return changedCompanyIds;
}

function queueManagedExecutorSync(reason: string) {
  if (managedExecutorSyncPromise) {
    managedExecutorSyncQueued = true;
    return managedExecutorSyncPromise;
  }

  managedExecutorSyncPromise = runManagedExecutorMutation(async () => {
    return await reconcileManagedExecutorState(reason);
  })
    .then((changedCompanyIds) => {
      if (!changedCompanyIds?.length) {
        return;
      }
      broadcast({ type: "bootstrap.updated", timestamp: Date.now() });
      changedCompanyIds.forEach((companyId) => {
        broadcast({ type: "company.updated", companyId, timestamp: Date.now() });
      });
    })
    .catch((error) => {
      console.warn(`Managed OpenClaw reconcile failed (${reason}).`, error);
    })
    .finally(() => {
      managedExecutorSyncPromise = null;
      if (managedExecutorSyncQueued) {
        managedExecutorSyncQueued = false;
        void queueManagedExecutorSync("queued");
      }
    });
  return managedExecutorSyncPromise;
}

async function proxyGatewayRequest<T>(method: string, params?: unknown): Promise<T> {
  if (method === "sessions.list") {
    const result = await executorBridge.request<AuthoritySessionListResponse>(method, params ?? {});
    const requestedAgentId = isRecord(params) ? readString(params.agentId) : null;
    if (requestedAgentId) {
      return result as T;
    }
    const allowedAgentIds = new Set(repository.getCompanyAgentIds());
    if (allowedAgentIds.size === 0) {
      return result as T;
    }
    const sessions = (result.sessions ?? []).filter((session) => {
      const actorId =
        readString(session.actorId)
        ?? (typeof session.key === "string" && session.key.startsWith("agent:")
          ? session.key.split(":")[1] ?? null
          : null);
      return actorId ? allowedAgentIds.has(actorId) : false;
    });
    const sessionsByCompanyId = new Map<
      string,
      Parameters<typeof buildAgentSessionRecordsFromSessions>[0]["sessions"]
    >();
    sessions.forEach((session) => {
      const actorId =
        readString(session.actorId)
        ?? (typeof session.key === "string" && session.key.startsWith("agent:")
          ? session.key.split(":")[1] ?? null
          : null);
      const companyId =
        (typeof session.key === "string"
          ? repository.getConversationContext(session.key)?.companyId
          : null)
        ?? (actorId ? repository.findCompanyIdByAgentId(actorId) : null);
      if (!companyId) {
        return;
      }
      const existing = sessionsByCompanyId.get(companyId) ?? [];
      existing.push(session);
      sessionsByCompanyId.set(companyId, existing);
    });
    sessionsByCompanyId.forEach((companySessions, companyId) => {
      repository.updateRuntimeFromSessionList(companyId, companySessions);
    });
    return {
      ...result,
      count: sessions.length,
      sessions,
    } as T;
  }

  if (method === "session_status") {
    if (sessionStatusCapabilityState === "unsupported") {
      throw new Error("OpenClaw executor does not support session_status.");
    }
    try {
      const result = await executorBridge.request<T>(method, params ?? {});
      updateSessionStatusCapability("success");
      const sessionKey = isRecord(params)
        ? readString(params.sessionKey) ?? readString(params.key)
        : null;
      if (sessionKey) {
        const normalized = normalizeProviderSessionStatus(EXECUTOR_PROVIDER_ID, sessionKey, result);
        const companyId =
          repository.getConversationContext(sessionKey)?.companyId
          ?? (normalized.agentId ? repository.findCompanyIdByAgentId(normalized.agentId) : null);
        if (companyId) {
          repository.applyRuntimeSessionStatus(companyId, normalized);
        }
      }
      return result;
    } catch (error) {
      updateSessionStatusCapability("error", error);
      throw error;
    }
  }

  if (method === "sessions.resolve") {
    const sessionKey = isRecord(params) ? readString(params.key) : null;
    try {
      return await executorBridge.request<T>(method, params ?? {});
    } catch (error) {
      if (
        sessionKey &&
        error instanceof Error &&
        error.message.includes("No session found")
      ) {
        return {
          ok: true,
          key: sessionKey,
          error: error.message,
        } as T;
      }
      throw error;
    }
  }

  if (method === "sessions.reset") {
    const sessionKey = isRecord(params) ? readString(params.key) : null;
    const result = await executorBridge.request<T>(method, params ?? {});
    if (sessionKey) {
      repository.resetSession(sessionKey);
    }
    return result;
  }

  if (method === "sessions.delete") {
    const sessionKey = isRecord(params) ? readString(params.key) : null;
    const result = await executorBridge.request<T>(method, params ?? {});
    if (sessionKey) {
      repository.deleteSession(sessionKey);
    }
    return result;
  }

  if (method === "agents.files.set" && isRecord(params)) {
    const agentId = readString(params.agentId);
    const name = readString(params.name);
    const content = typeof params.content === "string" ? params.content : null;
    if (agentId && name && content !== null) {
      repository.setAgentFile(agentId, name, content);
    }
  }

  return executorBridge.request<T>(method, params ?? {});
}

executorBridge.onStateChange(() => {
  const connectionState = executorBridge.snapshot().connectionState;
  const transitionedToReady = connectionState === "ready" && lastExecutorConnectionState !== "ready";
  lastExecutorConnectionState = connectionState;
  broadcastExecutorStatus();
  if (transitionedToReady) {
    sessionStatusCapabilityState = "unknown";
    sessionStatusUnsupportedLogged = false;
    void queueManagedExecutorSync("executor.ready");
  }
});

executorBridge.onEvent((event) => {
  if (event.event === "agent") {
    const runtimeEvent = normalizeProviderRuntimeEvent(EXECUTOR_PROVIDER_ID, event.payload);
    if (!runtimeEvent) {
      return;
    }
    const companyId =
      (runtimeEvent.sessionKey
        ? repository.getConversationContext(runtimeEvent.sessionKey)?.companyId
        : null)
      ?? (runtimeEvent.agentId ? repository.findCompanyIdByAgentId(runtimeEvent.agentId) : null);
    if (runtimeEvent.runId && runtimeEvent.runState) {
      repository.updateExecutorRun(runtimeEvent.runId, runtimeEvent.runState, {
        errorMessage: runtimeEvent.errorMessage ?? undefined,
      });
    }
    if (companyId) {
      repository.applyRuntimeEvent(companyId, runtimeEvent);
    }
    broadcastAgentRuntimeEvent(companyId, runtimeEvent);
    return;
  }

  if (event.event !== "chat") {
    return;
  }
  const payload = normalizeChatPayload(event.payload);
  if (!payload) {
    return;
  }
  const context = repository.getConversationContext(payload.sessionKey);
  if (payload.state === "final" && payload.message) {
    repository.appendAssistantMessage(payload.sessionKey, payload.message as StoredChatMessage);
    repository.updateExecutorRun(payload.runId, "completed", { response: payload.message });
    const controlUpdate = repository.applyAssistantControlMessage(
      payload.sessionKey,
      payload.message as StoredChatMessage,
    );
    if (controlUpdate.violations.length > 0) {
      console.warn("Assistant control contract violations", controlUpdate.violations);
    }
    if (controlUpdate.changed && controlUpdate.context?.companyId) {
      broadcast({
        type: "company.updated",
        companyId: controlUpdate.context.companyId,
        timestamp: Date.now(),
      });
    }
  } else if (payload.state === "error") {
    repository.updateExecutorRun(payload.runId, "error", {
      errorMessage: payload.errorMessage ?? "OpenClaw run failed",
    });
  } else if (payload.state === "aborted") {
    repository.updateExecutorRun(payload.runId, "aborted");
  } else if (payload.state === "delta") {
    repository.updateExecutorRun(payload.runId, "streaming");
  }
  const runtimeEvent = buildRuntimeEventFromChatPayload({
    payload,
    agentId: context?.actorId ?? (payload.sessionKey.split(":")[1] ?? null),
  });
  if (context?.companyId) {
    repository.applyRuntimeEvent(context.companyId, runtimeEvent);
  }
  broadcastAgentRuntimeEvent(context?.companyId ?? null, runtimeEvent);
  broadcast({
    type: "chat",
    companyId: context?.companyId ?? null,
    timestamp: Date.now(),
    payload,
  });
  if (payload.state !== "delta") {
    broadcast({
      type: "conversation.updated",
      companyId: context?.companyId ?? null,
      timestamp: Date.now(),
    });
  }
});

async function performRuntimeSessionStatusRepair() {
  if (executorBridge.status().state !== "ready") {
    return;
  }
  if (sessionStatusCapabilityState === "unsupported") {
    return;
  }

  const config = repository.loadConfig();
  if (!config?.companies?.length) {
    return;
  }

  const touchedCompanyIds = new Set<string>();

  for (const company of config.companies) {
    const runtime = repository.loadRuntime(company.id);
    const latestSessionByAgentId = new Map<
      string,
      NonNullable<typeof runtime.activeAgentSessions>[number]
    >();
    for (const session of runtime.activeAgentSessions ?? []) {
      if (session.agentId && !latestSessionByAgentId.has(session.agentId)) {
        latestSessionByAgentId.set(session.agentId, session);
      }
    }

    const candidateSessionKeys = new Set<string>();
    const busySessionKeys = new Set(
      (runtime.activeAgentRuntime ?? []).flatMap((entry) => entry.activeSessionKeys),
    );
    for (const session of runtime.activeAgentSessions ?? []) {
      if (
        busySessionKeys.has(session.sessionKey) &&
        ageMs(session.lastStatusSyncAt, Date.now()) >= 10_000
      ) {
        candidateSessionKeys.add(session.sessionKey);
      }
    }

    const openWorkAgentIds = new Set<string>();
    for (const workItem of runtime.activeWorkItems ?? []) {
      if (workItem.status === "completed" || workItem.status === "archived") {
        continue;
      }
      if (workItem.ownerActorId) {
        openWorkAgentIds.add(workItem.ownerActorId);
      }
      if (workItem.batonActorId) {
        openWorkAgentIds.add(workItem.batonActorId);
      }
      workItem.steps
        .filter((step) => step.status === "active")
        .forEach((step) => {
          if (step.assigneeActorId) {
            openWorkAgentIds.add(step.assigneeActorId);
          }
        });
    }
    for (const dispatch of runtime.activeDispatches ?? []) {
      if (dispatch.status === "answered" || dispatch.status === "blocked" || dispatch.status === "superseded") {
        continue;
      }
      dispatch.targetActorIds.forEach((agentId) => openWorkAgentIds.add(agentId));
    }
    for (const request of runtime.activeSupportRequests ?? []) {
      if (
        request.ownerActorId &&
        (request.status === "open" || request.status === "acknowledged" || request.status === "in_progress")
      ) {
        openWorkAgentIds.add(request.ownerActorId);
      }
    }

    for (const agentId of openWorkAgentIds) {
      const session = latestSessionByAgentId.get(agentId);
      if (!session) {
        continue;
      }
      if (busySessionKeys.has(session.sessionKey)) {
        continue;
      }
      if (ageMs(session.lastStatusSyncAt, Date.now()) >= 30_000) {
        candidateSessionKeys.add(session.sessionKey);
      }
    }

    for (const sessionKey of [...candidateSessionKeys].slice(0, 24)) {
      try {
        const result = await executorBridge.request("session_status", { sessionKey });
        updateSessionStatusCapability("success");
        const normalized = normalizeProviderSessionStatus(EXECUTOR_PROVIDER_ID, sessionKey, result);
        repository.applyRuntimeSessionStatus(company.id, normalized);
        touchedCompanyIds.add(company.id);
      } catch (error) {
        updateSessionStatusCapability("error", error);
        if (String(sessionStatusCapabilityState) === "unsupported") {
          break;
        }
        console.warn(`Failed runtime read-repair for ${sessionKey}.`, error);
      }
    }
  }

  touchedCompanyIds.forEach((companyId) => {
    broadcast({
      type: "company.updated",
      companyId,
      timestamp: Date.now(),
    });
  });
}

setInterval(() => {
  void performRuntimeSessionStatusRepair();
}, 10_000);

setInterval(() => {
  const config = repository.loadConfig();
  if (!config?.companies.some((company) => company.system?.executorProvisioning?.state !== "ready")) {
    return;
  }
  void queueManagedExecutorSync("executor.provisioning.watchdog");
}, 15_000);

void executorBridge.reconnect().catch((error) => {
  console.warn("Authority executor bridge failed to connect on startup:", error);
});
companyOpsEngine.start();

const server = createServer(async (request, response) => {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, buildHealthSnapshot());
      return;
    }

    if (request.method === "GET" && url.pathname === "/bootstrap") {
      sendJson(response, 200, buildBootstrapSnapshot());
      return;
    }

    if (request.method === "GET" && url.pathname === "/executor") {
      sendJson(response, 200, getExecutorSnapshot().executorConfig);
      return;
    }

    if (request.method === "PATCH" && url.pathname === "/executor") {
      const body = await readJsonBody<AuthorityExecutorConfigPatch>(request);
      const current = repository.loadExecutorConfig();
      const desired = repository.saveExecutorConfig({
        ...current,
        openclaw: {
          url:
            typeof body.openclaw?.url === "string" && body.openclaw.url.trim().length > 0
              ? body.openclaw.url.trim()
              : current.openclaw.url,
          token:
            body.openclaw?.token !== undefined
              ? body.openclaw.token ?? ""
              : (current.openclaw.token ?? ""),
        },
      });
      try {
        await executorBridge.patchConfig({
          openclaw: {
            url: desired.openclaw.url,
            token: desired.openclaw.token ?? "",
          },
          reconnect: body.reconnect ?? Boolean(body.openclaw),
        });
      } finally {
        broadcastExecutorStatus();
      }
      await queueManagedExecutorSync("executor.patch");
      sendJson(response, 200, getExecutorSnapshot().executorConfig);
      return;
    }

    if (request.method === "POST" && url.pathname === "/gateway/request") {
      const body = await readJsonBody<GatewayProxyRequest>(request);
      if (!body.method || !body.method.trim()) {
        sendError(response, 400, "Gateway proxy method is required.");
        return;
      }
      sendJson(response, 200, await proxyGatewayRequest(body.method.trim(), body.params));
      return;
    }

    if (request.method === "PUT" && url.pathname === "/config") {
      const body = await readJsonBody<{ config: CyberCompanyConfig }>(request);
      repository.saveConfig(body.config);
      companyOpsEngine.schedule("config.save");
      await queueManagedExecutorSync("config.save");
      sendJson(response, 200, buildBootstrapSnapshot());
      broadcast({ type: "bootstrap.updated", timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/companies") {
      const body = await readJsonBody<AuthorityCreateCompanyRequest>(request);
      const { company, runtime: seededRuntime } = buildCompanyDefinition(body);
      const existingConfig = repository.loadConfig();
      const nextConfig: CyberCompanyConfig = existingConfig
        ? {
            ...existingConfig,
            companies: [...existingConfig.companies, company],
            activeCompanyId: company.id,
          }
        : {
            version: 1,
            companies: [company],
            activeCompanyId: company.id,
            preferences: { theme: "classic", locale: "zh-CN" },
          };
      let provisioningFailure: unknown = null;
      let provisionedCompany: Company | null = null;
      await runManagedExecutorMutation(async () => {
        repository.saveConfig(nextConfig);
        repository.saveRuntime(seededRuntime);
        try {
          await ensureManagedCompanyExecutorProvisionedBestEffort(
            company,
            repository.loadRuntime(company.id),
            "company.create",
          );
          provisionedCompany = updateCompanyExecutorProvisioning({
            companyId: company.id,
            state: "ready",
            pendingAgentIds: [],
            lastError: null,
            activeCompanyId: company.id,
          });
        } catch (error) {
          provisioningFailure = error;
          const pendingAgentIds = listManagedProvisioningAgentIds(company);
          provisionedCompany = updateCompanyExecutorProvisioning({
            companyId: company.id,
            state: resolveProvisioningFailureState(),
            pendingAgentIds,
            lastError: stringifyError(error),
            activeCompanyId: company.id,
          });
          console.warn(
            `Managed OpenClaw provisioning for ${company.id} degraded during company create.`,
            error,
          );
        }
      });
      const payload: AuthorityCreateCompanyResponse = {
        company: provisionedCompany ?? repository.loadConfig()?.companies.find((item) => item.id === company.id) ?? company,
        config: repository.loadConfig()!,
        runtime: repository.loadRuntime(company.id),
        warnings:
          provisioningFailure
            ? [
                `执行器仍在补齐：${stringifyError(provisioningFailure)}`,
              ]
            : [],
      };
      companyOpsEngine.schedule("company.create", company.id);
      sendJson(response, 200, payload);
      void queueManagedExecutorSync(provisioningFailure ? "company.create.degraded" : "company.create");
      broadcast({ type: "bootstrap.updated", companyId: company.id, timestamp: Date.now() });
      broadcast({ type: "company.updated", companyId: company.id, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && /\/companies\/[^/]+\/provisioning\/retry$/.test(url.pathname)) {
      const companyId = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      const company = repository.loadConfig()?.companies.find((item) => item.id === companyId) ?? null;
      if (!company) {
        sendError(response, 404, `Unknown company: ${companyId}`);
        return;
      }
      const runtime = repository.loadRuntime(companyId);
      let provisioningFailure: unknown = null;
      let nextCompany: Company | null = null;
      await runManagedExecutorMutation(async () => {
        try {
          await ensureManagedCompanyExecutorProvisioned(company, runtime, "company.provisioning.retry");
          nextCompany = updateCompanyExecutorProvisioning({
            companyId,
            state: "ready",
            pendingAgentIds: [],
            lastError: null,
          });
        } catch (error) {
          provisioningFailure = error;
          nextCompany = updateCompanyExecutorProvisioning({
            companyId,
            state: resolveProvisioningFailureState(),
            pendingAgentIds: listManagedProvisioningAgentIds(company),
            lastError: stringifyError(error),
          });
        }
      });
      const payload: AuthorityRetryCompanyProvisioningResponse = {
        company: nextCompany ?? repository.loadConfig()?.companies.find((item) => item.id === companyId) ?? company,
        config: repository.loadConfig()!,
        runtime: repository.loadRuntime(companyId),
        warnings:
          provisioningFailure
            ? [`执行器仍在补齐：${stringifyError(provisioningFailure)}`]
            : [],
      };
      sendJson(response, 200, payload);
      void queueManagedExecutorSync(
        provisioningFailure ? "company.provisioning.retry.degraded" : "company.provisioning.retry",
      );
      broadcast({ type: "bootstrap.updated", companyId, timestamp: Date.now() });
      broadcast({ type: "company.updated", companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && /\/companies\/[^/]+\/employees$/.test(url.pathname)) {
      const companyId = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      const body = await readJsonBody<AuthorityHireEmployeeRequest>(request);
      const payload = await hireCompanyEmployeeStrongConsistency({
        ...body,
        companyId,
      });
      companyOpsEngine.schedule("company.employee.hire", companyId);
      sendJson(response, 200, payload);
      broadcast({ type: "bootstrap.updated", companyId, timestamp: Date.now() });
      broadcast({ type: "company.updated", companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && /\/companies\/[^/]+\/employees\/batch$/.test(url.pathname)) {
      const companyId = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      const body = await readJsonBody<AuthorityBatchHireEmployeesRequest>(request);
      const payload = await hireCompanyEmployeesStrongConsistency({
        companyId,
        hires: Array.isArray(body.hires) ? body.hires : [],
      });
      companyOpsEngine.schedule("company.employee.batch_hire", companyId);
      sendJson(response, 200, payload);
      broadcast({ type: "bootstrap.updated", companyId, timestamp: Date.now() });
      broadcast({ type: "company.updated", companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/companies/")) {
      const companyId = decodeURIComponent(url.pathname.slice("/companies/".length));
      try {
        const bootstrap = await runManagedExecutorMutation(() =>
          deleteCompanyStrongConsistency({
            companyId,
            currentConfig: repository.loadConfig(),
            executorState: executorBridge.status().state,
            loadRuntime: (targetCompanyId) => repository.loadRuntime(targetCompanyId),
            deleteManagedAgentFromExecutor,
            listExecutorAgentIds,
            ensureManagedCompanyExecutorProvisioned,
            deleteCompanyLocally: (targetCompanyId) => repository.deleteCompany(targetCompanyId),
            clearManagedExecutorAgentsForCompany: (targetCompanyId) =>
              repository.clearManagedExecutorAgentsForCompany(targetCompanyId),
            restoreLocalCompany: (config, runtime) => {
              repository.saveConfig(config);
              repository.saveRuntime(runtime);
            },
            hasCompany: (targetCompanyId) => repository.hasCompany(targetCompanyId),
            cleanupCompanyWorkspace: (targetCompanyId) =>
              removeManagedExecutorCompanyWorkspace({ companyId: targetCompanyId }),
            buildResult: buildBootstrapSnapshot,
            logWarn: (message, error) => {
              console.warn(message, error);
            },
          }),
        );
        sendJson(response, 200, bootstrap);
      } catch (error) {
        if (error instanceof StrongCompanyDeleteError) {
          sendError(response, error.status, error.message);
          return;
        }
        sendError(response, 500, error instanceof Error ? error.message : String(error));
        return;
      }
      companyOpsEngine.schedule("company.delete");
      broadcast({ type: "bootstrap.updated", companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/company/switch") {
      const body = await readJsonBody<AuthoritySwitchCompanyRequest>(request);
      repository.switchCompany(body.companyId);
      companyOpsEngine.schedule("company.switch", body.companyId);
      sendJson(response, 200, buildBootstrapSnapshot());
      broadcast({ type: "bootstrap.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/companies/") && url.pathname.endsWith("/runtime")) {
      const companyId = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      sendJson(response, 200, repository.loadRuntime(companyId));
      return;
    }

    if (request.method === "PUT" && url.pathname.startsWith("/companies/") && url.pathname.endsWith("/runtime")) {
      const companyId = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      const body = await readJsonBody<AuthorityRuntimeSyncRequest>(request);
      const currentRuntime = repository.loadRuntime(companyId);
      const mergedSnapshot = mergeAuthorityControlledRuntimeSlices({
        currentRuntime,
        incomingRuntime: { ...body.snapshot, companyId },
      });
      sendJson(response, 200, repository.saveRuntime(mergedSnapshot));
      companyOpsEngine.schedule("runtime.sync", companyId);
      broadcast({ type: "company.updated", companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/companies/") && url.pathname.endsWith("/events")) {
      const companyId = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      const cursor = url.searchParams.get("cursor");
      const since = url.searchParams.has("since")
        ? Number.parseInt(url.searchParams.get("since") ?? "", 10)
        : undefined;
      sendJson(response, 200, repository.listCompanyEvents(companyId, cursor, since));
      return;
    }

    const collaborationScopeMatch = url.pathname.match(
      /^\/companies\/([^/]+)\/collaboration-scope\/([^/]+)$/,
    );
    if (request.method === "GET" && collaborationScopeMatch) {
      const companyId = decodeURIComponent(collaborationScopeMatch[1] ?? "");
      const agentId = decodeURIComponent(collaborationScopeMatch[2] ?? "");
      sendJson(response, 200, repository.getCollaborationScope(companyId, agentId));
      return;
    }

    if (request.method === "GET" && url.pathname === "/actors") {
      sendJson(response, 200, repository.listActors());
      return;
    }

    if (request.method === "GET" && url.pathname === "/sessions") {
      const agentId = url.searchParams.get("agentId");
      const limit = url.searchParams.has("limit")
        ? Number.parseInt(url.searchParams.get("limit") ?? "", 10)
        : undefined;
      const search = readString(url.searchParams.get("search"));
      sendJson(
        response,
        200,
        await proxyGatewayRequest<AuthoritySessionListResponse>("sessions.list", {
          ...(agentId ? { agentId } : {}),
          ...(typeof limit === "number" && Number.isFinite(limit) ? { limit } : {}),
          ...(search ? { search } : {}),
        }),
      );
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/sessions/") && url.pathname.endsWith("/history")) {
      const sessionKey = decodeURIComponent(url.pathname.replace(/^\/sessions\//, "").replace(/\/history$/, ""));
      const limit = url.searchParams.has("limit")
        ? Number.parseInt(url.searchParams.get("limit") ?? "", 10)
        : undefined;
      sendJson(
        response,
        200,
        await proxyGatewayRequest<AuthoritySessionHistoryResponse>("chat.history", {
          sessionKey,
          ...(typeof limit === "number" && Number.isFinite(limit) ? { limit } : {}),
        }),
      );
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/sessions/") && url.pathname.endsWith("/reset")) {
      const sessionKey = decodeURIComponent(url.pathname.replace(/^\/sessions\//, "").replace(/\/reset$/, ""));
      sendJson(response, 200, await proxyGatewayRequest("sessions.reset", { key: sessionKey }));
      broadcast({ type: "conversation.updated", timestamp: Date.now() });
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/sessions/")) {
      const sessionKey = decodeURIComponent(url.pathname.replace(/^\/sessions\//, ""));
      sendJson(response, 200, await proxyGatewayRequest("sessions.delete", { key: sessionKey }));
      broadcast({ type: "conversation.updated", timestamp: Date.now() });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/agents/") && url.pathname.endsWith("/files")) {
      const agentId = decodeURIComponent(url.pathname.replace(/^\/agents\//, "").replace(/\/files$/, ""));
      sendJson(response, 200, await proxyGatewayRequest("agents.files.list", { agentId }));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/agents/") && url.pathname.includes("/files/")) {
      const [, , agentId, , ...nameParts] = url.pathname.split("/");
      sendJson(
        response,
        200,
        await proxyGatewayRequest("agents.files.get", {
          agentId: decodeURIComponent(agentId),
          name: decodeURIComponent(nameParts.join("/")),
        }),
      );
      return;
    }

    if (request.method === "PUT" && url.pathname.startsWith("/agents/") && url.pathname.includes("/files/")) {
      const [, , agentId, , ...nameParts] = url.pathname.split("/");
      const body = await readJsonBody<{ content: string }>(request);
      sendJson(
        response,
        200,
        await proxyGatewayRequest("agents.files.set", {
          agentId: decodeURIComponent(agentId),
          name: decodeURIComponent(nameParts.join("/")),
          content: body.content,
        }),
      );
      broadcast({ type: "artifact.updated", timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/agents/") && url.pathname.endsWith("/run")) {
      const agentId = decodeURIComponent(url.pathname.replace(/^\/agents\//, "").replace(/\/run$/, ""));
      const body = await readJsonBody<Omit<AuthorityAgentFileRunRequest, "agentId">>(request);
      if (!body.entryPath) {
        throw new Error("agent file run requires entryPath");
      }
      const filesResult = await proxyGatewayRequest<AuthorityAgentFilesResponse>("agents.files.list", { agentId });
      const runResult = await runAgentWorkspaceEntry({
        agentId,
        workspace: filesResult.workspace,
        entryPath: body.entryPath,
        payload: body.payload,
        timeoutMs: body.timeoutMs,
      });
      sendJson(response, 200, runResult satisfies AuthorityAgentFileRunResponse);
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/approval.request") {
      const body = await readJsonBody<AuthorityApprovalRequest>(request);
      const result = repository.requestApproval(body);
      sendJson(response, 200, result);
      broadcast({ type: "bootstrap.updated", companyId: body.companyId, timestamp: Date.now() });
      broadcast({ type: "company.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/approval.resolve") {
      const body = await readJsonBody<AuthorityApprovalResolveRequest>(request);
      const result = repository.resolveApproval(body);
      sendJson(response, 200, result);
      broadcast({ type: "bootstrap.updated", companyId: body.companyId, timestamp: Date.now() });
      broadcast({ type: "company.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/chat.send") {
      const body = await readJsonBody<AuthorityChatSendRequest>(request);
      if (!repository.hasCompany(body.companyId)) {
        throw new Error(`Unknown company: ${body.companyId}`);
      }
      const dispatch = repository.beginChatDispatch(body);
      const gatewayAck = await proxyGatewayRequest<Omit<AuthorityChatSendResponse, "sessionKey">>("chat.send", {
        sessionKey: dispatch.sessionKey,
        message: body.message,
        deliver: false,
        ...(typeof body.timeoutMs === "number" ? { timeoutMs: body.timeoutMs } : {}),
        ...(body.attachments ? { attachments: body.attachments } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
      const result: AuthorityChatSendResponse = {
        ...gatewayAck,
        sessionKey: dispatch.sessionKey,
      };
      repository.createExecutorRun({
        runId: result.runId,
        companyId: body.companyId,
        actorId: body.actorId,
        sessionKey: dispatch.sessionKey,
        startedAt: dispatch.now,
        payload: {
          request: body.message,
          attachments: body.attachments ?? [],
        },
      });
      const runtimeEvent: ProviderRuntimeEvent = {
        providerId: EXECUTOR_PROVIDER_ID,
        agentId: body.actorId,
        sessionKey: dispatch.sessionKey,
        runId: result.runId,
        streamKind: "lifecycle",
        runState: "accepted",
        timestamp: dispatch.now,
        raw: result,
      };
      repository.applyRuntimeEvent(body.companyId, runtimeEvent);
      sendJson(response, 200, result);
      broadcastAgentRuntimeEvent(body.companyId, runtimeEvent);
      broadcast({ type: "conversation.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/requirement.transition") {
      const body = await readJsonBody<AuthorityRequirementTransitionRequest>(request);
      sendJson(response, 200, repository.transitionRequirement(body));
      companyOpsEngine.schedule("requirement.transition", body.companyId);
      broadcast({ type: "requirement.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/requirement.promote") {
      const body = await readJsonBody<AuthorityRequirementPromoteRequest>(request);
      sendJson(response, 200, repository.promoteRequirement(body));
      companyOpsEngine.schedule("requirement.promote", body.companyId);
      broadcast({ type: "requirement.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/room.append") {
      const body = await readJsonBody<AuthorityAppendRoomRequest>(request);
      sendJson(response, 200, repository.upsertRoom(body));
      companyOpsEngine.schedule("room.append", body.companyId);
      broadcast({ type: "room.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/room.delete") {
      const body = await readJsonBody<AuthorityRoomDeleteRequest>(request);
      sendJson(response, 200, repository.deleteRoom(body));
      companyOpsEngine.schedule("room.delete", body.companyId);
      broadcast({ type: "room.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/room-bindings.upsert") {
      const body = await readJsonBody<AuthorityRoomBindingsUpsertRequest>(request);
      sendJson(response, 200, repository.upsertRoomBindings(body));
      companyOpsEngine.schedule("room-bindings.upsert", body.companyId);
      broadcast({ type: "room.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/round.upsert") {
      const body = await readJsonBody<AuthorityRoundUpsertRequest>(request);
      sendJson(response, 200, repository.upsertRound(body));
      companyOpsEngine.schedule("round.upsert", body.companyId);
      broadcast({ type: "round.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/round.delete") {
      const body = await readJsonBody<AuthorityRoundDeleteRequest>(request);
      sendJson(response, 200, repository.deleteRound(body));
      companyOpsEngine.schedule("round.delete", body.companyId);
      broadcast({ type: "round.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/mission.upsert") {
      const body = await readJsonBody<AuthorityMissionUpsertRequest>(request);
      sendJson(response, 200, repository.upsertMission(body));
      companyOpsEngine.schedule("mission.upsert", body.companyId);
      broadcast({ type: "conversation.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/mission.delete") {
      const body = await readJsonBody<AuthorityMissionDeleteRequest>(request);
      sendJson(response, 200, repository.deleteMission(body));
      companyOpsEngine.schedule("mission.delete", body.companyId);
      broadcast({ type: "conversation.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/conversation-state.upsert") {
      const body = await readJsonBody<AuthorityConversationStateUpsertRequest>(request);
      sendJson(response, 200, repository.upsertConversationState(body));
      companyOpsEngine.schedule("conversation-state.upsert", body.companyId);
      broadcast({ type: "conversation.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/conversation-state.delete") {
      const body = await readJsonBody<AuthorityConversationStateDeleteRequest>(request);
      sendJson(response, 200, repository.deleteConversationState(body));
      companyOpsEngine.schedule("conversation-state.delete", body.companyId);
      broadcast({ type: "conversation.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/work-item.upsert") {
      const body = await readJsonBody<AuthorityWorkItemUpsertRequest>(request);
      sendJson(response, 200, repository.upsertWorkItem(body));
      companyOpsEngine.schedule("work-item.upsert", body.companyId);
      broadcast({ type: "conversation.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/work-item.delete") {
      const body = await readJsonBody<AuthorityWorkItemDeleteRequest>(request);
      sendJson(response, 200, repository.deleteWorkItem(body));
      companyOpsEngine.schedule("work-item.delete", body.companyId);
      broadcast({ type: "conversation.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/dispatch.create") {
      const body = await readJsonBody<AuthorityDispatchUpsertRequest>(request);
      sendJson(response, 200, repository.upsertDispatch(body));
      companyOpsEngine.schedule("dispatch.create", body.companyId);
      broadcast({ type: "dispatch.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/dispatch.delete") {
      const body = await readJsonBody<AuthorityDispatchDeleteRequest>(request);
      sendJson(response, 200, repository.deleteDispatch(body));
      companyOpsEngine.schedule("dispatch.delete", body.companyId);
      broadcast({ type: "dispatch.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/artifact.upsert") {
      const body = await readJsonBody<AuthorityArtifactUpsertRequest>(request);
      sendJson(response, 200, repository.upsertArtifact(body));
      companyOpsEngine.schedule("artifact.upsert", body.companyId);
      broadcast({ type: "artifact.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/artifact.sync-mirror") {
      const body = await readJsonBody<AuthorityArtifactMirrorSyncRequest>(request);
      sendJson(response, 200, repository.syncArtifactMirrors(body));
      companyOpsEngine.schedule("artifact.sync-mirror", body.companyId);
      broadcast({ type: "artifact.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/artifact.delete") {
      const body = await readJsonBody<AuthorityArtifactDeleteRequest>(request);
      sendJson(response, 200, repository.deleteArtifact(body));
      companyOpsEngine.schedule("artifact.delete", body.companyId);
      broadcast({ type: "artifact.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/decision.upsert") {
      const body = await readJsonBody<AuthorityDecisionTicketUpsertRequest>(request);
      sendJson(response, 200, repository.upsertDecisionTicket(body));
      companyOpsEngine.schedule("decision.upsert", body.companyId);
      broadcast({ type: "decision.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/decision.resolve") {
      const body = await readJsonBody<AuthorityDecisionTicketResolveRequest>(request);
      sendJson(response, 200, repository.resolveDecisionTicket(body));
      companyOpsEngine.schedule("decision.resolve", body.companyId);
      broadcast({ type: "decision.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/decision.cancel") {
      const body = await readJsonBody<AuthorityDecisionTicketCancelRequest>(request);
      sendJson(response, 200, repository.cancelDecisionTicket(body));
      companyOpsEngine.schedule("decision.cancel", body.companyId);
      broadcast({ type: "decision.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/decision.delete") {
      const body = await readJsonBody<AuthorityDecisionTicketDeleteRequest>(request);
      sendJson(response, 200, repository.deleteDecisionTicket(body));
      companyOpsEngine.schedule("decision.delete", body.companyId);
      broadcast({ type: "decision.updated", companyId: body.companyId, timestamp: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/commands/company-event.append") {
      const body = await readJsonBody<AuthorityAppendCompanyEventRequest>(request);
      const result = repository.appendCompanyEvent(body.event);
      sendJson(response, 200, result);
      broadcast({ type: "company.updated", companyId: body.event.companyId, timestamp: Date.now() });
      if (
        body.event.kind.startsWith("dispatch_") ||
        body.event.kind.startsWith("report_") ||
        body.event.kind.startsWith("subtask_")
      ) {
        broadcast({ type: "dispatch.updated", companyId: body.event.companyId, timestamp: Date.now() });
      }
      return;
    }

    sendError(response, 404, `Unknown route: ${request.method} ${url.pathname}`);
  } catch (error) {
    console.error("Authority request failed", error);
    sendError(response, 500, error instanceof Error ? error.message : String(error));
  }
});

const wsServer = new WebSocketServer({ noServer: true });
wsServer.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => {
    sockets.delete(socket);
  });
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  if (url.pathname !== "/events") {
    socket.destroy();
    return;
  }
  wsServer.handleUpgrade(request, socket, head, (websocket) => {
    wsServer.emit("connection", websocket, request);
  });
});

server.listen(AUTHORITY_PORT, "127.0.0.1", () => {
  console.log(`cyber-company authority listening on http://127.0.0.1:${AUTHORITY_PORT}`);
  console.log(`SQLite authority db: ${DB_PATH}`);
});
