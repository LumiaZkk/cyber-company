import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useArtifactApp } from "../../application/artifact";
import {
  applyWorkspaceAppManifest,
  buildCapabilityPlatformCloseoutSnapshot,
  buildCapabilityPlatformCloseoutSummary,
  buildSkillReleaseReadiness,
  buildWorkspaceAppManifestDraft,
  buildWorkspaceReaderIndex,
  buildWorkspaceWorkbenchRequest,
  getKnowledgeSourceFilesForItem,
  getCompanyWorkflowCapabilityBindings,
  hasStoredWorkflowCapabilityBindings,
  isWorkspaceEmbeddedAppSnapshotEqual,
  loadWorkspaceEmbeddedAppSnapshot,
  loadWorkspaceReaderSnapshot,
  pickDefaultWorkspaceFile,
  recordWorkspaceFileVisit,
  readWorkspaceAppManifestRegistrationMeta,
  resolveWorkspaceEmbeddedAppRuntime,
  resolveWorkspaceSkillExecutionFromScriptRun,
  resolveWorkflowCapabilityBindings,
  runWorkspaceSkill,
  isCapabilityPlatformCloseoutSnapshotEqual,
  saveWorkspaceEmbeddedAppSnapshot,
  saveWorkspaceReaderSnapshot,
  useWorkspaceFileContent,
  useWorkspaceViewModel,
  withWorkspaceEmbeddedAppSelection,
  withWorkspaceSelection,
  WORKBENCH_TOOL_CARDS,
  type WorkspaceScriptExecutionAttempt,
  type WorkspaceAppManifestAction,
  type WorkspaceReaderPageSnapshot,
  type WorkspaceWorkbenchTool,
  type ResolvedWorkflowCapabilityBinding,
} from "../../application/workspace";
import {
  buildRecommendedWorkspaceApps,
  publishWorkspaceApp,
  registerWorkspaceApp,
  resolveWorkspaceAppSurface,
  resolveWorkspaceAppTemplate,
} from "../../application/company/workspace-apps";
import { gateway } from "../../application/gateway";
import { useOrgApp } from "../../application/org";
import { toast } from "../../components/system/toast-store";
import { usePageVisibility } from "../../lib/use-page-visibility";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import type { ArtifactResourceType } from "../../domain/artifact/types";
import type {
  CapabilityIssueRecord,
  CapabilityIssueStatus,
  CapabilityRequestRecord,
  CapabilityRequestStatus,
  Company,
  CompanyWorkspaceApp,
  CompanyWorkspaceAppTemplate,
  EmployeeRef,
  SkillDefinitionStatus,
  WorkflowCapabilityBinding,
} from "../../domain/org/types";
import type { AuthorityAgentFileRunResponse } from "../../infrastructure/authority/contract";
import { useCompanyRuntimeCommands } from "../../infrastructure/company/runtime/commands";
import { WorkspacePageContent } from "./components/WorkspacePageContent";

type SkillSeed = {
  id: string;
  tool: WorkspaceWorkbenchTool;
  appTemplate: CompanyWorkspaceAppTemplate;
  title: string;
  summary: string;
  entryPath: string;
  writesResourceTypes: ArtifactResourceType[];
  manifestActionIds: string[];
  requestType: CapabilityRequestRecord["type"];
  smokeTest: string;
};

const WORKBENCH_TOOL_SET = new Set<WorkspaceWorkbenchTool>(
  WORKBENCH_TOOL_CARDS.map((card) => card.id),
);

const WORKBENCH_SKILL_SEEDS: Record<WorkspaceWorkbenchTool, SkillSeed> = {
  "novel-reader": {
    id: "reader.build-index",
    tool: "novel-reader",
    appTemplate: "reader",
    title: "重建阅读索引",
    summary: "把当前公司的主体内容、参考资料和报告重新整理成查看器可直接消费的资源清单。",
    entryPath: "scripts/build-reader-index.ts",
    writesResourceTypes: ["document", "report"],
    manifestActionIds: ["trigger-reader-index"],
    requestType: "app",
    smokeTest: "验证当前公司至少能产出一份主体内容/参考资料/报告索引。",
  },
  "consistency-checker": {
    id: "consistency.check",
    tool: "consistency-checker",
    appTemplate: "consistency",
    title: "执行一致性检查",
    summary: "围绕唯一真相源、关键规则和状态流转做结构化校验，并输出检查报告。",
    entryPath: "scripts/run-consistency-check.ts",
    writesResourceTypes: ["report"],
    manifestActionIds: ["trigger-consistency-check"],
    requestType: "check",
    smokeTest: "使用一份主体内容和一份参考资料跑通一次检查并输出报告。",
  },
  "chapter-review-console": {
    id: "review.precheck",
    tool: "chapter-review-console",
    appTemplate: "review-console",
    title: "执行发布前检查",
    summary: "在评审、验收或交付前生成检查结果，帮助业务负责人快速判断是否可推进。",
    entryPath: "scripts/run-review-precheck.ts",
    writesResourceTypes: ["report"],
    manifestActionIds: ["trigger-review-precheck"],
    requestType: "app",
    smokeTest: "对当前公司至少生成一份可读预检报告。",
  },
};

function getAppManifestFileName(app: Pick<CompanyWorkspaceApp, "slug">) {
  return `workspace-app-manifest.${app.slug}.json`;
}

function getAppManifestArtifactId(companyId: string, appId: string) {
  return `workspace-app-manifest:${companyId}:${appId}`;
}

function isWorkbenchTool(value: string): value is WorkspaceWorkbenchTool {
  return WORKBENCH_TOOL_SET.has(value as WorkspaceWorkbenchTool);
}

function isCapabilityIssueType(value: unknown): value is CapabilityIssueRecord["type"] {
  return value === "unavailable" || value === "runtime_error" || value === "bad_result";
}

function findBusinessLead(company: Company, workItemOwnerActorId?: string | null): EmployeeRef | null {
  if (workItemOwnerActorId) {
    const owner = company.employees.find((employee) => employee.agentId === workItemOwnerActorId) ?? null;
    if (owner && owner.metaRole !== "cto") {
      return owner;
    }
  }
  return (
    company.employees.find((employee) => employee.metaRole === "coo") ??
    company.employees.find((employee) => employee.metaRole === "ceo") ??
    company.employees.find((employee) => !employee.isMeta) ??
    company.employees[0] ??
    null
  );
}

