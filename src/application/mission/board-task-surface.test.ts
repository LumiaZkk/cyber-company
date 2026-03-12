import { describe, expect, it } from "vitest";
import { buildBoardTaskSurface } from "./board-task-surface";
import type { Company } from "../../domain/org/types";
import type { TrackedTask } from "../../domain/mission/types";

function createCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-no",
    name: "No",
    description: "Test company",
    icon: "🏢",
    template: "default",
    employees: [
      {
        agentId: "co-ceo",
        nickname: "CEO",
        role: "CEO",
        isMeta: true,
        metaRole: "ceo",
      },
      {
        agentId: "co-cto",
        nickname: "CTO",
        role: "CTO",
        isMeta: true,
        metaRole: "cto",
      },
    ],
    quickPrompts: [],
    tasks: [],
    handoffs: [],
    requests: [],
    createdAt: 1_000,
    ...overrides,
  };
}

function createFileTask(overrides: Partial<TrackedTask> = {}): TrackedTask {
  return {
    id: "task:file:1",
    title: "小说发布任务板",
    sessionKey: "agent:co-cto:main",
    agentId: "co-cto",
    ownerAgentId: "co-cto",
    source: "file",
    state: "running",
    summary: "CTO 先完成技术评估，再进入实现。",
    steps: [
      { text: "完成技术评估", status: "done", assignee: "co-cto" },
      { text: "拆解阶段计划", status: "wip", assignee: "co-cto" },
    ],
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

describe("buildBoardTaskSurface", () => {
  it("falls back to file-backed tasks when there is no active requirement", () => {
    const fileTask = createFileTask();

    const surface = buildBoardTaskSurface({
      activeCompany: createCompany(),
      companySessions: [],
      currentTime: 3_000,
      fileTasks: [fileTask],
      sessionStates: new Map(),
      sessionTakeoverPacks: new Map(),
      requirementScope: null,
      currentWorkItem: null,
      activeWorkItem: null,
      requirementOverview: null,
      strategicRequirementOverview: null,
      isStrategicRequirement: false,
      requirementSyntheticTask: null,
    });

    expect(surface.trackedTasks).toHaveLength(1);
    expect(surface.trackedTasks[0]?.id).toBe(fileTask.id);
    expect(surface.activeTasks).toHaveLength(1);
    expect(surface.totalSteps).toBe(2);
    expect(surface.doneSteps).toBe(1);
    expect(surface.wipSteps).toBe(1);
  });
});
