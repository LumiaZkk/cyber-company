import { autoCalibrateOrganization } from "../../../src/application/assignment/org-fit";
import { buildRequirementDecisionTicketId } from "../../../src/application/mission/requirement-decision-ticket";
import {
  inferDepartmentKind,
  normalizeWorkItemDepartmentOwnership,
  resolveDepartmentManager,
} from "../../../src/application/org/department-autonomy";
import {
  isSupportRequestActive,
  normalizeSupportRequestRecord,
} from "../../../src/domain/delegation/support-request";
import type {
  DecisionTicketRecord,
  EscalationRecord,
  SupportRequestRecord,
} from "../../../src/domain/delegation/types";
import {
  buildDefaultOrgSettings,
  DEFAULT_AUTONOMY_POLICY,
} from "../../../src/domain/org/autonomy-policy";
import type {
  Company,
  CompanyDepartmentAutonomyCounter,
  CyberCompanyConfig,
  Department,
} from "../../../src/domain/org/types";
import type { AuthorityCompanyRuntimeSnapshot } from "../../../src/infrastructure/authority/contract";

type CompanyOpsRunResult = {
  company: Company;
  runtime: AuthorityCompanyRuntimeSnapshot;
  changed: boolean;
  companyChanged: boolean;
  runtimeChanged: boolean;
  actions: string[];
};

type CompanyOpsEngineRepository = {
  loadConfig: () => CyberCompanyConfig | null;
  saveConfig: (config: CyberCompanyConfig) => void;
  loadRuntime: (companyId: string) => AuthorityCompanyRuntimeSnapshot;
  saveRuntime: (runtime: AuthorityCompanyRuntimeSnapshot) => AuthorityCompanyRuntimeSnapshot;
};

type CompanyOpsEngineOptions = {
  intervalMs?: number;
  onCompanyChanged?: (companyId: string, actions: string[]) => void;
  onRuntimeChanged?: (companyId: string, actions: string[]) => void;
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function dedupeById<T extends { id: string }>(records: T[]): T[] {
  const map = new Map<string, T>();
  for (const record of records) {
    map.set(record.id, record);
  }
  return [...map.values()];
}

function sortByUpdatedAt<T extends { updatedAt: number }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.updatedAt - left.updatedAt);
}

function normalizeRevision(value: number | null | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1;
}

function normalizeCompany(company: Company): Company {
  return {
    ...company,
    orgSettings: buildDefaultOrgSettings(company.orgSettings),
  };
}

function isWorkItemOpen(status: string): boolean {
  return status !== "completed" && status !== "archived";
}

function isWorkItemBlocked(workItem: AuthorityCompanyRuntimeSnapshot["activeWorkItems"][number]): boolean {
  return (
    workItem.status === "blocked"
    || workItem.status === "waiting_owner"
    || workItem.status === "waiting_review"
  );
}

function resolveDepartment(company: Company, departmentId: string | null | undefined): Department | null {
  return (company.departments ?? []).find((department) => department.id === departmentId) ?? null;
}

function resolveMetaDepartment(company: Company, metaRole: "ceo" | "hr" | "cto" | "coo"): Department | null {
  return (
    (company.departments ?? []).find((department) => {
      const manager = company.employees.find((employee) => employee.agentId === department.leadAgentId);
      return !department.archived && manager?.metaRole === metaRole;
    }) ?? null
  );
}

function classifySupportNeed(
  workItem: AuthorityCompanyRuntimeSnapshot["activeWorkItems"][number],
): "hr" | "cto" | "coo" | null {
  const text = [
    workItem.title,
    workItem.goal,
    workItem.summary,
    workItem.nextAction,
    workItem.stageLabel,
  ]
    .join(" ")
    .toLowerCase();
  if (/招聘|补人|headcount|编制|岗位|组团队/u.test(text)) {
    return "hr";
  }
  if (/工具|系统|sdk|自动化|部署|集成|技术支持|脚手架|发布流水线|排障/u.test(text)) {
    return "cto";
  }
  if (/渠道|流程|运营|增长|投放|转化|排期|发布|sop|数据/u.test(text)) {
    return "coo";
  }
  return null;
}

function buildSupportRequestId(workItemId: string, targetDepartmentId: string): string {
  return `support:${workItemId}:${targetDepartmentId}`;
}

