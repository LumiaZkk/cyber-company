import { gateway, type CronJob } from "../gateway";
import { requestAuthorityApproval } from "../gateway/authority-control";
import type { ApprovalRecord } from "../../domain/governance/types";
import type { Company } from "../../domain/org/types";
import { readCompanyRuntimeState } from "../../infrastructure/company/runtime/selectors";
import {
  AUTOMATION_BUDGET_WINDOW_DAYS,
  evaluateAutomationBudgetGuardrail,
  type AutomationBudgetGuardrail,
} from "./budget-guardrail";

export type AutomationScheduleInput =
  | {
      kind: "cron";
      expr: string;
    }
  | {
      kind: "every";
      everyMs: number;
    };

export type AutomationApprovalInput = {
  name: string;
  agentId: string;
  schedule: AutomationScheduleInput;
  message: string;
  existingJobId?: string | null;
};

export type AutomationApprovalResult =
  | {
      mode: "executed";
      approval: null;
      guardrail: AutomationBudgetGuardrail;
    }
  | {
      mode: "approval_requested";
      approval: ApprovalRecord;
      guardrail: AutomationBudgetGuardrail;
    };

function buildAutomationSummary(
  input: AutomationApprovalInput,
  guardrail: AutomationBudgetGuardrail,
) {
  const budgetSuffix = guardrail.status === "over_budget" ? "（超预算）" : "";
  if (input.existingJobId) {
    return `审批启用自动化 ${input.name}${budgetSuffix}`;
  }
  return `审批创建自动化 ${input.name}${budgetSuffix}`;
}

function buildAutomationDetail(
  input: AutomationApprovalInput,
  guardrail: AutomationBudgetGuardrail,
) {
  const guardrailDetail = guardrail.status === "inactive" ? "" : ` ${guardrail.detail}`;
  const scheduleLabel =
    input.schedule.kind === "cron"
      ? `Cron: ${input.schedule.expr}`
      : `间隔: ${input.schedule.everyMs}ms`;
  if (input.existingJobId) {
    return `准备重新启用自动化「${input.name}」。${scheduleLabel}。审批通过后才会恢复执行。${guardrailDetail}`;
  }
  return `准备创建并启用自动化「${input.name}」。${scheduleLabel}。审批通过后才会开始执行。${guardrailDetail}`;
}

function buildCronJobPayload(input: AutomationApprovalInput) {
  return {
    name: input.name,
    agentId: input.agentId,
    enabled: true,
    sessionTarget: "main",
    wakeMode: "now",
    schedule:
      input.schedule.kind === "cron"
        ? { kind: "cron", expr: input.schedule.expr }
        : { kind: "every", everyMs: input.schedule.everyMs },
    payload: {
      kind: "agentTurn",
      message: input.message,
    },
  };
}

function parseAutomationPayload(
  payload: ApprovalRecord["payload"],
): (AutomationApprovalInput & { mode: "create" | "enable" }) | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const mode = payload.mode === "enable" ? "enable" : payload.mode === "create" ? "create" : null;
  const job = payload.job;
  if (!mode || !job || typeof job !== "object") {
    return null;
  }
  const jobRecord = job as Record<string, unknown>;
  const name = typeof jobRecord.name === "string" ? jobRecord.name.trim() : "";
  const agentId = typeof jobRecord.agentId === "string" ? jobRecord.agentId.trim() : "";
  const payloadRecord =
    jobRecord.payload && typeof jobRecord.payload === "object"
      ? (jobRecord.payload as Record<string, unknown>)
      : null;
  const message = typeof payloadRecord?.message === "string" ? payloadRecord.message.trim() : "";
  const scheduleRecord =
    jobRecord.schedule && typeof jobRecord.schedule === "object"
      ? (jobRecord.schedule as Record<string, unknown>)
      : null;

  if (!name || !agentId || !message || !scheduleRecord) {
    return null;
  }

  const schedule =
    scheduleRecord.kind === "cron" && typeof scheduleRecord.expr === "string"
      ? ({ kind: "cron", expr: scheduleRecord.expr.trim() } as const)
      : scheduleRecord.kind === "every" && typeof scheduleRecord.everyMs === "number"
        ? ({ kind: "every", everyMs: scheduleRecord.everyMs } as const)
        : null;

  if (!schedule) {
    return null;
  }

  return {
    mode,
    name,
    agentId,
    message,
    schedule,
    existingJobId: typeof payload.jobId === "string" ? payload.jobId : null,
  };
}

