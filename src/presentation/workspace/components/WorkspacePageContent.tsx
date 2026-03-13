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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatKnowledgeKindLabel } from "../../../application/artifact/shared-knowledge";
import {
  resolveWorkspaceAppSurface,
  resolveWorkspaceAppTemplate,
} from "../../../application/company/workspace-apps";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  type WorkspaceAppManifest,
  type WorkspaceAppManifestAction,
  RESOURCE_KIND_LABEL,
  isWorkspaceReaderManifestDraft,
  type WorkspaceReaderManifest,
  WORKBENCH_TOOL_CARDS,
  formatWorkspaceBytes,
  type WorkspaceReaderIndex,
  type WorkspaceFileRow,
  type WorkspaceWorkbenchTool,
} from "../../../application/workspace";
import type { SharedKnowledgeItem } from "../../../domain/artifact/types";
import type {
  CapabilityIssueRecord,
  CapabilityIssueStatus,
  CapabilityRequestRecord,
  CapabilityRequestStatus,
  CompanyWorkspaceAppKind,
  CompanyWorkspaceAppStatus,
  CompanyWorkspaceAppSurface,
  CompanyWorkspaceAppTemplate,
  SkillDefinition,
  SkillDefinitionStatus,
  SkillRunRecord,
  SkillRunStatus,
} from "../../../domain/org/types";
import { cn, formatTime } from "../../../lib/utils";

