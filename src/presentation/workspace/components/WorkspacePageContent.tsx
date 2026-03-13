import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  BookOpenCheck,
  Compass,
  FileCode2,
  RefreshCcw,
  ScrollText,
  Wrench,
} from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatKnowledgeKindLabel } from "../../../application/artifact/shared-knowledge";
import { resolveWorkspaceAppSurface, resolveWorkspaceAppTemplate } from "../../../application/company/workspace-apps";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  CAPABILITY_ISSUE_STATUS_LABEL,
  CAPABILITY_ISSUE_ACTION_LABEL,
  CAPABILITY_REQUEST_STATUS_LABEL,
  CAPABILITY_REQUEST_ACTION_LABEL,
  NEXT_CAPABILITY_ISSUE_STATUS,
  NEXT_CAPABILITY_REQUEST_STATUS,
  buildSkillReleaseReadiness,
  buildCapabilityAuditTimeline,
  buildCapabilityPlatformCloseoutSummary,
  buildCapabilityVerificationQueue,
  CAPABILITY_AUDIT_ACTION_LABEL,
  type WorkspaceAppManifest,
  type WorkspaceAppManifestAction,
  type WorkspaceEmbeddedAppRuntime,
  RESOURCE_KIND_LABEL,
  formatWorkspaceFileKindLabel,
  buildCapabilityIssueBoard,
  buildCapabilityRequestBoard,
  isWorkspaceReaderManifestDraft,
  type WorkspaceReaderManifest,
  WORKBENCH_TOOL_CARDS,
  formatWorkspaceBytes,
  type ResolvedWorkflowCapabilityBinding,
  type WorkspaceReaderIndex,
  type WorkspaceFileRow,
  type WorkspacePolicySummary,
  type WorkspaceWorkbenchTool,
  type CapabilityBoardLane,
} from "../../../application/workspace";
import type { ArtifactResourceType, SharedKnowledgeItem } from "../../../domain/artifact/types";
import type {
  CapabilityIssueRecord,
  CapabilityIssueStatus,
  CapabilityRequestRecord,
  CapabilityRequestStatus,
  CapabilityAuditEventRecord,
  CompanyWorkspaceAppKind,
  CompanyWorkspaceAppStatus,
  CompanyWorkspaceAppSurface,
  CompanyWorkspaceAppTemplate,
  SkillDefinition,
  SkillDefinitionStatus,
  SkillRunRecord,
  SkillRunStatus,
  WorkflowCapabilityBinding,
} from "../../../domain/org/types";
import { cn, formatTime } from "../../../lib/utils";

type WorkspaceAppSummary = {
  id: string;
  kind: CompanyWorkspaceAppKind;
  icon: string;
  title: string;
  description: string;
  summary?: string;
  status: CompanyWorkspaceAppStatus;
  surface?: CompanyWorkspaceAppSurface;
  template?: CompanyWorkspaceAppTemplate;
  manifestArtifactId?: string | null;
  embeddedHostKey?: string | null;
  embeddedPermissions?: {
    resources: "manifest-scoped";
    appState: "readwrite" | "readonly";
    companyWrites: "none";
    actions: "whitelisted" | "none";
  } | null;
};

const artifactResourceTypeLabel: Record<ArtifactResourceType, string> = {
  document: "文档",
  report: "报告",
  dataset: "数据",
  media: "媒体",
  state: "状态",
  tool: "工具",
  other: "其他",
};

const resourceOriginLabel: Record<WorkspaceFileRow["resourceOrigin"], string> = {
  declared: "正式资源",
  manifest: "Manifest",
  inferred: "推断",
};

type WorkspaceAnchor = {
  id: string;
  label: string;
  found: boolean;
};

type WorkspacePageContentProps = {
  activeCompanyName: string;
  workspaceApps: WorkspaceAppSummary[];
  workspaceAppsAreExplicit: boolean;
  selectedApp: WorkspaceAppSummary;
  selectedAppManifest: WorkspaceAppManifest | null;
  selectedFile: WorkspaceFileRow | null;
  selectedFileKey: string | null;
  selectedFileContent: string;
  loadingFileKey: string | null;
  embeddedRuntime: WorkspaceEmbeddedAppRuntime<WorkspaceFileRow> | null;
  activeWorkspaceWorkItem: {
    id: string;
    title: string;
    displayOwnerLabel: string;
    ownerLabel: string;
    displayStage: string;
    stageLabel: string;
    displayNextAction: string;
    nextAction: string;
  } | null;
  artifactBackedWorkspaceCount: number;
  mirroredOnlyWorkspaceCount: number;
  shouldSyncProviderWorkspace: boolean;
  workspacePolicySummary: WorkspacePolicySummary;
  chapterFiles: WorkspaceFileRow[];
  canonFiles: WorkspaceFileRow[];
  reviewFiles: WorkspaceFileRow[];
  readerIndex: WorkspaceReaderIndex;
  readerManifest: WorkspaceReaderManifest | null;
  knowledgeFiles: WorkspaceFileRow[];
  knowledgeItems: SharedKnowledgeItem[];
  selectedKnowledgeItem: SharedKnowledgeItem | null;
  selectedKnowledgeSourceFiles: WorkspaceFileRow[];
  toolingFiles: WorkspaceFileRow[];
  supplementaryFiles: WorkspaceFileRow[];
  workspaceFiles: WorkspaceFileRow[];
  anchors: WorkspaceAnchor[];
  workflowCapabilityBindingCatalog: WorkflowCapabilityBinding[];
  workflowCapabilityBindingsAreExplicit: boolean;
  workflowCapabilityBindings: ResolvedWorkflowCapabilityBinding[];
  ctoLabel: string | null;
  businessLeadLabel: string | null;
  skillDefinitions: SkillDefinition[];
  skillRuns: SkillRunRecord[];
  capabilityRequests: CapabilityRequestRecord[];
  capabilityIssues: CapabilityIssueRecord[];
  capabilityAuditEvents: CapabilityAuditEventRecord[];
  manifestRegistrationCandidateCount: number;
  publishedAppTemplates: CompanyWorkspaceAppTemplate[];
  loadingIndex: boolean;
  executorProvisioning: {
    state: "ready" | "degraded" | "blocked";
    pendingAgentIds?: string[];
    lastError?: string | null;
    updatedAt: number;
  } | null;
  onRefreshIndex: () => void;
  onRetryCompanyProvisioning: () => void | Promise<void>;
  onRunAppManifestAction: (action: WorkspaceAppManifestAction) => void | Promise<void>;
  onSelectApp: (appId: string) => void;
  onSelectFile: (fileKey: string) => void;
  onSelectEmbeddedSection: (slot: string) => void;
  onSelectEmbeddedFile: (fileKey: string) => void;
  onSelectKnowledge: (knowledgeId: string) => void;
  onOpenCtoWorkbench: (tool: WorkspaceWorkbenchTool) => void;
  onPublishTemplateApp: (template: "reader" | "consistency" | "review-console" | "dashboard") => void | Promise<void>;
  onRegisterExistingApp: () => void | Promise<void>;
  onGenerateAppManifestDraft: (appId?: string) => void | Promise<void>;
  onCreateSkillDraft: (tool: WorkspaceWorkbenchTool) => void | Promise<void>;
  onCreateCapabilityRequest: (tool: WorkspaceWorkbenchTool) => void | Promise<void>;
  onCreateCapabilityIssue: (input?: {
    type?: CapabilityIssueRecord["type"];
    summary?: string;
    detail?: string;
    appId?: string | null;
    skillId?: string | null;
    contextActionId?: string | null;
    contextAppSection?: string | null;
    contextFileKey?: string | null;
    contextFileName?: string | null;
    contextRunId?: string | null;
  }) => void | Promise<void>;
  onUpdateSkillStatus: (skillId: string, status: SkillDefinitionStatus) => void | Promise<void>;
  onRunSkillSmokeTest: (skillId: string) => void | Promise<void>;
  onTriggerSkill: (skillId: string, appId?: string | null) => void | Promise<void>;
  onPublishWorkflowCapabilityBindings: () => void | Promise<void>;
  onRestoreWorkflowCapabilityBindings: () => void | Promise<void>;
  onToggleWorkflowCapabilityBindingRequired: (bindingId: string) => void | Promise<void>;
  onUpdateCapabilityRequestStatus: (
    requestId: string,
    status: CapabilityRequestStatus,
  ) => void | Promise<void>;
  onUpdateCapabilityIssueStatus: (
    issueId: string,
    status: CapabilityIssueStatus,
  ) => void | Promise<void>;
  onPublishRecommendedApps?: () => void | Promise<void>;
  onOpenFileChat: (agentId: string) => void;
  onOpenCtoChat: () => void;
  onOpenRequirementCenter?: () => void;
};

function renderWorkspaceAppIcon(template: CompanyWorkspaceAppTemplate) {
  switch (template) {
    case "reader":
      return <BookOpen className="h-5 w-5" />;
    case "consistency":
      return <Compass className="h-5 w-5" />;
    case "knowledge":
      return <ScrollText className="h-5 w-5" />;
    case "workbench":
      return <FileCode2 className="h-5 w-5" />;
    case "review-console":
      return <BookOpenCheck className="h-5 w-5" />;
    case "dashboard":
      return <RefreshCcw className="h-5 w-5" />;
    case "generic-app":
      return <FileCode2 className="h-5 w-5" />;
  }
}

const SKILL_STATUS_LABEL: Record<SkillDefinitionStatus, string> = {
  draft: "草稿",
  ready: "可用",
  degraded: "降级",
  retired: "停用",
};

const CAPABILITY_RUN_TRIGGER_LABEL: Record<SkillRunRecord["triggerType"], string> = {
  app_action: "App 动作",
  workflow_step: "流程节点",
  manual: "能力验证",
};

