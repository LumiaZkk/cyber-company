import type { ArtifactResourceType } from "../../domain/artifact/types";
import type {
  CapabilityAuditEventRecord,
  CapabilityIssueRecord,
  CapabilityRequestRecord,
  SkillDefinition,
  SkillRunRecord,
} from "../../domain/org/types";
import { buildSkillReleaseReadiness } from "./skill-release";

export type CapabilityPlatformCloseoutStatus = "ready" | "in_progress" | "attention";

export type CapabilityPlatformCloseoutCheck = {
  id: string;
  label: string;
  status: CapabilityPlatformCloseoutStatus;
  summary: string;
  detail: string;
  nextStep?: string;
};

export type CapabilityPlatformCloseoutSummary = {
  checks: CapabilityPlatformCloseoutCheck[];
  totals: Record<CapabilityPlatformCloseoutStatus, number>;
};

export type CapabilityPlatformCloseoutSnapshot = {
  signature: string;
  status: CapabilityPlatformCloseoutStatus;
  readyCount: number;
  inProgressCount: number;
  attentionCount: number;
  totalCount: number;
  updatedAt: number;
};

const FORMAL_RESOURCE_ORIGINS = new Set(["declared", "manifest"]);
const CLOSEOUT_RESOURCE_TYPES = new Set<ArtifactResourceType>(["document", "report", "dataset", "media", "state"]);

function isBusinessResourceCandidate(file: {
  resourceType?: ArtifactResourceType;
  tags?: string[];
}) {
  if (!file.resourceType || !CLOSEOUT_RESOURCE_TYPES.has(file.resourceType)) {
    return false;
  }
  return !file.tags?.includes("tech.app-manifest");
}

function countByStatus(checks: CapabilityPlatformCloseoutCheck[]) {
  return checks.reduce<Record<CapabilityPlatformCloseoutStatus, number>>(
    (totals, check) => {
      totals[check.status] += 1;
      return totals;
    },
    {
      ready: 0,
      in_progress: 0,
      attention: 0,
    },
  );
}

function buildCloseoutSnapshotSignature(checks: CapabilityPlatformCloseoutCheck[]) {
  return JSON.stringify({
    checks: checks.map((check) => ({ id: check.id, status: check.status })),
  });
}

