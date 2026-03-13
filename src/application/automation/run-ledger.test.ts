import { describe, expect, it } from "vitest";
import type { Company } from "../../domain/org/types";
import type { CronJob } from "../gateway";
import { syncAutomationRunLedger } from "./run-ledger";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "测试公司",
    description: "",
    icon: "🏢",
    template: "blank",
    createdAt: 1,
    employees: [],
    quickPrompts: [],
  };
}

function createCronJob(input?: Partial<CronJob>): CronJob {
  return {
    id: "cron-1",
    name: "日报汇总",
    agentId: "agent-1",
    enabled: true,
    schedule: {
      kind: "cron",
      expr: "0 9 * * *",
    },
    payload: {
      kind: "message",
      message: "汇总昨天的运营日报",
    },
    state: {
      lastRunAtMs: 1_000,
      lastStatus: "running",
      nextRunAtMs: 2_000,
    },
    ...input,
  };
}

describe("syncAutomationRunLedger", () => {
  it("creates a durable automation run record from cron state", () => {
    const nextRuns = syncAutomationRunLedger({
      company: createCompany(),
      jobs: [createCronJob()],
      observedAt: 1_500,
    });

    expect(nextRuns).toHaveLength(1);
    expect(nextRuns?.[0]).toMatchObject({
      id: "automation-run:cron-1:1000",
      automationId: "cron-1",
      automationName: "日报汇总",
      agentId: "agent-1",
      status: "running",
      providerStatus: "running",
      message: "汇总昨天的运营日报",
      scheduleKind: "cron",
      scheduleExpr: "0 9 * * *",
      runAt: 1_000,
      nextRunAt: 2_000,
      createdAt: 1_500,
      observedAt: 1_500,
      updatedAt: 1_500,
    });
  });

  it("does not rewrite the company ledger when nothing material changed", () => {
    const company = createCompany();
    const firstRuns = syncAutomationRunLedger({
      company,
      jobs: [createCronJob()],
      observedAt: 1_500,
    });

    const unchanged = syncAutomationRunLedger({
      company: { ...company, automationRuns: firstRuns ?? [] },
      jobs: [createCronJob()],
      observedAt: 2_000,
    });

    expect(unchanged).toBeNull();
  });

  it("updates the same run when provider status changes for the same run timestamp", () => {
    const company = createCompany();
    const firstRuns = syncAutomationRunLedger({
      company,
      jobs: [createCronJob()],
      observedAt: 1_500,
    });

    const updated = syncAutomationRunLedger({
      company: { ...company, automationRuns: firstRuns ?? [] },
      jobs: [
        createCronJob({
          state: {
            lastRunAtMs: 1_000,
            lastStatus: "ok",
            nextRunAtMs: 3_000,
          },
        }),
      ],
      observedAt: 2_500,
    });

    expect(updated).toHaveLength(1);
    expect(updated?.[0]).toMatchObject({
      id: "automation-run:cron-1:1000",
      status: "succeeded",
      providerStatus: "ok",
      nextRunAt: 3_000,
      createdAt: 1_500,
      observedAt: 2_500,
      updatedAt: 2_500,
    });
  });

  it("appends later runs for the same automation and keeps the latest one first", () => {
    const company = createCompany();
    const firstRuns = syncAutomationRunLedger({
      company,
      jobs: [createCronJob({ state: { lastRunAtMs: 1_000, lastStatus: "ok", nextRunAtMs: 2_000 } })],
      observedAt: 1_500,
    });

    const nextRuns = syncAutomationRunLedger({
      company: { ...company, automationRuns: firstRuns ?? [] },
      jobs: [createCronJob({ state: { lastRunAtMs: 4_000, lastStatus: "error", nextRunAtMs: 5_000 } })],
      observedAt: 4_500,
    });

    expect(nextRuns).toHaveLength(2);
    expect(nextRuns?.[0]).toMatchObject({
      id: "automation-run:cron-1:4000",
      status: "failed",
    });
    expect(nextRuns?.[1]).toMatchObject({
      id: "automation-run:cron-1:1000",
      status: "succeeded",
    });
  });
});