const CAPABILITY_PLATFORM_CLOSEOUT_STATUS_LABEL = {
  ready: "已收口",
  in_progress: "推进中",
  attention: "待补齐",
} as const;

function formatBindingMatchLabel(matchedBy: ResolvedWorkflowCapabilityBinding["matchedBy"]) {
  return matchedBy
    .map((item) =>
      item === "stage" ? "阶段命中" : item === "nextAction" ? "下一步命中" : "标题命中",
    )
    .join(" / ");
}

function WorkflowCapabilitySection({
  workflowCapabilityBindings: bindings,
  onSelectApp,
  onPublishTemplateApp,
  onTriggerSkill,
}: Pick<
  WorkspacePageContentProps,
  "workflowCapabilityBindings" | "onSelectApp" | "onPublishTemplateApp" | "onTriggerSkill"
>) {
  if (bindings.length === 0) {
    return null;
  }

  const publishableTemplates = new Set<"reader" | "consistency" | "review-console" | "dashboard">([
    "reader",
    "consistency",
    "review-console",
    "dashboard",
  ]);

  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">当前阶段建议能力</CardTitle>
        <CardDescription>这些 App / 能力是根据当前工作项的阶段和下一步动作自动匹配出来的，帮助团队知道现在该用什么。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {bindings.map((binding) => (
          <div key={binding.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-950">{binding.label}</div>
                {binding.guidance ? (
                  <div className="mt-1 text-xs leading-5 text-slate-500">{binding.guidance}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={binding.required ? "default" : "secondary"}>
                  {binding.required ? "必用" : "建议"}
                </Badge>
                <Badge variant="outline">{formatBindingMatchLabel(binding.matchedBy)}</Badge>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {binding.apps.map((app) => (
                <Button key={app.id} type="button" size="sm" variant="outline" onClick={() => onSelectApp(app.id)}>
                  打开 {app.title}
                </Button>
              ))}
              {binding.skills.map((skill) => (
                <Button
                  key={skill.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={skill.status !== "ready"}
                  onClick={() => void onTriggerSkill(skill.id, binding.apps[0]?.id ?? null)}
                >
                  {skill.status === "ready"
                    ? `运行 ${skill.title}`
                    : `${skill.title} · ${SKILL_STATUS_LABEL[skill.status]}`}
                </Button>
              ))}
              {binding.missingAppTemplates
                .filter((template): template is "reader" | "consistency" | "review-console" | "dashboard" =>
                  publishableTemplates.has(template as "reader" | "consistency" | "review-console" | "dashboard"),
                )
                .map((template) => (
                  <Button
                    key={`publish:${template}`}
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void onPublishTemplateApp(template)}
                  >
                    发布 {template === "reader" ? "阅读器" : template === "consistency" ? "一致性中心" : template === "dashboard" ? "仪表盘" : "审阅控制台"}
                  </Button>
                ))}
            </div>
            {binding.missingSkillIds.length > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                缺少能力：{binding.missingSkillIds.join("、")}。当前阶段已经命中这条能力绑定，建议 CTO 继续补齐对应能力实现。
              </div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SelectedAppGovernanceSection({
  selectedApp,
  capabilityRequests,
  capabilityIssues,
  onOpenCtoChat,
  onUpdateCapabilityRequestStatus,
  onUpdateCapabilityIssueStatus,
}: Pick<
  WorkspacePageContentProps,
  | "selectedApp"
  | "capabilityRequests"
  | "capabilityIssues"
  | "onOpenCtoChat"
  | "onUpdateCapabilityRequestStatus"
  | "onUpdateCapabilityIssueStatus"
>) {
  const relatedRequests = useMemo(
    () =>
      [...capabilityRequests]
        .filter((request) => request.appId === selectedApp.id)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 3),
    [capabilityRequests, selectedApp.id],
  );
  const relatedIssues = useMemo(
    () =>
      [...capabilityIssues]
        .filter((issue) => issue.appId === selectedApp.id)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 3),
    [capabilityIssues, selectedApp.id],
  );
  const activeRequestCount = capabilityRequests.filter(
    (request) => request.appId === selectedApp.id && request.status !== "closed",
  ).length;
  const activeIssueCount = capabilityIssues.filter(
    (issue) => issue.appId === selectedApp.id && issue.status !== "closed",
  ).length;
  const verifyRequestCount = relatedRequests.filter(
    (request) => request.status === "ready" || request.status === "verified",
  ).length;
  const verifyIssueCount = relatedIssues.filter(
    (issue) => issue.status === "ready_for_verify" || issue.status === "verified",
  ).length;

  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">当前 App 的反馈回路</CardTitle>
            <CardDescription className="mt-2 max-w-3xl leading-6">
              这张 App 上报过的能力需求和问题，会在这里直接显示状态，不需要先跳回 CTO 工坊再确认有没有进入 backlog。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">需求 {activeRequestCount}</Badge>
            <Badge variant="outline">问题 {activeIssueCount}</Badge>
            {verifyRequestCount + verifyIssueCount > 0 ? (
              <Badge variant="secondary">待验证 {verifyRequestCount + verifyIssueCount}</Badge>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={onOpenCtoChat}>
              打开 CTO 会话
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">能力需求</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">缺少页面、工具或检查器时，这里会显示已登记的需求。</div>
            </div>
            <Badge variant="outline">{activeRequestCount}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {relatedRequests.length > 0 ? (
              relatedRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-950">{request.summary}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {request.requesterLabel ?? "业务负责人"} · {formatTime(request.updatedAt)}
                      </div>
                      {request.detail ? (
                        <div className="mt-2 text-xs leading-5 text-slate-600">{request.detail}</div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] leading-5 text-slate-500">
                        {request.skillId ? <Badge variant="outline">能力 · {request.skillId}</Badge> : null}
                        {request.contextFileName ? (
                          <Badge variant="outline">资源 · {request.contextFileName}</Badge>
                        ) : null}
                        {request.contextRunId ? <Badge variant="outline">运行记录 · {request.contextRunId}</Badge> : null}
                      </div>
                    </div>
                    <Badge variant={request.status === "closed" ? "secondary" : "outline"}>
                      {CAPABILITY_REQUEST_STATUS_LABEL[request.status]}
                    </Badge>
                  </div>
                  {NEXT_CAPABILITY_REQUEST_STATUS[request.status] ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                      <div className="text-xs text-slate-500">
                        下一步：
                        {request.status === "ready" || request.status === "verified"
                          ? "业务负责人验收"
                          : request.status === "building"
                            ? "CTO 建设"
                            : request.status === "triaged"
                              ? "CTO 评估"
                              : "业务负责人分流"}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={request.status === "ready" || request.status === "verified" ? "default" : "outline"}
                        onClick={() =>
                          void onUpdateCapabilityRequestStatus(
                            request.id,
                            NEXT_CAPABILITY_REQUEST_STATUS[request.status]!,
                          )
                        }
                      >
                        {CAPABILITY_REQUEST_ACTION_LABEL[request.status]}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                这张 App 还没有登记过能力需求。需要补工具或页面时，直接使用上方动作入口即可。
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">能力问题</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">结果不对、脚本异常或页面不可用时，这里会直接看到跟进状态。</div>
            </div>
            <Badge variant="outline">{activeIssueCount}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {relatedIssues.length > 0 ? (
              relatedIssues.map((issue) => (
                <div key={issue.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-950">{issue.summary}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {issue.reporterLabel ?? "业务负责人"} · {formatTime(issue.updatedAt)}
                      </div>
                      {issue.detail ? (
                        <div className="mt-2 text-xs leading-5 text-slate-600">{issue.detail}</div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] leading-5 text-slate-500">
                        {issue.skillId ? <Badge variant="outline">能力 · {issue.skillId}</Badge> : null}
                        {issue.contextFileName ? (
                          <Badge variant="outline">资源 · {issue.contextFileName}</Badge>
                        ) : null}
                        {issue.contextRunId ? <Badge variant="outline">运行记录 · {issue.contextRunId}</Badge> : null}
                      </div>
                    </div>
                    <Badge variant={issue.status === "closed" ? "secondary" : "outline"}>
                      {CAPABILITY_ISSUE_STATUS_LABEL[issue.status]}
                    </Badge>
                  </div>
                  {NEXT_CAPABILITY_ISSUE_STATUS[issue.status] ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                      <div className="text-xs text-slate-500">
                        下一步：
                        {issue.status === "ready_for_verify" || issue.status === "verified"
                          ? "业务负责人回访"
                          : issue.status === "fixing" || issue.status === "acknowledged"
                            ? "CTO 修复"
                            : "业务负责人补事实"}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={issue.status === "ready_for_verify" || issue.status === "verified" ? "default" : "outline"}
                        onClick={() =>
                          void onUpdateCapabilityIssueStatus(
                            issue.id,
                            NEXT_CAPABILITY_ISSUE_STATUS[issue.status]!,
                          )
                        }
                      >
                        {CAPABILITY_ISSUE_ACTION_LABEL[issue.status]}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                这张 App 还没有登记过能力问题。等工具开始被真实使用后，这里会成为你确认修复进展的第一入口。
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkspaceReaderSection({
  activeWorkspaceWorkItem,
  chapterFiles,
  canonFiles,
  reviewFiles,
  readerIndex,
  readerManifest,
  supplementaryFiles,
  selectedFile,
  selectedFileKey,
  selectedFileContent,
  loadingFileKey,
  onSelectFile,
  onOpenFileChat,
  onGenerateAppManifestDraft,
}: Pick<
  WorkspacePageContentProps,
  | "activeWorkspaceWorkItem"
  | "chapterFiles"
  | "canonFiles"
  | "reviewFiles"
  | "readerIndex"
  | "readerManifest"
  | "supplementaryFiles"
  | "selectedFile"
  | "selectedFileKey"
  | "selectedFileContent"
  | "loadingFileKey"
  | "onSelectFile"
  | "onOpenFileChat"
  | "onGenerateAppManifestDraft"
>) {
  const readerManifestIsDraft = isWorkspaceReaderManifestDraft(readerManifest);
  const readerManifestSourceLabel =
    readerManifest?.sourceLabel && (!readerManifestIsDraft || readerManifest.sourceLabel !== "系统草案")
      ? readerManifest.sourceLabel
      : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      {activeWorkspaceWorkItem ? (
        <Card className="xl:col-span-2 border-indigo-200/70 bg-indigo-50/70 shadow-sm">
          <CardHeader className="gap-2">
            <CardDescription>当前工作项</CardDescription>
            <CardTitle className="text-base">{activeWorkspaceWorkItem.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <Badge variant="secondary">
                负责人 {activeWorkspaceWorkItem.displayOwnerLabel || activeWorkspaceWorkItem.ownerLabel}
              </Badge>
              <Badge variant="secondary">
                当前阶段 {activeWorkspaceWorkItem.displayStage || activeWorkspaceWorkItem.stageLabel}
              </Badge>
              <Badge variant="secondary">
                下一步 {activeWorkspaceWorkItem.displayNextAction || activeWorkspaceWorkItem.nextAction}
              </Badge>
            </div>
          </CardHeader>
        </Card>
      ) : null}
      <Card className="xl:col-span-2 border-slate-200/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">阅读索引</CardTitle>
              <CardDescription>记住你上次看到哪，顺手把最近值得回看的内容放到前面。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {readerManifest ? (
                <>
                  <Badge variant={readerManifestIsDraft ? "secondary" : "default"}>
                    {readerManifestIsDraft ? "索引草案已接入" : "索引已接入"}
                  </Badge>
                  {readerManifestIsDraft ? <Badge variant="outline">待 CTO 校准</Badge> : null}
                  {readerManifestSourceLabel ? <Badge variant="outline">{readerManifestSourceLabel}</Badge> : null}
                </>
              ) : (
                <Badge variant="secondary">尚未接入 AppManifest</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">正文</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{chapterFiles.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">设定</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{canonFiles.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">报告</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{reviewFiles.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">上次阅读</div>
              <div className="mt-2 truncate text-sm font-semibold text-slate-950">
                {readerIndex.lastOpenedFile?.name ?? "还没有记录"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {readerIndex.lastOpenedFile ? `${formatWorkspaceFileKindLabel(readerIndex.lastOpenedFile)} · 继续打开` : "第一次进入时会自动记录"}
              </div>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">最近阅读</div>
              {readerIndex.recentFiles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {readerIndex.recentFiles.map((file) => (
                    <Button key={file.key} type="button" variant="outline" size="sm" onClick={() => onSelectFile(file.key)}>
                      {file.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">还没有最近阅读记录。</div>
              )}
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">最近更新</div>
              {readerIndex.latestUpdatedFiles.length > 0 ? (
                <div className="space-y-2">
                  {readerIndex.latestUpdatedFiles.map((file) => (
                    <button
                      key={file.key}
                      type="button"
                      onClick={() => onSelectFile(file.key)}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">{file.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatWorkspaceFileKindLabel(file)} · {formatTime(file.updatedAtMs)}
                        </div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">
                  {readerManifest ? "索引已经接入，但当前还没有命中的可读产物。" : "还没有可展示的最近更新。"}
                </div>
              )}
            </div>
          </div>
          {readerManifestIsDraft ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              <div>
                当前接入的是系统自动生成的阅读索引草案，已经先把候选设定和报告接进来了，但正文、设定、报告的映射仍建议由 CTO 校准
                <code className="mx-1 rounded bg-white/80 px-1 py-0.5 text-xs">workspace-app-manifest.reader.json</code>
                ，避免复杂项目里的系统文件继续混进主阅读视图。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void onGenerateAppManifestDraft()}>
                  重新生成草案
                </Button>
              </div>
            </div>
          ) : !readerManifest ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              <div>
                当前阅读器仍主要靠文件名分类。要让复杂项目里的任意文档稳定进入阅读器，请让 CTO 产出
                <code className="mx-1 rounded bg-white/80 px-1 py-0.5 text-xs">workspace-app-manifest.reader.json</code>
                并把正文、设定、报告显式声明进去。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void onGenerateAppManifestDraft()}>
                  生成阅读器 AppManifest 草案
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">公司产物文档</CardTitle>
          <CardDescription>
            默认先看产品产物库里的正文、设定、审校报告和工具说明；后端文件镜像只作为补充来源。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {([
            ["chapter", chapterFiles],
            ["canon", canonFiles],
            ["review", reviewFiles],
          ] as const).map(([kind, files]) => {
            if (files.length === 0) {
              return null;
            }
            return (
              <div key={kind} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {RESOURCE_KIND_LABEL[kind]}
                  </div>
                  <Badge variant="secondary">{files.length}</Badge>
                </div>
                <div className="space-y-2">
                  {files.slice(0, 8).map((file) => (
                    <button
                      type="button"
                      key={file.key}
                      onClick={() => onSelectFile(file.key)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                        selectedFileKey === file.key
                          ? "border-indigo-200 bg-indigo-50 text-indigo-950"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{file.name}</div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {file.agentLabel} · {file.role}
                          </div>
                        </div>
                        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {chapterFiles.length + canonFiles.length + reviewFiles.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前产品产物库里还没有正文、设定或审校报告这类业务文档。先让 CTO/内容团队把可读产物固化下来，再回这里统一阅读。
            </div>
          )}
          {supplementaryFiles.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600">
              当前还有 {supplementaryFiles.length} 份工具/系统文档已收起，不再抢占阅读主视图。需要排查原始镜像时，再去“一致性中心”或“CTO 工具工坊”查看。
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{selectedFile?.name ?? "选择一份公司文档"}</CardTitle>
              <CardDescription className="mt-1">
                {selectedFile
                  ? `${selectedFile.agentLabel} · ${selectedFile.role} · ${selectedFile.artifactId ? "产品产物" : "补充来源"}`
                  : "从左侧挑一份正文、设定或审校报告，直接在页面里阅读。"}
              </CardDescription>
            </div>
            {selectedFile && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge variant="secondary">{formatWorkspaceFileKindLabel(selectedFile)}</Badge>
                <span>{formatWorkspaceBytes(selectedFile.size)}</span>
                <span>{formatTime(selectedFile.updatedAtMs)}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => onOpenFileChat(selectedFile.agentId)}>
                  打开 {selectedFile.agentLabel} 会话
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="min-h-[560px] p-0">
          {!selectedFile ? (
            <div className="flex h-full min-h-[560px] items-center justify-center px-6 text-center text-sm text-slate-500">
              这里会直接显示当前公司的正文、设定和报告内容，让创作团队不用离开产品就能对照阅读。
            </div>
          ) : loadingFileKey === selectedFile.key ? (
            <div className="flex h-full min-h-[560px] items-center justify-center text-sm text-slate-500">
              正在读取 {selectedFile.name}...
            </div>
          ) : (
            <div className="h-full overflow-auto px-6 py-6">
              <article className="prose prose-slate max-w-none prose-headings:font-semibold prose-p:text-slate-700">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedFileContent || "*当前文件没有可展示的文本内容。*"}
                </ReactMarkdown>
              </article>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WorkspaceKnowledgeHub({
  knowledgeItems,
  selectedKnowledgeItem,
  selectedKnowledgeSourceFiles,
  selectedFile,
  selectedFileContent,
  loadingFileKey,
  onSelectKnowledge,
  onSelectFile,
  onOpenFileChat,
}: Pick<
  WorkspacePageContentProps,
  | "knowledgeItems"
  | "selectedKnowledgeItem"
  | "selectedKnowledgeSourceFiles"
  | "selectedFile"
  | "selectedFileContent"
  | "loadingFileKey"
  | "onSelectKnowledge"
  | "onSelectFile"
  | "onOpenFileChat"
>) {
  const readingSelectedSource =
    selectedFile && selectedKnowledgeSourceFiles.some((file) => file.key === selectedFile.key)
      ? selectedFile
      : null;
  const knowledgeBody =
    readingSelectedSource
      ? selectedFileContent
      : selectedKnowledgeItem?.content ?? selectedKnowledgeItem?.details ?? selectedKnowledgeItem?.summary ?? "";

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_320px_minmax(0,1fr)]">
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">知识卡片</CardTitle>
          <CardDescription>自动收口后的治理产物会先落成公司知识，再决定是否关联原始文件。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {knowledgeItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectKnowledge(item.id)}
              className={cn(
                "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
                selectedKnowledgeItem?.id === item.id
                  ? "border-indigo-200 bg-indigo-50 text-indigo-950"
                  : "border-slate-200 bg-white hover:bg-slate-50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.summary}</div>
                </div>
                <Badge variant="secondary">{formatKnowledgeKindLabel(item.kind)}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                <Badge variant="outline">自动入库</Badge>
                <Badge variant="outline">{item.sourceAgentId ?? "公司知识"}</Badge>
                {item.transport ? <Badge variant="outline">{item.transport}</Badge> : null}
              </div>
            </button>
          ))}
          {knowledgeItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前还没有自动沉淀出的公司知识。闭环同步后，HR / CTO / COO / CEO 的正式方案会出现在这里。
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">来源产物</CardTitle>
          <CardDescription>优先显示与当前知识卡片绑定的原始方案文件；没有文件时直接回看自动收口正文。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedKnowledgeSourceFiles.map((file) => (
            <button
              key={file.key}
              type="button"
              onClick={() => onSelectFile(file.key)}
              className={cn(
                "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                selectedFile?.key === file.key
                  ? "border-indigo-200 bg-indigo-50 text-indigo-950"
                  : "border-slate-200 bg-white hover:bg-slate-50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{file.name}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {file.agentLabel} · {file.role}
                  </div>
                </div>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              </div>
            </button>
          ))}
          {selectedKnowledgeSourceFiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前知识卡片没有可直接打开的源文件，正文将直接显示自动收口内容。
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {readingSelectedSource?.name ?? selectedKnowledgeItem?.title ?? "选择一条知识卡片"}
              </CardTitle>
              <CardDescription className="mt-1">
                {readingSelectedSource
                  ? `${readingSelectedSource.agentLabel} · ${readingSelectedSource.role} · 原始来源`
                  : "这里直接显示自动验收后的知识正文，并保留来源链路。"}
              </CardDescription>
            </div>
            {selectedKnowledgeItem ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge variant="secondary">{formatKnowledgeKindLabel(selectedKnowledgeItem.kind)}</Badge>
                <Badge variant="outline">自动入库</Badge>
                {selectedKnowledgeItem.transport ? (
                  <Badge variant="outline">{selectedKnowledgeItem.transport}</Badge>
                ) : null}
                <span>{formatTime(selectedKnowledgeItem.updatedAt)}</span>
                {selectedKnowledgeItem.sourceAgentId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenFileChat(selectedKnowledgeItem.sourceAgentId!)}
                  >
                    打开 {selectedKnowledgeItem.sourceAgentId} 会话
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="min-h-[560px] p-0">
          {readingSelectedSource && loadingFileKey === readingSelectedSource.key ? (
            <div className="flex h-full min-h-[560px] items-center justify-center text-sm text-slate-500">
              正在读取 {readingSelectedSource.name}...
            </div>
          ) : knowledgeBody.trim().length > 0 ? (
            <div className="h-full overflow-auto px-6 py-6">
              <article className="prose prose-slate max-w-none prose-headings:font-semibold prose-p:text-slate-700">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{knowledgeBody}</ReactMarkdown>
              </article>
            </div>
          ) : (
            <div className="flex h-full min-h-[560px] items-center justify-center px-6 text-center text-sm text-slate-500">
              选择一条知识卡片后，这里会展示正文、来源和自动验收结果。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WorkspaceConsistencyHub({
  anchors,
  chapterFiles,
  reviewFiles,
  toolingFiles,
  onOpenCtoWorkbench,
  onOpenNovelReader,
}: {
  anchors: WorkspaceAnchor[];
  chapterFiles: WorkspaceFileRow[];
  reviewFiles: WorkspaceFileRow[];
  toolingFiles: WorkspaceFileRow[];
  onOpenCtoWorkbench: (tool: WorkspaceWorkbenchTool) => void;
  onOpenNovelReader: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>共享真相源</CardDescription>
            <CardTitle>{anchors.filter((anchor) => anchor.found).length}/4 已落盘</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>主体内容</CardDescription>
            <CardTitle>{chapterFiles.length} 份可读内容</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>审校与终审</CardDescription>
            <CardTitle>{reviewFiles.length} 份过程报告</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>工具脚本</CardDescription>
            <CardTitle>{toolingFiles.length} 份工具文件</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">一致性锚点</CardTitle>
            <CardDescription>先明确这家公司现在有哪些唯一真相源，哪些还缺位。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {anchors.map((anchor) => (
              <div
                key={anchor.id}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3",
                  anchor.found
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-amber-200 bg-amber-50 text-amber-950",
                )}
              >
                <div>
                  <div className="text-sm font-semibold">{anchor.label}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {anchor.found ? "已经在当前公司 workspace 中找到对应文件。" : "当前还没有稳定的唯一真相源文件。"}
                  </div>
                </div>
                <Badge variant={anchor.found ? "default" : "secondary"}>
                  {anchor.found ? "已具备" : "待补齐"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">下一步建议</CardTitle>
            <CardDescription>如果你要把这家公司做成真正可运营的工作平台，下一步优先级应该这样排。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              先把关键参考资料、状态流转和交接依据做成可检索的唯一真相源，再把对应能力需求正式交给 CTO 技术中台。
            </div>
            <Button type="button" className="w-full" onClick={() => onOpenCtoWorkbench("consistency-checker")}>
              发起规则校验能力需求
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={onOpenNovelReader}>
              先去内容查看 App 对照关键文件
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CapabilityBoardSummary({ lanes }: { lanes: CapabilityBoardLane[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {lanes.map((lane) => (
        <Badge key={lane.id} variant={lane.count > 0 ? "secondary" : "outline"}>
          {lane.label} {lane.count}
        </Badge>
      ))}
    </div>
  );
}

function CapabilityBoardLaneSection({
  lane,
  emptyText,
  renderActions,
}: {
  lane: CapabilityBoardLane;
  emptyText: string;
  renderActions: (item: CapabilityBoardLane["items"][number]) => ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-950">{lane.label}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{lane.description}</div>
        </div>
        <Badge variant={lane.count > 0 ? "secondary" : "outline"}>{lane.count}</Badge>
      </div>
      <div className="mt-3 space-y-3">
        {lane.items.length > 0 ? (
          lane.items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-950">{item.summary}</div>
                  {item.detail ? (
                    <div className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</div>
                  ) : null}
                </div>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{item.statusLabel}</Badge>
                <Badge variant="outline">下一步 {item.nextActorLabel}</Badge>
                {item.requesterOrReporterLabel ? (
                  <Badge variant="outline">来自 {item.requesterOrReporterLabel}</Badge>
                ) : null}
                {item.relatedLabels.map((label) => (
                  <Badge key={`${item.id}:${label}`} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-500">最近更新 {formatTime(item.updatedAt)}</div>
                <div className="flex flex-wrap gap-2">{renderActions(item)}</div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4 text-xs leading-5 text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

const CapabilityVerificationQueueSection = ({
  queue,
  onSelectApp,
  onUpdateCapabilityRequestStatus,
  onUpdateCapabilityIssueStatus,
}: {
  queue: ReturnType<typeof buildCapabilityVerificationQueue>;
  onSelectApp: (appId: string) => void;
  onUpdateCapabilityRequestStatus: WorkspacePageContentProps["onUpdateCapabilityRequestStatus"];
  onUpdateCapabilityIssueStatus: WorkspacePageContentProps["onUpdateCapabilityIssueStatus"];
}) => {
  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">待验证优先</CardTitle>
            <CardDescription className="mt-2 leading-6">
              这里会优先拉出已经交付、正等业务负责人验收或回访的项，减少在多个泳道之间来回翻找。
            </CardDescription>
          </div>
          <Badge variant={queue.length > 0 ? "secondary" : "outline"}>{queue.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {queue.length > 0 ? (
          queue.map((item) => {
            return (
              <div key={`${item.kind}:${item.id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-950">{item.summary}</div>
                    {item.detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</div> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={item.kind === "issue" ? "destructive" : "secondary"}>
                      {item.kind === "issue" ? "问题" : "需求"}
                    </Badge>
                    <Badge variant="outline">{item.statusLabel}</Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.appLabel ? <Badge variant="outline">App · {item.appLabel}</Badge> : null}
                        {item.skillLabel ? <Badge variant="outline">能力 · {item.skillLabel}</Badge> : null}
                  {item.contextFileName ? <Badge variant="outline">资源 · {item.contextFileName}</Badge> : null}
                  {item.contextRunId ? (
                    <Badge variant="outline" className="max-w-full truncate">
                      运行记录 · {item.contextRunId}
                    </Badge>
                  ) : null}
                  {item.requesterOrReporterLabel ? (
                    <Badge variant="outline">来自 {item.requesterOrReporterLabel}</Badge>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-500">最近更新 {formatTime(item.updatedAt)}</div>
                  <div className="flex flex-wrap gap-2">
                    {item.appId ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => onSelectApp(item.appId!)}>
                        打开相关 App
                      </Button>
                    ) : null}
                    {item.kind === "request" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void onUpdateCapabilityRequestStatus(
                            item.id,
                            item.status === "verified" ? "closed" : "verified",
                          )
                        }
                      >
                        {item.nextActionLabel ?? (item.status === "verified" ? "归档关闭" : "标记已验证")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void onUpdateCapabilityIssueStatus(
                            item.id,
                            item.status === "verified" ? "closed" : "verified",
                          )
                        }
                      >
                        {item.nextActionLabel ?? (item.status === "verified" ? "归档关闭" : "标记已验证")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-500">
            当前还没有等待业务负责人验收的项。后续当需求进入“待验证”或问题进入“待回访”时，这里会优先冒出来。
          </div>
        )}
      </CardContent>
    </Card>
  );
};

function WorkspaceWorkbench({
  ctoLabel,
  businessLeadLabel,
  workflowCapabilityBindingCatalog,
  workflowCapabilityBindingsAreExplicit,
  skillDefinitions,
  skillRuns,
  workspaceApps,
  workspaceFiles,
  executorProvisioning,
  capabilityAuditEvents,
  manifestRegistrationCandidateCount,
  capabilityRequests,
  capabilityIssues,
  onSelectApp,
  onOpenCtoWorkbench,
  onPublishTemplateApp,
  onRegisterExistingApp,
  onCreateSkillDraft,
  onGenerateAppManifestDraft,
  onCreateCapabilityRequest,
  onCreateCapabilityIssue,
  onRetryCompanyProvisioning,
  onUpdateSkillStatus,
  onRunSkillSmokeTest,
  onPublishWorkflowCapabilityBindings,
  onRestoreWorkflowCapabilityBindings,
  onToggleWorkflowCapabilityBindingRequired,
  onUpdateCapabilityRequestStatus,
  onUpdateCapabilityIssueStatus,
  publishedAppTemplates,
}: Pick<
  WorkspacePageContentProps,
  | "ctoLabel"
  | "businessLeadLabel"
  | "workflowCapabilityBindingCatalog"
  | "workflowCapabilityBindingsAreExplicit"
  | "skillDefinitions"
  | "skillRuns"
  | "workspaceApps"
  | "workspaceFiles"
  | "executorProvisioning"
  | "capabilityAuditEvents"
  | "manifestRegistrationCandidateCount"
  | "capabilityRequests"
  | "capabilityIssues"
  | "onSelectApp"
  | "onOpenCtoWorkbench"
  | "onPublishTemplateApp"
  | "onRegisterExistingApp"
  | "onCreateSkillDraft"
  | "onGenerateAppManifestDraft"
  | "onCreateCapabilityRequest"
  | "onCreateCapabilityIssue"
  | "onRetryCompanyProvisioning"
  | "onUpdateSkillStatus"
  | "onRunSkillSmokeTest"
  | "onPublishWorkflowCapabilityBindings"
  | "onRestoreWorkflowCapabilityBindings"
  | "onToggleWorkflowCapabilityBindingRequired"
  | "onUpdateCapabilityRequestStatus"
  | "onUpdateCapabilityIssueStatus"
  | "publishedAppTemplates"
>) {
  const publishableTemplateByCard: Partial<
    Record<WorkspaceWorkbenchTool, "reader" | "consistency" | "review-console">
  > = {
    "novel-reader": "reader",
    "consistency-checker": "consistency",
    "chapter-review-console": "review-console",
  };
  const nextSkillStatusByCurrent: Partial<Record<SkillDefinitionStatus, SkillDefinitionStatus>> = {
    draft: "ready",
    ready: "degraded",
    degraded: "ready",
    retired: "draft",
  };
  const skillStatusActionLabel: Record<SkillDefinitionStatus, string> = {
    draft: "发布为可用",
    ready: "标记降级",
    degraded: "恢复可用",
    retired: "恢复草稿",
  };
  const skillRunStatusLabel: Record<SkillRunStatus, string> = {
    pending: "排队中",
    running: "运行中",
    succeeded: "已成功",
    failed: "已失败",
    cancelled: "已取消",
  };
  const skillRunExecutionModeLabel = {
    builtin_bridge: "平台桥接",
    workspace_script: "工作区脚本",
  } as const;
  const recentSkillRuns = [...skillRuns].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 6);
  const skillLabelById = new Map(skillDefinitions.map((skill) => [skill.id, skill.title]));
  const appLabelById = new Map(workspaceApps.map((app) => [app.id, app.title]));
  const workspaceFileByArtifactId = new Map(
    workspaceFiles.filter((file) => file.artifactId).map((file) => [file.artifactId!, file]),
  );
  const capabilityRequestBoard = buildCapabilityRequestBoard(capabilityRequests, {
    appLabelById,
    skillLabelById,
  });
  const capabilityIssueBoard = buildCapabilityIssueBoard(capabilityIssues, {
    appLabelById,
    skillLabelById,
  });
  const verificationQueue = buildCapabilityVerificationQueue(capabilityRequests, capabilityIssues, {
    appLabelById,
    skillLabelById,
  });
  const capabilityAuditTimeline = buildCapabilityAuditTimeline(capabilityAuditEvents, {
    appLabelById,
    skillLabelById,
  });
  const closeoutSummary = buildCapabilityPlatformCloseoutSummary({
    workspaceApps,
    workspaceFiles,
    skillDefinitions,
    skillRuns,
    capabilityRequests,
    capabilityIssues,
    capabilityAuditEvents,
    executorProvisioning,
  });
  const firstAppWithoutManifest = workspaceApps.find((app) => !app.manifestArtifactId) ?? null;
  const firstSkillNeedingValidation =
    skillDefinitions.find(
      (skill) =>
        !buildSkillReleaseReadiness({
          skill,
          skillRuns,
          workspaceApps,
        }).latestSuccessfulSmokeTestRun,
    ) ?? null;
  const preferredDraftTool: WorkspaceWorkbenchTool = workspaceApps.some(
    (app) => resolveWorkspaceAppTemplate(app) === "consistency",
  )
    ? "consistency-checker"
    : workspaceApps.some((app) => resolveWorkspaceAppTemplate(app) === "reader")
      ? "novel-reader"
      : "chapter-review-console";

  return (
    <div className="space-y-5">
      <CapabilityVerificationQueueSection
        queue={verificationQueue}
        onSelectApp={onSelectApp}
        onUpdateCapabilityRequestStatus={onUpdateCapabilityRequestStatus}
        onUpdateCapabilityIssueStatus={onUpdateCapabilityIssueStatus}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {WORKBENCH_TOOL_CARDS.map((card) => {
          const publishableTemplate = publishableTemplateByCard[card.id];
          const isPublished = publishableTemplate ? publishedAppTemplates.includes(publishableTemplate) : false;

          return (
            <Card key={card.id} className="border-slate-200/80 shadow-sm">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">公司专属工具</Badge>
                  <Wrench className="h-4 w-4 text-slate-400" />
                </div>
                <div>
                  <CardTitle className="text-base">{card.title}</CardTitle>
                  <CardDescription className="mt-2 leading-6">{card.summary}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                  这条线会先由 {businessLeadLabel ?? "业务负责人"} 提需求，再交给 {ctoLabel ?? "CTO"} 做成工具能力、App 或资源契约。
                </div>
                {publishableTemplate ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isPublished}
                    onClick={() => void onPublishTemplateApp(publishableTemplate)}
                  >
                    {isPublished ? "已作为预设入口发布" : "从预设创建"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={manifestRegistrationCandidateCount === 0}
                  onClick={() => void onRegisterExistingApp()}
                >
                  {manifestRegistrationCandidateCount > 0 ? "注册已有 App/Page" : "暂无可注册的 AppManifest"}
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => void onCreateSkillDraft(card.id)}>
                  登记能力草稿
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => void onCreateCapabilityRequest(card.id)}>
                  登记能力需求
                </Button>
                <Button type="button" className="w-full" onClick={() => onOpenCtoWorkbench(card.id)}>
                  去 CTO 会话带上需求
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-4">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">中台收口状态</CardTitle>
                <CardDescription>按最终标准回看这家公司在 App、资源、能力、治理与运维上的收口进度。</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="default">已收口 {closeoutSummary.totals.ready}</Badge>
                <Badge variant="secondary">推进中 {closeoutSummary.totals.in_progress}</Badge>
                <Badge variant="outline">待补齐 {closeoutSummary.totals.attention}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {closeoutSummary.checks.map((check) => (
              <div key={check.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-950">{check.label}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{check.summary}</div>
                  </div>
                  <Badge
                    variant={
                      check.status === "ready"
                        ? "default"
                        : check.status === "in_progress"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {CAPABILITY_PLATFORM_CLOSEOUT_STATUS_LABEL[check.status]}
                  </Badge>
                </div>
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                  {check.detail}
                </div>
                {check.nextStep ? (
                  <div className="mt-2 rounded-lg border border-dashed border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-900">
                    下一步：{check.nextStep}
                  </div>
                ) : null}
                {check.id === "executor-provisioning" && check.status !== "ready" ? (
                  <div className="mt-3">
                    <Button type="button" size="sm" variant="outline" onClick={() => void onRetryCompanyProvisioning()}>
                      重试补齐执行器
                    </Button>
                  </div>
                ) : null}
                {check.id === "app-manifest-coverage" && check.status !== "ready" && firstAppWithoutManifest ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onGenerateAppManifestDraft(firstAppWithoutManifest.id)}
                    >
                      先补 {firstAppWithoutManifest.title} 的 AppManifest
                    </Button>
                  </div>
                ) : null}
                {check.id === "capability-validation" && check.status !== "ready" ? (
                  <div className="mt-3">
                    {skillDefinitions.length === 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void onCreateSkillDraft(preferredDraftTool)}
                      >
                        登记首条能力草稿
                      </Button>
                    ) : firstSkillNeedingValidation ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void onRunSkillSmokeTest(firstSkillNeedingValidation.id)}
                      >
                        先验证 {firstSkillNeedingValidation.title}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {check.id === "governance-and-audit" && check.status !== "ready" ? (
                  <div className="mt-3">
                    {skillDefinitions.length === 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void onCreateSkillDraft(preferredDraftTool)}
                      >
                        留下第一条治理记录
                      </Button>
                    ) : firstSkillNeedingValidation ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void onRunSkillSmokeTest(firstSkillNeedingValidation.id)}
                      >
                        先跑一次能力验证
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">流程绑定</CardTitle>
                <CardDescription>让“哪个阶段该用哪个 App / 工具能力”变成组织配置，而不是靠大家记忆。</CardDescription>
              </div>
              <Badge variant={workflowCapabilityBindingsAreExplicit ? "default" : "secondary"}>
                {workflowCapabilityBindingsAreExplicit ? "显式配置" : "系统默认"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {workflowCapabilityBindingsAreExplicit ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void onRestoreWorkflowCapabilityBindings()}>
                  恢复默认绑定
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => void onPublishWorkflowCapabilityBindings()}>
                  固化当前默认绑定
                </Button>
              )}
            </div>
            {workflowCapabilityBindingCatalog.length > 0 ? (
              workflowCapabilityBindingCatalog.map((binding) => (
                <div key={binding.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-950">{binding.label}</div>
                      {binding.guidance ? (
                        <div className="mt-1 text-xs leading-5 text-slate-500">{binding.guidance}</div>
                      ) : null}
                    </div>
                    <Badge variant={binding.required ? "default" : "secondary"}>
                      {binding.required ? "必用" : "建议"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {binding.appTemplates?.map((template) => (
                      <Badge key={`${binding.id}:app:${template}`} variant="outline">
                        App · {template}
                      </Badge>
                    ))}
                    {binding.skillIds?.map((skillId) => (
                      <Badge key={`${binding.id}:skill:${skillId}`} variant="outline">
                        能力 · {skillId}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onToggleWorkflowCapabilityBindingRequired(binding.id)}
                    >
                      {binding.required ? "改成建议" : "改成必用"}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                当前还没有流程绑定。等系统命中默认规则或后续补自定义绑定后，这里会成为 CTO 的正式配置入口。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">治理审计轨迹</CardTitle>
            <CardDescription>把能力草稿、需求、问题、运行和验证动作都收成正式时间线，方便 CTO 与业务负责人回看。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {capabilityAuditTimeline.length > 0 ? (
              capabilityAuditTimeline.map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-950">{event.summary}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {event.actorLabel ?? "工作目录"} · {formatTime(event.updatedAt)}
                      </div>
                    </div>
                    <Badge variant="secondary">{CAPABILITY_AUDIT_ACTION_LABEL[event.action]}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">{event.kindLabel}</Badge>
                    {event.appLabel ? <Badge variant="outline">App · {event.appLabel}</Badge> : null}
                    {event.skillLabel ? <Badge variant="outline">能力 · {event.skillLabel}</Badge> : null}
                  </div>
                  {event.detail ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                      {event.detail}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                当前还没有治理审计轨迹。等你在工作目录里登记能力、推进需求、反馈问题或触发运行后，这里会开始积累正式记录。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">能力草稿</CardTitle>
            <CardDescription>技术中台把可执行工具收成显式能力定义，避免它们只停留在会话里。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {skillDefinitions.length > 0 ? (
              skillDefinitions.map((skill) => {
                const nextStatus = nextSkillStatusByCurrent[skill.status];
                const releaseReadiness = buildSkillReleaseReadiness({
                  skill,
                  skillRuns,
                  workspaceApps,
                });
                return (
                  <div key={skill.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-950">{skill.title}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{skill.summary}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="secondary">{SKILL_STATUS_LABEL[skill.status]}</Badge>
                          <Badge variant="outline">{skill.entryPath}</Badge>
                          <Badge variant={releaseReadiness.publishable ? "default" : "secondary"}>
                            {releaseReadiness.publishable ? "可发布" : "待补齐"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-xs font-semibold text-slate-700">发布检查</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {releaseReadiness.checks.map((check) => (
                          <Badge key={check.id} variant={check.ok ? "default" : "outline"}>
                            {check.ok ? "已满足" : "待补齐"} · {check.label}
                          </Badge>
                        ))}
                      </div>
                      {releaseReadiness.latestSuccessfulSmokeTestRun ? (
                        <div className="mt-2 text-xs leading-5 text-slate-600">
                          最近一次能力验证：{formatTime(releaseReadiness.latestSuccessfulSmokeTestRun.updatedAt)}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs leading-5 text-slate-500">
                          当前还没有成功能力验证，发布为可用前至少需要先跑通一次能力验证。
                        </div>
                      )}
                    </div>
                    {nextStatus ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={skill.status === "retired"}
                          onClick={() => void onRunSkillSmokeTest(skill.id)}
                        >
                          运行能力验证
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={nextStatus === "ready" && !releaseReadiness.publishable}
                          onClick={() => void onUpdateSkillStatus(skill.id, nextStatus)}
                        >
                          {skillStatusActionLabel[skill.status]}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void onCreateCapabilityIssue({
                              type: "bad_result",
                              skillId: skill.id,
                              summary: `${skill.title} 返回结果异常，需要 CTO 复核`,
                            })
                          }
                        >
                          反馈结果异常
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                当前还没有登记过能力草稿。先从阅读器、一致性检查或审阅台里挑一项登记进去。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">能力运行台账</CardTitle>
            <CardDescription>每次触发都会先留下正式运行记录，后续真实执行引擎会继续复用这条台账。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentSkillRuns.length > 0 ? (
              recentSkillRuns.map((run) => (
                <div key={run.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-950">
                        {skillLabelById.get(run.skillId) ?? run.skillId}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {run.triggerLabel ?? "工作目录"} · {run.requestedByLabel ?? "待补触发人"} · {formatTime(run.updatedAt)}
                      </div>
                    </div>
                    <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>
                      {skillRunStatusLabel[run.status]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">{CAPABILITY_RUN_TRIGGER_LABEL[run.triggerType]}</Badge>
                    {run.executionMode ? (
                      <Badge variant="outline">{skillRunExecutionModeLabel[run.executionMode]}</Badge>
                    ) : null}
                    {run.executionEntryPath ? (
                      <Badge variant="outline" className="max-w-full truncate">
                        {run.executionEntryPath}
                      </Badge>
                    ) : null}
                    {typeof run.inputResourceCount === "number" ? (
                      <Badge variant="outline">输入 {run.inputResourceCount} 份资源</Badge>
                    ) : null}
                    {run.inputSchemaVersion ? <Badge variant="outline">Input v{run.inputSchemaVersion}</Badge> : null}
                    {run.executionNote ? <Badge variant="secondary">已自动回退</Badge> : null}
                    {run.outputArtifactIds?.length ? (
                      <Badge variant="outline">回写 {run.outputArtifactIds.length} 份产物</Badge>
                    ) : null}
                  </div>
                  {run.inputResourceTypes && run.inputResourceTypes.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {run.inputResourceTypes.map((resourceType) => (
                        <Badge key={resourceType} variant="outline">
                          输入 · {artifactResourceTypeLabel[resourceType] ?? resourceType}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {run.outputArtifactIds && run.outputArtifactIds.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {run.outputArtifactIds.map((artifactId) => {
                        const file = workspaceFileByArtifactId.get(artifactId);
                        return (
                          <Badge key={artifactId} variant="outline">
                            {file?.name ?? artifactId}
                          </Badge>
                        );
                      })}
                    </div>
                  ) : null}
                  {run.inputSummary ? (
                    <div className="mt-3 text-xs leading-5 text-slate-600">{run.inputSummary}</div>
                  ) : null}
                  {run.resultSummary ? (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                      {run.resultSummary}
                    </div>
                  ) : null}
                  {run.executionNote ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                      {run.executionNote}
                    </div>
                  ) : null}
                  {run.errorMessage ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                      {run.errorMessage}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                当前还没有能力运行记录。等阅读器或一致性中心真正触发一次能力后，这里会开始积累正式台账。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">能力需求</CardTitle>
            <CardDescription>业务负责人先筛选，再把明确需求流给 CTO，避免技术中台被零散想法打散。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CapabilityBoardSummary lanes={capabilityRequestBoard.lanes} />
            {capabilityRequests.length > 0 ? (
              capabilityRequestBoard.lanes.map((lane) => (
                <CapabilityBoardLaneSection
                  key={lane.id}
                  lane={lane}
                  emptyText="当前这一栏还没有请求。"
                  renderActions={(item) => {
                    const request = capabilityRequests.find((entry) => entry.id === item.id);
                    const nextStatus = request ? NEXT_CAPABILITY_REQUEST_STATUS[request.status] : undefined;
                    if (!request || !nextStatus) {
                      return null;
                    }
                    return (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void onUpdateCapabilityRequestStatus(request.id, nextStatus)}
                      >
                        {CAPABILITY_REQUEST_ACTION_LABEL[request.status]}
                      </Button>
                    );
                  }}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                当前还没有能力需求。可以先把阅读器或一致性检查登记成第一条请求。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">能力问题</CardTitle>
                <CardDescription>工具不可用、脚本报错、结果不可信，都应该在这里有正式记录。</CardDescription>
              </div>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() =>
                void onCreateCapabilityIssue({
                  summary: "当前公司应用出现问题，需要 CTO 跟进",
                  detail: "请补充报错现象、预期结果和复现步骤。",
                })
              }
            >
              记录一个新问题
            </Button>
            <CapabilityBoardSummary lanes={capabilityIssueBoard.lanes} />
            {capabilityIssues.length > 0 ? (
              capabilityIssueBoard.lanes.map((lane) => (
                <CapabilityBoardLaneSection
                  key={lane.id}
                  lane={lane}
                  emptyText="当前这一栏还没有问题。"
                  renderActions={(item) => {
                    const issue = capabilityIssues.find((entry) => entry.id === item.id);
                    const nextStatus = issue ? NEXT_CAPABILITY_ISSUE_STATUS[issue.status] : undefined;
                    if (!issue || !nextStatus) {
                      return null;
                    }
                    return (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void onUpdateCapabilityIssueStatus(issue.id, nextStatus)}
                      >
                        {CAPABILITY_ISSUE_ACTION_LABEL[issue.status]}
                      </Button>
                    );
                  }}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                当前还没有登记过能力问题。等工具开始被使用后，这里会成为 CTO 的修复回路。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WorkspaceEmbeddedAppSection({
  app,
  manifest,
  runtime,
  selectedFileContent,
  loadingFileKey,
  onSelectEmbeddedSection,
  onSelectEmbeddedFile,
  onRunAppManifestAction,
  onOpenCtoChat,
}: {
  app: WorkspaceAppSummary;
  manifest: WorkspaceAppManifest | null;
  runtime: WorkspaceEmbeddedAppRuntime<WorkspaceFileRow> | null;
  selectedFileContent: string;
  loadingFileKey: string | null;
  onSelectEmbeddedSection: (slot: string) => void;
  onSelectEmbeddedFile: (fileKey: string) => void;
  onRunAppManifestAction: (action: WorkspaceAppManifestAction) => void | Promise<void>;
  onOpenCtoChat: () => void;
}) {
  const sections = runtime?.sections ?? [];
  const activeSection = runtime?.activeSection ?? null;
  const activeSectionFiles = runtime?.visibleFiles ?? [];
  const totalScopedResources = runtime?.totalScopedResources ?? 0;
  const latestScopedFile = runtime?.latestFile ?? null;
  const lastAction = runtime?.lastAction ?? null;
  const selectedFile = runtime?.selectedFile ?? null;
  const hostMeta = runtime
    ? {
        title: runtime.hostTitle,
        description: runtime.hostDescription,
      }
    : {
        title: "嵌入式 App 宿主",
        description: "这个公司内 App 运行在受控宿主中，只能读取 manifest 范围内资源、保存轻量状态，并触发白名单动作。",
      };
  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{hostMeta.title}</CardTitle>
        <CardDescription>{hostMeta.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {!runtime || runtime.manifestStatus === "missing" ? <Badge variant="secondary">manifest 待接入</Badge> : null}
          {runtime?.manifestStatus === "bound" ? <Badge variant="outline">显式 manifest</Badge> : null}
          {runtime?.manifestStatus === "default" ? <Badge variant="secondary">默认 manifest</Badge> : null}
          {runtime ? <Badge variant="outline">host {runtime.hostKey}</Badge> : <Badge variant="outline">host 待配置</Badge>}
          {runtime ? <Badge variant="outline">动作 {runtime.permissions.actions}</Badge> : null}
          {runtime ? <Badge variant="outline">状态 {runtime.permissions.appState}</Badge> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">分区</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{sections.length}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">manifest 当前为 {app.title} 定义的交互区域。</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">可读资源</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{totalScopedResources}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">宿主只读取 manifest 范围内的资源，不直接扫全公司数据。</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">最近动作</div>
            <div className="mt-2 text-sm font-semibold text-slate-950">{lastAction?.label ?? "尚未触发"}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">动作仍然走白名单桥接，不允许直接写公司主数据。</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">最近更新</div>
            <div className="mt-2 text-sm font-semibold text-slate-950">{latestScopedFile?.name ?? "暂无"}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              {latestScopedFile ? `${latestScopedFile.agentLabel} · ${formatTime(latestScopedFile.updatedAtMs ?? 0)}` : "等资源进入这张 App 再展示。"}
            </div>
          </div>
        </div>

        {runtime ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {runtime.apis.map((api) => (
              <div key={api.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-sm font-semibold text-slate-950">{api.label}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{api.description}</div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {manifest?.actions?.map((action) => (
            <Button key={action.id} type="button" size="sm" variant="outline" onClick={() => void onRunAppManifestAction(action)}>
              {action.label}
            </Button>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={onOpenCtoChat}>
            打开 CTO 会话继续补齐
          </Button>
        </div>

        {sections.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
            <div className="space-y-3">
              {sections.map((section) => {
                const files = section.files;
                const active = activeSection?.slot === section.slot;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => onSelectEmbeddedSection(section.slot)}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
                      active ? "border-indigo-200 bg-indigo-50 text-indigo-950" : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{section.label}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          {files.length > 0 ? `当前有 ${files.length} 份资源进入这一区。` : section.emptyState ?? "当前还没有资源进入这一分区。"}
                        </div>
                      </div>
                      <Badge variant={active ? "default" : "outline"}>{files.length}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{activeSection?.label ?? "资源列表"}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      {activeSectionFiles.length > 0
                        ? "切换资源后，右侧会直接显示当前内容，不需要离开工作目录。"
                        : activeSection?.emptyState ?? "当前还没有资源进入这个区域。"}
                    </div>
                  </div>
                  <Badge variant="outline">{activeSectionFiles.length}</Badge>
                </div>
                <div className="mt-4 space-y-2">
                  {activeSectionFiles.length > 0 ? (
                    activeSectionFiles.map((file) => (
                      <button
                        key={file.key}
                        type="button"
                        onClick={() => onSelectEmbeddedFile(file.key)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                          selectedFile?.key === file.key
                            ? "border-indigo-200 bg-indigo-50 text-indigo-950"
                            : "border-slate-200 bg-slate-50 hover:bg-slate-100",
                        )}
                      >
                        <div className="text-sm font-medium">{file.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{formatWorkspaceFileKindLabel(file)} · {file.agentLabel} · {formatTime(file.updatedAtMs ?? 0)}</span>
                          {file.resourceOrigin === "inferred" ? (
                            <Badge variant="outline">{resourceOriginLabel[file.resourceOrigin]}</Badge>
                          ) : null}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      当前没有可读资源。等能力执行或业务团队把结果写回后，这里会直接出现。
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                {selectedFile ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-slate-950">{selectedFile.name}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          {selectedFile.path} · {selectedFile.agentLabel}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{formatWorkspaceFileKindLabel(selectedFile)}</Badge>
                        <Badge variant="outline">{selectedFile.resourceType}</Badge>
                        <Badge variant={selectedFile.resourceOrigin === "inferred" ? "outline" : "secondary"}>
                          {resourceOriginLabel[selectedFile.resourceOrigin]}
                        </Badge>
                      </div>
                    </div>
                    {selectedFile.resourceOrigin === "inferred" ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                        这份资源目前来自系统推断，只适合展示和草案生成；如果要用于正式检查、预检或流程判断，请先补显式标签或接入 AppManifest。
                      </div>
                    ) : null}
                    <div className="max-h-[560px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                      {loadingFileKey === selectedFile.key ? (
                        <div className="text-sm text-slate-500">正在读取这份资源的正文...</div>
                      ) : selectedFileContent.trim().length > 0 ? (
                        <div className="prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-pre:overflow-x-auto">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedFileContent}</ReactMarkdown>
                        </div>
                      ) : selectedFile.previewText ? (
                        <div className="text-sm leading-7 text-slate-700">{selectedFile.previewText}</div>
                      ) : (
                        <div className="text-sm text-slate-500">这份资源当前还没有正文镜像，可先去来源文件或等待能力补全文本。</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm leading-6 text-slate-500">
                    当前还没有选中的资源。先从左侧分区挑一份报告、状态文件或数据结果。
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-500">
            这张 App 还没有定义 manifest sections。先给它生成或校准 AppManifest，宿主才能知道该展示哪些资源。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkspacePageContent(props: WorkspacePageContentProps) {
  const {
    activeCompanyName,
    workspaceApps,
    workspaceAppsAreExplicit,
    selectedApp,
    selectedAppManifest,
    artifactBackedWorkspaceCount,
    mirroredOnlyWorkspaceCount,
    shouldSyncProviderWorkspace,
    workspacePolicySummary,
    workflowCapabilityBindingCatalog,
    workflowCapabilityBindingsAreExplicit,
    workflowCapabilityBindings,
    chapterFiles,
    canonFiles,
    capabilityIssues,
    capabilityRequests,
    capabilityAuditEvents,
    manifestRegistrationCandidateCount,
    knowledgeItems,
    businessLeadLabel,
    ctoLabel,
    publishedAppTemplates,
    skillRuns,
    skillDefinitions,
    loadingIndex,
    executorProvisioning,
    onRefreshIndex,
    onRetryCompanyProvisioning,
    onRunAppManifestAction,
    onSelectApp,
    onTriggerSkill,
    onOpenCtoWorkbench,
    onRegisterExistingApp,
    onPublishRecommendedApps,
    onOpenCtoChat,
    onOpenRequirementCenter,
  } = props;
  const selectedAppTemplate = resolveWorkspaceAppTemplate(selectedApp);
  const selectedAppSurface = resolveWorkspaceAppSurface(selectedApp);
  const novelReaderAppId =
    workspaceApps.find((app) => resolveWorkspaceAppTemplate(app) === "reader")?.id ?? "novel-reader";

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.08),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.08),_transparent_28%)] p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {executorProvisioning && executorProvisioning.state !== "ready" ? (
          <Card className="border-amber-200 bg-amber-50/80 shadow-sm">
            <CardContent className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                  <AlertTriangle className="h-4 w-4" />
                  执行器仍在补齐
                </div>
                <div className="text-sm leading-6 text-amber-950/90">
                  这家公司已经创建成功，工作目录和公司应用可以继续使用；只是 OpenClaw agent 还在补齐，所以部分能力暂时可能回退或不可用。
                </div>
                {executorProvisioning.lastError ? (
                  <div className="text-xs leading-5 text-amber-900/80">
                    最近原因：{executorProvisioning.lastError}
                  </div>
                ) : null}
              </div>
              <Button type="button" variant="outline" onClick={() => void onRetryCompanyProvisioning()}>
                重试补齐执行器
              </Button>
            </CardContent>
          </Card>
        ) : null}
        <Card className="overflow-hidden border-slate-200/80 shadow-sm">
          <CardContent className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">当前公司专属</Badge>
                <Badge variant="outline">只对 {activeCompanyName} 可见</Badge>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">工作目录</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  把当前公司的专属工具、产品产物和 CTO 工具需求收进一个页面里。这里会承载查看器、规则与校验、知识与验收和工具工坊等正式入口；底层工作区文件只作为补充镜像，不再是主真相源。
                </p>
                {!workspaceAppsAreExplicit ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                    当前这些入口还是系统补位推荐，方便你先验证方向。点一下“固化推荐应用”后，它们才会正式挂到这家公司里，后续 CTO 产出的查看器、新页面或校验工具也会继续沿着这条显式链路发布。
                    
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                {onOpenRequirementCenter ? (
                  <Button type="button" variant="outline" onClick={onOpenRequirementCenter}>
                    <BookOpenCheck className="mr-2 h-4 w-4" />
                    返回需求中心
                  </Button>
                ) : null}
                <Button type="button" onClick={() => onOpenCtoWorkbench("consistency-checker")}>
                  发起规则校验能力需求
                </Button>
                <Button type="button" variant="outline" onClick={() => onOpenCtoWorkbench("novel-reader")}>
                  发起内容查看 App 需求
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onRegisterExistingApp()}
                  disabled={manifestRegistrationCandidateCount === 0}
                >
                  {manifestRegistrationCandidateCount > 0 ? "注册已有 App/Page" : "暂无可注册的 AppManifest"}
                </Button>
                {onPublishRecommendedApps ? (
                  <Button type="button" variant="secondary" onClick={() => void onPublishRecommendedApps()}>
                    固化推荐应用
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">公司应用</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{workspaceApps.length}</div>
                <div className="mt-1 text-sm text-slate-600">当前公司已经启用的专属菜单与工具入口。</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">产品产物索引</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{artifactBackedWorkspaceCount}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {shouldSyncProviderWorkspace
                    ? `当前可直接消费的产品产物 ${artifactBackedWorkspaceCount} 份；镜像补充 ${mirroredOnlyWorkspaceCount} 份，仅在产物缺位时兜底。`
                    : workspacePolicySummary.mirrorEnabled
                      ? "当前后端暂未提供文件区，工作目录直接读取产品侧产物库。"
                      : "镜像补位已在公司策略里关闭，工作目录只读取正式产品产物。"}
                </div>
              </div>
              <div className="rounded-2xl border border-violet-200 bg-violet-50/50 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">工作目录边界</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">{workspacePolicySummary.deliveryLabel}</Badge>
                  <Badge variant="outline">{workspacePolicySummary.mirrorLabel}</Badge>
                  <Badge variant="outline">{workspacePolicySummary.executionLabel}</Badge>
                </div>
                <div className="mt-2 text-sm text-slate-600">{workspacePolicySummary.mirrorDescription}</div>
                <div className="mt-1 text-xs text-slate-500">{workspacePolicySummary.executionDescription}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">当前可读业务文档</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{chapterFiles.length + canonFiles.length}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {chapterFiles.length + canonFiles.length > 0
                    ? "当前公司已经有可直接阅读的正文与设定文件。"
                    : "当前公司还没把正文/设定稳定固化进 workspace，这正是 CTO 下一步该补的能力。"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">当前 CTO</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{ctoLabel ?? "尚未配置"}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {ctoLabel
                    ? `${ctoLabel} 负责公司专属工具方向。`
                    : "需要一个 CTO 节点来承接公司工具开发。"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">技术中台回路</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {skillDefinitions.length}/{skillRuns.length}/{capabilityRequests.length}/{capabilityIssues.length}
                </div>
                <div className="mt-1 text-sm text-slate-600">能力 / 运行 / 需求 / 问题 已经都能在工作目录里被追踪。</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">公司应用</CardTitle>
              <CardDescription>只显示当前公司的专属菜单和工具，不影响其他公司。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspaceApps.map((app) => (
                <button
                  type="button"
                  key={app.id}
                  onClick={() => onSelectApp(app.id)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
                    selectedApp.id === app.id
                      ? "border-indigo-200 bg-indigo-50 text-indigo-950"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-xl">{app.icon}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold">{app.title}</div>
                        <Badge variant={app.status === "ready" ? "default" : "secondary"}>
                          {app.status === "ready" ? "可直接使用" : "建议继续建设"}
                        </Badge>
                        {!workspaceAppsAreExplicit ? <Badge variant="outline">系统补位</Badge> : null}
                        {resolveWorkspaceAppSurface(app) === "embedded" ? (
                          <Badge variant="outline">嵌入式</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{app.description}</div>
                    </div>
                  </div>
                </button>
              ))}
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-500">
                后续 CTO 为当前公司做出来的新工具，也应该继续挂在这里，而不是混进所有公司的公共菜单里。
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={onOpenCtoChat} disabled={!ctoLabel}>
                直接打开 CTO 会话
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {renderWorkspaceAppIcon(selectedAppTemplate)}
                      {selectedApp.title}
                    </CardTitle>
                    <CardDescription className="mt-2 max-w-3xl leading-6">{selectedApp.description}</CardDescription>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline">{workspacePolicySummary.deliveryLabel}</Badge>
                      <Badge variant="outline">{workspacePolicySummary.mirrorLabel}</Badge>
                      <Badge variant="outline">{workspacePolicySummary.executionLabel}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">产品产物优先</Badge>
                    <Badge variant="secondary">{artifactBackedWorkspaceCount} 份产物</Badge>
                    {selectedAppManifest ? (
                      <Badge variant="outline">{selectedAppManifest.draft ? "manifest 草案" : "manifest 已接入"}</Badge>
                    ) : (
                      <Badge variant="secondary">manifest 待接入</Badge>
                    )}
                    {selectedAppTemplate === "knowledge" ? (
                      <Badge variant="outline">{knowledgeItems.length} 条知识</Badge>
                    ) : null}
                    {selectedAppSurface === "embedded" ? <Badge variant="outline">嵌入式 App</Badge> : null}
                    {shouldSyncProviderWorkspace && mirroredOnlyWorkspaceCount > 0 ? (
                      <Badge variant="outline">镜像补充 {mirroredOnlyWorkspaceCount}</Badge>
                    ) : !workspacePolicySummary.mirrorEnabled ? (
                      <Badge variant="secondary">镜像补位已关闭</Badge>
                    ) : null}
                    <Button type="button" size="sm" variant="outline" onClick={onRefreshIndex} disabled={loadingIndex}>
                      <RefreshCcw className={cn("mr-2 h-4 w-4", loadingIndex && "animate-spin")} />
                      刷新索引
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {selectedAppManifest?.actions?.map((action) => (
                    <Button
                      key={action.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onRunAppManifestAction(action)}
                    >
                      {action.label}
                    </Button>
                  ))}
                  {!selectedAppManifest ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => void props.onGenerateAppManifestDraft()}>
                      生成 AppManifest 草案
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <WorkflowCapabilitySection
              workflowCapabilityBindings={workflowCapabilityBindings}
              onSelectApp={onSelectApp}
              onPublishTemplateApp={props.onPublishTemplateApp}
              onTriggerSkill={onTriggerSkill}
            />

            <SelectedAppGovernanceSection
              selectedApp={selectedApp}
              capabilityRequests={capabilityRequests}
              capabilityIssues={capabilityIssues}
              onOpenCtoChat={onOpenCtoChat}
              onUpdateCapabilityRequestStatus={props.onUpdateCapabilityRequestStatus}
              onUpdateCapabilityIssueStatus={props.onUpdateCapabilityIssueStatus}
            />

            {selectedAppSurface === "embedded" || selectedAppTemplate === "review-console" || selectedAppTemplate === "dashboard" ? (
              <WorkspaceEmbeddedAppSection
                app={selectedApp}
                manifest={selectedAppManifest}
                runtime={props.embeddedRuntime}
                selectedFileContent={props.selectedFileContent}
                loadingFileKey={props.loadingFileKey}
                onSelectEmbeddedSection={props.onSelectEmbeddedSection}
                onSelectEmbeddedFile={props.onSelectEmbeddedFile}
                onRunAppManifestAction={props.onRunAppManifestAction}
                onOpenCtoChat={onOpenCtoChat}
              />
            ) : null}
            {selectedAppSurface === "template" && selectedAppTemplate === "reader" ? (
              <WorkspaceReaderSection {...props} />
            ) : null}
            {selectedAppSurface === "template" && selectedAppTemplate === "consistency" ? (
              <WorkspaceConsistencyHub
                anchors={props.anchors}
                chapterFiles={props.chapterFiles}
                reviewFiles={props.reviewFiles}
                toolingFiles={props.toolingFiles}
                onOpenCtoWorkbench={props.onOpenCtoWorkbench}
                onOpenNovelReader={() => props.onSelectApp(novelReaderAppId)}
              />
            ) : null}
            {selectedAppSurface === "template" && selectedAppTemplate === "knowledge" ? (
              <WorkspaceKnowledgeHub {...props} />
            ) : null}
            {selectedAppSurface === "template" && selectedAppTemplate === "workbench" ? (
              <WorkspaceWorkbench
                ctoLabel={ctoLabel}
                businessLeadLabel={businessLeadLabel}
                workflowCapabilityBindingCatalog={workflowCapabilityBindingCatalog}
                workflowCapabilityBindingsAreExplicit={workflowCapabilityBindingsAreExplicit}
                skillDefinitions={skillDefinitions}
                skillRuns={skillRuns}
                workspaceApps={workspaceApps}
                workspaceFiles={props.workspaceFiles}
                executorProvisioning={executorProvisioning}
                capabilityRequests={capabilityRequests}
                capabilityIssues={capabilityIssues}
                capabilityAuditEvents={capabilityAuditEvents}
                manifestRegistrationCandidateCount={manifestRegistrationCandidateCount}
                onSelectApp={props.onSelectApp}
                onOpenCtoWorkbench={props.onOpenCtoWorkbench}
                onPublishTemplateApp={props.onPublishTemplateApp}
                onRegisterExistingApp={props.onRegisterExistingApp}
                onCreateSkillDraft={props.onCreateSkillDraft}
                onGenerateAppManifestDraft={props.onGenerateAppManifestDraft}
                onCreateCapabilityRequest={props.onCreateCapabilityRequest}
                onCreateCapabilityIssue={props.onCreateCapabilityIssue}
                onRetryCompanyProvisioning={props.onRetryCompanyProvisioning}
                onUpdateSkillStatus={props.onUpdateSkillStatus}
                onRunSkillSmokeTest={props.onRunSkillSmokeTest}
                onPublishWorkflowCapabilityBindings={props.onPublishWorkflowCapabilityBindings}
                onRestoreWorkflowCapabilityBindings={props.onRestoreWorkflowCapabilityBindings}
                onToggleWorkflowCapabilityBindingRequired={props.onToggleWorkflowCapabilityBindingRequired}
                onUpdateCapabilityRequestStatus={props.onUpdateCapabilityRequestStatus}
                onUpdateCapabilityIssueStatus={props.onUpdateCapabilityIssueStatus}
                publishedAppTemplates={publishedAppTemplates}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