export function buildCapabilityPlatformCloseoutSummary(input: {
  workspaceApps: Array<{
    id: string;
    title: string;
    manifestArtifactId?: string | null;
  }>;
  workspaceFiles: Array<{
    resourceOrigin: "declared" | "manifest" | "inferred";
    resourceType?: ArtifactResourceType;
    tags?: string[];
  }>;
  skillDefinitions: SkillDefinition[];
  skillRuns: SkillRunRecord[];
  capabilityRequests: CapabilityRequestRecord[];
  capabilityIssues: CapabilityIssueRecord[];
  capabilityAuditEvents: CapabilityAuditEventRecord[];
  executorProvisioning?: {
    state: "ready" | "degraded" | "blocked";
    pendingAgentIds?: string[];
    lastError?: string | null;
  } | null;
}) : CapabilityPlatformCloseoutSummary {
  const formalResourceCount = input.workspaceFiles.filter(
    (file) => FORMAL_RESOURCE_ORIGINS.has(file.resourceOrigin) && isBusinessResourceCandidate(file),
  ).length;
  const inferredResourceCount = input.workspaceFiles.filter(
    (file) => file.resourceOrigin === "inferred" && isBusinessResourceCandidate(file),
  ).length;
  const appCount = input.workspaceApps.length;
  const manifestReadyCount = input.workspaceApps.filter((app) => Boolean(app.manifestArtifactId)).length;
  const missingManifestApps = input.workspaceApps.filter((app) => !app.manifestArtifactId).map((app) => app.title);
  const validatedCapabilityCount = input.skillDefinitions.filter((skill) =>
    Boolean(
      buildSkillReleaseReadiness({
        skill,
        skillRuns: input.skillRuns,
        workspaceApps: input.workspaceApps,
      }).latestSuccessfulSmokeTestRun,
    ),
  ).length;
  const publishableCapabilityCount = input.skillDefinitions.filter((skill) =>
    buildSkillReleaseReadiness({
      skill,
      skillRuns: input.skillRuns,
      workspaceApps: input.workspaceApps,
    }).publishable,
  ).length;
  const openRequestCount = input.capabilityRequests.filter((request) => request.status !== "closed").length;
  const openIssueCount = input.capabilityIssues.filter((issue) => issue.status !== "closed").length;

  const checks: CapabilityPlatformCloseoutCheck[] = [
    {
      id: "executor-provisioning",
      label: "执行器补齐",
      status:
        !input.executorProvisioning || input.executorProvisioning.state === "ready"
          ? "ready"
          : "attention",
      summary:
        !input.executorProvisioning || input.executorProvisioning.state === "ready"
          ? "当前公司执行器已经可用。"
          : "执行器仍在补齐，部分能力可能回退或不可用。",
      detail:
        !input.executorProvisioning || input.executorProvisioning.state === "ready"
          ? "OpenClaw / Authority 执行器状态正常，当前不阻断工作目录与能力入口。"
          : input.executorProvisioning.lastError?.trim()
            ? `最近原因：${input.executorProvisioning.lastError}`
            : "建议先在页面顶部继续重试补齐执行器，避免正式能力长期处于降级运行。",
      nextStep:
        !input.executorProvisioning || input.executorProvisioning.state === "ready"
          ? undefined
          : "先在页面顶部继续重试补齐执行器，避免正式能力长期处于降级运行。",
    },
    {
      id: "app-manifest-coverage",
      label: "App 契约覆盖",
      status:
        appCount === 0
          ? "attention"
          : manifestReadyCount === appCount
            ? "ready"
            : manifestReadyCount > 0
              ? "in_progress"
              : "attention",
      summary:
        appCount === 0
          ? "当前还没有显式公司应用。"
          : `${manifestReadyCount}/${appCount} 个公司 App 已接入显式 AppManifest。`,
      detail:
        appCount === 0
          ? "先把正式 App 挂到工作目录里，平台才能承接后续资源、动作与反馈回路。"
          : manifestReadyCount === appCount
            ? "所有公司 App 都已经由 manifest 驱动，后续分区、动作和空状态可以统一治理。"
            : "仍有一部分 App 没接入正式 manifest，当前只能算部分收口。",
      nextStep:
        appCount === 0
          ? "先把正式 App 挂到工作目录里，再逐步补齐 manifest。"
          : manifestReadyCount === appCount
            ? undefined
            : `优先补齐 ${missingManifestApps.slice(0, 3).join(" / ")}${
                missingManifestApps.length > 3 ? " 等" : ""
              } 的正式 manifest。`,
    },
    {
      id: "formal-resource-coverage",
      label: "正式资源真相源",
      status:
        formalResourceCount === 0
          ? "attention"
          : inferredResourceCount === 0
            ? "ready"
            : "in_progress",
      summary:
        formalResourceCount === 0
          ? "当前还没有正式资源进入工作目录。"
          : `正式资源 ${formalResourceCount} 份，推断补位 ${inferredResourceCount} 份。`,
      detail:
        formalResourceCount === 0
          ? "先补齐显式 resourceType / tags / manifest，避免工作目录只能靠推断兜底。"
          : inferredResourceCount === 0
            ? "当前资源已经全部来自显式声明，平台判断不再依赖推断。"
            : "推断资源仍存在，但只应停留在展示和草案层，不再进入业务判断。",
      nextStep:
        formalResourceCount === 0
          ? "先把至少一份主体内容、参考资料或报告发布为正式资源。"
          : inferredResourceCount === 0
            ? undefined
            : `先把 ${inferredResourceCount} 份推断补位里的业务资源逐步发布为正式资源或挂进 manifest。`,
    },
    {
      id: "capability-validation",
      label: "能力验证与发布",
      status:
        input.skillDefinitions.length === 0
          ? "attention"
          : publishableCapabilityCount === input.skillDefinitions.length
            ? "ready"
            : validatedCapabilityCount > 0
              ? "in_progress"
              : "attention",
      summary:
        input.skillDefinitions.length === 0
          ? "当前还没有登记任何正式能力。"
          : `${validatedCapabilityCount}/${input.skillDefinitions.length} 条能力已有成功验证，${publishableCapabilityCount} 条已满足发布条件。`,
      detail:
        input.skillDefinitions.length === 0
          ? "先把关键工具登记成能力草稿，再逐步跑通验证与发布。"
          : publishableCapabilityCount === input.skillDefinitions.length
            ? "当前登记的能力都已经具备正式发布条件，可以稳定被 App 或流程节点依赖。"
            : "仍有能力缺少成功验证或发布条件，正式依赖前需要继续补齐。",
      nextStep:
        input.skillDefinitions.length === 0
          ? "先从当前公司最关键的一项能力或 App 动作开始，登记成第一条能力草稿。"
          : publishableCapabilityCount === input.skillDefinitions.length
            ? undefined
            : validatedCapabilityCount === 0
              ? "先运行一次成功的能力验证，再继续发布为可用。"
              : "先把剩余能力的验证跑通，再补齐发布条件。",
    },
    {
      id: "governance-and-audit",
      label: "治理回路与审计",
      status:
        input.capabilityAuditEvents.length === 0 && input.skillRuns.length === 0
          ? "attention"
          : openRequestCount === 0 && openIssueCount === 0
            ? "ready"
            : "in_progress",
      summary: `审计事件 ${input.capabilityAuditEvents.length} 条，运行记录 ${input.skillRuns.length} 条，未关闭需求/问题 ${openRequestCount + openIssueCount} 条。`,
      detail:
        input.capabilityAuditEvents.length === 0 && input.skillRuns.length === 0
          ? "平台还没有留下足够的治理或运行证据，后续很难做最终关单。"
          : openRequestCount === 0 && openIssueCount === 0
            ? "治理回路已经被真实使用，且当前没有未关闭的能力需求或问题。"
            : "还有待跟进的需求或问题，GA closeout 前需要继续推动到待验证或已关闭。",
      nextStep:
        input.capabilityAuditEvents.length === 0 && input.skillRuns.length === 0
          ? "先登记一条能力草稿，或真实触发一次能力验证/运行，留下正式治理证据。"
          : openRequestCount === 0 && openIssueCount === 0
            ? undefined
            : `优先推进 ${openRequestCount + openIssueCount} 条未关闭的需求/问题到待验证或已关闭。`,
    },
  ];

  return {
    checks,
    totals: countByStatus(checks),
  };
}

export function buildCapabilityPlatformCloseoutSnapshot(input: {
  summary: CapabilityPlatformCloseoutSummary;
  updatedAt: number;
}): CapabilityPlatformCloseoutSnapshot {
  const signature = buildCloseoutSnapshotSignature(input.summary.checks);
  const status: CapabilityPlatformCloseoutStatus =
    input.summary.totals.attention > 0
      ? "attention"
      : input.summary.totals.in_progress > 0
        ? "in_progress"
        : "ready";
  return {
    signature,
    status,
    readyCount: input.summary.totals.ready,
    inProgressCount: input.summary.totals.in_progress,
    attentionCount: input.summary.totals.attention,
    totalCount: input.summary.checks.length,
    updatedAt: input.updatedAt,
  };
}

export function isCapabilityPlatformCloseoutSnapshotEqual(
  left?: CapabilityPlatformCloseoutSnapshot | null,
  right?: CapabilityPlatformCloseoutSnapshot | null,
) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.signature === right.signature
    && left.status === right.status
    && left.readyCount === right.readyCount
    && left.inProgressCount === right.inProgressCount
    && left.attentionCount === right.attentionCount
    && left.totalCount === right.totalCount
  );
}