type WorkspaceAppSummary = {
  id: string;
  kind: CompanyWorkspaceAppKind;
  icon: string;
  title: string;
  description: string;
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
  ctoLabel: string | null;
  businessLeadLabel: string | null;
  skillDefinitions: SkillDefinition[];
  skillRuns: SkillRunRecord[];
  capabilityRequests: CapabilityRequestRecord[];
  capabilityIssues: CapabilityIssueRecord[];
  publishedAppTemplates: CompanyWorkspaceAppTemplate[];
  loadingIndex: boolean;
  onRefreshIndex: () => void;
  onRunAppManifestAction: (action: WorkspaceAppManifestAction) => void | Promise<void>;
  onSelectApp: (appId: string) => void;
  onSelectFile: (fileKey: string) => void;
  onSelectKnowledge: (knowledgeId: string) => void;
  onOpenCtoWorkbench: (tool: WorkspaceWorkbenchTool) => void;
  onPublishTemplateApp: (template: "reader" | "consistency" | "review-console") => void | Promise<void>;
  onGenerateAppManifestDraft: () => void | Promise<void>;
  onCreateSkillDraft: (tool: WorkspaceWorkbenchTool) => void | Promise<void>;
  onCreateCapabilityRequest: (tool: WorkspaceWorkbenchTool) => void | Promise<void>;
  onCreateCapabilityIssue: (input?: {
    type?: CapabilityIssueRecord["type"];
    summary?: string;
    detail?: string;
    appId?: string | null;
    skillId?: string | null;
  }) => void | Promise<void>;
  onUpdateSkillStatus: (skillId: string, status: SkillDefinitionStatus) => void | Promise<void>;
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
  }
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
                {readerIndex.lastOpenedFile ? `${RESOURCE_KIND_LABEL[readerIndex.lastOpenedFile.kind]} · 继续打开` : "第一次进入时会自动记录"}
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
                          {RESOURCE_KIND_LABEL[file.kind]} · {formatTime(file.updatedAtMs)}
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
                <Badge variant="secondary">{RESOURCE_KIND_LABEL[selectedFile.kind]}</Badge>
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
            <CardDescription>章节正文</CardDescription>
            <CardTitle>{chapterFiles.length} 份可读正文</CardTitle>
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
            <CardDescription>如果你要把这家公司做成真正可运营的创作系统，下一步优先级应该这样排。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              先把共享设定库、时间线、伏笔追踪做成可检索的唯一真相源，再让 CTO 基于这些文件开发一致性工具。
            </div>
            <Button type="button" className="w-full" onClick={() => onOpenCtoWorkbench("consistency-checker")}>
              让 CTO 开发一致性工具
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={onOpenNovelReader}>
              先去小说阅读器查看关键文件
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WorkspaceWorkbench({
  ctoLabel,
  businessLeadLabel,
  skillDefinitions,
  skillRuns,
  capabilityRequests,
  capabilityIssues,
  onOpenCtoWorkbench,
  onPublishTemplateApp,
  onCreateSkillDraft,
  onCreateCapabilityRequest,
  onCreateCapabilityIssue,
  onUpdateSkillStatus,
  onUpdateCapabilityRequestStatus,
  onUpdateCapabilityIssueStatus,
  publishedAppTemplates,
}: Pick<
  WorkspacePageContentProps,
  | "ctoLabel"
  | "businessLeadLabel"
  | "skillDefinitions"
  | "skillRuns"
  | "capabilityRequests"
  | "capabilityIssues"
  | "onOpenCtoWorkbench"
  | "onPublishTemplateApp"
  | "onCreateSkillDraft"
  | "onCreateCapabilityRequest"
  | "onCreateCapabilityIssue"
  | "onUpdateSkillStatus"
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
  const nextRequestStatusByCurrent: Partial<Record<CapabilityRequestStatus, CapabilityRequestStatus>> = {
    open: "triaged",
    triaged: "building",
    building: "ready",
    ready: "verified",
    verified: "closed",
  };
  const nextIssueStatusByCurrent: Partial<Record<CapabilityIssueStatus, CapabilityIssueStatus>> = {
    open: "acknowledged",
    acknowledged: "fixing",
    fixing: "ready_for_verify",
    ready_for_verify: "verified",
    verified: "closed",
  };
  const nextSkillStatusByCurrent: Partial<Record<SkillDefinitionStatus, SkillDefinitionStatus>> = {
    draft: "ready",
    ready: "degraded",
    degraded: "ready",
    retired: "draft",
  };
  const skillStatusActionLabel: Record<SkillDefinitionStatus, string> = {
    draft: "发布为 ready",
    ready: "标记降级",
    degraded: "恢复 ready",
    retired: "恢复草稿",
  };
  const requestStatusActionLabel: Record<CapabilityRequestStatus, string> = {
    open: "转 CTO 评估",
    triaged: "标记建设中",
    building: "标记 ready",
    ready: "标记已验证",
    verified: "归档关闭",
    closed: "已关闭",
  };
  const issueStatusActionLabel: Record<CapabilityIssueStatus, string> = {
    open: "先确认问题",
    acknowledged: "开始修复",
    fixing: "转待验证",
    ready_for_verify: "标记已验证",
    verified: "归档关闭",
    closed: "已关闭",
  };
  const skillRunStatusLabel: Record<SkillRunStatus, string> = {
    pending: "排队中",
    running: "运行中",
    succeeded: "已成功",
    failed: "已失败",
    cancelled: "已取消",
  };
  const recentSkillRuns = [...skillRuns].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 6);
  const skillLabelById = new Map(skillDefinitions.map((skill) => [skill.id, skill.title]));

  return (
    <div className="space-y-5">
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
                  这条线会先由 {businessLeadLabel ?? "业务负责人"} 提需求，再交给 {ctoLabel ?? "CTO"} 做成 Skill、App 或资源契约。
                </div>
                {publishableTemplate ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isPublished}
                    onClick={() => void onPublishTemplateApp(publishableTemplate)}
                  >
                    {isPublished ? "已发布到公司应用" : "直接发布到工作目录"}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" className="w-full" onClick={() => void onCreateSkillDraft(card.id)}>
                  登记 Skill 草稿
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
            <CardTitle className="text-base">Skill 草稿</CardTitle>
            <CardDescription>技术中台把可执行能力收成显式 Skill，避免它们只停留在会话里。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {skillDefinitions.length > 0 ? (
              skillDefinitions.map((skill) => {
                const nextStatus = nextSkillStatusByCurrent[skill.status];
                return (
                  <div key={skill.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-950">{skill.title}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{skill.summary}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="secondary">{skill.status}</Badge>
                          <Badge variant="outline">{skill.entryPath}</Badge>
                        </div>
                      </div>
                    </div>
                    {nextStatus ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
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
                当前还没有登记过 Skill 草稿。先从阅读器、一致性检查或审阅台里挑一项登记进去。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Skill 运行台账</CardTitle>
            <CardDescription>每次触发都先留下正式 run 记录，后续真实执行引擎会继续复用这条台账。</CardDescription>
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
                    <Badge variant="outline">{run.triggerType}</Badge>
                    {run.outputArtifactIds?.length ? (
                      <Badge variant="outline">回写 {run.outputArtifactIds.length} 份产物</Badge>
                    ) : null}
                  </div>
                  {run.inputSummary ? (
                    <div className="mt-3 text-xs leading-5 text-slate-600">{run.inputSummary}</div>
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
                当前还没有 Skill 运行记录。等阅读器或一致性中心真正触发一次 skill 后，这里会开始积累正式台账。
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
            {capabilityRequests.length > 0 ? (
              capabilityRequests.map((request) => {
                const nextStatus = nextRequestStatusByCurrent[request.status];
                return (
                  <div key={request.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-sm font-semibold text-slate-950">{request.summary}</div>
                    {request.detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{request.detail}</div> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary">{request.status}</Badge>
                      {request.requesterLabel ? <Badge variant="outline">提出方 {request.requesterLabel}</Badge> : null}
                    </div>
                    {nextStatus ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void onUpdateCapabilityRequestStatus(request.id, nextStatus)}
                        >
                          {requestStatusActionLabel[request.status]}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
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
            {capabilityIssues.length > 0 ? (
              capabilityIssues.map((issue) => {
                const nextStatus = nextIssueStatusByCurrent[issue.status];
                return (
                  <div key={issue.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-sm font-semibold text-slate-950">{issue.summary}</div>
                    {issue.detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{issue.detail}</div> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary">{issue.status}</Badge>
                      <Badge variant="outline">{issue.type}</Badge>
                    </div>
                    {nextStatus ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void onUpdateCapabilityIssueStatus(issue.id, nextStatus)}
                        >
                          {issueStatusActionLabel[issue.status]}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
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
  onOpenCtoChat,
}: {
  app: WorkspaceAppSummary;
  onOpenCtoChat: () => void;
}) {
  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">嵌入式 App 预留位</CardTitle>
        <CardDescription>
          {app.title} 已经以嵌入式公司应用的形式挂载。第一版宿主会让它直接读取公司产物、保存轻量状态，并只在显式动作时调用脚本。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700">
          这类 App 适合小说阅读器、游戏模拟器这类需要交互状态的页面。当前壳子已经预留入口，但具体运行时还需要 CTO 把页面 bundle 和数据契约补齐。
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {app.manifestArtifactId ? <Badge variant="outline">manifest 已绑定</Badge> : <Badge variant="secondary">manifest 待绑定</Badge>}
          {app.embeddedHostKey ? <Badge variant="outline">host {app.embeddedHostKey}</Badge> : <Badge variant="outline">host 待配置</Badge>}
          {app.embeddedPermissions ? <Badge variant="outline">动作 {app.embeddedPermissions.actions}</Badge> : null}
        </div>
        <Button type="button" variant="outline" onClick={onOpenCtoChat}>
          打开 CTO 会话继续补齐
        </Button>
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
    chapterFiles,
    canonFiles,
    capabilityIssues,
    capabilityRequests,
    knowledgeItems,
    businessLeadLabel,
    ctoLabel,
    publishedAppTemplates,
    skillRuns,
    skillDefinitions,
    loadingIndex,
    onRefreshIndex,
    onRunAppManifestAction,
    onSelectApp,
    onOpenCtoWorkbench,
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
                  把当前公司的专属工具、产品产物和 CTO 工具需求收进一个页面里。对小说公司来说，这里就是阅读器、一致性中心和工具开发工坊的统一入口；底层工作区文件只作为补充镜像，不再是主真相源。
                </p>
                {!workspaceAppsAreExplicit ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                    当前这些入口还是系统补位推荐，方便你先验证方向。点一下“固化推荐应用”后，它们才会正式挂到这家公司里，后续 CTO 产出的阅读器或新页面也会继续沿着这条显式链路发布。
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
                  让 CTO 开发一致性工具
                </Button>
                <Button type="button" variant="outline" onClick={() => onOpenCtoWorkbench("novel-reader")}>
                  让 CTO 开发小说阅读器
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
                    : "当前后端不提供文件区，工作目录直接读取产品侧产物库。"}
                </div>
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
                <div className="mt-1 text-sm text-slate-600">Skill / 运行 / 需求 / 问题 已经都能在工作目录里被追踪。</div>
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

            {selectedAppSurface === "embedded" ? (
              <WorkspaceEmbeddedAppSection app={selectedApp} onOpenCtoChat={onOpenCtoChat} />
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
                skillDefinitions={skillDefinitions}
                skillRuns={skillRuns}
                capabilityRequests={capabilityRequests}
                capabilityIssues={capabilityIssues}
                onOpenCtoWorkbench={props.onOpenCtoWorkbench}
                onPublishTemplateApp={props.onPublishTemplateApp}
                onCreateSkillDraft={props.onCreateSkillDraft}
                onCreateCapabilityRequest={props.onCreateCapabilityRequest}
                onCreateCapabilityIssue={props.onCreateCapabilityIssue}
                onUpdateSkillStatus={props.onUpdateSkillStatus}
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
