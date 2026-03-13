import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  agentStatusNeedsIntervention,
  buildCanonicalAgentStatusProjection,
  mapAgentRuntimeAvailabilityToLegacyStatus,
  type AgentRunRecord,
  type AgentRuntimeAvailability,
  type CanonicalAgentStatusRecord,
  type CoordinationState,
  type InterventionState,
  type AgentRuntimeRecord,
  type AgentSessionRecord,
} from "../agent-runtime";
import { inferDepartmentKind } from "../org/department-autonomy";
import type { Company, EmployeeRef } from "../../domain/org/types";
import { useCompanyRuntimeStore } from "../../infrastructure/company/runtime/store";
import { selectRuntimeInspectorState } from "../../infrastructure/company/runtime/selectors";

export type RuntimeAttentionLevel = "healthy" | "watch" | "critical";
export type RuntimeSceneZoneId =
  | "command-deck"
  | "tech-lab"
  | "ops-rail"
  | "people-hub"
  | "studio-floor";

type RuntimeInspectorInput = ReturnType<typeof selectRuntimeInspectorState>;
type RuntimeInspectorWorkItem = RuntimeInspectorInput["activeWorkItems"][number];

export type RuntimeInspectorAgentSurface = {
  agentId: string;
  nickname: string;
  role: string;
  avatarJobId?: string;
  employee: EmployeeRef;
  departmentId: string | null;
  departmentName: string;
  departmentKind: "meta" | "support" | "business";
  availability: AgentRuntimeAvailability;
  runtimeState: AgentRuntimeAvailability;
  coordinationState: CoordinationState;
  interventionState: InterventionState;
  legacyStatus: "running" | "idle" | "stopped";
  workload: AgentRuntimeRecord["currentWorkload"];
  attention: RuntimeAttentionLevel;
  attentionReason: string;
  reason: string;
  activeSessionCount: number;
  activeRunCount: number;
  lastSeenAt: number | null;
  lastBusyAt: number | null;
  lastIdleAt: number | null;
  latestSignalAt: number | null;
  currentAssignment: string;
  currentObjective: string;
  activityLabel: string;
  sceneZoneId: RuntimeSceneZoneId;
  sceneZoneLabel: string;
  sceneActivityLabel: string;
  runtimeEvidence: AgentRuntimeRecord["runtimeEvidence"];
  sessions: AgentSessionRecord[];
  runs: AgentRunRecord[];
  primaryWorkItem: RuntimeInspectorWorkItem | null;
  openDispatchCount: number;
  blockedDispatchCount: number;
  openSupportRequestCount: number;
  blockedSupportRequestCount: number;
  openEscalationCount: number;
  blockedWorkItemCount: number;
};

export type RuntimeInspectorSceneZone = {
  id: RuntimeSceneZoneId;
  label: string;
  description: string;
  tone: string;
  agents: RuntimeInspectorAgentSurface[];
  busyCount: number;
  attentionCount: number;
};

export type RuntimeInspectorSurface = {
  company: Company;
  agents: RuntimeInspectorAgentSurface[];
  sceneZones: RuntimeInspectorSceneZone[];
  busyAgents: number;
  degradedAgents: number;
  criticalAgents: number;
  activeRuns: number;
  activeSessions: number;
};

function resolveSceneZone(employee: EmployeeRef, departmentKind: "meta" | "support" | "business"): RuntimeSceneZoneId {
  if (employee.metaRole === "ceo") {
    return "command-deck";
  }
  if (employee.metaRole === "cto" || /cto|技术|研发|工程|开发|架构/i.test(employee.role)) {
    return "tech-lab";
  }
  if (employee.metaRole === "coo" || /运营|交付|流程|项目|排期/i.test(employee.role)) {
    return "ops-rail";
  }
  if (employee.metaRole === "hr" || /hr|招聘|人事|组织|人才/i.test(employee.role)) {
    return "people-hub";
  }
  if (departmentKind === "support") {
    return "ops-rail";
  }
  return "studio-floor";
}

function resolveSceneZoneLabel(zoneId: RuntimeSceneZoneId): string {
  switch (zoneId) {
    case "command-deck":
      return "Command Deck";
    case "tech-lab":
      return "Tech Lab";
    case "ops-rail":
      return "Ops Rail";
    case "people-hub":
      return "People Hub";
    case "studio-floor":
    default:
      return "Studio Floor";
  }
}

