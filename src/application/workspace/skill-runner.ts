import type { ArtifactRecord, ArtifactResourceType } from "../../domain/artifact/types";
import type {
  CapabilityIssueRecord,
  Company,
  CompanyWorkspaceApp,
  SkillDefinition,
  SkillRunRecord,
  SkillRunExecutionMode,
  SkillRunTrigger,
} from "../../domain/org/types";
import type { WorkspaceAppManifest } from "./app-manifest";
import {
  executeWorkspaceSkill,
  hasRegisteredSkillExecutionAdapter,
  type ExecuteWorkspaceSkillResult,
  type WorkspaceSkillFile,
} from "./skill-executor";
import {
  buildWorkspaceSkillExecutionInput,
  listWorkspaceSkillExecutionInputTypes,
  summarizeWorkspaceSkillExecutionInput,
  type WorkspaceSkillExecutionInput,
} from "./workspace-skill-contract";

export type WorkspaceScriptExecutionAttempt =
  | {
      status: "executed";
      result: ExecuteWorkspaceSkillResult;
      note?: string | null;
    }
  | {
      status: "fallback";
      note?: string | null;
    };

const SKILL_STATUS_LABEL: Record<SkillDefinition["status"], string> = {
  draft: "草稿",
  ready: "可用",
  degraded: "降级",
  retired: "停用",
};

export type WorkspaceSkillIssueDraft = Pick<
  CapabilityIssueRecord,
  "type" | "summary" | "detail" | "appId" | "skillId" | "contextActionId" | "contextRunId"
>;

type RunWorkspaceSkillInput = {
  company: Company;
  skillId: string;
  skill: SkillDefinition | null;
  app: CompanyWorkspaceApp | null;
  manifest: WorkspaceAppManifest | null;
  files: WorkspaceSkillFile[];
  workItemId?: string | null;
  requestedByActorId?: string | null;
  requestedByLabel?: string | null;
  ownerLabel?: string | null;
  triggerType?: SkillRunTrigger;
  triggerActionId?: string | null;
  triggerLabel?: string | null;
  now: number;
};

type RunWorkspaceSkillCallbacks = {
  upsertArtifactRecord: (artifact: ArtifactRecord) => void | Promise<void>;
  upsertSkillRun: (run: SkillRunRecord) => Promise<void>;
  writeWorkspaceApps?: (apps: CompanyWorkspaceApp[]) => Promise<void>;
  reportIssue?: (issue: WorkspaceSkillIssueDraft) => void | Promise<void>;
  executeWorkspaceScript?: (
    input: {
      company: Company;
      skill: SkillDefinition;
      app: CompanyWorkspaceApp | null;
      manifest: WorkspaceAppManifest | null;
      files: WorkspaceSkillFile[];
      executionInput: WorkspaceSkillExecutionInput;
      workItemId?: string | null;
      now: number;
    },
  ) => Promise<WorkspaceScriptExecutionAttempt | null>;
};

export type RunWorkspaceSkillResult =
  | {
      status: "blocked";
      title: string;
      detail: string;
      runId: string;
      issueDraft: WorkspaceSkillIssueDraft;
    }
  | {
      status: "failed";
      title: string;
      detail: string;
      runId: string;
      issueDraft: WorkspaceSkillIssueDraft;
    }
  | {
      status: "succeeded";
      title: string;
      detail: string;
      runId: string;
      receiptArtifactId: string;
      outputArtifactIds: string[];
      outputResourceTypes: ArtifactResourceType[];
      executionMode: SkillRunExecutionMode;
      executionEntryPath?: string | null;
      executionNote?: string | null;
    };

