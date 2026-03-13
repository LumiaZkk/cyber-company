import type { CronJob } from "../gateway";
import type { AutomationRunRecord, AutomationRunStatus, Company } from "../../domain/org/types";

export const AUTOMATION_RUN_LEDGER_LIMIT = 50;

function normalizeProviderStatus(status: string | null | undefined) {
  return typeof status === "string" && status.trim().length > 0 ? status.trim().toLowerCase() : null;
}

export function normalizeAutomationRunStatus(status: string | null | undefined): AutomationRunStatus {
  switch (normalizeProviderStatus(status)) {
    case "running":
    case "in_progress":
      return "running";
    case "ok":
    case "success":
    case "succeeded":
    case "completed":
      return "succeeded";
    case "error":
    case "failed":
    case "failure":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function hasRunTimestamp(job: CronJob): job is CronJob & { state: { lastRunAtMs: number; nextRunAtMs?: number; lastStatus?: string } } {
  return typeof job.state?.lastRunAtMs === "number" && Number.isFinite(job.state.lastRunAtMs);
}

function buildAutomationRunId(jobId: string, runAt: number) {
  return `automation-run:${jobId}:${Math.floor(runAt)}`;
}

function recordsMatch(left: AutomationRunRecord, right: AutomationRunRecord) {
  return (
    left.automationId === right.automationId
    && left.automationName === right.automationName
    && left.agentId === right.agentId
    && left.status === right.status
    && left.providerStatus === right.providerStatus
    && left.message === right.message
    && left.scheduleKind === right.scheduleKind
    && left.scheduleExpr === right.scheduleExpr
    && left.scheduleEveryMs === right.scheduleEveryMs
    && left.runAt === right.runAt
    && left.nextRunAt === right.nextRunAt
  );
}

export function syncAutomationRunLedger(input: {
  company: Company;
  jobs: CronJob[];
  observedAt: number;
  limit?: number;
}): AutomationRunRecord[] | null {
  const existingRuns = input.company.automationRuns ?? [];
  let changed = false;
  const nextRuns = [...existingRuns];
  const indexById = new Map(nextRuns.map((run, index) => [run.id, index]));

  for (const job of input.jobs) {
    if (!hasRunTimestamp(job) || typeof job.id !== "string" || job.id.trim().length === 0) {
      continue;
    }

    const runAt = Math.floor(job.state.lastRunAtMs);
    const id = buildAutomationRunId(job.id, runAt);
    const existingIndex = indexById.get(id);
    const existing = existingIndex == null ? null : nextRuns[existingIndex] ?? null;
    const candidateBase: AutomationRunRecord = {
      id,
      automationId: job.id,
      automationName:
        typeof job.name === "string" && job.name.trim().length > 0 ? job.name.trim() : job.id,
      agentId: typeof job.agentId === "string" && job.agentId.trim().length > 0 ? job.agentId : null,
      status: normalizeAutomationRunStatus(job.state.lastStatus),
      providerStatus: normalizeProviderStatus(job.state.lastStatus),
      message:
        typeof job.payload?.message === "string" && job.payload.message.trim().length > 0
          ? job.payload.message.trim()
          : null,
      scheduleKind:
        typeof job.schedule?.kind === "string" && job.schedule.kind.trim().length > 0
          ? job.schedule.kind.trim()
          : null,
      scheduleExpr:
        typeof job.schedule?.expr === "string" && job.schedule.expr.trim().length > 0
          ? job.schedule.expr.trim()
          : null,
      scheduleEveryMs:
        typeof job.schedule?.everyMs === "number" && Number.isFinite(job.schedule.everyMs)
          ? job.schedule.everyMs
          : null,
      runAt,
      nextRunAt:
        typeof job.state.nextRunAtMs === "number" && Number.isFinite(job.state.nextRunAtMs)
          ? job.state.nextRunAtMs
          : null,
      createdAt: existing?.createdAt ?? input.observedAt,
      observedAt: input.observedAt,
      updatedAt: existing ? input.observedAt : input.observedAt,
    };

    if (existing && recordsMatch(existing, candidateBase)) {
      continue;
    }

    changed = true;
    if (existingIndex == null) {
      nextRuns.push(candidateBase);
      indexById.set(id, nextRuns.length - 1);
      continue;
    }

    if (!existing) {
      nextRuns[existingIndex] = candidateBase;
      continue;
    }

    nextRuns[existingIndex] = {
      ...existing!,
      ...candidateBase,
      createdAt: existing!.createdAt,
      updatedAt: input.observedAt,
    };
  }

  if (!changed) {
    return null;
  }

  return [...nextRuns]
    .sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      return right.runAt - left.runAt;
    })
    .slice(0, Math.max(1, input.limit ?? AUTOMATION_RUN_LEDGER_LIMIT));
}