function resolveSceneZoneDescription(zoneId: RuntimeSceneZoneId): string {
  switch (zoneId) {
    case "command-deck":
      return "CEO 与管理层做目标收敛、调度和拍板。";
    case "tech-lab":
      return "技术、工具和系统类任务在这里点亮。";
    case "ops-rail":
      return "协作编排、交接、发布和恢复动作在这里运转。";
    case "people-hub":
      return "组织、招聘、编制和岗位配置在这里推进。";
    case "studio-floor":
    default:
      return "业务执行、创作和交付主线在这里持续推进。";
  }
}

function resolveSceneZoneTone(zoneId: RuntimeSceneZoneId): string {
  switch (zoneId) {
    case "command-deck":
      return "from-amber-50 via-white to-orange-50";
    case "tech-lab":
      return "from-cyan-50 via-white to-indigo-50";
    case "ops-rail":
      return "from-emerald-50 via-white to-teal-50";
    case "people-hub":
      return "from-rose-50 via-white to-fuchsia-50";
    case "studio-floor":
    default:
      return "from-sky-50 via-white to-violet-50";
  }
}

function resolveActivityLabel(input: {
  employee: EmployeeRef;
  runtimeState: AgentRuntimeAvailability;
  coordinationState: CoordinationState;
  interventionState: InterventionState;
}): string {
  if (input.interventionState === "takeover_required") {
    return "接管中";
  }
  if (input.coordinationState === "explicit_blocked") {
    return "排障中";
  }
  if (input.runtimeState === "offline") {
    return "离线";
  }
  if (input.runtimeState === "no_signal") {
    return "无信号";
  }
  if (input.runtimeState === "degraded") {
    return "恢复中";
  }
  if (input.coordinationState === "waiting_input") {
    return "待输入";
  }
  if (input.coordinationState === "waiting_peer") {
    return input.interventionState === "overdue" || input.interventionState === "escalated"
      ? "待催办"
      : "待协作";
  }
  if (input.coordinationState === "pending_ack") {
    return "待确认";
  }
  if (input.coordinationState === "completed") {
    return "已收口";
  }
  if (input.runtimeState === "busy") {
    if (input.employee.metaRole === "ceo") {
      return "调度中";
    }
    if (input.employee.metaRole === "cto" || /技术|工程|开发|研发|架构/i.test(input.employee.role)) {
      return "构建中";
    }
    if (input.employee.metaRole === "hr" || /招聘|人事|组织/i.test(input.employee.role)) {
      return "招募中";
    }
    if (input.employee.metaRole === "coo" || /运营|交付|排期|流程/i.test(input.employee.role)) {
      return "编排中";
    }
    if (/写|编辑|设计|内容|市场|产品/i.test(input.employee.role)) {
      return "创作中";
    }
    return "执行中";
  }
  return "待命中";
}

function resolveSceneActivityLabel(input: {
  activityLabel: string;
  runtimeState: AgentRuntimeAvailability;
  currentAssignment: string;
}): string {
  if (input.runtimeState === "busy" && input.currentAssignment.trim().length > 0) {
    return input.currentAssignment;
  }
  return input.activityLabel;
}

function resolveAttentionFromCanonical(status: CanonicalAgentStatusRecord): RuntimeAttentionLevel {
  if (
    status.interventionState === "takeover_required" ||
    status.interventionState === "escalated" ||
    status.coordinationState === "explicit_blocked"
  ) {
    return "critical";
  }
  if (
    status.interventionState === "overdue" ||
    status.coordinationState === "waiting_peer" ||
    status.coordinationState === "waiting_input" ||
    status.coordinationState === "pending_ack"
  ) {
    return "watch";
  }
  return "healthy";
}

function resolveAttentionReasonFromCanonical(status: CanonicalAgentStatusRecord): string {
  if (status.interventionState === "takeover_required") {
    return "当前链路已要求人工接管，需要优先处理。";
  }
  if (status.interventionState === "escalated") {
    return "当前链路已升级处理，需要优先恢复。";
  }
  if (status.interventionState === "overdue") {
    return "当前链路等待时间已超过阈值，需要持续跟进。";
  }
  if (status.coordinationState === "explicit_blocked") {
    return "当前链路存在明确阻塞，需要优先恢复。";
  }
  if (status.coordinationState === "waiting_input") {
    return "当前主线在等待输入或 review。";
  }
  if (status.coordinationState === "waiting_peer" || status.coordinationState === "pending_ack") {
    return "当前链路仍在等待协作方继续推进。";
  }
  return status.reason;
}