function buildReceiptArtifact(input: {
  company: Company;
  skill: SkillDefinition;
  app: CompanyWorkspaceApp | null;
  ownerLabel?: string | null;
  outputArtifacts: ArtifactRecord[];
  workItemId?: string | null;
  now: number;
}) {
  return {
    id: `skill-receipt:${input.company.id}:${input.skill.id}:${input.now}`,
    workItemId: input.workItemId ?? null,
    title: `${input.skill.title} 执行回执`,
    kind: "skill_receipt",
    status: "ready",
    ownerActorId: input.skill.ownerAgentId,
    sourceActorId: input.skill.ownerAgentId,
    sourceName: `${input.skill.id}.receipt.md`,
    sourcePath: `skill-runs/${input.skill.id}/${input.now}.md`,
    summary: `${input.skill.title} 已从 ${input.app?.title ?? "工作目录"} 触发，并写回 ${input.outputArtifacts.length} 份结果资源。`,
    content: [
      `# ${input.skill.title} 执行回执`,
      "",
      `- 公司：${input.company.name}`,
      `- 触发入口：${input.app?.title ?? "工作目录"}`,
      `- 能力 ID：${input.skill.id}`,
      `- 结果资源：${input.outputArtifacts.length} 份`,
      `- 负责人：${input.ownerLabel ?? input.skill.ownerAgentId}`,
      "",
      "## 结果资源",
      ...input.outputArtifacts.map((artifact) => `- ${artifact.title} (${artifact.kind})`),
    ].join("\n"),
    resourceType: "state",
    resourceTags: [
      "tech.skill-run",
      `skill.${input.skill.id}`,
      ...(input.app ? [`app.${input.app.id}`] : []),
    ],
    createdAt: input.now,
    updatedAt: input.now,
  } satisfies ArtifactRecord;
}

function buildUnavailableIssueDraft(input: {
  skillId: string;
  skill: SkillDefinition | null;
  app: CompanyWorkspaceApp | null;
}) {
  return {
    type: "unavailable",
    appId: input.app?.id ?? null,
    skillId: input.skillId,
    summary: input.skill
      ? `${input.skill.title} 当前状态为 ${SKILL_STATUS_LABEL[input.skill.status]}`
      : `缺少可触发的能力：${input.skillId}`,
    detail: input.skill
      ? `${input.skill.title} 还没有进入可用状态，当前先登记为能力问题，等待 CTO 跟进。`
      : `当前 AppManifest 声明了 ${input.skillId}，但公司里还没有对应能力定义。`,
  } satisfies WorkspaceSkillIssueDraft;
}

function buildRuntimeErrorIssueDraft(input: {
  skill: SkillDefinition;
  app: CompanyWorkspaceApp | null;
  message: string;
}) {
  return {
    type: "runtime_error",
    appId: input.app?.id ?? null,
    skillId: input.skill.id,
    summary: `${input.skill.title} 执行失败`,
    detail: input.message,
  } satisfies WorkspaceSkillIssueDraft;
}

function canExecuteSkill(
  skill: SkillDefinition | null,
  triggerType: SkillRunTrigger,
): boolean {
  if (!skill) {
    return false;
  }
  if (triggerType === "manual") {
    return skill.status !== "retired";
  }
  return skill.status === "ready";
}

function isFormalWorkspaceSkillFile(file: Pick<WorkspaceSkillFile, "resourceOrigin">) {
  return file.resourceOrigin === "declared" || file.resourceOrigin === "manifest";
}

async function resolveWorkspaceSkillExecution(input: RunWorkspaceSkillInput, callbacks: RunWorkspaceSkillCallbacks): Promise<{
  execution: ExecuteWorkspaceSkillResult;
  executionMode: SkillRunExecutionMode;
  executionNote?: string | null;
}> {
  const adapterAvailable = input.skill ? hasRegisteredSkillExecutionAdapter(input.skill) : false;
  if (callbacks.executeWorkspaceScript && input.skill) {
    const executionInput = buildWorkspaceSkillExecutionInput({
      company: input.company,
      skill: input.skill,
      app: input.app,
      manifest: input.manifest,
      files: input.files,
      workItemId: input.workItemId,
      requestedByActorId: input.requestedByActorId,
      requestedByLabel: input.requestedByLabel,
      triggerType: input.triggerType ?? "app_action",
      triggerActionId: input.triggerActionId ?? input.skill.id,
      triggerLabel: input.triggerLabel ?? input.app?.title ?? "工作目录",
      now: input.now,
    });
    const scriptExecution = await callbacks.executeWorkspaceScript({
      company: input.company,
      skill: input.skill,
      app: input.app,
      manifest: input.manifest,
      files: input.files,
      executionInput,
      workItemId: input.workItemId,
      now: input.now,
    });
    if (scriptExecution?.status === "executed") {
      return {
        execution: scriptExecution.result,
        executionMode: "workspace_script",
        executionNote: scriptExecution.note ?? null,
      };
    }
    if (scriptExecution?.status === "fallback") {
      if (!adapterAvailable) {
        throw new Error(
          scriptExecution.note?.trim()
            || `${input.skill.title} 当前既没有真实工作区脚本，也没有已注册的平台适配器。`,
        );
      }
      return {
        execution: executeWorkspaceSkill({
          company: input.company,
          skill: input.skill,
          app: input.app,
          manifest: input.manifest,
          files: input.files,
          workItemId: input.workItemId,
          now: input.now,
        }),
        executionMode: "builtin_bridge",
        executionNote: scriptExecution.note ?? null,
      };
    }
  }
  if (!adapterAvailable) {
    throw new Error(
      `${input.skill?.title ?? input.skillId} 当前还没有可执行实现：既没有真实工作区脚本，也没有已注册的平台适配器。`,
    );
  }
  return {
    execution: executeWorkspaceSkill({
      company: input.company,
      skill: input.skill!,
      app: input.app,
      manifest: input.manifest,
      files: input.files,
      workItemId: input.workItemId,
      now: input.now,
    }),
    executionMode: "builtin_bridge",
    executionNote: null,
  };
}