function buildSupportRequestSummary(
  requesterDepartmentName: string,
  targetDepartmentName: string,
  workTitle: string,
): string {
  return `${requesterDepartmentName} 需要 ${targetDepartmentName} 支持：${workTitle}`;
}

function createSupportRequest(input: {
  now: number;
  workItemId: string;
  requesterDepartmentId: string;
  requesterDepartmentName: string;
  requestedByActorId: string;
  targetDepartmentId: string;
  targetDepartmentName: string;
  ownerActorId: string;
  summary: string;
  detail?: string;
  supportSlaHours: number;
}): SupportRequestRecord {
  return {
    id: buildSupportRequestId(input.workItemId, input.targetDepartmentId),
    workItemId: input.workItemId,
    requesterDepartmentId: input.requesterDepartmentId,
    targetDepartmentId: input.targetDepartmentId,
    requestedByActorId: input.requestedByActorId,
    ownerActorId: input.ownerActorId,
    summary: input.summary,
    detail: input.detail,
    status: "open",
    slaDueAt: input.now + input.supportSlaHours * 60 * 60 * 1000,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function shallowArrayJsonEqual<T>(left: T[], right: T[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildEscalationId(sourceType: EscalationRecord["sourceType"], sourceId: string): string {
  return `escalation:${sourceType}:${sourceId}`;
}

function openEscalation(input: {
  existing: EscalationRecord | null;
  now: number;
  sourceType: EscalationRecord["sourceType"];
  sourceId: string;
  companyId: string;
  workItemId?: string | null;
  requesterDepartmentId?: string | null;
  targetActorId: string;
  reason: string;
  severity: EscalationRecord["severity"];
}): EscalationRecord {
  const nextRecord: EscalationRecord = {
    id: input.existing?.id ?? buildEscalationId(input.sourceType, input.sourceId),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    companyId: input.companyId,
    workItemId: input.workItemId ?? null,
    requesterDepartmentId: input.requesterDepartmentId ?? null,
    targetActorId: input.targetActorId,
    reason: input.reason,
    severity: input.severity,
    status: input.existing?.status === "resolved" || input.existing?.status === "dismissed"
      ? "open"
      : input.existing?.status ?? "open",
    roomId: input.existing?.roomId ?? null,
    decisionTicketId: input.existing?.decisionTicketId ?? null,
    createdAt: input.existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
  if (
    input.existing
    && input.existing.sourceType === nextRecord.sourceType
    && input.existing.sourceId === nextRecord.sourceId
    && input.existing.companyId === nextRecord.companyId
    && (input.existing.workItemId ?? null) === nextRecord.workItemId
    && (input.existing.requesterDepartmentId ?? null) === nextRecord.requesterDepartmentId
    && input.existing.targetActorId === nextRecord.targetActorId
    && input.existing.reason === nextRecord.reason
    && input.existing.severity === nextRecord.severity
    && input.existing.status === nextRecord.status
    && (input.existing.roomId ?? null) === nextRecord.roomId
    && (input.existing.decisionTicketId ?? null) === nextRecord.decisionTicketId
  ) {
    return input.existing;
  }
  return nextRecord;
}

function resolveEscalation(input: EscalationRecord, now: number): EscalationRecord {
  if (input.status === "resolved" || input.status === "dismissed") {
    return input;
  }
  return {
    ...input,
    status: "resolved",
    updatedAt: now,
  };
}

function upsertOpenDecisionTicket(input: {
  existing: DecisionTicketRecord | null;
  now: number;
  companyId: string;
  sourceType: DecisionTicketRecord["sourceType"];
  sourceId: string;
  escalationId?: string | null;
  aggregateId?: string | null;
  workItemId?: string | null;
  sourceConversationId?: string | null;
  decisionOwnerActorId: string;
  decisionType: DecisionTicketRecord["decisionType"];
  summary: string;
  options: DecisionTicketRecord["options"];
  requiresHuman: boolean;
}): DecisionTicketRecord {
  const nextRecord: DecisionTicketRecord = {
    id: input.existing?.id ?? buildRequirementDecisionTicketId({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      decisionType: input.decisionType,
    }),
    companyId: input.companyId,
    revision: input.existing?.revision ?? 1,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    escalationId: input.escalationId ?? null,
    aggregateId: input.aggregateId ?? null,
    workItemId: input.workItemId ?? null,
    sourceConversationId: input.sourceConversationId ?? null,
    decisionOwnerActorId: input.decisionOwnerActorId,
    decisionType: input.decisionType,
    summary: input.summary,
    options: input.options,
    requiresHuman: input.requiresHuman,
    status: input.requiresHuman ? "pending_human" : "open",
    resolution: input.existing?.resolution ?? null,
    resolutionOptionId: input.existing?.resolutionOptionId ?? null,
    roomId: input.existing?.roomId ?? null,
    createdAt: input.existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
  if (
    input.existing
    && input.existing.companyId === nextRecord.companyId
    && input.existing.sourceType === nextRecord.sourceType
    && input.existing.sourceId === nextRecord.sourceId
    && (input.existing.escalationId ?? null) === (nextRecord.escalationId ?? null)
    && (input.existing.aggregateId ?? null) === (nextRecord.aggregateId ?? null)
    && (input.existing.workItemId ?? null) === (nextRecord.workItemId ?? null)
    && (input.existing.sourceConversationId ?? null) === (nextRecord.sourceConversationId ?? null)
    && input.existing.decisionOwnerActorId === nextRecord.decisionOwnerActorId
    && input.existing.decisionType === nextRecord.decisionType
    && input.existing.summary === nextRecord.summary
    && shallowArrayJsonEqual(input.existing.options, nextRecord.options)
    && input.existing.requiresHuman === nextRecord.requiresHuman
    && input.existing.status === nextRecord.status
    && (input.existing.resolution ?? null) === (nextRecord.resolution ?? null)
    && (input.existing.resolutionOptionId ?? null) === (nextRecord.resolutionOptionId ?? null)
    && (input.existing.roomId ?? null) === (nextRecord.roomId ?? null)
  ) {
    return input.existing;
  }
  return {
    ...nextRecord,
    revision: input.existing ? normalizeRevision(input.existing.revision) + 1 : normalizeRevision(nextRecord.revision),
  };
}

function resolveDecisionTicket(ticket: DecisionTicketRecord, now: number): DecisionTicketRecord {
  if (ticket.status === "resolved" || ticket.status === "cancelled") {
    return ticket;
  }
  return {
    ...ticket,
    revision: normalizeRevision(ticket.revision) + 1,
    status: "cancelled",
    updatedAt: now,
  };
}

function calculateDepartmentLoadScore(input: {
  company: Company;
  runtime: AuthorityCompanyRuntimeSnapshot;
  departmentId: string;
}): number {
  const members = input.company.employees.filter((employee) => employee.departmentId === input.departmentId);
  const openWorkItems = input.runtime.activeWorkItems.filter(
    (workItem) => isWorkItemOpen(workItem.status) && workItem.owningDepartmentId === input.departmentId,
  );
  const blockedWorkItems = openWorkItems.filter(isWorkItemBlocked);
  const activeSupportRequests = input.runtime.activeSupportRequests.filter(
    (request) =>
      isSupportRequestActive(request)
      && (request.requesterDepartmentId === input.departmentId || request.targetDepartmentId === input.departmentId),
  );
  return clamp(
    openWorkItems.length * 18
      + blockedWorkItems.length * 22
      + activeSupportRequests.length * 12
      - Math.max(1, members.length) * 6,
  );
}

function nextCounterState(input: {
  previous: CompanyDepartmentAutonomyCounter | null;
  departmentId: string;
  loadScore: number;
  now: number;
}): CompanyDepartmentAutonomyCounter {
  const overload = input.loadScore >= 65;
  const underload = input.loadScore <= 8;
  const nextOverloadStreak = overload ? Math.min(2, (input.previous?.overloadStreak ?? 0) + 1) : 0;
  const nextUnderloadStreak = underload ? Math.min(2, (input.previous?.underloadStreak ?? 0) + 1) : 0;
  const unchanged =
    input.previous?.overloadStreak === nextOverloadStreak
    && input.previous?.underloadStreak === nextUnderloadStreak
    && input.previous?.lastLoadScore === input.loadScore;
  return {
    departmentId: input.departmentId,
    overloadStreak: nextOverloadStreak,
    underloadStreak: nextUnderloadStreak,
    lastLoadScore: input.loadScore,
    updatedAt: unchanged ? (input.previous?.updatedAt ?? input.now) : input.now,
  };
}

export function runCompanyOpsCycle(input: {
  company: Company;
  runtime: AuthorityCompanyRuntimeSnapshot;
  now?: number;
}): CompanyOpsRunResult {
  const now = input.now ?? Date.now();
  let company = normalizeCompany(input.company);
  let runtime: AuthorityCompanyRuntimeSnapshot = {
    ...input.runtime,
    activeWorkItems: input.runtime.activeWorkItems.map((workItem) =>
      normalizeWorkItemDepartmentOwnership({
        company,
        workItem,
      }),
    ),
    activeSupportRequests: dedupeById(input.runtime.activeSupportRequests.map(normalizeSupportRequestRecord)),
    activeEscalations: dedupeById(input.runtime.activeEscalations),
    activeDecisionTickets: dedupeById(input.runtime.activeDecisionTickets),
  };
  const actions: string[] = [];

  if (company.orgSettings?.autoCalibrate) {
    const calibration = autoCalibrateOrganization(company);
    if (calibration.changed) {
      company = normalizeCompany({
        ...company,
        departments: calibration.departments,
        employees: calibration.employees,
        orgSettings: {
          ...(company.orgSettings ?? {}),
          lastAutoCalibratedAt: now,
          lastAutoCalibrationActions: calibration.appliedRecommendations.map((item) => item.title),
        },
      });
      runtime = {
        ...runtime,
        activeWorkItems: runtime.activeWorkItems.map((workItem) =>
          normalizeWorkItemDepartmentOwnership({
            company,
            workItem,
          }),
        ),
      };
      actions.push("组织自动校准已由后台自治引擎执行");
    }
  }

  const policy = {
    ...DEFAULT_AUTONOMY_POLICY,
    ...(company.orgSettings?.autonomyPolicy ?? {}),
  };
  const ceoAgentId =
    company.employees.find((employee) => employee.metaRole === "ceo")?.agentId
    ?? company.employees[0]?.agentId
    ?? "";
  const hrDepartment = resolveMetaDepartment(company, "hr");
  const ctoDepartment = resolveMetaDepartment(company, "cto");
  const cooDepartment = resolveMetaDepartment(company, "coo");

  const supportRequestMap = new Map(
    runtime.activeSupportRequests.map((request) => [request.id, request] as const),
  );

  for (const workItem of runtime.activeWorkItems) {
    if (!isWorkItemOpen(workItem.status) || !workItem.owningDepartmentId || !workItem.ownerActorId) {
      continue;
    }
    const owningDepartment = resolveDepartment(company, workItem.owningDepartmentId);
    if (!owningDepartment || inferDepartmentKind(company, owningDepartment) !== "business") {
      continue;
    }
    if (owningDepartment.leadAgentId !== workItem.ownerActorId) {
      continue;
    }
    const supportNeed = classifySupportNeed(workItem);
    const targetDepartment =
      supportNeed === "hr"
        ? hrDepartment
        : supportNeed === "cto"
          ? ctoDepartment
          : supportNeed === "coo"
            ? cooDepartment
            : null;
    if (!targetDepartment) {
      continue;
    }
    const targetManager = resolveDepartmentManager(company, targetDepartment.id);
    if (!targetManager) {
      continue;
    }
    const requestId = buildSupportRequestId(workItem.id, targetDepartment.id);
    if (supportRequestMap.has(requestId)) {
      continue;
    }
    supportRequestMap.set(
      requestId,
      createSupportRequest({
        now,
        workItemId: workItem.id,
        requesterDepartmentId: owningDepartment.id,
        requesterDepartmentName: owningDepartment.name,
        requestedByActorId: workItem.ownerActorId,
        targetDepartmentId: targetDepartment.id,
        targetDepartmentName: targetDepartment.name,
        ownerActorId: targetManager.agentId,
        summary: buildSupportRequestSummary(owningDepartment.name, targetDepartment.name, workItem.title),
        detail: workItem.nextAction,
        supportSlaHours: policy.supportSlaHours,
      }),
    );
    actions.push(`自动创建支持请求：${owningDepartment.name} -> ${targetDepartment.name}`);
  }

  const nextSupportRequests = sortByUpdatedAt([...supportRequestMap.values()]);
  runtime = {
    ...runtime,
    activeSupportRequests: nextSupportRequests,
  };

  const escalationMap = new Map(runtime.activeEscalations.map((item) => [item.id, item] as const));
  for (const request of nextSupportRequests) {
    const escalationId = buildEscalationId("support_request", request.id);
    const shouldEscalate = request.status === "blocked" || (request.slaDueAt ?? Number.MAX_SAFE_INTEGER) <= now;
    const existing = escalationMap.get(escalationId) ?? null;
    if (shouldEscalate) {
      escalationMap.set(
        escalationId,
        openEscalation({
          existing,
          now,
          sourceType: "support_request",
          sourceId: request.id,
          companyId: company.id,
          workItemId: request.workItemId,
          requesterDepartmentId: request.requesterDepartmentId,
          targetActorId: ceoAgentId,
          reason:
            request.status === "blocked"
              ? `支持请求已阻塞，需要 CEO 介入协调：${request.summary}`
              : `支持请求超过 SLA，需要 CEO 介入协调：${request.summary}`,
          severity: "critical",
        }),
      );
      actions.push(`支持请求升级到 CEO：${request.summary}`);
      continue;
    }
    if (existing) {
      escalationMap.set(escalationId, resolveEscalation(existing, now));
    }
  }

  for (const workItem of runtime.activeWorkItems) {
    if (!isWorkItemOpen(workItem.status) || !isWorkItemBlocked(workItem)) {
      continue;
    }
    const ageMs = now - workItem.updatedAt;
    const thresholdMs = policy.departmentBlockerEscalationHours * 60 * 60 * 1000;
    const hasActiveSupportRequest = nextSupportRequests.some(
      (request) => request.workItemId === workItem.id && isSupportRequestActive(request),
    );
    const escalationId = buildEscalationId("work_item", workItem.id);
    const existing = escalationMap.get(escalationId) ?? null;
    if (ageMs >= thresholdMs && !hasActiveSupportRequest) {
      escalationMap.set(
        escalationId,
        openEscalation({
          existing,
          now,
          sourceType: "work_item",
          sourceId: workItem.id,
          companyId: company.id,
          workItemId: workItem.id,
          requesterDepartmentId: workItem.owningDepartmentId ?? null,
          targetActorId: ceoAgentId,
          reason: `部门主线长时间阻塞，需要 CEO 拍板：${workItem.title}`,
          severity: "warning",
        }),
      );
      actions.push(`部门阻塞升级到 CEO：${workItem.title}`);
      continue;
    }
    if (existing) {
      escalationMap.set(escalationId, resolveEscalation(existing, now));
    }
  }

  const previousCounters = new Map(
    (company.orgSettings?.autonomyState?.departmentCounters ?? []).map((counter) => [
      counter.departmentId,
      counter,
    ] as const),
  );
  const nextCounters: CompanyDepartmentAutonomyCounter[] = [];
  const decisionTicketMap = new Map(
    runtime.activeDecisionTickets.map((ticket) => [ticket.id, ticket] as const),
  );

  for (const department of company.departments ?? []) {
    if (department.archived || inferDepartmentKind(company, department) !== "business") {
      continue;
    }
    const loadScore = calculateDepartmentLoadScore({
      company,
      runtime,
      departmentId: department.id,
    });
    const counter = nextCounterState({
      previous: previousCounters.get(department.id) ?? null,
      departmentId: department.id,
      loadScore,
      now,
    });
    nextCounters.push(counter);

    const overloadEscalationId = buildEscalationId("org_policy", `hire:${department.id}`);
    const overloadEscalation = escalationMap.get(overloadEscalationId) ?? null;
    const underloadEscalationId = buildEscalationId("org_policy", `underload:${department.id}`);
    const underloadEscalation = escalationMap.get(underloadEscalationId) ?? null;

    if (counter.overloadStreak >= 2) {
      escalationMap.set(
        overloadEscalationId,
        openEscalation({
          existing: overloadEscalation,
          now,
          sourceType: "org_policy",
          sourceId: `hire:${department.id}`,
          companyId: company.id,
          requesterDepartmentId: department.id,
          targetActorId: ceoAgentId,
          reason: `部门持续超负荷，建议扩编或重分配：${department.name}`,
          severity: "warning",
        }),
      );
      actions.push(`组织策略建议扩编：${department.name}`);

      if (hrDepartment && department.leadAgentId && policy.autoApproveSupportRequests) {
        const supportId = buildSupportRequestId(`org-policy:hire:${department.id}`, hrDepartment.id);
        if (!supportRequestMap.has(supportId)) {
          const hrManager = resolveDepartmentManager(company, hrDepartment.id);
          if (hrManager) {
            supportRequestMap.set(
              supportId,
              createSupportRequest({
                now,
                workItemId: `org-policy:hire:${department.id}`,
                requesterDepartmentId: department.id,
                requesterDepartmentName: department.name,
                requestedByActorId: department.leadAgentId,
                targetDepartmentId: hrDepartment.id,
                targetDepartmentName: hrDepartment.name,
                ownerActorId: hrManager.agentId,
                summary: `${department.name} 负载连续偏高，请 HR 评估补充 1 个岗位`,
                detail: `当前自治引擎评估负载分数为 ${loadScore}，连续 ${counter.overloadStreak} 个周期超阈值。`,
                supportSlaHours: policy.supportSlaHours,
              }),
            );
            actions.push(`自动向 HR 发起扩编支持请求：${department.name}`);
          }
        }
      }

      if (policy.maxAutoHeadcountDelta < 1) {
        const escalation = escalationMap.get(overloadEscalationId) ?? null;
        if (escalation) {
          const ticketId = buildRequirementDecisionTicketId({
            sourceType: "escalation",
            sourceId: escalation.id,
            decisionType: "headcount",
          });
          decisionTicketMap.set(
            ticketId,
            upsertOpenDecisionTicket({
              existing: decisionTicketMap.get(ticketId) ?? null,
              now,
              companyId: company.id,
              sourceType: "escalation",
              sourceId: escalation.id,
              escalationId: escalation.id,
              decisionOwnerActorId: ceoAgentId,
              decisionType: "headcount",
              summary: `扩编超出自治额度，需要人类决定：${department.name}`,
              options: [
                { id: "approve-1", label: "批准补 1 人", summary: "允许 HR 启动补员。" },
                { id: "hold", label: "暂缓扩编", summary: "继续观察当前负载。" },
              ],
              requiresHuman: true,
            }),
          );
        }
      }
    } else if (overloadEscalation) {
      escalationMap.set(overloadEscalationId, resolveEscalation(overloadEscalation, now));
      const ticketId = buildRequirementDecisionTicketId({
        sourceType: "escalation",
        sourceId: overloadEscalationId,
        decisionType: "headcount",
      });
      if (decisionTicketMap.has(ticketId)) {
        decisionTicketMap.set(ticketId, resolveDecisionTicket(decisionTicketMap.get(ticketId)!, now));
      }
    }

    if (counter.underloadStreak >= 2) {
      escalationMap.set(
        underloadEscalationId,
        openEscalation({
          existing: underloadEscalation,
          now,
          sourceType: "org_policy",
          sourceId: `underload:${department.id}`,
          companyId: company.id,
          requesterDepartmentId: department.id,
          targetActorId: ceoAgentId,
          reason: `部门长期低负载，建议冻结或收缩：${department.name}`,
          severity: "warning",
        }),
      );
      actions.push(`组织策略建议冻结或收缩：${department.name}`);
      const escalation = escalationMap.get(underloadEscalationId) ?? null;
      if (escalation && policy.humanApprovalRequiredForLayoffs) {
        const ticketId = buildRequirementDecisionTicketId({
          sourceType: "escalation",
          sourceId: escalation.id,
          decisionType: "headcount",
        });
        decisionTicketMap.set(
          ticketId,
          upsertOpenDecisionTicket({
            existing: decisionTicketMap.get(ticketId) ?? null,
            now,
            companyId: company.id,
            sourceType: "escalation",
            sourceId: escalation.id,
            escalationId: escalation.id,
            decisionOwnerActorId: ceoAgentId,
            decisionType: "headcount",
            summary: `部门收缩涉及裁员门槛，需要人类审批：${department.name}`,
            options: [
              { id: "freeze", label: "只冻结招聘", summary: "保留团队，不新增编制。" },
              { id: "reorg", label: "重组团队", summary: "调整汇报线和职责归属。" },
              { id: "layoff", label: "批准收缩", summary: "允许进入裁撤流程。" },
            ],
            requiresHuman: true,
          }),
        );
      }
    } else if (underloadEscalation) {
      escalationMap.set(underloadEscalationId, resolveEscalation(underloadEscalation, now));
      const ticketId = buildRequirementDecisionTicketId({
        sourceType: "escalation",
        sourceId: underloadEscalation.id,
        decisionType: "headcount",
      });
      if (decisionTicketMap.has(ticketId)) {
        decisionTicketMap.set(ticketId, resolveDecisionTicket(decisionTicketMap.get(ticketId)!, now));
      }
    }
  }

  runtime = {
    ...runtime,
    activeSupportRequests: sortByUpdatedAt([...supportRequestMap.values()]),
    activeEscalations: sortByUpdatedAt([...escalationMap.values()]),
    activeDecisionTickets: sortByUpdatedAt([...decisionTicketMap.values()]),
  };

  const nextOpenSupportRequests = runtime.activeSupportRequests.filter(isSupportRequestActive);
  const nextOpenEscalations = runtime.activeEscalations.filter(
    (item) => item.status === "open" || item.status === "acknowledged",
  );
  const nextOpenDecisionTickets = runtime.activeDecisionTickets.filter(
    (item) => item.status === "open" || item.status === "pending_human",
  );
  const nextDepartmentCounters = sortByUpdatedAt(nextCounters);
  const nextEngineActions = actions.slice(-10);
  const previousAutonomyState = company.orgSettings?.autonomyState ?? {};
  const autonomyStateChanged =
    !shallowArrayJsonEqual(previousAutonomyState.departmentCounters ?? [], nextDepartmentCounters)
    || !shallowArrayJsonEqual(previousAutonomyState.lastEngineActions ?? [], nextEngineActions);

  company = normalizeCompany({
    ...company,
    supportRequests: nextOpenSupportRequests,
    escalations: nextOpenEscalations,
    decisionTickets: nextOpenDecisionTickets,
    orgSettings: {
      ...(company.orgSettings ?? {}),
      autonomyState: autonomyStateChanged
        ? {
            ...previousAutonomyState,
            lastEngineRunAt: now,
            lastEngineActions: nextEngineActions,
            departmentCounters: nextDepartmentCounters,
          }
        : previousAutonomyState,
    },
  });

  const companyChanged = JSON.stringify(company) !== JSON.stringify(input.company);
  const runtimeChanged = JSON.stringify(runtime) !== JSON.stringify(input.runtime);

  return {
    company,
    runtime,
    changed: companyChanged || runtimeChanged,
    companyChanged,
    runtimeChanged,
    actions,
  };
}

export class CompanyOpsEngine {
  private readonly intervalMs: number;
  private readonly pendingCompanyIds = new Set<string>();
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduled = false;

  constructor(
    private readonly repository: CompanyOpsEngineRepository,
    private readonly options: CompanyOpsEngineOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 60_000;
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.schedule("interval");
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  schedule(_reason: string, companyId?: string | null) {
    if (companyId) {
      this.pendingCompanyIds.add(companyId);
    }
    if (this.scheduled) {
      return;
    }
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      void this.run();
    });
  }

  private async run() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const config = this.repository.loadConfig();
      if (!config) {
        return;
      }
      const targetIds =
        this.pendingCompanyIds.size > 0
          ? [...this.pendingCompanyIds]
          : config.companies.map((company) => company.id);
      this.pendingCompanyIds.clear();

      let nextConfig = config;
      for (const companyId of targetIds) {
        const company = nextConfig.companies.find((item) => item.id === companyId);
        if (!company) {
          continue;
        }
        const runtime = this.repository.loadRuntime(companyId);
        const result = runCompanyOpsCycle({
          company,
          runtime,
        });
        if (!result.changed) {
          continue;
        }
        if (result.runtimeChanged) {
          this.repository.saveRuntime(result.runtime);
          this.options.onRuntimeChanged?.(companyId, result.actions);
        }
        if (result.companyChanged) {
          nextConfig = {
            ...nextConfig,
            companies: nextConfig.companies.map((item) =>
              item.id === companyId ? result.company : item,
            ),
          };
          this.options.onCompanyChanged?.(companyId, result.actions);
        }
      }
      if (nextConfig !== config) {
        this.repository.saveConfig(nextConfig);
      }
    } finally {
      this.running = false;
    }
  }
}