export async function requestAutomationEnableApproval(input: {
  company: Company;
  automation: AutomationApprovalInput;
  skipApproval?: boolean;
  usageCost?: number | null;
}): Promise<AutomationApprovalResult> {
  const usageCost =
    input.usageCost ??
    (await gateway
      .getUsageCost({ days: AUTOMATION_BUDGET_WINDOW_DAYS })
      .then((summary) => summary?.totals?.totalCost ?? null)
      .catch(() => null));
  const guardrail = evaluateAutomationBudgetGuardrail({
    company: input.company,
    usageCost,
  });
  const needsApproval =
    !input.skipApproval &&
    (input.company.orgSettings?.autonomyPolicy?.humanApprovalRequiredForAutomationEnable !== false ||
      guardrail.shouldEscalateToApproval);

  if (needsApproval) {
    const result = await requestAuthorityApproval({
      companyId: input.company.id,
      scope: "automation",
      actionType: "automation_enable",
      summary: buildAutomationSummary(input.automation, guardrail),
      detail: buildAutomationDetail(input.automation, guardrail),
      requestedByActorId: "operator:local-user",
      requestedByLabel: "当前操作者",
      targetActorId: input.automation.agentId,
      targetLabel: input.automation.name,
      payload: {
        mode: input.automation.existingJobId ? "enable" : "create",
        jobId: input.automation.existingJobId ?? null,
        job: buildCronJobPayload(input.automation),
        guardrail: {
          status: guardrail.status,
          budgetUsd: guardrail.budgetUsd,
          currentUsageCost: guardrail.currentUsageCost,
          windowDays: guardrail.windowDays,
        },
      },
    });
    await readCompanyRuntimeState().loadConfig();
    return {
      mode: "approval_requested",
      approval: result.approval,
      guardrail,
    };
  }

  await applyApprovedAutomationEnableFromInput(input.automation);
  return {
    mode: "executed",
    approval: null,
    guardrail,
  };
}

export async function applyApprovedAutomationEnableFromInput(input: AutomationApprovalInput) {
  if (input.existingJobId) {
    await gateway.updateCron(input.existingJobId, { enabled: true });
    return;
  }
  await gateway.addCron(buildCronJobPayload(input));
}

export async function applyApprovedAutomationEnable(approval: ApprovalRecord) {
  const parsed = parseAutomationPayload(approval.payload);
  if (!parsed) {
    throw new Error("当前审批缺少可应用的自动化配置。");
  }
  await applyApprovedAutomationEnableFromInput({
    name: parsed.name,
    agentId: parsed.agentId,
    message: parsed.message,
    schedule: parsed.schedule,
    existingJobId: parsed.mode === "enable" ? parsed.existingJobId ?? null : null,
  });
}

export function buildAutomationApprovalInputFromJob(job: CronJob): AutomationApprovalInput {
  const schedule =
    job.schedule?.kind === "cron" && typeof job.schedule.expr === "string"
      ? ({ kind: "cron", expr: job.schedule.expr } as const)
      : ({
          kind: "every",
          everyMs:
            typeof job.schedule?.everyMs === "number" && Number.isFinite(job.schedule.everyMs)
              ? job.schedule.everyMs
              : 3_600_000,
        } as const);

  return {
    name: job.name,
    agentId: job.agentId ?? "",
    message: job.payload?.message ?? "",
    schedule,
    existingJobId: job.id,
  };
}