export async function runWorkspaceSkill(
  input: RunWorkspaceSkillInput,
  callbacks: RunWorkspaceSkillCallbacks,
): Promise<RunWorkspaceSkillResult> {
  const triggerLabel = input.triggerLabel ?? input.app?.title ?? "工作目录";
  const triggerType = input.triggerType ?? "app_action";
  const shouldAutoReportIssue = triggerType !== "manual";
  const runId = `skill-run:${input.company.id}:${input.skillId}:${input.now}`;
  const executableFiles = input.files.filter(isFormalWorkspaceSkillFile);
  const ignoredInferredResourceCount = Math.max(0, input.files.length - executableFiles.length);
  const executionInput =
    input.skill
      ? buildWorkspaceSkillExecutionInput({
          company: input.company,
          skill: input.skill,
          app: input.app,
          manifest: input.manifest,
          files: executableFiles,
          workItemId: input.workItemId,
          requestedByActorId: input.requestedByActorId,
          requestedByLabel: input.requestedByLabel,
          triggerType,
          triggerActionId: input.triggerActionId ?? input.skill.id,
          triggerLabel,
          now: input.now,
        })
      : null;
  const baseInputSummary = executionInput
    ? summarizeWorkspaceSkillExecutionInput(executionInput)
    : `${input.company.name} · ${triggerLabel} · 输入 ${executableFiles.length} 份资源`;
  const inputSummary =
    ignoredInferredResourceCount > 0
      ? `${baseInputSummary}（已忽略 ${ignoredInferredResourceCount} 份推断资源，正式执行只消费显式资源）`
      : baseInputSummary;
  const inputResourceTypes = executionInput
    ? listWorkspaceSkillExecutionInputTypes(executionInput)
    : [...new Set(executableFiles.map((file) => file.resourceType))];

  if (!canExecuteSkill(input.skill, triggerType)) {
    const errorMessage = input.skill
      ? triggerType === "manual"
        ? `${input.skill.title} 当前状态为 ${SKILL_STATUS_LABEL[input.skill.status]}，不能继续跑能力验证。`
        : `${input.skill.title} 当前状态为 ${SKILL_STATUS_LABEL[input.skill.status]}，尚未进入可用状态。`
      : `当前 AppManifest 声明了 ${input.skillId}，但公司里还没有对应能力定义。`;
    const issueDraft = buildUnavailableIssueDraft({
      skillId: input.skillId,
      skill: input.skill,
      app: input.app,
    });
    await callbacks.upsertSkillRun({
      id: runId,
      skillId: input.skillId,
      appId: input.app?.id ?? null,
      triggerType,
      triggerActionId: input.triggerActionId ?? input.skillId,
      triggerLabel,
      requestedByActorId: input.requestedByActorId,
      requestedByLabel: input.requestedByLabel,
      status: "failed",
      executionEntryPath: input.skill?.entryPath ?? null,
      executionNote: null,
      inputSchemaVersion: executionInput?.version,
      inputSummary,
      inputResourceCount: executableFiles.length,
      inputResourceTypes,
      errorMessage,
      startedAt: input.now,
      completedAt: input.now,
      updatedAt: input.now,
    });
    if (shouldAutoReportIssue) {
      await Promise.resolve(
        callbacks.reportIssue?.({
          ...issueDraft,
          contextActionId: input.triggerActionId ?? input.skillId,
          contextRunId: runId,
        }),
      );
    }
    return {
      status: "blocked",
      title: triggerType === "manual" ? "能力验证当前不能执行" : "能力当前还不能运行",
      detail: shouldAutoReportIssue ? "问题已经自动登记到 CTO 技术中台。" : errorMessage,
      runId,
      issueDraft,
    };
  }

  const skill = input.skill!;

  await callbacks.upsertSkillRun({
    id: runId,
    skillId: skill.id,
    appId: input.app?.id ?? null,
    triggerType,
    triggerActionId: input.triggerActionId ?? skill.id,
    triggerLabel,
    requestedByActorId: input.requestedByActorId,
    requestedByLabel: input.requestedByLabel,
    status: "running",
    executionEntryPath: skill.entryPath,
    executionNote: null,
    inputSchemaVersion: executionInput?.version,
    inputSummary,
    inputResourceCount: executableFiles.length,
    inputResourceTypes,
    startedAt: input.now,
    updatedAt: input.now,
  });

  try {
    const { execution, executionMode, executionNote } = await resolveWorkspaceSkillExecution(
      {
        ...input,
        files: executableFiles,
      },
      callbacks,
    );
    for (const artifact of execution.artifacts) {
      await Promise.resolve(callbacks.upsertArtifactRecord(artifact));
    }
    if (execution.nextApps && execution.nextApps.length > 0) {
      if (!callbacks.writeWorkspaceApps) {
        throw new Error("当前能力产生了 App 更新，但执行器还没有提供 workspace app 写入能力。");
      }
      await callbacks.writeWorkspaceApps(execution.nextApps);
    }

    const receipt = buildReceiptArtifact({
      company: input.company,
      skill,
      app: input.app,
      ownerLabel: input.ownerLabel,
      outputArtifacts: execution.artifacts,
      workItemId: input.workItemId,
      now: input.now,
    });
    await Promise.resolve(callbacks.upsertArtifactRecord(receipt));

    const outputArtifacts = [receipt, ...execution.artifacts];
    const outputResourceTypes = [
      ...new Set(
        outputArtifacts
          .map((artifact) => artifact.resourceType)
          .filter((value): value is ArtifactResourceType => Boolean(value)),
      ),
    ];
    const completedAt = Date.now();
    await callbacks.upsertSkillRun({
      id: runId,
      skillId: skill.id,
      appId: input.app?.id ?? null,
      triggerType,
      triggerActionId: input.triggerActionId ?? skill.id,
      triggerLabel,
      requestedByActorId: input.requestedByActorId,
      requestedByLabel: input.requestedByLabel,
      status: "succeeded",
      executionMode,
      executionEntryPath: skill.entryPath,
      executionNote,
      inputSchemaVersion: executionInput?.version,
      inputSummary,
      inputResourceCount: executableFiles.length,
      inputResourceTypes,
      resultSummary: execution.runSummary,
      outputArtifactIds: outputArtifacts.map((artifact) => artifact.id),
      outputResourceTypes:
        outputResourceTypes.length > 0 ? outputResourceTypes : skill.writesResourceTypes,
      startedAt: input.now,
      completedAt,
      updatedAt: completedAt,
    });

    return {
      status: "succeeded",
      title: execution.successTitle,
      detail: execution.successDetail,
      runId,
      receiptArtifactId: receipt.id,
      outputArtifactIds: outputArtifacts.map((artifact) => artifact.id),
      outputResourceTypes,
      executionMode,
      executionEntryPath: skill.entryPath,
      executionNote,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = Date.now();
    const issueDraft = buildRuntimeErrorIssueDraft({
      skill,
      app: input.app,
      message,
    });
    await callbacks.upsertSkillRun({
      id: runId,
      skillId: skill.id,
      appId: input.app?.id ?? null,
      triggerType,
      triggerActionId: input.triggerActionId ?? skill.id,
      triggerLabel,
      requestedByActorId: input.requestedByActorId,
      requestedByLabel: input.requestedByLabel,
      status: "failed",
      executionEntryPath: skill.entryPath,
      executionNote: null,
      inputSchemaVersion: executionInput?.version,
      inputSummary,
      inputResourceCount: executableFiles.length,
      inputResourceTypes,
      errorMessage: message,
      startedAt: input.now,
      completedAt: failedAt,
      updatedAt: failedAt,
    });
    if (shouldAutoReportIssue) {
      await Promise.resolve(
        callbacks.reportIssue?.({
          ...issueDraft,
          contextActionId: input.triggerActionId ?? skill.id,
          contextRunId: runId,
        }),
      );
    }
    return {
      status: "failed",
      title: triggerType === "manual" ? "能力验证未通过" : "能力执行失败",
      detail: shouldAutoReportIssue ? "问题已经自动登记到 CTO 技术中台。" : message,
      runId,
      issueDraft,
    };
  }
}

export type { RunWorkspaceSkillInput, RunWorkspaceSkillCallbacks };