export function WorkspacePresentationPage() {
  const navigate = useNavigate();
  const isPageVisible = usePageVisibility();
  const prefillSequenceRef = useRef(0);
  const { updateCompany } = useOrgApp();
  const { upsertArtifactRecord } = useArtifactApp();
  const {
    upsertCapabilityIssue,
    upsertCapabilityRequest,
    upsertCapabilityAuditEvent,
    retryCompanyProvisioning,
    upsertSkillDefinition,
    upsertSkillRun,
  } = useCompanyRuntimeCommands();
  const {
    activeCompany,
    activeWorkspaceWorkItem,
    agentLabelById,
    anchors,
    artifactBackedWorkspaceCount,
    canonFiles,
    chapterFiles,
    ctoEmployee,
    knowledgeFiles,
    knowledgeItems,
    loadingIndex,
    mirroredOnlyWorkspaceCount,
    readerManifest,
    refreshIndex,
    reviewFiles,
    shouldSyncProviderWorkspace,
    supplementaryFiles,
    toolingFiles,
    workspacePolicySummary,
    workspaceAppManifestsById,
    workspaceApps,
    workspaceAppsAreExplicit,
    workspaceFiles,
  } = useWorkspaceViewModel({ isPageVisible });
  const activeCompanyId = activeCompany?.id ?? null;
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<string | null>(null);
  const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);
  const [readerSnapshot, setReaderSnapshot] = useState<WorkspaceReaderPageSnapshot>(() =>
    loadWorkspaceReaderSnapshot(null),
  );
  const [embeddedAppSnapshot, setEmbeddedAppSnapshot] = useState(() =>
    loadWorkspaceEmbeddedAppSnapshot(null, null),
  );

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    const snapshot = loadWorkspaceReaderSnapshot(activeCompanyId);
    setReaderSnapshot(snapshot);
    setSelectedAppId(snapshot.lastSelectedAppId);
    setSelectedKnowledgeId(snapshot.lastSelectedKnowledgeId);
    setSelectedFileKey(snapshot.lastSelectedFileKey);
  }, [activeCompanyId]);

  const selectedApp =
    (selectedAppId ? workspaceApps.find((app) => app.id === selectedAppId) : null) ?? workspaceApps[0];
  const selectedAppTemplate = selectedApp ? resolveWorkspaceAppTemplate(selectedApp) : null;
  const selectedAppSurface = selectedApp ? resolveWorkspaceAppSurface(selectedApp) : null;
  const selectedAppManifest = selectedApp ? workspaceAppManifestsById[selectedApp.id] ?? null : null;
  const selectedAppResolvedFiles = useMemo(
    () =>
      selectedApp && selectedAppManifest
        ? applyWorkspaceAppManifest(workspaceFiles, selectedAppManifest)
        : workspaceFiles,
    [selectedApp, selectedAppManifest, workspaceFiles],
  );
  const selectedAppUsesEmbeddedHost =
    selectedAppSurface === "embedded" || selectedAppTemplate === "review-console" || selectedAppTemplate === "dashboard";
  const publishedAppTemplates = workspaceAppsAreExplicit
    ? workspaceApps.map((app) => resolveWorkspaceAppTemplate(app))
    : [];
  const selectedKnowledgeItem =
    (selectedKnowledgeId ? knowledgeItems.find((item) => item.id === selectedKnowledgeId) : null) ??
    knowledgeItems[0] ??
    null;
  const selectedKnowledgeSourceFiles = getKnowledgeSourceFilesForItem(
    selectedKnowledgeItem,
    knowledgeFiles,
  );
  const selectedEmbeddedRuntime = useMemo(
    () =>
      selectedAppUsesEmbeddedHost && selectedApp
        ? resolveWorkspaceEmbeddedAppRuntime({
            app: selectedApp,
            manifest: selectedAppManifest,
            files: selectedAppResolvedFiles,
            snapshot: embeddedAppSnapshot,
          })
        : null,
    [embeddedAppSnapshot, selectedApp, selectedAppManifest, selectedAppResolvedFiles, selectedAppUsesEmbeddedHost],
  );
  const selectedEmbeddedSections = selectedEmbeddedRuntime?.sections ?? [];
  const selectedEmbeddedSectionFiles = useMemo(
    () => new Map(selectedEmbeddedSections.map((section) => [section.slot, section.files])),
    [selectedEmbeddedSections],
  );
  const selectedEmbeddedSectionSlot = selectedEmbeddedRuntime?.activeSectionSlot ?? null;
  const selectedEmbeddedAllFiles = selectedEmbeddedRuntime?.allFiles ?? [];
  const selectedFile =
    (selectedFileKey
      ? (selectedAppUsesEmbeddedHost ? selectedEmbeddedAllFiles : workspaceFiles).find(
          (file) => file.key === selectedFileKey,
        )
      : null) ??
    (selectedAppUsesEmbeddedHost
      ? selectedEmbeddedRuntime?.selectedFile ?? null
      :
    pickDefaultWorkspaceFile(
      selectedAppTemplate === "knowledge" ? selectedKnowledgeSourceFiles : workspaceFiles,
      selectedAppTemplate === "knowledge"
        ? ["knowledge", "chapter", "canon", "review"]
        : ["chapter", "canon", "review", "knowledge"],
    ));
  const { loadingFileKey, selectedFileContent } = useWorkspaceFileContent({
    activeCompanyId,
    activeWorkspaceWorkItemId: activeWorkspaceWorkItem?.id ?? null,
    selectedFile,
    shouldSyncProviderWorkspace,
  });
  const readerIndex = useMemo(
    () =>
      buildWorkspaceReaderIndex({
        files: [...chapterFiles, ...canonFiles, ...reviewFiles],
        snapshot: readerSnapshot,
      }),
    [canonFiles, chapterFiles, readerSnapshot, reviewFiles],
  );
  const skillDefinitions = activeCompany?.skillDefinitions ?? [];
  const skillRuns = activeCompany?.skillRuns ?? [];
  const capabilityRequests = activeCompany?.capabilityRequests ?? [];
  const capabilityIssues = activeCompany?.capabilityIssues ?? [];
  const capabilityAuditEvents = activeCompany?.capabilityAuditEvents ?? [];
  const executorProvisioning = activeCompany?.system?.executorProvisioning ?? null;
  const registerableAppManifestCandidates = useMemo(() => {
    const boundManifestIds = new Set(
      workspaceApps.map((app) => app.manifestArtifactId).filter((value): value is string => Boolean(value)),
    );
    return workspaceFiles
      .filter((file) => file.artifactId && file.tags.includes("tech.app-manifest"))
      .filter((file) => !boundManifestIds.has(file.artifactId!))
      .map((file) => {
        const meta = readWorkspaceAppManifestRegistrationMeta(file.content ?? file.previewText ?? "");
        if (!meta?.appSlug && !meta?.title) {
          return null;
        }
        return {
          artifactId: file.artifactId!,
          fileName: file.name,
          title: meta.title ?? file.name.replace(/^workspace-app-manifest\./, "").replace(/\.json$/i, ""),
          slug:
            meta.appSlug
            ?? file.name
              .replace(/^workspace-app-manifest\./, "")
              .replace(/\.json$/i, "")
              .trim()
              .toLowerCase(),
          appId: meta.appId,
          sourceLabel: meta.sourceLabel ?? null,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  }, [workspaceApps, workspaceFiles]);
  const primaryRegisterableAppManifest = registerableAppManifestCandidates[0] ?? null;
  const workflowCapabilityBindingCatalog = useMemo(
    () => getCompanyWorkflowCapabilityBindings(activeCompany),
    [activeCompany],
  );
  const workflowCapabilityBindingsAreExplicit = hasStoredWorkflowCapabilityBindings(activeCompany);
  const businessLead = activeCompany
    ? findBusinessLead(activeCompany, activeWorkspaceWorkItem?.ownerActorId ?? null)
    : null;
  const workflowCapabilityBindings = useMemo<ResolvedWorkflowCapabilityBinding[]>(
    () =>
      resolveWorkflowCapabilityBindings({
        bindings: workflowCapabilityBindingCatalog,
        workItem: activeWorkspaceWorkItem,
        apps: workspaceApps,
        skills: skillDefinitions,
      }),
    [activeWorkspaceWorkItem, skillDefinitions, workflowCapabilityBindingCatalog, workspaceApps],
  );
  const closeoutSummary = useMemo(
    () =>
      buildCapabilityPlatformCloseoutSummary({
        workspaceApps,
        workspaceFiles,
        skillDefinitions,
        skillRuns,
        capabilityRequests,
        capabilityIssues,
        capabilityAuditEvents,
        executorProvisioning,
      }),
    [
      capabilityAuditEvents,
      capabilityIssues,
      capabilityRequests,
      executorProvisioning,
      skillDefinitions,
      skillRuns,
      workspaceApps,
      workspaceFiles,
    ],
  );
  const closeoutUpdatedAt = useMemo(
    () =>
      Math.max(
        activeCompany?.createdAt ?? 0,
        executorProvisioning?.updatedAt ?? 0,
        ...workspaceFiles.map((file) => file.updatedAtMs ?? 0),
        ...skillDefinitions.map((skill) => skill.updatedAt),
        ...skillRuns.map((run) => run.updatedAt),
        ...capabilityRequests.map((request) => request.updatedAt),
        ...capabilityIssues.map((issue) => issue.updatedAt),
        ...capabilityAuditEvents.map((event) => event.updatedAt),
      ),
    [
      activeCompany?.createdAt,
      capabilityAuditEvents,
      capabilityIssues,
      capabilityRequests,
      executorProvisioning?.updatedAt,
      skillDefinitions,
      skillRuns,
      workspaceFiles,
    ],
  );
  const closeoutSnapshot = useMemo(
    () =>
      activeCompany
        ? buildCapabilityPlatformCloseoutSnapshot({
            summary: closeoutSummary,
            updatedAt: closeoutUpdatedAt,
          })
        : null,
    [activeCompany, closeoutSummary, closeoutUpdatedAt],
  );

  useEffect(() => {
    if (!activeCompanyId || !selectedApp?.id || !selectedAppUsesEmbeddedHost) {
      setEmbeddedAppSnapshot(loadWorkspaceEmbeddedAppSnapshot(null, null));
      return;
    }
    setEmbeddedAppSnapshot(loadWorkspaceEmbeddedAppSnapshot(activeCompanyId, selectedApp.id));
  }, [activeCompanyId, selectedApp?.id, selectedAppUsesEmbeddedHost]);

  useEffect(() => {
    if (!activeCompanyId || !selectedApp?.id || !selectedAppUsesEmbeddedHost) {
      return;
    }
    saveWorkspaceEmbeddedAppSnapshot(activeCompanyId, selectedApp.id, embeddedAppSnapshot);
  }, [activeCompanyId, embeddedAppSnapshot, selectedApp?.id, selectedAppUsesEmbeddedHost]);

  useEffect(() => {
    if (!selectedAppUsesEmbeddedHost || !selectedEmbeddedRuntime) {
      return;
    }
    if (!isWorkspaceEmbeddedAppSnapshotEqual(embeddedAppSnapshot, selectedEmbeddedRuntime.snapshot)) {
      setEmbeddedAppSnapshot(selectedEmbeddedRuntime.snapshot);
    }
    if (selectedFileKey !== selectedEmbeddedRuntime.selectedFileKey) {
      setSelectedFileKey(selectedEmbeddedRuntime.selectedFileKey);
    }
  }, [embeddedAppSnapshot, selectedAppUsesEmbeddedHost, selectedEmbeddedRuntime, selectedFileKey]);

  useEffect(() => {
    if (!activeCompany) {
      return;
    }
    if (!closeoutSnapshot) {
      return;
    }
    if (isCapabilityPlatformCloseoutSnapshotEqual(activeCompany.system?.platformCloseout ?? null, closeoutSnapshot)) {
      return;
    }
    void updateCompany({
      system: {
        ...(activeCompany.system ?? {}),
        platformCloseout: closeoutSnapshot,
      },
    });
  }, [activeCompany, closeoutSnapshot, updateCompany]);

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  if (workspaceApps.length === 0) {
    return (
      <div className="p-8">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>当前公司还没有专属工作目录</CardTitle>
            <CardDescription>
              这家公司暂时没有启用公司级 workspace 应用。后续可以按公司类型继续扩展。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const openCtoWorkbench = (tool: WorkspaceWorkbenchTool) => {
    if (!ctoEmployee) {
      toast.error("当前公司没有 CTO 节点", "至少需要一个 CTO 节点来承接公司级工具需求。");
      return;
    }

    const request = buildWorkspaceWorkbenchRequest(activeCompany, tool);
    prefillSequenceRef.current += 1;
    navigate(`/chat/${encodeURIComponent(ctoEmployee.agentId)}`, {
      state: {
        prefillText: request.prompt,
        prefillId: `${tool}:${prefillSequenceRef.current}`,
      },
    });
  };

  const writeWorkspaceApps = async (nextApps: CompanyWorkspaceApp[]) => {
    await updateCompany({ workspaceApps: nextApps });
  };

  const writeWorkflowCapabilityBindings = async (nextBindings: WorkflowCapabilityBinding[]) => {
    await updateCompany({ workflowCapabilityBindings: nextBindings });
  };

  const publishRecommendedApps = async () => {
    const recommendedApps = buildRecommendedWorkspaceApps(activeCompany);
    if (recommendedApps.length === 0) {
      toast.error("当前公司没有可固化的推荐应用", "先让 CTO 或业务团队明确这家公司真正需要哪些入口。");
      return;
    }

    await writeWorkspaceApps(recommendedApps);
    toast.success("已固化公司应用", "当前公司的工作目录入口已经从系统补位变成显式挂载。");
  };

  const publishWorkflowCapabilityBindings = async () => {
    if (workflowCapabilityBindingCatalog.length === 0) {
      toast.error("当前没有可固化的流程绑定", "先让这家公司命中默认流程绑定，或后续再补自定义规则。");
      return;
    }
    await writeWorkflowCapabilityBindings(workflowCapabilityBindingCatalog);
    toast.success("已固化流程绑定", "当前公司的阶段能力绑定已经从默认推荐变成显式组织配置。");
  };

  const restoreWorkflowCapabilityBindings = async () => {
    await writeWorkflowCapabilityBindings([]);
    toast.success("已恢复默认流程绑定", "当前公司会重新回到系统默认推荐的能力绑定。");
  };

  const toggleWorkflowCapabilityBindingRequired = async (bindingId: string) => {
    const target = workflowCapabilityBindingCatalog.find((binding) => binding.id === bindingId) ?? null;
    if (!target) {
      return;
    }
    const nextBindings = workflowCapabilityBindingCatalog.map((binding) =>
      binding.id === bindingId ? { ...binding, required: !binding.required } : binding,
    );
    await writeWorkflowCapabilityBindings(nextBindings);
    toast.success(
      target.required ? "已改成建议能力" : "已改成必用能力",
      `${target.label} 现在已经写入这家公司的显式流程绑定配置。`,
    );
  };

  const publishTemplateApp = async (
    template: "reader" | "consistency" | "review-console" | "dashboard",
  ) => {
    const nextApps = publishWorkspaceApp(activeCompany, {
      template,
      title:
        template === "reader"
          ? "内容查看器"
          : template === "consistency"
            ? "规则与校验"
            : template === "dashboard"
              ? "工作目录仪表盘"
              : undefined,
      description:
        template === "reader"
          ? "围绕当前公司的主体内容、参考资料、报告和版本切换提供统一查看入口。"
          : template === "consistency"
            ? "围绕关键参考资料、规则和状态流转管理当前公司的真相源与校验入口。"
          : template === "review-console"
            ? "把对象状态、验收结论和交付前检查结果收进同一个控制台。"
            : template === "dashboard"
              ? "把状态数据、异常样本和关键结果聚合成受控仪表盘。"
            : undefined,
      surface: template === "review-console" || template === "dashboard" ? "embedded" : undefined,
      embeddedHostKey:
        template === "review-console"
          ? "review-console"
          : template === "dashboard"
            ? "dashboard"
            : undefined,
      embeddedPermissions:
        template === "review-console" || template === "dashboard"
          ? {
              resources: "manifest-scoped",
              appState: "readwrite",
              companyWrites: "none",
              actions: "whitelisted",
            }
          : undefined,
      ownerAgentId: ctoEmployee?.agentId,
    });
    const nextApp = nextApps.find((app) => resolveWorkspaceAppTemplate(app) === template) ?? null;
    await writeWorkspaceApps(nextApps);
    if (nextApp) {
      setSelectedAppId(nextApp.id);
    }
    toast.success(
      template === "reader"
        ? "已发布内容查看 App"
        : template === "consistency"
            ? "已发布规则与校验 App"
            : template === "dashboard"
              ? "已发布工作目录仪表盘"
              : "已发布审阅与预检 App",
      "当前模板 App 已经正式挂到这家公司里，后续可以继续沿着这个入口迭代。",
    );
  };

  const registerExistingAppFromManifest = async (artifactId?: string) => {
    const candidate =
      (artifactId
        ? registerableAppManifestCandidates.find((item) => item.artifactId === artifactId) ?? null
        : primaryRegisterableAppManifest)
      ?? null;
    if (!candidate) {
      toast.error("当前没有可注册的 AppManifest", "先让 CTO 产出显式 manifest，再把它注册成正式公司应用。");
      return;
    }
    const nextApps = registerWorkspaceApp(activeCompany, {
      id: candidate.appId ?? `app:${candidate.slug}`,
      slug: candidate.slug,
      title: candidate.title,
      description: `由 ${candidate.fileName} 注册的公司内 App，后续继续通过 manifest 和受控宿主迭代。`,
      summary: candidate.sourceLabel
        ? `${candidate.sourceLabel} 提供的显式 App 契约。`
        : "由显式 AppManifest 注册的公司内 App。",
      status: "ready",
      ownerAgentId: ctoEmployee?.agentId,
      visibility: "company",
      shareScope: "company",
      surface: "embedded",
      template: "generic-app",
      manifestArtifactId: candidate.artifactId,
      embeddedHostKey: "generic-app",
      implementation: {
        kind: "embedded",
        preset: null,
        entry: null,
      },
      runtime: {
        kind: "controlled-host",
        permissions: {
          resources: "manifest-scoped",
          appState: "readwrite",
          companyWrites: "none",
          actions: "whitelisted",
        },
      },
      embeddedPermissions: {
        resources: "manifest-scoped",
        appState: "readwrite",
        companyWrites: "none",
        actions: "whitelisted",
      },
    });
    await writeWorkspaceApps(nextApps);
    const nextApp = nextApps.find((app) => app.manifestArtifactId === candidate.artifactId) ?? null;
    if (nextApp) {
      setSelectedAppId(nextApp.id);
    }
    toast.success("已注册公司内 App", `${candidate.title} 已通过显式 manifest 挂载到当前公司。`);
  };

  const generateAppManifestDraft = async (targetApp: CompanyWorkspaceApp = selectedApp) => {
    const draft = buildWorkspaceAppManifestDraft({
      app: targetApp,
      files: workspaceFiles,
      title: `${activeCompany.name} · ${targetApp.title} AppManifest 草案`,
      sourceLabel: "系统草案",
    });

    if (!draft) {
      toast.error(
        "当前还无法生成 AppManifest 草案",
        "工作目录里还没有足够明确的资源候选文件，先让团队把可读产物或报告固化下来。",
      );
      return;
    }

    const now = Date.now();
    const manifestArtifactId = getAppManifestArtifactId(activeCompany.id, targetApp.id);
    const fileName = getAppManifestFileName(targetApp);
    upsertArtifactRecord({
      id: manifestArtifactId,
      workItemId: activeWorkspaceWorkItem?.id ?? null,
      title: fileName,
      kind: "app_manifest",
      status: "draft",
      ownerActorId: ctoEmployee?.agentId ?? null,
      sourceActorId: ctoEmployee?.agentId ?? null,
      sourceName: fileName,
      sourcePath: fileName,
      summary: `系统根据当前工作目录自动生成的 ${targetApp.title} AppManifest 草案，待 CTO 校准资源分区和动作。`,
      content: JSON.stringify(draft, null, 2),
      resourceType: "other",
      resourceTags: ["tech.app-manifest", `app.${targetApp.slug}`],
      createdAt: now,
      updatedAt: now,
    });

    const nextApps = workspaceApps.map((app) =>
      app.id === targetApp.id ? { ...app, manifestArtifactId } : app,
    );
    await writeWorkspaceApps(nextApps);
    toast.success(
      "已生成 AppManifest 草案",
      `${targetApp.title} 已经接入一份显式 manifest，后续 CTO 可以继续校准资源分区和动作。`,
    );
  };

  const generateAppManifestDraftById = async (appId?: string) => {
    const targetApp = appId ? workspaceApps.find((app) => app.id === appId) ?? selectedApp : selectedApp;
    await generateAppManifestDraft(targetApp);
  };

  const upsertSkillDraft = async (tool: WorkspaceWorkbenchTool) => {
    if (!ctoEmployee) {
      toast.error("当前公司没有 CTO 节点", "至少需要一个 CTO 节点来承接能力草稿。");
      return;
    }
    const seed = WORKBENCH_SKILL_SEEDS[tool];
    const existing = skillDefinitions.find((skill) => skill.id === seed.id) ?? null;
    const app = workspaceApps.find((candidate) => resolveWorkspaceAppTemplate(candidate) === seed.appTemplate) ?? null;
    const now = Date.now();
    await upsertSkillDefinition({
      id: seed.id,
      title: seed.title,
      summary: seed.summary,
      ownerAgentId: ctoEmployee.agentId,
      status: existing?.status ?? "draft",
      entryPath: seed.entryPath,
      inputSchema: { companyId: activeCompany.id, appId: app?.id ?? null },
      outputSchema: { writesResourceTypes: seed.writesResourceTypes },
      writesResourceTypes: seed.writesResourceTypes,
      allowedTriggers: ["app_action"],
      smokeTest: seed.smokeTest,
      manifestActionIds: seed.manifestActionIds,
      appIds: app ? [app.id] : undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    await upsertCapabilityAuditEvent({
      id: `capability-audit:${activeCompany.id}:skill:${seed.id}:created:${now}`,
      kind: "skill",
      entityId: seed.id,
      action: "created",
      summary: `${seed.title} 已登记为能力草稿`,
      detail: `${seed.title} 已进入 CTO 技术中台 backlog，等待继续验证和发布。`,
      actorId: ctoEmployee.agentId,
      actorLabel: ctoEmployee.nickname ?? ctoEmployee.agentId,
      appId: app?.id ?? null,
      skillId: seed.id,
      createdAt: now,
      updatedAt: now,
    });
    toast.success("已登记能力草稿", `${seed.title} 已进入 CTO 技术中台 backlog。`);
  };

  const createCapabilityRequestDraft = async (
    tool: WorkspaceWorkbenchTool,
    context?: {
      actionId?: string | null;
      sectionLabel?: string | null;
      fileKey?: string | null;
      fileName?: string | null;
      runId?: string | null;
    },
  ) => {
    const seed = WORKBENCH_SKILL_SEEDS[tool];
    const relatedApp =
      workspaceApps.find((app) => resolveWorkspaceAppTemplate(app) === seed.appTemplate) ?? selectedApp ?? null;
    const summaryPrefix = relatedApp?.title ?? activeCompany.name;
    const now = Date.now();
    await upsertCapabilityRequest({
      id: `capability-request:${activeCompany.id}:${seed.id}:${now}`,
      type: seed.requestType,
      summary: `${summaryPrefix} 需要补齐 ${seed.title}`,
      detail: `${activeCompany.name} 当前希望补齐 ${seed.title}，优先服务 ${relatedApp?.title ?? selectedApp?.title ?? "工作目录"} 的实际使用场景。`,
      requesterActorId: businessLead?.agentId ?? activeWorkspaceWorkItem?.ownerActorId ?? null,
      requesterLabel:
        businessLead?.nickname ??
        activeWorkspaceWorkItem?.displayOwnerLabel ??
        activeWorkspaceWorkItem?.ownerLabel ??
        null,
      requesterDepartmentId: businessLead?.departmentId ?? activeWorkspaceWorkItem?.owningDepartmentId ?? null,
      ownerActorId: ctoEmployee?.agentId ?? null,
      appId: relatedApp?.id ?? null,
      skillId: seed.id,
      contextActionId: context?.actionId ?? null,
      contextAppSection: context?.sectionLabel ?? null,
      contextFileKey: context?.fileKey ?? null,
      contextFileName: context?.fileName ?? null,
      contextRunId: context?.runId ?? null,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    await upsertCapabilityAuditEvent({
      id: `capability-audit:${activeCompany.id}:request:${seed.id}:created:${now}`,
      kind: "request",
      entityId: `capability-request:${activeCompany.id}:${seed.id}:${now}`,
      action: "created",
      summary: `${summaryPrefix} 已登记补齐 ${seed.title} 的能力需求`,
      detail: `${businessLead?.nickname ?? activeWorkspaceWorkItem?.displayOwnerLabel ?? "业务负责人"} 已把这条需求正式交给 CTO 技术中台。`,
      actorId: businessLead?.agentId ?? activeWorkspaceWorkItem?.ownerActorId ?? null,
      actorLabel:
        businessLead?.nickname ??
        activeWorkspaceWorkItem?.displayOwnerLabel ??
        activeWorkspaceWorkItem?.ownerLabel ??
        "业务负责人",
      appId: relatedApp?.id ?? null,
      skillId: seed.id,
      requestId: `capability-request:${activeCompany.id}:${seed.id}:${now}`,
      createdAt: now,
      updatedAt: now,
    });
    toast.success("已登记能力需求", "这条需求已经进入 CTO 技术中台 backlog。");
  };

  const createCapabilityIssueDraft = async (input?: {
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
  }) => {
    const now = Date.now();
    await upsertCapabilityIssue({
      id: `capability-issue:${activeCompany.id}:${input?.skillId ?? input?.appId ?? "workspace"}:${now}`,
      type: input?.type ?? "unavailable",
      summary:
        input?.summary ??
        `${selectedApp?.title ?? "当前公司应用"} 出现问题，需要 CTO 跟进`,
      detail:
        input?.detail ??
        `问题从 ${selectedApp?.title ?? "工作目录"} 反馈，建议 CTO 先复现并给出回访验证结论。`,
      reporterActorId: businessLead?.agentId ?? activeWorkspaceWorkItem?.ownerActorId ?? null,
      reporterLabel:
        businessLead?.nickname ??
        activeWorkspaceWorkItem?.displayOwnerLabel ??
        activeWorkspaceWorkItem?.ownerLabel ??
        null,
      reporterDepartmentId: businessLead?.departmentId ?? activeWorkspaceWorkItem?.owningDepartmentId ?? null,
      ownerActorId: ctoEmployee?.agentId ?? null,
      appId: input?.appId ?? selectedApp?.id ?? null,
      skillId: input?.skillId ?? null,
      contextActionId: input?.contextActionId ?? null,
      contextAppSection: input?.contextAppSection ?? null,
      contextFileKey: input?.contextFileKey ?? null,
      contextFileName: input?.contextFileName ?? null,
      contextRunId: input?.contextRunId ?? null,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    await upsertCapabilityAuditEvent({
      id: `capability-audit:${activeCompany.id}:issue:${input?.skillId ?? input?.appId ?? "workspace"}:created:${now}`,
      kind: "issue",
      entityId: `capability-issue:${activeCompany.id}:${input?.skillId ?? input?.appId ?? "workspace"}:${now}`,
      action: "created",
      summary:
        input?.summary ??
        `${selectedApp?.title ?? "当前公司应用"} 已登记能力问题`,
      detail:
        input?.detail ??
        `${businessLead?.nickname ?? activeWorkspaceWorkItem?.displayOwnerLabel ?? "业务负责人"} 已把问题正式提交给 CTO 技术中台。`,
      actorId: businessLead?.agentId ?? activeWorkspaceWorkItem?.ownerActorId ?? null,
      actorLabel:
        businessLead?.nickname ??
        activeWorkspaceWorkItem?.displayOwnerLabel ??
        activeWorkspaceWorkItem?.ownerLabel ??
        "业务负责人",
      appId: input?.appId ?? selectedApp?.id ?? null,
      skillId: input?.skillId ?? null,
      issueId: `capability-issue:${activeCompany.id}:${input?.skillId ?? input?.appId ?? "workspace"}:${now}`,
      createdAt: now,
      updatedAt: now,
    });
    toast.success("已登记能力问题", "问题已经交给 CTO 技术中台继续跟进。");
  };

  const updateSkillStatus = async (skillId: string, status: SkillDefinitionStatus) => {
    const skill = skillDefinitions.find((item) => item.id === skillId) ?? null;
    if (!skill) {
      return;
    }
    if (status === "ready") {
      const readiness = buildSkillReleaseReadiness({
        skill,
        skillRuns,
        workspaceApps,
      });
      if (!readiness.publishable) {
        const missingLabels = readiness.checks.filter((check) => !check.ok).map((check) => check.label);
        toast.error(
          "还不能发布为可用",
          `先补齐：${missingLabels.join("、")}。至少要有一次成功能力验证才能正式发布。`,
        );
        return;
      }
    }
    await upsertSkillDefinition({
      ...skill,
      status,
      updatedAt: Date.now(),
    });
    const now = Date.now();
    await upsertCapabilityAuditEvent({
      id: `capability-audit:${activeCompany.id}:skill:${skill.id}:status:${now}`,
      kind: "skill",
      entityId: skill.id,
      action: "status_changed",
      summary: `${skill.title} 已切换为${status === "ready" ? "可用" : status === "degraded" ? "降级" : status === "draft" ? "草稿" : "停用"}`,
      detail: `${skill.title} 的平台状态已更新，后续运行与依赖关系会按新状态生效。`,
      actorId: ctoEmployee?.agentId ?? null,
      actorLabel: ctoEmployee?.nickname ?? ctoEmployee?.agentId ?? "CTO",
      appId: skill.appIds?.[0] ?? null,
      skillId: skill.id,
      createdAt: now,
      updatedAt: now,
    });
    if (status === "ready") {
      toast.success("能力已发布为可用", `${skill.title} 现在可以被 App 和流程节点正式依赖。`);
    }
  };

  const runSkillSmokeTest = async (skillId: string) => {
    const skill = skillDefinitions.find((item) => item.id === skillId) ?? null;
    if (!skill) {
      return;
    }
    const triggerApp =
      (skill.appIds ?? [])
        .map((appId) => workspaceApps.find((item) => item.id === appId) ?? null)
        .find((item): item is CompanyWorkspaceApp => Boolean(item))
      ?? selectedApp
      ?? null;
    if ((skill.appIds?.length ?? 0) > 0 && !triggerApp) {
      toast.error("当前还不能跑能力验证", "这条能力依赖关联 App，但当前公司里还没有对应入口。");
      return;
    }
    const now = Date.now();
    let workspaceScriptFallbackMessage: string | null = null;
    const result = await runWorkspaceSkill(
      {
        company: activeCompany,
        skillId,
        skill,
        app: triggerApp,
        manifest: triggerApp ? workspaceAppManifestsById[triggerApp.id] ?? null : null,
        files: workspaceFiles,
        workItemId: activeWorkspaceWorkItem?.id ?? null,
        requestedByActorId: ctoEmployee?.agentId ?? null,
        requestedByLabel: ctoEmployee?.nickname ?? ctoEmployee?.agentId ?? "CTO",
        ownerLabel: ctoEmployee?.nickname ?? ctoEmployee?.agentId ?? "CTO",
        triggerType: "manual",
        triggerActionId: `smoke-test:${skill.id}`,
        triggerLabel: "CTO 工具工坊能力验证",
        now,
      },
      {
        upsertArtifactRecord,
        upsertSkillRun,
        writeWorkspaceApps,
        reportIssue: createCapabilityIssueDraft,
        executeWorkspaceScript: async ({
          company,
          skill,
          app,
          executionInput,
          workItemId,
          now,
        }): Promise<WorkspaceScriptExecutionAttempt | null> => {
          try {
            const response = await gateway.request<AuthorityAgentFileRunResponse>("authority.agent.file.run", {
              agentId: skill.ownerAgentId,
              entryPath: skill.entryPath,
              payload: executionInput,
              timeoutMs: 20_000,
            });
            if (response.status !== "executed") {
              workspaceScriptFallbackMessage =
                response.message?.trim()
                || (response.status === "missing"
                  ? `工作区中未找到 ${skill.entryPath}`
                  : `当前环境暂不支持直接执行 ${skill.entryPath}`);
              return {
                status: "fallback",
                note: workspaceScriptFallbackMessage,
              } satisfies WorkspaceScriptExecutionAttempt;
            }
            if ((response.exitCode ?? 0) !== 0) {
              throw new Error(response.stderr?.trim() || `workspace script 以退出码 ${response.exitCode} 结束。`);
            }
            const executionFromScript = resolveWorkspaceSkillExecutionFromScriptRun({
              company,
              skill,
              app,
              response,
              workItemId,
              now,
            });
            if (!executionFromScript) {
              workspaceScriptFallbackMessage = "工作区脚本输出暂时无法解析，已自动回退到平台桥接。";
              return {
                status: "fallback",
                note: workspaceScriptFallbackMessage,
              } satisfies WorkspaceScriptExecutionAttempt;
            }
            return {
              status: "executed",
              result: executionFromScript,
            } satisfies WorkspaceScriptExecutionAttempt;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (
              message.includes("authority.agent.file.run")
              || message.includes("requires agentId and entryPath")
              || message.includes("Unknown method")
              || message.includes("404")
            ) {
              workspaceScriptFallbackMessage = "当前 authority 还没有开启工作区脚本执行，已自动回退到平台桥接。";
              return {
                status: "fallback",
                note: workspaceScriptFallbackMessage,
              } satisfies WorkspaceScriptExecutionAttempt;
            }
            throw error;
          }
        },
      },
    );

    if (result.status === "succeeded") {
      await upsertCapabilityAuditEvent({
        id: `capability-audit:${activeCompany.id}:run:${result.runId}:smoke-success:${now}`,
        kind: "run",
        entityId: result.runId,
        action: "smoke_test_succeeded",
        summary: `${skill.title} 能力验证已通过`,
        detail: result.detail,
        actorId: ctoEmployee?.agentId ?? null,
        actorLabel: ctoEmployee?.nickname ?? ctoEmployee?.agentId ?? "CTO",
        appId: triggerApp?.id ?? null,
        skillId: skill.id,
        runId: result.runId,
        createdAt: now,
        updatedAt: now,
      });
      const successDetail =
        result.executionMode === "workspace_script"
          ? `${result.detail} 这次能力验证直接运行了 ${result.executionEntryPath ?? "CTO 工作区脚本"}。`
          : workspaceScriptFallbackMessage
            ? `${result.detail} 当前未直接跑到工作区脚本（${workspaceScriptFallbackMessage}），已自动回退到平台桥接。`
            : result.detail;
      toast.success("能力验证已通过", successDetail);
      return;
    }
    await upsertCapabilityAuditEvent({
      id: `capability-audit:${activeCompany.id}:run:${result.runId}:smoke-fail:${now}`,
      kind: "run",
      entityId: result.runId,
      action: "smoke_test_failed",
      summary: `${skill.title} 能力验证未通过`,
      detail: result.detail,
      actorId: ctoEmployee?.agentId ?? null,
      actorLabel: ctoEmployee?.nickname ?? ctoEmployee?.agentId ?? "CTO",
      appId: triggerApp?.id ?? null,
      skillId: skill.id,
      runId: result.runId,
      createdAt: now,
      updatedAt: now,
    });
    toast.error(result.title, result.detail);
  };

  const updateCapabilityRequestStatus = async (requestId: string, status: CapabilityRequestStatus) => {
    const request = capabilityRequests.find((item) => item.id === requestId) ?? null;
    if (!request) {
      return;
    }
    const now = Date.now();
    await upsertCapabilityRequest({
      ...request,
      status,
      updatedAt: now,
    });
    await upsertCapabilityAuditEvent({
      id: `capability-audit:${activeCompany.id}:request:${request.id}:status:${now}`,
      kind: "request",
      entityId: request.id,
      action: "status_changed",
      summary: `${request.summary} 已进入 ${status}`,
      detail: `${request.summary} 的治理状态已经更新。`,
      actorId: ctoEmployee?.agentId ?? null,
      actorLabel: ctoEmployee?.nickname ?? ctoEmployee?.agentId ?? "CTO",
      appId: request.appId ?? null,
      skillId: request.skillId ?? null,
      requestId: request.id,
      createdAt: now,
      updatedAt: now,
    });
  };

  const updateCapabilityIssueStatus = async (issueId: string, status: CapabilityIssueStatus) => {
    const issue = capabilityIssues.find((item) => item.id === issueId) ?? null;
    if (!issue) {
      return;
    }
    const now = Date.now();
    await upsertCapabilityIssue({
      ...issue,
      status,
      updatedAt: now,
    });
    await upsertCapabilityAuditEvent({
      id: `capability-audit:${activeCompany.id}:issue:${issue.id}:status:${now}`,
      kind: "issue",
      entityId: issue.id,
      action: "status_changed",
      summary: `${issue.summary} 已进入 ${status}`,
      detail: `${issue.summary} 的治理状态已经更新。`,
      actorId: ctoEmployee?.agentId ?? null,
      actorLabel: ctoEmployee?.nickname ?? ctoEmployee?.agentId ?? "CTO",
      appId: issue.appId ?? null,
      skillId: issue.skillId ?? null,
      issueId: issue.id,
      createdAt: now,
      updatedAt: now,
    });
  };

  const retryActiveCompanyProvisioning = async () => {
    if (!activeCompany) {
      return;
    }
    await retryCompanyProvisioning(activeCompany.id);
    toast.success("已触发执行器补齐", "当前公司已重新发起 OpenClaw provisioning，不会阻止你继续使用工作目录。");
  };

  const triggerSkillFromManifest = async (
    skillId: string,
    appId?: string | null,
    triggerActionId?: string | null,
  ) => {
    const triggerApp = (appId ? workspaceApps.find((item) => item.id === appId) : null) ?? selectedApp ?? null;
    const now = Date.now();
    const requestedByActorId = businessLead?.agentId ?? activeWorkspaceWorkItem?.ownerActorId ?? null;
    const requestedByLabel =
      businessLead?.nickname ??
      activeWorkspaceWorkItem?.displayOwnerLabel ??
      activeWorkspaceWorkItem?.ownerLabel ??
      null;
    const skill = skillDefinitions.find((item) => item.id === skillId) ?? null;
    let workspaceScriptFallbackMessage: string | null = null;
    const result = await runWorkspaceSkill(
      {
        company: activeCompany,
        skillId,
        skill,
        app: triggerApp,
        manifest: triggerApp ? workspaceAppManifestsById[triggerApp.id] ?? null : null,
        files: workspaceFiles,
        workItemId: activeWorkspaceWorkItem?.id ?? null,
        requestedByActorId,
        requestedByLabel,
        ownerLabel: ctoEmployee?.nickname ?? ctoEmployee?.agentId ?? "CTO",
        triggerType: "app_action",
        triggerActionId: triggerActionId ?? skillId,
        triggerLabel: triggerApp?.title ?? "工作目录",
        now,
      },
      {
        upsertArtifactRecord,
        upsertSkillRun,
        writeWorkspaceApps,
        reportIssue: createCapabilityIssueDraft,
        executeWorkspaceScript: async ({
          company,
          skill,
          app,
          executionInput,
          workItemId,
          now,
        }): Promise<WorkspaceScriptExecutionAttempt | null> => {
          if (!skill) {
            return null;
          }
          try {
            const response = await gateway.request<AuthorityAgentFileRunResponse>("authority.agent.file.run", {
              agentId: skill.ownerAgentId,
              entryPath: skill.entryPath,
              payload: executionInput,
              timeoutMs: 20_000,
            });

            if (response.status !== "executed") {
              workspaceScriptFallbackMessage =
                response.message?.trim()
                || (response.status === "missing"
                  ? `工作区中未找到 ${skill.entryPath}`
                  : `当前环境暂不支持直接执行 ${skill.entryPath}`);
              return {
                status: "fallback",
                note: workspaceScriptFallbackMessage,
              } satisfies WorkspaceScriptExecutionAttempt;
            }
            if ((response.exitCode ?? 0) !== 0) {
              throw new Error(response.stderr?.trim() || `workspace script 以退出码 ${response.exitCode} 结束。`);
            }
            const executionFromScript = resolveWorkspaceSkillExecutionFromScriptRun({
              company,
              skill,
              app,
              response,
              workItemId,
              now,
            });
            if (!executionFromScript) {
              workspaceScriptFallbackMessage = "工作区脚本输出暂时无法解析，已自动回退到平台桥接。";
              return {
                status: "fallback",
                note: workspaceScriptFallbackMessage,
              } satisfies WorkspaceScriptExecutionAttempt;
            }
            return {
              status: "executed",
              result: executionFromScript,
            } satisfies WorkspaceScriptExecutionAttempt;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (
              message.includes("authority.agent.file.run")
              || message.includes("requires agentId and entryPath")
              || message.includes("Unknown method")
              || message.includes("404")
            ) {
              workspaceScriptFallbackMessage = "当前 authority 还没有开启工作区脚本执行，已自动回退到平台桥接。";
              return {
                status: "fallback",
                note: workspaceScriptFallbackMessage,
              } satisfies WorkspaceScriptExecutionAttempt;
            }
            throw error;
          }
        },
      },
    );

    if (result.status === "succeeded") {
      await upsertCapabilityAuditEvent({
        id: `capability-audit:${activeCompany.id}:run:${result.runId}:run-success:${now}`,
        kind: "run",
        entityId: result.runId,
        action: "run_succeeded",
        summary: `${triggerApp?.title ?? "工作目录"} 已成功触发 ${skill?.title ?? skillId}`,
        detail: result.detail,
        actorId: requestedByActorId,
        actorLabel: requestedByLabel ?? "业务负责人",
        appId: triggerApp?.id ?? null,
        skillId: skill?.id ?? skillId,
        runId: result.runId,
        createdAt: now,
        updatedAt: now,
      });
      const successDetail =
        result.executionMode === "workspace_script"
          ? `${result.detail} 这次直接运行了 ${result.executionEntryPath ?? "CTO 工作区脚本"}。`
          : workspaceScriptFallbackMessage
            ? `${result.detail} 当前未直接跑到工作区脚本（${workspaceScriptFallbackMessage}），已自动回退到平台桥接。`
            : result.detail;
      toast.success(result.title, successDetail);
      return;
    }
    await upsertCapabilityAuditEvent({
      id: `capability-audit:${activeCompany.id}:run:${result.runId}:run-fail:${now}`,
      kind: "run",
      entityId: result.runId,
      action: "run_failed",
      summary: `${triggerApp?.title ?? "工作目录"} 触发 ${skill?.title ?? skillId} 失败`,
      detail: result.detail,
      actorId: requestedByActorId,
      actorLabel: requestedByLabel ?? "业务负责人",
      appId: triggerApp?.id ?? null,
      skillId: skill?.id ?? skillId,
      runId: result.runId,
      createdAt: now,
      updatedAt: now,
    });
    toast.error(result.title, result.detail);
  };

  const runAppManifestAction = async (action: WorkspaceAppManifestAction) => {
    if (!selectedApp) {
      return;
    }
    if (selectedAppUsesEmbeddedHost) {
      setEmbeddedAppSnapshot((current) =>
        withWorkspaceEmbeddedAppSelection(current, {
          lastActionId: action.id,
        }),
      );
    }
    switch (action.actionType) {
      case "refresh_manifest":
        await generateAppManifestDraft(selectedApp);
        return;
      case "open_chat":
        if (action.target === "cto" && ctoEmployee) {
          navigate(`/chat/${encodeURIComponent(ctoEmployee.agentId)}`);
        }
        return;
      case "request_capability":
      case "workbench_request":
        if (isWorkbenchTool(action.target)) {
          const activeSectionLabel =
            selectedAppUsesEmbeddedHost && selectedEmbeddedSectionSlot && selectedAppManifest
              ? selectedAppManifest.sections.find((section) => section.slot === selectedEmbeddedSectionSlot)?.label ?? null
              : null;
          await createCapabilityRequestDraft(action.target, {
            actionId: action.id,
            sectionLabel: activeSectionLabel,
            fileKey: selectedFile?.key ?? null,
            fileName: selectedFile?.name ?? null,
          });
        }
        return;
      case "open_resource": {
        const targetFile =
          workspaceFiles.find((file) => file.artifactId === action.target || file.key === action.target)
          ?? null;
        if (targetFile) {
          setSelectedFileKey(targetFile.key);
        }
        return;
      }
      case "report_issue": {
        const activeSectionLabel =
          selectedAppUsesEmbeddedHost && selectedEmbeddedSectionSlot && selectedAppManifest
            ? selectedAppManifest.sections.find((section) => section.slot === selectedEmbeddedSectionSlot)?.label ?? null
            : null;
        const lastActionLabel =
          selectedAppUsesEmbeddedHost && embeddedAppSnapshot.lastActionId && selectedAppManifest?.actions
            ? selectedAppManifest.actions.find((candidate) => candidate.id === embeddedAppSnapshot.lastActionId)?.label ?? null
            : null;
        const contextLines = [
          `问题来自 ${selectedApp.title}。`,
          activeSectionLabel ? `当前分区：${activeSectionLabel}` : null,
          selectedFile ? `当前资源：${selectedFile.name}` : null,
          lastActionLabel ? `最近动作：${lastActionLabel}` : null,
          typeof action.input?.detail === "string" && action.input.detail.trim().length > 0 ? action.input.detail : null,
        ].filter((item): item is string => Boolean(item));
        const summaryParts = [
          selectedApp.title,
          selectedFile?.name ?? activeSectionLabel,
          action.label.replace(/^反馈/, ""),
        ].filter((item): item is string => Boolean(item && item.trim().length > 0));
        await createCapabilityIssueDraft({
          type: isCapabilityIssueType(action.input?.type) ? action.input.type : "bad_result",
          summary:
            typeof action.input?.summary === "string" && action.input.summary.trim().length > 0
              ? action.input.summary
              : summaryParts.join(" · "),
          detail: contextLines.join(" "),
          appId: selectedApp.id,
          skillId: action.target === "dashboard" ? null : action.target,
          contextActionId: action.id,
          contextAppSection: activeSectionLabel,
          contextFileKey: selectedFile?.key ?? null,
          contextFileName: selectedFile?.name ?? null,
        });
        return;
      }
      case "trigger_capability":
      case "trigger_skill":
        await triggerSkillFromManifest(action.target, selectedApp.id, action.id);
        return;
    }
  };

  useEffect(() => {
    if (!activeCompanyId || !selectedApp) {
      return;
    }
    setReaderSnapshot((current) => {
      const next = withWorkspaceSelection(current, {
        selectedAppId: selectedApp.id,
        selectedKnowledgeId,
      });
      saveWorkspaceReaderSnapshot(activeCompanyId, next);
      return next;
    });
  }, [activeCompanyId, selectedApp, selectedKnowledgeId]);

  useEffect(() => {
    if (!activeCompanyId || !selectedFile?.key) {
      return;
    }
    setReaderSnapshot((current) => {
      const next = recordWorkspaceFileVisit(current, selectedFile.key);
      saveWorkspaceReaderSnapshot(activeCompanyId, next);
      return next;
    });
  }, [activeCompanyId, selectedFile?.key]);

  const selectEmbeddedSection = (slot: string) => {
    const nextFiles = selectedEmbeddedSectionFiles.get(slot) ?? [];
    setEmbeddedAppSnapshot((current) =>
      withWorkspaceEmbeddedAppSelection(current, {
        activeSectionSlot: slot,
        selectedFileKey: nextFiles[0]?.key ?? current.selectedFileKey,
      }),
    );
    if (nextFiles[0]) {
      setSelectedFileKey(nextFiles[0].key);
    }
  };

  const selectEmbeddedFile = (fileKey: string) => {
    setSelectedFileKey(fileKey);
    setEmbeddedAppSnapshot((current) =>
      withWorkspaceEmbeddedAppSelection(current, {
        selectedFileKey: fileKey,
      }),
    );
  };

  return (
    <WorkspacePageContent
      activeCompanyName={activeCompany.name}
      workspaceApps={workspaceApps}
      workspaceAppsAreExplicit={workspaceAppsAreExplicit}
      selectedApp={selectedApp}
      selectedAppManifest={selectedAppManifest}
      selectedFile={selectedFile}
      selectedFileKey={selectedFileKey}
      selectedFileContent={selectedFileContent}
      loadingFileKey={loadingFileKey}
      embeddedRuntime={selectedEmbeddedRuntime}
      activeWorkspaceWorkItem={
        activeWorkspaceWorkItem
          ? {
              id: activeWorkspaceWorkItem.id,
              title: activeWorkspaceWorkItem.title,
              displayOwnerLabel: activeWorkspaceWorkItem.displayOwnerLabel,
              ownerLabel: activeWorkspaceWorkItem.ownerLabel,
              displayStage: activeWorkspaceWorkItem.displayStage,
              stageLabel: activeWorkspaceWorkItem.stageLabel,
              displayNextAction: activeWorkspaceWorkItem.displayNextAction,
              nextAction: activeWorkspaceWorkItem.nextAction,
            }
          : null
      }
      artifactBackedWorkspaceCount={artifactBackedWorkspaceCount}
      mirroredOnlyWorkspaceCount={mirroredOnlyWorkspaceCount}
      shouldSyncProviderWorkspace={shouldSyncProviderWorkspace}
      workspacePolicySummary={workspacePolicySummary}
      chapterFiles={chapterFiles}
      canonFiles={canonFiles}
      reviewFiles={reviewFiles}
      readerIndex={readerIndex}
      readerManifest={readerManifest}
      knowledgeFiles={knowledgeFiles}
      knowledgeItems={knowledgeItems}
      selectedKnowledgeItem={selectedKnowledgeItem}
      selectedKnowledgeSourceFiles={selectedKnowledgeSourceFiles}
      toolingFiles={toolingFiles}
      supplementaryFiles={supplementaryFiles}
      workspaceFiles={workspaceFiles}
      anchors={anchors}
      workflowCapabilityBindingCatalog={workflowCapabilityBindingCatalog}
      workflowCapabilityBindingsAreExplicit={workflowCapabilityBindingsAreExplicit}
      workflowCapabilityBindings={workflowCapabilityBindings}
      skillDefinitions={skillDefinitions}
      skillRuns={skillRuns}
      capabilityRequests={capabilityRequests}
      capabilityIssues={capabilityIssues}
      capabilityAuditEvents={capabilityAuditEvents}
      manifestRegistrationCandidateCount={registerableAppManifestCandidates.length}
      ctoLabel={ctoEmployee ? agentLabelById.get(ctoEmployee.agentId) ?? ctoEmployee.agentId : null}
      businessLeadLabel={businessLead?.nickname ?? activeWorkspaceWorkItem?.displayOwnerLabel ?? null}
      publishedAppTemplates={publishedAppTemplates}
      loadingIndex={loadingIndex}
      executorProvisioning={executorProvisioning}
      onRefreshIndex={refreshIndex}
      onRetryCompanyProvisioning={retryActiveCompanyProvisioning}
      onRunAppManifestAction={runAppManifestAction}
      onSelectApp={(nextAppId) => {
        setSelectedAppId(nextAppId);
        setSelectedFileKey(null);
      }}
      onSelectFile={setSelectedFileKey}
      onSelectEmbeddedSection={selectEmbeddedSection}
      onSelectEmbeddedFile={selectEmbeddedFile}
      onSelectKnowledge={(knowledgeId) => {
        setSelectedKnowledgeId(knowledgeId);
        setSelectedFileKey(null);
      }}
      onOpenCtoWorkbench={openCtoWorkbench}
      onPublishTemplateApp={publishTemplateApp}
      onRegisterExistingApp={registerExistingAppFromManifest}
      onGenerateAppManifestDraft={generateAppManifestDraftById}
      onCreateSkillDraft={upsertSkillDraft}
      onCreateCapabilityRequest={createCapabilityRequestDraft}
      onCreateCapabilityIssue={createCapabilityIssueDraft}
      onUpdateSkillStatus={updateSkillStatus}
      onRunSkillSmokeTest={runSkillSmokeTest}
      onTriggerSkill={triggerSkillFromManifest}
      onPublishWorkflowCapabilityBindings={publishWorkflowCapabilityBindings}
      onRestoreWorkflowCapabilityBindings={restoreWorkflowCapabilityBindings}
      onToggleWorkflowCapabilityBindingRequired={toggleWorkflowCapabilityBindingRequired}
      onUpdateCapabilityRequestStatus={updateCapabilityRequestStatus}
      onUpdateCapabilityIssueStatus={updateCapabilityIssueStatus}
      onPublishRecommendedApps={workspaceAppsAreExplicit ? undefined : publishRecommendedApps}
      onOpenRequirementCenter={
        activeWorkspaceWorkItem
          ? () => navigate("/requirement")
          : undefined
      }
      onOpenFileChat={(nextAgentId) => navigate(`/chat/${encodeURIComponent(nextAgentId)}`)}
      onOpenCtoChat={() => {
        if (ctoEmployee) {
          navigate(`/chat/${encodeURIComponent(ctoEmployee.agentId)}`);
        }
      }}
    />
  );
}