export function buildRuntimeInspectorSurface(input: RuntimeInspectorInput): RuntimeInspectorSurface | null {
  if (!input.activeCompany) {
    return null;
  }

  const company = input.activeCompany;
  const canonicalStatuses =
    input.activeAgentStatuses.length > 0
      ? input.activeAgentStatuses
      : buildCanonicalAgentStatusProjection({
          company,
          activeWorkItems: input.activeWorkItems,
          activeDispatches: input.activeDispatches,
          activeSupportRequests: input.activeSupportRequests,
          activeEscalations: input.activeEscalations,
          activeAgentRuntime: input.activeAgentRuntime,
          activeAgentSessions: input.activeAgentSessions,
        });
  const canonicalByAgentId = new Map(canonicalStatuses.map((status) => [status.agentId, status] as const));
  const runtimeByAgentId = new Map(
    input.activeAgentRuntime.map((runtime) => [runtime.agentId, runtime] as const),
  );
  const sessionsByAgentId = new Map<string, AgentSessionRecord[]>();
  const runsByAgentId = new Map<string, AgentRunRecord[]>();

  input.activeAgentSessions.forEach((session) => {
    if (!session.agentId) {
      return;
    }
    const group = sessionsByAgentId.get(session.agentId) ?? [];
    group.push(session);
    sessionsByAgentId.set(session.agentId, group);
  });

  input.activeAgentRuns.forEach((run) => {
    if (!run.agentId) {
      return;
    }
    const group = runsByAgentId.get(run.agentId) ?? [];
    group.push(run);
    runsByAgentId.set(run.agentId, group);
  });

  const agents = company.employees
    .map((employee) => {
      const runtime = runtimeByAgentId.get(employee.agentId) ?? {
        agentId: employee.agentId,
        providerId: "openclaw",
        availability: "no_signal" as const,
        activeSessionKeys: [],
        activeRunIds: [],
        lastSeenAt: null,
        lastBusyAt: null,
        lastIdleAt: null,
        latestTerminalAt: null,
        latestTerminalSummary: null,
        currentWorkload: "free" as const,
        runtimeEvidence: [],
      };
      const canonical = canonicalByAgentId.get(employee.agentId) ?? {
        agentId: employee.agentId,
        runtimeState: runtime.availability,
        coordinationState: "none" as const,
        interventionState: "healthy" as const,
        reason: runtime.availability === "offline" ? "Provider 明确报告当前节点不可达。" : "当前没有观察到可信 runtime 信号。",
        currentAssignment: "当前没有显式挂载的任务",
        currentObjective: "当前没有新的协作目标。",
        latestSignalAt: null,
        activeSessionCount: runtime.activeSessionKeys.length,
        activeRunCount: runtime.activeRunIds.length,
        openDispatchCount: 0,
        blockedDispatchCount: 0,
        openSupportRequestCount: 0,
        blockedSupportRequestCount: 0,
        openRequestCount: 0,
        blockedRequestCount: 0,
        openHandoffCount: 0,
        blockedHandoffCount: 0,
        openEscalationCount: 0,
        blockedWorkItemCount: 0,
        primaryWorkItemId: null,
      };
      const sessions = [...(sessionsByAgentId.get(employee.agentId) ?? [])].sort(
        (left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0),
      );
      const runs = [...(runsByAgentId.get(employee.agentId) ?? [])].sort(
        (left, right) => right.lastEventAt - left.lastEventAt,
      );
      const department = company.departments?.find((entry) => entry.id === employee.departmentId) ?? null;
      const departmentKind = inferDepartmentKind(company, department);
      const primaryWorkItem =
        input.activeWorkItems.find((item) => item.id === canonical.primaryWorkItemId) ?? null;
      const attention = resolveAttentionFromCanonical(canonical);
      const activityLabel = resolveActivityLabel({
        employee,
        runtimeState: canonical.runtimeState,
        coordinationState: canonical.coordinationState,
        interventionState: canonical.interventionState,
      });
      const sceneZoneId = resolveSceneZone(employee, departmentKind);

      return {
        agentId: employee.agentId,
        nickname: employee.nickname,
        role: employee.role,
        avatarJobId: employee.avatarJobId,
        employee,
        departmentId: employee.departmentId ?? null,
        departmentName: department?.name ?? "未分配部门",
        departmentKind,
        availability: canonical.runtimeState,
        runtimeState: canonical.runtimeState,
        coordinationState: canonical.coordinationState,
        interventionState: canonical.interventionState,
        legacyStatus: mapAgentRuntimeAvailabilityToLegacyStatus(canonical.runtimeState),
        workload: runtime.currentWorkload,
        attention,
        attentionReason: resolveAttentionReasonFromCanonical(canonical),
        reason: canonical.reason,
        activeSessionCount: canonical.activeSessionCount,
        activeRunCount: canonical.activeRunCount,
        lastSeenAt: runtime.lastSeenAt,
        lastBusyAt: runtime.lastBusyAt,
        lastIdleAt: runtime.lastIdleAt,
        latestSignalAt: canonical.latestSignalAt,
        currentAssignment: canonical.currentAssignment,
        currentObjective: canonical.currentObjective,
        activityLabel,
        sceneZoneId,
        sceneZoneLabel: resolveSceneZoneLabel(sceneZoneId),
        sceneActivityLabel: resolveSceneActivityLabel({
          activityLabel,
          runtimeState: canonical.runtimeState,
          currentAssignment: canonical.currentAssignment,
        }),
        runtimeEvidence: runtime.runtimeEvidence,
        sessions,
        runs,
        primaryWorkItem,
        openDispatchCount: canonical.openDispatchCount,
        blockedDispatchCount: canonical.blockedDispatchCount,
        openSupportRequestCount: canonical.openSupportRequestCount,
        blockedSupportRequestCount: canonical.blockedSupportRequestCount,
        openEscalationCount: canonical.openEscalationCount,
        blockedWorkItemCount: canonical.blockedWorkItemCount,
      } satisfies RuntimeInspectorAgentSurface;
    })
    .sort((left, right) => {
      const attentionRank = { critical: 0, watch: 1, healthy: 2 } as const;
      if (attentionRank[left.attention] !== attentionRank[right.attention]) {
        return attentionRank[left.attention] - attentionRank[right.attention];
      }
      const availabilityRank = { busy: 0, degraded: 1, idle: 2, no_signal: 3, offline: 4 } as const;
      if (availabilityRank[left.availability] !== availabilityRank[right.availability]) {
        return availabilityRank[left.availability] - availabilityRank[right.availability];
      }
      return (right.latestSignalAt ?? 0) - (left.latestSignalAt ?? 0);
    });

  const zoneOrder: RuntimeSceneZoneId[] = [
    "command-deck",
    "tech-lab",
    "ops-rail",
    "people-hub",
    "studio-floor",
  ];
  const sceneZones = zoneOrder.map((zoneId) => {
    const zoneAgents = agents.filter((agent) => agent.sceneZoneId === zoneId);
    return {
      id: zoneId,
      label: resolveSceneZoneLabel(zoneId),
      description: resolveSceneZoneDescription(zoneId),
      tone: resolveSceneZoneTone(zoneId),
      agents: zoneAgents,
      busyCount: zoneAgents.filter((agent) => agent.availability === "busy").length,
      attentionCount: zoneAgents.filter((agent) => agent.attention !== "healthy").length,
    } satisfies RuntimeInspectorSceneZone;
  });

  return {
    company,
    agents,
    sceneZones,
    busyAgents: agents.filter((agent) => agent.availability === "busy").length,
    degradedAgents: agents.filter((agent) => agent.availability === "degraded").length,
    criticalAgents: agents.filter((agent) => agentStatusNeedsIntervention(canonicalByAgentId.get(agent.agentId) ?? {
      agentId: agent.agentId,
      runtimeState: agent.runtimeState,
      coordinationState: agent.coordinationState,
      interventionState: agent.interventionState,
      reason: agent.reason,
      currentAssignment: agent.currentAssignment,
      currentObjective: agent.currentObjective,
      latestSignalAt: agent.latestSignalAt,
      activeSessionCount: agent.activeSessionCount,
      activeRunCount: agent.activeRunCount,
      openDispatchCount: agent.openDispatchCount,
      blockedDispatchCount: agent.blockedDispatchCount,
      openSupportRequestCount: agent.openSupportRequestCount,
      blockedSupportRequestCount: agent.blockedSupportRequestCount,
      openRequestCount: 0,
      blockedRequestCount: 0,
      openHandoffCount: 0,
      blockedHandoffCount: 0,
      openEscalationCount: agent.openEscalationCount,
      blockedWorkItemCount: agent.blockedWorkItemCount,
      primaryWorkItemId: agent.primaryWorkItem?.id ?? null,
    })).length,
    activeRuns: input.activeAgentRuns.length,
    activeSessions: new Set(
      input.activeAgentRuntime.flatMap((runtime) => runtime.activeSessionKeys),
    ).size,
  };
}

export function useRuntimeInspectorQuery() {
  return useCompanyRuntimeStore(useShallow(selectRuntimeInspectorState));
}

export function useRuntimeInspectorViewModel() {
  const runtimeState = useRuntimeInspectorQuery();
  const surface = useMemo(() => buildRuntimeInspectorSurface(runtimeState), [runtimeState]);
  return {
    ...runtimeState,
    surface,
  };
}
